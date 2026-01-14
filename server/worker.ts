import { storage } from './storage';
import { analyzeBulkItemImages } from './openai';
import { sendBulkImportCompleteEmail } from './resend';
import { createGalexisClient, type PriceData, type ProductLookupRequest, type ProductLookupResult } from './services/galexisClient';
import { createPolymedClient, type PolymedPriceData } from './services/polymedClient';
import { batchMatchItems, type ItemToMatch } from './services/polymedMatching';
import { supplierCodes, itemCodes, items, supplierCatalogs, hospitals, patientQuestionnaireLinks, units, users } from '@shared/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
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
        }
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

      // Route to the appropriate sync handler based on supplier
      if (catalog.supplierName === 'Polymed' || catalog.supplierType === 'browser') {
        return await processPolymedSync(job, catalog);
      } else if (catalog.supplierName === 'Galexis') {
        // Continue with Galexis sync below
      } else {
        throw new Error(`Unsupported supplier: ${catalog.supplierName}. Supported: Galexis (API), Polymed (browser).`);
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
        for (const item of itemsToLookup) {
          if (item.pharmacode) {
            lookupRequests.push({ pharmacode: item.pharmacode });
          } else if (item.gtin) {
            lookupRequests.push({ gtin: item.gtin });
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
          for (const result of lookupResults) {
            if (result.found && result.price) {
              priceMap.set(result.pharmacode, result.price);
              if (result.gtin) {
                priceMap.set(result.gtin, result.price);
              }
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
        if (code.articleCode && priceMap.has(code.articleCode)) {
          matchedCount++;
          const priceData = priceMap.get(code.articleCode)!;
          
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
            // Construct catalog URL using pharmacode (dispocura.galexis.com)
            const catalogUrl = code.articleCode ? `https://dispocura.galexis.com/app#/articles/${code.articleCode}` : undefined;
            
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
            
            // Also update item description if we have a product name from Galexis
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
            // Construct catalog URL using pharmacode (dispocura.galexis.com)
            const catalogUrl = code.articleCode ? `https://dispocura.galexis.com/app#/articles/${code.articleCode}` : undefined;
            
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
            
            // Also update item description if we have a product name from Galexis and item has no description
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
            // First, demote any other preferred suppliers for this item
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
          } else {
            // Has codes but no match found
            unmatchedWithCodes.push({
              itemId: item.itemId,
              itemName: item.itemName,
              gtin: gtin || undefined,
              pharmacode: pharmacode || undefined,
            });
          }
        }
      }

      const summary = {
        syncMethod: 'productAvailability',
        totalItemsLookedUp: itemsToLookup.length,
        totalPricesFound: priceMap.size,
        totalItemsInHospital: allHospitalItems.length,
        itemsWithSupplierCode: existingSupplierCodes.length + autoCreatedCount,
        matchedItems: matchedCount + autoMatchedCount,
        updatedItems: updatedCount,
        autoMatchedByPharmacode: autoMatchedCount,
        autoCreatedSupplierCodes: autoCreatedCount,
        unmatchedSupplierCodes: existingSupplierCodes.length - matchedCount,
        itemsWithoutSupplierCode: allHospitalItems.length - existingSupplierCodes.length - autoCreatedCount,
        itemsWithGtinNoSupplierCode: unmatchedWithCodes.length,
        unmatchedItems: unmatchedWithCodes.slice(0, 50),
        galexisApiDebug: galexisDebugInfo || null,
      };

      console.log(`[Worker] Summary: ${matchedCount} existing matched, ${updatedCount} updated, ${autoMatchedCount} auto-matched, ${unmatchedWithCodes.length} items still unmatched`);

      await storage.updatePriceSyncJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        totalItems: itemsToLookup.length,
        processedItems: itemsToLookup.length,
        matchedItems: matchedCount + autoMatchedCount,
        updatedItems: updatedCount,
        progressPercent: 100,
        summary: JSON.stringify(summary),
      });

      const syncMessage = autoMatchedCount > 0 
        ? `Matched ${matchedCount + autoMatchedCount} items (${autoMatchedCount} auto-matched), updated ${updatedCount} prices`
        : `Matched ${matchedCount} items, updated ${updatedCount} prices`;

      await storage.updateSupplierCatalog(job.catalogId, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncMessage: syncMessage,
      });

      console.log(`[Worker] Completed price sync job ${job.id}: matched ${matchedCount + autoMatchedCount}, updated ${updatedCount}`);

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

async function processPolymedSync(job: any, catalog: any): Promise<boolean> {
  console.log(`[Worker] Starting Polymed browser sync for catalog ${catalog.id}`);
  
  try {
    // Validate credentials
    if (!catalog.browserUsername || !catalog.apiPassword) {
      throw new Error('Polymed credentials not configured. Please enter username and password in Supplier settings.');
    }

    const password = catalog.apiPassword;
    const loginUrl = catalog.browserLoginUrl || 'https://shop.polymed.ch/de';

    // Create Polymed client
    const client = createPolymedClient(catalog.browserUsername, password, loginUrl);
    
    // Try to restore session if available
    if (catalog.browserSessionEncrypted) {
      console.log('[Worker] Attempting to restore Polymed session...');
      const sessionRestored = await client.restoreSession(catalog.browserSessionEncrypted);
      
      if (!sessionRestored) {
        console.log('[Worker] Session expired, performing fresh login...');
        const loginResult = await client.login();
        
        if (!loginResult.success) {
          throw new Error(`Polymed login failed: ${loginResult.message}`);
        }
        
        // Save the new session
        if (loginResult.session) {
          await db
            .update(supplierCatalogs)
            .set({
              browserSessionEncrypted: loginResult.session,
              browserLastLogin: new Date(),
            })
            .where(eq(supplierCatalogs.id, catalog.id));
        }
      }
    } else {
      console.log('[Worker] No existing session, performing login...');
      const loginResult = await client.login();
      
      if (!loginResult.success) {
        throw new Error(`Polymed login failed: ${loginResult.message}`);
      }
      
      // Save session
      if (loginResult.session) {
        await db
          .update(supplierCatalogs)
          .set({
            browserSessionEncrypted: loginResult.session,
            browserLastLogin: new Date(),
          })
          .where(eq(supplierCatalogs.id, catalog.id));
      }
    }

    console.log('[Worker] Polymed login successful, fetching hospital items...');

    // Get all items from this hospital with their codes
    const allHospitalItems = await db
      .select({
        itemId: items.id,
        itemName: items.name,
        description: items.description,
        gtin: itemCodes.gtin,
        pharmacode: itemCodes.pharmacode,
        manufacturer: itemCodes.manufacturer,
      })
      .from(items)
      .leftJoin(itemCodes, eq(itemCodes.itemId, items.id))
      .where(eq(items.hospitalId, catalog.hospitalId));

    const totalItems = allHospitalItems.length;
    console.log(`[Worker] Found ${totalItems} items in hospital to sync`);

    await storage.updatePriceSyncJob(job.id, {
      totalItems,
      progressPercent: 10,
    });

    // Prepare items for matching
    const itemsToMatch: ItemToMatch[] = allHospitalItems.map(item => ({
      id: item.itemId,
      name: item.itemName,
      description: item.description,
      pharmacode: item.pharmacode,
      gtin: item.gtin,
      manufacturer: item.manufacturer,
    }));

    // Search function wrapper for batch matching
    const searchFunction = async (query: string): Promise<PolymedPriceData[]> => {
      const result = await client.searchByCode(query);
      return result.products;
    };

    // Batch match items with progress updates
    console.log('[Worker] Starting batch matching...');
    const matchResults = await batchMatchItems(
      itemsToMatch,
      searchFunction,
      (current, total, itemName) => {
        const percent = Math.round((current / total) * 80) + 10; // 10-90%
        storage.updatePriceSyncJob(job.id, {
          processedItems: current,
          progressPercent: percent,
        });
        if (current % 10 === 0) {
          console.log(`[Worker] Processed ${current}/${total} items`);
        }
      }
    );

    // Build a lookup map for item names (before closing browser, as we might need to fetch product details)
    const itemNameMap = new Map<string, string>();
    for (const item of allHospitalItems) {
      itemNameMap.set(item.itemId, item.itemName);
    }

    // Process match results and update database
    let matchedCount = 0;
    let updatedCount = 0;
    let pricesFetched = 0;
    let itemCodesUpdated = 0;

    for (const result of matchResults) {
      if (result.matchedProduct && result.confidence >= 0.6) {
        matchedCount++;
        
        // Get the original item name
        const searchedName = itemNameMap.get(result.itemId) || '';
        let matchedProductName = result.matchedProduct.productName || '';
        let price = result.matchedProduct.price;
        let extractedPharmacode: string | undefined;
        let extractedGtin: string | undefined;
        let extractedManufacturer: string | undefined;
        
        // Extract product metadata using API-based method (faster and more reliable than DOM scraping)
        // Note: Polymed API does NOT return prices - use Galexis for price lookups
        const pmcCode = result.matchedProduct.articleCode;
        if (pmcCode) {
          try {
            console.log(`[Worker] Fetching product metadata via API for PMC ${pmcCode}: ${matchedProductName}`);
            const metadata = await client.getProductMetadataByPmcCode(pmcCode);
            if (metadata) {
              // Extract identifiers from API response
              extractedPharmacode = metadata.pharmacode;
              extractedGtin = metadata.gtin;
              // Note: Polymed API doesn't return prices - they must be looked up via Galexis
              console.log(`[Worker] Extracted from Polymed API: pharmacode=${extractedPharmacode}, gtin=${extractedGtin}`);
            }
          } catch (e) {
            console.error(`[Worker] Failed to fetch product metadata via API, falling back to DOM:`, e);
            
            // Fallback to DOM scraping for older products or when API fails
            if (result.matchedProduct.catalogUrl) {
              try {
                const details = await client.getProductDetails(result.matchedProduct.catalogUrl);
                if (details) {
                  extractedPharmacode = details.pharmacode;
                  extractedGtin = details.gtin;
                  extractedManufacturer = details.manufacturer;
                }
              } catch (domError) {
                console.error(`[Worker] DOM fallback also failed:`, domError);
              }
            }
          }
        } else if (result.matchedProduct.catalogUrl) {
          // No PMC code available, use DOM fallback
          try {
            console.log(`[Worker] Fetching product details via DOM for: ${matchedProductName}`);
            const details = await client.getProductDetails(result.matchedProduct.catalogUrl);
            if (details) {
              extractedPharmacode = details.pharmacode;
              extractedGtin = details.gtin;
              extractedManufacturer = details.manufacturer;
            }
          } catch (e) {
            console.error(`[Worker] Failed to fetch product details:`, e);
          }
        }
        
        // Update item_codes with extracted identifiers (if not already set or matching)
        if (extractedPharmacode || extractedGtin || extractedManufacturer) {
          const existingItemCode = await db.query.itemCodes.findFirst({
            where: eq(itemCodes.itemId, result.itemId),
          });
          
          if (existingItemCode) {
            // Check for conflicts before updating
            const hasPharmacodeConflict = existingItemCode.pharmacode && extractedPharmacode && 
              existingItemCode.pharmacode !== extractedPharmacode;
            const hasGtinConflict = existingItemCode.gtin && extractedGtin && 
              existingItemCode.gtin !== extractedGtin;
            
            if (hasPharmacodeConflict || hasGtinConflict) {
              // Log conflict but don't overwrite - mark for review
              console.warn(`[Worker] Identifier conflict for item ${result.itemId}: ` +
                `existing pharmacode=${existingItemCode.pharmacode} vs extracted=${extractedPharmacode}, ` +
                `existing gtin=${existingItemCode.gtin} vs extracted=${extractedGtin}`);
              // We'll mark the supplier code as needs_review later
            } else {
              // Safe to update - only fill in missing fields
              const updateData: any = { updatedAt: new Date() };
              if (!existingItemCode.pharmacode && extractedPharmacode) {
                updateData.pharmacode = extractedPharmacode;
              }
              if (!existingItemCode.gtin && extractedGtin) {
                updateData.gtin = extractedGtin;
              }
              if (!existingItemCode.manufacturer && extractedManufacturer) {
                updateData.manufacturer = extractedManufacturer;
              }
              
              if (Object.keys(updateData).length > 1) { // More than just updatedAt
                await db
                  .update(itemCodes)
                  .set(updateData)
                  .where(eq(itemCodes.id, existingItemCode.id));
                itemCodesUpdated++;
                console.log(`[Worker] Updated item_codes for item ${result.itemId} with extracted identifiers`);
              }
            }
          } else {
            // Create new item_codes record
            await db.insert(itemCodes).values({
              itemId: result.itemId,
              pharmacode: extractedPharmacode || null,
              gtin: extractedGtin || null,
              manufacturer: extractedManufacturer || null,
            });
            itemCodesUpdated++;
            console.log(`[Worker] Created item_codes for item ${result.itemId}`);
          }
        }
        
        // Check if any supplier code already exists for this item (to determine isPreferred)
        const existingAnySuppierCode = await db.query.supplierCodes.findFirst({
          where: and(
            eq(supplierCodes.itemId, result.itemId),
            eq(supplierCodes.isPreferred, true)
          ),
        });
        
        // Polymed becomes preferred if no other supplier is currently preferred
        const shouldBePreferred = !existingAnySuppierCode;
        
        // Check if Polymed supplier code already exists
        const existingCode = await db.query.supplierCodes.findFirst({
          where: and(
            eq(supplierCodes.itemId, result.itemId),
            eq(supplierCodes.supplierName, 'Polymed')
          ),
        });

        const priceValue = String(price);

        if (existingCode) {
          // Update existing supplier code
          if (existingCode.basispreis !== priceValue) {
            await db
              .update(supplierCodes)
              .set({
                basispreis: priceValue,
                publikumspreis: priceValue,
                articleCode: result.matchedProduct.articleCode || existingCode.articleCode,
                catalogUrl: result.matchedProduct.catalogUrl,
                matchConfidence: String(result.confidence),
                matchStatus: result.confidence >= 0.9 ? 'confirmed' : 'pending',
                lastPriceUpdate: new Date(),
                lastChecked: new Date(),
                updatedAt: new Date(),
                lastSyncJobId: job.id,
                matchReason: result.matchReason,
                searchedName,
                matchedProductName,
                isPreferred: shouldBePreferred || existingCode.isPreferred, // Keep preferred if already set
              })
              .where(eq(supplierCodes.id, existingCode.id));
            
            updatedCount++;
          } else {
            await db
              .update(supplierCodes)
              .set({
                lastChecked: new Date(),
                lastSyncJobId: job.id,
                matchReason: result.matchReason,
                searchedName,
                matchedProductName,
              })
              .where(eq(supplierCodes.id, existingCode.id));
          }
        } else {
          // Create new supplier code - set as preferred if no other preferred supplier exists
          await db.insert(supplierCodes).values({
            itemId: result.itemId,
            supplierName: 'Polymed',
            articleCode: result.matchedProduct.articleCode || '',
            catalogUrl: result.matchedProduct.catalogUrl,
            basispreis: priceValue,
            publikumspreis: priceValue,
            currency: 'CHF',
            matchConfidence: String(result.confidence),
            matchStatus: result.confidence >= 0.9 ? 'confirmed' : 'pending',
            lastPriceUpdate: new Date(),
            lastChecked: new Date(),
            lastSyncJobId: job.id,
            matchReason: result.matchReason,
            searchedName,
            matchedProductName,
            isPreferred: shouldBePreferred,
          });
          
          updatedCount++;
        }
      }
    }

    // Close browser after all product detail fetching is done
    await client.close();

    const summary = {
      totalItemsSearched: totalItems,
      matchedItems: matchedCount,
      updatedItems: updatedCount,
      itemCodesUpdated,
      pricesFetched,
      unmatchedItems: totalItems - matchedCount,
      note: 'Polymed API provides product identifiers (pharmacode/GTIN) only. Use Galexis sync for price lookups.',
      matchResults: matchResults
        .filter(r => r.confidence >= 0.6)
        .slice(0, 20)
        .map(r => ({
          itemId: r.itemId,
          confidence: r.confidence,
          reason: r.matchReason,
          strategy: r.searchStrategy,
        })),
    };

    console.log(`[Worker] Polymed sync complete: ${matchedCount} matched, ${updatedCount} supplier codes updated, ${itemCodesUpdated} item codes enriched with identifiers`);

    await storage.updatePriceSyncJob(job.id, {
      status: 'completed',
      completedAt: new Date(),
      totalItems,
      processedItems: totalItems,
      matchedItems: matchedCount,
      updatedItems: updatedCount,
      progressPercent: 100,
      summary: JSON.stringify(summary),
    });

    await storage.updateSupplierCatalog(job.catalogId, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncMessage: `Synced ${matchedCount} items, enriched ${itemCodesUpdated} items with identifiers (use Galexis for prices)`,
    });

    return true;

  } catch (error: any) {
    console.error(`[Worker] Polymed sync error:`, error);
    
    await storage.updatePriceSyncJob(job.id, {
      status: 'failed',
      completedAt: new Date(),
      error: error.message || 'Polymed sync failed',
    });

    await storage.updateSupplierCatalog(job.catalogId, {
      lastSyncAt: new Date(),
      lastSyncStatus: 'failed',
      lastSyncMessage: error.message || 'Sync failed',
    });

    return true;
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
      } else if (job.jobType === 'pre_surgery_reminder') {
        await processPreSurgeryReminder(job);
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
  unitId: string | null
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
  unitId: string | null
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
      
      // Try email first, fall back to SMS
      let sendSuccess = false;
      let usedMethod: 'email' | 'sms' = 'email';
      
      if (hasEmail) {
        const emailResult = await sendQuestionnaireEmail(
          linkToken,
          surgery.patientEmail!,
          patientName,
          hospitalId,
          null // No specific unit for auto-dispatch
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
          null
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
        
        absences.push({
          providerId: user.id,
          hospitalId: job.hospitalId,
          absenceType,
          startDate: startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate,
          endDate: endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate,
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
 * This runs periodically (every 6 hours) to keep absences in sync
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
        
        // Skip if we have a pending/processing job or if last job was less than 6 hours ago
        if (lastJob.status === 'pending' || lastJob.status === 'processing' || hoursSinceLastJob < 6) {
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
        
        // Only schedule a new job if at least 6 hours have passed
        if (hoursSinceLastJob < 6 && (lastJob.status === 'completed' || lastJob.status === 'pending' || lastJob.status === 'processing')) {
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
      // Format surgery time for display
      const surgeryDate = new Date(surgery.scheduledStartTime);
      const surgeryTimeStr = surgeryDate.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      
      // Fasting instructions in German/English bilingual format
      const fastingInstructionsDe = 'Nüchternheitsregeln: Keine feste Nahrung ab 6 Stunden vor der OP. Klare Flüssigkeiten (Wasser, Tee ohne Milch) bis 2 Stunden vorher erlaubt.';
      const fastingInstructionsEn = 'Fasting rules: No solid food 6 hours before surgery. Clear liquids (water, tea without milk) allowed until 2 hours before.';
      
      let sendSuccess = false;
      let usedMethod: 'sms' | 'email' = 'sms';
      
      // Try SMS first (preferred for urgent reminders)
      if (hasPhone && isSmsConfigured()) {
        const smsMessage = `${hospitalName}: Erinnerung an Ihre OP morgen um ${surgeryTimeStr}.\n\n${fastingInstructionsDe}\n\n---\n\nReminder: Your surgery tomorrow at ${surgeryTimeStr}.\n\n${fastingInstructionsEn}`;
        
        const smsResult = await sendSms(surgery.patientPhone!, smsMessage, hospitalId);
        
        if (smsResult.success) {
          sendSuccess = true;
          usedMethod = 'sms';
          console.log(`[Worker] Pre-surgery reminder SMS sent to ${patientName}`);
        }
      }
      
      // Fallback to email if SMS failed or not available
      if (!sendSuccess && hasEmail) {
        const emailResult = await sendPreSurgeryReminderEmail(
          surgery.patientEmail!,
          patientName,
          hospitalName,
          surgeryTimeStr,
          surgeryDate
        );
        
        if (emailResult.success) {
          sendSuccess = true;
          usedMethod = 'email';
          console.log(`[Worker] Pre-surgery reminder email sent to ${patientName}`);
        }
      }
      
      if (sendSuccess) {
        // Mark as reminded
        await storage.markSurgeryReminderSent(surgery.surgeryId);
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
 */
async function sendPreSurgeryReminderEmail(
  patientEmail: string,
  patientName: string,
  hospitalName: string,
  surgeryTimeStr: string,
  surgeryDate: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@viali.ch';
    const dateStrDe = surgeryDate.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dateStrEn = surgeryDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Erinnerung an Ihre OP / Surgery Reminder</h2>
        
        <div style="margin-bottom: 20px;">
          <p>Liebe(r) ${patientName},</p>
          <p>Dies ist eine Erinnerung an Ihre geplante Operation:</p>
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">
            ${dateStrDe} um ${surgeryTimeStr}<br/>
            ${hospitalName}
          </p>
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #92400e;">Wichtige Nüchternheitsregeln / Fasting Rules</h3>
          <ul style="margin-bottom: 0;">
            <li><strong>6 Stunden vor der OP:</strong> Keine feste Nahrung</li>
            <li><strong>2 Stunden vor der OP:</strong> Keine Flüssigkeiten (auch kein Wasser)</li>
            <li>Klare Flüssigkeiten (Wasser, Tee ohne Milch) sind bis 2 Stunden vorher erlaubt</li>
          </ul>
        </div>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;" />
        
        <div style="margin-bottom: 20px;">
          <p>Dear ${patientName},</p>
          <p>This is a reminder of your scheduled surgery:</p>
          <p style="font-size: 18px; font-weight: bold; color: #1e40af;">
            ${dateStrEn} at ${surgeryTimeStr}<br/>
            ${hospitalName}
          </p>
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #92400e;">Important Fasting Rules</h3>
          <ul style="margin-bottom: 0;">
            <li><strong>6 hours before surgery:</strong> No solid food</li>
            <li><strong>2 hours before surgery:</strong> No liquids (including water)</li>
            <li>Clear liquids (water, tea without milk) are allowed until 2 hours before</li>
          </ul>
        </div>
        
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

async function workerLoop() {
  console.log('[Worker] Starting background worker...');
  console.log(`[Worker] Poll interval: ${POLL_INTERVAL_MS}ms, Stuck job check: ${STUCK_JOB_CHECK_INTERVAL_MS}ms`);
  
  let lastStuckJobCheck = Date.now();
  let lastScheduledJobCheck = Date.now();
  
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
        await schedulePreSurgeryReminderJobs();
        lastScheduledJobCheck = Date.now();
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
