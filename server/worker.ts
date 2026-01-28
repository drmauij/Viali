import { storage } from './storage';
import { analyzeBulkItemImages } from './openai';
import { sendBulkImportCompleteEmail } from './resend';
import { createGalexisClient, type PriceData, type ProductLookupRequest, type ProductLookupResult } from './services/galexisClient';
import { supplierCodes, itemCodes, items, supplierCatalogs, hospitals, patientQuestionnaireLinks, units, users, priceSyncJobs } from '@shared/schema';
import { eq, and, isNull, isNotNull, sql, or, inArray } from 'drizzle-orm';
import { db } from './storage';
import { decryptCredential } from './utils/encryption';
import { randomUUID } from 'crypto';
import { sendSms, isSmsConfigured } from './sms';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const STUCK_JOB_CHECK_INTERVAL_MS = 60000; // Check for stuck jobs every minute
const STUCK_JOB_THRESHOLD_MINUTES = 30; // Jobs stuck for >30 minutes
const SCHEDULED_JOB_CHECK_INTERVAL_MS = 60000; // Check for scheduled jobs every minute
const AUTO_QUESTIONNAIRE_DAYS_AHEAD = 14; // Send questionnaires 2 weeks before surgery
const PRE_SURGERY_REMINDER_HOURS_AHEAD = 24; // Send fasting reminders 24 hours before surgery
const HIN_SYNC_CHECK_INTERVAL_MS = 3600000; // Check HIN sync status every hour
const HIN_SYNC_MAX_AGE_HOURS = 24; // Re-sync HIN database if older than 24 hours
const PRICE_SYNC_CHECK_INTERVAL_MS = 3600000; // Check price sync status every hour
const PRICE_SYNC_MAX_AGE_HOURS = 24; // Auto-sync prices if last sync > 24 hours ago

interface InfoFlyerData {
  unitName: string;
  unitType: string | null;
  flyerUrl: string;
  downloadUrl?: string;
}

/**
 * Get relevant info flyers for a surgery:
 * 1. The surgery room's unit flyer (if exists)
 * 2. The anesthesia module's flyer (if exists and different)
 */
async function getRelevantInfoFlyers(
  hospitalId: string,
  surgeryRoomId: string | null
): Promise<InfoFlyerData[]> {
  const flyers: InfoFlyerData[] = [];
  
  // Get surgery room's unit flyer
  if (surgeryRoomId) {
    const room = await storage.getSurgeryRoomById(surgeryRoomId);
    if (room && room.unitId) {
      const unit = await storage.getUnit(room.unitId);
      if (unit && unit.infoFlyerUrl) {
        flyers.push({
          unitName: unit.name,
          unitType: unit.type,
          flyerUrl: unit.infoFlyerUrl,
        });
      }
    }
  }
  
  // Get anesthesia module's flyer (if different)
  const hospitalUnits = await storage.getUnits(hospitalId);
  const anesthesiaUnit = hospitalUnits.find(u => u.type === 'anesthesia' && u.infoFlyerUrl);
  if (anesthesiaUnit && !flyers.some(f => f.flyerUrl === anesthesiaUnit.infoFlyerUrl)) {
    flyers.push({
      unitName: anesthesiaUnit.name,
      unitType: anesthesiaUnit.type,
      flyerUrl: anesthesiaUnit.infoFlyerUrl!,
    });
  }
  
  return flyers;
}

/**
 * Generate download URLs for info flyers using object storage
 */
async function generateFlyerDownloadUrls(flyers: InfoFlyerData[]): Promise<InfoFlyerData[]> {
  if (flyers.length === 0) return [];
  
  const { ObjectStorageService } = await import('./objectStorage');
  const objectStorageService = new ObjectStorageService();
  
  return Promise.all(
    flyers.map(async (flyer) => {
      try {
        if (objectStorageService.isConfigured() && flyer.flyerUrl.startsWith('/objects/')) {
          const downloadUrl = await objectStorageService.getObjectDownloadURL(flyer.flyerUrl, 86400); // 24 hour expiry
          return { ...flyer, downloadUrl };
        }
        return { ...flyer, downloadUrl: flyer.flyerUrl };
      } catch (error) {
        console.error(`Error getting download URL for ${flyer.flyerUrl}:`, error);
        return { ...flyer, downloadUrl: flyer.flyerUrl };
      }
    })
  );
}

async function processNextImportJob() {
  try {
    const job = await storage.getNextQueuedJob();
    
    if (!job) {
      return false;
    }

    console.log(`[Worker] Processing import job ${job.id} with ${job.totalImages} images`);

    await storage.updateImportJob(job.id, {
      status: 'processing',
      startedAt: new Date(),
      currentImage: 0,
      progressPercent: 0,
    });

    try {
      const extractedItems = await analyzeBulkItemImages(
        job.imagesData as string[], 
        async (currentImage, totalImages, progressPercent) => {
          await storage.updateImportJob(job.id, {
            currentImage,
            processedImages: currentImage,
            progressPercent,
          });
          console.log(`[Worker] Job ${job.id}: ${currentImage}/${totalImages} (${progressPercent}%)`);
        },
        job.hospitalId
      );

      await storage.updateImportJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        processedImages: job.totalImages,
        currentImage: job.totalImages,
        progressPercent: 100,
        extractedItems: extractedItems.length,
        results: extractedItems,
        imagesData: null,
      });

      console.log(`[Worker] Completed import job ${job.id}, extracted ${extractedItems.length} items`);

      const user = await storage.getUser(job.userId);
      if (user?.email) {
        const baseUrl = process.env.VITE_PUBLIC_URL || 'http://localhost:5000';
        const previewUrl = `${baseUrl}/bulk-import/preview/${job.id}`;
        
        try {
          await sendBulkImportCompleteEmail(
            user.email,
            user.firstName || 'User',
            extractedItems.length,
            previewUrl
          );

          await storage.updateImportJob(job.id, { notificationSent: true });
          console.log(`[Worker] Sent notification email to ${user.email}`);
        } catch (emailError: any) {
          console.error(`[Worker] Failed to send email notification:`, emailError);
        }
      }

      return true;
    } catch (processingError: any) {
      console.error(`[Worker] Error processing import job ${job.id}:`, processingError);
      
      await storage.updateImportJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        error: processingError.message || 'Processing failed',
      });
      
      return true;
    }
  } catch (error: any) {
    console.error('[Worker] Error in processNextImportJob:', error);
    return false;
  }
}

async function processNextPriceSyncJob() {
  try {
    const job = await storage.getNextQueuedPriceSyncJob();
    
    if (!job) {
      return false;
    }

    console.log(`[Worker] Processing price sync job ${job.id}`);

    await storage.updatePriceSyncJob(job.id, {
      status: 'processing',
      startedAt: new Date(),
      progressPercent: 0,
    });

    try {
      // Get catalog with decrypted credentials (internal use only)
      const catalog = await storage.getSupplierCatalogWithCredentials(job.catalogId);
      if (!catalog) {
        throw new Error('Catalog not found');
      }

      // Only Galexis is supported
      if (catalog.supplierName !== 'Galexis') {
        throw new Error(`Unsupported supplier: ${catalog.supplierName}. Only Galexis (API) is supported.`);
      }

      if (!catalog.apiPassword || !catalog.customerNumber) {
        throw new Error('Galexis credentials not configured. Please enter API password and customer number in Supplier settings.');
      }

      const client = createGalexisClient(
        catalog.customerNumber,
        catalog.apiPassword,
        catalog.apiBaseUrl || undefined
      );

      console.log(`[Worker] Testing Galexis connection...`);
      const connectionTest = await client.testConnection();
      if (!connectionTest.success) {
        throw new Error(`Galexis connection failed: ${connectionTest.message}`);
      }

      // Get all items from this hospital that have item codes (GTIN/pharmacode)
      const allHospitalItems = await db
        .select({
          itemId: items.id,
          itemName: items.name,
          gtin: itemCodes.gtin,
          pharmacode: itemCodes.pharmacode,
        })
        .from(items)
        .leftJoin(itemCodes, eq(itemCodes.itemId, items.id))
        .where(eq(items.hospitalId, catalog.hospitalId));

      // Get existing Galexis supplier codes for this hospital's items
      const existingSupplierCodes = await db
        .select({
          id: supplierCodes.id,
          itemId: supplierCodes.itemId,
          articleCode: supplierCodes.articleCode,
          basispreis: supplierCodes.basispreis,
          publikumspreis: supplierCodes.publikumspreis,
          matchedProductName: supplierCodes.matchedProductName,
          catalogUrl: supplierCodes.catalogUrl,
        })
        .from(supplierCodes)
        .innerJoin(items, eq(items.id, supplierCodes.itemId))
        .where(and(
          eq(supplierCodes.supplierName, 'Galexis'),
          eq(items.hospitalId, catalog.hospitalId)
        ));

      // Get set of item IDs that already have Galexis codes
      const itemsWithGalexisCode = new Set(existingSupplierCodes.map(c => c.itemId));

      // Get items that have ANY supplier with zero/null price - these need price resolution
      const zeroPriceSuppliers = await db
        .select({
          itemId: supplierCodes.itemId,
          supplierName: supplierCodes.supplierName,
          basispreis: supplierCodes.basispreis,
          isPreferred: supplierCodes.isPreferred,
        })
        .from(supplierCodes)
        .innerJoin(items, eq(items.id, supplierCodes.itemId))
        .where(and(
          eq(items.hospitalId, catalog.hospitalId),
          eq(supplierCodes.isPreferred, true),
          or(
            isNull(supplierCodes.basispreis),
            eq(supplierCodes.basispreis, '0'),
            eq(supplierCodes.basispreis, '0.00')
          )
        ));
      
      const itemsWithZeroPriceSupplier = new Set(zeroPriceSuppliers.map(s => s.itemId));
      console.log(`[Worker] Found ${zeroPriceSuppliers.length} items with preferred suppliers that have zero/null price - will try to resolve from Galexis`);

      // Build a map of itemId -> item info for all hospital items
      const hospitalItemMap = new Map<string, { itemId: string; itemName: string; pharmacode?: string; gtin?: string }>();
      for (const item of allHospitalItems) {
        hospitalItemMap.set(item.itemId, {
          itemId: item.itemId,
          itemName: item.itemName,
          pharmacode: item.pharmacode || undefined,
          gtin: item.gtin || undefined,
        });
      }

      // Collect items with pharmacode/GTIN for productAvailability lookup
      // Include both items from itemCodes AND existing supplier codes (which use articleCode as pharmacode)
      const itemsToLookup: Array<{ itemId: string; itemName: string; pharmacode?: string; gtin?: string }> = [];
      const lookupCodes = new Set<string>(); // Track codes already added to avoid duplicates

      // First, add items with pharmacode/GTIN from itemCodes
      for (const item of allHospitalItems) {
        if (item.pharmacode || item.gtin) {
          itemsToLookup.push({
            itemId: item.itemId,
            itemName: item.itemName,
            pharmacode: item.pharmacode || undefined,
            gtin: item.gtin || undefined,
          });
          if (item.pharmacode) lookupCodes.add(item.pharmacode);
          if (item.gtin) lookupCodes.add(item.gtin);
        }
      }

      // Second, add existing Galexis supplier codes that aren't already covered
      // (for items that have supplier codes but no itemCodes entry)
      for (const code of existingSupplierCodes) {
        if (code.articleCode && !lookupCodes.has(code.articleCode)) {
          const itemInfo = hospitalItemMap.get(code.itemId);
          itemsToLookup.push({
            itemId: code.itemId,
            itemName: itemInfo?.itemName || 'Unknown',
            pharmacode: code.articleCode, // articleCode is the pharmacode for Galexis
          });
          lookupCodes.add(code.articleCode);
        }
      }

      console.log(`[Worker] Found ${itemsToLookup.length} items to lookup in Galexis (${existingSupplierCodes.length} existing supplier codes)`);
      
      await storage.updatePriceSyncJob(job.id, {
        totalItems: itemsToLookup.length,
        progressPercent: 10,
      });

      // Use productAvailability API to lookup prices for items with pharmacode/GTIN
      let galexisDebugInfo: any = null;
      const priceMap = new Map<string, PriceData>();
      
      if (itemsToLookup.length > 0) {
        console.log(`[Worker] Using Galexis productAvailability API to lookup ${itemsToLookup.length} products...`);
        
        // Build lookup requests - prefer pharmacode over GTIN
        const lookupRequests: ProductLookupRequest[] = [];
        const itemIndexMap = new Map<number, typeof itemsToLookup[0]>(); // Track which item each request corresponds to
        
        for (let i = 0; i < itemsToLookup.length; i++) {
          const item = itemsToLookup[i];
          if (item.pharmacode) {
            lookupRequests.push({ pharmacode: item.pharmacode });
            itemIndexMap.set(lookupRequests.length - 1, item);
          } else if (item.gtin) {
            lookupRequests.push({ gtin: item.gtin });
            itemIndexMap.set(lookupRequests.length - 1, item);
          }
        }

        try {
          const { results: lookupResults, debugInfo } = await client.lookupProductsBatch(
            lookupRequests,
            50, // batch size
            (processed, total, found) => {
              const percent = 10 + Math.round((processed / total) * 40); // 10-50%
              storage.updatePriceSyncJob(job.id, {
                processedItems: processed,
                progressPercent: percent,
              });
            }
          );
          
          galexisDebugInfo = debugInfo;
          console.log(`[Worker] ProductAvailability completed: ${lookupResults.filter(r => r.found).length}/${lookupResults.length} found`);

          // Build price map from lookup results
          // Key by BOTH the returned pharmacode/gtin AND the original requested codes
          for (let i = 0; i < lookupResults.length; i++) {
            const result = lookupResults[i];
            const originalItem = itemIndexMap.get(i);
            
            if (result.found && result.price) {
              // Key by returned pharmacode
              if (result.pharmacode) {
                priceMap.set(result.pharmacode, result.price);
              }
              // Key by returned gtin
              if (result.gtin) {
                priceMap.set(result.gtin, result.price);
              }
              // ALSO key by original requested pharmacode (in case Galexis returns different format)
              if (originalItem?.pharmacode && !priceMap.has(originalItem.pharmacode)) {
                priceMap.set(originalItem.pharmacode, result.price);
              }
              // ALSO key by original requested gtin
              if (originalItem?.gtin && !priceMap.has(originalItem.gtin)) {
                priceMap.set(originalItem.gtin, result.price);
              }
            }
          }
          
          // Retry failed pharmacode lookups with GTIN as fallback
          const failedWithGtinFallback: ProductLookupRequest[] = [];
          const gtinToPharmacodeMap = new Map<string, string>(); // Track original pharmacode for each GTIN retry
          
          for (let i = 0; i < lookupResults.length; i++) {
            const result = lookupResults[i];
            const originalItem = itemIndexMap.get(i);
            
            // If lookup by pharmacode failed but item has GTIN, retry with GTIN
            if (!result.found && originalItem?.pharmacode && originalItem?.gtin && !priceMap.has(originalItem.gtin)) {
              failedWithGtinFallback.push({ gtin: originalItem.gtin });
              gtinToPharmacodeMap.set(originalItem.gtin, originalItem.pharmacode);
            }
          }
          
          if (failedWithGtinFallback.length > 0) {
            console.log(`[Worker] Retrying ${failedWithGtinFallback.length} failed pharmacode lookups with GTIN...`);
            
            try {
              const { results: retryResults } = await client.lookupProductsBatch(
                failedWithGtinFallback,
                50
              );
              
              let retryFoundCount = 0;
              for (const result of retryResults) {
                if (result.found && result.price) {
                  retryFoundCount++;
                  // Map both the GTIN and original pharmacode to this price
                  priceMap.set(result.gtin || '', result.price);
                  const originalPharmacode = gtinToPharmacodeMap.get(result.gtin || '');
                  if (originalPharmacode) {
                    priceMap.set(originalPharmacode, result.price);
                  }
                  if (result.pharmacode) {
                    priceMap.set(result.pharmacode, result.price);
                  }
                }
              }
              
              console.log(`[Worker] GTIN fallback found ${retryFoundCount}/${failedWithGtinFallback.length} additional products`);
            } catch (retryError: any) {
              console.error(`[Worker] GTIN fallback lookup failed:`, retryError.message);
            }
          }
        } catch (lookupError: any) {
          console.error(`[Worker] ProductAvailability lookup failed:`, lookupError.message);
          galexisDebugInfo = {
            error: lookupError.message,
            errorType: 'productAvailability',
            timestamp: new Date().toISOString(),
          };
        }
      }

      console.log(`[Worker] Got ${priceMap.size} prices from Galexis, matching with inventory items...`);

      await storage.updatePriceSyncJob(job.id, {
        progressPercent: 50,
      });

      let matchedCount = 0;
      let updatedCount = 0;
      const unmatchedWithCodes: Array<{ itemId: string; itemName: string; gtin?: string; pharmacode?: string }> = [];

      // Update prices for items with existing supplier codes
      for (const code of existingSupplierCodes) {
        // First try to find price by articleCode, then fallback to item's pharmacode/GTIN
        let priceData: PriceData | undefined;
        let matchedByCode: string | undefined;
        
        if (code.articleCode && priceMap.has(code.articleCode)) {
          priceData = priceMap.get(code.articleCode);
          matchedByCode = code.articleCode;
        } else {
          // Fallback: try item's pharmacode or GTIN from itemCodes
          const itemInfo = hospitalItemMap.get(code.itemId);
          if (itemInfo?.pharmacode && priceMap.has(itemInfo.pharmacode)) {
            priceData = priceMap.get(itemInfo.pharmacode);
            matchedByCode = itemInfo.pharmacode;
            console.log(`[Worker] Matched supplier code for item ${code.itemId} via pharmacode ${itemInfo.pharmacode} (articleCode was ${code.articleCode})`);
          } else if (itemInfo?.gtin && priceMap.has(itemInfo.gtin)) {
            priceData = priceMap.get(itemInfo.gtin);
            matchedByCode = itemInfo.gtin;
            console.log(`[Worker] Matched supplier code for item ${code.itemId} via GTIN ${itemInfo.gtin} (articleCode was ${code.articleCode})`);
          }
        }
        
        if (priceData) {
          matchedCount++;
          const priceDataNonNull = priceData!;
          
          const hasChanges = 
            code.basispreis !== String(priceData.basispreis) ||
            code.publikumspreis !== String(priceData.publikumspreis);

          // First, demote any other preferred suppliers for this item
          await db
            .update(supplierCodes)
            .set({
              isPreferred: false,
              updatedAt: new Date(),
            })
            .where(and(
              eq(supplierCodes.itemId, code.itemId),
              eq(supplierCodes.isPreferred, true),
              sql`${supplierCodes.id} != ${code.id}`
            ));

          if (hasChanges) {
            // Construct catalog URL using pharmacode (prefer matchedByCode which is the pharmacode/GTIN we found the price with)
            const pharmacodeForUrl = matchedByCode || code.articleCode;
            const catalogUrl = pharmacodeForUrl ? `https://dispocura.galexis.com/app#/articles/${pharmacodeForUrl}` : undefined;
            
            await db
              .update(supplierCodes)
              .set({
                basispreis: String(priceData.basispreis),
                publikumspreis: String(priceData.publikumspreis),
                lastPriceUpdate: new Date(),
                lastChecked: new Date(),
                updatedAt: new Date(),
                isPreferred: true,
                matchStatus: 'confirmed',
                matchedProductName: priceData.description || undefined,
                catalogUrl: catalogUrl,
              })
              .where(eq(supplierCodes.id, code.id));
            
            // Update itemCodes GTIN and unitsPerPack if we got them from Galexis
            if (priceData.gtin || priceData.packSize) {
              const existingItemCode = await db.select({ gtin: itemCodes.gtin, unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, code.itemId)).limit(1);
              if (existingItemCode.length > 0) {
                const updateFields: any = { updatedAt: new Date() };
                if (priceData.gtin && !existingItemCode[0].gtin) {
                  updateFields.gtin = priceData.gtin;
                }
                if (priceData.packSize && !existingItemCode[0].unitsPerPack) {
                  updateFields.unitsPerPack = priceData.packSize;
                }
                if (Object.keys(updateFields).length > 1) {
                  await db.update(itemCodes).set(updateFields).where(eq(itemCodes.itemId, code.itemId));
                  console.log(`[Worker] Updated itemCode for ${code.itemId}: GTIN=${updateFields.gtin || 'unchanged'}, packSize=${updateFields.unitsPerPack || 'unchanged'}`);
                }
              }
            }
            
            // Update item description if we got one from Galexis
            if (priceData.description) {
              const existingItem = await db.select({ description: items.description }).from(items).where(eq(items.id, code.itemId)).limit(1);
              if (existingItem.length > 0 && (!existingItem[0].description || existingItem[0].description !== priceData.description)) {
                await db.update(items).set({ description: priceData.description, updatedAt: new Date() }).where(eq(items.id, code.itemId));
                console.log(`[Worker] Updated item description for ${code.itemId}: "${priceData.description}"`);
              }
            }
            
            updatedCount++;
            console.log(`[Worker] Updated price for item ${code.itemId}: ${code.basispreis} -> ${priceData.basispreis}`);
          } else {
            // Construct catalog URL using pharmacode (prefer matchedByCode which is the pharmacode/GTIN we found the price with)
            const pharmacodeForUrl = matchedByCode || code.articleCode;
            const catalogUrl = pharmacodeForUrl ? `https://dispocura.galexis.com/app#/articles/${pharmacodeForUrl}` : undefined;
            
            await db
              .update(supplierCodes)
              .set({
                lastChecked: new Date(),
                isPreferred: true,
                matchStatus: 'confirmed',
                matchedProductName: priceData.description || code.matchedProductName || undefined,
                catalogUrl: catalogUrl || code.catalogUrl,
              })
              .where(eq(supplierCodes.id, code.id));
            
            // Update itemCodes GTIN and unitsPerPack if we got them from Galexis
            if (priceData.gtin || priceData.packSize) {
              const existingItemCode = await db.select({ gtin: itemCodes.gtin, unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, code.itemId)).limit(1);
              if (existingItemCode.length > 0) {
                const updateFields: any = { updatedAt: new Date() };
                if (priceData.gtin && !existingItemCode[0].gtin) {
                  updateFields.gtin = priceData.gtin;
                }
                if (priceData.packSize && !existingItemCode[0].unitsPerPack) {
                  updateFields.unitsPerPack = priceData.packSize;
                }
                if (Object.keys(updateFields).length > 1) {
                  await db.update(itemCodes).set(updateFields).where(eq(itemCodes.itemId, code.itemId));
                  console.log(`[Worker] Updated itemCode for ${code.itemId}: GTIN=${updateFields.gtin || 'unchanged'}, packSize=${updateFields.unitsPerPack || 'unchanged'}`);
                }
              }
            }
            
            // Update item description if we got one from Galexis
            if (priceData.description) {
              const existingItem = await db.select({ description: items.description }).from(items).where(eq(items.id, code.itemId)).limit(1);
              if (existingItem.length > 0 && !existingItem[0].description) {
                await db.update(items).set({ description: priceData.description, updatedAt: new Date() }).where(eq(items.id, code.itemId));
                console.log(`[Worker] Updated item description for ${code.itemId}: "${priceData.description}"`);
              }
            }
          }
        }
      }

      // Try to auto-match items by Pharmacode/GTIN and create supplier codes
      let autoMatchedCount = 0;
      let autoCreatedCount = 0;
      
      for (const item of itemsToLookup) {
        if (!itemsWithGalexisCode.has(item.itemId)) {
          // Try to match by Pharmacode first, then GTIN
          const pharmacode = item.pharmacode;
          const gtin = item.gtin;
          let priceData: PriceData | undefined;
          let matchedCode: string | undefined;
          
          if (pharmacode && priceMap.has(pharmacode)) {
            priceData = priceMap.get(pharmacode);
            matchedCode = pharmacode;
          } else if (gtin && priceMap.has(gtin)) {
            priceData = priceMap.get(gtin);
            matchedCode = pharmacode || gtin; // Use pharmacode as article code if available
          }
          
          if (priceData && matchedCode) {
            // Check if a Galexis supplier code with this articleCode already exists for this item
            const existingGalexisCode = await db
              .select({ id: supplierCodes.id })
              .from(supplierCodes)
              .where(and(
                eq(supplierCodes.itemId, item.itemId),
                eq(supplierCodes.supplierName, 'Galexis'),
                eq(supplierCodes.articleCode, matchedCode)
              ))
              .limit(1);
            
            if (existingGalexisCode.length > 0) {
              // Update existing code instead of creating duplicate
              const catalogUrl = matchedCode ? `https://dispocura.galexis.com/app#/articles/${matchedCode}` : undefined;
              await db
                .update(supplierCodes)
                .set({
                  basispreis: String(priceData.basispreis),
                  publikumspreis: String(priceData.publikumspreis),
                  lastPriceUpdate: new Date(),
                  lastChecked: new Date(),
                  isPreferred: true,
                  matchStatus: 'confirmed',
                  matchedProductName: priceData.description || undefined,
                  catalogUrl: catalogUrl,
                  updatedAt: new Date(),
                })
                .where(eq(supplierCodes.id, existingGalexisCode[0].id));
              
              console.log(`[Worker] Updated existing Galexis code for item "${item.itemName}" (articleCode: ${matchedCode})`);
              autoMatchedCount++;
              itemsWithGalexisCode.add(item.itemId);
              
              // Update itemCodes GTIN and packSize if we got them from Galexis
              if (priceData.gtin || priceData.packSize) {
                const existingItemCode = await db.select({ gtin: itemCodes.gtin, unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, item.itemId)).limit(1);
                if (existingItemCode.length > 0) {
                  const updateFields: any = { updatedAt: new Date() };
                  if (priceData.gtin && priceData.gtin !== item.gtin) {
                    updateFields.gtin = priceData.gtin;
                  }
                  if (priceData.packSize && !existingItemCode[0].unitsPerPack) {
                    updateFields.unitsPerPack = priceData.packSize;
                  }
                  if (Object.keys(updateFields).length > 1) {
                    await db.update(itemCodes).set(updateFields).where(eq(itemCodes.itemId, item.itemId));
                    console.log(`[Worker] Updated itemCode for ${item.itemId}: GTIN=${updateFields.gtin || 'unchanged'}, packSize=${updateFields.unitsPerPack || 'unchanged'}`);
                  }
                }
              }
            } else {
              // First, demote any other preferred suppliers for this item (especially zero-price ones)
              // This ensures Galexis with valid price becomes preferred
              const demotedCount = await db
                .update(supplierCodes)
                .set({
                  isPreferred: false,
                  updatedAt: new Date(),
                })
                .where(and(
                  eq(supplierCodes.itemId, item.itemId),
                  eq(supplierCodes.isPreferred, true)
                ));
              
              if (demotedCount.rowCount && demotedCount.rowCount > 0) {
                console.log(`[Worker] Demoted ${demotedCount.rowCount} existing preferred suppliers for item ${item.itemId} (Galexis price found: ${priceData.basispreis})`);
              }
              
              // Create new Galexis supplier code
              try {
                const newId = randomUUID();
                // Construct catalog URL using pharmacode (dispocura.galexis.com)
                const catalogUrl = matchedCode ? `https://dispocura.galexis.com/app#/articles/${matchedCode}` : undefined;
                
                await db.insert(supplierCodes).values({
                  id: newId,
                  itemId: item.itemId,
                  supplierName: 'Galexis',
                  articleCode: matchedCode,
                  basispreis: String(priceData.basispreis),
                  publikumspreis: String(priceData.publikumspreis),
                  lastPriceUpdate: new Date(),
                  lastChecked: new Date(),
                  isPreferred: true,
                  matchStatus: 'confirmed',
                  matchedProductName: priceData.description || undefined,
                  catalogUrl: catalogUrl,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
                
                // Update itemCodes GTIN and packSize if we got them from Galexis
                if (priceData.gtin || priceData.packSize) {
                  const existingItemCode = await db.select({ gtin: itemCodes.gtin, unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, item.itemId)).limit(1);
                  if (existingItemCode.length > 0) {
                    const updateFields: any = { updatedAt: new Date() };
                    if (priceData.gtin && priceData.gtin !== item.gtin) {
                      updateFields.gtin = priceData.gtin;
                    }
                    if (priceData.packSize && !existingItemCode[0].unitsPerPack) {
                      updateFields.unitsPerPack = priceData.packSize;
                    }
                    if (Object.keys(updateFields).length > 1) {
                      await db.update(itemCodes).set(updateFields).where(eq(itemCodes.itemId, item.itemId));
                      console.log(`[Worker] Updated itemCode for ${item.itemId}: GTIN=${updateFields.gtin || 'unchanged'}, packSize=${updateFields.unitsPerPack || 'unchanged'}`);
                    }
                  }
                }
                
                // Also update item description if we have a product name from Galexis
                if (priceData.description) {
                  const existingItem = await db.select({ description: items.description }).from(items).where(eq(items.id, item.itemId)).limit(1);
                  if (existingItem.length > 0 && !existingItem[0].description) {
                    await db.update(items).set({ description: priceData.description, updatedAt: new Date() }).where(eq(items.id, item.itemId));
                    console.log(`[Worker] Updated item description for ${item.itemId}: "${priceData.description}"`);
                  }
                }
                
                autoMatchedCount++;
                autoCreatedCount++;
                itemsWithGalexisCode.add(item.itemId);
                console.log(`[Worker] Auto-matched item "${item.itemName}" by ${pharmacode ? 'pharmacode' : 'GTIN'} ${matchedCode}, price=${priceData.basispreis}`);
              } catch (err: any) {
                console.error(`[Worker] Failed to create supplier code for item ${item.itemId}:`, err.message);
              }
            }
          } else {
            // Has codes but no match found in Galexis
            unmatchedWithCodes.push({
              itemId: item.itemId,
              itemName: item.itemName,
              gtin: gtin || undefined,
              pharmacode: pharmacode || undefined,
            });
            
            // Log diagnostic info for items that have valid codes but no Galexis match
            // This helps identify items that might need manual price entry
            const hasZeroPriceSupplier = itemsWithZeroPriceSupplier.has(item.itemId);
            if (hasZeroPriceSupplier) {
              console.log(`[Worker] ATTENTION: Item "${item.itemName}" has zero-price supplier but NOT found in Galexis (pharmacode: ${pharmacode || 'none'}, GTIN: ${gtin || 'none'}) - needs manual price entry`);
            } else {
              console.log(`[Worker] No Galexis match for item "${item.itemName}" (pharmacode: ${pharmacode || 'none'}, GTIN: ${gtin || 'none'})`);
            }
          }
        }
      }

      // HIN fallback: Try to match items that weren't found in Galexis
      let hinMatchedCount = 0;
      let hinCreatedCount = 0;
      
      if (unmatchedWithCodes.length > 0) {
        console.log(`[Worker] Attempting HIN fallback for ${unmatchedWithCodes.length} items not found in Galexis...`);
        
        try {
          const { hinClient, parsePackSizeFromDescription: parseHinPackSize } = await import('./services/hinMediupdateClient');
          const hinStatus = await hinClient.getSyncStatus();
          
          // Check if HIN database has any articles (more reliable than checking lastSyncAt)
          const hinHasData = hinStatus.articlesCount > 0;
          if (!hinHasData) {
            console.log(`[Worker] HIN database has no articles (count: ${hinStatus.articlesCount}, lastSync: ${hinStatus.lastSyncAt || 'never'}). Skipping HIN fallback.`);
          }
          
          if (hinHasData) {
            await storage.updatePriceSyncJob(job.id, {
              progressPercent: 70,
            });
            
            for (const item of unmatchedWithCodes) {
              try {
                // lookupByCode only takes one code - try pharmacode first, then GTIN
                const lookupCode = item.pharmacode || item.gtin;
                if (!lookupCode) continue;
                
                const hinResult = await hinClient.lookupByCode(lookupCode);
                
                if (hinResult && hinResult.found && hinResult.article) {
                  const basispreis = hinResult.article.pexf;
                  const publikumspreis = hinResult.article.ppub;
                  
                  if (basispreis || publikumspreis) {
                    // Parse pack size from HIN description
                    const hinPackSize = parseHinPackSize(hinResult.article.descriptionDe);
                    
                    // Check if HIN supplier code already exists
                    const existingHinCode = await db
                      .select({ id: supplierCodes.id })
                      .from(supplierCodes)
                      .where(and(
                        eq(supplierCodes.itemId, item.itemId),
                        eq(supplierCodes.supplierName, 'HIN')
                      ))
                      .limit(1);
                    
                    if (existingHinCode.length > 0) {
                      // Update existing HIN supplier code
                      await db
                        .update(supplierCodes)
                        .set({
                          basispreis: basispreis ? String(basispreis) : undefined,
                          publikumspreis: publikumspreis ? String(publikumspreis) : undefined,
                          lastPriceUpdate: new Date(),
                          lastChecked: new Date(),
                          isPreferred: true,
                          matchStatus: 'confirmed',
                          matchedProductName: hinResult.article.descriptionDe || undefined,
                          articleCode: hinResult.article.pharmacode || item.pharmacode || undefined,
                          updatedAt: new Date(),
                        })
                        .where(eq(supplierCodes.id, existingHinCode[0].id));
                      
                      hinMatchedCount++;
                      console.log(`[Worker] HIN fallback: Updated existing code for "${item.itemName}"`);
                    } else {
                      // Demote other preferred suppliers
                      await db
                        .update(supplierCodes)
                        .set({
                          isPreferred: false,
                          updatedAt: new Date(),
                        })
                        .where(and(
                          eq(supplierCodes.itemId, item.itemId),
                          eq(supplierCodes.isPreferred, true)
                        ));
                      
                      // Create new HIN supplier code
                      const newId = randomUUID();
                      await db.insert(supplierCodes).values({
                        id: newId,
                        itemId: item.itemId,
                        supplierName: 'HIN',
                        articleCode: hinResult.article.pharmacode || item.pharmacode || undefined,
                        basispreis: basispreis ? String(basispreis) : undefined,
                        publikumspreis: publikumspreis ? String(publikumspreis) : undefined,
                        lastPriceUpdate: new Date(),
                        lastChecked: new Date(),
                        isPreferred: true,
                        matchStatus: 'confirmed',
                        matchedProductName: hinResult.article.descriptionDe || undefined,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      });
                      
                      hinMatchedCount++;
                      hinCreatedCount++;
                      console.log(`[Worker] HIN fallback: Created supplier code for "${item.itemName}" - price: ${basispreis}`);
                    }
                    
                    // Update itemCodes if we got GTIN or packSize from HIN
                    if (hinResult.article.gtin || hinPackSize) {
                      const existingItemCode = await db.select({ gtin: itemCodes.gtin, unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, item.itemId)).limit(1);
                      if (existingItemCode.length > 0) {
                        const updateFields: any = { updatedAt: new Date() };
                        if (hinResult.article.gtin && !existingItemCode[0].gtin) {
                          updateFields.gtin = hinResult.article.gtin;
                        }
                        if (hinPackSize && !existingItemCode[0].unitsPerPack) {
                          updateFields.unitsPerPack = hinPackSize;
                        }
                        if (Object.keys(updateFields).length > 1) {
                          await db.update(itemCodes).set(updateFields).where(eq(itemCodes.itemId, item.itemId));
                        }
                      }
                    }
                    
                    // Remove from unmatched list since we found it in HIN
                    const unmatchedIndex = unmatchedWithCodes.findIndex(u => u.itemId === item.itemId);
                    if (unmatchedIndex !== -1) {
                      unmatchedWithCodes.splice(unmatchedIndex, 1);
                    }
                  }
                }
              } catch (hinItemError: any) {
                console.error(`[Worker] HIN lookup failed for item "${item.itemName}":`, hinItemError.message);
              }
            }
            
            console.log(`[Worker] HIN fallback: matched ${hinMatchedCount} items (${hinCreatedCount} new codes created)`);
          } else {
            console.log(`[Worker] HIN database not synced, skipping HIN fallback`);
          }
        } catch (hinError: any) {
          console.error(`[Worker] HIN fallback error:`, hinError.message);
        }
      }

      // Count how many zero-price items got resolved vs still unmatched
      const zeroPriceItemsResolved = zeroPriceSuppliers.filter(s => itemsWithGalexisCode.has(s.itemId)).length;
      const zeroPriceItemsStillUnmatched = zeroPriceSuppliers.filter(s => 
        !itemsWithGalexisCode.has(s.itemId) && unmatchedWithCodes.some(u => u.itemId === s.itemId)
      ).length;
      
      console.log(`[Worker] Zero-price suppliers: ${zeroPriceSuppliers.length} total, ${zeroPriceItemsResolved} resolved with Galexis, ${zeroPriceItemsStillUnmatched} still need manual pricing`);

      // Deduplicate supplier codes: remove entries with same item, same supplier, same code, same price
      let duplicatesRemoved = 0;
      try {
        // Find all supplier codes for this hospital's items
        const hospitalItemIds = allHospitalItems.map(i => i.itemId);
        const uniqueItemIds = [...new Set(hospitalItemIds)];
        
        if (uniqueItemIds.length > 0) {
          // Get all supplier codes for hospital items, grouped to find duplicates
          const allSupplierCodesForDedup = await db
            .select({
              id: supplierCodes.id,
              itemId: supplierCodes.itemId,
              supplierName: supplierCodes.supplierName,
              articleCode: supplierCodes.articleCode,
              basispreis: supplierCodes.basispreis,
              createdAt: supplierCodes.createdAt,
            })
            .from(supplierCodes)
            .where(inArray(supplierCodes.itemId, uniqueItemIds))
            .orderBy(supplierCodes.createdAt);
          
          // Group by (itemId, supplierName, articleCode, basispreis) and find duplicates
          const groupedCodes: Record<string, typeof allSupplierCodesForDedup> = {};
          
          for (const code of allSupplierCodesForDedup) {
            // Create a key from the combination that defines a duplicate
            const key = `${code.itemId}|${code.supplierName}|${code.articleCode || ''}|${code.basispreis || ''}`;
            
            if (!groupedCodes[key]) {
              groupedCodes[key] = [];
            }
            groupedCodes[key].push(code);
          }
          
          // Find groups with more than one entry (duplicates)
          const duplicateIds: string[] = [];
          for (const key of Object.keys(groupedCodes)) {
            const codes = groupedCodes[key];
            if (codes.length > 1) {
              // Keep the first (oldest) one, mark the rest for deletion
              for (let i = 1; i < codes.length; i++) {
                duplicateIds.push(codes[i].id);
              }
            }
          }
          
          if (duplicateIds.length > 0) {
            await db.delete(supplierCodes).where(inArray(supplierCodes.id, duplicateIds));
            duplicatesRemoved = duplicateIds.length;
            console.log(`[Worker] Removed ${duplicatesRemoved} duplicate supplier codes`);
          }
        }
      } catch (dedupError: any) {
        console.error(`[Worker] Deduplication error:`, dedupError.message);
      }

      const summary = {
        syncMethod: 'productAvailability',
        totalItemsLookedUp: itemsToLookup.length,
        totalPricesFound: priceMap.size,
        totalItemsInHospital: allHospitalItems.length,
        itemsWithSupplierCode: existingSupplierCodes.length + autoCreatedCount + hinCreatedCount,
        matchedItems: matchedCount + autoMatchedCount + hinMatchedCount,
        updatedItems: updatedCount,
        autoMatchedByPharmacode: autoMatchedCount,
        autoCreatedSupplierCodes: autoCreatedCount,
        hinFallbackMatched: hinMatchedCount,
        hinFallbackCreated: hinCreatedCount,
        unmatchedSupplierCodes: existingSupplierCodes.length - matchedCount,
        itemsWithoutSupplierCode: allHospitalItems.length - existingSupplierCodes.length - autoCreatedCount - hinCreatedCount,
        itemsWithGtinNoSupplierCode: unmatchedWithCodes.length,
        zeroPriceSuppliersTotal: zeroPriceSuppliers.length,
        zeroPriceSuppliersResolved: zeroPriceItemsResolved,
        zeroPriceSuppliersStillUnmatched: zeroPriceItemsStillUnmatched,
        duplicateSupplierCodesRemoved: duplicatesRemoved,
        unmatchedItems: unmatchedWithCodes.slice(0, 50),
        galexisApiDebug: galexisDebugInfo || null,
      };

      console.log(`[Worker] Summary: ${matchedCount} existing matched, ${updatedCount} updated, ${autoMatchedCount} auto-matched, ${hinMatchedCount} HIN fallback, ${duplicatesRemoved} duplicates removed, ${unmatchedWithCodes.length} items still unmatched`);

      await storage.updatePriceSyncJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        totalItems: itemsToLookup.length,
        processedItems: itemsToLookup.length,
        matchedItems: matchedCount + autoMatchedCount + hinMatchedCount,
        updatedItems: updatedCount,
        progressPercent: 100,
        summary: JSON.stringify(summary),
      });

      const totalMatched = matchedCount + autoMatchedCount + hinMatchedCount;
      let syncMessage = `Matched ${totalMatched} items`;
      if (autoMatchedCount > 0 || hinMatchedCount > 0) {
        const parts: string[] = [];
        if (autoMatchedCount > 0) parts.push(`${autoMatchedCount} auto-matched`);
        if (hinMatchedCount > 0) parts.push(`${hinMatchedCount} via HIN`);
        syncMessage += ` (${parts.join(', ')})`;
      }
      syncMessage += `, updated ${updatedCount} prices`;
      if (duplicatesRemoved > 0) {
        syncMessage += `, removed ${duplicatesRemoved} duplicates`;
      }

      await storage.updateSupplierCatalog(job.catalogId, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncMessage: syncMessage,
      });

      console.log(`[Worker] Completed price sync job ${job.id}: matched ${totalMatched}, updated ${updatedCount}, duplicates removed ${duplicatesRemoved}`);

      return true;
    } catch (processingError: any) {
      console.error(`[Worker] Error processing price sync job ${job.id}:`, processingError);
      
      await storage.updatePriceSyncJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        error: processingError.message || 'Processing failed',
      });

      await storage.updateSupplierCatalog(job.catalogId, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        lastSyncMessage: processingError.message || 'Sync failed',
      });
      
      return true;
    }
  } catch (error: any) {
    console.error('[Worker] Error in processNextPriceSyncJob:', error);
    return false;
  }
}

/**
 * Process scheduled jobs for automatic questionnaire dispatch
 */
async function processNextScheduledJob(): Promise<boolean> {
  try {
    const job = await storage.getNextScheduledJob();
    
    if (!job) {
      return false;
    }

    console.log(`[Worker] Processing scheduled job ${job.id} (${job.jobType}) for hospital ${job.hospitalId}`);

    await storage.updateScheduledJob(job.id, {
      status: 'processing',
      startedAt: new Date(),
    });

    try {
      if (job.jobType === 'auto_questionnaire_dispatch') {
        await processAutoQuestionnaireDispatch(job);
      } else if (job.jobType === 'sync_timebutler_ics') {
        await processTimebutlerIcsSync(job);
      } else if (job.jobType === 'sync_calcom') {
        await processCalcomSync(job);
      } else if (job.jobType === 'pre_surgery_reminder') {
        await processPreSurgeryReminder(job);
      } else if (job.jobType === 'monthly_billing') {
        await processMonthlyBilling(job);
      }

      return true;
    } catch (processingError: any) {
      console.error(`[Worker] Error processing scheduled job ${job.id}:`, processingError);
      
      await storage.updateScheduledJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        error: processingError.message || 'Processing failed',
      });
      
      return true;
    }
  } catch (error: any) {
    console.error('[Worker] Error in processNextScheduledJob:', error);
    return false;
  }
}

/**
 * Send questionnaire email to a patient
 */
async function sendQuestionnaireEmail(
  linkToken: string,
  patientEmail: string,
  patientName: string,
  hospitalId: string,
  unitId: string | null,
  infoFlyers: InfoFlyerData[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    const hospital = await storage.getHospital(hospitalId);
    
    // Get unit info for the help line phone number
    let helpPhone: string | null = null;
    if (unitId) {
      const unit = await storage.getUnit(unitId);
      helpPhone = unit?.questionnairePhone || hospital?.companyPhone || null;
    } else {
      helpPhone = hospital?.companyPhone || null;
    }

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
    const questionnaireUrl = `${baseUrl}/questionnaire/${linkToken}`;
    
    // Build help contact section based on available phone
    const helpContactEN = helpPhone 
      ? `If you have any questions or need assistance, please call us at <strong>${helpPhone}</strong>.`
      : `If you have any questions, please contact our office.`;
    const helpContactDE = helpPhone 
      ? `Bei Fragen oder wenn Sie Hilfe benötigen, rufen Sie uns bitte an unter <strong>${helpPhone}</strong>.`
      : `Bei Fragen kontaktieren Sie bitte unser Büro.`;
    
    // Build info flyer section if available
    let flyerSectionEN = '';
    let flyerSectionDE = '';
    if (infoFlyers.length > 0) {
      const flyerLinksEN = infoFlyers.map(f => 
        `<a href="${f.downloadUrl || f.flyerUrl}" style="color: #0066cc;">${f.unitName} Information</a>`
      ).join('<br/>');
      const flyerLinksDE = infoFlyers.map(f => 
        `<a href="${f.downloadUrl || f.flyerUrl}" style="color: #cc0000;">${f.unitName} Informationen</a>`
      ).join('<br/>');
      
      flyerSectionEN = `
        <div style="background-color: #e0f2fe; border-left: 4px solid #0066cc; padding: 15px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #0066cc;">📄 Important Documents</h4>
          <p style="margin: 0; font-size: 14px;">Please review the following information before your procedure:</p>
          <p style="margin: 10px 0 0 0;">${flyerLinksEN}</p>
        </div>
      `;
      flyerSectionDE = `
        <div style="background-color: #fef2f2; border-left: 4px solid #cc0000; padding: 15px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #cc0000;">📄 Wichtige Dokumente</h4>
          <p style="margin: 0; font-size: 14px;">Bitte lesen Sie die folgenden Informationen vor Ihrem Eingriff:</p>
          <p style="margin: 10px 0 0 0;">${flyerLinksDE}</p>
        </div>
      `;
    }
    
    // Send bilingual email using Resend
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
      to: patientEmail,
      subject: `Pre-Op Questionnaire / Präoperativer Fragebogen - ${hospital?.name || 'Hospital'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <!-- English Section -->
          <div style="margin-bottom: 40px;">
            <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">🇬🇧 Pre-Operative Questionnaire</h2>
            <p>Dear ${patientName},</p>
            <p>You have been invited to complete a pre-operative questionnaire for your upcoming procedure at ${hospital?.name || 'our facility'}.</p>
            <p>Please click the button below to access and complete the questionnaire:</p>
            <p style="margin: 25px 0; text-align: center;">
              <a href="${questionnaireUrl}" style="background-color: #0066cc; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Complete Questionnaire
              </a>
            </p>
            <p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser:</p>
            <p style="color: #0066cc; word-break: break-all; font-size: 12px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${questionnaireUrl}</p>
            ${flyerSectionEN}
            <p>${helpContactEN}</p>
          </div>
          
          <!-- German Section -->
          <div>
            <h2 style="color: #333; border-bottom: 2px solid #cc0000; padding-bottom: 10px;">🇩🇪 Präoperativer Fragebogen</h2>
            <p>Liebe(r) ${patientName},</p>
            <p>Sie wurden eingeladen, einen präoperativen Fragebogen für Ihren bevorstehenden Eingriff bei ${hospital?.name || 'unserer Einrichtung'} auszufüllen.</p>
            <p>Bitte klicken Sie auf die Schaltfläche unten, um den Fragebogen aufzurufen und auszufüllen:</p>
            <p style="margin: 25px 0; text-align: center;">
              <a href="${questionnaireUrl}" style="background-color: #cc0000; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Fragebogen ausfüllen
              </a>
            </p>
            ${flyerSectionDE}
            <p>${helpContactDE}</p>
          </div>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;" />
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ${hospital?.name || 'Hospital'}.<br/>
            Dies ist eine automatische Nachricht von ${hospital?.name || 'Hospital'}.
          </p>
        </div>
      `,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[Worker] Failed to send questionnaire email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send questionnaire SMS to a patient
 * Uses a shorter message with the link and unit phone number for callback reference
 */
async function sendQuestionnaireSms(
  linkToken: string,
  patientPhone: string,
  patientName: string,
  hospitalId: string,
  unitId: string | null,
  infoFlyers: InfoFlyerData[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isSmsConfigured()) {
      return { success: false, error: 'SMS is not configured (VONAGE credentials missing)' };
    }

    const hospital = await storage.getHospital(hospitalId);
    
    // Get unit info for the help line phone number
    let helpPhone: string | null = null;
    if (unitId) {
      const unit = await storage.getUnit(unitId);
      helpPhone = unit?.questionnairePhone || hospital?.companyPhone || null;
    } else {
      helpPhone = hospital?.companyPhone || null;
    }

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
    const questionnaireUrl = `${baseUrl}/questionnaire/${linkToken}`;
    
    // Build a short bilingual SMS message (SMS has character limits)
    // Standard SMS = 160 chars, concatenated can be longer but charged per segment
    let message = `${hospital?.name || 'Hospital'}: Bitte füllen Sie Ihren präoperativen Fragebogen aus / Please complete your pre-op questionnaire:\n${questionnaireUrl}`;
    
    // Add info flyer links if available
    if (infoFlyers.length > 0) {
      message += `\n\n📄 Infos:`;
      for (const flyer of infoFlyers) {
        message += `\n${flyer.downloadUrl || flyer.flyerUrl}`;
      }
    }
    
    if (helpPhone) {
      message += `\n\nBei Fragen / Questions: ${helpPhone}`;
    }

    const result = await sendSms(patientPhone, message, hospitalId);
    
    if (result.success) {
      console.log(`[Worker] SMS sent to ${patientPhone}, UUID: ${result.messageUuid}`);
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error: any) {
    console.error('[Worker] Failed to send questionnaire SMS:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Process auto-questionnaire dispatch job
 * Finds surgeries scheduled ~14 days in the future and sends questionnaires
 */
async function processAutoQuestionnaireDispatch(job: any): Promise<void> {
  const hospitalId = job.hospitalId;
  
  console.log(`[Worker] Auto-questionnaire dispatch for hospital ${hospitalId}`);
  
  // Check if questionnaire addon is enabled for this hospital
  // Free accounts and test accounts (within 15-day trial) have all addons enabled
  const hospital = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  const hospitalData = hospital[0];
  if (!hospitalData) {
    console.log(`[Worker] Hospital ${hospitalId} not found, skipping`);
    return;
  }
  
  const isFreeAccount = hospitalData.licenseType === "free";
  const isTestAccount = hospitalData.licenseType === "test";
  const TRIAL_DAYS = 15;
  let isWithinTrial = false;
  if (isTestAccount && hospitalData.trialStartDate) {
    const trialStartDate = new Date(hospitalData.trialStartDate);
    const trialEndsAt = new Date(trialStartDate);
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
    isWithinTrial = new Date() < trialEndsAt;
  }
  // If test account has no trialStartDate, consider trial expired (no full access)
  
  // Note: questionnaire is now included in base fee, no longer need to check addon flag
  // The only check is if the hospital has manually disabled questionnaires
  
  // Check if questionnaire is manually disabled (override)
  if (hospitalData.questionnaireDisabled) {
    console.log(`[Worker] Skipping auto-questionnaire dispatch - questionnaire manually disabled for hospital ${hospitalId}`);
    return;
  }
  
  // Get surgeries scheduled for daysAhead days from now
  const eligibleSurgeries = await storage.getSurgeriesForAutoQuestionnaire(
    hospitalId, 
    AUTO_QUESTIONNAIRE_DAYS_AHEAD
  );
  
  console.log(`[Worker] Found ${eligibleSurgeries.length} surgeries scheduled for ${AUTO_QUESTIONNAIRE_DAYS_AHEAD} days ahead`);
  
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const results: Array<{
    surgeryId: string;
    patientName: string;
    status: 'sent_email' | 'sent_sms' | 'skipped_no_contact' | 'skipped_already_sent' | 'skipped_has_questionnaire' | 'failed';
    error?: string;
  }> = [];

  for (const surgery of eligibleSurgeries) {
    processedCount++;
    const patientName = `${surgery.patientFirstName} ${surgery.patientLastName}`;
    
    // Skip if patient already has a filled/submitted questionnaire (via tablet or previous visit)
    if (surgery.hasExistingQuestionnaire) {
      console.log(`[Worker] Skipping ${patientName} - patient already has filled questionnaire`);
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'skipped_has_questionnaire',
      });
      continue;
    }
    
    // Skip if already has questionnaire sent
    if (surgery.hasQuestionnaireSent) {
      console.log(`[Worker] Skipping ${patientName} - questionnaire already sent`);
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'skipped_already_sent',
      });
      continue;
    }
    
    // Check if we have any contact method (email or phone)
    const hasEmail = !!surgery.patientEmail;
    const hasPhone = !!surgery.patientPhone;
    
    if (!hasEmail && !hasPhone) {
      console.log(`[Worker] Skipping ${patientName} - no email or phone on file`);
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'skipped_no_contact',
      });
      continue;
    }
    
    try {
      // Generate a questionnaire link
      const linkToken = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14); // 14 day expiry
      
      // Create the questionnaire link
      const newLink = await storage.createQuestionnaireLink({
        hospitalId,
        patientId: surgery.patientId,
        surgeryId: surgery.surgeryId,
        token: linkToken,
        expiresAt,
        status: 'pending',
        language: 'de',
      });
      
      // Get relevant info flyers for this surgery (surgery room unit + anesthesia module)
      const flyers = await getRelevantInfoFlyers(hospitalId, surgery.surgeryRoomId);
      const flyersWithUrls = await generateFlyerDownloadUrls(flyers);
      
      // Try email first, fall back to SMS
      let sendSuccess = false;
      let usedMethod: 'email' | 'sms' = 'email';
      
      if (hasEmail) {
        const emailResult = await sendQuestionnaireEmail(
          linkToken,
          surgery.patientEmail!,
          patientName,
          hospitalId,
          null,
          flyersWithUrls
        );
        
        if (emailResult.success) {
          await storage.updateQuestionnaireLink(newLink.id, {
            emailSent: true,
            emailSentAt: new Date(),
            emailSentTo: surgery.patientEmail,
          });
          sendSuccess = true;
          usedMethod = 'email';
          console.log(`[Worker] Successfully sent questionnaire via email to ${patientName} (${surgery.patientEmail})`);
        } else {
          console.log(`[Worker] Email failed for ${patientName}, trying SMS fallback...`);
        }
      }
      
      // If email failed or not available, try SMS
      if (!sendSuccess && hasPhone && isSmsConfigured()) {
        const smsResult = await sendQuestionnaireSms(
          linkToken,
          surgery.patientPhone!,
          patientName,
          hospitalId,
          null,
          flyersWithUrls
        );
        
        if (smsResult.success) {
          await storage.updateQuestionnaireLink(newLink.id, {
            smsSent: true,
            smsSentAt: new Date(),
            smsSentTo: surgery.patientPhone,
          });
          sendSuccess = true;
          usedMethod = 'sms';
          console.log(`[Worker] Successfully sent questionnaire via SMS to ${patientName} (${surgery.patientPhone})`);
        }
      }
      
      if (sendSuccess) {
        // Save the automatic message to patient communication history
        const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5000';
        const questionnaireUrl = `${baseUrl}/questionnaire/${linkToken}`;
        const hospital = await storage.getHospital(hospitalId);
        
        let messageText: string;
        if (usedMethod === 'email') {
          messageText = `[Automatisch / Automatic] Präoperativer Fragebogen / Pre-operative Questionnaire\n\nLiebe(r) ${patientName},\n\nSie wurden eingeladen, einen präoperativen Fragebogen auszufüllen.\n\nDear ${patientName},\n\nYou have been invited to complete a pre-operative questionnaire.\n\n📋 ${questionnaireUrl}`;
        } else {
          messageText = `${hospital?.name || 'Hospital'}: Bitte füllen Sie Ihren präoperativen Fragebogen aus / Please complete your pre-op questionnaire:\n${questionnaireUrl}`;
        }
        
        try {
          await storage.createPatientMessage({
            hospitalId,
            patientId: surgery.patientId,
            sentBy: null, // automatic message, no user sender
            channel: usedMethod,
            recipient: usedMethod === 'email' ? surgery.patientEmail! : surgery.patientPhone!,
            message: messageText,
            status: 'sent',
            isAutomatic: true,
            messageType: 'auto_questionnaire',
          });
          console.log(`[Worker] Saved auto-questionnaire message to patient communication history`);
        } catch (msgError) {
          console.error(`[Worker] Failed to save auto-questionnaire message:`, msgError);
        }
        
        successCount++;
        results.push({
          surgeryId: surgery.surgeryId,
          patientName,
          status: usedMethod === 'email' ? 'sent_email' : 'sent_sms',
        });
      } else {
        failedCount++;
        results.push({
          surgeryId: surgery.surgeryId,
          patientName,
          status: 'failed',
          error: 'Failed to send via email or SMS',
        });
      }
    } catch (error: any) {
      console.error(`[Worker] Error processing surgery ${surgery.surgeryId}:`, error);
      failedCount++;
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'failed',
        error: error.message,
      });
    }
  }

  // Update job as completed
  await storage.updateScheduledJob(job.id, {
    status: 'completed',
    completedAt: new Date(),
    processedCount,
    successCount,
    failedCount,
    results: results as any,
  });

  console.log(`[Worker] Completed auto-questionnaire dispatch: ${successCount} sent, ${failedCount} failed, ${processedCount - successCount - failedCount} skipped`);
}

/**
 * Process Timebutler ICS sync for a hospital
 * Syncs absences from all users with configured ICS URLs
 */
async function processTimebutlerIcsSync(job: any): Promise<void> {
  console.log(`[Worker] Starting Timebutler ICS sync for hospital ${job.hospitalId}`);
  
  const icalModule = await import('node-ical');
  const ical = icalModule.default || icalModule; // Handle ESM/CJS compatibility
  const { userHospitalRoles } = await import("@shared/schema");
  
  // Get all users with ICS URLs configured for this hospital
  const usersWithIcs = await db
    .selectDistinct({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      timebutlerIcsUrl: users.timebutlerIcsUrl,
    })
    .from(users)
    .innerJoin(
      userHospitalRoles,
      and(
        eq(users.id, userHospitalRoles.userId),
        eq(userHospitalRoles.hospitalId, job.hospitalId)
      )
    )
    .where(sql`${users.timebutlerIcsUrl} IS NOT NULL AND ${users.timebutlerIcsUrl} != ''`);
  
  if (usersWithIcs.length === 0) {
    await storage.updateScheduledJob(job.id, {
      status: 'completed',
      completedAt: new Date(),
      processedCount: 0,
      successCount: 0,
      results: { message: 'No users with ICS URLs configured' },
    });
    console.log(`[Worker] No users with ICS URLs for hospital ${job.hospitalId}`);
    return;
  }
  
  let totalSynced = 0;
  let usersProcessed = 0;
  let failedCount = 0;
  const results: any[] = [];
  
  for (const user of usersWithIcs) {
    try {
      const events = await ical.async.fromURL(user.timebutlerIcsUrl!);
      
      const absences: any[] = [];
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
      const oneYearAhead = new Date(now.getFullYear() + 1, 11, 31);
      
      for (const [key, event] of Object.entries(events)) {
        if ((event as any).type !== 'VEVENT') continue;
        
        const vevent = event as any;
        const startDate = vevent.start;
        const endDate = vevent.end;
        const summary = vevent.summary || 'Absence';
        
        if (!startDate || startDate < oneYearAgo || startDate > oneYearAhead) continue;
        
        let absenceType = 'other';
        const lowerSummary = summary.toLowerCase();
        if (lowerSummary.includes('urlaub') || lowerSummary.includes('vacation') || lowerSummary.includes('holiday')) {
          absenceType = 'vacation';
        } else if (lowerSummary.includes('krank') || lowerSummary.includes('sick')) {
          absenceType = 'sick';
        } else if (lowerSummary.includes('fortbildung') || lowerSummary.includes('training')) {
          absenceType = 'training';
        }
        
        // ICS all-day events: DTEND is EXCLUSIVE (the day after the last day)
        // For DATE (not DATE-TIME) values, we need to subtract 1 day from end
        // Check if this is an all-day event (no time component, dates only)
        const isAllDayEvent = vevent.datetype === 'date' || 
          (startDate instanceof Date && startDate.getHours() === 0 && startDate.getMinutes() === 0);
        
        let adjustedEndDate = endDate;
        if (isAllDayEvent && endDate instanceof Date) {
          // Subtract 1 day for exclusive end date in ICS all-day events
          adjustedEndDate = new Date(endDate);
          adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
        }
        
        absences.push({
          providerId: user.id,
          hospitalId: job.hospitalId,
          absenceType,
          startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate,
          endDate: adjustedEndDate instanceof Date ? adjustedEndDate.toISOString().split('T')[0] : adjustedEndDate,
          externalId: `ics-${user.id}-${key}`,
          notes: summary,
        });
      }
      
      if (absences.length > 0) {
        await storage.syncProviderAbsencesForUser(job.hospitalId, user.id, absences);
      } else {
        await storage.clearProviderAbsencesForUser(job.hospitalId, user.id);
      }
      
      totalSynced += absences.length;
      usersProcessed++;
      results.push({ userId: user.id, name: `${user.firstName} ${user.lastName}`, status: 'success', absencesCount: absences.length });
    } catch (userError: any) {
      failedCount++;
      results.push({ userId: user.id, name: `${user.firstName} ${user.lastName}`, status: 'failed', error: userError.message });
      console.error(`[Worker] Failed to sync ICS for user ${user.id}:`, userError.message);
    }
  }
  
  await storage.updateScheduledJob(job.id, {
    status: 'completed',
    completedAt: new Date(),
    processedCount: usersWithIcs.length,
    successCount: usersProcessed,
    failedCount,
    results: { totalSynced, users: results },
  });
  
  console.log(`[Worker] Completed Timebutler ICS sync: ${usersProcessed}/${usersWithIcs.length} users, ${totalSynced} absences synced`);
}

/**
 * Schedule Timebutler ICS sync jobs for all hospitals
 * This runs periodically (every 1 hour) to keep absences in sync
 */
async function scheduleTimebutlerIcsSyncJobs(): Promise<void> {
  try {
    const allHospitals = await db.select().from(hospitals);
    const now = new Date();
    
    for (const hospital of allHospitals) {
      // Check if there's already a pending or recent job
      const lastJob = await storage.getLastScheduledJobForHospital(hospital.id, 'sync_timebutler_ics');
      
      if (lastJob) {
        const hoursSinceLastJob = (now.getTime() - new Date(lastJob.scheduledFor).getTime()) / (1000 * 60 * 60);
        
        // Skip if we have a pending/processing job or if last job was less than 1 hour ago
        if (lastJob.status === 'pending' || lastJob.status === 'processing' || hoursSinceLastJob < 1) {
          continue;
        }
      }
      
      // Schedule a new job for now
      await storage.createScheduledJob({
        jobType: 'sync_timebutler_ics',
        hospitalId: hospital.id,
        scheduledFor: now,
        status: 'pending',
      });
      
      console.log(`[Worker] Scheduled Timebutler ICS sync job for hospital ${hospital.id}`);
    }
  } catch (error: any) {
    console.error('[Worker] Error scheduling Timebutler ICS sync jobs:', error);
  }
}

/**
 * Schedule auto-questionnaire dispatch jobs for all hospitals that need them
 * This runs periodically to ensure jobs are scheduled for each hospital daily
 */
async function scheduleAutoQuestionnaireJobs(): Promise<void> {
  try {
    // Get all hospitals
    const allHospitals = await db.select().from(hospitals);
    
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(6, 0, 0, 0); // Schedule for 6 AM each day
    
    for (const hospital of allHospitals) {
      // Check if there's already a completed or pending job for today
      const lastJob = await storage.getLastScheduledJobForHospital(hospital.id, 'auto_questionnaire_dispatch');
      
      if (lastJob) {
        const lastJobDate = new Date(lastJob.scheduledFor);
        const isSameDay = lastJobDate.toDateString() === todayStart.toDateString();
        
        // Skip if we already have a successful or pending job for today
        // Allow retry if the job failed
        if (isSameDay && (lastJob.status === 'completed' || lastJob.status === 'pending' || lastJob.status === 'processing')) {
          continue;
        }
      }
      
      // If no job exists for today and it's past 6 AM, schedule one for now
      // Otherwise schedule for 6 AM tomorrow
      let scheduledFor: Date;
      if (now.getHours() >= 6) {
        scheduledFor = now; // Run immediately if past 6 AM
      } else {
        scheduledFor = todayStart;
      }
      
      await storage.createScheduledJob({
        jobType: 'auto_questionnaire_dispatch',
        hospitalId: hospital.id,
        scheduledFor,
        status: 'pending',
      });
      
      console.log(`[Worker] Scheduled auto-questionnaire job for hospital ${hospital.id} at ${scheduledFor.toISOString()}`);
    }
  } catch (error: any) {
    console.error('[Worker] Error scheduling auto-questionnaire jobs:', error);
  }
}

/**
 * Schedule Cal.com sync jobs for hospitals with Cal.com enabled and configured
 * This runs periodically (every 1 hour) to keep Cal.com in sync
 */
async function scheduleCalcomSyncJobs(): Promise<void> {
  try {
    // Only get hospitals that have Cal.com enabled and configured
    const { calcomConfig } = await import("@shared/schema");
    const enabledConfigs = await db
      .select({ hospitalId: calcomConfig.hospitalId })
      .from(calcomConfig)
      .where(eq(calcomConfig.isEnabled, true));
    
    if (enabledConfigs.length === 0) {
      return; // No hospitals have Cal.com enabled
    }
    
    const now = new Date();
    
    for (const config of enabledConfigs) {
      // Check if there's already a pending or recent job
      const lastJob = await storage.getLastScheduledJobForHospital(config.hospitalId, 'sync_calcom');
      
      if (lastJob) {
        const hoursSinceLastJob = (now.getTime() - new Date(lastJob.scheduledFor).getTime()) / (1000 * 60 * 60);
        
        // Skip if we have a pending/processing job or if last job was less than 1 hour ago
        if (lastJob.status === 'pending' || lastJob.status === 'processing' || hoursSinceLastJob < 1) {
          continue;
        }
      }
      
      // Schedule a new job for now
      await storage.createScheduledJob({
        jobType: 'sync_calcom',
        hospitalId: config.hospitalId,
        scheduledFor: now,
        status: 'pending',
      });
      
      console.log(`[Worker] Scheduled Cal.com sync job for hospital ${config.hospitalId}`);
    }
  } catch (error: any) {
    console.error('[Worker] Error scheduling Cal.com sync jobs:', error);
  }
}

/**
 * Process Cal.com sync job for a hospital
 * Syncs all appointments and surgeries to Cal.com for mapped providers
 */
async function processCalcomSync(job: any): Promise<void> {
  console.log(`[Worker] Starting Cal.com sync for hospital ${job.hospitalId}`);
  
  try {
    const { syncAppointmentsToCalcom, syncSurgeriesToCalcom } = await import("./services/calcomSync");
    
    const appointmentsResult = await syncAppointmentsToCalcom(job.hospitalId);
    const surgeriesResult = await syncSurgeriesToCalcom(job.hospitalId);
    
    const totalSynced = appointmentsResult.synced + surgeriesResult.synced;
    const totalErrors = appointmentsResult.errors.length + surgeriesResult.errors.length;
    
    await storage.updateScheduledJob(job.id, {
      status: 'completed',
      completedAt: new Date(),
      processedCount: totalSynced,
      successCount: totalSynced,
      failedCount: totalErrors,
      results: {
        appointments: appointmentsResult,
        surgeries: surgeriesResult,
      },
    });
    
    console.log(`[Worker] Completed Cal.com sync: ${appointmentsResult.synced} appointments, ${surgeriesResult.synced} surgeries synced`);
  } catch (error: any) {
    console.error(`[Worker] Cal.com sync error:`, error);
    
    await storage.updateScheduledJob(job.id, {
      status: 'failed',
      completedAt: new Date(),
      error: error.message || 'Cal.com sync failed',
    });
  }
}

/**
 * Schedule pre-surgery reminder jobs for all hospitals
 * Runs every hour to check for surgeries happening in 24 hours
 */
async function schedulePreSurgeryReminderJobs() {
  try {
    const allHospitals = await db.select().from(hospitals);
    
    const now = new Date();
    
    for (const hospital of allHospitals) {
      // Check if there's already a pending job for this check period
      const lastJob = await storage.getLastScheduledJobForHospital(hospital.id, 'pre_surgery_reminder');
      
      if (lastJob) {
        const lastJobDate = new Date(lastJob.scheduledFor);
        const hoursSinceLastJob = (now.getTime() - lastJobDate.getTime()) / (1000 * 60 * 60);
        
        // Only schedule a new job if at least 1 hour has passed
        if (hoursSinceLastJob < 1 && (lastJob.status === 'completed' || lastJob.status === 'pending' || lastJob.status === 'processing')) {
          continue;
        }
      }
      
      await storage.createScheduledJob({
        jobType: 'pre_surgery_reminder',
        hospitalId: hospital.id,
        scheduledFor: now,
        status: 'pending',
      });
      
      console.log(`[Worker] Scheduled pre-surgery reminder job for hospital ${hospital.id}`);
    }
  } catch (error: any) {
    console.error('[Worker] Error scheduling pre-surgery reminder jobs:', error);
  }
}

/**
 * Process pre-surgery reminder job
 * Sends SMS/email reminders to patients with surgery in ~24 hours
 * Includes fasting instructions and info flyer links
 */
async function processPreSurgeryReminder(job: any): Promise<void> {
  const hospitalId = job.hospitalId;
  
  console.log(`[Worker] Pre-surgery reminder for hospital ${hospitalId}`);
  
  // Check if pre-surgery reminder is manually disabled
  const hospitalData = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  if (hospitalData[0]?.preSurgeryReminderDisabled) {
    console.log(`[Worker] Skipping pre-surgery reminder - manually disabled for hospital ${hospitalId}`);
    return;
  }
  
  // Get surgeries scheduled for approximately 24 hours from now (22-26 hours window)
  const eligibleSurgeries = await storage.getSurgeriesForPreSurgeryReminder(
    hospitalId, 
    PRE_SURGERY_REMINDER_HOURS_AHEAD
  );
  
  console.log(`[Worker] Found ${eligibleSurgeries.length} surgeries scheduled for ~24 hours from now`);
  
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const results: Array<{
    surgeryId: string;
    patientName: string;
    status: 'sent_sms' | 'sent_email' | 'skipped_no_contact' | 'skipped_already_reminded' | 'failed';
    error?: string;
  }> = [];

  const hospital = await storage.getHospital(hospitalId);
  const hospitalName = hospital?.name || 'Hospital';

  for (const surgery of eligibleSurgeries) {
    processedCount++;
    const patientName = `${surgery.patientFirstName} ${surgery.patientLastName}`;
    
    // Skip if already reminded
    if (surgery.reminderSent) {
      console.log(`[Worker] Skipping ${patientName} - reminder already sent`);
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'skipped_already_reminded',
      });
      continue;
    }
    
    const hasEmail = !!surgery.patientEmail;
    const hasPhone = !!surgery.patientPhone;
    
    if (!hasEmail && !hasPhone) {
      console.log(`[Worker] Skipping ${patientName} - no contact info`);
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'skipped_no_contact',
      });
      continue;
    }
    
    try {
      // Format surgery date for display
      const surgeryDate = new Date(surgery.plannedDate);
      
      // Get relevant info flyers for this surgery
      const flyers = await getRelevantInfoFlyers(hospitalId, surgery.surgeryRoomId);
      const flyersWithUrls = await generateFlyerDownloadUrls(flyers);
      
      // Fasting instructions in German/English bilingual format
      const fastingInstructionsDe = 'Nüchternheitsregeln: Keine feste Nahrung ab 6 Stunden vor der OP. Klare Flüssigkeiten (Wasser, Tee ohne Milch) bis 2 Stunden vorher erlaubt.';
      const fastingInstructionsEn = 'Fasting rules: No solid food 6 hours before surgery. Clear liquids (water, tea without milk) allowed until 2 hours before.';
      
      let sendSuccess = false;
      let usedMethod: 'sms' | 'email' = 'sms';
      
      // Try SMS first (preferred for urgent reminders)
      let sentMessageText = '';
      if (hasPhone && isSmsConfigured()) {
        // Build SMS message - only include time if admissionTime is provided
        const surgeryInfoDe = surgery.admissionTime 
          ? `Erinnerung an Ihre OP morgen. Bitte kommen Sie um ${new Date(surgery.admissionTime).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })} in die Klinik.`
          : `Erinnerung an Ihre OP morgen.`;
        const surgeryInfoEn = surgery.admissionTime
          ? `Reminder: Your surgery tomorrow. Please arrive at the clinic by ${new Date(surgery.admissionTime).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}.`
          : `Reminder: Your surgery tomorrow.`;
        
        let smsMessage = `${hospitalName}: ${surgeryInfoDe}\n\n${fastingInstructionsDe}`;
        
        // Add info flyer links if available
        if (flyersWithUrls.length > 0) {
          smsMessage += '\n\n📄 Infos:';
          for (const flyer of flyersWithUrls) {
            smsMessage += `\n${flyer.downloadUrl || flyer.flyerUrl}`;
          }
        }
        
        smsMessage += `\n\n---\n\n${surgeryInfoEn}\n\n${fastingInstructionsEn}`;
        
        const smsResult = await sendSms(surgery.patientPhone!, smsMessage, hospitalId);
        
        if (smsResult.success) {
          sendSuccess = true;
          usedMethod = 'sms';
          sentMessageText = smsMessage;
          console.log(`[Worker] Pre-surgery reminder SMS sent to ${patientName}`);
        }
      }
      
      // Fallback to email if SMS failed or not available
      if (!sendSuccess && hasEmail) {
        const emailResult = await sendPreSurgeryReminderEmail(
          surgery.patientEmail!,
          patientName,
          hospitalName,
          surgeryDate,
          surgery.admissionTime ? new Date(surgery.admissionTime) : null,
          flyersWithUrls
        );
        
        if (emailResult.success) {
          sendSuccess = true;
          usedMethod = 'email';
          // Build email summary text for patient communication history
          const dateStr = surgeryDate.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
          const admissionTimeStr = surgery.admissionTime 
            ? new Date(surgery.admissionTime).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })
            : '';
          sentMessageText = `[Automatisch / Automatic] OP-Erinnerung / Surgery Reminder\n\n${dateStr}${admissionTimeStr ? ` um ${admissionTimeStr}` : ''}\n\n${fastingInstructionsDe}\n\n---\n\n${fastingInstructionsEn}`;
          console.log(`[Worker] Pre-surgery reminder email sent to ${patientName}`);
        }
      }
      
      if (sendSuccess) {
        // Mark as reminded
        await storage.markSurgeryReminderSent(surgery.surgeryId);
        
        // Save the automatic message to patient communication history
        try {
          await storage.createPatientMessage({
            hospitalId,
            patientId: surgery.patientId!,
            sentBy: null, // automatic message, no user sender
            channel: usedMethod,
            recipient: usedMethod === 'sms' ? surgery.patientPhone! : surgery.patientEmail!,
            message: sentMessageText,
            status: 'sent',
            isAutomatic: true,
            messageType: 'auto_reminder',
          });
          console.log(`[Worker] Saved pre-surgery reminder message to patient communication history`);
        } catch (msgError) {
          console.error(`[Worker] Failed to save pre-surgery reminder message:`, msgError);
        }
        
        successCount++;
        results.push({
          surgeryId: surgery.surgeryId,
          patientName,
          status: usedMethod === 'sms' ? 'sent_sms' : 'sent_email',
        });
      } else {
        failedCount++;
        results.push({
          surgeryId: surgery.surgeryId,
          patientName,
          status: 'failed',
          error: 'Failed to send via SMS or email',
        });
      }
    } catch (error: any) {
      console.error(`[Worker] Error sending reminder for surgery ${surgery.surgeryId}:`, error);
      failedCount++;
      results.push({
        surgeryId: surgery.surgeryId,
        patientName,
        status: 'failed',
        error: error.message,
      });
    }
  }

  // Update job as completed
  await storage.updateScheduledJob(job.id, {
    status: 'completed',
    completedAt: new Date(),
    processedCount,
    successCount,
    failedCount,
    results: results as any,
  });

  console.log(`[Worker] Completed pre-surgery reminders: ${successCount} sent, ${failedCount} failed, ${processedCount - successCount - failedCount} skipped`);
}

/**
 * Send pre-surgery reminder email with fasting instructions
 * ONLY includes time if admissionTime is specifically provided - no fallback to planned surgery time
 */
async function sendPreSurgeryReminderEmail(
  patientEmail: string,
  patientName: string,
  hospitalName: string,
  surgeryDate: Date,
  admissionTime: Date | null,
  infoFlyers: InfoFlyerData[] = []
): Promise<{ success: boolean; error?: string }> {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@viali.ch';
    const dateStrDe = surgeryDate.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dateStrEn = surgeryDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    // ONLY show time/admission info if admissionTime is specifically provided
    // Do NOT use planned surgery time as fallback - it may be incorrect
    let timeInfoDe = '';
    let timeInfoEn = '';
    let admissionInfoDe = '';
    let admissionInfoEn = '';
    if (admissionTime) {
      const admissionTimeStr = admissionTime.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      timeInfoDe = ` um ${admissionTimeStr}`;
      timeInfoEn = ` at ${admissionTimeStr}`;
      admissionInfoDe = `<p style="color: #059669; font-weight: bold;">Bitte kommen Sie um ${admissionTimeStr} in die Klinik.</p>`;
      admissionInfoEn = `<p style="color: #059669; font-weight: bold;">Please arrive at the clinic by ${admissionTimeStr}.</p>`;
    }
    
    // Build info flyer section if available
    let flyerSectionDE = '';
    let flyerSectionEN = '';
    if (infoFlyers.length > 0) {
      const flyerLinksDE = infoFlyers.map(f => 
        `<a href="${f.downloadUrl || f.flyerUrl}" style="color: #2563eb;">${f.unitName} Informationen</a>`
      ).join('<br/>');
      const flyerLinksEN = infoFlyers.map(f => 
        `<a href="${f.downloadUrl || f.flyerUrl}" style="color: #2563eb;">${f.unitName} Information</a>`
      ).join('<br/>');
      
      flyerSectionDE = `
        <div style="background-color: #e0f2fe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #2563eb;">📄 Wichtige Dokumente</h4>
          <p style="margin: 0; font-size: 14px;">Bitte lesen Sie die folgenden Informationen:</p>
          <p style="margin: 10px 0 0 0;">${flyerLinksDE}</p>
        </div>
      `;
      flyerSectionEN = `
        <div style="background-color: #e0f2fe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
          <h4 style="margin: 0 0 10px 0; color: #2563eb;">📄 Important Documents</h4>
          <p style="margin: 0; font-size: 14px;">Please review the following information:</p>
          <p style="margin: 10px 0 0 0;">${flyerLinksEN}</p>
        </div>
      `;
    }
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Erinnerung an Ihre OP / Surgery Reminder</h2>
        
        <div style="margin-bottom: 20px;">
          <p>Liebe(r) ${patientName},</p>
          <p>Dies ist eine Erinnerung an Ihre geplante Operation:</p>
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">
            ${dateStrDe}${timeInfoDe}<br/>
            ${hospitalName}
          </p>
          ${admissionInfoDe}
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #92400e;">Wichtige Nüchternheitsregeln / Fasting Rules</h3>
          <ul style="margin-bottom: 0;">
            <li><strong>6 Stunden vor der OP:</strong> Keine feste Nahrung</li>
            <li><strong>2 Stunden vor der OP:</strong> Keine Flüssigkeiten (auch kein Wasser)</li>
            <li>Klare Flüssigkeiten (Wasser, Tee ohne Milch) sind bis 2 Stunden vorher erlaubt</li>
          </ul>
        </div>
        
        ${flyerSectionDE}
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
        
        <div style="margin-bottom: 20px;">
          <p>Dear ${patientName},</p>
          <p>This is a reminder of your scheduled surgery:</p>
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">
            ${dateStrEn}${timeInfoEn}<br/>
            ${hospitalName}
          </p>
          ${admissionInfoEn}
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #92400e;">Important Fasting Rules</h3>
          <ul style="margin-bottom: 0;">
            <li><strong>6 hours before surgery:</strong> No solid food</li>
            <li><strong>2 hours before surgery:</strong> No liquids (including water)</li>
            <li>Clear liquids (water, tea without milk) are allowed until 2 hours before</li>
          </ul>
        </div>
        
        ${flyerSectionEN}
        
        <p style="color: #6b7280; font-size: 14px;">
          Bei Fragen kontaktieren Sie uns bitte. / Please contact us if you have questions.
        </p>
      </div>
    `;
    
    await resend.emails.send({
      from: fromEmail,
      to: patientEmail,
      subject: `${hospitalName} - Erinnerung an Ihre OP morgen / Surgery Reminder`,
      html: htmlContent,
    });
    
    return { success: true };
  } catch (error: any) {
    console.error('[Worker] Failed to send pre-surgery reminder email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Schedule monthly billing jobs for hospitals
 * Runs on the 1st of each month to bill for previous month's usage
 */
async function scheduleMonthlyBillingJobs(): Promise<void> {
  try {
    const now = new Date();
    const dayOfMonth = now.getDate();
    
    // Only run on the 1st through 5th of the month (grace period for billing)
    if (dayOfMonth > 5) {
      return;
    }
    
    // Get start/end of previous month for billing period
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1); // 1st of previous month
    
    // Get all hospitals that need billing (basic license with payment method)
    const allHospitals = await db.select().from(hospitals);
    
    for (const hospital of allHospitals) {
      // Skip free accounts
      if (hospital.licenseType === 'free') {
        continue;
      }
      
      // Skip test accounts (still in trial, no billing yet)
      if (hospital.licenseType === 'test') {
        continue;
      }
      
      // Skip hospitals without payment method
      if (!hospital.stripePaymentMethodId || !hospital.stripeCustomerId) {
        continue;
      }
      
      // Check if we already have a billing job for this period
      const { billingInvoices } = await import("@shared/schema");
      const existingInvoice = await db
        .select()
        .from(billingInvoices)
        .where(
          and(
            eq(billingInvoices.hospitalId, hospital.id),
            gte(billingInvoices.periodStart, periodStart),
            lt(billingInvoices.periodEnd, periodEnd)
          )
        )
        .limit(1);
      
      if (existingInvoice.length > 0) {
        continue; // Already billed for this period
      }
      
      // Check if there's already a pending billing job
      const lastJob = await storage.getLastScheduledJobForHospital(hospital.id, 'monthly_billing');
      
      if (lastJob) {
        const lastJobDate = new Date(lastJob.scheduledFor);
        // Check if the job is for this billing period (same month)
        if (lastJobDate.getMonth() === now.getMonth() && 
            lastJobDate.getFullYear() === now.getFullYear() &&
            (lastJob.status === 'completed' || lastJob.status === 'pending' || lastJob.status === 'processing')) {
          continue;
        }
      }
      
      // Schedule billing job
      await storage.createScheduledJob({
        jobType: 'monthly_billing',
        hospitalId: hospital.id,
        scheduledFor: now,
        status: 'pending',
      });
      
      console.log(`[Worker] Scheduled monthly billing job for hospital ${hospital.id} (period: ${periodStart.toISOString()} - ${periodEnd.toISOString()})`);
    }
  } catch (error: any) {
    console.error('[Worker] Error scheduling monthly billing jobs:', error);
  }
}

/**
 * Process monthly billing job for a hospital
 * Calculates usage, creates Stripe invoice, and charges the card
 */
async function processMonthlyBilling(job: any): Promise<void> {
  const hospitalId = job.hospitalId;
  console.log(`[Worker] Processing monthly billing for hospital ${hospitalId}`);
  
  try {
    const Stripe = (await import('stripe')).default;
    const { billingInvoices, anesthesiaRecords, surgeries } = await import("@shared/schema");
    
    const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
    
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }
    
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      throw new Error('Hospital not found');
    }
    
    if (!hospital.stripeCustomerId || !hospital.stripePaymentMethodId) {
      throw new Error('Hospital has no payment method configured');
    }
    
    // Calculate billing period (previous month)
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
    
    // Count anesthesia records for the billing period
    const recordCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(anesthesiaRecords)
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          gte(anesthesiaRecords.createdAt, periodStart),
          lt(anesthesiaRecords.createdAt, periodEnd)
        )
      );
    
    const recordCount = Number(recordCountResult[0]?.count || 0);
    
    if (recordCount === 0) {
      // No records, no billing needed
      await storage.updateScheduledJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        results: { message: 'No records for billing period' } as any,
      });
      console.log(`[Worker] No billing needed for hospital ${hospitalId} (0 records)`);
      return;
    }
    
    // Calculate pricing
    // Note: questionnaire and surgery are now included in base fee (no extra charge)
    const basePrice = parseFloat(hospital.pricePerRecord || '6.00');
    const dispocuraAddOn = hospital.addonDispocura ? 1.00 : 0;
    const retellAddOn = hospital.addonRetell ? 1.00 : 0;
    const monitorAddOn = hospital.addonMonitor ? 1.00 : 0;
    
    const pricePerRecord = basePrice + dispocuraAddOn + retellAddOn + monitorAddOn;
    const totalAmount = recordCount * pricePerRecord;
    
    // Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: hospital.stripeCustomerId,
      collection_method: 'charge_automatically',
      auto_advance: true,
      currency: 'chf',
      description: `Viali Usage - ${periodStart.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })}`,
      metadata: {
        hospitalId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        recordCount: recordCount.toString(),
      },
    });
    
    // Add line items
    await stripe.invoiceItems.create({
      customer: hospital.stripeCustomerId,
      invoice: invoice.id,
      quantity: recordCount,
      unit_amount: Math.round(basePrice * 100), // Stripe uses cents
      currency: 'chf',
      description: 'Anesthesia Records (Base)',
    });
    
    // Note: questionnaire is now included in base fee, no separate line item
    
    if (hospital.addonDispocura) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: recordCount,
        unit_amount: Math.round(dispocuraAddOn * 100),
        currency: 'chf',
        description: 'Dispocura Integration Add-on',
      });
    }
    
    if (hospital.addonRetell) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: recordCount,
        unit_amount: Math.round(retellAddOn * 100),
        currency: 'chf',
        description: 'Retell.ai Phone Booking Add-on',
      });
    }
    
    if (hospital.addonMonitor) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: recordCount,
        unit_amount: Math.round(monitorAddOn * 100),
        currency: 'chf',
        description: 'Monitor Camera Connection Add-on',
      });
    }
    
    // Finalize and pay invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    
    // Store invoice record
    await db.insert(billingInvoices).values({
      hospitalId,
      periodStart,
      periodEnd,
      recordCount,
      basePrice: (recordCount * basePrice).toFixed(2),
      questionnairePrice: '0.00', // Included in base fee
      dispocuraPrice: (recordCount * dispocuraAddOn).toFixed(2),
      retellPrice: (recordCount * retellAddOn).toFixed(2),
      monitorPrice: (recordCount * monitorAddOn).toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      currency: 'chf',
      stripeInvoiceId: finalizedInvoice.id,
      stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url || undefined,
      status: finalizedInvoice.status === 'paid' ? 'paid' : 'pending',
      paidAt: finalizedInvoice.status === 'paid' ? new Date() : undefined,
    });
    
    // Update job as completed
    await storage.updateScheduledJob(job.id, {
      status: 'completed',
      completedAt: new Date(),
      processedCount: 1,
      successCount: 1,
      failedCount: 0,
      results: {
        invoiceId: finalizedInvoice.id,
        recordCount,
        totalAmount: totalAmount.toFixed(2),
        status: finalizedInvoice.status,
      } as any,
    });
    
    console.log(`[Worker] Completed billing for hospital ${hospitalId}: ${recordCount} records, ${totalAmount.toFixed(2)} CHF, invoice ${finalizedInvoice.id}`);
    
  } catch (error: any) {
    console.error(`[Worker] Error processing billing for hospital ${hospitalId}:`, error);
    
    await storage.updateScheduledJob(job.id, {
      status: 'failed',
      completedAt: new Date(),
      error: error.message || 'Billing failed',
    });
  }
}

async function checkStuckJobs() {
  try {
    const stuckJobs = await storage.getStuckJobs(STUCK_JOB_THRESHOLD_MINUTES);
    
    if (stuckJobs.length > 0) {
      console.log(`[Worker] Found ${stuckJobs.length} stuck jobs, marking as failed`);
      
      for (const job of stuckJobs) {
        const minutesStuck = Math.round(
          (Date.now() - (job.startedAt?.getTime() || Date.now())) / (1000 * 60)
        );
        
        await storage.updateImportJob(job.id, {
          status: 'failed',
          completedAt: new Date(),
          error: `Job stuck in processing for ${minutesStuck} minutes and was automatically failed`,
        });
        
        console.log(`[Worker] Marked stuck job ${job.id} as failed (was stuck for ${minutesStuck} minutes)`);
      }
    }
  } catch (error: any) {
    console.error('[Worker] Error checking stuck jobs:', error);
  }
}

/**
 * Schedule automatic daily price sync for all hospitals
 * - For hospitals WITH Galexis credentials: Queue a price sync job
 * - For hospitals WITHOUT Galexis: Use HIN database to lookup and update prices
 */
async function scheduleAutoPriceSyncJobs(): Promise<void> {
  try {
    // Get all hospitals
    const allHospitals = await db.select({ id: hospitals.id, name: hospitals.name }).from(hospitals);
    
    for (const hospital of allHospitals) {
      // Check if hospital has a Galexis catalog with credentials
      const galexisCatalogs = await db
        .select()
        .from(supplierCatalogs)
        .where(and(
          eq(supplierCatalogs.hospitalId, hospital.id),
          eq(supplierCatalogs.supplierName, 'Galexis')
        ));
      
      const galexisCatalog = galexisCatalogs[0];
      
      if (galexisCatalog && galexisCatalog.apiPasswordEncrypted && galexisCatalog.customerNumber) {
        // Hospital has Galexis credentials - check if sync is needed
        const hoursSinceSync = galexisCatalog.lastSyncAt 
          ? (Date.now() - new Date(galexisCatalog.lastSyncAt).getTime()) / (1000 * 60 * 60)
          : Infinity;
        
        if (hoursSinceSync >= PRICE_SYNC_MAX_AGE_HOURS) {
          // Check if there's already a queued/processing job for this catalog
          const existingJobs = await db
            .select({ id: priceSyncJobs.id })
            .from(priceSyncJobs)
            .where(and(
              eq(priceSyncJobs.catalogId, galexisCatalog.id),
              or(
                eq(priceSyncJobs.status, 'queued'),
                eq(priceSyncJobs.status, 'processing')
              )
            ))
            .limit(1);
          
          if (existingJobs.length === 0) {
            // Queue a new price sync job
            await storage.createPriceSyncJob({
              catalogId: galexisCatalog.id,
              hospitalId: hospital.id,
              status: 'queued',
              jobType: 'full_sync',
            });
            console.log(`[Worker] Scheduled daily Galexis price sync for hospital "${hospital.name}"`);
          }
        }
      } else {
        // Hospital doesn't have Galexis - use HIN database for price lookup
        await performHinPriceSyncForHospital(hospital.id, hospital.name);
      }
    }
  } catch (error: any) {
    console.error('[Worker] Error in scheduleAutoPriceSyncJobs:', error.message);
  }
}

/**
 * Perform HIN-based price sync for a hospital without Galexis credentials
 * Looks up items by pharmacode/GTIN in the HIN database and updates prices
 */
async function performHinPriceSyncForHospital(hospitalId: string, hospitalName: string): Promise<void> {
  try {
    const { hinClient } = await import('./services/hinMediupdateClient');
    
    // Check if HIN database is available
    const hinStatus = await hinClient.getSyncStatus();
    if (!hinStatus.lastSyncAt) {
      console.log(`[Worker] HIN database not available, skipping price sync for hospital "${hospitalName}"`);
      return;
    }
    
    // Get items with pharmacodes/GTINs that don't have recent price updates
    const hospitalItems = await db
      .select({
        itemId: items.id,
        itemName: items.name,
        pharmacode: itemCodes.pharmacode,
        gtin: itemCodes.gtin,
      })
      .from(items)
      .leftJoin(itemCodes, eq(itemCodes.itemId, items.id))
      .where(and(
        eq(items.hospitalId, hospitalId),
        or(
          isNotNull(itemCodes.pharmacode),
          isNotNull(itemCodes.gtin)
        )
      ));
    
    if (hospitalItems.length === 0) {
      return; // No items with codes to sync
    }
    
    // Check existing supplier codes to see when they were last updated
    const existingHinCodes = await db
      .select({
        id: supplierCodes.id,
        itemId: supplierCodes.itemId,
        lastPriceUpdate: supplierCodes.lastPriceUpdate,
      })
      .from(supplierCodes)
      .innerJoin(items, eq(items.id, supplierCodes.itemId))
      .where(and(
        eq(items.hospitalId, hospitalId),
        eq(supplierCodes.supplierName, 'HIN')
      ));
    
    const hinCodesByItem = new Map(existingHinCodes.map(c => [c.itemId, c]));
    
    let updatedCount = 0;
    let createdCount = 0;
    
    const { parsePackSizeFromDescription: parseHinPackSize } = await import('./services/hinMediupdateClient');
    
    for (const item of hospitalItems) {
      // Skip if item was updated recently (within 24 hours)
      const existingCode = hinCodesByItem.get(item.itemId);
      if (existingCode?.lastPriceUpdate) {
        const hoursSinceUpdate = (Date.now() - new Date(existingCode.lastPriceUpdate).getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate < PRICE_SYNC_MAX_AGE_HOURS) {
          continue;
        }
      }
      
      // Look up in HIN database - try pharmacode first, then GTIN
      const pharmacode = item.pharmacode || undefined;
      const gtin = item.gtin || undefined;
      const lookupCode = pharmacode || gtin;
      
      if (!lookupCode) continue;
      
      const hinResult = await hinClient.lookupByCode(lookupCode);
      
      if (hinResult && hinResult.found && hinResult.article) {
        const basispreis = hinResult.article.pexf;
        const publikumspreis = hinResult.article.ppub;
        
        if (basispreis || publikumspreis) {
          // Parse pack size from HIN description
          const hinPackSize = parseHinPackSize(hinResult.article.descriptionDe);
          
          if (existingCode) {
            // Update existing HIN supplier code
            await db.update(supplierCodes).set({
              basispreis: basispreis ? String(basispreis) : undefined,
              publikumspreis: publikumspreis ? String(publikumspreis) : null,
              lastPriceUpdate: new Date(),
              lastChecked: new Date(),
              matchedProductName: hinResult.article.descriptionDe,
              updatedAt: new Date(),
            }).where(eq(supplierCodes.id, existingCode.id));
            updatedCount++;
          } else {
            // Create new HIN supplier code
            await db.insert(supplierCodes).values({
              id: randomUUID(),
              itemId: item.itemId,
              supplierName: 'HIN',
              articleCode: hinResult.article.pharmacode || pharmacode || gtin || '',
              basispreis: basispreis ? String(basispreis) : undefined,
              publikumspreis: publikumspreis ? String(publikumspreis) : null,
              lastPriceUpdate: new Date(),
              lastChecked: new Date(),
              isPreferred: true,
              matchStatus: 'confirmed',
              matchedProductName: hinResult.article.descriptionDe,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            createdCount++;
          }
          
          // Also update itemCodes with pack size if available and not already set
          if (hinPackSize) {
            const existingItemCode = await db.select({ unitsPerPack: itemCodes.unitsPerPack }).from(itemCodes).where(eq(itemCodes.itemId, item.itemId)).limit(1);
            if (existingItemCode.length > 0 && !existingItemCode[0].unitsPerPack) {
              await db.update(itemCodes).set({ unitsPerPack: hinPackSize, updatedAt: new Date() }).where(eq(itemCodes.itemId, item.itemId));
            }
          }
        }
      }
    }
    
    if (updatedCount > 0 || createdCount > 0) {
      console.log(`[Worker] HIN price sync for "${hospitalName}": updated ${updatedCount}, created ${createdCount} supplier codes`);
    }
  } catch (error: any) {
    console.error(`[Worker] Error in HIN price sync for hospital "${hospitalName}":`, error.message);
  }
}

/**
 * Check and perform HIN MediUpdate database sync if needed
 * This is a shared database (not hospital-specific) used as fallback for hospitals without Galexis
 */
async function checkAndSyncHinDatabase(): Promise<void> {
  try {
    const { hinClient } = await import('./services/hinMediupdateClient');
    const status = await hinClient.getSyncStatus();
    
    if (!status.lastSyncAt) {
      console.log('[Worker] HIN database never synced, triggering initial sync...');
    } else {
      const hoursSinceSync = (Date.now() - new Date(status.lastSyncAt).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceSync < HIN_SYNC_MAX_AGE_HOURS) {
        return;
      }
      
      console.log(`[Worker] HIN database is ${hoursSinceSync.toFixed(1)} hours old, triggering daily sync...`);
    }
    
    if (status.status === 'syncing') {
      console.log('[Worker] HIN sync already in progress, skipping...');
      return;
    }
    
    const result = await hinClient.syncArticles((processed, total) => {
      if (processed % 10000 === 0) {
        console.log(`[Worker] HIN sync progress: ${processed}/${total} articles`);
      }
    });
    
    if (result.success) {
      console.log(`[Worker] HIN sync completed: ${result.articlesCount} articles in ${(result.duration / 1000).toFixed(1)}s`);
    } else {
      console.error(`[Worker] HIN sync failed: ${result.error}`);
    }
  } catch (error: any) {
    console.error('[Worker] Error checking/syncing HIN database:', error.message);
  }
}

async function workerLoop() {
  console.log('[Worker] Starting background worker...');
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms, Stuck job check: ${STUCK_JOB_CHECK_INTERVAL_MS}ms`);
  
  let lastStuckJobCheck = Date.now();
  let lastScheduledJobCheck = Date.now();
  let lastHinSyncCheck = 0; // Check immediately on startup
  let lastPriceSyncCheck = 0; // Check immediately on startup
  
  while (true) {
    try {
      // Check for stuck jobs periodically
      if (Date.now() - lastStuckJobCheck >= STUCK_JOB_CHECK_INTERVAL_MS) {
        await checkStuckJobs();
        lastStuckJobCheck = Date.now();
      }
      
      // Schedule new jobs periodically (every minute)
      if (Date.now() - lastScheduledJobCheck >= SCHEDULED_JOB_CHECK_INTERVAL_MS) {
        await scheduleAutoQuestionnaireJobs();
        await scheduleTimebutlerIcsSyncJobs();
        await scheduleCalcomSyncJobs();
        await schedulePreSurgeryReminderJobs();
        await scheduleMonthlyBillingJobs();
        lastScheduledJobCheck = Date.now();
      }
      
      // Check HIN database sync (every hour, syncs if older than 24 hours)
      if (Date.now() - lastHinSyncCheck >= HIN_SYNC_CHECK_INTERVAL_MS) {
        await checkAndSyncHinDatabase();
        lastHinSyncCheck = Date.now();
      }
      
      // Schedule automatic price sync for all hospitals (every hour, syncs if >24 hours old)
      if (Date.now() - lastPriceSyncCheck >= PRICE_SYNC_CHECK_INTERVAL_MS) {
        await scheduleAutoPriceSyncJobs();
        lastPriceSyncCheck = Date.now();
      }
      
      // Process import jobs
      const processedImport = await processNextImportJob();
      if (processedImport) {
        continue;
      }
      
      // Process price sync jobs
      const processedPriceSync = await processNextPriceSyncJob();
      if (processedPriceSync) {
        continue;
      }
      
      // Process scheduled jobs (auto-questionnaire dispatch, etc.)
      const processedScheduled = await processNextScheduledJob();
      if (processedScheduled) {
        continue;
      }
      
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error: any) {
      console.error('[Worker] Unexpected error in worker loop:', error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

/**
 * Start the background worker.
 * Can be called from main server process or run as standalone.
 */
export function startWorker() {
  console.log('[Worker] Initializing background job processor...');
  workerLoop().catch(error => {
    console.error('[Worker] Fatal error in worker loop:', error);
  });
}

// Check if this file is being run directly (standalone mode)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  process.on('SIGTERM', () => {
    console.log('[Worker] Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('[Worker] Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  workerLoop().catch(error => {
    console.error('[Worker] Fatal error:', error);
    process.exit(1);
  });
}
