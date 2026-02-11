import { Router } from "express";
import { storage, db } from "../../storage";
import { anesthesiaRecordMedications, medicationConfigs, administrationGroups } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../../auth/google";
import { requireWriteAccess } from "../../utils";
import { requireAdminRole } from "../middleware";

const router = Router();

// =====================================
// Inventory Usage Endpoints
// =====================================

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
      const anesthesiaUnit = unitsData.find(u => u.type === 'anesthesia');
      if (!anesthesiaUnit) {
        return res.status(400).json({ message: "No anesthesia unit configured for this hospital" });
      }
      targetUnitId = anesthesiaUnit.id;
    } else if (moduleType === 'surgery') {
      const surgeryUnit = unitsData.find(u => u.type === 'or');
      if (!surgeryUnit) {
        return res.status(400).json({ message: "No surgery unit configured for this hospital" });
      }
      targetUnitId = surgeryUnit.id;
    }

    const hasModuleAccess = hospitals.some(h => {
      if (h.id !== surgery.hospitalId || h.unitId !== targetUnitId) return false;
      
      if (moduleType === 'anesthesia' && h.unitType !== 'anesthesia') return false;
      if (moduleType === 'surgery' && h.unitType !== 'or') return false;
      
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

// =====================================
// Audit Trail Endpoint
// =====================================

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

// =====================================
// Billing Endpoint
// =====================================

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
// Anesthesia Sets Endpoints
// =====================================

router.get('/api/anesthesia-sets/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const sets = await storage.getAnesthesiaSets(hospitalId);
    
    const enrichedSets = await Promise.all(
      sets.map(async (set) => {
        const [items, rawMedications, rawInventoryItems] = await Promise.all([
          storage.getAnesthesiaSetItems(set.id),
          storage.getAnesthesiaSetMedications(set.id),
          storage.getAnesthesiaSetInventory(set.id),
        ]);

        const medications = await Promise.all(
          rawMedications.map(async (med) => {
            const config = await storage.getMedicationConfigById(med.medicationConfigId);
            const item = config?.itemId ? await storage.getItem(config.itemId) : null;
            return {
              ...med,
              itemName: item?.name || 'Unknown',
              defaultDose: config?.defaultDose || null,
              administrationUnit: config?.administrationUnit || null,
            };
          })
        );

        const inventoryItems = await Promise.all(
          rawInventoryItems.map(async (inv) => {
            const item = await storage.getItem(inv.itemId);
            return { ...inv, itemName: item?.name || 'Unknown' };
          })
        );

        return { ...set, items, medications, inventoryItems };
      })
    );
    
    res.json(enrichedSets);
  } catch (error) {
    console.error("Error fetching anesthesia sets:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia sets" });
  }
});

router.get('/api/anesthesia-sets/set/:setId', isAuthenticated, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;

    const set = await storage.getAnesthesiaSet(setId);
    if (!set) {
      return res.status(404).json({ message: "Anesthesia set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === set.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Fetch all three categories for unified sets
    const [items, rawMedications, rawInventoryItems] = await Promise.all([
      storage.getAnesthesiaSetItems(setId),
      storage.getAnesthesiaSetMedications(setId),
      storage.getAnesthesiaSetInventory(setId),
    ]);
    
    // Enrich medications with config and item details
    const medications = await Promise.all(
      rawMedications.map(async (med) => {
        const config = await storage.getMedicationConfigById(med.medicationConfigId);
        const item = config?.itemId ? await storage.getItem(config.itemId) : null;
        return {
          ...med,
          itemName: item?.name || 'Unknown',
          defaultDose: config?.defaultDose || null,
          administrationUnit: config?.administrationUnit || null,
          administrationRoute: config?.administrationRoute || null,
        };
      })
    );
    
    // Enrich inventory items with item details
    const inventoryItems = await Promise.all(
      rawInventoryItems.map(async (inv) => {
        const item = await storage.getItem(inv.itemId);
        return {
          ...inv,
          itemName: item?.name || 'Unknown',
        };
      })
    );
    
    res.json({ ...set, items, medications, inventoryItems });
  } catch (error) {
    console.error("Error fetching anesthesia set:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia set" });
  }
});

router.post('/api/anesthesia-sets', isAuthenticated, requireAdminRole, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId, name, description, items, medications, inventoryItems } = req.body;

    if (!hospitalId || !name) {
      return res.status(400).json({ message: "hospitalId and name are required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const set = await storage.createAnesthesiaSet({
      hospitalId,
      name,
      description,
      createdBy: userId,
    });

    // Add technique items
    if (items && Array.isArray(items)) {
      for (const item of items) {
        await storage.createAnesthesiaSetItem({
          setId: set.id,
          itemType: item.itemType,
          config: item.config || item.configuration || {},
          sortOrder: item.sortOrder || 0,
        });
      }
    }

    // Add medications
    if (medications && Array.isArray(medications)) {
      for (let i = 0; i < medications.length; i++) {
        const med = medications[i];
        await storage.createAnesthesiaSetMedication({
          setId: set.id,
          medicationConfigId: med.medicationConfigId,
          customDose: med.customDose || null,
          sortOrder: med.sortOrder ?? i,
        });
      }
    }

    // Add inventory items
    if (inventoryItems && Array.isArray(inventoryItems)) {
      for (let i = 0; i < inventoryItems.length; i++) {
        const inv = inventoryItems[i];
        await storage.createAnesthesiaSetInventoryItem({
          setId: set.id,
          itemId: inv.itemId,
          quantity: inv.quantity || 1,
          sortOrder: inv.sortOrder ?? i,
        });
      }
    }

    // Fetch all categories
    const [setItems, setMedications, setInventory] = await Promise.all([
      storage.getAnesthesiaSetItems(set.id),
      storage.getAnesthesiaSetMedications(set.id),
      storage.getAnesthesiaSetInventory(set.id),
    ]);
    
    res.status(201).json({ ...set, items: setItems, medications: setMedications, inventoryItems: setInventory });
  } catch (error) {
    console.error("Error creating anesthesia set:", error);
    res.status(500).json({ message: "Failed to create anesthesia set" });
  }
});

router.patch('/api/anesthesia-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;
    const { name, description, isActive, items, medications, inventoryItems } = req.body;

    const set = await storage.getAnesthesiaSet(setId);
    if (!set) {
      return res.status(404).json({ message: "Anesthesia set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminAccess = hospitals.some(h => h.id === set.hospitalId && h.role === 'admin');
    
    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const updatedSet = await storage.updateAnesthesiaSet(setId, { name, description, isActive });

    // Update technique items if provided
    if (items && Array.isArray(items)) {
      await storage.deleteAnesthesiaSetItems(setId);
      for (const item of items) {
        await storage.createAnesthesiaSetItem({
          setId,
          itemType: item.itemType,
          config: item.config || item.configuration || {},
          sortOrder: item.sortOrder || 0,
        });
      }
    }

    // Update medications if provided
    if (medications && Array.isArray(medications)) {
      await storage.deleteAnesthesiaSetMedications(setId);
      for (let i = 0; i < medications.length; i++) {
        const med = medications[i];
        await storage.createAnesthesiaSetMedication({
          setId,
          medicationConfigId: med.medicationConfigId,
          customDose: med.customDose || null,
          sortOrder: med.sortOrder ?? i,
        });
      }
    }

    // Update inventory items if provided
    if (inventoryItems && Array.isArray(inventoryItems)) {
      await storage.deleteAnesthesiaSetInventory(setId);
      for (let i = 0; i < inventoryItems.length; i++) {
        const inv = inventoryItems[i];
        await storage.createAnesthesiaSetInventoryItem({
          setId,
          itemId: inv.itemId,
          quantity: inv.quantity || 1,
          sortOrder: inv.sortOrder ?? i,
        });
      }
    }

    // Fetch all categories
    const [setItems, setMedications, setInventory] = await Promise.all([
      storage.getAnesthesiaSetItems(setId),
      storage.getAnesthesiaSetMedications(setId),
      storage.getAnesthesiaSetInventory(setId),
    ]);
    
    res.json({ ...updatedSet, items: setItems, medications: setMedications, inventoryItems: setInventory });
  } catch (error) {
    console.error("Error updating anesthesia set:", error);
    res.status(500).json({ message: "Failed to update anesthesia set" });
  }
});

router.delete('/api/anesthesia-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;

    const set = await storage.getAnesthesiaSet(setId);
    if (!set) {
      return res.status(404).json({ message: "Anesthesia set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminAccess = hospitals.some(h => h.id === set.hospitalId && h.role === 'admin');
    
    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await storage.deleteAnesthesiaSet(setId);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting anesthesia set:", error);
    res.status(500).json({ message: "Failed to delete anesthesia set" });
  }
});

router.post('/api/anesthesia-sets/:setId/apply/:anesthesiaRecordId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId, anesthesiaRecordId } = req.params;
    const userId = req.user.id;

    const set = await storage.getAnesthesiaSet(setId);
    if (!set) {
      return res.status(404).json({ message: "Anesthesia set not found" });
    }

    const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === set.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Fetch all three categories
    const [setItems, setMedications, setInventoryItems] = await Promise.all([
      storage.getAnesthesiaSetItems(setId),
      storage.getAnesthesiaSetMedications(setId),
      storage.getAnesthesiaSetInventory(setId),
    ]);
    
    console.log(`[Apply Set] Set ${setId} has ${setItems.length} technique items, ${setMedications.length} medications, ${setInventoryItems.length} inventory items`);
    let appliedCount = 0;
    let medicationsApplied = 0;
    let inventoryApplied = 0;

    // Apply technique items
    for (const item of setItems) {
      try {
        const config = (item.config || {}) as Record<string, any>;
        const itemType = item.itemType as string;
        console.log(`[Apply Set] Processing item type: ${itemType}`, config);
        
        switch (itemType) {
          case 'peripheral_iv':
          case 'peripheral_venous':
            await storage.createAnesthesiaInstallation({
              anesthesiaRecordId,
              category: 'peripheral',
              attempts: 1,
              notes: config.notes || null,
              location: config.location || null,
              isPreExisting: false,
              metadata: config,
            });
            appliedCount++;
            break;
            
          case 'arterial_line':
            await storage.createAnesthesiaInstallation({
              anesthesiaRecordId,
              category: 'arterial',
              attempts: 1,
              notes: config.notes || null,
              location: config.location || null,
              isPreExisting: false,
              metadata: config,
            });
            appliedCount++;
            break;
            
          case 'central_line':
          case 'central_venous':
            await storage.createAnesthesiaInstallation({
              anesthesiaRecordId,
              category: 'central',
              attempts: 1,
              notes: config.notes || null,
              location: config.location || null,
              isPreExisting: false,
              metadata: config,
            });
            appliedCount++;
            break;
            
          case 'bladder_catheter':
            await storage.createAnesthesiaInstallation({
              anesthesiaRecordId,
              category: 'bladder',
              attempts: 1,
              notes: config.notes || null,
              location: null,
              isPreExisting: false,
              metadata: config,
            });
            appliedCount++;
            break;
            
          case 'airway_management':
            await storage.upsertAirwayManagement({
              anesthesiaRecordId,
              airwayDevice: config.device || 'ett',
              size: config.size || null,
              depth: config.depth ? parseInt(config.depth) : null,
              cuffPressure: config.cuffPressure ? parseInt(config.cuffPressure) : null,
              laryngoscopeType: config.laryngoscopeType || null,
              intubationAttempts: config.attempts || 1,
              cormackLehane: config.cormackLehane || null,
              notes: config.notes || null,
            });
            appliedCount++;
            break;

          case 'ett':
          case 'lma':
          case 'mask':
            await storage.upsertAirwayManagement({
              anesthesiaRecordId,
              airwayDevice: item.itemType,
              size: config.size || null,
              depth: config.depth ? parseInt(config.depth) : null,
              cuffPressure: config.cuffPressure ? parseInt(config.cuffPressure) : null,
              laryngoscopeType: config.laryngoscopeType || null,
              intubationAttempts: config.attempts || 1,
              cormackLehane: config.cormackLehane || null,
              notes: config.notes || null,
            });
            appliedCount++;
            break;
            
          case 'general_anesthesia':
            await storage.upsertGeneralTechnique({
              anesthesiaRecordId,
              approach: (config.approach as 'tiva' | 'tci' | 'balanced-gas' | 'sedation') || 'balanced-gas',
              rsi: config.rsi || false,
              notes: config.notes || null,
            });
            appliedCount++;
            break;

          case 'tci':
          case 'tiva':
          case 'balanced-gas':
          case 'sedation':
          case 'general':
            await storage.upsertGeneralTechnique({
              anesthesiaRecordId,
              approach: itemType === 'general' ? 'balanced-gas' : itemType as 'tiva' | 'tci' | 'balanced-gas' | 'sedation',
              rsi: config.rsi || false,
              notes: config.notes || null,
            });
            appliedCount++;
            break;

          case 'spinal':
          case 'regional_spinal':
            await storage.createNeuraxialBlock({
              anesthesiaRecordId,
              blockType: 'spinal',
              level: config.level || null,
              notes: config.notes || null,
            });
            appliedCount++;
            break;
            
          case 'epidural':
          case 'regional_epidural':
            await storage.createNeuraxialBlock({
              anesthesiaRecordId,
              blockType: 'epidural',
              level: config.level || null,
              notes: config.notes || null,
            });
            appliedCount++;
            break;

          case 'cse':
            await storage.createNeuraxialBlock({
              anesthesiaRecordId,
              blockType: 'cse',
              level: config.level || null,
              notes: config.notes || null,
            });
            appliedCount++;
            break;
            
          case 'nerve_block':
          case 'regional_peripheral':
          case 'peripheral_block':
            await storage.createPeripheralBlock({
              anesthesiaRecordId,
              blockType: config.blockType || 'other',
              laterality: config.laterality || null,
              guidanceTechnique: config.guidance || 'ultrasound',
              notes: config.notes || null,
            });
            appliedCount++;
            break;
            
          default:
            console.log(`[Apply Set] Skipping unsupported item type: ${item.itemType}`);
        }
      } catch (itemError) {
        console.error(`Error applying set item ${item.id}:`, itemError);
      }
    }

    // Apply medications - import them to the record AND create dose events
    for (const med of setMedications) {
      try {
        // Check if medication is already imported to this record
        const existingMeds = await db
          .select({ medicationConfigId: anesthesiaRecordMedications.medicationConfigId })
          .from(anesthesiaRecordMedications)
          .where(eq(anesthesiaRecordMedications.anesthesiaRecordId, anesthesiaRecordId));
        const alreadyImported = existingMeds.some(m => m.medicationConfigId === med.medicationConfigId);
        
        if (!alreadyImported) {
          await db.insert(anesthesiaRecordMedications).values({
            anesthesiaRecordId,
            medicationConfigId: med.medicationConfigId,
          });
        }
        
        // Look up the medication config to get item details and administration group
        const [medConfig] = await db
          .select({
            itemId: medicationConfigs.itemId,
            defaultDose: medicationConfigs.defaultDose,
            administrationUnit: medicationConfigs.administrationUnit,
            administrationRoute: medicationConfigs.administrationRoute,
            rateUnit: medicationConfigs.rateUnit,
            administrationGroup: medicationConfigs.administrationGroup,
          })
          .from(medicationConfigs)
          .where(eq(medicationConfigs.id, med.medicationConfigId));
        
        if (medConfig) {
          // Determine administration group name to decide event type
          let groupName = '';
          if (medConfig.administrationGroup) {
            const [group] = await db
              .select({ name: administrationGroups.name })
              .from(administrationGroups)
              .where(eq(administrationGroups.id, medConfig.administrationGroup));
            groupName = group?.name?.toLowerCase() || '';
          }
          
          const dose = med.customDose || medConfig.defaultDose;
          const isInfusion = groupName.includes('infusion') || !!medConfig.rateUnit;
          const timestamp = new Date();
          
          if (isInfusion) {
            const { nanoid } = await import('nanoid');
            const sessionId = nanoid();
            const isFreeRunning = medConfig.rateUnit === 'free';
            await storage.createAnesthesiaMedication({
              anesthesiaRecordId,
              itemId: medConfig.itemId,
              timestamp,
              type: 'infusion_start',
              dose: isFreeRunning ? dose : (dose || undefined),
              unit: medConfig.administrationUnit || null,
              route: medConfig.administrationRoute || 'i.v.',
              rate: isFreeRunning ? 'free' : (dose || undefined),
              infusionSessionId: sessionId,
              administeredBy: userId,
            });
            console.log(`[Apply Set] Created infusion start for ${medConfig.itemId}: ${dose} ${medConfig.administrationUnit || ''} (rateUnit: ${medConfig.rateUnit})`);
          } else if (dose) {
            // Create bolus event
            await storage.createAnesthesiaMedication({
              anesthesiaRecordId,
              itemId: medConfig.itemId,
              timestamp,
              type: 'bolus',
              dose,
              unit: medConfig.administrationUnit || null,
              route: medConfig.administrationRoute || 'i.v.',
              administeredBy: userId,
            });
            console.log(`[Apply Set] Created bolus for ${medConfig.itemId}: ${dose} ${medConfig.administrationUnit || ''}`);
          }
        }
        
        medicationsApplied++;
      } catch (medError) {
        console.error(`Error applying medication ${med.medicationConfigId}:`, medError);
      }
    }

    // Apply inventory items - create usage entries
    for (const inv of setInventoryItems) {
      try {
        // Get or create inventory usage entry for this item
        const existingUsage = await storage.getInventoryUsageByItem(anesthesiaRecordId, inv.itemId);
        
        if (existingUsage) {
          // Already exists - no need to add again
          inventoryApplied++;
        } else {
          // Create new usage entry
          await storage.createInventoryUsage({
            anesthesiaRecordId,
            itemId: inv.itemId,
            calculatedQty: String(inv.quantity),
          });
          inventoryApplied++;
        }
      } catch (invError) {
        console.error(`Error applying inventory item ${inv.itemId}:`, invError);
      }
    }

    res.json({ 
      message: "Set applied successfully", 
      appliedCount,
      medicationsApplied,
      inventoryApplied,
    });
  } catch (error) {
    console.error("Error applying anesthesia set:", error);
    res.status(500).json({ message: "Failed to apply anesthesia set" });
  }
});

// =====================================
// Inventory Sets Endpoints
// =====================================

router.get('/api/inventory-sets/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const sets = await storage.getInventorySets(hospitalId, unitId as string | undefined);
    res.json(sets);
  } catch (error) {
    console.error("Error fetching inventory sets:", error);
    res.status(500).json({ message: "Failed to fetch inventory sets" });
  }
});

router.get('/api/inventory-sets/set/:setId', isAuthenticated, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;

    const set = await storage.getInventorySet(setId);
    if (!set) {
      return res.status(404).json({ message: "Inventory set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === set.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const items = await storage.getInventorySetItems(setId);
    res.json({ ...set, items });
  } catch (error) {
    console.error("Error fetching inventory set:", error);
    res.status(500).json({ message: "Failed to fetch inventory set" });
  }
});

router.post('/api/inventory-sets', isAuthenticated, requireAdminRole, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId, unitId, name, description, items } = req.body;

    if (!hospitalId || !name) {
      return res.status(400).json({ message: "hospitalId and name are required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const set = await storage.createInventorySet({
      hospitalId,
      unitId: unitId || null,
      name,
      description,
      createdBy: userId,
    });

    if (items && Array.isArray(items)) {
      for (const item of items) {
        await storage.createInventorySetItem({
          setId: set.id,
          itemId: item.itemId,
          quantity: item.quantity || 1,
          sortOrder: item.sortOrder || 0,
        });
      }
    }

    const setItems = await storage.getInventorySetItems(set.id);
    res.status(201).json({ ...set, items: setItems });
  } catch (error) {
    console.error("Error creating inventory set:", error);
    res.status(500).json({ message: "Failed to create inventory set" });
  }
});

router.patch('/api/inventory-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;
    const { name, description, isActive, items } = req.body;

    const set = await storage.getInventorySet(setId);
    if (!set) {
      return res.status(404).json({ message: "Inventory set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminAccess = hospitals.some(h => h.id === set.hospitalId && h.role === "admin");
    
    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const updatedSet = await storage.updateInventorySet(setId, { name, description, isActive });

    if (items && Array.isArray(items)) {
      await storage.deleteInventorySetItems(setId);
      for (const item of items) {
        await storage.createInventorySetItem({
          setId,
          itemId: item.itemId,
          quantity: item.quantity || 1,
          sortOrder: item.sortOrder || 0,
        });
      }
    }

    const setItems = await storage.getInventorySetItems(setId);
    res.json({ ...updatedSet, items: setItems });
  } catch (error) {
    console.error("Error updating inventory set:", error);
    res.status(500).json({ message: "Failed to update inventory set" });
  }
});

router.delete('/api/inventory-sets/:setId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const userId = req.user.id;

    const set = await storage.getInventorySet(setId);
    if (!set) {
      return res.status(404).json({ message: "Inventory set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminAccess = hospitals.some(h => h.id === set.hospitalId && h.role === "admin");
    
    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await storage.deleteInventorySet(setId);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting inventory set:", error);
    res.status(500).json({ message: "Failed to delete inventory set" });
  }
});

router.post('/api/inventory-sets/:setId/apply', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { setId } = req.params;
    const { anesthesiaRecordId } = req.body;
    const userId = req.user.id;

    if (!anesthesiaRecordId) {
      return res.status(400).json({ message: "anesthesiaRecordId is required" });
    }

    const set = await storage.getInventorySet(setId);
    if (!set) {
      return res.status(404).json({ message: "Inventory set not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === set.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const setItems = await storage.getInventorySetItems(setId);
    
    for (const setItem of setItems) {
      const existingUsage = await storage.getInventoryUsageByItem(anesthesiaRecordId, setItem.itemId);
      
      if (existingUsage) {
        const currentQty = existingUsage.overrideQty !== null 
          ? Number(existingUsage.overrideQty) 
          : Number(existingUsage.calculatedQty);
        const newQty = currentQty + setItem.quantity;
        await storage.updateInventoryUsage(existingUsage.id, newQty, `Applied set: ${set.name}`, userId);
      } else {
        await storage.createInventoryUsage({
          anesthesiaRecordId,
          itemId: setItem.itemId,
          calculatedQty: "0",
          overrideQty: String(setItem.quantity),
          overrideReason: `Applied set: ${set.name}`,
          overriddenBy: userId,
          overriddenAt: new Date(),
        });
      }
    }

    res.json({ message: "Set applied successfully", itemsApplied: setItems.length });
  } catch (error) {
    console.error("Error applying inventory set:", error);
    res.status(500).json({ message: "Failed to apply inventory set" });
  }
});

export default router;
