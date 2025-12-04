import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { 
  insertItemSchema, 
  insertFolderSchema,
  items,
  stockLevels
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  getUserUnitForHospital,
  checkLicenseLimit,
  requireWriteAccess
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
        const anesthesiaUnit = units.find(u => u.isAnesthesiaModule);
        if (anesthesiaUnit) {
          effectiveUnitId = anesthesiaUnit.id;
        }
      } else if (moduleType === 'surgery') {
        const surgeryUnit = units.find(u => u.isSurgeryModule);
        if (surgeryUnit) {
          effectiveUnitId = surgeryUnit.id;
        }
      }
    }
    
    if (!moduleType && unitId) {
      const hasUnitAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      if (!hasUnitAccess) {
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
    
    const unitId = await getUserUnitForHospital(userId, folderData.hospitalId);
    if (!unitId || unitId !== folderData.unitId) {
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
    const { critical, controlled, belowMin, expiring, unitId, module: moduleType } = req.query;
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
        const anesthesiaUnit = units.find(u => u.isAnesthesiaModule);
        if (anesthesiaUnit) {
          effectiveUnitId = anesthesiaUnit.id;
        }
      } else if (moduleType === 'surgery') {
        const surgeryUnit = units.find(u => u.isSurgeryModule);
        if (surgeryUnit) {
          effectiveUnitId = surgeryUnit.id;
        }
      }
    }
    
    if (!moduleType && unitId) {
      const hasUnitAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      if (!hasUnitAccess) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const filters = {
      critical: critical === 'true',
      controlled: controlled === 'true',
      belowMin: belowMin === 'true',
      expiring: expiring === 'true',
    };
    
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value)
    );
    
    const itemsList = await storage.getItems(hospitalId, effectiveUnitId, Object.keys(activeFilters).length > 0 ? activeFilters : undefined);
    res.json(itemsList);
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ message: "Failed to fetch items" });
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

router.patch('/api/items/:itemId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user.id;
    const { activeUnitId } = req.body;
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = activeUnitId || await getUserUnitForHospital(userId, item.hospitalId);
    console.log(`[ITEM ACCESS CHECK] Item: ${item.name}, ItemUnitId: ${item.unitId}, UserActiveUnitId: ${unitId}`);
    if (!unitId || unitId !== item.unitId) {
      console.log(`[ACCESS DENIED] User active unit ${unitId} does not match item unit ${item.unitId}`);
      return res.status(403).json({ message: "Access denied to this item" });
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
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId);
    if (!unitId || unitId !== item.unitId) {
      return res.status(403).json({ message: "Access denied to this item" });
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
      const currentStock = await storage.getStockLevel(itemId, unitId);
      const currentQty = currentStock?.qtyOnHand || 0;
      
      if (currentQty <= 0) {
        return res.status(400).json({ message: "No stock available to reduce" });
      }
      
      const newQty = currentQty - 1;
      await storage.updateStockLevel(itemId, unitId, newQty);
      
      const updatedItem = await storage.getItem(itemId);
      res.json(updatedItem);
    } else {
      return res.status(400).json({ message: "Quick reduce is only available for items with exact quantity tracking or single unit items" });
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
    
    const item = await storage.getItem(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, item.hospitalId);
    if (!unitId || unitId !== item.unitId) {
      return res.status(403).json({ message: "Access denied to this item" });
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
        
        const unitId = await getUserUnitForHospital(userId, item.hospitalId);
        if (!unitId || unitId !== item.unitId) {
          results.failed.push({ id: itemId, reason: "Access denied" });
          continue;
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
    const { hospitalId, supplierName, supplierType, apiBaseUrl, customerNumber } = req.body;
    
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

export default router;
