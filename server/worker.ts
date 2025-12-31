import { storage } from './storage';
import { analyzeBulkItemImages } from './openai';
import { sendBulkImportCompleteEmail } from './resend';
import { createGalexisClient, type PriceData, type ProductLookupRequest, type ProductLookupResult } from './services/galexisClient';
import { createPolymedClient, type PolymedPriceData } from './services/polymedClient';
import { batchMatchItems, type ItemToMatch } from './services/polymedMatching';
import { supplierCodes, itemCodes, items, supplierCatalogs } from '@shared/schema';
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import { db } from './storage';
import { decryptCredential } from './utils/encryption';
import { randomUUID } from 'crypto';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const STUCK_JOB_CHECK_INTERVAL_MS = 60000; // Check for stuck jobs every minute
const STUCK_JOB_THRESHOLD_MINUTES = 30; // Jobs stuck for >30 minutes

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
            await db
              .update(supplierCodes)
              .set({
                basispreis: String(priceData.basispreis),
                publikumspreis: String(priceData.publikumspreis),
                lastPriceUpdate: new Date(),
                lastChecked: new Date(),
                updatedAt: new Date(),
                isPreferred: true,
              })
              .where(eq(supplierCodes.id, code.id));
            
            updatedCount++;
            console.log(`[Worker] Updated price for item ${code.itemId}: ${code.basispreis} -> ${priceData.basispreis}`);
          } else {
            await db
              .update(supplierCodes)
              .set({
                lastChecked: new Date(),
                isPreferred: true,
              })
              .where(eq(supplierCodes.id, code.id));
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
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              
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
        
        // If price is 0 OR we want to extract pharmacode/GTIN, fetch the product details page
        if (result.matchedProduct.catalogUrl) {
          try {
            console.log(`[Worker] Fetching product details for: ${matchedProductName}`);
            const details = await client.getProductDetails(result.matchedProduct.catalogUrl);
            if (details) {
              if (details.price > 0 && price === 0) {
                price = details.price;
                pricesFetched++;
                console.log(`[Worker] Got price from product page: CHF ${price}`);
              }
              // Extract identifiers from product page
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

    console.log(`[Worker] Polymed sync complete: ${matchedCount} matched, ${updatedCount} updated, ${pricesFetched} prices fetched, ${itemCodesUpdated} item codes updated`);

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
      lastSyncMessage: `Synced ${matchedCount} items, updated ${updatedCount} prices via browser (${pricesFetched} from detail pages)`,
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
  
  while (true) {
    try {
      if (Date.now() - lastStuckJobCheck >= STUCK_JOB_CHECK_INTERVAL_MS) {
        await checkStuckJobs();
        lastStuckJobCheck = Date.now();
      }
      
      const processedImport = await processNextImportJob();
      if (processedImport) {
        continue;
      }
      
      const processedPriceSync = await processNextPriceSyncJob();
      if (processedPriceSync) {
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
