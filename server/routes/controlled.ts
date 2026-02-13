import { Router } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { items } from "@shared/schema";
import { z, ZodError } from "zod";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import {
  encryptPatientData,
  decryptPatientData,
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  requireWriteAccess,
} from "../utils";
import logger from "../logger";

const router = Router();

router.post('/api/activity/log', isAuthenticated, async (req: any, res) => {
  try {
    const activitySchema = z.object({
      action: z.string(),
      resourceType: z.string(),
      resourceId: z.string(),
      hospitalId: z.string().optional(),
      details: z.any().optional(),
    });
    let parsedActivity;
    try {
      parsedActivity = activitySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { action, resourceType, resourceId, hospitalId, details } = parsedActivity;
    const userId = req.user.id;

    await storage.createActivity({
      userId,
      action,
      itemId: resourceType === 'item' ? resourceId : undefined,
      metadata: {
        resourceType,
        resourceId,
        hospitalId: hospitalId || null,
        ...details
      },
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error logging activity:", error);
    res.json({ success: true, warning: "Activity may not have been logged" });
  }
});

router.post('/api/controlled/extract-patient-info', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { image } = req.body;
    
    if (!image) {
      return res.status(400).json({ message: "Image data is required" });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { createWorker } = await import('tesseract.js');
    
    const worker = await createWorker('eng');
    
    try {
      const { data: { text } } = await worker.recognize(image);
      await worker.terminate();
      
      const extractedText = text.trim();
      
      if (!extractedText) {
        return res.json({ patientId: null });
      }
      
      const patterns = [
        /(?:MRN|Patient\s*ID|ID|#)[\s:]*([A-Z0-9-]+)/i,
        /\b([0-9]{6,})\b/,
      ];
      
      for (const pattern of patterns) {
        const match = extractedText.match(pattern);
        if (match && match[1]) {
          return res.json({ patientId: match[1].trim() });
        }
      }
      
      const firstLine = extractedText.split('\n').find(line => line.trim().length > 2);
      res.json({ patientId: firstLine?.trim() || null });
    } catch (ocrError) {
      logger.error("OCR processing error:", ocrError);
      await worker.terminate();
      throw ocrError;
    }
  } catch (error) {
    logger.error("Error extracting patient info:", error);
    res.status(500).json({ message: "Failed to extract patient information" });
  }
});

router.post('/api/controlled/dispense', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { items: dispenseItems, patientId, patientPhoto, notes, signatures } = req.body;
    
    if (!dispenseItems || !Array.isArray(dispenseItems) || dispenseItems.length === 0) {
      return res.status(400).json({ message: "Items array is required" });
    }
    
    if (!patientId && !patientPhoto) {
      return res.status(400).json({ message: "Patient identification (ID or photo) is required for controlled substances" });
    }
    
    const encryptedPatientId = patientId ? encryptPatientData(patientId) : null;
    const encryptedPatientPhoto = patientPhoto ? encryptPatientData(patientPhoto) : null;
    
    const activities = await Promise.all(
      dispenseItems.map(async (item: any) => {
        const itemData = await storage.getItem(item.itemId);
        if (!itemData) {
          throw new Error(`Item ${item.itemId} not found`);
        }
        
        const unitId = await getUserUnitForHospital(userId, itemData.hospitalId);
        if (!unitId) {
          throw new Error("Access denied to this hospital");
        }
        
        if (itemData.unitId !== unitId) {
          throw new Error(`Access denied to item ${item.itemId}'s unit`);
        }
        
        let beforeQty: number;
        let afterQty: number;
        
        if (itemData.trackExactQuantity) {
          const currentCurrentUnits = itemData.currentUnits || 0;
          const newCurrentUnits = Math.max(0, currentCurrentUnits - item.qty);
          const packSize = itemData.packSize || 1;
          const newQty = Math.ceil(newCurrentUnits / packSize);
          
          beforeQty = currentCurrentUnits;
          afterQty = newCurrentUnits;
          
          await db
            .update(items)
            .set({ currentUnits: newCurrentUnits })
            .where(eq(items.id, item.itemId));
          
          await storage.updateStockLevel(item.itemId, unitId, newQty);
        } else {
          const currentStock = await storage.getStockLevel(item.itemId, unitId);
          const currentQty = currentStock?.qtyOnHand || 0;
          const newQty = Math.max(0, currentQty - item.qty);
          
          beforeQty = currentQty;
          afterQty = newQty;
          
          await storage.updateStockLevel(item.itemId, unitId, newQty);
        }
        
        return await storage.createActivity({
          userId,
          action: 'use',
          itemId: item.itemId,
          unitId,
          delta: -item.qty,
          movementType: 'OUT',
          notes,
          patientId: encryptedPatientId,
          patientPhoto: encryptedPatientPhoto,
          signatures,
          controlledVerified: signatures && signatures.length >= 2,
          metadata: { beforeQty, afterQty },
        });
      })
    );
    
    res.status(201).json(activities);
  } catch (error: any) {
    logger.error("Error recording controlled substance:", error);
    
    if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
      return res.status(403).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Failed to record controlled substance" });
  }
});

router.post('/api/controlled/adjust', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { itemId, newCurrentUnits, notes, signature, attachmentPhoto } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ message: "Item ID is required" });
    }
    
    if (newCurrentUnits === undefined || newCurrentUnits === null) {
      return res.status(400).json({ message: "New current units value is required" });
    }
    
    if (!signature) {
      return res.status(400).json({ message: "Signature is required for controlled substance adjustments" });
    }
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    if (!item.controlled) {
      return res.status(400).json({ message: "This endpoint is only for controlled substances" });
    }
    
    if (!item.trackExactQuantity) {
      return res.status(400).json({ message: "Item must have exact quantity tracking enabled" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (item.unitId !== unitId) {
      return res.status(403).json({ message: "Access denied to this item's location" });
    }
    
    const currentUnits = item.currentUnits || 0;
    const delta = newCurrentUnits - currentUnits;
    
    const movementType = delta >= 0 ? 'IN' : 'OUT';
    
    const beforeQty = currentUnits;
    const afterQty = newCurrentUnits;
    
    await db
      .update(items)
      .set({ currentUnits: newCurrentUnits })
      .where(eq(items.id, itemId));
    
    const packSize = item.packSize || 1;
    const newStock = Math.ceil(newCurrentUnits / packSize);
    await storage.updateStockLevel(itemId, unitId, newStock);
    
    const activity = await storage.createActivity({
      userId,
      action: 'adjust',
      itemId,
      unitId,
      delta,
      movementType,
      notes: notes || `Manual adjustment: ${currentUnits} → ${newCurrentUnits} units`,
      attachmentPhoto: attachmentPhoto || null,
      signatures: [signature],
      controlledVerified: false,
      metadata: { beforeQty, afterQty },
    });
    
    res.status(201).json(activity);
  } catch (error: any) {
    logger.error("Error adjusting controlled substance:", error);
    
    if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
      return res.status(403).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Failed to adjust controlled substance inventory" });
  }
});

router.get('/api/controlled/log/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const activities = await storage.getActivities({
      hospitalId,
      unitId,
      controlled: true,
      actions: ['use', 'adjust'],
      limit: 50,
    });
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const decryptedActivities = await Promise.all(activities.map(async (activity: any) => {
      const decrypted = { ...activity };
      
      if (activity.patientId) {
        try {
          const decryptedPatientId = decryptPatientData(activity.patientId);
          decrypted.patientId = decryptedPatientId;
          
          if (uuidRegex.test(decryptedPatientId)) {
            try {
              const patient = await storage.getPatient(decryptedPatientId);
              if (patient) {
                decrypted.patient = {
                  id: patient.id,
                  firstName: patient.firstName,
                  surname: patient.surname,
                  birthday: patient.birthday,
                  patientNumber: patient.patientNumber,
                };
              }
            } catch (patientError) {
            }
          }
        } catch (error) {
          logger.error("Error decrypting patient ID:", error);
        }
      }
      
      if (activity.patientPhoto) {
        try {
          decrypted.patientPhoto = decryptPatientData(activity.patientPhoto);
        } catch (error) {
          logger.error("Error decrypting patient photo:", error);
        }
      }
      
      return decrypted;
    }));
    
    res.json(decryptedActivities);
  } catch (error) {
    logger.error("Error fetching controlled log:", error);
    res.status(500).json({ message: "Failed to fetch controlled log" });
  }
});

router.post('/api/controlled/checks', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId, unitId, signature, checkItems, notes } = req.body;
    
    if (!hospitalId || !unitId || !signature || !checkItems) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId || userUnitId !== unitId) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }
    
    const allMatch = checkItems.every((item: any) => item.match);
    
    const check = await storage.createControlledCheck({
      hospitalId,
      unitId,
      userId,
      signature,
      checkItems,
      allMatch,
      notes: notes || null,
    });
    
    res.status(201).json(check);
  } catch (error: any) {
    logger.error("Error creating controlled check:", error);
    res.status(500).json({ message: "Failed to create controlled check" });
  }
});

router.get('/api/controlled/checks/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const checks = await storage.getControlledChecks(hospitalId, unitId);
    res.json(checks);
  } catch (error) {
    logger.error("Error fetching controlled checks:", error);
    res.status(500).json({ message: "Failed to fetch controlled checks" });
  }
});

router.delete('/api/controlled/checks/:checkId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { checkId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;
    
    const check = await storage.getControlledCheck(checkId);
    if (!check) {
      return res.status(404).json({ message: "Verification check not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, check.hospitalId);
    if (!unitId || unitId !== check.unitId) {
      return res.status(403).json({ message: "Access denied to this check" });
    }
    
    await storage.deleteControlledCheck(checkId);
    
    await storage.createAuditLog({
      recordType: 'controlled_check',
      recordId: checkId,
      hospitalId: check.hospitalId,
      userId,
      action: 'delete',
      oldData: check,
      newData: null,
      reason: reason || 'Routine verification check deleted',
    });
    
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting controlled check:", error);
    res.status(500).json({ message: "Failed to delete controlled check" });
  }
});

router.post('/api/controlled/verify/:activityId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { activityId } = req.params;
    const { signature } = req.body;
    const userId = req.user.id;
    
    if (!signature) {
      return res.status(400).json({ message: "Signature is required" });
    }
    
    const activityData = await storage.getActivityById(activityId);
    if (!activityData) {
      return res.status(404).json({ message: "Activity not found" });
    }
    
    const item = await storage.getItem(activityData.itemId!);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
    if (!userUnitId || userUnitId !== item.unitId) {
      return res.status(403).json({ message: "Access denied to this activity" });
    }
    
    const activity = await storage.verifyControlledActivity(activityId, signature, userId);
    res.json(activity);
  } catch (error: any) {
    logger.error("Error verifying controlled activity:", error);
    
    if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
      return res.status(403).json({ message: error.message });
    }
    
    res.status(500).json({ message: "Failed to verify controlled activity" });
  }
});

router.get('/api/alerts/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, acknowledged } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital or unit" });
    }
    
    const acknowledgedBool = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;
    const alerts = await storage.getAlerts(hospitalId, unitId, acknowledgedBool);
    res.json(alerts);
  } catch (error) {
    logger.error("Error fetching alerts:", error);
    res.status(500).json({ message: "Failed to fetch alerts" });
  }
});

router.post('/api/alerts/:alertId/acknowledge', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;
    
    const existingAlert = await storage.getAlertById(alertId);
    if (!existingAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, existingAlert.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this alert" });
    }
    
    const alert = await storage.acknowledgeAlert(alertId, userId);
    res.json(alert);
  } catch (error) {
    logger.error("Error acknowledging alert:", error);
    res.status(500).json({ message: "Failed to acknowledge alert" });
  }
});

router.post('/api/alerts/:alertId/snooze', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { alertId } = req.params;
    const { until } = req.body;
    const userId = req.user.id;
    
    if (!until) {
      return res.status(400).json({ message: "Snooze until date is required" });
    }
    
    const existingAlert = await storage.getAlertById(alertId);
    if (!existingAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, existingAlert.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this alert" });
    }
    
    const alert = await storage.snoozeAlert(alertId, new Date(until));
    res.json(alert);
  } catch (error) {
    logger.error("Error snoozing alert:", error);
    res.status(500).json({ message: "Failed to snooze alert" });
  }
});

router.get('/api/activities/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const activities = await storage.getActivities({
      hospitalId,
      unitId,
      limit: 10,
    });
    res.json(activities);
  } catch (error) {
    logger.error("Error fetching activities:", error);
    res.status(500).json({ message: "Failed to fetch activities" });
  }
});

export default router;
