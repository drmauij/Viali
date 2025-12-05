import { storage } from './storage';
import { analyzeBulkItemImages } from './openai';
import { sendBulkImportCompleteEmail } from './resend';
import { createGalexisClient, type PriceData } from './services/galexisClient';
import { supplierCodes, itemCodes, items } from '@shared/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';
import { db } from './storage';

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

      if (catalog.supplierName !== 'Galexis') {
        throw new Error(`Unsupported supplier: ${catalog.supplierName}. Only Galexis is currently supported.`);
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

      console.log(`[Worker] Fetching all prices from Galexis...`);
      const prices = await client.fetchAllPrices((processed, total) => {
        const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        storage.updatePriceSyncJob(job.id, {
          processedItems: processed,
          totalItems: total,
          progressPercent: percent,
        });
      });

      console.log(`[Worker] Fetched ${prices.length} prices, matching with inventory items...`);

      await storage.updatePriceSyncJob(job.id, {
        totalItems: prices.length,
        progressPercent: 50,
      });

      const priceMap = new Map<string, PriceData>();
      for (const price of prices) {
        if (price.articleCode) {
          priceMap.set(price.articleCode, price);
        }
      }

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

      // Get all items from this hospital that have item codes (GTIN/pharmacode)
      // but might not have Galexis supplier codes yet
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

      // Get set of item IDs that already have Galexis codes
      const itemsWithGalexisCode = new Set(existingSupplierCodes.map(c => c.itemId));

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

          if (hasChanges) {
            await db
              .update(supplierCodes)
              .set({
                basispreis: String(priceData.basispreis),
                publikumspreis: String(priceData.publikumspreis),
                lastPriceUpdate: new Date(),
                lastChecked: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(supplierCodes.id, code.id));
            
            updatedCount++;
            console.log(`[Worker] Updated price for item ${code.itemId}: ${code.basispreis} -> ${priceData.basispreis}`);
          } else {
            await db
              .update(supplierCodes)
              .set({
                lastChecked: new Date(),
              })
              .where(eq(supplierCodes.id, code.id));
          }
        }
      }

      // Identify items that have GTIN/pharmacode but no Galexis supplier code
      for (const item of allHospitalItems) {
        if (!itemsWithGalexisCode.has(item.itemId) && (item.gtin || item.pharmacode)) {
          unmatchedWithCodes.push({
            itemId: item.itemId,
            itemName: item.itemName,
            gtin: item.gtin || undefined,
            pharmacode: item.pharmacode || undefined,
          });
        }
      }

      const summary = {
        totalPricesFetched: prices.length,
        totalItemsInHospital: allHospitalItems.length,
        itemsWithSupplierCode: existingSupplierCodes.length,
        matchedItems: matchedCount,
        updatedItems: updatedCount,
        unmatchedSupplierCodes: existingSupplierCodes.length - matchedCount,
        itemsWithoutSupplierCode: allHospitalItems.length - existingSupplierCodes.length,
        itemsWithGtinNoSupplierCode: unmatchedWithCodes.length,
        unmatchedItems: unmatchedWithCodes.slice(0, 50), // First 50 for display
      };

      console.log(`[Worker] Summary: ${matchedCount} matched, ${updatedCount} updated, ${unmatchedWithCodes.length} items with GTIN but no supplier code`);

      await storage.updatePriceSyncJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        totalItems: prices.length,
        processedItems: prices.length,
        matchedItems: matchedCount,
        updatedItems: updatedCount,
        progressPercent: 100,
        summary: JSON.stringify(summary),
      });

      await storage.updateSupplierCatalog(job.catalogId, {
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncMessage: `Synced ${matchedCount} items, updated ${updatedCount} prices`,
      });

      console.log(`[Worker] Completed price sync job ${job.id}: matched ${matchedCount}, updated ${updatedCount}`);

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
