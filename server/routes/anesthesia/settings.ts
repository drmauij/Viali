import { Router } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  insertHospitalAnesthesiaSettingsSchema,
  insertMedicationCouplingSchema,
  insertMedicationSetSchema,
  insertMedicationSetItemSchema,
  items,
  units,
  medicationConfigs,
  medicationCouplings,
  medicationSets,
  medicationSetItems,
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  getUserUnitForHospital,
  getUserRole,
  requireWriteAccess,
  requireResourceAccess,
  getActiveUnitIdFromRequest,
} from "../../utils";
import logger from "../../logger";

const router = Router();

router.get('/api/anesthesia/items/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const anesthesiaUnits = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.hospitalId, hospitalId),
          eq(units.type, 'anesthesia')
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
        medicationConfigId: medicationConfigs.id,
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
        onDemandOnly: medicationConfigs.onDemandOnly,
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
    logger.error("Error fetching anesthesia items:", error);
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
    
    // Check user has access to the hospital (any unit in the hospital is fine for anesthesia config)
    const unitId = await getUserUnitForHospital(userId, item.hospitalId);
    if (!unitId) {
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
      req.body.administrationRoute || req.body.rateUnit !== undefined || req.body.onDemandOnly !== undefined;

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
        onDemandOnly: req.body.onDemandOnly !== undefined 
          ? req.body.onDemandOnly 
          : (existingConfig.length > 0 ? existingConfig[0].onDemandOnly : false),
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
        onDemandOnly: medicationConfigs.onDemandOnly,
      })
      .from(items)
      .leftJoin(medicationConfigs, eq(items.id, medicationConfigs.itemId))
      .where(eq(items.id, itemId))
      .limit(1);

    res.json(result[0] || await storage.getItem(itemId));
  } catch (error: any) {
    logger.error("Error updating anesthesia config:", error);
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

      // Check user has access to the hospital (any unit in the hospital is fine for medication reorder)
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId) {
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
    logger.error("Error reordering medications:", error);
    res.status(500).json({ message: "Failed to reorder medications" });
  }
});

router.get('/api/medication-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const groups = await storage.getMedicationGroups(hospitalId);
    res.json(groups);
  } catch (error: any) {
    logger.error("Error fetching medication groups:", error);
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
    logger.error("Error creating medication group:", error);
    res.status(500).json({ message: "Failed to create medication group" });
  }
});

router.delete('/api/medication-groups/:groupId', isAuthenticated, requireResourceAccess('groupId', true), async (req: any, res) => {
  try {
    const { groupId } = req.params;
    await storage.deleteMedicationGroup(groupId);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting medication group:", error);
    res.status(500).json({ message: "Failed to delete medication group" });
  }
});

router.get('/api/administration-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const groups = await storage.getAdministrationGroups(hospitalId);
    res.json(groups);
  } catch (error: any) {
    logger.error("Error fetching administration groups:", error);
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
    logger.error("Error creating administration group:", error);
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
    logger.error("Error reordering administration groups:", error);
    res.status(500).json({ message: "Failed to reorder administration groups" });
  }
});

router.put('/api/administration-groups/:groupId', isAuthenticated, requireResourceAccess('groupId', true), async (req: any, res) => {
  try {
    const { groupId } = req.params;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updatedGroup = await storage.updateAdministrationGroup(groupId, { name });
    res.json(updatedGroup);
  } catch (error: any) {
    logger.error("Error updating administration group:", error);
    res.status(500).json({ message: "Failed to update administration group" });
  }
});

router.delete('/api/administration-groups/:groupId', isAuthenticated, requireResourceAccess('groupId', true), async (req: any, res) => {
  try {
    const { groupId } = req.params;
    await storage.deleteAdministrationGroup(groupId);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting administration group:", error);
    res.status(500).json({ message: "Failed to delete administration group" });
  }
});

router.get('/api/surgery-rooms/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const rooms = await storage.getSurgeryRooms(hospitalId);
    res.json(rooms);
  } catch (error: any) {
    logger.error("Error fetching surgery rooms:", error);
    res.status(500).json({ message: "Failed to fetch surgery rooms" });
  }
});

router.post('/api/surgery-rooms', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, name, type } = req.body;
    
    if (!hospitalId || !name) {
      return res.status(400).json({ message: "Hospital ID and name are required" });
    }

    const newRoom = await storage.createSurgeryRoom({ hospitalId, name, type: type || 'OP', sortOrder: 0 });
    res.status(201).json(newRoom);
  } catch (error: any) {
    logger.error("Error creating surgery room:", error);
    res.status(500).json({ message: "Failed to create surgery room" });
  }
});

router.put('/api/surgery-rooms/:roomId', isAuthenticated, requireResourceAccess('roomId', true), async (req: any, res) => {
  try {
    const { roomId } = req.params;
    const { name, type } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updateData: { name: string; type?: 'OP' | 'PACU' } = { name };
    if (type) {
      updateData.type = type;
    }
    const updatedRoom = await storage.updateSurgeryRoom(roomId, updateData);
    res.json(updatedRoom);
  } catch (error: any) {
    logger.error("Error updating surgery room:", error);
    res.status(500).json({ message: "Failed to update surgery room" });
  }
});

router.delete('/api/surgery-rooms/:roomId', isAuthenticated, requireResourceAccess('roomId', true), async (req: any, res) => {
  try {
    const { roomId } = req.params;
    await storage.deleteSurgeryRoom(roomId);
    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting surgery room:", error);
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
    logger.error("Error reordering surgery rooms:", error);
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
    logger.error("Error fetching anesthesia settings:", error);
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
    logger.error("Error updating anesthesia settings:", error);
    res.status(500).json({ message: "Failed to update anesthesia settings" });
  }
});

// ============ Medication Couplings API ============

// Helper function to verify user has access to a medication config
async function verifyMedicationConfigAccess(userId: string, medicationConfigId: string): Promise<{ hasAccess: boolean; hospitalId?: string }> {
  const [config] = await db
    .select({ itemId: medicationConfigs.itemId })
    .from(medicationConfigs)
    .where(eq(medicationConfigs.id, medicationConfigId));
  
  if (!config) return { hasAccess: false };
  
  const [item] = await db
    .select({ hospitalId: items.hospitalId })
    .from(items)
    .where(eq(items.id, config.itemId));
  
  if (!item || !item.hospitalId) return { hasAccess: false };
  
  const hospitals = await storage.getUserHospitals(userId);
  const hasAccess = hospitals.some(h => h.id === item.hospitalId);
  
  return { hasAccess, hospitalId: item.hospitalId };
}

// Get all couplings for a medication config
router.get('/api/anesthesia/medication-couplings/:medicationConfigId', isAuthenticated, async (req: any, res) => {
  try {
    const { medicationConfigId } = req.params;
    const userId = req.user.id;
    
    // Verify access to the medication config
    const { hasAccess } = await verifyMedicationConfigAccess(userId, medicationConfigId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this medication config" });
    }
    
    const couplings = await db
      .select({
        id: medicationCouplings.id,
        primaryMedicationConfigId: medicationCouplings.primaryMedicationConfigId,
        coupledMedicationConfigId: medicationCouplings.coupledMedicationConfigId,
        defaultDose: medicationCouplings.defaultDose,
        notes: medicationCouplings.notes,
        hospitalId: medicationCouplings.hospitalId,
        unitId: medicationCouplings.unitId,
        createdAt: medicationCouplings.createdAt,
        coupledItemId: items.id,
        coupledItemName: items.name,
        coupledDefaultDose: medicationConfigs.defaultDose,
        coupledAdministrationUnit: medicationConfigs.administrationUnit,
        coupledAdministrationRoute: medicationConfigs.administrationRoute,
      })
      .from(medicationCouplings)
      .innerJoin(medicationConfigs, eq(medicationCouplings.coupledMedicationConfigId, medicationConfigs.id))
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(medicationCouplings.primaryMedicationConfigId, medicationConfigId));
    
    res.json(couplings);
  } catch (error) {
    logger.error("Error fetching medication couplings:", error);
    res.status(500).json({ message: "Failed to fetch medication couplings" });
  }
});

// Search available medications to couple (excludes already coupled ones)
router.get('/api/anesthesia/medication-couplings/:medicationConfigId/available', isAuthenticated, async (req: any, res) => {
  try {
    const { medicationConfigId } = req.params;
    const userId = req.user.id;
    const search = (req.query.search as string || '').toLowerCase();
    
    // Verify access to the primary medication config
    const { hasAccess, hospitalId } = await verifyMedicationConfigAccess(userId, medicationConfigId);
    if (!hasAccess || !hospitalId) {
      return res.status(403).json({ message: "Access denied to this medication config" });
    }
    
    // Get medication configs with item names - only from the same hospital
    const allMedications = await db
      .select({
        id: medicationConfigs.id,
        itemId: items.id,
        itemName: items.name,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        administrationRoute: medicationConfigs.administrationRoute,
        administrationGroup: medicationConfigs.administrationGroup,
      })
      .from(medicationConfigs)
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(items.hospitalId, hospitalId));
    
    // Get already coupled medication config IDs
    const existingCouplings = await db
      .select({ coupledId: medicationCouplings.coupledMedicationConfigId })
      .from(medicationCouplings)
      .where(eq(medicationCouplings.primaryMedicationConfigId, medicationConfigId));
    
    const existingCoupledIds = new Set(existingCouplings.map(c => c.coupledId));
    
    // Filter: exclude the primary medication itself and already coupled ones
    const available = allMedications.filter(med => 
      med.id !== medicationConfigId && 
      !existingCoupledIds.has(med.id) &&
      (search === '' || med.itemName.toLowerCase().includes(search))
    );
    
    res.json(available);
  } catch (error) {
    logger.error("Error searching available medications:", error);
    res.status(500).json({ message: "Failed to search medications" });
  }
});

// Create a new medication coupling
router.post('/api/anesthesia/medication-couplings', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { primaryMedicationConfigId, coupledMedicationConfigId } = req.body;
    
    // Verify access to the primary medication config
    const primaryAccess = await verifyMedicationConfigAccess(userId, primaryMedicationConfigId);
    if (!primaryAccess.hasAccess) {
      return res.status(403).json({ message: "Access denied to primary medication config" });
    }
    
    // Verify access to the coupled medication config
    const coupledAccess = await verifyMedicationConfigAccess(userId, coupledMedicationConfigId);
    if (!coupledAccess.hasAccess) {
      return res.status(403).json({ message: "Access denied to coupled medication config" });
    }
    
    // Ensure both medications belong to the same hospital (prevent cross-hospital couplings)
    if (primaryAccess.hospitalId !== coupledAccess.hospitalId) {
      return res.status(400).json({ message: "Cannot create coupling between medications from different hospitals" });
    }
    
    const validatedData = insertMedicationCouplingSchema.parse({
      ...req.body,
      createdBy: userId,
    });
    
    const [newCoupling] = await db
      .insert(medicationCouplings)
      .values(validatedData)
      .returning();
    
    // Return the coupling with item details
    const [result] = await db
      .select({
        id: medicationCouplings.id,
        primaryMedicationConfigId: medicationCouplings.primaryMedicationConfigId,
        coupledMedicationConfigId: medicationCouplings.coupledMedicationConfigId,
        defaultDose: medicationCouplings.defaultDose,
        notes: medicationCouplings.notes,
        hospitalId: medicationCouplings.hospitalId,
        unitId: medicationCouplings.unitId,
        createdAt: medicationCouplings.createdAt,
        coupledItemId: items.id,
        coupledItemName: items.name,
        coupledDefaultDose: medicationConfigs.defaultDose,
        coupledAdministrationUnit: medicationConfigs.administrationUnit,
        coupledAdministrationRoute: medicationConfigs.administrationRoute,
      })
      .from(medicationCouplings)
      .innerJoin(medicationConfigs, eq(medicationCouplings.coupledMedicationConfigId, medicationConfigs.id))
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(medicationCouplings.id, newCoupling.id));
    
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating medication coupling:", error);
    res.status(500).json({ message: "Failed to create medication coupling" });
  }
});

// Update a medication coupling
router.patch('/api/anesthesia/medication-couplings/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { defaultDose, notes } = req.body;
    
    // Get the coupling first to verify access
    const [coupling] = await db
      .select({ primaryMedicationConfigId: medicationCouplings.primaryMedicationConfigId })
      .from(medicationCouplings)
      .where(eq(medicationCouplings.id, id));
    
    if (!coupling) {
      return res.status(404).json({ message: "Coupling not found" });
    }
    
    // Verify access to the primary medication config
    const { hasAccess } = await verifyMedicationConfigAccess(userId, coupling.primaryMedicationConfigId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this medication coupling" });
    }
    
    const [updated] = await db
      .update(medicationCouplings)
      .set({ defaultDose, notes })
      .where(eq(medicationCouplings.id, id))
      .returning();
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating medication coupling:", error);
    res.status(500).json({ message: "Failed to update medication coupling" });
  }
});

// Delete a medication coupling
router.delete('/api/anesthesia/medication-couplings/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get the coupling first to verify access
    const [coupling] = await db
      .select({ primaryMedicationConfigId: medicationCouplings.primaryMedicationConfigId })
      .from(medicationCouplings)
      .where(eq(medicationCouplings.id, id));
    
    if (!coupling) {
      return res.status(404).json({ message: "Coupling not found" });
    }
    
    // Verify access to the primary medication config
    const { hasAccess } = await verifyMedicationConfigAccess(userId, coupling.primaryMedicationConfigId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this medication coupling" });
    }
    
    await db
      .delete(medicationCouplings)
      .where(eq(medicationCouplings.id, id));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting medication coupling:", error);
    res.status(500).json({ message: "Failed to delete medication coupling" });
  }
});

// ==================== MEDICATION SETS ====================

// Get all medication sets for a hospital (for users to apply)
router.get('/api/anesthesia/medication-sets/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const sets = await db
      .select({
        id: medicationSets.id,
        name: medicationSets.name,
        description: medicationSets.description,
        hospitalId: medicationSets.hospitalId,
        unitId: medicationSets.unitId,
        sortOrder: medicationSets.sortOrder,
        createdAt: medicationSets.createdAt,
      })
      .from(medicationSets)
      .where(eq(medicationSets.hospitalId, hospitalId))
      .orderBy(medicationSets.sortOrder);
    
    res.json(sets);
  } catch (error) {
    logger.error("Error fetching medication sets:", error);
    res.status(500).json({ message: "Failed to fetch medication sets" });
  }
});

// Get a single medication set with its items
router.get('/api/anesthesia/medication-sets/:hospitalId/:setId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, setId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const [set] = await db
      .select()
      .from(medicationSets)
      .where(and(eq(medicationSets.id, setId), eq(medicationSets.hospitalId, hospitalId)));
    
    if (!set) {
      return res.status(404).json({ message: "Medication set not found" });
    }
    
    const setItems = await db
      .select({
        id: medicationSetItems.id,
        medicationConfigId: medicationSetItems.medicationConfigId,
        customDose: medicationSetItems.customDose,
        sortOrder: medicationSetItems.sortOrder,
        itemId: items.id,
        itemName: items.name,
        defaultDose: medicationConfigs.defaultDose,
        administrationUnit: medicationConfigs.administrationUnit,
        administrationRoute: medicationConfigs.administrationRoute,
        administrationGroup: medicationConfigs.administrationGroup,
      })
      .from(medicationSetItems)
      .innerJoin(medicationConfigs, eq(medicationSetItems.medicationConfigId, medicationConfigs.id))
      .innerJoin(items, eq(medicationConfigs.itemId, items.id))
      .where(eq(medicationSetItems.setId, setId))
      .orderBy(medicationSetItems.sortOrder);
    
    res.json({ ...set, items: setItems });
  } catch (error) {
    logger.error("Error fetching medication set:", error);
    res.status(500).json({ message: "Failed to fetch medication set" });
  }
});

// Create a new medication set (admin only)
router.post('/api/anesthesia/medication-sets', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId, name, description, items: setItemsList } = req.body;
    
    // Verify user has admin access to this hospital
    const userRole = await getUserRole(userId, hospitalId);
    if (userRole !== 'admin') {
      return res.status(403).json({ message: "Only admins can create medication sets" });
    }
    
    const validatedData = insertMedicationSetSchema.parse({
      name,
      description,
      hospitalId,
      createdBy: userId,
    });
    
    const [newSet] = await db
      .insert(medicationSets)
      .values(validatedData)
      .returning();
    
    // Add items to the set
    if (setItemsList && Array.isArray(setItemsList) && setItemsList.length > 0) {
      for (let i = 0; i < setItemsList.length; i++) {
        const item = setItemsList[i];
        await db.insert(medicationSetItems).values({
          setId: newSet.id,
          medicationConfigId: item.medicationConfigId,
          customDose: item.customDose || null,
          sortOrder: i,
        });
      }
    }
    
    res.status(201).json(newSet);
  } catch (error) {
    logger.error("Error creating medication set:", error);
    res.status(500).json({ message: "Failed to create medication set" });
  }
});

// Update a medication set (admin only)
router.patch('/api/anesthesia/medication-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;
    const { name, description, items: setItemsList } = req.body;
    
    // Get the set to verify access
    const [existingSet] = await db
      .select({ hospitalId: medicationSets.hospitalId })
      .from(medicationSets)
      .where(eq(medicationSets.id, setId));
    
    if (!existingSet) {
      return res.status(404).json({ message: "Medication set not found" });
    }
    
    // Verify user has admin access to this hospital
    const userRole = await getUserRole(userId, existingSet.hospitalId);
    if (userRole !== 'admin') {
      return res.status(403).json({ message: "Only admins can update medication sets" });
    }
    
    // Update the set
    const [updated] = await db
      .update(medicationSets)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(medicationSets.id, setId))
      .returning();
    
    // Update items if provided
    if (setItemsList && Array.isArray(setItemsList)) {
      // Delete existing items
      await db.delete(medicationSetItems).where(eq(medicationSetItems.setId, setId));
      
      // Add new items
      for (let i = 0; i < setItemsList.length; i++) {
        const item = setItemsList[i];
        await db.insert(medicationSetItems).values({
          setId: setId,
          medicationConfigId: item.medicationConfigId,
          customDose: item.customDose || null,
          sortOrder: i,
        });
      }
    }
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating medication set:", error);
    res.status(500).json({ message: "Failed to update medication set" });
  }
});

// Delete a medication set (admin only)
router.delete('/api/anesthesia/medication-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;
    
    // Get the set to verify access
    const [existingSet] = await db
      .select({ hospitalId: medicationSets.hospitalId })
      .from(medicationSets)
      .where(eq(medicationSets.id, setId));
    
    if (!existingSet) {
      return res.status(404).json({ message: "Medication set not found" });
    }
    
    // Verify user has admin access to this hospital
    const userRole = await getUserRole(userId, existingSet.hospitalId);
    if (userRole !== 'admin') {
      return res.status(403).json({ message: "Only admins can delete medication sets" });
    }
    
    await db.delete(medicationSets).where(eq(medicationSets.id, setId));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting medication set:", error);
    res.status(500).json({ message: "Failed to delete medication set" });
  }
});

export default router;
