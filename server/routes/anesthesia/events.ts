import { Router } from "express";
import type { Request } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  addVentilationModePointSchema,
  updateVentilationModePointSchema,
  addBulkVentilationSchema,
  addOutputPointSchema,
  updateOutputPointSchema,
  deleteOutputPointSchema,
  insertAnesthesiaEventSchema,
  insertAnesthesiaPositionSchema,
  anesthesiaEvents,
  anesthesiaPositions,
} from "@shared/schema";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireWriteAccess } from "../../utils";
import { broadcastAnesthesiaUpdate } from "../../socket";
import logger from "../../logger";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

router.post('/api/anesthesia/ventilation-modes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addVentilationModePointSchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const updatedSnapshot = await storage.addVentilationModePoint(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.value
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'ventilation',
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
    logger.error("Error adding ventilation mode point:", error);
    res.status(500).json({ message: "Failed to add ventilation mode point" });
  }
});

router.patch('/api/anesthesia/ventilation-modes/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateVentilationModePointSchema.parse({
      pointId,
      ...req.body
    });

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const updates: Record<string, any> = {};
    if (validatedData.value !== undefined) updates.value = validatedData.value;
    if (validatedData.timestamp !== undefined) updates.timestamp = validatedData.timestamp;
    
    const updatedSnapshot = await storage.updateVentilationModePoint(
      validatedData.anesthesiaRecordId,
      pointId,
      updates
    );
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Ventilation mode point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'ventilation',
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
    logger.error("Error updating ventilation mode point:", error);
    res.status(500).json({ message: "Failed to update ventilation mode point" });
  }
});

router.delete('/api/anesthesia/ventilation-modes/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    const { anesthesiaRecordId } = req.body;

    if (!anesthesiaRecordId) {
      return res.status(400).json({ message: "anesthesiaRecordId is required" });
    }

    const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
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

    const updatedSnapshot = await storage.deleteVentilationModePoint(anesthesiaRecordId, pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Ventilation mode point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: anesthesiaRecordId,
      section: 'ventilation',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting ventilation mode point:", error);
    res.status(500).json({ message: "Failed to delete ventilation mode point" });
  }
});

router.post('/api/anesthesia/ventilation/bulk', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addBulkVentilationSchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const updatedSnapshot = await storage.addBulkVentilationParameters(
      validatedData.anesthesiaRecordId,
      validatedData.timestamp,
      validatedData.ventilationMode || null,
      validatedData.parameters
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'ventilationParams',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error("[VENTILATION-BULK] Zod validation error:", JSON.stringify(error.errors, null, 2));
      logger.error("[VENTILATION-BULK] Request body was:", JSON.stringify(req.body, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error adding bulk ventilation parameters:", error);
    res.status(500).json({ message: "Failed to add bulk ventilation parameters" });
  }
});

router.put('/api/anesthesia/ventilation/bulk', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { anesthesiaRecordId, originalTimestamp, newTimestamp, parameters } = req.body;

    if (!anesthesiaRecordId || !originalTimestamp || !parameters) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
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

    const updatedSnapshot = await storage.updateBulkVentilationParameters(
      anesthesiaRecordId,
      originalTimestamp,
      newTimestamp || originalTimestamp,
      parameters
    );
    
    broadcastAnesthesiaUpdate({
      recordId: anesthesiaRecordId,
      section: 'ventilationParams',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error updating bulk ventilation parameters:", error);
    res.status(500).json({ message: "Failed to update bulk ventilation parameters" });
  }
});

router.delete('/api/anesthesia/ventilation/bulk', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { anesthesiaRecordId, timestamp } = req.query;

    if (!anesthesiaRecordId || !timestamp) {
      return res.status(400).json({ message: "Missing required query parameters" });
    }

    const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId as string);
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

    const updatedSnapshot = await storage.deleteBulkVentilationParameters(
      anesthesiaRecordId as string,
      timestamp as string
    );
    
    broadcastAnesthesiaUpdate({
      recordId: anesthesiaRecordId as string,
      section: 'ventilationParams',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting bulk ventilation parameters:", error);
    res.status(500).json({ message: "Failed to delete bulk ventilation parameters" });
  }
});

router.post('/api/anesthesia/output', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addOutputPointSchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const updatedSnapshot = await storage.addOutputPoint(
      validatedData.anesthesiaRecordId,
      validatedData.paramKey,
      validatedData.timestamp,
      validatedData.value
    );
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'output',
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
    logger.error("Error adding output point:", error);
    res.status(500).json({ message: "Failed to add output point" });
  }
});

router.patch('/api/anesthesia/output/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = updateOutputPointSchema.parse({
      pointId,
      ...req.body
    });

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const updates: Record<string, any> = {};
    if (validatedData.value !== undefined) updates.value = validatedData.value;
    if (validatedData.timestamp !== undefined) updates.timestamp = validatedData.timestamp;
    
    const updatedSnapshot = await storage.updateOutputPoint(
      validatedData.anesthesiaRecordId,
      validatedData.paramKey,
      pointId,
      updates
    );
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Output point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'output',
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
    logger.error("Error updating output point:", error);
    res.status(500).json({ message: "Failed to update output point" });
  }
});

router.delete('/api/anesthesia/output/:pointId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { pointId } = req.params;
    const userId = req.user.id;
    
    const validatedData = deleteOutputPointSchema.parse({
      pointId,
      ...req.body
    });

    const anesthesiaRecordId = validatedData.anesthesiaRecordId;
    const paramKey = validatedData.paramKey;
    const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
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

    const updatedSnapshot = await storage.deleteOutputPoint(anesthesiaRecordId, paramKey, pointId);
    
    if (!updatedSnapshot) {
      return res.status(404).json({ message: "Output point not found" });
    }

    broadcastAnesthesiaUpdate({
      recordId: anesthesiaRecordId,
      section: 'output',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    res.json(updatedSnapshot);
  } catch (error) {
    logger.error("Error deleting output point:", error);
    res.status(500).json({ message: "Failed to delete output point" });
  }
});

router.get('/api/anesthesia/events/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(recordId);
    
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

    const events = await storage.getAnesthesiaEvents(recordId);
    
    res.json(events);
  } catch (error) {
    logger.error("Error fetching events:", error);
    res.status(500).json({ message: "Failed to fetch events" });
  }
});

router.post('/api/anesthesia/events', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertAnesthesiaEventSchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
    
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

    const newEvent = await storage.createAnesthesiaEvent(validatedData);
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'events',
      data: newEvent,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(newEvent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating event:", error);
    res.status(500).json({ message: "Failed to create event" });
  }
});

router.patch('/api/anesthesia/events/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const validatedData = insertAnesthesiaEventSchema.partial().parse(req.body);

    const { timestamp, eventType, description } = validatedData;
    const allowedUpdates = { timestamp, eventType, description };

    const [event] = await db.select().from(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const record = await storage.getAnesthesiaRecordById(event.anesthesiaRecordId);
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

    const updated = await storage.updateAnesthesiaEvent(id, allowedUpdates, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: event.anesthesiaRecordId,
      section: 'events',
      data: updated,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating event:", error);
    res.status(500).json({ message: "Failed to update event" });
  }
});

router.delete('/api/anesthesia/events/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [event] = await db.select().from(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const record = await storage.getAnesthesiaRecordById(event.anesthesiaRecordId);
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

    await storage.deleteAnesthesiaEvent(id, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: event.anesthesiaRecordId,
      section: 'events',
      data: { deleted: id },
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting event:", error);
    res.status(500).json({ message: "Failed to delete event" });
  }
});

router.get('/api/anesthesia/positions/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(recordId);
    
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

    const positions = await storage.getAnesthesiaPositions(recordId);
    
    res.json(positions);
  } catch (error) {
    logger.error("Error fetching positions:", error);
    res.status(500).json({ message: "Failed to fetch positions" });
  }
});

router.post('/api/anesthesia/positions', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertAnesthesiaPositionSchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

    const newPosition = await storage.createAnesthesiaPosition({
      ...validatedData,
      createdBy: userId,
    });
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'positions',
      data: newPosition,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(newPosition);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating position:", error);
    res.status(500).json({ message: "Failed to create position" });
  }
});

router.patch('/api/anesthesia/positions/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updateSchema = insertAnesthesiaPositionSchema.partial().pick({
      timestamp: true,
      position: true,
    });
    
    const validatedUpdates = updateSchema.parse(req.body);

    if (Object.keys(validatedUpdates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const [position] = await db.select().from(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));
    if (!position) {
      return res.status(404).json({ message: "Position not found" });
    }

    const record = await storage.getAnesthesiaRecordById(position.anesthesiaRecordId);
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

    const updated = await storage.updateAnesthesiaPosition(id, validatedUpdates, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: position.anesthesiaRecordId,
      section: 'positions',
      data: updated,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating position:", error);
    res.status(500).json({ message: "Failed to update position" });
  }
});

router.delete('/api/anesthesia/positions/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [position] = await db.select().from(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));
    if (!position) {
      return res.status(404).json({ message: "Position not found" });
    }

    const record = await storage.getAnesthesiaRecordById(position.anesthesiaRecordId);
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

    await storage.deleteAnesthesiaPosition(id, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: position.anesthesiaRecordId,
      section: 'positions',
      data: { deleted: id },
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting position:", error);
    res.status(500).json({ message: "Failed to delete position" });
  }
});

export default router;
