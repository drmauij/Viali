import { Router } from "express";
import type { Request } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import { requireBillingSetup } from "../../utils/licensing";
import {
  insertAnesthesiaRecordSchema,
  updateSignInDataSchema,
  updateTimeOutDataSchema,
  updateSignOutDataSchema,
  updatePostOpDataSchema,
  updateSurgeryStaffSchema,
  updateIntraOpDataSchema,
  updateCountsSterileDataSchema,
  anesthesiaRecordMedications,
  medicationConfigs,
  items,
} from "@shared/schema";
import { z } from "zod";
import { requireWriteAccess, requireStrictHospitalAccess } from "../../utils";
import { broadcastAnesthesiaUpdate } from "../../socket";
import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import logger from "../../logger";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

router.get('/api/anesthesia/records/surgery/:surgeryId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;

    const surgery = await storage.getSurgery(surgeryId);

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const record = await storage.getAnesthesiaRecord(surgeryId);
    
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    res.json(record);
  } catch (error) {
    logger.error("Error fetching anesthesia record:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia record" });
  }
});

router.get('/api/anesthesia/records/surgery/:surgeryId/all', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;

    const surgery = await storage.getSurgery(surgeryId);

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const records = await storage.getAllAnesthesiaRecordsForSurgery(surgeryId);
    
    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const counts = await storage.getAnesthesiaRecordDataCounts(record.id);
        return {
          ...record,
          dataCounts: counts,
          totalDataPoints: counts.vitals + counts.medications + counts.events,
        };
      })
    );

    res.json(enrichedRecords);
  } catch (error) {
    logger.error("Error fetching all anesthesia records for surgery:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia records" });
  }
});

router.get('/api/anesthesia/records/:id', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    res.json(record);
  } catch (error) {
    logger.error("Error fetching anesthesia record:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia record" });
  }
});

router.post('/api/anesthesia/records', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, requireBillingSetup, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertAnesthesiaRecordSchema.parse(req.body);

    const surgery = await storage.getSurgery(validatedData.surgeryId);

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const existingRecord = await storage.getAnesthesiaRecord(validatedData.surgeryId);
    if (existingRecord) {
      logger.info(`[ANESTHESIA] Returning existing record ${existingRecord.id} for surgery ${validatedData.surgeryId} (preventing duplicate)`);
      return res.status(200).json(existingRecord);
    }

    const newRecord = await storage.createAnesthesiaRecord(validatedData);
    logger.info(`[ANESTHESIA] Created new record ${newRecord.id} for surgery ${validatedData.surgeryId}`);
    
    res.status(201).json(newRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating anesthesia record:", error);
    res.status(500).json({ message: "Failed to create anesthesia record" });
  }
});

router.patch('/api/anesthesia/records/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const updatedRecord = await storage.updateAnesthesiaRecord(id, req.body);
    
    res.json(updatedRecord);
  } catch (error) {
    logger.error("Error updating anesthesia record:", error);
    res.status(500).json({ message: "Failed to update anesthesia record" });
  }
});

router.delete('/api/anesthesia/records/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const allRecords = await storage.getAllAnesthesiaRecordsForSurgery(record.surgeryId);
    if (allRecords.length <= 1) {
      return res.status(400).json({ 
        message: "Cannot delete the only anesthesia record for this surgery. At least one record must remain." 
      });
    }

    const counts = await storage.getAnesthesiaRecordDataCounts(id);
    logger.info(`[ANESTHESIA] Deleting duplicate record ${id} for surgery ${record.surgeryId} (vitals: ${counts.vitals}, meds: ${counts.medications}, events: ${counts.events})`);

    await storage.deleteAnesthesiaRecord(id);
    
    res.json({ message: "Anesthesia record deleted successfully" });
  } catch (error) {
    logger.error("Error deleting anesthesia record:", error);
    res.status(500).json({ message: "Failed to delete anesthesia record" });
  }
});

router.patch('/api/anesthesia/records/:id/time-markers', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { timeMarkers } = req.body;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const updateData: { timeMarkers: any; isLocked?: boolean; lockedAt?: Date | null } = { timeMarkers };
    
    const hasValidTime = (marker: any): boolean => {
      if (!marker?.time) return false;
      const timeValue = typeof marker.time === 'string' ? Date.parse(marker.time) : marker.time;
      return typeof timeValue === 'number' && !isNaN(timeValue) && timeValue > 0;
    };
    
    if (Array.isArray(timeMarkers)) {
      const existingTimeMarkers = record.timeMarkers as any[] | null;
      const previousP = Array.isArray(existingTimeMarkers) 
        ? existingTimeMarkers.find((m: any) => m.code === 'P')
        : null;
      const previousPHasTime = hasValidTime(previousP);
      
      const newP = timeMarkers.find((m: any) => m.code === 'P');
      
      if (newP !== undefined) {
        const newPHasTime = hasValidTime(newP);
        
        logger.info(`[TIME-MARKERS] P (PACU End) comparison for record ${id}:`, {
          previousPHasTime,
          newPHasTime,
          previousPTime: previousP?.time,
          newPTime: newP?.time,
          previousPRaw: JSON.stringify(previousP),
          newPRaw: JSON.stringify(newP),
          currentIsLocked: record.isLocked,
        });
        
        if (newPHasTime && !previousPHasTime) {
          updateData.isLocked = true;
          updateData.lockedAt = new Date();
          logger.info(`[TIME-MARKERS] P (PACU End) marker set for record ${id} - LOCKING record`);
        } else if (!newPHasTime && previousPHasTime) {
          updateData.isLocked = false;
          updateData.lockedAt = null;
          logger.info(`[TIME-MARKERS] P (PACU End) marker cleared for record ${id} - UNLOCKING record`);
        } else if (newPHasTime && previousPHasTime && !record.isLocked) {
          updateData.isLocked = true;
          updateData.lockedAt = new Date();
          logger.info(`[TIME-MARKERS] P marker already set but record not locked for ${id} - REPAIRING: locking record`);
        } else {
          logger.info(`[TIME-MARKERS] P marker status unchanged for record ${id} - no lock change (both have time: ${newPHasTime && previousPHasTime}, both empty: ${!newPHasTime && !previousPHasTime})`);
        }
        logger.info(`[TIME-MARKERS] Update data for record ${id}:`, {
          willUpdateIsLocked: 'isLocked' in updateData,
          newIsLocked: updateData.isLocked,
        });
      }
    }

    const updatedRecord = await storage.updateAnesthesiaRecord(id, updateData);
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'timeMarkers',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    logger.error("Error updating time markers:", error);
    res.status(500).json({ message: "Failed to update time markers" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/sign-in', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateSignInDataSchema.parse(req.body);

    const signInData = {
      ...validated,
      completedAt: Date.now(),
      completedBy: userId,
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { signInData });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'checklists',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating sign in checklist:", error);
    res.status(500).json({ message: "Failed to update sign in checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/time-out', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateTimeOutDataSchema.parse(req.body);

    const timeOutData = {
      ...validated,
      completedAt: Date.now(),
      completedBy: userId,
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { timeOutData });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'checklists',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating time out checklist:", error);
    res.status(500).json({ message: "Failed to update time out checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/sign-out', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateSignOutDataSchema.parse(req.body);

    const signOutData = {
      ...validated,
      completedAt: Date.now(),
      completedBy: userId,
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { signOutData });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'checklists',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating sign out checklist:", error);
    res.status(500).json({ message: "Failed to update sign out checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/postop', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updatePostOpDataSchema.parse(req.body);

    const mergedPostOpData = {
      ...(record.postOpData ?? {}),
      ...validated,
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { postOpData: mergedPostOpData });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating post-op data:", error);
    res.status(500).json({ message: "Failed to update post-op data" });
  }
});

router.patch('/api/anesthesia/records/:id/surgery-staff', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateSurgeryStaffSchema.parse(req.body);

    const mergedSurgeryStaff = {
      ...(record.surgeryStaff ?? {}),
      ...validated,
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { surgeryStaff: mergedSurgeryStaff });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'surgeryStaff',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating surgery staff data:", error);
    res.status(500).json({ message: "Failed to update surgery staff data" });
  }
});

router.patch('/api/anesthesia/records/:id/intra-op', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateIntraOpDataSchema.parse(req.body);

    const existingData = record.intraOpData ?? {};
    const mergedIntraOpData = {
      ...existingData,
      ...validated,
      positioning: { ...(existingData.positioning ?? {}), ...(validated.positioning ?? {}) },
      disinfection: { ...(existingData.disinfection ?? {}), ...(validated.disinfection ?? {}) },
      equipment: { 
        ...(existingData.equipment ?? {}), 
        ...(validated.equipment ?? {}),
        pathology: {
          ...((existingData.equipment as any)?.pathology ?? {}),
          ...((validated.equipment as any)?.pathology ?? {}),
        },
      },
      irrigationMeds: { ...(existingData.irrigationMeds ?? {}), ...(validated.irrigationMeds ?? {}) },
      irrigation: { ...(existingData.irrigation ?? {}), ...(validated.irrigation ?? {}) },
      infiltration: { ...(existingData.infiltration ?? {}), ...(validated.infiltration ?? {}) },
      medications: { ...(existingData.medications ?? {}), ...(validated.medications ?? {}) },
      dressing: { ...(existingData.dressing ?? {}), ...(validated.dressing ?? {}) },
      drainage: { ...(existingData.drainage ?? {}), ...(validated.drainage ?? {}) },
      co2Pressure: { ...(existingData.co2Pressure ?? {}), ...(validated.co2Pressure ?? {}) },
      tourniquet: { ...(existingData.tourniquet ?? {}), ...(validated.tourniquet ?? {}) },
      signatures: { ...(existingData.signatures ?? {}), ...(validated.signatures ?? {}) },
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { intraOpData: mergedIntraOpData });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'intraOp',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating intra-op data:", error);
    res.status(500).json({ message: "Failed to update intra-op data" });
  }
});

router.patch('/api/anesthesia/records/:id/counts-sterile', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const validated = updateCountsSterileDataSchema.parse(req.body);

    const existingData = record.countsSterileData ?? {};
    const mergedCountsSterileData = {
      ...existingData,
      ...validated,
      surgicalCounts: validated.surgicalCounts !== undefined ? validated.surgicalCounts : existingData.surgicalCounts,
      sterileItems: validated.sterileItems !== undefined ? validated.sterileItems : existingData.sterileItems,
      stickerDocs: validated.stickerDocs !== undefined ? validated.stickerDocs : existingData.stickerDocs,
      sutures: { ...(existingData.sutures ?? {}), ...(validated.sutures ?? {}) },
      signatures: { ...(existingData.signatures ?? {}), ...(validated.signatures ?? {}) },
    };

    const updatedRecord = await storage.updateAnesthesiaRecord(id, { countsSterileData: mergedCountsSterileData });
    
    broadcastAnesthesiaUpdate({
      recordId: id,
      section: 'countsSterile',
      data: updatedRecord,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation error", errors: error.errors });
    }
    logger.error("Error updating counts-sterile data:", error);
    res.status(500).json({ message: "Failed to update counts-sterile data" });
  }
});

router.post('/api/anesthesia/records/:id/sticker-doc/upload-url', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { filename, contentType } = req.body;

    const record = await storage.getAnesthesiaRecordById(id);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot add documents to a closed record" });
    }

    const { ObjectStorageService } = await import('../../objectStorage');
    const objectStorageService = new ObjectStorageService();
    
    if (!objectStorageService.isConfigured()) {
      return res.status(503).json({ message: "Object storage not configured" });
    }

    const { uploadURL, storageKey } = await objectStorageService.getStickerDocUploadURL(id, filename, contentType);

    res.json({ uploadURL, storageKey });
  } catch (error) {
    logger.error("Error getting sticker doc upload URL:", error);
    res.status(500).json({ message: "Failed to get upload URL" });
  }
});

router.get('/api/anesthesia/records/:id/sticker-doc/:docId/download-url', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { id, docId } = req.params;

    const record = await storage.getAnesthesiaRecordById(id);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const stickerDoc = (record.countsSterileData?.stickerDocs || []).find(doc => doc.id === docId);
    if (!stickerDoc) {
      return res.status(404).json({ message: "Sticker document not found" });
    }

    if (!stickerDoc.storageKey) {
      return res.status(400).json({ message: "Document is stored in legacy format" });
    }

    const { ObjectStorageService } = await import('../../objectStorage');
    const objectStorageService = new ObjectStorageService();
    
    if (!objectStorageService.isConfigured()) {
      return res.status(503).json({ message: "Object storage not configured" });
    }

    const downloadURL = await objectStorageService.getObjectDownloadURL(stickerDoc.storageKey, 3600);

    res.json({ downloadURL });
  } catch (error) {
    logger.error("Error getting sticker doc download URL:", error);
    res.status(500).json({ message: "Failed to get download URL" });
  }
});

router.post('/api/anesthesia/records/:id/close', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Record is already closed" });
    }

    const closedRecord = await storage.closeAnesthesiaRecord(id, userId);
    
    res.json(closedRecord);
  } catch (error) {
    logger.error("Error closing anesthesia record:", error);
    res.status(500).json({ message: "Failed to close anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/amend', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { reason, updates } = req.body;
    const userId = req.user.id;

    if (!reason || !updates) {
      return res.status(400).json({ message: "Reason and updates are required" });
    }

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.caseStatus !== 'closed') {
      return res.status(400).json({ message: "Can only amend closed records" });
    }

    const amendedRecord = await storage.amendAnesthesiaRecord(id, updates, reason, userId);
    
    res.json(amendedRecord);
  } catch (error) {
    logger.error("Error amending anesthesia record:", error);
    res.status(500).json({ message: "Failed to amend anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/lock', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (record.isLocked) {
      return res.status(400).json({ message: "Record is already locked" });
    }

    const lockedRecord = await storage.lockAnesthesiaRecord(id, userId);
    
    res.json(lockedRecord);
  } catch (error) {
    logger.error("Error locking anesthesia record:", error);
    res.status(500).json({ message: "Failed to lock anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/unlock', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ message: "Reason is required for unlocking a record" });
    }

    const record = await storage.getAnesthesiaRecordById(id);

    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    if (!record.isLocked) {
      return res.status(400).json({ message: "Record is not locked" });
    }

    const unlockedRecord = await storage.unlockAnesthesiaRecord(id, userId, reason.trim());
    
    res.json(unlockedRecord);
  } catch (error) {
    logger.error("Error unlocking anesthesia record:", error);
    res.status(500).json({ message: "Failed to unlock anesthesia record" });
  }
});

// ==================== ON-DEMAND MEDICATION ENDPOINTS ====================

// Get on-demand medications available for a specific administration group
router.get('/api/anesthesia/records/:recordId/on-demand-medications/:administrationGroupId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { recordId, administrationGroupId } = req.params;

    // Get all on-demand medications for this administration group
    const onDemandMeds = await db
      .select({
        id: medicationConfigs.id,
        itemId: medicationConfigs.itemId,
        itemName: items.name,
        medicationGroup: medicationConfigs.medicationGroup,
        administrationGroup: medicationConfigs.administrationGroup,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationRoute: medicationConfigs.administrationRoute,
        rateUnit: medicationConfigs.rateUnit,
        sortOrder: medicationConfigs.sortOrder,
      })
      .from(medicationConfigs)
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(
        and(
          eq(medicationConfigs.administrationGroup, administrationGroupId),
          eq(medicationConfigs.onDemandOnly, true)
        )
      )
      .orderBy(medicationConfigs.sortOrder, items.name);

    // Get already imported medications for this record
    const importedMeds = await db
      .select({
        medicationConfigId: anesthesiaRecordMedications.medicationConfigId,
      })
      .from(anesthesiaRecordMedications)
      .where(eq(anesthesiaRecordMedications.anesthesiaRecordId, recordId));

    const importedConfigIds = new Set(importedMeds.map(m => m.medicationConfigId));

    // Mark each medication with whether it's already imported
    const medsWithImportStatus = onDemandMeds.map(med => ({
      ...med,
      isImported: importedConfigIds.has(med.id),
    }));

    res.json(medsWithImportStatus);
  } catch (error) {
    logger.error("Error fetching on-demand medications:", error);
    res.status(500).json({ message: "Failed to fetch on-demand medications" });
  }
});

// Get imported on-demand medications for a record
router.get('/api/anesthesia/records/:recordId/imported-medications', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;

    // Get all imported on-demand medications with their config details
    const importedMeds = await db
      .select({
        id: anesthesiaRecordMedications.id,
        medicationConfigId: anesthesiaRecordMedications.medicationConfigId,
        importedAt: anesthesiaRecordMedications.importedAt,
        itemId: medicationConfigs.itemId,
        itemName: items.name,
        medicationGroup: medicationConfigs.medicationGroup,
        administrationGroup: medicationConfigs.administrationGroup,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationRoute: medicationConfigs.administrationRoute,
        rateUnit: medicationConfigs.rateUnit,
        sortOrder: medicationConfigs.sortOrder,
      })
      .from(anesthesiaRecordMedications)
      .innerJoin(medicationConfigs, eq(anesthesiaRecordMedications.medicationConfigId, medicationConfigs.id))
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(anesthesiaRecordMedications.anesthesiaRecordId, recordId));

    res.json(importedMeds);
  } catch (error) {
    logger.error("Error fetching imported medications:", error);
    res.status(500).json({ message: "Failed to fetch imported medications" });
  }
});

// Import an on-demand medication to a record
router.post('/api/anesthesia/records/:recordId/imported-medications', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const { medicationConfigId } = req.body;
    const userId = req.user.id;

    if (!medicationConfigId) {
      return res.status(400).json({ message: "medicationConfigId is required" });
    }

    // Verify the medication config exists and is on-demand
    const config = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.id, medicationConfigId))
      .limit(1);

    if (!config.length) {
      return res.status(404).json({ message: "Medication configuration not found" });
    }

    if (!config[0].onDemandOnly) {
      return res.status(400).json({ message: "This medication is not configured as on-demand" });
    }

    // Insert the imported medication
    const [inserted] = await db
      .insert(anesthesiaRecordMedications)
      .values({
        anesthesiaRecordId: recordId,
        medicationConfigId,
        importedBy: userId,
      })
      .returning();

    // Return the full medication details
    const result = await db
      .select({
        id: anesthesiaRecordMedications.id,
        medicationConfigId: anesthesiaRecordMedications.medicationConfigId,
        importedAt: anesthesiaRecordMedications.importedAt,
        itemId: medicationConfigs.itemId,
        itemName: items.name,
        medicationGroup: medicationConfigs.medicationGroup,
        administrationGroup: medicationConfigs.administrationGroup,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationRoute: medicationConfigs.administrationRoute,
        rateUnit: medicationConfigs.rateUnit,
        sortOrder: medicationConfigs.sortOrder,
      })
      .from(anesthesiaRecordMedications)
      .innerJoin(medicationConfigs, eq(anesthesiaRecordMedications.medicationConfigId, medicationConfigs.id))
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(anesthesiaRecordMedications.id, inserted.id))
      .limit(1);

    res.json(result[0]);
  } catch (error: any) {
    // Handle unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ message: "Medication already imported to this record" });
    }
    logger.error("Error importing medication:", error);
    res.status(500).json({ message: "Failed to import medication" });
  }
});

// Remove an imported on-demand medication from a record
router.delete('/api/anesthesia/records/:recordId/imported-medications/:medicationConfigId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId, medicationConfigId } = req.params;

    // Delete the imported medication
    await db
      .delete(anesthesiaRecordMedications)
      .where(
        and(
          eq(anesthesiaRecordMedications.anesthesiaRecordId, recordId),
          eq(anesthesiaRecordMedications.medicationConfigId, medicationConfigId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    logger.error("Error removing imported medication:", error);
    res.status(500).json({ message: "Failed to remove imported medication" });
  }
});

export default router;
