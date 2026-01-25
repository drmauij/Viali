import { Router } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  insertHospitalAnesthesiaSettingsSchema,
  items,
  units,
  medicationConfigs,
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  getUserUnitForHospital,
  getUserRole,
  requireWriteAccess,
  requireResourceAccess,
} from "../../utils";

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

router.delete('/api/medication-groups/:groupId', isAuthenticated, requireResourceAccess('groupId', true), async (req: any, res) => {
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
    console.error("Error updating administration group:", error);
    res.status(500).json({ message: "Failed to update administration group" });
  }
});

router.delete('/api/administration-groups/:groupId', isAuthenticated, requireResourceAccess('groupId', true), async (req: any, res) => {
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
    const { hospitalId, name, type } = req.body;
    
    if (!hospitalId || !name) {
      return res.status(400).json({ message: "Hospital ID and name are required" });
    }

    const newRoom = await storage.createSurgeryRoom({ hospitalId, name, type: type || 'OP', sortOrder: 0 });
    res.status(201).json(newRoom);
  } catch (error: any) {
    console.error("Error creating surgery room:", error);
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
    console.error("Error updating surgery room:", error);
    res.status(500).json({ message: "Failed to update surgery room" });
  }
});

router.delete('/api/surgery-rooms/:roomId', isAuthenticated, requireResourceAccess('roomId', true), async (req: any, res) => {
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

export default router;
