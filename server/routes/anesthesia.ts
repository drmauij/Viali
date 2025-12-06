import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  insertHospitalAnesthesiaSettingsSchema,
  insertPatientSchema,
  insertCaseSchema,
  insertSurgerySchema,
  insertAnesthesiaRecordSchema,
  insertPreOpAssessmentSchema,
  insertVitalsSnapshotSchema,
  addVitalPointSchema,
  addBPPointSchema,
  updateVitalPointSchema,
  updateBPPointSchema,
  deleteVitalPointSchema,
  addRhythmPointSchema,
  updateRhythmPointSchema,
  addTOFPointSchema,
  updateTOFPointSchema,
  deleteTOFPointSchema,
  addVentilationModePointSchema,
  updateVentilationModePointSchema,
  addBulkVentilationSchema,
  addOutputPointSchema,
  updateOutputPointSchema,
  deleteOutputPointSchema,
  insertAnesthesiaMedicationSchema,
  insertAnesthesiaEventSchema,
  insertAnesthesiaPositionSchema,
  insertSurgeryStaffEntrySchema,
  surgeryStaffEntries,
  insertAnesthesiaInstallationSchema,
  insertAnesthesiaTechniqueDetailSchema,
  insertAnesthesiaAirwayManagementSchema,
  insertDifficultAirwayReportSchema,
  insertAnesthesiaGeneralTechniqueSchema,
  insertAnesthesiaNeuraxialBlockSchema,
  insertAnesthesiaPeripheralBlockSchema,
  insertInventoryUsageSchema,
  updateSignInDataSchema,
  updateTimeOutDataSchema,
  updateSignOutDataSchema,
  updatePostOpDataSchema,
  updateSurgeryStaffSchema,
  updateIntraOpDataSchema,
  updateCountsSterileDataSchema,
  items,
  units,
  users,
  userHospitalRoles,
  medicationConfigs,
  anesthesiaRecords,
  vitalsSnapshots,
  clinicalSnapshots,
  anesthesiaMedications,
  anesthesiaEvents,
  anesthesiaPositions,
  preOpAssessments,
  anesthesiaAirwayManagement,
  dailyStaffPool,
  plannedSurgeryStaff,
  dailyRoomStaff,
  surgeryRooms,
  insertDailyRoomStaffSchema,
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  getUserUnitForHospital,
  getUserRole,
  requireWriteAccess,
} from "../utils";
import { requireAdminRole } from "./middleware";
import { broadcastAnesthesiaUpdate } from "../socket";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "../services/aiMonitorAnalysis";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

router.get('/api/anesthesia/items/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userUnitId = await getUserUnitForHospital(userId, hospitalId);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const anesthesiaUnits = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.hospitalId, hospitalId),
          eq(units.isAnesthesiaModule, true)
        )
      )
      .limit(1);

    if (!anesthesiaUnits.length) {
      return res.json([]);
    }

    const anesthesiaUnitId = anesthesiaUnits[0].id;

    const anesthesiaItems = await db
      .select({
        id: items.id,
        hospitalId: items.hospitalId,
        unitId: items.unitId,
        folderId: items.folderId,
        name: items.name,
        description: items.description,
        unit: items.unit,
        packSize: items.packSize,
        minThreshold: items.minThreshold,
        maxThreshold: items.maxThreshold,
        defaultOrderQty: items.defaultOrderQty,
        critical: items.critical,
        controlled: items.controlled,
        trackExactQuantity: items.trackExactQuantity,
        currentUnits: items.currentUnits,
        vendorId: items.vendorId,
        barcodes: items.barcodes,
        imageUrl: items.imageUrl,
        sortOrder: items.sortOrder,
        createdAt: items.createdAt,
        updatedAt: items.updatedAt,
        medicationGroup: medicationConfigs.medicationGroup,
        administrationGroup: medicationConfigs.administrationGroup,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationRoute: medicationConfigs.administrationRoute,
        rateUnit: medicationConfigs.rateUnit,
        medicationSortOrder: medicationConfigs.sortOrder,
      })
      .from(items)
      .innerJoin(medicationConfigs, eq(items.id, medicationConfigs.itemId))
      .where(
        and(
          eq(items.hospitalId, hospitalId),
          eq(items.unitId, anesthesiaUnitId)
        )
      )
      .orderBy(medicationConfigs.sortOrder, items.name);

    res.json(anesthesiaItems);
  } catch (error: any) {
    console.error("Error fetching anesthesia items:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia items" });
  }
});

router.patch('/api/items/:itemId/anesthesia-config', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId);
    if (!unitId || unitId !== item.unitId) {
      return res.status(403).json({ message: "Access denied to this item" });
    }

    if (req.body.name) {
      await db
        .update(items)
        .set({ name: req.body.name })
        .where(eq(items.id, itemId));
    }

    const hasMedicationConfig = req.body.medicationGroup || req.body.administrationGroup || 
      req.body.defaultDose || req.body.administrationUnit || req.body.ampuleTotalContent || 
      req.body.administrationRoute || req.body.rateUnit !== undefined;

    if (hasMedicationConfig) {
      const existingConfig = await db
        .select()
        .from(medicationConfigs)
        .where(eq(medicationConfigs.itemId, itemId))
        .limit(1);

      const configData: any = {
        itemId,
        medicationGroup: req.body.medicationGroup || null,
        administrationGroup: req.body.administrationGroup || null,
        defaultDose: req.body.defaultDose || null,
        administrationUnit: req.body.administrationUnit || null,
        ampuleTotalContent: req.body.ampuleTotalContent || null,
        administrationRoute: req.body.administrationRoute || null,
        rateUnit: req.body.rateUnit || null,
        sortOrder: req.body.sortOrder !== undefined 
          ? req.body.sortOrder 
          : (existingConfig.length > 0 ? existingConfig[0].sortOrder : 0),
      };

      if (existingConfig.length > 0) {
        const updateData = { ...configData };
        if (req.body.sortOrder === undefined) {
          delete updateData.sortOrder;
        }
        await db
          .update(medicationConfigs)
          .set(updateData)
          .where(eq(medicationConfigs.itemId, itemId));
      } else {
        await db.insert(medicationConfigs).values(configData);
      }
    } else {
      await db
        .delete(medicationConfigs)
        .where(eq(medicationConfigs.itemId, itemId));
    }

    const result = await db
      .select({
        id: items.id,
        name: items.name,
        medicationGroup: medicationConfigs.medicationGroup,
        administrationGroup: medicationConfigs.administrationGroup,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationRoute: medicationConfigs.administrationRoute,
        rateUnit: medicationConfigs.rateUnit,
        medicationSortOrder: medicationConfigs.sortOrder,
      })
      .from(items)
      .leftJoin(medicationConfigs, eq(items.id, medicationConfigs.itemId))
      .where(eq(items.id, itemId))
      .limit(1);

    res.json(result[0] || await storage.getItem(itemId));
  } catch (error: any) {
    console.error("Error updating anesthesia config:", error);
    res.status(500).json({ message: "Failed to update anesthesia configuration" });
  }
});

router.post('/api/anesthesia/items/reorder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { items: itemsToReorder } = req.body;
    const userId = req.user.id;

    if (!Array.isArray(itemsToReorder) || itemsToReorder.length === 0) {
      return res.status(400).json({ message: "Invalid items array" });
    }

    for (const { itemId } of itemsToReorder) {
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: `Item ${itemId} not found` });
      }

      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    for (const { itemId, sortOrder } of itemsToReorder) {
      await db
        .update(medicationConfigs)
        .set({ sortOrder })
        .where(eq(medicationConfigs.itemId, itemId));
    }

    res.json({ success: true, updated: itemsToReorder.length });
  } catch (error: any) {
    console.error("Error reordering medications:", error);
    res.status(500).json({ message: "Failed to reorder medications" });
  }
});

router.get('/api/medication-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const groups = await storage.getMedicationGroups(hospitalId);
    res.json(groups);
  } catch (error: any) {
    console.error("Error fetching medication groups:", error);
    res.status(500).json({ message: "Failed to fetch medication groups" });
  }
});

router.post('/api/medication-groups', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, name } = req.body;
    
    if (!hospitalId || !name) {
      return res.status(400).json({ message: "Hospital ID and name are required" });
    }

    const newGroup = await storage.createMedicationGroup({ hospitalId, name });
    res.status(201).json(newGroup);
  } catch (error: any) {
    console.error("Error creating medication group:", error);
    res.status(500).json({ message: "Failed to create medication group" });
  }
});

router.delete('/api/medication-groups/:groupId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    await storage.deleteMedicationGroup(groupId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting medication group:", error);
    res.status(500).json({ message: "Failed to delete medication group" });
  }
});

router.get('/api/administration-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const groups = await storage.getAdministrationGroups(hospitalId);
    res.json(groups);
  } catch (error: any) {
    console.error("Error fetching administration groups:", error);
    res.status(500).json({ message: "Failed to fetch administration groups" });
  }
});

router.post('/api/administration-groups', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, name } = req.body;
    
    if (!hospitalId || !name) {
      return res.status(400).json({ message: "Hospital ID and name are required" });
    }

    const existingGroups = await storage.getAdministrationGroups(hospitalId);
    const maxSortOrder = existingGroups.reduce((max, g) => Math.max(max, g.sortOrder ?? 0), -1);
    const nextSortOrder = maxSortOrder + 1;

    const newGroup = await storage.createAdministrationGroup({ hospitalId, name, sortOrder: nextSortOrder });
    res.status(201).json(newGroup);
  } catch (error: any) {
    console.error("Error creating administration group:", error);
    res.status(500).json({ message: "Failed to create administration group" });
  }
});

router.put('/api/administration-groups/reorder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { groupIds } = req.body;
    
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ message: "groupIds must be an array" });
    }

    await storage.reorderAdministrationGroups(groupIds);
    res.status(200).json({ message: "Groups reordered successfully" });
  } catch (error: any) {
    console.error("Error reordering administration groups:", error);
    res.status(500).json({ message: "Failed to reorder administration groups" });
  }
});

router.put('/api/administration-groups/:groupId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updatedGroup = await storage.updateAdministrationGroup(groupId, { name });
    res.json(updatedGroup);
  } catch (error: any) {
    console.error("Error updating administration group:", error);
    res.status(500).json({ message: "Failed to update administration group" });
  }
});

router.delete('/api/administration-groups/:groupId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { groupId } = req.params;
    await storage.deleteAdministrationGroup(groupId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting administration group:", error);
    res.status(500).json({ message: "Failed to delete administration group" });
  }
});

router.get('/api/surgery-rooms/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const rooms = await storage.getSurgeryRooms(hospitalId);
    res.json(rooms);
  } catch (error: any) {
    console.error("Error fetching surgery rooms:", error);
    res.status(500).json({ message: "Failed to fetch surgery rooms" });
  }
});

router.post('/api/surgery-rooms', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, name } = req.body;
    
    if (!hospitalId || !name) {
      return res.status(400).json({ message: "Hospital ID and name are required" });
    }

    const newRoom = await storage.createSurgeryRoom({ hospitalId, name, sortOrder: 0 });
    res.status(201).json(newRoom);
  } catch (error: any) {
    console.error("Error creating surgery room:", error);
    res.status(500).json({ message: "Failed to create surgery room" });
  }
});

router.put('/api/surgery-rooms/:roomId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roomId } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updatedRoom = await storage.updateSurgeryRoom(roomId, { name });
    res.json(updatedRoom);
  } catch (error: any) {
    console.error("Error updating surgery room:", error);
    res.status(500).json({ message: "Failed to update surgery room" });
  }
});

router.delete('/api/surgery-rooms/:roomId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roomId } = req.params;
    await storage.deleteSurgeryRoom(roomId);
    res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting surgery room:", error);
    res.status(500).json({ message: "Failed to delete surgery room" });
  }
});

router.put('/api/surgery-rooms/reorder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roomIds } = req.body;
    
    if (!Array.isArray(roomIds)) {
      return res.status(400).json({ message: "roomIds must be an array" });
    }

    await storage.reorderSurgeryRooms(roomIds);
    res.status(200).json({ message: "Rooms reordered successfully" });
  } catch (error: any) {
    console.error("Error reordering surgery rooms:", error);
    res.status(500).json({ message: "Failed to reorder surgery rooms" });
  }
});

router.get('/api/anesthesia/settings/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const settings = await storage.getHospitalAnesthesiaSettings(hospitalId);
    
    if (!settings) {
      return res.status(404).json({ message: "Settings not found" });
    }

    res.json(settings);
  } catch (error) {
    console.error("Error fetching anesthesia settings:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia settings" });
  }
});

router.patch('/api/anesthesia/settings/:hospitalId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const role = await getUserRole(userId, hospitalId);
    if (role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    const validatedData = insertHospitalAnesthesiaSettingsSchema.parse({
      hospitalId,
      ...req.body
    });

    const settings = await storage.upsertHospitalAnesthesiaSettings(validatedData);
    
    res.json(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error updating anesthesia settings:", error);
    res.status(500).json({ message: "Failed to update anesthesia settings" });
  }
});

router.get('/api/patients', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, search } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const patients = await storage.getPatients(hospitalId as string, search as string | undefined);
    
    res.json(patients);
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({ message: "Failed to fetch patients" });
  }
});

router.get('/api/patients/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(patient);
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({ message: "Failed to fetch patient" });
  }
});

router.post('/api/patients', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertPatientSchema.parse(req.body);

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    let patientNumber = validatedData.patientNumber;
    if (!patientNumber) {
      patientNumber = await storage.generatePatientNumber(validatedData.hospitalId);
    }

    const patient = await storage.createPatient({
      ...validatedData,
      patientNumber,
      createdBy: userId,
    });
    
    res.status(201).json(patient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating patient:", error);
    res.status(500).json({ message: "Failed to create patient" });
  }
});

router.patch('/api/patients/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingPatient = await storage.getPatient(id);
    
    if (!existingPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.updatePatient(id, req.body);
    
    res.json(patient);
  } catch (error) {
    console.error("Error updating patient:", error);
    res.status(500).json({ message: "Failed to update patient" });
  }
});

router.delete('/api/patients/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingPatient = await storage.getPatient(id);
    
    if (!existingPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await storage.deletePatient(id);
    
    res.json({ message: "Patient deleted successfully" });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({ message: "Failed to delete patient" });
  }
});

router.get('/api/anesthesia/cases', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, patientId, status } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const cases = await storage.getCases(hospitalId, patientId, status);
    
    res.json(cases);
  } catch (error) {
    console.error("Error fetching cases:", error);
    res.status(500).json({ message: "Failed to fetch cases" });
  }
});

router.get('/api/anesthesia/cases/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ message: "Case not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(caseData);
  } catch (error) {
    console.error("Error fetching case:", error);
    res.status(500).json({ message: "Failed to fetch case" });
  }
});

router.post('/api/anesthesia/cases', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertCaseSchema.parse(req.body);

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const newCase = await storage.createCase(validatedData);
    
    res.status(201).json(newCase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating case:", error);
    res.status(500).json({ message: "Failed to create case" });
  }
});

router.patch('/api/anesthesia/cases/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ message: "Case not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedCase = await storage.updateCase(id, req.body);
    
    res.json(updatedCase);
  } catch (error) {
    console.error("Error updating case:", error);
    res.status(500).json({ message: "Failed to update case" });
  }
});

router.get('/api/anesthesia/surgeries', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, caseId, patientId, status, roomId, dateFrom, dateTo } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const filters: any = {};
    if (caseId) filters.caseId = caseId;
    if (patientId) filters.patientId = patientId;
    if (status) filters.status = status;
    if (roomId) filters.roomId = roomId;
    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);

    const surgeries = await storage.getSurgeries(hospitalId as string, filters);
    
    const enrichedSurgeries = await Promise.all(
      surgeries.map(async (surgery) => {
        const anesthesiaRecord = await storage.getAnesthesiaRecord(surgery.id);
        return {
          ...surgery,
          timeMarkers: anesthesiaRecord?.timeMarkers || null,
        };
      })
    );
    
    res.json(enrichedSurgeries);
  } catch (error) {
    console.error("Error fetching surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

router.get('/api/anesthesia/surgeries/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(surgery);
  } catch (error) {
    console.error("Error fetching surgery:", error);
    res.status(500).json({ message: "Failed to fetch surgery" });
  }
});

router.post('/api/anesthesia/surgeries', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    console.log("Received surgery creation request:", JSON.stringify(req.body, null, 2));

    const validatedData = insertSurgerySchema.parse(req.body);
    
    console.log("Validated surgery data:", JSON.stringify(validatedData, null, 2));

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const newSurgery = await storage.createSurgery(validatedData);
    
    res.status(201).json(newSurgery);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating surgery:", error);
    res.status(500).json({ message: "Failed to create surgery" });
  }
});

router.patch('/api/anesthesia/surgeries/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updateData = { ...req.body };
    if (updateData.plannedDate && typeof updateData.plannedDate === 'string') {
      updateData.plannedDate = new Date(updateData.plannedDate);
    }
    if (updateData.actualEndTime && typeof updateData.actualEndTime === 'string') {
      updateData.actualEndTime = new Date(updateData.actualEndTime);
    }
    if (updateData.actualStartTime && typeof updateData.actualStartTime === 'string') {
      updateData.actualStartTime = new Date(updateData.actualStartTime);
    }

    const updatedSurgery = await storage.updateSurgery(id, updateData);
    
    res.json(updatedSurgery);
  } catch (error) {
    console.error("Error updating surgery:", error);
    res.status(500).json({ message: "Failed to update surgery" });
  }
});

router.delete('/api/anesthesia/surgeries/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const anesthesiaRecord = await storage.getAnesthesiaRecord(id).catch(() => null);
    
    if (anesthesiaRecord) {
      await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.anesthesiaRecordId, anesthesiaRecord.id));
      await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecord.id));
      await db.delete(vitalsSnapshots).where(eq(vitalsSnapshots.anesthesiaRecordId, anesthesiaRecord.id));
      await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, anesthesiaRecord.id));
    }

    await db.delete(preOpAssessments).where(eq(preOpAssessments.surgeryId, id));

    await storage.deleteSurgery(id);
    
    res.json({ message: "Surgery deleted successfully" });
  } catch (error) {
    console.error("Error deleting surgery:", error);
    res.status(500).json({ message: "Failed to delete surgery" });
  }
});

router.get('/api/anesthesia/records/surgery/:surgeryId', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const record = await storage.getAnesthesiaRecord(surgeryId);
    
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    res.json(record);
  } catch (error) {
    console.error("Error fetching anesthesia record:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia record" });
  }
});

// Get ALL anesthesia records for a surgery (for duplicate detection and management)
router.get('/api/anesthesia/records/surgery/:surgeryId/all', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const records = await storage.getAllAnesthesiaRecordsForSurgery(surgeryId);
    
    // Enrich each record with data counts
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
    console.error("Error fetching all anesthesia records for surgery:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia records" });
  }
});

router.get('/api/anesthesia/records/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    res.json(record);
  } catch (error) {
    console.error("Error fetching anesthesia record:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia record" });
  }
});

router.post('/api/anesthesia/records', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertAnesthesiaRecordSchema.parse(req.body);

    const surgery = await storage.getSurgery(validatedData.surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // GET-OR-CREATE: Check if an anesthesia record already exists for this surgery
    // This prevents duplicate records when multiple devices open the same surgery simultaneously
    const existingRecord = await storage.getAnesthesiaRecord(validatedData.surgeryId);
    if (existingRecord) {
      // Return the existing record instead of creating a duplicate
      console.log(`[ANESTHESIA] Returning existing record ${existingRecord.id} for surgery ${validatedData.surgeryId} (preventing duplicate)`);
      return res.status(200).json(existingRecord);
    }

    const newRecord = await storage.createAnesthesiaRecord(validatedData);
    console.log(`[ANESTHESIA] Created new record ${newRecord.id} for surgery ${validatedData.surgeryId}`);
    
    res.status(201).json(newRecord);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating anesthesia record:", error);
    res.status(500).json({ message: "Failed to create anesthesia record" });
  }
});

router.patch('/api/anesthesia/records/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    const updatedRecord = await storage.updateAnesthesiaRecord(id, req.body);
    
    res.json(updatedRecord);
  } catch (error) {
    console.error("Error updating anesthesia record:", error);
    res.status(500).json({ message: "Failed to update anesthesia record" });
  }
});

// Delete an anesthesia record (for duplicate cleanup)
router.delete('/api/anesthesia/records/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    // Safety check: Don't allow deleting the only record for a surgery
    const allRecords = await storage.getAllAnesthesiaRecordsForSurgery(record.surgeryId);
    if (allRecords.length <= 1) {
      return res.status(400).json({ 
        message: "Cannot delete the only anesthesia record for this surgery. At least one record must remain." 
      });
    }

    // Get data counts for audit logging
    const counts = await storage.getAnesthesiaRecordDataCounts(id);
    console.log(`[ANESTHESIA] Deleting duplicate record ${id} for surgery ${record.surgeryId} (vitals: ${counts.vitals}, meds: ${counts.medications}, events: ${counts.events})`);

    await storage.deleteAnesthesiaRecord(id);
    
    res.json({ message: "Anesthesia record deleted successfully" });
  } catch (error) {
    console.error("Error deleting anesthesia record:", error);
    res.status(500).json({ message: "Failed to delete anesthesia record" });
  }
});

router.patch('/api/anesthesia/records/:id/time-markers', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { timeMarkers } = req.body;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
    }

    // Check if P (PACU End) marker status is changing - this is the final timestamp
    // Only toggle lock when P status actually changes (set or cleared)
    // IMPORTANT: If P is omitted from the new array, we don't change lock status
    const updateData: { timeMarkers: any; isLocked?: boolean; lockedAt?: Date | null } = { timeMarkers };
    
    // Helper to normalize marker time to boolean - handles both ISO strings and numeric timestamps
    const hasValidTime = (marker: any): boolean => {
      if (!marker?.time) return false;
      // Handle both numeric timestamps and ISO strings
      const timeValue = typeof marker.time === 'string' ? Date.parse(marker.time) : marker.time;
      return typeof timeValue === 'number' && !isNaN(timeValue) && timeValue > 0;
    };
    
    if (Array.isArray(timeMarkers)) {
      // Get the previous P (PACU End) marker from existing record
      const existingTimeMarkers = record.timeMarkers as any[] | null;
      const previousP = Array.isArray(existingTimeMarkers) 
        ? existingTimeMarkers.find((m: any) => m.code === 'P')
        : null;
      const previousPHasTime = hasValidTime(previousP);
      
      // Get the new P marker from the update
      const newP = timeMarkers.find((m: any) => m.code === 'P');
      
      // Only process lock changes if P marker is actually present in the new array
      // If P is omitted entirely, we don't change lock status (partial update scenario)
      if (newP !== undefined) {
        const newPHasTime = hasValidTime(newP);
        
        console.log(`[TIME-MARKERS] P (PACU End) comparison for record ${id}:`, {
          previousPHasTime,
          newPHasTime,
          previousPTime: previousP?.time,
          newPTime: newP?.time,
          previousPRaw: JSON.stringify(previousP),
          newPRaw: JSON.stringify(newP),
          currentIsLocked: record.isLocked,
        });
        
        // Only change lock status if P (PACU End) status is actually changing
        if (newPHasTime && !previousPHasTime) {
          // P is being set for the first time - lock the record
          updateData.isLocked = true;
          updateData.lockedAt = new Date();
          console.log(`[TIME-MARKERS] P (PACU End) marker set for record ${id} - LOCKING record`);
        } else if (!newPHasTime && previousPHasTime) {
          // P is being explicitly cleared (time set to null/empty) - unlock the record
          updateData.isLocked = false;
          updateData.lockedAt = null;
          console.log(`[TIME-MARKERS] P (PACU End) marker cleared for record ${id} - UNLOCKING record`);
        } else if (newPHasTime && previousPHasTime && !record.isLocked) {
          // REPAIR: P has time but record is not locked (data inconsistency from before locking was implemented)
          // Lock the record to fix the inconsistency
          updateData.isLocked = true;
          updateData.lockedAt = new Date();
          console.log(`[TIME-MARKERS] P marker already set but record not locked for ${id} - REPAIRING: locking record`);
        } else {
          // P status unchanged and lock status is correct - no change needed
          console.log(`[TIME-MARKERS] P marker status unchanged for record ${id} - no lock change (both have time: ${newPHasTime && previousPHasTime}, both empty: ${!newPHasTime && !previousPHasTime})`);
        }
        // Log the final update data
        console.log(`[TIME-MARKERS] Update data for record ${id}:`, {
          willUpdateIsLocked: 'isLocked' in updateData,
          newIsLocked: updateData.isLocked,
        });
      }
      // If P is not in the new array at all, don't change lock status (partial update)
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
    console.error("Error updating time markers:", error);
    res.status(500).json({ message: "Failed to update time markers" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/sign-in', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating sign in checklist:", error);
    res.status(500).json({ message: "Failed to update sign in checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/time-out', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating time out checklist:", error);
    res.status(500).json({ message: "Failed to update time out checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/checklist/sign-out', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating sign out checklist:", error);
    res.status(500).json({ message: "Failed to update sign out checklist" });
  }
});

router.patch('/api/anesthesia/records/:id/postop', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating post-op data:", error);
    res.status(500).json({ message: "Failed to update post-op data" });
  }
});

router.patch('/api/anesthesia/records/:id/surgery-staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating surgery staff data:", error);
    res.status(500).json({ message: "Failed to update surgery staff data" });
  }
});

router.patch('/api/anesthesia/records/:id/intra-op', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
      dressing: { ...(existingData.dressing ?? {}), ...(validated.dressing ?? {}) },
      drainage: { ...(existingData.drainage ?? {}), ...(validated.drainage ?? {}) },
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
    console.error("Error updating intra-op data:", error);
    res.status(500).json({ message: "Failed to update intra-op data" });
  }
});

router.patch('/api/anesthesia/records/:id/counts-sterile', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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
    console.error("Error updating counts-sterile data:", error);
    res.status(500).json({ message: "Failed to update counts-sterile data" });
  }
});

router.post('/api/anesthesia/records/:id/close', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
      return res.status(400).json({ message: "Record is already closed" });
    }

    const closedRecord = await storage.closeAnesthesiaRecord(id, userId);
    
    res.json(closedRecord);
  } catch (error) {
    console.error("Error closing anesthesia record:", error);
    res.status(500).json({ message: "Failed to close anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/amend', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (record.caseStatus !== 'closed') {
      return res.status(400).json({ message: "Can only amend closed records" });
    }

    const amendedRecord = await storage.amendAnesthesiaRecord(id, updates, reason, userId);
    
    res.json(amendedRecord);
  } catch (error) {
    console.error("Error amending anesthesia record:", error);
    res.status(500).json({ message: "Failed to amend anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/lock', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(id);
    
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

    if (record.isLocked) {
      return res.status(400).json({ message: "Record is already locked" });
    }

    const lockedRecord = await storage.lockAnesthesiaRecord(id, userId);
    
    res.json(lockedRecord);
  } catch (error) {
    console.error("Error locking anesthesia record:", error);
    res.status(500).json({ message: "Failed to lock anesthesia record" });
  }
});

router.post('/api/anesthesia/records/:id/unlock', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!record.isLocked) {
      return res.status(400).json({ message: "Record is not locked" });
    }

    const unlockedRecord = await storage.unlockAnesthesiaRecord(id, userId, reason.trim());
    
    res.json(unlockedRecord);
  } catch (error) {
    console.error("Error unlocking anesthesia record:", error);
    res.status(500).json({ message: "Failed to unlock anesthesia record" });
  }
});

router.get('/api/anesthesia/pacu/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pacuPatients = await storage.getPacuPatients(hospitalId);
    
    res.json(pacuPatients);
  } catch (error) {
    console.error("Error fetching PACU patients:", error);
    res.status(500).json({ message: "Failed to fetch PACU patients" });
  }
});

router.get('/api/anesthesia/preop', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const assessments = await storage.getPreOpAssessments(hospitalId as string);
    
    res.json(assessments);
  } catch (error) {
    console.error("Error fetching pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessments" });
  }
});

router.get('/api/anesthesia/preop/surgery/:surgeryId', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const assessment = await storage.getPreOpAssessment(surgeryId);
    
    res.json(assessment || null);
  } catch (error) {
    console.error("Error fetching pre-op assessment:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessment" });
  }
});

router.get('/api/anesthesia/preop-assessments/bulk', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryIds } = req.query;
    const userId = req.user.id;

    if (!surgeryIds) {
      return res.json([]);
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hospitalIds = hospitals.map(h => h.id);

    const surgeryIdArray = (surgeryIds as string).split(',');
    
    const assessments = await storage.getPreOpAssessmentsBySurgeryIds(surgeryIdArray, hospitalIds);
    
    res.json(assessments);
  } catch (error) {
    console.error("Error fetching bulk pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch pre-op assessments" });
  }
});

router.post('/api/anesthesia/preop', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertPreOpAssessmentSchema.parse(req.body);

    const surgery = await storage.getSurgery(validatedData.surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (validatedData.allergies !== undefined || validatedData.allergiesOther !== undefined) {
      const patientUpdates: any = {};
      
      if (validatedData.allergies !== undefined) {
        patientUpdates.allergies = validatedData.allergies;
      }
      
      if (validatedData.allergiesOther !== undefined) {
        patientUpdates.otherAllergies = validatedData.allergiesOther;
      }
      
      await storage.updatePatient(surgery.patientId, patientUpdates);
    }

    const newAssessment = await storage.createPreOpAssessment(validatedData);
    
    res.status(201).json(newAssessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating pre-op assessment:", error);
    res.status(500).json({ message: "Failed to create pre-op assessment" });
  }
});

router.patch('/api/anesthesia/preop/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const assessment = await storage.getPreOpAssessmentById(id);
    
    if (!assessment) {
      return res.status(404).json({ message: "Pre-op assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.body.allergies !== undefined || req.body.allergiesOther !== undefined) {
      const patientUpdates: any = {};
      
      if (req.body.allergies !== undefined) {
        patientUpdates.allergies = req.body.allergies;
      }
      
      if (req.body.allergiesOther !== undefined) {
        patientUpdates.otherAllergies = req.body.allergiesOther;
      }
      
      await storage.updatePatient(surgery.patientId, patientUpdates);
    }

    const updatedAssessment = await storage.updatePreOpAssessment(id, req.body);
    
    res.json(updatedAssessment);
  } catch (error) {
    console.error("Error updating pre-op assessment:", error);
    res.status(500).json({ message: "Failed to update pre-op assessment" });
  }
});

router.get('/api/anesthesia/vitals/:recordId', isAuthenticated, async (req: any, res) => {
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

    const vitals = await storage.getVitalsSnapshots(recordId);
    
    res.json(vitals);
  } catch (error) {
    console.error("Error fetching vitals snapshots:", error);
    res.status(500).json({ message: "Failed to fetch vitals snapshots" });
  }
});

router.post('/api/anesthesia/vitals', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    console.log('[VITALS] Received payload:', JSON.stringify(req.body, null, 2));
    const validatedData = insertVitalsSnapshotSchema.parse(req.body);
    console.log('[VITALS] Validation successful:', JSON.stringify(validatedData, null, 2));

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

    const newVital = await storage.createVitalsSnapshot(validatedData);
    
    res.status(201).json(newVital);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[VITALS] Zod validation error:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating vitals snapshot:", error);
    res.status(500).json({ message: "Failed to create vitals snapshot" });
  }
});

router.get('/api/anesthesia/vitals/snapshot/:recordId', isAuthenticated, async (req: any, res) => {
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

    const snapshot = await storage.getClinicalSnapshot(recordId);
    const snapshotData = snapshot?.data as any;
    console.log('[SNAPSHOT-GET] Returning snapshot for', recordId, 'keys:', snapshotData ? Object.keys(snapshotData) : 'null');
    if (snapshotData?.pip) console.log('[SNAPSHOT-GET] pip count:', snapshotData.pip.length);
    if (snapshotData?.peep) console.log('[SNAPSHOT-GET] peep count:', snapshotData.peep.length);
    res.json(snapshot);
  } catch (error) {
    console.error("Error getting clinical snapshot:", error);
    res.status(500).json({ message: "Failed to get clinical snapshot" });
  }
});

router.post('/api/anesthesia/vitals/points', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addVitalPointSchema.parse(req.body);
    const recordId = validatedData.anesthesiaRecordId;

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
    console.error("Error adding vital point:", error);
    res.status(500).json({ message: "Failed to add vital point" });
  }
});

router.post('/api/anesthesia/vitals/bp', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addBPPointSchema.parse(req.body);
    const recordId = validatedData.anesthesiaRecordId;

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
    console.error("Error adding BP point:", error);
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
    console.error("Error updating vital point:", error);
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
    console.error("Error updating BP point:", error);
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
    console.error("Error deleting vital point:", error);
    res.status(500).json({ message: "Failed to delete vital point" });
  }
});

router.post('/api/anesthesia/rhythm', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addRhythmPointSchema.parse(req.body);

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
    console.error("Error adding rhythm point:", error);
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
    console.error("Error updating rhythm point:", error);
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
    console.error("Error deleting rhythm point:", error);
    res.status(500).json({ message: "Failed to delete rhythm point" });
  }
});

router.post('/api/anesthesia/tof', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const validatedData = addTOFPointSchema.parse(req.body);

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
    console.error("Error adding TOF point:", error);
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
    console.error("Error updating TOF point:", error);
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
    console.error("Error deleting TOF point:", error);
    res.status(500).json({ message: "Failed to delete TOF point" });
  }
});

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
    console.error("Error adding ventilation mode point:", error);
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
    console.error("Error updating ventilation mode point:", error);
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
    console.error("Error deleting ventilation mode point:", error);
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
      section: 'ventilation',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(updatedSnapshot);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[VENTILATION-BULK] Zod validation error:", JSON.stringify(error.errors, null, 2));
      console.error("[VENTILATION-BULK] Request body was:", JSON.stringify(req.body, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error adding bulk ventilation parameters:", error);
    res.status(500).json({ message: "Failed to add bulk ventilation parameters" });
  }
});

// PUT - Update ventilation parameters at a specific timestamp (replace existing values)
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

    // Update the ventilation parameters at the original timestamp
    const updatedSnapshot = await storage.updateBulkVentilationParameters(
      anesthesiaRecordId,
      originalTimestamp,
      newTimestamp || originalTimestamp,
      parameters
    );
    
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
    console.error("Error updating bulk ventilation parameters:", error);
    res.status(500).json({ message: "Failed to update bulk ventilation parameters" });
  }
});

// DELETE - Delete all ventilation parameters at a specific timestamp
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

    // Delete all ventilation parameters at this timestamp
    const updatedSnapshot = await storage.deleteBulkVentilationParameters(
      anesthesiaRecordId as string,
      timestamp as string
    );
    
    broadcastAnesthesiaUpdate({
      recordId: anesthesiaRecordId as string,
      section: 'ventilation',
      data: updatedSnapshot,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updatedSnapshot);
  } catch (error) {
    console.error("Error deleting bulk ventilation parameters:", error);
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
    console.error("Error adding output point:", error);
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
    console.error("Error updating output point:", error);
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
    console.error("Error deleting output point:", error);
    res.status(500).json({ message: "Failed to delete output point" });
  }
});

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
    console.error("Error fetching medications:", error);
    res.status(500).json({ message: "Failed to fetch medications" });
  }
});

router.post('/api/anesthesia/medications', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    console.log('[TIMESTAMP-DEBUG] Backend received medication POST:', {
      rawTimestamp: req.body.timestamp,
      rawTimestampType: typeof req.body.timestamp,
    });

    const validatedData = insertAnesthesiaMedicationSchema.parse(req.body);
    
    console.log('[TIMESTAMP-DEBUG] After Zod validation:', {
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
    
    res.status(201).json(newMedication);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating medication:", error);
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

    console.log('[MEDICATION-UPDATE] Updating medication:', { id, updates });

    const updatedMedication = await storage.updateAnesthesiaMedication(id, updates, userId);
    
    console.log('[MEDICATION-UPDATE] Updated result:', updatedMedication);
    
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
    console.error("Error updating medication:", error);
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
    console.error("Error deleting medication:", error);
    res.status(500).json({ message: "Failed to delete medication" });
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
    console.error("Error fetching events:", error);
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
    console.error("Error creating event:", error);
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
    console.error("Error updating event:", error);
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
    console.error("Error deleting event:", error);
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
    console.error("Error fetching positions:", error);
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
    console.error("Error creating position:", error);
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
    console.error("Error updating position:", error);
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
    console.error("Error deleting position:", error);
    res.status(500).json({ message: "Failed to delete position" });
  }
});

router.get('/api/anesthesia/staff/:recordId', isAuthenticated, async (req: any, res) => {
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

    const staff = await storage.getSurgeryStaff(recordId);
    
    res.json(staff);
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
});

router.get('/api/anesthesia/staff-options/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { staffRole } = req.query;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const surgeryUnit = allUnits.find(u => u.isSurgeryModule);
    const anesthesiaUnit = allUnits.find(u => u.isAnesthesiaModule);
    
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    let filteredUsers: Array<{ id: string; name: string; email: string | null; role: string; unitName: string }> = [];
    
    const roleToUnitAndUserRole: Record<string, { unitId: string | undefined; userRoles: string[] }> = {
      surgeon: { unitId: surgeryUnit?.id, userRoles: ['doctor'] },
      surgicalAssistant: { unitId: surgeryUnit?.id, userRoles: ['doctor', 'nurse'] },
      instrumentNurse: { unitId: surgeryUnit?.id, userRoles: ['nurse'] },
      circulatingNurse: { unitId: surgeryUnit?.id, userRoles: ['nurse'] },
      anesthesiologist: { unitId: anesthesiaUnit?.id, userRoles: ['doctor'] },
      anesthesiaNurse: { unitId: anesthesiaUnit?.id, userRoles: ['nurse'] },
      pacuNurse: { unitId: anesthesiaUnit?.id, userRoles: ['nurse'] },
    };
    
    if (staffRole && roleToUnitAndUserRole[staffRole as string]) {
      const config = roleToUnitAndUserRole[staffRole as string];
      if (config.unitId) {
        filteredUsers = hospitalUsers
          .filter(hu => hu.unitId === config.unitId && config.userRoles.includes(hu.role))
          .map(hu => ({
            id: hu.user.id,
            name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
            email: hu.user.email,
            role: hu.role,
            unitName: hu.unit?.name || '',
          }));
      }
    } else {
      filteredUsers = hospitalUsers.map(hu => ({
        id: hu.user.id,
        name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
        email: hu.user.email,
        role: hu.role,
        unitName: hu.unit?.name || '',
      }));
    }
    
    const uniqueUsers = Array.from(new Map(filteredUsers.map(u => [u.id, u])).values());
    
    res.json(uniqueUsers);
  } catch (error) {
    console.error("Error fetching staff options:", error);
    res.status(500).json({ message: "Failed to fetch staff options" });
  }
});

router.get('/api/anesthesia/all-staff-options/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const surgeryUnit = allUnits.find(u => u.isSurgeryModule);
    const anesthesiaUnit = allUnits.find(u => u.isAnesthesiaModule);
    
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    const staffUsers = hospitalUsers
      .filter(hu => {
        const isInSurgeryUnit = surgeryUnit && hu.unitId === surgeryUnit.id;
        const isInAnesthesiaUnit = anesthesiaUnit && hu.unitId === anesthesiaUnit.id;
        return isInSurgeryUnit || isInAnesthesiaUnit;
      })
      .map(hu => {
        let staffRole = 'anesthesiaNurse';
        if (surgeryUnit && hu.unitId === surgeryUnit.id) {
          staffRole = hu.role === 'doctor' ? 'surgeon' : 'instrumentNurse';
        } else if (anesthesiaUnit && hu.unitId === anesthesiaUnit.id) {
          staffRole = hu.role === 'doctor' ? 'anesthesiologist' : 'anesthesiaNurse';
        }
        
        return {
          id: hu.user.id,
          name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
          email: hu.user.email,
          staffRole,
        };
      });
    
    const uniqueUsers = Array.from(new Map(staffUsers.map(u => [u.id, u])).values());
    
    res.json(uniqueUsers);
  } catch (error) {
    console.error("Error fetching all staff options:", error);
    res.status(500).json({ message: "Failed to fetch staff options" });
  }
});

router.post('/api/anesthesia/staff-user/:hospitalId', isAuthenticated, requireAdminRole, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { name, staffRole } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!staffRole) {
      return res.status(400).json({ message: "Staff role is required" });
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name.trim();
    const lastName = nameParts.slice(1).join(' ') || '';

    const { nanoid } = await import('nanoid');
    const newUserId = nanoid();
    const uniqueSuffix = nanoid(8);
    const dummyEmail = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff'}.${uniqueSuffix}@staff.local`;

    const existingUser = await storage.searchUserByEmail(dummyEmail);
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists. Please try again." });
    }

    const roleToUnitAndUserRole: Record<string, { unitType: 'surgery' | 'anesthesia'; userRole: string }> = {
      surgeon: { unitType: 'surgery', userRole: 'doctor' },
      surgicalAssistant: { unitType: 'surgery', userRole: 'nurse' },
      instrumentNurse: { unitType: 'surgery', userRole: 'nurse' },
      circulatingNurse: { unitType: 'surgery', userRole: 'nurse' },
      anesthesiologist: { unitType: 'anesthesia', userRole: 'doctor' },
      anesthesiaNurse: { unitType: 'anesthesia', userRole: 'nurse' },
      pacuNurse: { unitType: 'anesthesia', userRole: 'nurse' },
    };

    const roleConfig = roleToUnitAndUserRole[staffRole];
    if (!roleConfig) {
      return res.status(400).json({ message: "Invalid staff role" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const targetUnit = allUnits.find(u => 
      roleConfig.unitType === 'surgery' ? u.isSurgeryModule : u.isAnesthesiaModule
    );

    if (!targetUnit) {
      return res.status(400).json({ message: `No ${roleConfig.unitType} unit found for this hospital` });
    }

    const [newUser] = await db
      .insert(users)
      .values({
        id: newUserId,
        email: dummyEmail,
        firstName,
        lastName: lastName || null,
        canLogin: false,
        staffType: 'internal',
      })
      .returning();

    await db
      .insert(userHospitalRoles)
      .values({
        userId: newUser.id,
        hospitalId,
        unitId: targetUnit.id,
        role: roleConfig.userRole,
      });

    res.status(201).json({
      id: newUser.id,
      name: `${newUser.firstName || ''} ${newUser.lastName || ''}`.trim(),
      email: newUser.email,
      role: roleConfig.userRole,
      unitId: targetUnit.id,
    });
  } catch (error) {
    console.error("Error creating quick staff user:", error);
    res.status(500).json({ message: "Failed to create staff user" });
  }
});

router.post('/api/anesthesia/staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertSurgeryStaffEntrySchema.parse(req.body);

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

    const newStaff = await storage.createSurgeryStaff({
      ...validatedData,
      createdBy: userId,
    });
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'staff',
      data: newStaff,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(newStaff);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating staff:", error);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

router.patch('/api/anesthesia/staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updateSchema = z.object({
      role: z.enum([
        "surgeon", "surgicalAssistant", "instrumentNurse", 
        "circulatingNurse", "anesthesiologist", "anesthesiaNurse"
      ]).optional(),
      userId: z.string().nullable().optional(),
      name: z.string().optional(),
    });
    
    const validatedUpdates = updateSchema.parse(req.body);

    if (Object.keys(validatedUpdates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const [staff] = await db.select().from(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
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

    const updated = await storage.updateSurgeryStaff(id, validatedUpdates, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: staff.anesthesiaRecordId,
      section: 'staff',
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
    console.error("Error updating staff:", error);
    res.status(500).json({ message: "Failed to update staff" });
  }
});

router.delete('/api/anesthesia/staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [staff] = await db.select().from(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
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

    await storage.deleteSurgeryStaff(id, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: staff.anesthesiaRecordId,
      section: 'staff',
      data: { deleted: id },
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting staff:", error);
    res.status(500).json({ message: "Failed to delete staff" });
  }
});

router.get('/api/anesthesia/installations/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const installations = await storage.getAnesthesiaInstallations(recordId);
    res.json(installations);
  } catch (error) {
    console.error("Error fetching installations:", error);
    res.status(500).json({ message: "Failed to fetch installations" });
  }
});

router.post('/api/anesthesia/installations', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const validated = insertAnesthesiaInstallationSchema.parse(req.body);
    const record = await storage.getAnesthesiaRecordById(validated.anesthesiaRecordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const created = await storage.createAnesthesiaInstallation(validated);
    res.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error creating installation:", error);
    res.status(500).json({ message: "Failed to create installation" });
  }
});

router.patch('/api/anesthesia/installations/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const validated = insertAnesthesiaInstallationSchema.partial().parse(req.body);
    const updated = await storage.updateAnesthesiaInstallation(req.params.id, validated);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error updating installation:", error);
    res.status(500).json({ message: "Failed to update installation" });
  }
});

router.delete('/api/anesthesia/installations/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    await storage.deleteAnesthesiaInstallation(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting installation:", error);
    res.status(500).json({ message: "Failed to delete installation" });
  }
});

router.get('/api/anesthesia/technique-details/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const details = await storage.getAnesthesiaTechniqueDetails(recordId);
    res.json(details);
  } catch (error) {
    console.error("Error fetching technique details:", error);
    res.status(500).json({ message: "Failed to fetch technique details" });
  }
});

router.post('/api/anesthesia/technique-details', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const validated = insertAnesthesiaTechniqueDetailSchema.parse(req.body);
    const record = await storage.getAnesthesiaRecordById(validated.anesthesiaRecordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const created = await storage.upsertAnesthesiaTechniqueDetail(validated);
    res.json(created);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error upserting technique detail:", error);
    res.status(500).json({ message: "Failed to upsert technique detail" });
  }
});

router.get('/api/anesthesia/:recordId/airway', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const airway = await storage.getAirwayManagement(recordId);
    res.json(airway);
  } catch (error) {
    console.error("Error fetching airway management:", error);
    res.status(500).json({ message: "Failed to fetch airway management" });
  }
});

router.post('/api/anesthesia/:recordId/airway', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const validated = insertAnesthesiaAirwayManagementSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const airway = await storage.upsertAirwayManagement(validated);
    res.json(airway);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error upserting airway management:", error);
    res.status(500).json({ message: "Failed to upsert airway management" });
  }
});

router.delete('/api/anesthesia/:recordId/airway', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    await storage.deleteAirwayManagement(recordId);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting airway management:", error);
    res.status(500).json({ message: "Failed to delete airway management" });
  }
});

router.get('/api/airway/:airwayId/difficult-airway-report', isAuthenticated, async (req: any, res) => {
  try {
    const { airwayId } = req.params;
    const userId = req.user.id;
    
    const airway = await db.select().from(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.id, airwayId)).limit(1);
    if (!airway[0]) return res.status(404).json({ message: "Airway management not found" });
    
    const record = await storage.getAnesthesiaRecordById(airway[0].anesthesiaRecordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    
    const report = await storage.getDifficultAirwayReport(airwayId);
    res.json(report || null);
  } catch (error) {
    console.error("Error fetching difficult airway report:", error);
    res.status(500).json({ message: "Failed to fetch difficult airway report" });
  }
});

router.post('/api/airway/:airwayId/difficult-airway-report', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { airwayId } = req.params;
    const userId = req.user.id;
    
    const airway = await db.select().from(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.id, airwayId)).limit(1);
    if (!airway[0]) return res.status(404).json({ message: "Airway management not found" });
    
    const record = await storage.getAnesthesiaRecordById(airway[0].anesthesiaRecordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    
    const validated = insertDifficultAirwayReportSchema.parse({ 
      ...req.body, 
      airwayManagementId: airwayId,
      createdBy: userId 
    });
    const report = await storage.upsertDifficultAirwayReport(validated);
    res.json(report);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error upserting difficult airway report:", error);
    res.status(500).json({ message: "Failed to upsert difficult airway report" });
  }
});

router.get('/api/anesthesia/:recordId/general-technique', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const technique = await storage.getGeneralTechnique(recordId);
    res.json(technique);
  } catch (error) {
    console.error("Error fetching general technique:", error);
    res.status(500).json({ message: "Failed to fetch general technique" });
  }
});

router.post('/api/anesthesia/:recordId/general-technique', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const validated = insertAnesthesiaGeneralTechniqueSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const technique = await storage.upsertGeneralTechnique(validated);
    res.json(technique);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error upserting general technique:", error);
    res.status(500).json({ message: "Failed to upsert general technique" });
  }
});

router.delete('/api/anesthesia/:recordId/general-technique', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    await storage.deleteGeneralTechnique(recordId);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting general technique:", error);
    res.status(500).json({ message: "Failed to delete general technique" });
  }
});

router.get('/api/anesthesia/:recordId/neuraxial-blocks', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const blocks = await storage.getNeuraxialBlocks(recordId);
    console.log('[NEURAXIAL-GET] Fetched blocks:', { recordId, count: blocks.length, blocks });
    res.json(blocks);
  } catch (error) {
    console.error("Error fetching neuraxial blocks:", error);
    res.status(500).json({ message: "Failed to fetch neuraxial blocks" });
  }
});

router.post('/api/anesthesia/:recordId/neuraxial-blocks', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const validated = insertAnesthesiaNeuraxialBlockSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const block = await storage.createNeuraxialBlock(validated);
    res.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error creating neuraxial block:", error);
    res.status(500).json({ message: "Failed to create neuraxial block" });
  }
});

router.patch('/api/anesthesia/:recordId/neuraxial-blocks/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId, id } = req.params;
    const userId = req.user.id;
    const validated = insertAnesthesiaNeuraxialBlockSchema.partial().parse(req.body);
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const block = await storage.updateNeuraxialBlock(id, validated);
    res.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error updating neuraxial block:", error);
    res.status(500).json({ message: "Failed to update neuraxial block" });
  }
});

router.delete('/api/anesthesia/:recordId/neuraxial-blocks/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId, id } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    await storage.deleteNeuraxialBlock(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting neuraxial block:", error);
    res.status(500).json({ message: "Failed to delete neuraxial block" });
  }
});

router.get('/api/anesthesia/:recordId/peripheral-blocks', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const blocks = await storage.getPeripheralBlocks(recordId);
    console.log('[PERIPHERAL-GET] Fetched blocks:', { recordId, count: blocks.length, blocks });
    res.json(blocks);
  } catch (error) {
    console.error("Error fetching peripheral blocks:", error);
    res.status(500).json({ message: "Failed to fetch peripheral blocks" });
  }
});

router.post('/api/anesthesia/:recordId/peripheral-blocks', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const validated = insertAnesthesiaPeripheralBlockSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(req.user.id);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const block = await storage.createPeripheralBlock(validated);
    res.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error creating peripheral block:", error);
    res.status(500).json({ message: "Failed to create peripheral block" });
  }
});

router.patch('/api/anesthesia/:recordId/peripheral-blocks/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId, id } = req.params;
    const userId = req.user.id;
    const validated = insertAnesthesiaPeripheralBlockSchema.partial().parse(req.body);
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    const block = await storage.updatePeripheralBlock(id, validated);
    res.json(block);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
    console.error("Error updating peripheral block:", error);
    res.status(500).json({ message: "Failed to update peripheral block" });
  }
});

router.delete('/api/anesthesia/:recordId/peripheral-blocks/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId, id } = req.params;
    const userId = req.user.id;
    const record = await storage.getAnesthesiaRecordById(recordId);
    if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) return res.status(404).json({ message: "Surgery not found" });
    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
    await storage.deletePeripheralBlock(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting peripheral block:", error);
    res.status(500).json({ message: "Failed to delete peripheral block" });
  }
});

router.get('/api/anesthesia/inventory/:recordId', isAuthenticated, async (req: any, res) => {
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

    const inventory = await storage.getInventoryUsage(recordId);
    
    res.json(inventory);
  } catch (error) {
    console.error("Error fetching inventory usage:", error);
    res.status(500).json({ message: "Failed to fetch inventory usage" });
  }
});

router.post('/api/anesthesia/inventory/:recordId/calculate', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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

    const inventory = await storage.calculateInventoryUsage(recordId);
    
    res.json(inventory);
  } catch (error) {
    console.error("Error calculating inventory usage:", error);
    res.status(500).json({ message: "Failed to calculate inventory usage" });
  }
});

router.post('/api/anesthesia/inventory/:recordId/manual', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;
    const { itemId, qty, reason } = req.body;

    if (!itemId || typeof itemId !== 'string') {
      return res.status(400).json({ message: "Item ID is required" });
    }

    if (typeof qty !== 'number' || qty < 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

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

    const created = await storage.createManualInventoryUsage(
      recordId,
      itemId,
      qty,
      reason || "Manual adjustment",
      userId
    );
    
    res.json(created);
  } catch (error) {
    console.error("Error creating manual inventory usage:", error);
    res.status(500).json({ message: "Failed to create manual inventory usage" });
  }
});

router.patch('/api/anesthesia/inventory/:id/override', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { overrideQty, overrideReason } = req.body;

    if (typeof overrideQty !== 'number' || overrideQty < 0) {
      return res.status(400).json({ message: "Invalid override quantity" });
    }

    if (!overrideReason || typeof overrideReason !== 'string') {
      return res.status(400).json({ message: "Override reason is required" });
    }

    const inventory = await storage.getInventoryUsageById(id);
    
    if (!inventory) {
      return res.status(404).json({ message: "Inventory usage not found" });
    }

    const record = await storage.getAnesthesiaRecordById(inventory.anesthesiaRecordId);
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

    const updatedInventory = await storage.updateInventoryUsage(
      id,
      overrideQty,
      overrideReason,
      userId
    );
    
    res.json(updatedInventory);
  } catch (error) {
    console.error("Error setting inventory override:", error);
    res.status(500).json({ message: "Failed to set inventory override" });
  }
});

router.delete('/api/anesthesia/inventory/:id/override', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const inventory = await storage.getInventoryUsageById(id);
    
    if (!inventory) {
      return res.status(404).json({ message: "Inventory usage not found" });
    }

    const record = await storage.getAnesthesiaRecordById(inventory.anesthesiaRecordId);
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

    const updatedInventory = await storage.clearInventoryOverride(id);
    
    res.json(updatedInventory);
  } catch (error) {
    console.error("Error clearing inventory override:", error);
    res.status(500).json({ message: "Failed to clear inventory override" });
  }
});

router.post('/api/anesthesia/inventory/:recordId/commit', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const { signature, module: moduleType } = req.body;
    const userId = req.user.id;

    if (!moduleType || (moduleType !== 'anesthesia' && moduleType !== 'surgery')) {
      return res.status(400).json({ message: "Module type is required (anesthesia or surgery)" });
    }

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

    const unitsData = await storage.getUnits(surgery.hospitalId);
    let targetUnitId: string | null = null;

    if (moduleType === 'anesthesia') {
      const anesthesiaUnit = unitsData.find(u => u.isAnesthesiaModule);
      if (!anesthesiaUnit) {
        return res.status(400).json({ message: "No anesthesia unit configured for this hospital" });
      }
      targetUnitId = anesthesiaUnit.id;
    } else if (moduleType === 'surgery') {
      const surgeryUnit = unitsData.find(u => u.isSurgeryModule);
      if (!surgeryUnit) {
        return res.status(400).json({ message: "No surgery unit configured for this hospital" });
      }
      targetUnitId = surgeryUnit.id;
    }

    const hasModuleAccess = hospitals.some(h => {
      if (h.id !== surgery.hospitalId || h.unitId !== targetUnitId) return false;
      
      if (moduleType === 'anesthesia' && !h.isAnesthesiaModule) return false;
      if (moduleType === 'surgery' && !h.isSurgeryModule) return false;
      
      return true;
    });
    if (!hasModuleAccess) {
      return res.status(403).json({ message: "Access denied: You are not authorized for this module" });
    }

    const commit = await storage.commitInventoryUsage(
      recordId,
      userId,
      signature,
      surgery.patientId,
      surgery.patientId,
      targetUnitId
    );

    res.json(commit);
  } catch (error) {
    console.error("Error committing inventory:", error);
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to commit inventory" });
  }
});

router.get('/api/anesthesia/inventory/:recordId/commits', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const { unitId } = req.query;
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

    if (unitId) {
      const hasUnitAccess = hospitals.some(h => h.id === surgery.hospitalId && h.unitId === unitId);
      if (!hasUnitAccess) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }

    const commits = await storage.getInventoryCommits(recordId, unitId as string | undefined);
    res.json(commits);
  } catch (error) {
    console.error("Error fetching commit history:", error);
    res.status(500).json({ message: "Failed to fetch commit history" });
  }
});

router.post('/api/anesthesia/inventory/commits/:commitId/rollback', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { commitId } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const commit = await storage.getInventoryCommitById(commitId);
    if (!commit) {
      return res.status(404).json({ message: "Commit not found" });
    }

    const record = await storage.getAnesthesiaRecordById(commit.anesthesiaRecordId);
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

    if (commit.unitId) {
      const hasUnitAccess = hospitals.some(h => h.id === surgery.hospitalId && h.unitId === commit.unitId);
      if (!hasUnitAccess) {
        return res.status(403).json({ message: "Access denied: You can only rollback commits from your own module/unit" });
      }
    }

    const rolledBackCommit = await storage.rollbackInventoryCommit(commitId, userId, reason);
    res.json(rolledBackCommit);
  } catch (error) {
    console.error("Error rolling back commit:", error);
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to rollback commit" });
  }
});

router.get('/api/anesthesia/audit/:recordType/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordType, recordId } = req.params;
    const userId = req.user.id;

    const validRecordTypes = ['anesthesia_record', 'vitals_snapshot', 'medication', 'preop_assessment'];
    if (!validRecordTypes.includes(recordType)) {
      return res.status(400).json({ message: "Invalid record type" });
    }

    const auditTrail = await storage.getAuditTrail(recordType, recordId);
    
    res.json(auditTrail);
  } catch (error) {
    console.error("Error fetching audit trail:", error);
    res.status(500).json({ message: "Failed to fetch audit trail" });
  }
});

router.get('/api/anesthesia/billing/:recordId', isAuthenticated, async (req: any, res) => {
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

    let timeUnits = 0;
    let totalMinutes = 0;

    if (record.anesthesiaStartTime && record.anesthesiaEndTime) {
      const startTime = new Date(record.anesthesiaStartTime).getTime();
      const endTime = new Date(record.anesthesiaEndTime).getTime();
      totalMinutes = Math.floor((endTime - startTime) / (1000 * 60));
      
      timeUnits = Math.ceil(totalMinutes / 15);
    }

    const modifiers: string[] = [];
    
    if (record.physicalStatus) {
      modifiers.push(record.physicalStatus);
    }

    if (record.emergencyCase) {
      modifiers.push('EMERGENCY');
    }

    const billingSummary = {
      recordId: record.id,
      surgeryId: record.surgeryId,
      anesthesiaStartTime: record.anesthesiaStartTime,
      anesthesiaEndTime: record.anesthesiaEndTime,
      totalMinutes,
      timeUnits,
      procedureCode: record.procedureCode,
      diagnosisCodes: record.diagnosisCodes || [],
      physicalStatus: record.physicalStatus,
      emergencyCase: record.emergencyCase,
      modifiers,
      providerId: record.providerId,
    };

    res.json(billingSummary);
  } catch (error) {
    console.error("Error generating billing report:", error);
    res.status(500).json({ message: "Failed to generate billing report" });
  }
});

// =====================================
// Daily Staff Pool Endpoints
// =====================================

// Get staff pool for a specific date
router.get('/api/staff-pool/:hospitalId/:date', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, date } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const staffPool = await db
      .select({
        id: dailyStaffPool.id,
        hospitalId: dailyStaffPool.hospitalId,
        date: dailyStaffPool.date,
        userId: dailyStaffPool.userId,
        name: dailyStaffPool.name,
        role: dailyStaffPool.role,
        createdBy: dailyStaffPool.createdBy,
        createdAt: dailyStaffPool.createdAt,
      })
      .from(dailyStaffPool)
      .where(
        and(
          eq(dailyStaffPool.hospitalId, hospitalId),
          eq(dailyStaffPool.date, date)
        )
      );

    // Get planned assignments and room assignments for each staff pool member
    const poolWithAssignments = await Promise.all(
      staffPool.map(async (staff) => {
        // Get surgery assignments (legacy)
        const surgeryAssignments = await db
          .select({
            surgeryId: plannedSurgeryStaff.surgeryId,
          })
          .from(plannedSurgeryStaff)
          .where(eq(plannedSurgeryStaff.dailyStaffPoolId, staff.id));
        
        // Get room assignments (new)
        const roomAssignments = await db
          .select({
            roomId: dailyRoomStaff.surgeryRoomId,
            roomName: surgeryRooms.name,
          })
          .from(dailyRoomStaff)
          .innerJoin(surgeryRooms, eq(dailyRoomStaff.surgeryRoomId, surgeryRooms.id))
          .where(eq(dailyRoomStaff.dailyStaffPoolId, staff.id));
        
        return {
          ...staff,
          assignedSurgeryIds: surgeryAssignments.map(a => a.surgeryId),
          assignedRooms: roomAssignments.map(r => ({ roomId: r.roomId, roomName: r.roomName })),
          isBooked: surgeryAssignments.length > 0 || roomAssignments.length > 0,
        };
      })
    );

    res.json(poolWithAssignments);
  } catch (error) {
    console.error("Error fetching staff pool:", error);
    res.status(500).json({ message: "Failed to fetch staff pool" });
  }
});

// Add staff to daily pool
router.post('/api/staff-pool', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, date, userId: staffUserId, name, role } = req.body;
    const userId = req.user.id;

    if (!hospitalId || !date || !name || !role) {
      return res.status(400).json({ message: "hospitalId, date, name, and role are required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [newEntry] = await db
      .insert(dailyStaffPool)
      .values({
        hospitalId,
        date,
        userId: staffUserId || null,
        name,
        role,
        createdBy: userId,
      })
      .returning();

    res.status(201).json({ ...newEntry, assignedSurgeryIds: [], isBooked: false });
  } catch (error) {
    console.error("Error adding staff to pool:", error);
    res.status(500).json({ message: "Failed to add staff to pool" });
  }
});

// Remove staff from daily pool
router.delete('/api/staff-pool/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [entry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, id));

    if (!entry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === entry.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Delete cascade will handle planned_surgery_staff entries
    await db.delete(dailyStaffPool).where(eq(dailyStaffPool.id, id));

    res.status(204).send();
  } catch (error) {
    console.error("Error removing staff from pool:", error);
    res.status(500).json({ message: "Failed to remove staff from pool" });
  }
});

// =====================================
// Planned Surgery Staff Endpoints
// =====================================

// Get planned staff for a specific surgery
router.get('/api/planned-staff/:surgeryId', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const planned = await db
      .select({
        id: plannedSurgeryStaff.id,
        surgeryId: plannedSurgeryStaff.surgeryId,
        dailyStaffPoolId: plannedSurgeryStaff.dailyStaffPoolId,
        role: plannedSurgeryStaff.role,
        name: plannedSurgeryStaff.name,
        userId: plannedSurgeryStaff.userId,
        createdAt: plannedSurgeryStaff.createdAt,
      })
      .from(plannedSurgeryStaff)
      .where(eq(plannedSurgeryStaff.surgeryId, surgeryId));

    res.json(planned);
  } catch (error) {
    console.error("Error fetching planned staff:", error);
    res.status(500).json({ message: "Failed to fetch planned staff" });
  }
});

// Assign staff from pool to a surgery
router.post('/api/planned-staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId, dailyStaffPoolId } = req.body;
    const userId = req.user.id;

    if (!surgeryId || !dailyStaffPoolId) {
      return res.status(400).json({ message: "surgeryId and dailyStaffPoolId are required" });
    }

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get the staff pool entry
    const [staffPoolEntry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, dailyStaffPoolId));

    if (!staffPoolEntry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    // Check if already assigned
    const [existing] = await db
      .select()
      .from(plannedSurgeryStaff)
      .where(
        and(
          eq(plannedSurgeryStaff.surgeryId, surgeryId),
          eq(plannedSurgeryStaff.dailyStaffPoolId, dailyStaffPoolId)
        )
      );

    if (existing) {
      return res.status(409).json({ message: "Staff already assigned to this surgery" });
    }

    const [newAssignment] = await db
      .insert(plannedSurgeryStaff)
      .values({
        surgeryId,
        dailyStaffPoolId,
        role: staffPoolEntry.role,
        name: staffPoolEntry.name,
        userId: staffPoolEntry.userId,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(newAssignment);
  } catch (error) {
    console.error("Error assigning staff to surgery:", error);
    res.status(500).json({ message: "Failed to assign staff to surgery" });
  }
});

// Unassign staff from a surgery
router.delete('/api/planned-staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [assignment] = await db
      .select()
      .from(plannedSurgeryStaff)
      .where(eq(plannedSurgeryStaff.id, id));

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const surgery = await storage.getSurgery(assignment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.delete(plannedSurgeryStaff).where(eq(plannedSurgeryStaff.id, id));

    res.status(204).send();
  } catch (error) {
    console.error("Error removing staff assignment:", error);
    res.status(500).json({ message: "Failed to remove staff assignment" });
  }
});

// Unassign staff by surgery ID and pool ID (for drag-back)
router.delete('/api/planned-staff/by-pool/:surgeryId/:dailyStaffPoolId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId, dailyStaffPoolId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db
      .delete(plannedSurgeryStaff)
      .where(
        and(
          eq(plannedSurgeryStaff.surgeryId, surgeryId),
          eq(plannedSurgeryStaff.dailyStaffPoolId, dailyStaffPoolId)
        )
      );

    res.status(204).send();
  } catch (error) {
    console.error("Error removing staff assignment:", error);
    res.status(500).json({ message: "Failed to remove staff assignment" });
  }
});

// =====================================
// Daily Room Staff Endpoints (Room-based staff assignments)
// =====================================

// Get all room staff assignments for a hospital on a specific date
router.get('/api/room-staff/all/:hospitalId/:date', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, date } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get all room staff assignments for this hospital on this date
    const roomStaffAssignments = await db
      .select({
        id: dailyRoomStaff.id,
        dailyStaffPoolId: dailyRoomStaff.dailyStaffPoolId,
        surgeryRoomId: dailyRoomStaff.surgeryRoomId,
        date: dailyRoomStaff.date,
        role: dailyRoomStaff.role,
        name: dailyRoomStaff.name,
        userId: dailyRoomStaff.userId,
        createdBy: dailyRoomStaff.createdBy,
        createdAt: dailyRoomStaff.createdAt,
        roomName: surgeryRooms.name,
      })
      .from(dailyRoomStaff)
      .innerJoin(surgeryRooms, eq(dailyRoomStaff.surgeryRoomId, surgeryRooms.id))
      .where(
        and(
          eq(surgeryRooms.hospitalId, hospitalId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.json(roomStaffAssignments);
  } catch (error) {
    console.error("Error fetching room staff assignments:", error);
    res.status(500).json({ message: "Failed to fetch room staff assignments" });
  }
});

// Get staff assigned to a specific room for a date
router.get('/api/room-staff/:roomId/:date', isAuthenticated, async (req: any, res) => {
  try {
    const { roomId, date } = req.params;
    const userId = req.user.id;

    // Get the room to verify hospital access
    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, roomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const roomStaff = await db
      .select({
        id: dailyRoomStaff.id,
        dailyStaffPoolId: dailyRoomStaff.dailyStaffPoolId,
        surgeryRoomId: dailyRoomStaff.surgeryRoomId,
        date: dailyRoomStaff.date,
        role: dailyRoomStaff.role,
        name: dailyRoomStaff.name,
        userId: dailyRoomStaff.userId,
        createdBy: dailyRoomStaff.createdBy,
        createdAt: dailyRoomStaff.createdAt,
      })
      .from(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, roomId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.json(roomStaff);
  } catch (error) {
    console.error("Error fetching room staff:", error);
    res.status(500).json({ message: "Failed to fetch room staff" });
  }
});

// Assign staff from pool to a room for a specific date
router.post('/api/room-staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryRoomId, dailyStaffPoolId, date } = req.body;
    const userId = req.user.id;

    if (!surgeryRoomId || !dailyStaffPoolId || !date) {
      return res.status(400).json({ message: "surgeryRoomId, dailyStaffPoolId, and date are required" });
    }

    // Get the room to verify hospital access
    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, surgeryRoomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get the staff pool entry
    const [staffPoolEntry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, dailyStaffPoolId));

    if (!staffPoolEntry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    // Check if already assigned to this room on this date
    const [existing] = await db
      .select()
      .from(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, surgeryRoomId),
          eq(dailyRoomStaff.dailyStaffPoolId, dailyStaffPoolId),
          eq(dailyRoomStaff.date, date)
        )
      );

    if (existing) {
      return res.status(409).json({ message: "Staff already assigned to this room on this date" });
    }

    const [newAssignment] = await db
      .insert(dailyRoomStaff)
      .values({
        surgeryRoomId,
        dailyStaffPoolId,
        date,
        role: staffPoolEntry.role,
        name: staffPoolEntry.name,
        userId: staffPoolEntry.userId,
        createdBy: userId,
      })
      .returning();

    res.status(201).json({ ...newAssignment, roomName: room.name });
  } catch (error) {
    console.error("Error assigning staff to room:", error);
    res.status(500).json({ message: "Failed to assign staff to room" });
  }
});

// Unassign staff from a room by assignment ID
router.delete('/api/room-staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [assignment] = await db
      .select()
      .from(dailyRoomStaff)
      .where(eq(dailyRoomStaff.id, id));

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    // Get the room to verify hospital access
    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, assignment.surgeryRoomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.delete(dailyRoomStaff).where(eq(dailyRoomStaff.id, id));

    res.status(204).send();
  } catch (error) {
    console.error("Error removing room staff assignment:", error);
    res.status(500).json({ message: "Failed to remove room staff assignment" });
  }
});

// Unassign staff from a room by pool ID and room ID (for drag-back)
router.delete('/api/room-staff/by-pool/:roomId/:dailyStaffPoolId/:date', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roomId, dailyStaffPoolId, date } = req.params;
    const userId = req.user.id;

    // Get the room to verify hospital access
    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, roomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db
      .delete(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, roomId),
          eq(dailyRoomStaff.dailyStaffPoolId, dailyStaffPoolId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.status(204).send();
  } catch (error) {
    console.error("Error removing room staff assignment:", error);
    res.status(500).json({ message: "Failed to remove room staff assignment" });
  }
});

export default router;
