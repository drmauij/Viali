import { storage } from './storage';
import { analyzeBulkItemImages } from './openai';
import { sendBulkImportCompleteEmail } from './resend';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const STUCK_JOB_CHECK_INTERVAL_MS = 60000; // Check for stuck jobs every minute
const STUCK_JOB_THRESHOLD_MINUTES = 30; // Jobs stuck for >30 minutes

async function processNextJob() {
  
  try {
    // Get next queued job
    const job = await storage.getNextQueuedJob();
    
    if (!job) {
      return false; // No jobs to process
    }

    console.log(`[Worker] Processing job ${job.id} with ${job.totalImages} images`);

    // Update job status to processing
    await storage.updateImportJob(job.id, {
      status: 'processing',
      startedAt: new Date(),
      currentImage: 0,
      progressPercent: 0,
    });

    try {
      // Process images with progress tracking
      const extractedItems = await analyzeBulkItemImages(
        job.imagesData as string[], 
        async (currentImage, totalImages, progressPercent) => {
          // Update progress in database
          await storage.updateImportJob(job.id, {
            currentImage,
            processedImages: currentImage,
            progressPercent,
          });
          console.log(`[Worker] Job ${job.id}: ${currentImage}/${totalImages} (${progressPercent}%)`);
        }
      );

      // Update job with results
      await storage.updateImportJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        processedImages: job.totalImages,
        currentImage: job.totalImages,
        progressPercent: 100,
        extractedItems: extractedItems.length,
        results: extractedItems,
        imagesData: null, // Clear images to free up space
      });

      console.log(`[Worker] Completed job ${job.id}, extracted ${extractedItems.length} items`);

      // Send email notification
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
          // Don't fail the job if email fails
        }
      }

      return true; // Successfully processed a job
    } catch (processingError: any) {
      console.error(`[Worker] Error processing job ${job.id}:`, processingError);
      
      // Update job status to failed
      await storage.updateImportJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        error: processingError.message || 'Processing failed',
      });
      
      return true; // Processed a job (even though it failed)
    }
  } catch (error: any) {
    console.error('[Worker] Error in processNextJob:', error);
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
      // Check for stuck jobs periodically
      if (Date.now() - lastStuckJobCheck >= STUCK_JOB_CHECK_INTERVAL_MS) {
        await checkStuckJobs();
        lastStuckJobCheck = Date.now();
      }
      
      // Try to process a job
      const processed = await processNextJob();
      
      if (processed) {
        // If we processed a job, immediately check for another one
        // This allows us to process multiple jobs back-to-back
        continue;
      }
      
      // No jobs available, wait before polling again
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error: any) {
      console.error('[Worker] Unexpected error in worker loop:', error);
      // Wait a bit before retrying to avoid rapid error loops
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Worker] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Worker] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the worker
workerLoop().catch(error => {
  console.error('[Worker] Fatal error:', error);
  process.exit(1);
});
