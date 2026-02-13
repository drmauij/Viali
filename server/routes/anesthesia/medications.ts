import { Router } from "express";
import type { Request } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  insertAnesthesiaMedicationSchema,
  anesthesiaMedications,
  medicationConfigs,
  medicationCouplings,
  anesthesiaRecordMedications,
  items,
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireWriteAccess } from "../../utils";
import { broadcastAnesthesiaUpdate } from "../../socket";
import logger from "../../logger";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

router.get('/api/anesthesia/medications/:recordId', isAuthenticated, async (req: any, res) => {
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

    const medications = await storage.getAnesthesiaMedications(recordId);
    
    res.json(medications);
  } catch (error) {
    logger.error("Error fetching medications:", error);
    res.status(500).json({ message: "Failed to fetch medications" });
  }
});

router.post('/api/anesthesia/medications', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    logger.info('[TIMESTAMP-DEBUG] Backend received medication POST:', {
      rawTimestamp: req.body.timestamp,
      rawTimestampType: typeof req.body.timestamp,
    });

    const validatedData = insertAnesthesiaMedicationSchema.parse(req.body);
    
    logger.info('[TIMESTAMP-DEBUG] After Zod validation:', {
      validatedTimestamp: validatedData.timestamp,
      validatedTimestampType: typeof validatedData.timestamp,
      validatedTimestampISO: validatedData.timestamp instanceof Date ? validatedData.timestamp.toISOString() : 'not a date',
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

    const newMedication = await storage.createAnesthesiaMedication(validatedData);
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'medications',
      data: newMedication,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });

    // Auto-import coupled medications
    try {
      // 1. Find the medication config for this item
      const [medConfig] = await db
        .select({ id: medicationConfigs.id })
        .from(medicationConfigs)
        .where(eq(medicationConfigs.itemId, validatedData.itemId));

      if (medConfig) {
        // 2. Find all coupled medications for this medication config
        const couplings = await db
          .select({
            coupledMedicationConfigId: medicationCouplings.coupledMedicationConfigId,
            coupledItemId: items.id,
            overrideDose: medicationCouplings.defaultDose,
            configDefaultDose: medicationConfigs.defaultDose,
          })
          .from(medicationCouplings)
          .innerJoin(medicationConfigs, eq(medicationCouplings.coupledMedicationConfigId, medicationConfigs.id))
          .innerJoin(items, eq(medicationConfigs.itemId, items.id))
          .where(eq(medicationCouplings.primaryMedicationConfigId, medConfig.id));

        // 3. For each coupled medication, auto-import it to the record (if not already)
        for (const coupling of couplings) {
          // Check if already imported
          const [existingImport] = await db
            .select({ id: anesthesiaRecordMedications.id })
            .from(anesthesiaRecordMedications)
            .where(
              and(
                eq(anesthesiaRecordMedications.anesthesiaRecordId, validatedData.anesthesiaRecordId),
                eq(anesthesiaRecordMedications.medicationConfigId, coupling.coupledMedicationConfigId)
              )
            );

          if (!existingImport) {
            // Auto-import the coupled medication
            await db.insert(anesthesiaRecordMedications).values({
              anesthesiaRecordId: validatedData.anesthesiaRecordId,
              medicationConfigId: coupling.coupledMedicationConfigId,
              importedBy: userId,
            });

            logger.info(`[COUPLED-MEDS] Auto-imported coupled medication ${coupling.coupledMedicationConfigId} for record ${validatedData.anesthesiaRecordId}`);
            
            // Broadcast the import update for real-time UI
            broadcastAnesthesiaUpdate({
              recordId: validatedData.anesthesiaRecordId,
              section: 'recordMedications',
              data: { medicationConfigId: coupling.coupledMedicationConfigId },
              timestamp: Date.now(),
              userId,
              clientSessionId: getClientSessionId(req),
            });
          }

          // 4. Add the coupled medication to inventory as "used" (create a medication record)
          // Only add if this is the first dose of the primary medication in this record
          const existingDoses = await db
            .select({ id: anesthesiaMedications.id })
            .from(anesthesiaMedications)
            .where(
              and(
                eq(anesthesiaMedications.anesthesiaRecordId, validatedData.anesthesiaRecordId),
                eq(anesthesiaMedications.itemId, validatedData.itemId)
              )
            );

          // If this is the first dose, also record the coupled medication usage
          if (existingDoses.length <= 1) {
            // Use override dose from coupling, or fall back to medication config's default dose
            const effectiveDose = coupling.overrideDose || coupling.configDefaultDose || undefined;
            
            const coupledMedication = await storage.createAnesthesiaMedication({
              anesthesiaRecordId: validatedData.anesthesiaRecordId,
              itemId: coupling.coupledItemId,
              timestamp: validatedData.timestamp,
              type: 'bolus',
              dose: effectiveDose,
            });

            logger.info(`[COUPLED-MEDS] Added inventory usage for coupled medication ${coupling.coupledItemId}`);
            
            // Broadcast the coupled medication for real-time UI
            broadcastAnesthesiaUpdate({
              recordId: validatedData.anesthesiaRecordId,
              section: 'medications',
              data: coupledMedication,
              timestamp: Date.now(),
              userId,
              clientSessionId: getClientSessionId(req),
            });
          }
        }
      }
    } catch (couplingError) {
      // Log but don't fail the main medication creation
      logger.error('[COUPLED-MEDS] Error processing coupled medications:', couplingError);
    }
    
    res.status(201).json(newMedication);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating medication:", error);
    res.status(500).json({ message: "Failed to create medication" });
  }
});

router.patch('/api/anesthesia/medications/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [medication] = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.id, id));
    
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    const record = await storage.getAnesthesiaRecordById(medication.anesthesiaRecordId);
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

    const updates = { ...req.body };
    if (updates.timestamp && typeof updates.timestamp === 'string') {
      updates.timestamp = new Date(updates.timestamp);
    }
    if (updates.endTimestamp && typeof updates.endTimestamp === 'string') {
      updates.endTimestamp = new Date(updates.endTimestamp);
    }

    logger.info('[MEDICATION-UPDATE] Updating medication:', { id, updates });

    const updatedMedication = await storage.updateAnesthesiaMedication(id, updates, userId);
    
    logger.info('[MEDICATION-UPDATE] Updated result:', updatedMedication);
    
    broadcastAnesthesiaUpdate({
      recordId: medication.anesthesiaRecordId,
      section: 'medications',
      data: updatedMedication,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedMedication);
  } catch (error) {
    logger.error("Error updating medication:", error);
    res.status(500).json({ message: "Failed to update medication" });
  }
});

router.delete('/api/anesthesia/medications/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [medication] = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.id, id));
    
    if (!medication) {
      return res.status(404).json({ message: "Medication not found" });
    }

    const record = await storage.getAnesthesiaRecordById(medication.anesthesiaRecordId);
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

    await storage.deleteAnesthesiaMedication(id, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: medication.anesthesiaRecordId,
      section: 'medications',
      data: { deleted: id },
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting medication:", error);
    res.status(500).json({ message: "Failed to delete medication" });
  }
});

export default router;
