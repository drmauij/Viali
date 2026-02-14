import { Router } from "express";
import type { Request } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  insertVitalsSnapshotSchema,
  addVitalPointSchema,
  addBPPointSchema,
  updateVitalPointSchema,
  updateBPPointSchema,
  addRhythmPointSchema,
  updateRhythmPointSchema,
  addTOFPointSchema,
  updateTOFPointSchema,
  addVASPointSchema,
  updateVASPointSchema,
  addAldretePointSchema,
  updateAldretePointSchema,
  addScorePointSchema,
  updateScorePointSchema,
  clinicalSnapshots,
} from "@shared/schema";
import { z } from "zod";
import { requireWriteAccess, requireStrictHospitalAccess } from "../../utils";
import { broadcastAnesthesiaUpdate } from "../../socket";
import logger from "../../logger";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

router.get('/api/anesthesia/vitals/:recordId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;

    const vitals = await storage.getVitalsSnapshots(recordId);
    
    res.json(vitals);
  } catch (error) {
    logger.error("Error fetching vitals snapshots:", error);
    res.status(500).json({ message: "Failed to fetch vitals snapshots" });
  }
});

router.post('/api/anesthesia/vitals', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    logger.info('[VITALS] Received payload:', JSON.stringify(req.body, null, 2));
    const validatedData = insertVitalsSnapshotSchema.parse(req.body);
    logger.info('[VITALS] Validation successful:', JSON.stringify(validatedData, null, 2));

    const newVital = await storage.createVitalsSnapshot(validatedData);
    
    res.status(201).json(newVital);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('[VITALS] Zod validation error:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating vitals snapshot:", error);
    res.status(500).json({ message: "Failed to create vitals snapshot" });
  }
});

router.get('/api/anesthesia/vitals/snapshot/:recordId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;

    const snapshot = await storage.getClinicalSnapshot(recordId);
    const snapshotData = snapshot?.data as any;
    logger.info('[SNAPSHOT-GET] Returning snapshot for', recordId, 'keys:', snapshotData ? Object.keys(snapshotData) : 'null');
    if (snapshotData?.pip) logger.info('[SNAPSHOT-GET] pip count:', snapshotData.pip.length);
    if (snapshotData?.peep) logger.info('[SNAPSHOT-GET] peep count:', snapshotData.peep.length);
    res.json(snapshot);
  } catch (error) {
    logger.error("Error getting clinical snapshot:", error);
    res.status(500).json({ message: "Failed to get clinical snapshot" });
  }
});

router.post('/api/anesthesia/vitals/points', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addVitalPointSchema.parse(req.body);
    const recordId = validatedData.anesthesiaRecordId;

    const updatedSnapshot = await storage.addVitalPoint(
      validatedData.anesthesiaRecordId,
      validatedData.vitalType,
      validatedData.timestamp,
      validatedData.value
    );
    
    broadcastAnesthesiaUpdate({
      recordId,
      section: 'vitals',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding vital point:", error);
    res.status(500).json({ message: "Failed to add vital point" });
  }
});

router.post('/api/anesthesia/vitals/bp', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addBPPointSchema.parse(req.body);
    const recordId = validatedData.anesthesiaRecordId;

    const updatedSnapshot = await storage.addBPPoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.sys,
      validatedData.dia,
      validatedData.mean
    );
    
    broadcastAnesthesiaUpdate({
      recordId,
      section: 'vitals',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding BP point:", error);
    res.status(500).json({ message: "Failed to add BP point" });
  }
});

router.patch('/api/anesthesia/vitals/points/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateVitalPointSchema.parse({
      pointId,
      ...req.body
    });

    const updatedSnapshot = await storage.updateVitalPoint(pointId, validatedData);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: updatedSnapshot.anesthesiaRecordId,
      section: 'vitals',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating vital point:", error);
    res.status(500).json({ message: "Failed to update vital point" });
  }
});

router.patch('/api/anesthesia/vitals/bp/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateBPPointSchema.parse({
      pointId,
      ...req.body
    });

    const updatedSnapshot = await storage.updateBPPoint(pointId, validatedData);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "BP point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: updatedSnapshot.anesthesiaRecordId,
      section: 'vitals',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating BP point:", error);
    res.status(500).json({ message: "Failed to update BP point" });
  }
});

router.delete('/api/anesthesia/vitals/points/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const updatedSnapshot = await storage.deleteVitalPoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: updatedSnapshot.anesthesiaRecordId,
      section: 'vitals',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting vital point:", error);
    res.status(500).json({ message: "Failed to delete vital point" });
  }
});

router.post('/api/anesthesia/rhythm', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addRhythmPointSchema.parse(req.body);

    const updatedSnapshot = await storage.addRhythmPoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.value
    );
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding rhythm point:", error);
    res.status(500).json({ message: "Failed to add rhythm point" });
  }
});

router.patch('/api/anesthesia/rhythm/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateRhythmPointSchema.parse({
      pointId,
      ...req.body
    });

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const heartRhythm = (s.data as any).heartRhythm || [];
      if (heartRhythm.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Rhythm point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.updateRhythmPoint(pointId, validatedData);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Rhythm point not found" });
    }

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating rhythm point:", error);
    res.status(500).json({ message: "Failed to update rhythm point" });
  }
});

router.delete('/api/anesthesia/rhythm/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const heartRhythm = (s.data as any).heartRhythm || [];
      if (heartRhythm.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Rhythm point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.deleteRhythmPoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Rhythm point not found" });
    }

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting rhythm point:", error);
    res.status(500).json({ message: "Failed to delete rhythm point" });
  }
});

router.post('/api/anesthesia/tof', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addTOFPointSchema.parse(req.body);

    const updatedSnapshot = await storage.addTOFPoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.value,
      validatedData.percentage
    );
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding TOF point:", error);
    res.status(500).json({ message: "Failed to add TOF point" });
  }
});

router.patch('/api/anesthesia/tof/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateTOFPointSchema.parse({
      pointId,
      ...req.body
    });

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const tof = (s.data as any).tof || [];
      if (tof.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "TOF point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.updateTOFPoint(pointId, validatedData);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "TOF point not found" });
    }

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating TOF point:", error);
    res.status(500).json({ message: "Failed to update TOF point" });
  }
});

router.delete('/api/anesthesia/tof/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const tof = (s.data as any).tof || [];
      if (tof.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "TOF point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.deleteTOFPoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "TOF point not found" });
    }

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting TOF point:", error);
    res.status(500).json({ message: "Failed to delete TOF point" });
  }
});

router.post('/api/anesthesia/vas', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addVASPointSchema.parse(req.body);

    const updatedSnapshot = await storage.addVASPoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.value
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'vas',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding VAS point:", error);
    res.status(500).json({ message: "Failed to add VAS point" });
  }
});

router.patch('/api/anesthesia/vas/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateVASPointSchema.parse({
      pointId,
      ...req.body
    });

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const vas = (s.data as any).vas || [];
      if (vas.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "VAS point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.updateVASPoint(pointId, {
      value: validatedData.value,
      timestamp: validatedData.timestamp,
    });
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "VAS point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'vas',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating VAS point:", error);
    res.status(500).json({ message: "Failed to update VAS point" });
  }
});

router.delete('/api/anesthesia/vas/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const vas = (s.data as any).vas || [];
      if (vas.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "VAS point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.deleteVASPoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "VAS point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'vas',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting VAS point:", error);
    res.status(500).json({ message: "Failed to delete VAS point" });
  }
});

router.post('/api/anesthesia/aldrete', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addAldretePointSchema.parse(req.body);

    const updatedSnapshot = await storage.addAldretePoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.value,
      validatedData.components
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'aldrete',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding Aldrete point:", error);
    res.status(500).json({ message: "Failed to add Aldrete point" });
  }
});

router.patch('/api/anesthesia/aldrete/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateAldretePointSchema.parse({
      pointId,
      ...req.body
    });

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const aldrete = (s.data as any).aldrete || [];
      if (aldrete.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Aldrete point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.updateAldretePoint(pointId, {
      value: validatedData.value,
      timestamp: validatedData.timestamp,
      components: validatedData.components,
    });
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Aldrete point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'aldrete',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating Aldrete point:", error);
    res.status(500).json({ message: "Failed to update Aldrete point" });
  }
});

router.delete('/api/anesthesia/aldrete/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const aldrete = (s.data as any).aldrete || [];
      if (aldrete.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Aldrete point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.deleteAldretePoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Aldrete point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'aldrete',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting Aldrete point:", error);
    res.status(500).json({ message: "Failed to delete Aldrete point" });
  }
});

router.post('/api/anesthesia/scores', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addScorePointSchema.parse(req.body);

    const updatedSnapshot = await storage.addScorePoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.scoreType,
      validatedData.totalScore,
      validatedData.aldreteScore,
      validatedData.parsapScore
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'scores',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding score point:", error);
    res.status(500).json({ message: "Failed to add score point" });
  }
});

router.patch('/api/anesthesia/scores/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateScorePointSchema.parse({
      pointId,
      ...req.body
    });

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const scores = (s.data as any).scores || [];
      if (scores.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Score point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.updateScorePoint(pointId, {
      timestamp: validatedData.timestamp,
      scoreType: validatedData.scoreType,
      totalScore: validatedData.totalScore,
      aldreteScore: validatedData.aldreteScore,
      parsapScore: validatedData.parsapScore,
    });
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Score point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'scores',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating score point:", error);
    res.status(500).json({ message: "Failed to update score point" });
  }
});

router.delete('/api/anesthesia/scores/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;

    const allSnapshots = await db.select().from(clinicalSnapshots);
    let snapshot = null;
    
    for (const s of allSnapshots) {
      const scores = (s.data as any).scores || [];
      if (scores.some((p: any) => p.id === pointId)) {
        snapshot = s;
        break;
      }
    }
    
    if (!snapshot) {
      return res.status(404).json({ message: "Score point not found" });
    }

    const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedSnapshot = await storage.deleteScorePoint(pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Score point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: snapshot.anesthesiaRecordId,
      section: 'scores',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting score point:", error);
    res.status(500).json({ message: "Failed to delete score point" });
  }
});

export default router;
