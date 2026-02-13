import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  getBulkImportImageLimit,
  requireWriteAccess,
} from "../utils";

const router = Router();

router.post('/api/import-jobs', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { images, hospitalId } = req.body;
    const userId = req.user.id;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ message: "Images array is required" });
    }
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const licenseType = hospital.licenseType || "free";
    const imageLimit = licenseType === "basic" ? 50 : 10;

    if (images.length > imageLimit) {
      return res.status(400).json({
        message: `Maximum ${imageLimit} images allowed for ${licenseType} plan`,
        limit: imageLimit,
        licenseType
      });
    }

    const base64Images = images.map((img: string) => img.replace(/^data:image\/\w+;base64,/, ''));

    const job = await storage.createImportJob({
      hospitalId,
      unitId,
      userId,
      status: 'queued',
      totalImages: base64Images.length,
      processedImages: 0,
      extractedItems: 0,
      imagesData: base64Images,
      results: null,
      error: null,
      notificationSent: false,
    });

    console.log(`[Import Job] Created job ${job.id} with ${base64Images.length} images for user ${userId}`);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    fetch(`${baseUrl}/api/import-jobs/process-next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).catch(err => console.error('[Import Job] Failed to trigger background worker:', err));

    res.status(201).json({
      jobId: job.id,
      status: job.status,
      totalImages: job.totalImages
    });
  } catch (error: any) {
    console.error("Error creating import job:", error);
    res.status(500).json({ message: error.message || "Failed to create import job" });
  }
});

router.get('/api/import-jobs/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const job = await storage.getImportJob(id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.userId !== userId) {
      const unitId = await getUserUnitForHospital(userId, job.hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.json({
      id: job.id,
      status: job.status,
      totalImages: job.totalImages,
      processedImages: job.processedImages,
      currentImage: job.currentImage,
      progressPercent: job.progressPercent,
      extractedItems: job.extractedItems,
      results: job.results,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    console.error("Error getting import job:", error);
    res.status(500).json({ message: error.message || "Failed to get job status" });
  }
});

router.post('/api/import-jobs/process-next', async (req, res) => {
  try {
    const job = await storage.getNextQueuedJob();
    if (!job) {
      return res.json({ message: "No jobs in queue" });
    }

    console.log(`[Import Job Worker] Processing job ${job.id} with ${job.totalImages} images`);

    await storage.updateImportJob(job.id, {
      status: 'processing',
      startedAt: new Date(),
      currentImage: 0,
      progressPercent: 0,
    });

    const { analyzeBulkItemImages } = await import('../openai');
    const extractedItems = await analyzeBulkItemImages(
      job.imagesData as string[],
      async (currentImage, totalImages, progressPercent) => {
        await storage.updateImportJob(job.id, {
          currentImage,
          processedImages: currentImage,
          progressPercent,
        });
        console.log(`[Import Job Worker] Progress: ${currentImage}/${totalImages} (${progressPercent}%)`);
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

    console.log(`[Import Job Worker] Completed job ${job.id}, extracted ${extractedItems.length} items`);

    const user = await storage.getUser(job.userId);
    if (user?.email) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const previewUrl = `${baseUrl}/bulk-import/preview/${job.id}`;
      const { sendBulkImportCompleteEmail } = await import('../resend');
      await sendBulkImportCompleteEmail(
        user.email,
        user.firstName || 'User',
        extractedItems.length,
        previewUrl
      );
      await storage.updateImportJob(job.id, { notificationSent: true });
      console.log(`[Import Job Worker] Sent notification email to ${user.email}`);
    }

    res.json({
      message: "Job processed successfully",
      jobId: job.id,
      itemsExtracted: extractedItems.length
    });
  } catch (error: any) {
    console.error("Error processing job:", error);
    const job = await storage.getNextQueuedJob();
    if (job) {
      await storage.updateImportJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        error: error.message || 'Processing failed',
      });
    }
    res.status(500).json({ message: error.message || "Failed to process job" });
  }
});

export default router;
