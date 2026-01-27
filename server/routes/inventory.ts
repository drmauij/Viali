import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { sendStockAlertEmail, StockAlertItem } from "../resend";
import { 
  insertItemSchema, 
  insertFolderSchema,
  items,
  stockLevels,
  supplierCodes,
  itemCodes,
  anesthesiaMedications,
  anesthesiaRecords,
  surgeries
} from "@shared/schema";
import { eq, inArray, and, gte, sql, or, isNull } from "drizzle-orm";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  checkLicenseLimit,
  requireWriteAccess,
  hasLogisticsAccess
} from "../utils";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

const router = Router();

router.get('/api/dashboard/kpis/:hospitalId', isAuthenticated, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const kpis = await storage.getDashboardKPIs(hospitalId);
    res.json(kpis);
  } catch (error) {
    console.error("Error fetching KPIs:", error);
    res.status(500).json({ message: "Failed to fetch KPIs" });
  }
});

// Get all units for a hospital (for transfer destination selection)
router.get('/api/units/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasHospitalAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasHospitalAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const units = await storage.getUnits(hospitalId);
    res.json(units);
  } catch (error) {
    console.error("Error fetching units:", error);
    res.status(500).json({ message: "Failed to fetch units" });
  }
});

router.get('/api/folders/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, module: moduleType } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasHospitalAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasHospitalAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    let effectiveUnitId = unitId;
    
    if (moduleType) {
      const units = await storage.getUnits(hospitalId);
      if (moduleType === 'anesthesia') {
        const anesthesiaUnit = units.find(u => u.type === 'anesthesia');
        if (anesthesiaUnit) {
          effectiveUnitId = anesthesiaUnit.id;
        }
      } else if (moduleType === 'surgery') {
        const surgeryUnit = units.find(u => u.type === 'or');
        if (surgeryUnit) {
          effectiveUnitId = surgeryUnit.id;
        }
      }
    }
    
    if (!moduleType && unitId) {
      const hasUnitAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      // Allow logistics users to access any unit in their hospital
      const isLogisticsUser = userHospitals.some(h => h.id === hospitalId && h.isLogisticModule);
      if (!hasUnitAccess && !isLogisticsUser) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const folders = await storage.getFolders(hospitalId, effectiveUnitId);
    res.json(folders);
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({ message: "Failed to fetch folders" });
  }
});

router.post('/api/folders', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const folderData = insertFolderSchema.parse(req.body);
    const userId = req.user.id;
    
    // Pass the requested unitId to verify the user has access to this specific unit
    const unitId = await getUserUnitForHospital(userId, folderData.hospitalId, folderData.unitId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital/unit" });
    }
    
    const folder = await storage.createFolder(folderData);
    res.status(201).json(folder);
  } catch (error) {
    console.error("Error creating folder:", error);
    res.status(500).json({ message: "Failed to create folder" });
  }
});

router.patch('/api/folders/bulk-sort', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { folders: folderUpdates } = req.body;
    const userId = req.user.id;
    
    if (!folderUpdates || !Array.isArray(folderUpdates)) {
      return res.status(400).json({ message: "Folders array is required" });
    }

    let updatedCount = 0;
    for (const folderUpdate of folderUpdates) {
      if (!folderUpdate.id || folderUpdate.sortOrder === undefined) {
        continue;
      }

      const folder = await storage.getFolder(folderUpdate.id);
      if (!folder) {
        continue;
      }

      const unitId = await getUserUnitForHospital(userId, folder.hospitalId);
      if (!unitId || unitId !== folder.unitId) {
        continue;
      }

      await storage.updateFolder(folderUpdate.id, { sortOrder: folderUpdate.sortOrder });
      updatedCount++;
    }

    res.json({ message: "Folder sort order updated successfully", updatedCount });
  } catch (error) {
    console.error("Error updating folder sort order:", error);
    res.status(500).json({ message: "Failed to update folder sort order" });
  }
});

router.patch('/api/folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { folderId } = req.params;
    const updates = req.body;
    const userId = req.user.id;
    
    const folder = await storage.getFolder(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, folder.hospitalId);
    if (!unitId || unitId !== folder.unitId) {
      return res.status(403).json({ message: "Access denied to this folder" });
    }
    
    const updated = await storage.updateFolder(folderId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating folder:", error);
    res.status(500).json({ message: "Failed to update folder" });
  }
});

router.delete('/api/folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.id;
    
    const folder = await storage.getFolder(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, folder.hospitalId);
    if (!unitId || unitId !== folder.unitId) {
      return res.status(403).json({ message: "Access denied to this folder" });
    }
    
    await storage.deleteFolder(folderId);
    res.json({ message: "Folder deleted successfully" });
  } catch (error) {
    console.error("Error deleting folder:", error);
    res.status(500).json({ message: "Failed to delete folder" });
  }
});

router.get('/api/items/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { critical, controlled, belowMin, expiring, unitId, module: moduleType, includeArchived } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasHospitalAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasHospitalAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    let effectiveUnitId = unitId;
    
    if (moduleType) {
      const units = await storage.getUnits(hospitalId);
      if (moduleType === 'anesthesia') {
        const anesthesiaUnit = units.find(u => u.type === 'anesthesia');
        if (anesthesiaUnit) {
          effectiveUnitId = anesthesiaUnit.id;
        }
      } else if (moduleType === 'surgery') {
        const surgeryUnit = units.find(u => u.type === 'or');
        if (surgeryUnit) {
          effectiveUnitId = surgeryUnit.id;
        }
      }
    }
    
    if (!moduleType && unitId) {
      const hasUnitAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      // Allow logistics users to access any unit in their hospital
      const isLogisticsUser = userHospitals.some(h => h.id === hospitalId && h.isLogisticModule);
      if (!hasUnitAccess && !isLogisticsUser) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const filters = {
      critical: critical === 'true',
      controlled: controlled === 'true',
      belowMin: belowMin === 'true',
      expiring: expiring === 'true',
      includeArchived: includeArchived === 'true',
    };
    
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value)
    );
    
    // Always pass filters if includeArchived is requested
    const itemsList = await storage.getItems(hospitalId, effectiveUnitId, includeArchived === 'true' ? { ...activeFilters, includeArchived: true } : (Object.keys(activeFilters).length > 0 ? activeFilters : undefined));
    res.json(itemsList);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ message: "Failed to fetch items" });
  }
});

// Get all item codes for a hospital (for search functionality)
router.get('/api/item-codes/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get all item codes for items in this hospital/unit
    const codes = await db
      .select({
        itemId: itemCodes.itemId,
        gtin: itemCodes.gtin,
        pharmacode: itemCodes.pharmacode,
      })
      .from(itemCodes)
      .innerJoin(items, eq(items.id, itemCodes.itemId))
      .where(unitId 
        ? and(eq(items.hospitalId, hospitalId), eq(items.unitId, unitId as string))
        : eq(items.hospitalId, hospitalId)
      );
    
    res.json(codes);
  } catch (error) {
    console.error("Error fetching item codes:", error);
    res.status(500).json({ message: "Failed to fetch item codes" });
  }
});

router.get('/api/items/detail/:itemId', isAuthenticated, async (req: any, res) => {
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
    
    const lots = await storage.getLots(itemId);
    res.json({ ...item, lots });
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ message: "Failed to fetch item" });
  }
});

// Single item fetch with stock level - used for dialog-only mode from matches page
router.get('/api/items/single/:itemId', isAuthenticated, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    // Check hospital access
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === item.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this item" });
    }
    
    // Get stock level for this item
    const stockLevel = await storage.getStockLevel(itemId, item.unitId);
    
    res.json({ 
      ...item, 
      stockLevel: stockLevel || { qtyOnHand: 0, qtyAllocated: 0 }
    });
  } catch (error) {
    console.error("Error fetching single item:", error);
    res.status(500).json({ message: "Failed to fetch item" });
  }
});

router.post('/api/items', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const itemData = insertItemSchema.parse(req.body);
    
    let licenseCheck;
    try {
      licenseCheck = await checkLicenseLimit(itemData.hospitalId);
    } catch (error: any) {
      if (error.message === "Hospital not found") {
        return res.status(404).json({ message: "Hospital not found" });
      }
      throw error;
    }
    
    if (!licenseCheck.allowed) {
      return res.status(403).json({
        error: "LICENSE_LIMIT_REACHED",
        message: `You have reached the limit of ${licenseCheck.limit} items for your ${licenseCheck.licenseType} plan`,
        currentCount: licenseCheck.currentCount,
        limit: licenseCheck.limit,
        licenseType: licenseCheck.licenseType,
      });
    }
    
    if (itemData.controlled && itemData.unit === "Single unit") {
      if (!itemData.packSize || itemData.packSize <= 0) {
        return res.status(400).json({ 
          message: "Controlled items with 'Single unit' type must have a pack size greater than 0" 
        });
      }
    }

    if (itemData.controlled && itemData.unit.toLowerCase() === "pack") {
      if (!itemData.trackExactQuantity) {
        return res.status(400).json({ 
          message: "Controlled packed items must have Track Exact Quantity enabled" 
        });
      }
    }
    
    const item = await storage.createItem(itemData);
    
    if (req.body.initialStock !== undefined && req.body.initialStock > 0) {
      await storage.updateStockLevel(item.id, item.unitId, req.body.initialStock);
    }
    
    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ message: "Failed to create item" });
  }
});

router.patch('/api/items/bulk-update', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { items: bulkItems } = req.body;
    const userId = req.user.id;
    
    if (!bulkItems || !Array.isArray(bulkItems) || bulkItems.length === 0) {
      return res.status(400).json({ message: "Items array is required" });
    }

    const updatedItems = [];
    for (const bulkItem of bulkItems) {
      if (!bulkItem.id) {
        continue;
      }

      const item = await storage.getItem(bulkItem.id);
      if (!item) {
        continue;
      }
      
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
        continue;
      }

      const updates: any = {};
      if (bulkItem.minThreshold !== undefined) updates.minThreshold = bulkItem.minThreshold;
      if (bulkItem.maxThreshold !== undefined) updates.maxThreshold = bulkItem.maxThreshold;
      if (bulkItem.name !== undefined) updates.name = bulkItem.name;
      if (bulkItem.unit !== undefined) updates.unit = bulkItem.unit;
      if (bulkItem.packSize !== undefined) updates.packSize = bulkItem.packSize;
      if (bulkItem.controlled !== undefined) updates.controlled = bulkItem.controlled;
      
      const finalControlled = bulkItem.controlled !== undefined ? bulkItem.controlled : item.controlled;
      const finalUnit = bulkItem.unit !== undefined ? bulkItem.unit : item.unit;
      const finalPackSize = bulkItem.packSize !== undefined ? bulkItem.packSize : item.packSize;
      
      if (finalControlled && finalUnit === "Single unit") {
        if (!finalPackSize || finalPackSize <= 0) {
          return res.status(400).json({ 
            message: `Item "${item.name}" is controlled with 'Single unit' type and must have a pack size greater than 0` 
          });
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await storage.updateItem(bulkItem.id, updates);
      }
      
      if (item.trackExactQuantity && bulkItem.currentUnits !== undefined) {
        const packSize = item.packSize || 1;
        const newStock = Math.ceil(bulkItem.currentUnits / packSize);
        
        await db
          .update(items)
          .set({ currentUnits: bulkItem.currentUnits })
          .where(eq(items.id, bulkItem.id));
        
        await storage.updateStockLevel(bulkItem.id, item.unitId, newStock);
      } else if (bulkItem.actualStock !== undefined) {
        await storage.updateStockLevel(bulkItem.id, item.unitId, bulkItem.actualStock);
      }
      
      updatedItems.push({ id: bulkItem.id, ...updates });
    }
    
    res.json({ items: updatedItems });
  } catch (error: any) {
    console.error("Error updating bulk items:", error);
    res.status(500).json({ message: error.message || "Failed to update items" });
  }
});

router.patch('/api/items/bulk-sort', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { items: itemUpdates } = req.body;
    const userId = req.user.id;
    
    if (!itemUpdates || !Array.isArray(itemUpdates)) {
      return res.status(400).json({ message: "Items array is required" });
    }

    for (const itemUpdate of itemUpdates) {
      if (!itemUpdate.id || itemUpdate.sortOrder === undefined) {
        continue;
      }

      const item = await storage.getItem(itemUpdate.id);
      if (!item) continue;

      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
        continue;
      }

      await storage.updateItem(itemUpdate.id, { sortOrder: itemUpdate.sortOrder });
    }

    res.json({ message: "Item sort order updated successfully" });
  } catch (error) {
    console.error("Error updating item sort order:", error);
    res.status(500).json({ message: "Failed to update item sort order" });
  }
});

// Bulk update isBillable status for multiple items
router.patch('/api/items/bulk-billable', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemIds, isBillable, hospitalId } = req.body;
    const userId = req.user.id;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: "Item IDs array is required" });
    }
    
    if (typeof isBillable !== 'boolean') {
      return res.status(400).json({ message: "isBillable must be a boolean" });
    }

    // Verify user has access to the hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const results = {
      updated: [] as string[],
      failed: [] as { id: string; reason: string }[],
    };

    for (const itemId of itemIds) {
      try {
        const item = await storage.getItem(itemId);
        if (!item) {
          results.failed.push({ id: itemId, reason: "Item not found" });
          continue;
        }

        if (item.hospitalId !== hospitalId) {
          results.failed.push({ id: itemId, reason: "Item belongs to different hospital" });
          continue;
        }

        await storage.updateItem(itemId, { isInvoiceable: isBillable });
        results.updated.push(itemId);
      } catch (error: any) {
        console.error(`Error updating item ${itemId}:`, error);
        results.failed.push({ id: itemId, reason: error.message || "Unknown error" });
      }
    }

    res.json({
      success: true,
      updatedCount: results.updated.length,
      failedCount: results.failed.length,
      results
    });
  } catch (error) {
    console.error("Error bulk updating billable status:", error);
    res.status(500).json({ message: "Failed to bulk update billable status" });
  }
});

router.patch('/api/items/:itemId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    // Get active unit from header (preferred) or body (fallback)
    const activeUnitId = getActiveUnitIdFromRequest(req) || req.body.activeUnitId;
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    // Allow access if user's unit matches the item's unit OR if user has logistics access
    if (unitId !== item.unitId) {
      const userHasLogisticsAccess = await hasLogisticsAccess(userId, item.hospitalId);
      if (!userHasLogisticsAccess) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
    }
    
    if (item.controlled && req.body.currentUnits !== undefined && req.body.currentUnits !== item.currentUnits) {
      return res.status(403).json({ 
        message: "Controlled substance quantities cannot be edited directly. Use the Controller tab to log all movements." 
      });
    }
    
    const finalControlled = req.body.controlled !== undefined ? req.body.controlled : item.controlled;
    const finalUnit = req.body.unit !== undefined ? req.body.unit : item.unit;
    const finalPackSize = req.body.packSize !== undefined ? req.body.packSize : item.packSize;
    const finalTrackExactQuantity = req.body.trackExactQuantity !== undefined ? req.body.trackExactQuantity : item.trackExactQuantity;
    
    if (finalControlled && finalUnit === "Single unit") {
      if (!finalPackSize || finalPackSize <= 0) {
        return res.status(400).json({ 
          message: "Controlled items with 'Single unit' type must have a pack size greater than 0" 
        });
      }
    }

    if (finalControlled && finalUnit.toLowerCase() === "pack") {
      if (!finalTrackExactQuantity) {
        return res.status(400).json({ 
          message: "Controlled packed items must have Track Exact Quantity enabled" 
        });
      }
    }
    
    const updates: any = {
      name: req.body.name,
      description: req.body.description,
      unit: req.body.unit,
      barcodes: req.body.barcodes,
      minThreshold: req.body.minThreshold,
      maxThreshold: req.body.maxThreshold,
      defaultOrderQty: req.body.defaultOrderQty,
      packSize: req.body.packSize,
      currentUnits: req.body.currentUnits,
      trackExactQuantity: req.body.trackExactQuantity,
      critical: req.body.critical,
      controlled: req.body.controlled,
      imageUrl: req.body.imageUrl,
      patientPrice: req.body.patientPrice,
      dailyUsageEstimate: req.body.dailyUsageEstimate,
      status: req.body.status,
    };
    
    if (req.body.folderId !== undefined) {
      updates.folderId = req.body.folderId;
    }
    
    const updatedItem = await storage.updateItem(itemId, updates);
    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Failed to update item" });
  }
});

router.patch('/api/items/:itemId/reduce-unit', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    const activeUnitId = getActiveUnitIdFromRequest(req);
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this item" });
    }
    
    // Allow access if user's unit matches the item's unit OR if user has logistics access
    if (unitId !== item.unitId) {
      const userHasLogisticsAccess = await hasLogisticsAccess(userId, item.hospitalId);
      if (!userHasLogisticsAccess) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
    }
    
    if (item.controlled) {
      return res.status(403).json({ message: "Controlled substances must be managed through the Controller tab only" });
    }
    
    if (item.trackExactQuantity) {
      const currentCurrentUnits = item.currentUnits || 0;
      if (currentCurrentUnits <= 0) {
        return res.status(400).json({ message: "No units available to reduce" });
      }
      
      const newCurrentUnits = currentCurrentUnits - 1;
      const packSize = item.packSize || 1;
      const newStock = Math.ceil(newCurrentUnits / packSize);
      
      await db
        .update(items)
        .set({ currentUnits: newCurrentUnits })
        .where(eq(items.id, itemId));
      
      await storage.updateStockLevel(itemId, unitId, newStock);
      
      const updatedItem = await storage.getItem(itemId);
      res.json(updatedItem);
    } else if (item.unit.toLowerCase() === 'single unit') {
      // Use item.unitId to look up stock (stock is stored under the item's unit, not the user's unit)
      const currentStock = await storage.getStockLevel(itemId, item.unitId);
      const currentQty = currentStock?.qtyOnHand || 0;
      
      if (currentQty <= 0) {
        return res.status(400).json({ message: "No stock available to reduce" });
      }
      
      const newQty = currentQty - 1;
      await storage.updateStockLevel(itemId, item.unitId, newQty);
      
      const updatedItem = await storage.getItem(itemId);
      res.json(updatedItem);
    } else {
      // Pack items without trackExactQuantity - reduce pack count by 1
      // Use item.unitId to look up stock (stock is stored under the item's unit, not the user's unit)
      const currentStock = await storage.getStockLevel(itemId, item.unitId);
      const currentQty = currentStock?.qtyOnHand || 0;
      
      if (currentQty <= 0) {
        return res.status(400).json({ message: "No packs available to reduce" });
      }
      
      const newQty = currentQty - 1;
      await storage.updateStockLevel(itemId, item.unitId, newQty);
      
      const updatedItem = await storage.getItem(itemId);
      res.json(updatedItem);
    }
  } catch (error) {
    console.error("Error reducing unit:", error);
    res.status(500).json({ message: "Failed to reduce unit" });
  }
});

router.delete('/api/items/:itemId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    const activeUnitId = getActiveUnitIdFromRequest(req);
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    // Use active unit from request header, or fall back to user's default unit for this hospital
    const unitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    // Allow access if user's unit matches the item's unit OR if user has logistics access
    if (item.unitId !== unitId) {
      const userHasLogisticsAccess = await hasLogisticsAccess(userId, item.hospitalId);
      if (!userHasLogisticsAccess) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
    }
    
    await storage.deleteItem(itemId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Failed to delete item" });
  }
});

router.post('/api/items/bulk-delete', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemIds } = req.body;
    const userId = req.user.id;
    const activeUnitId = getActiveUnitIdFromRequest(req);
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: "Item IDs array is required" });
    }

    const results = {
      deleted: [] as string[],
      failed: [] as { id: string; reason: string }[]
    };

    for (const itemId of itemIds) {
      try {
        const item = await storage.getItem(itemId);
        if (!item) {
          results.failed.push({ id: itemId, reason: "Item not found" });
          continue;
        }
        
        // Use active unit from request header, or fall back to user's default unit
        const unitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
        if (!unitId) {
          results.failed.push({ id: itemId, reason: "Access denied" });
          continue;
        }
        
        // Allow access if user's unit matches the item's unit OR if user has logistics access
        if (unitId !== item.unitId) {
          const userHasLogisticsAccess = await hasLogisticsAccess(userId, item.hospitalId);
          if (!userHasLogisticsAccess) {
            results.failed.push({ id: itemId, reason: "Access denied" });
            continue;
          }
        }
        
        await storage.deleteItem(itemId);
        results.deleted.push(itemId);
      } catch (error: any) {
        console.error(`Error deleting item ${itemId}:`, error);
        results.failed.push({ id: itemId, reason: error.message || "Unknown error" });
      }
    }

    res.json({
      success: true,
      deletedCount: results.deleted.length,
      failedCount: results.failed.length,
      results
    });
  } catch (error) {
    console.error("Error bulk deleting items:", error);
    res.status(500).json({ message: "Failed to bulk delete items" });
  }
});

// Bulk move items to another unit (administrative reassignment, not physical transfer)
router.post('/api/items/bulk-move', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemIds, targetUnitId, hospitalId } = req.body;
    const userId = req.user.id;
    
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ message: "Item IDs array is required" });
    }
    
    if (!targetUnitId) {
      return res.status(400).json({ message: "Target unit ID is required" });
    }

    // Verify user has access to the hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    // Verify target unit exists and belongs to the same hospital
    const targetUnit = await storage.getUnit(targetUnitId);
    if (!targetUnit || targetUnit.hospitalId !== hospitalId) {
      return res.status(400).json({ message: "Invalid target unit" });
    }

    const results = {
      moved: [] as string[],
      failed: [] as { id: string; reason: string }[]
    };

    for (const itemId of itemIds) {
      try {
        const item = await storage.getItem(itemId);
        if (!item) {
          results.failed.push({ id: itemId, reason: "Item not found" });
          continue;
        }
        
        // Verify item belongs to the same hospital
        if (item.hospitalId !== hospitalId) {
          results.failed.push({ id: itemId, reason: "Item belongs to different hospital" });
          continue;
        }

        // Skip if already in target unit
        if (item.unitId === targetUnitId) {
          results.moved.push(itemId);
          continue;
        }
        
        // Update item's unitId (simple reassignment)
        await storage.updateItem(itemId, { unitId: targetUnitId });
        results.moved.push(itemId);
      } catch (error: any) {
        console.error(`Error moving item ${itemId}:`, error);
        results.failed.push({ id: itemId, reason: error.message || "Unknown error" });
      }
    }

    res.json({
      success: true,
      movedCount: results.moved.length,
      failedCount: results.failed.length,
      results
    });
  } catch (error) {
    console.error("Error bulk moving items:", error);
    res.status(500).json({ message: "Failed to bulk move items" });
  }
});


// Transfer items between units
router.post('/api/items/transfer', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, sourceUnitId, destinationUnitId, items: transferItems } = req.body;
    const userId = req.user.id;
    
    if (!hospitalId || !sourceUnitId || !destinationUnitId || !transferItems || !Array.isArray(transferItems)) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    if (sourceUnitId === destinationUnitId) {
      return res.status(400).json({ message: "Source and destination units must be different" });
    }
    
    // Verify user has access to the hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    // Verify both units exist and belong to the same hospital
    const sourceUnit = await storage.getUnit(sourceUnitId);
    const destUnit = await storage.getUnit(destinationUnitId);
    
    if (!sourceUnit || sourceUnit.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Invalid source unit" });
    }
    if (!destUnit || destUnit.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Invalid destination unit" });
    }
    
    const results = {
      transferred: [] as string[],
      failed: [] as { itemId: string; reason: string }[],
      created: [] as string[],
    };
    
    for (const transferItem of transferItems) {
      const { itemId, transferType, transferQty, pharmacode, gtin } = transferItem;
      
      // Track original values for rollback
      let sourceStockOriginal: number | null = null;
      let sourceUnitsOriginal: number | null = null;
      let destStockOriginal: number | null = null;
      let destUnitsOriginal: number | null = null;
      let destItemId: string | null = null;
      let createdNewItem = false;
      let newItemId: string | null = null;
      
      try {
        // Get source item
        const sourceItem = await storage.getItem(itemId);
        if (!sourceItem || sourceItem.unitId !== sourceUnitId) {
          results.failed.push({ itemId, reason: "Item not found in source unit" });
          continue;
        }
        
        // Get source stock level
        const sourceStock = await storage.getStockLevel(itemId, sourceUnitId);
        const sourceStockQty = sourceStock?.qtyOnHand || 0;
        sourceStockOriginal = sourceStockQty;
        sourceUnitsOriginal = sourceItem.currentUnits || 0;
        
        const packSize = sourceItem.packSize || 1;
        
        // Calculate transfer amounts based on transfer type
        // For unit transfers: only update currentUnits, qtyOnHand stays the same
        // For pack transfers: update qtyOnHand, and calculate equivalent units
        let packTransferQty = 0;
        let unitTransferQty = 0;
        
        if (transferType === 'units' && sourceItem.trackExactQuantity) {
          // Transferring individual units only - no pack changes
          unitTransferQty = transferQty;
          packTransferQty = 0; // Don't touch pack counts for unit transfers
        } else {
          // Transferring whole packs
          packTransferQty = transferQty;
          unitTransferQty = transferQty * packSize;
        }
        
        // Validate we have enough stock
        if (transferType === 'units') {
          if (sourceUnitsOriginal < unitTransferQty) {
            results.failed.push({ itemId, reason: "Insufficient units" });
            continue;
          }
        } else {
          if (sourceStockQty < packTransferQty) {
            results.failed.push({ itemId, reason: "Insufficient stock" });
            continue;
          }
        }
        
        // Find matching item in destination by pharmacode or GTIN
        if (pharmacode || gtin) {
          const destItems = await storage.getItems(hospitalId, destinationUnitId);
          
          for (const destItem of destItems) {
            const destCodes = await storage.getItemCode(destItem.id);
            if (destCodes) {
              if (pharmacode && destCodes.pharmacode === pharmacode) {
                destItemId = destItem.id;
                break;
              }
              if (gtin && destCodes.gtin === gtin) {
                destItemId = destItem.id;
                break;
              }
            }
          }
        }
        
        // Helper function to rollback destination changes
        const rollbackDestination = async () => {
          try {
            if (destItemId && destStockOriginal !== null) {
              await storage.updateStockLevel(destItemId, destinationUnitId, destStockOriginal);
              if (destUnitsOriginal !== null) {
                await storage.updateItem(destItemId, { currentUnits: destUnitsOriginal });
              }
            }
            if (createdNewItem && newItemId) {
              await storage.deleteItem(newItemId);
              // Remove from created list if rollback
              const idx = results.created.indexOf(newItemId);
              if (idx > -1) results.created.splice(idx, 1);
            }
          } catch (rollbackErr) {
            console.error(`Rollback failed for ${itemId}:`, rollbackErr);
          }
        };
        
        // STEP 1: Do destination operations first
        try {
          if (destItemId) {
            // Increase existing destination stock
            const destStock = await storage.getStockLevel(destItemId, destinationUnitId);
            destStockOriginal = destStock?.qtyOnHand || 0;
            
            if (packTransferQty > 0) {
              await storage.updateStockLevel(destItemId, destinationUnitId, destStockOriginal + packTransferQty);
            }
            
            // Update destination item's currentUnits if tracking exact quantity
            const destItem = await storage.getItem(destItemId);
            if (destItem?.trackExactQuantity && unitTransferQty > 0) {
              destUnitsOriginal = destItem.currentUnits || 0;
              await storage.updateItem(destItemId, { currentUnits: destUnitsOriginal + unitTransferQty });
            }
          } else {
            // Create new item in destination unit
            createdNewItem = true;
            const sourceCodes = await storage.getItemCode(itemId);
            
            const newItem = await storage.createItem({
              hospitalId,
              unitId: destinationUnitId,
              name: sourceItem.name,
              description: sourceItem.description,
              unit: sourceItem.unit,
              packSize: sourceItem.packSize,
              minThreshold: sourceItem.minThreshold,
              maxThreshold: sourceItem.maxThreshold,
              defaultOrderQty: sourceItem.defaultOrderQty,
              critical: sourceItem.critical,
              controlled: sourceItem.controlled,
              trackExactQuantity: sourceItem.trackExactQuantity,
              currentUnits: sourceItem.trackExactQuantity ? unitTransferQty : 0,
              vendorId: sourceItem.vendorId,
              imageUrl: sourceItem.imageUrl,
            });
            newItemId = newItem.id;
            
            // Copy item codes to new item
            if (sourceCodes) {
              await storage.createItemCode({
                itemId: newItem.id,
                gtin: sourceCodes.gtin,
                pharmacode: sourceCodes.pharmacode,
                migel: sourceCodes.migel,
                atc: sourceCodes.atc,
                manufacturer: sourceCodes.manufacturer,
                packContent: sourceCodes.packContent,
                unitsPerPack: sourceCodes.unitsPerPack,
                contentPerUnit: sourceCodes.contentPerUnit,
              });
            }
            
            // Set initial stock level
            if (packTransferQty > 0) {
              await storage.updateStockLevel(newItem.id, destinationUnitId, packTransferQty);
            }
          }
        } catch (destError) {
          // Destination update failed - rollback any partial destination changes
          console.error(`Destination update failed for ${itemId}:`, destError);
          await rollbackDestination();
          throw destError;
        }
        
        // STEP 2: Decrease source stock (after destination is updated)
        let sourceStockUpdated = false;
        try {
          if (packTransferQty > 0) {
            await storage.updateStockLevel(itemId, sourceUnitId, Math.max(0, sourceStockQty - packTransferQty));
            sourceStockUpdated = true;
          }
          
          // Update source item's currentUnits if tracking exact quantity
          if (sourceItem.trackExactQuantity && unitTransferQty > 0) {
            await storage.updateItem(itemId, { currentUnits: Math.max(0, sourceUnitsOriginal - unitTransferQty) });
          }
        } catch (sourceError) {
          // Source update failed - rollback both source and destination changes
          console.error(`Source update failed for ${itemId}:`, sourceError);
          
          // Rollback source changes if any were made
          try {
            if (sourceStockUpdated && sourceStockOriginal !== null) {
              await storage.updateStockLevel(itemId, sourceUnitId, sourceStockOriginal);
            }
            if (sourceItem.trackExactQuantity && sourceUnitsOriginal !== null) {
              await storage.updateItem(itemId, { currentUnits: sourceUnitsOriginal });
            }
          } catch (sourceRollbackErr) {
            console.error(`Source rollback failed for ${itemId}:`, sourceRollbackErr);
          }
          
          // Rollback destination changes
          await rollbackDestination();
          throw sourceError;
        }
        
        // STEP 3: Create activity record (non-critical, don't rollback on failure)
        try {
          const auditDelta = transferType === 'units' ? -unitTransferQty : -packTransferQty;
          await storage.createActivity({
            unitId: sourceUnitId,
            itemId,
            userId,
            action: 'transfer_out',
            delta: auditDelta,
            movementType: 'OUT',
            notes: `Transferred ${transferType === 'units' ? unitTransferQty + ' units' : packTransferQty + ' packs'} to ${destUnit.name}`,
          });
        } catch (activityError) {
          console.error(`Activity log failed for ${itemId}:`, activityError);
          // Don't fail the transfer for activity log errors
        }
        
        // Only add to created list after full success
        if (createdNewItem && newItemId) {
          results.created.push(newItemId);
        }
        results.transferred.push(itemId);
        
      } catch (error: any) {
        console.error(`Error transferring item ${itemId}:`, error);
        results.failed.push({ itemId, reason: error.message || "Unknown error" });
      }
    }
    
    res.json({
      success: true,
      transferredCount: results.transferred.length,
      createdCount: results.created.length,
      failedCount: results.failed.length,
      results,
    });
  } catch (error) {
    console.error("Error transferring items:", error);
    res.status(500).json({ message: "Failed to transfer items" });
  }
});

// ============ Price Sync Routes ============

router.get('/api/supplier-catalogs/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const catalogs = await storage.getSupplierCatalogs(hospitalId);
    res.json(catalogs);
  } catch (error) {
    console.error("Error fetching supplier catalogs:", error);
    res.status(500).json({ message: "Failed to fetch supplier catalogs" });
  }
});

router.post('/api/supplier-catalogs', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { 
      hospitalId, 
      supplierName, 
      supplierType, 
      apiBaseUrl, 
      customerNumber, 
      apiPassword,
      browserLoginUrl,
      browserUsername
    } = req.body;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital || hospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const existing = await storage.getSupplierCatalogByName(hospitalId, supplierName);
    if (existing) {
      return res.status(400).json({ message: "Catalog for this supplier already exists" });
    }
    
    const catalog = await storage.createSupplierCatalog({
      hospitalId,
      supplierName,
      supplierType: supplierType || 'api',
      apiBaseUrl,
      customerNumber,
      apiPassword,
      browserLoginUrl,
      browserUsername,
      isEnabled: true,
      syncSchedule: 'manual',
    });
    
    res.json(catalog);
  } catch (error) {
    console.error("Error creating supplier catalog:", error);
    res.status(500).json({ message: "Failed to create supplier catalog" });
  }
});

router.patch('/api/supplier-catalogs/:catalogId', isAuthenticated, async (req: any, res) => {
  try {
    const { catalogId } = req.params;
    const userId = req.user.id;
    const updates = req.body;
    
    const catalog = await storage.getSupplierCatalog(catalogId);
    if (!catalog) {
      return res.status(404).json({ message: "Catalog not found" });
    }
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === catalog.hospitalId);
    if (!hospital || hospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const updated = await storage.updateSupplierCatalog(catalogId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating supplier catalog:", error);
    res.status(500).json({ message: "Failed to update supplier catalog" });
  }
});

router.delete('/api/supplier-catalogs/:catalogId', isAuthenticated, async (req: any, res) => {
  try {
    const { catalogId } = req.params;
    const userId = req.user.id;
    
    const catalog = await storage.getSupplierCatalog(catalogId);
    if (!catalog) {
      return res.status(404).json({ message: "Catalog not found" });
    }
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === catalog.hospitalId);
    if (!hospital || hospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    await storage.deleteSupplierCatalog(catalogId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting supplier catalog:", error);
    res.status(500).json({ message: "Failed to delete supplier catalog" });
  }
});

router.get('/api/price-sync-jobs/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === hospitalId);
    if (!hospital) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const jobs = await storage.getPriceSyncJobs(hospitalId);
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching price sync jobs:", error);
    res.status(500).json({ message: "Failed to fetch price sync jobs" });
  }
});

router.post('/api/price-sync/trigger', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { catalogId } = req.body;
    
    const catalog = await storage.getSupplierCatalog(catalogId);
    if (!catalog) {
      return res.status(404).json({ message: "Catalog not found" });
    }
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find(h => h.id === catalog.hospitalId);
    if (!hospital || hospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const existingJob = await storage.getLatestPriceSyncJob(catalogId);
    if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'processing')) {
      return res.status(400).json({ 
        message: "A sync job is already in progress",
        jobId: existingJob.id 
      });
    }
    
    const job = await storage.createPriceSyncJob({
      catalogId,
      hospitalId: catalog.hospitalId,
      status: 'queued',
      jobType: 'full_sync',
      triggeredBy: userId,
    });
    
    res.json({ 
      success: true, 
      jobId: job.id,
      message: "Price sync job queued successfully" 
    });
  } catch (error) {
    console.error("Error triggering price sync:", error);
    res.status(500).json({ message: "Failed to trigger price sync" });
  }
});

router.get('/api/price-sync-jobs/status/:jobId', isAuthenticated, async (req: any, res) => {
  try {
    const { jobId } = req.params;
    const job = await storage.getPriceSyncJob(jobId);
    
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    res.json(job);
  } catch (error) {
    console.error("Error fetching job status:", error);
    res.status(500).json({ message: "Failed to fetch job status" });
  }
});

// Supplier Matches endpoints
router.get('/api/supplier-matches/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const pendingMatches = await storage.getPendingSupplierMatches(hospitalId);
    
    // Group matches: direct (high confidence single match) vs suggested (multiple or lower confidence)
    const itemMatchGroups = new Map<string, typeof pendingMatches>();
    
    for (const match of pendingMatches) {
      const itemId = match.itemId;
      if (!itemMatchGroups.has(itemId)) {
        itemMatchGroups.set(itemId, []);
      }
      itemMatchGroups.get(itemId)!.push(match);
    }
    
    const directMatches: typeof pendingMatches = [];
    const suggestedMatches: { item: { id: string; name: string; description: string | null }; matches: typeof pendingMatches }[] = [];
    
    for (const [itemId, matches] of Array.from(itemMatchGroups.entries())) {
      if (matches.length === 1) {
        const conf = parseFloat(matches[0].matchConfidence || '0');
        if (conf >= 0.9) {
          directMatches.push(matches[0]);
        } else {
          suggestedMatches.push({ 
            item: { id: matches[0].item.id, name: matches[0].item.name, description: matches[0].item.description },
            matches 
          });
        }
      } else {
        suggestedMatches.push({ 
          item: { id: matches[0].item.id, name: matches[0].item.name, description: matches[0].item.description },
          matches 
        });
      }
    }
    
    res.json({ directMatches, suggestedMatches });
  } catch (error) {
    console.error("Error fetching supplier matches:", error);
    res.status(500).json({ message: "Failed to fetch supplier matches" });
  }
});

// Get confirmed supplier matches for a hospital
router.get('/api/supplier-matches/:hospitalId/confirmed', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const confirmedMatches = await storage.getConfirmedSupplierMatches(hospitalId);
    res.json(confirmedMatches);
  } catch (error) {
    console.error("Error fetching confirmed matches:", error);
    res.status(500).json({ message: "Failed to fetch confirmed matches" });
  }
});

// Get items categorized by match status for improved UI
// Categories: unmatched, to-verify, confirmed-with-price, confirmed-no-price
router.get('/api/supplier-matches/:hospitalId/categorized', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId: queryUnitId } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    // Get active unit from request header to filter items by unit (same as standard inventory)
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied - no unit access" });
    }
    
    // Allow cross-unit access if user's unit has isLogisticModule enabled
    let unitId = userUnitId;
    if (queryUnitId && queryUnitId !== userUnitId) {
      const userUnit = await storage.getUnit(userUnitId);
      if (!userUnit?.isLogisticModule) {
        return res.status(403).json({ message: "Access denied - logistics module required for cross-unit access" });
      }
      // Verify the requested unit belongs to this hospital
      const requestedUnit = await storage.getUnit(queryUnitId as string);
      if (!requestedUnit || requestedUnit.hospitalId !== hospitalId) {
        return res.status(403).json({ message: "Invalid unit for this hospital" });
      }
      unitId = queryUnitId as string;
    }
    
    // Get all items for this hospital filtered by unit (exclude archived)
    const allItems = await db
      .select({
        id: items.id,
        name: items.name,
        description: items.description,
      })
      .from(items)
      .where(and(
        eq(items.hospitalId, hospitalId), 
        eq(items.unitId, unitId),
        or(eq(items.status, 'active'), isNull(items.status))
      ));
    
    // Get all supplier codes for these items
    const itemIds = allItems.map(i => i.id);
    const allSupplierCodes = itemIds.length > 0 
      ? await db
          .select()
          .from(supplierCodes)
          .where(inArray(supplierCodes.itemId, itemIds))
      : [];
    
    // Get all item codes for these items
    const allItemCodes = itemIds.length > 0
      ? await db
          .select()
          .from(itemCodes)
          .where(inArray(itemCodes.itemId, itemIds))
      : [];
    
    // Build lookup maps
    const supplierCodesByItem = new Map<string, typeof allSupplierCodes>();
    for (const code of allSupplierCodes) {
      if (!supplierCodesByItem.has(code.itemId)) {
        supplierCodesByItem.set(code.itemId, []);
      }
      supplierCodesByItem.get(code.itemId)!.push(code);
    }
    
    const itemCodesByItem = new Map<string, typeof allItemCodes[0]>();
    for (const code of allItemCodes) {
      itemCodesByItem.set(code.itemId, code);
    }
    
    // Categorize items
    const unmatched: any[] = [];
    const confirmedWithPrice: any[] = [];
    const confirmedNoPrice: any[] = [];
    
    for (const item of allItems) {
      const codes = supplierCodesByItem.get(item.id) || [];
      const itemCode = itemCodesByItem.get(item.id);
      
      // Only consider confirmed codes (pending/proximity matches are no longer used)
      const confirmedCodes = codes.filter(c => c.matchStatus === 'confirmed');
      
      const itemWithCodes = {
        ...item,
        itemCode: itemCode || null,
        supplierCodes: codes,
      };
      
      if (confirmedCodes.length > 0) {
        // Has confirmed match - prioritize preferred supplier for price check
        // First, try to find a preferred confirmed code
        const preferredCode = confirmedCodes.find(c => c.isPreferred);
        // Also check if ANY confirmed code has a valid price (for display purposes)
        const confirmedWithValidPrice = confirmedCodes.find(c => 
          c.basispreis && parseFloat(String(c.basispreis)) > 0
        );
        // Use preferred code if available, otherwise fall back to one with valid price, or first
        const confirmedCode = preferredCode || confirmedWithValidPrice || confirmedCodes[0];
        // Determine price status: if preferred has price OR any confirmed has price, consider it priced
        const hasPrice = (preferredCode?.basispreis && parseFloat(String(preferredCode.basispreis)) > 0) ||
                        (confirmedWithValidPrice?.basispreis && parseFloat(String(confirmedWithValidPrice.basispreis)) > 0);
        const itemData = {
          ...itemWithCodes,
          confirmedMatch: {
            id: confirmedCode.id,
            supplierName: confirmedCode.supplierName,
            articleCode: confirmedCode.articleCode,
            matchedProductName: confirmedCode.matchedProductName,
            catalogUrl: confirmedCode.catalogUrl,
            basispreis: confirmedCode.basispreis,
            publikumspreis: confirmedCode.publikumspreis,
            lastPriceUpdate: confirmedCode.lastPriceUpdate,
          },
        };
        
        if (hasPrice) {
          confirmedWithPrice.push(itemData);
        } else {
          confirmedNoPrice.push(itemData);
        }
      } else {
        // No confirmed matches - treat as unmatched
        unmatched.push(itemWithCodes);
      }
    }
    
    res.json({
      unmatched,
      confirmedWithPrice,
      confirmedNoPrice,
      counts: {
        unmatched: unmatched.length,
        confirmedWithPrice: confirmedWithPrice.length,
        confirmedNoPrice: confirmedNoPrice.length,
        total: allItems.length,
      },
    });
  } catch (error) {
    console.error("Error fetching categorized matches:", error);
    res.status(500).json({ message: "Failed to fetch categorized matches" });
  }
});

// Get matches for a specific sync job
router.get('/api/price-sync-jobs/:jobId/matches', isAuthenticated, async (req: any, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;
    
    // Verify access to the job
    const job = await storage.getPriceSyncJob(jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === job.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const matches = await storage.getSupplierMatchesByJobId(jobId);
    res.json(matches);
  } catch (error) {
    console.error("Error fetching job matches:", error);
    res.status(500).json({ message: "Failed to fetch job matches" });
  }
});

router.post('/api/supplier-codes/:id/confirm', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const code = await storage.getSupplierCode(id);
    if (!code) {
      return res.status(404).json({ message: "Supplier code not found" });
    }
    
    const updated = await storage.updateSupplierCode(id, { 
      matchStatus: 'confirmed',
      isActive: true
    });
    
    res.json(updated);
  } catch (error) {
    console.error("Error confirming match:", error);
    res.status(500).json({ message: "Failed to confirm match" });
  }
});

router.post('/api/supplier-codes/:id/reject', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const code = await storage.getSupplierCode(id);
    if (!code) {
      return res.status(404).json({ message: "Supplier code not found" });
    }
    
    const updated = await storage.updateSupplierCode(id, { 
      matchStatus: 'rejected',
      isActive: false
    });
    
    res.json(updated);
  } catch (error) {
    console.error("Error rejecting match:", error);
    res.status(500).json({ message: "Failed to reject match" });
  }
});

router.post('/api/supplier-codes/:id/select', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { itemId } = req.body;
    
    const code = await storage.getSupplierCode(id);
    if (!code) {
      return res.status(404).json({ message: "Supplier code not found" });
    }
    
    // Confirm this match and reject others for the same item
    const allMatchesForItem = await storage.getSupplierCodes(itemId);
    for (const match of allMatchesForItem) {
      if (match.id === id) {
        await storage.updateSupplierCode(match.id, { 
          matchStatus: 'confirmed',
          isActive: true,
          isPreferred: true
        });
      } else if (match.matchStatus === 'pending') {
        await storage.updateSupplierCode(match.id, { 
          matchStatus: 'rejected',
          isActive: false
        });
      }
    }
    
    const updated = await storage.getSupplierCode(id);
    res.json(updated);
  } catch (error) {
    console.error("Error selecting match:", error);
    res.status(500).json({ message: "Failed to select match" });
  }
});

// Update item codes (pharmacode, GTIN) for an item
router.put('/api/item-codes/:itemId', isAuthenticated, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const { pharmacode, gtin } = req.body;
    
    // Get the item to verify it exists
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    // Check user has access to this item's hospital
    const userId = req.user.id;
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === item.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    // Check if item code exists
    const existingCode = await storage.getItemCode(itemId);
    
    if (existingCode) {
      // Update existing item code
      const updated = await db
        .update(itemCodes)
        .set({
          pharmacode: pharmacode || null,
          gtin: gtin || null,
        })
        .where(eq(itemCodes.itemId, itemId))
        .returning();
      res.json(updated[0]);
    } else {
      // Create new item code
      const created = await db
        .insert(itemCodes)
        .values({
          id: crypto.randomUUID(),
          itemId,
          pharmacode: pharmacode || null,
          gtin: gtin || null,
        })
        .returning();
      res.json(created[0]);
    }
  } catch (error) {
    console.error("Error updating item codes:", error);
    res.status(500).json({ message: "Failed to update item codes" });
  }
});

// Stock Runway Calculation - Usage-based intelligent stock alerts
router.get('/api/items/:hospitalId/runway', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get hospital config for runway settings
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    // Use hospital-configured values or defaults
    const lookbackDays = hospital.runwayLookbackDays ?? 30;
    const targetRunway = hospital.runwayTargetDays ?? 14;
    const warningDays = hospital.runwayWarningDays ?? 7;
    
    // Get all items for this hospital/unit
    const itemsList = await storage.getItems(hospitalId, unitId);
    
    // Calculate usage from anesthesia medications over the lookback period
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - Number(lookbackDays));
    
    // Query medication usage grouped by itemId
    // Join through anesthesiaRecords -> surgeries to get hospitalId
    const usageQuery = await db
      .select({
        itemId: anesthesiaMedications.itemId,
        totalAdministrations: sql<number>`count(*)`,
        totalDose: sql<string>`sum(CASE WHEN ${anesthesiaMedications.dose} ~ '^[0-9.]+$' THEN ${anesthesiaMedications.dose}::numeric ELSE 0 END)`,
      })
      .from(anesthesiaMedications)
      .innerJoin(anesthesiaRecords, eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecords.id))
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          gte(anesthesiaMedications.timestamp, lookbackDate)
        )
      )
      .groupBy(anesthesiaMedications.itemId);
    
    // Create usage map
    const usageMap = new Map<string, { administrations: number; totalDose: number }>();
    for (const row of usageQuery) {
      usageMap.set(row.itemId, {
        administrations: row.totalAdministrations,
        totalDose: parseFloat(row.totalDose) || 0,
      });
    }
    
    // Get item codes for unitsPerPack info
    const itemIds = itemsList.map(i => i.id);
    const codesQuery = itemIds.length > 0 ? await db
      .select({
        itemId: itemCodes.itemId,
        unitsPerPack: itemCodes.unitsPerPack,
      })
      .from(itemCodes)
      .where(inArray(itemCodes.itemId, itemIds)) : [];
    
    const unitsPerPackMap = new Map<string, number>();
    for (const code of codesQuery) {
      if (code.unitsPerPack) {
        unitsPerPackMap.set(code.itemId, code.unitsPerPack);
      }
    }
    
    // Calculate runway for each item
    const runwayData = itemsList.map(item => {
      const usage = usageMap.get(item.id);
      const unitsPerPack = unitsPerPackMap.get(item.id) || item.packSize || 1;
      
      // Current stock in units
      const packsOnHand = item.stockLevel?.qtyOnHand || 0;
      const currentUnitsFromExact = item.trackExactQuantity ? (item.currentUnits || 0) : null;
      const currentUnits = currentUnitsFromExact !== null 
        ? currentUnitsFromExact 
        : packsOnHand * unitsPerPack;
      
      // Daily usage rate
      const daysInPeriod = Number(lookbackDays);
      const consumptionPerDay = usage ? usage.administrations / daysInPeriod : 0;
      
      // Use consumption data if available, otherwise fall back to manual dailyUsageEstimate
      const rawManualEstimate = item.dailyUsageEstimate ? parseFloat(item.dailyUsageEstimate) : 0;
      const manualEstimate = isNaN(rawManualEstimate) ? 0 : rawManualEstimate;
      const administrationsPerDay = consumptionPerDay > 0 ? consumptionPerDay : manualEstimate;
      const usedManualFallback = consumptionPerDay === 0 && manualEstimate > 0;
      
      // Runway calculation
      let runwayDays: number | null = null;
      if (administrationsPerDay > 0) {
        runwayDays = Math.floor(currentUnits / administrationsPerDay);
      } else if (currentUnits > 0) {
        // No usage data and no manual estimate - item is in stock but never used
        runwayDays = null; // Indicates "unknown" - no usage pattern
      }
      
      // Status based on runway - use hospital-configured thresholds
      let status: 'critical' | 'warning' | 'ok' | 'no_data' | 'stockout';
      if (currentUnits === 0 && packsOnHand === 0) {
        status = 'stockout';
      } else if (runwayDays === null) {
        status = 'no_data';
      } else if (runwayDays < warningDays) {
        status = 'critical';
      } else if (runwayDays < targetRunway) {
        status = 'warning';
      } else {
        status = 'ok';
      }
      
      return {
        itemId: item.id,
        itemName: item.name,
        currentUnits,
        packsOnHand,
        unitsPerPack,
        trackExactQuantity: item.trackExactQuantity,
        dailyUsage: Math.round(administrationsPerDay * 100) / 100,
        runwayDays,
        status,
        usageDataAvailable: !!usage,
        usedManualFallback,
        dailyUsageEstimate: manualEstimate > 0 ? manualEstimate : null,
        totalAdministrations: usage?.administrations || 0,
        minThreshold: item.minThreshold, // For fallback display
        folderId: item.folderId,
      };
    });
    
    // Sort by urgency: stockout > critical > warning > no_data > ok
    const statusOrder = { stockout: 0, critical: 1, warning: 2, no_data: 3, ok: 4 };
    runwayData.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    
    res.json({
      items: runwayData,
      summary: {
        total: runwayData.length,
        stockout: runwayData.filter(i => i.status === 'stockout').length,
        critical: runwayData.filter(i => i.status === 'critical').length,
        warning: runwayData.filter(i => i.status === 'warning').length,
        noData: runwayData.filter(i => i.status === 'no_data').length,
        ok: runwayData.filter(i => i.status === 'ok').length,
      },
      lookbackDays,
      targetRunway,
      warningDays,
    });
  } catch (error) {
    console.error("Error calculating runway:", error);
    res.status(500).json({ message: "Failed to calculate stock runway" });
  }
});

// Send stock alert email for low runway items
router.post('/api/items/:hospitalId/send-stock-alerts', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { email, language = 'en' } = req.body;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    // Get hospital name
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    // Get current user info
    const user = await storage.getUser(userId);
    const userName = user?.firstName || user?.email || 'User';
    const recipientEmail = email || user?.email;
    
    if (!recipientEmail) {
      return res.status(400).json({ 
        success: false,
        message: "No email address found. Please provide an email address or update your user profile.",
        needsEmail: true
      });
    }
    
    // Use hospital-configured runway settings
    const lookbackDays = hospital.runwayLookbackDays ?? 30;
    const targetRunway = hospital.runwayTargetDays ?? 14;
    const warningDays = hospital.runwayWarningDays ?? 7;
    
    // Get runway data for items needing attention - query items directly for all units
    const itemsList = await db
      .select({
        id: items.id,
        name: items.name,
        packSize: items.packSize,
        trackExactQuantity: items.trackExactQuantity,
        currentUnits: items.currentUnits,
        stockLevel: stockLevels,
      })
      .from(items)
      .leftJoin(stockLevels, eq(items.id, stockLevels.itemId))
      .where(eq(items.hospitalId, hospitalId));
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
    
    const usageQuery = await db
      .select({
        itemId: anesthesiaMedications.itemId,
        totalAdministrations: sql<number>`count(*)`,
      })
      .from(anesthesiaMedications)
      .innerJoin(anesthesiaRecords, eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecords.id))
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          gte(anesthesiaMedications.timestamp, lookbackDate)
        )
      )
      .groupBy(anesthesiaMedications.itemId);
    
    const usageMap = new Map<string, number>();
    for (const row of usageQuery) {
      usageMap.set(row.itemId, row.totalAdministrations);
    }
    
    // Get item codes for unitsPerPack
    const itemIds = itemsList.map(i => i.id);
    const codesQuery = itemIds.length > 0 ? await db
      .select({
        itemId: itemCodes.itemId,
        unitsPerPack: itemCodes.unitsPerPack,
      })
      .from(itemCodes)
      .where(inArray(itemCodes.itemId, itemIds)) : [];
    
    const unitsPerPackMap = new Map<string, number>();
    for (const code of codesQuery) {
      if (code.unitsPerPack) {
        unitsPerPackMap.set(code.itemId, code.unitsPerPack);
      }
    }
    
    // Find items needing attention (stockout, critical, warning)
    const alertItems: StockAlertItem[] = [];
    
    for (const item of itemsList) {
      const administrations = usageMap.get(item.id) || 0;
      const dailyUsage = administrations / lookbackDays;
      
      if (dailyUsage === 0) continue; // Skip items with no usage data
      
      const unitsPerPack = unitsPerPackMap.get(item.id) || item.packSize || 1;
      const packsOnHand = item.stockLevel?.qtyOnHand || 0;
      const currentUnits = item.trackExactQuantity 
        ? (item.currentUnits || 0) 
        : packsOnHand * unitsPerPack;
      
      const runwayDays = dailyUsage > 0 ? Math.floor(currentUnits / dailyUsage) : null;
      
      let status: 'stockout' | 'critical' | 'warning' | null = null;
      if (currentUnits === 0 && packsOnHand === 0) {
        status = 'stockout';
      } else if (runwayDays !== null && runwayDays < warningDays) {
        status = 'critical';
      } else if (runwayDays !== null && runwayDays < targetRunway) {
        status = 'warning';
      }
      
      if (status) {
        alertItems.push({
          itemName: item.name,
          currentUnits,
          packsOnHand,
          dailyUsage: Math.round(dailyUsage * 100) / 100,
          runwayDays,
          status,
        });
      }
    }
    
    if (alertItems.length === 0) {
      return res.json({ 
        success: true, 
        message: "No items need attention", 
        itemsCount: 0 
      });
    }
    
    // Sort by urgency
    const statusOrder = { stockout: 0, critical: 1, warning: 2 };
    alertItems.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    
    // Build dashboard URL
    const baseUrl = process.env.PRODUCTION_URL || process.env.APP_URL || 'https://use.viali.app';
    const dashboardUrl = `${baseUrl}/inventory/alerts?hospitalId=${hospitalId}`;
    
    // Send the email
    const result = await sendStockAlertEmail(
      recipientEmail,
      userName,
      hospital.name,
      alertItems,
      dashboardUrl,
      language as 'en' | 'de'
    );
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: `Alert sent to ${recipientEmail}`, 
        itemsCount: alertItems.length 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: "Failed to send alert email",
        error: result.error 
      });
    }
  } catch (error) {
    console.error("Error sending stock alerts:", error);
    res.status(500).json({ message: "Failed to send stock alerts" });
  }
});

router.get('/api/items/:hospitalId/export-catalog', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const items = await storage.getItems(hospitalId, unitId);
    
    const itemsWithCodes = await Promise.all(items.map(async (item) => {
      const codes = await storage.getItemCode(item.id);
      const suppliers = await storage.getSupplierCodes(item.id);
      return {
        ...item,
        codes: codes || null,
        suppliers: suppliers || []
      };
    }));
    
    res.json(itemsWithCodes);
  } catch (error) {
    console.error("Error exporting catalog:", error);
    res.status(500).json({ message: "Failed to export catalog" });
  }
});

export default router;
