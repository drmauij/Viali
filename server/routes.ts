import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { setupAuth, isAuthenticated, getSessionMiddleware } from "./auth/google";
import { initSocketIO, broadcastAnesthesiaUpdate, type AnesthesiaDataSection } from "./socket";
import { 
  insertItemSchema, 
  insertItemCodeSchema,
  insertSupplierCodeSchema,
  insertLotSchema,
  insertFolderSchema, 
  insertActivitySchema, 
  insertChecklistTemplateSchema, 
  insertChecklistCompletionSchema,
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
  insertAnesthesiaStaffSchema,
  insertAnesthesiaInstallationSchema,
  insertAnesthesiaTechniqueDetailSchema,
  insertAnesthesiaAirwayManagementSchema,
  insertDifficultAirwayReportSchema,
  insertAnesthesiaGeneralTechniqueSchema,
  insertAnesthesiaNeuraxialBlockSchema,
  insertAnesthesiaPeripheralBlockSchema,
  insertInventoryUsageSchema,
  insertNoteSchema,
  updateSignInDataSchema,
  updateTimeOutDataSchema,
  updateSignOutDataSchema,
  updatePostOpDataSchema,
  updateSurgeryStaffSchema,
  updateIntraOpDataSchema,
  updateCountsSterileDataSchema,
  orderLines, 
  items, 
  stockLevels, 
  orders, 
  users, 
  userHospitalRoles, 
  activities, 
  units, 
  hospitals, 
  medicationConfigs, 
  medicationGroups,
  notes,
  anesthesiaRecords,
  vitalsSnapshots,
  clinicalSnapshots,
  anesthesiaMedications,
  anesthesiaEvents,
  anesthesiaPositions,
  anesthesiaStaff,
  preOpAssessments,
  anesthesiaAirwayManagement
} from "@shared/schema";
import { z } from "zod";
import { eq, and, inArray, sql, asc, desc } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

import {
  encryptPatientData,
  decryptPatientData,
  ENCRYPTION_KEY,
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  getUserRole,
  verifyUserHospitalUnitAccess,
  getLicenseLimit,
  getBulkImportImageLimit,
  checkLicenseLimit,
  requireWriteAccess,
  requireHospitalAccess,
  canWrite
} from "./utils";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "./services/aiMonitorAnalysis";
import { registerDomainRoutes } from "./routes/index";

// Helper to extract client session ID from request for real-time sync
function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

// Authenticated encryption for notes (AES-256-GCM provides both confidentiality and integrity)
const GCM_IV_LENGTH = 12; // 96 bits recommended for GCM
const GCM_TAG_LENGTH = 16; // 128 bits auth tag

function encryptNote(text: string): string {
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:ciphertext:authTag
  return iv.toString("hex") + ":" + encrypted + ":" + authTag.toString("hex");
}

function decryptNote(text: string): string {
  // Check if data is encrypted
  if (!text.includes(":")) {
    // Data is not encrypted, return as-is (backward compatibility)
    return text;
  }
  
  const parts = text.split(":");
  
  // Check if this is the new GCM format (3 parts) or old CBC format (2 parts)
  if (parts.length === 3) {
    // New AES-GCM format: iv:ciphertext:authTag
    if (!parts[0] || !parts[1] || !parts[2]) {
      throw new Error("Invalid encrypted data format");
    }
    
    // Validate IV length (should be 24 hex chars = 12 bytes for GCM)
    if (parts[0].length !== 24) {
      throw new Error("Invalid IV length for GCM");
    }
    
    // Validate authTag length (should be 32 hex chars = 16 bytes)
    if (parts[2].length !== 32) {
      throw new Error("Invalid authentication tag length");
    }
    
    try {
      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], "hex");
      
      const decipher = crypto.createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      
      return decrypted;
    } catch (error) {
      console.error("Failed to decrypt note with GCM - authentication failed or data corrupted:", error);
      throw new Error("Failed to decrypt note: authentication verification failed");
    }
  } else if (parts.length === 2) {
    // Old AES-CBC format: iv:ciphertext (backward compatibility)
    // Decrypt using old method, then re-encrypt with GCM on next update
    console.warn("Note uses old CBC encryption - will be upgraded to GCM on next update");
    return decryptPatientData(text);
  } else {
    throw new Error("Invalid encrypted note format");
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server first (needed for Socket.IO)
  const httpServer = createServer(app);
  
  // Auth middleware
  await setupAuth(app);
  
  // Initialize Socket.IO with session middleware
  const sessionMiddleware = getSessionMiddleware();
  initSocketIO(httpServer, sessionMiddleware);

  // Register modular domain routes (auth, inventory, etc.)
  registerDomainRoutes(app);

  // NOTE: Auth routes (/api/auth/*, /api/signup) have been moved to server/routes/auth.ts
  // NOTE: Inventory routes (/api/dashboard/kpis, /api/folders/*, /api/items/*) have been moved to server/routes/inventory.ts

  // NOTE: Anesthesia routes (/api/anesthesia/*, /api/patients/*, /api/surgery-rooms/*, /api/medication-groups/*, /api/administration-groups/*) have been moved to server/routes/anesthesia.ts

  // Get bulk import image limit for a hospital
  app.get('/api/hospitals/:hospitalId/bulk-import-limit', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const hospital = await storage.getHospital(hospitalId);
      
      if (!hospital) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      const licenseType = hospital.licenseType || "free";
      const imageLimit = getBulkImportImageLimit(licenseType);

      res.json({ 
        limit: imageLimit,
        licenseType 
      });
    } catch (error: any) {
      console.error("Error getting bulk import limit:", error);
      res.status(500).json({ message: "Failed to get bulk import limit" });
    }
  });
  
  // AI image analysis for item data extraction
  app.post('/api/items/analyze-image', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Remove data URL prefix if present
      const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
      
      const { analyzeItemImage } = await import('./openai');
      const extractedData = await analyzeItemImage(base64Image);
      
      res.json(extractedData);
    } catch (error: any) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ message: error.message || "Failed to analyze image" });
    }
  });

  // Bulk AI image analysis for multiple items
  app.post('/api/items/analyze-images', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      // Set a longer timeout for this endpoint (5 minutes)
      req.setTimeout(300000); // 5 minutes in milliseconds
      res.setTimeout(300000);

      const { images, hospitalId } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Get hospital license type to determine image limit
      const hospital = await storage.getHospital(hospitalId);
      if (!hospital) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      const licenseType = hospital.licenseType || "free";
      const imageLimit = getBulkImportImageLimit(licenseType);

      if (images.length > imageLimit) {
        return res.status(400).json({ 
          message: `Maximum ${imageLimit} images allowed for ${licenseType} plan`,
          limit: imageLimit,
          licenseType 
        });
      }

      // Remove data URL prefix if present
      const base64Images = images.map((img: string) => img.replace(/^data:image\/\w+;base64,/, ''));
      
      console.log(`[Bulk Import] Starting analysis of ${base64Images.length} images for hospital ${hospitalId}`);
      
      const { analyzeBulkItemImages } = await import('./openai');
      const extractedItems = await analyzeBulkItemImages(base64Images);
      
      console.log(`[Bulk Import] Completed analysis, extracted ${extractedItems.length} items`);
      
      res.json({ items: extractedItems });
    } catch (error: any) {
      console.error("Error analyzing bulk images:", error);
      
      // Provide more detailed error messages
      if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        return res.status(504).json({ 
          message: "Analysis timed out. Please try with fewer images or try again later." 
        });
      }
      
      res.status(500).json({ message: error.message || "Failed to analyze images" });
    }
  });

  // AI medical monitor analysis for anesthesia vitals and ventilation
  app.post('/api/analyze-monitor', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      const result = await analyzeMonitorImage(image);
      res.json(result);
    } catch (error: any) {
      console.error("Error analyzing monitor image:", error);
      res.status(500).json({ message: error.message || "Failed to analyze monitor image" });
    }
  });

  // Voice transcription for drug administration commands
  app.post('/api/transcribe-voice', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { audioData } = req.body;
      if (!audioData) {
        return res.status(400).json({ message: "Audio data is required" });
      }

      const transcription = await transcribeVoice(audioData);
      res.json({ transcription });
    } catch (error: any) {
      console.error("Error transcribing voice:", error);
      res.status(500).json({ message: error.message || "Failed to transcribe voice" });
    }
  });

  // Parse drug administration command
  app.post('/api/parse-drug-command', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { transcription } = req.body;
      if (!transcription) {
        return res.status(400).json({ message: "Transcription is required" });
      }

      const drugs = await parseDrugCommand(transcription);
      res.json({ drugs });
    } catch (error: any) {
      console.error("Error parsing drug command:", error);
      res.status(500).json({ message: error.message || "Failed to parse drug command" });
    }
  });

  // Translate items between English and German
  app.post('/api/translate', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const itemsList = items.join('\n');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a medical translator. Translate the given medical terms between English and German.
            - If the terms are in English, translate to German
            - If the terms are in German, translate to English
            - Keep medical terminology accurate
            - Return ONLY the translated terms, one per line, in the same order as input
            - Do not add any explanations or numbering`
          },
          {
            role: "user",
            content: itemsList
          }
        ],
        temperature: 0.3,
      });

      const translatedText = response.choices[0]?.message?.content || '';
      const translations = translatedText.split('\n').filter(line => line.trim());
      
      // Ensure we have the same number of translations as input
      if (translations.length !== items.length) {
        console.warn('Translation count mismatch:', { input: items.length, output: translations.length });
      }

      res.json({ translations });
    } catch (error: any) {
      console.error("Error translating items:", error);
      res.status(500).json({ message: error.message || "Failed to translate items" });
    }
  });

  // Bulk item creation
  app.post('/api/items/bulk', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { items: bulkItems, hospitalId } = req.body;
      const userId = req.user.id;
      
      console.log('[BULK] Received', bulkItems?.length, 'items for bulk creation');
      if (bulkItems && bulkItems.length > 0) {
        const sample = bulkItems[0];
        console.log('[BULK] Sample item fields:', Object.keys(sample));
        console.log('[BULK] Sample item:', {
          name: sample.name,
          unit: sample.unit,
          initialStock: sample.initialStock,
          currentUnits: sample.currentUnits,
          trackExactQuantity: sample.trackExactQuantity
        });
      }
      
      if (!bulkItems || !Array.isArray(bulkItems) || bulkItems.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Verify user has access to this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      // Check license limit for bulk creation
      let licenseCheck;
      try {
        licenseCheck = await checkLicenseLimit(hospitalId);
      } catch (error: any) {
        if (error.message === "Hospital not found") {
          return res.status(404).json({ message: "Hospital not found" });
        }
        throw error;
      }
      
      const remainingSlots = Math.max(0, licenseCheck.limit - licenseCheck.currentCount);
      
      if (bulkItems.length > remainingSlots) {
        return res.status(403).json({
          error: "LICENSE_LIMIT_REACHED",
          message: `You can only add ${remainingSlots} more item(s) with your ${licenseCheck.licenseType} plan. You are trying to add ${bulkItems.length} items.`,
          currentCount: licenseCheck.currentCount,
          limit: licenseCheck.limit,
          licenseType: licenseCheck.licenseType,
          remainingSlots,
        });
      }

      // Load folders and vendors for path/name resolution
      const folders = await storage.getFolders(hospitalId, unitId);
      const vendors = await storage.getVendors(hospitalId);

      // Helper function to find or create folder by name (flat structure only)
      const resolveFolderPath = async (path: string): Promise<string | null> => {
        if (!path || path.trim() === '') return null;
        
        // Take only the last part of the path (leaf folder name)
        const folderName = path.split('/').map(p => p.trim()).filter(p => p).pop();
        if (!folderName) return null;
        
        // Find existing folder by name
        let folder = folders.find(f => f.name === folderName);
        
        // Create if doesn't exist
        if (!folder) {
          folder = await storage.createFolder({
            hospitalId,
            unitId,
            name: folderName,
          });
          folders.push(folder);
        }
        
        return folder.id;
      };

      // Helper function to find vendor by name
      const resolveVendorName = (name: string): string | null => {
        if (!name || name.trim() === '') return null;
        const vendor = vendors.find(v => v.name.toLowerCase() === name.toLowerCase());
        return vendor ? vendor.id : null;
      };

      const createdItems = [];
      for (const bulkItem of bulkItems) {
        // Resolve folderPath to folderId if provided
        let folderId = bulkItem.folderId ?? null;
        if (bulkItem.folderPath) {
          folderId = await resolveFolderPath(bulkItem.folderPath);
        }

        // Resolve vendorName to vendorId if provided
        let vendorId = bulkItem.vendorId ?? null;
        if (bulkItem.vendorName) {
          vendorId = resolveVendorName(bulkItem.vendorName);
        }

        // Check if this item has medication configuration data
        const hasMedicationConfig = !!(
          bulkItem.medicationGroup ||
          bulkItem.ampuleTotalContent ||
          bulkItem.defaultDose ||
          bulkItem.administrationRoute ||
          bulkItem.administrationUnit ||
          bulkItem.rateUnit
        );

        const itemData = {
          hospitalId,
          unitId,
          name: bulkItem.name,
          barcode: bulkItem.barcode ?? null,
          description: bulkItem.description ?? "",
          unit: bulkItem.unit ?? "pack",
          packSize: bulkItem.packSize ?? 1,
          minThreshold: bulkItem.minThreshold ?? 0,
          maxThreshold: bulkItem.maxThreshold ?? 0,
          minUnits: bulkItem.minUnits ?? 0,
          maxUnits: bulkItem.maxUnits ?? 0,
          reorderPoint: bulkItem.reorderPoint ?? 0,
          defaultOrderQty: 0,
          critical: bulkItem.critical ?? false,
          controlled: bulkItem.controlled ?? false,
          trackExactQuantity: bulkItem.trackExactQuantity ?? false,
          currentUnits: bulkItem.currentUnits ?? 0,
          folderId,
          vendorId,
        };

        const item = await storage.createItem(itemData);
        
        // Create medication config if medication fields are present
        if (hasMedicationConfig) {
          await storage.upsertMedicationConfig({
            itemId: item.id,
            medicationGroup: bulkItem.medicationGroup ?? null,
            administrationGroup: bulkItem.administrationGroup ?? null,
            ampuleTotalContent: bulkItem.ampuleTotalContent ?? null,
            defaultDose: bulkItem.defaultDose ?? null,
            administrationRoute: bulkItem.administrationRoute ?? null,
            administrationUnit: bulkItem.administrationUnit ?? null,
            rateUnit: bulkItem.rateUnit ?? null,
          });
        }
        
        // Set initial stock if provided (check both initialStock and currentUnits)
        // Use initialStock if > 0, otherwise fall back to currentUnits
        const stockToSet = (bulkItem.initialStock && bulkItem.initialStock > 0) 
          ? bulkItem.initialStock 
          : bulkItem.currentUnits;
          
        if (stockToSet !== undefined && stockToSet > 0) {
          // For trackExactQuantity items, stock is in units
          // For regular items, stock is in packs
          const stockLevel = bulkItem.trackExactQuantity 
            ? Math.ceil(stockToSet / (bulkItem.packSize || 1))
            : stockToSet;
          await storage.updateStockLevel(item.id, unitId, stockLevel);
        }
        
        createdItems.push(item);
      }
      
      res.status(201).json({ items: createdItems });
    } catch (error: any) {
      console.error("Error creating bulk items:", error);
      res.status(500).json({ message: error.message || "Failed to create items" });
    }
  });

  // Export items catalog to CSV  
  app.get('/api/items/export-csv', isAuthenticated, async (req: any, res) => {
    try {
      const hospitalId = req.query.hospitalId as string;
      const unitId = req.query.unitId as string;
      const userId = req.user.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      if (!unitId) {
        return res.status(400).json({ message: "Unit ID is required" });
      }

      // Verify user has access to this hospital and unit (same pattern as /api/items/:hospitalId)
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or unit" });
      }

      // Get all items for this hospital/unit with their relations
      const items = await storage.getItems(hospitalId, unitId);
      const folders = await storage.getFolders(hospitalId, unitId);
      const vendors = await storage.getVendors(hospitalId);

      // Build folder name lookup (flat structure)
      const folderNameMap = new Map<string, string>();
      folders.forEach(folder => {
        folderNameMap.set(folder.id, folder.name);
      });

      // Build vendor name lookup
      const vendorNameMap = new Map<string, string>();
      vendors.forEach(vendor => {
        vendorNameMap.set(vendor.id, vendor.name);
      });

      // CSV headers
      const headers = [
        'Name',
        'Barcode',
        'Description',
        'Unit',
        'MinUnits',
        'MaxUnits',
        'CurrentUnits',
        'ReorderPoint',
        'TrackExactQuantity',
        'Controlled',
        'FolderPath',
        'VendorName'
      ];

      // Build CSV rows
      const rows = items.map(item => {
        const folderName = item.folderId ? folderNameMap.get(item.folderId) || '' : '';
        const vendorName = item.vendorId ? vendorNameMap.get(item.vendorId) || '' : '';
        
        return [
          item.name || '',
          item.barcode || '',
          item.description || '',
          item.unit || 'Pack',
          item.minUnits || 0,
          item.maxUnits || 0,
          item.currentUnits || 0,
          item.reorderPoint || 0,
          item.trackExactQuantity ? 'true' : 'false',
          item.controlled ? 'true' : 'false',
          folderName,
          vendorName
        ];
      });

      // Combine headers and rows
      const csvData = [headers, ...rows];
      
      // Convert to CSV string with proper escaping
      const csvContent = csvData.map(row => 
        row.map(cell => {
          const cellStr = String(cell);
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ).join('\n');

      // Set headers for download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="items_catalog.csv"');
      
      res.send(csvContent);
    } catch (error: any) {
      console.error("Error exporting items:", error);
      res.status(500).json({ message: error.message || "Failed to export items" });
    }
  });

  // ==================== Item Codes Routes ====================
  
  // Get item codes (universal identifiers) for an item
  app.get('/api/items/:itemId/codes', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const code = await storage.getItemCode(itemId);
      res.json(code || null);
    } catch (error: any) {
      console.error("Error fetching item codes:", error);
      res.status(500).json({ message: error.message || "Failed to fetch item codes" });
    }
  });

  // Create or update item codes
  app.put('/api/items/:itemId/codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const validatedData = insertItemCodeSchema.omit({ itemId: true }).parse(req.body);
      const code = await storage.updateItemCode(itemId, validatedData);
      res.json(code);
    } catch (error: any) {
      console.error("Error updating item codes:", error);
      res.status(500).json({ message: error.message || "Failed to update item codes" });
    }
  });

  // Delete item codes
  app.delete('/api/items/:itemId/codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      await storage.deleteItemCode(itemId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting item codes:", error);
      res.status(500).json({ message: error.message || "Failed to delete item codes" });
    }
  });

  // ==================== Supplier Codes Routes ====================
  
  // Get supplier codes for an item
  app.get('/api/items/:itemId/suppliers', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const codes = await storage.getSupplierCodes(itemId);
      res.json(codes);
    } catch (error: any) {
      console.error("Error fetching supplier codes:", error);
      res.status(500).json({ message: error.message || "Failed to fetch supplier codes" });
    }
  });

  // Add a supplier code
  app.post('/api/items/:itemId/suppliers', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const validatedData = insertSupplierCodeSchema.parse({ ...req.body, itemId });
      const code = await storage.createSupplierCode(validatedData);
      res.status(201).json(code);
    } catch (error: any) {
      console.error("Error creating supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to create supplier code" });
    }
  });

  // Update a supplier code
  app.put('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { supplierId } = req.params;
      const validatedData = insertSupplierCodeSchema.partial().parse(req.body);
      const code = await storage.updateSupplierCode(supplierId, validatedData);
      res.json(code);
    } catch (error: any) {
      console.error("Error updating supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to update supplier code" });
    }
  });

  // Delete a supplier code
  app.delete('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { supplierId } = req.params;
      await storage.deleteSupplierCode(supplierId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to delete supplier code" });
    }
  });

  // Set preferred supplier
  app.post('/api/items/:itemId/suppliers/:supplierId/set-preferred', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId, supplierId } = req.params;
      await storage.setPreferredSupplier(itemId, supplierId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting preferred supplier:", error);
      res.status(500).json({ message: error.message || "Failed to set preferred supplier" });
    }
  });

  // ==================== Lot Routes ====================
  
  // Get lots for an item
  app.get('/api/items/:itemId/lots', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const itemLots = await storage.getLots(itemId);
      res.json(itemLots);
    } catch (error: any) {
      console.error("Error fetching lots:", error);
      res.status(500).json({ message: error.message || "Failed to fetch lots" });
    }
  });

  // Add a lot
  app.post('/api/items/:itemId/lots', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const { lotNumber, expiryDate, unitId, qty } = req.body;
      
      if (!lotNumber || !unitId) {
        return res.status(400).json({ message: "Lot number and unit ID are required" });
      }
      
      const lot = await storage.createLot({
        itemId,
        lotNumber,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        unitId,
        qty: qty || 0,
      });
      res.status(201).json(lot);
    } catch (error: any) {
      console.error("Error creating lot:", error);
      res.status(500).json({ message: error.message || "Failed to create lot" });
    }
  });

  // Update a lot
  app.put('/api/items/:itemId/lots/:lotId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lotId } = req.params;
      const { lotNumber, expiryDate, qty } = req.body;
      
      const updates: any = {};
      if (lotNumber !== undefined) updates.lotNumber = lotNumber;
      if (expiryDate !== undefined) updates.expiryDate = expiryDate ? new Date(expiryDate) : null;
      if (qty !== undefined) updates.qty = qty;
      
      const lot = await storage.updateLot(lotId, updates);
      res.json(lot);
    } catch (error: any) {
      console.error("Error updating lot:", error);
      res.status(500).json({ message: error.message || "Failed to update lot" });
    }
  });

  // Delete a lot
  app.delete('/api/items/:itemId/lots/:lotId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lotId } = req.params;
      await storage.deleteLot(lotId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting lot:", error);
      res.status(500).json({ message: error.message || "Failed to delete lot" });
    }
  });

  // Async Bulk Import - Create Job
  app.post('/api/import-jobs', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { images, hospitalId } = req.body;
      const userId = req.user.id;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Verify user has access to this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      // Get hospital license type to determine image limit
      const hospital = await storage.getHospital(hospitalId);
      if (!hospital) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      const licenseType = hospital.licenseType || "free";
      const imageLimit = licenseType === "basic" ? 50 : 10;

      if (images.length > imageLimit) {
        return res.status(400).json({ 
          message: `Maximum ${imageLimit} images allowed for ${licenseType} plan`,
          limit: imageLimit,
          licenseType 
        });
      }

      // Remove data URL prefix if present
      const base64Images = images.map((img: string) => img.replace(/^data:image\/\w+;base64,/, ''));

      // Create job record
      const job = await storage.createImportJob({
        hospitalId,
        unitId,
        userId,
        status: 'queued',
        totalImages: base64Images.length,
        processedImages: 0,
        extractedItems: 0,
        imagesData: base64Images, // Store images temporarily
        results: null,
        error: null,
        notificationSent: false,
      });

      console.log(`[Import Job] Created job ${job.id} with ${base64Images.length} images for user ${userId}`);

      // Trigger background processing (fire and forget)
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      fetch(`${baseUrl}/api/import-jobs/process-next`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => console.error('[Import Job] Failed to trigger background worker:', err));

      res.status(201).json({ 
        jobId: job.id,
        status: job.status,
        totalImages: job.totalImages
      });
    } catch (error: any) {
      console.error("Error creating import job:", error);
      res.status(500).json({ message: error.message || "Failed to create import job" });
    }
  });

  // Get Import Job Status
  app.get('/api/import-jobs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const job = await storage.getImportJob(id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Verify user owns this job or has access to the hospital
      if (job.userId !== userId) {
        const unitId = await getUserUnitForHospital(userId, job.hospitalId);
        if (!unitId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json({
        id: job.id,
        status: job.status,
        totalImages: job.totalImages,
        processedImages: job.processedImages,
        currentImage: job.currentImage,
        progressPercent: job.progressPercent,
        extractedItems: job.extractedItems,
        results: job.results,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      });
    } catch (error: any) {
      console.error("Error getting import job:", error);
      res.status(500).json({ message: error.message || "Failed to get job status" });
    }
  });

  // Process Next Queued Job (Background Worker Endpoint)
  app.post('/api/import-jobs/process-next', async (req, res) => {
    try {
      // Get next queued job
      const job = await storage.getNextQueuedJob();
      
      if (!job) {
        return res.json({ message: "No jobs in queue" });
      }

      console.log(`[Import Job Worker] Processing job ${job.id} with ${job.totalImages} images`);

      // Update job status to processing
      await storage.updateImportJob(job.id, {
        status: 'processing',
        startedAt: new Date(),
        currentImage: 0,
        progressPercent: 0,
      });

      // Process images with progress tracking
      const { analyzeBulkItemImages } = await import('./openai');
      const extractedItems = await analyzeBulkItemImages(
        job.imagesData as string[], 
        async (currentImage, totalImages, progressPercent) => {
          // Update progress in database
          await storage.updateImportJob(job.id, {
            currentImage,
            processedImages: currentImage,
            progressPercent,
          });
          console.log(`[Import Job Worker] Progress: ${currentImage}/${totalImages} (${progressPercent}%)`);
        }
      );

      // Update job with results
      await storage.updateImportJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        processedImages: job.totalImages,
        currentImage: job.totalImages,
        progressPercent: 100,
        extractedItems: extractedItems.length,
        results: extractedItems,
        imagesData: null, // Clear images to free up space
      });

      console.log(`[Import Job Worker] Completed job ${job.id}, extracted ${extractedItems.length} items`);

      // Send email notification
      const user = await storage.getUser(job.userId);
      if (user?.email) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const previewUrl = `${baseUrl}/bulk-import/preview/${job.id}`;
        
        const { sendBulkImportCompleteEmail } = await import('./resend');
        await sendBulkImportCompleteEmail(
          user.email,
          user.firstName || 'User',
          extractedItems.length,
          previewUrl
        );

        await storage.updateImportJob(job.id, { notificationSent: true });
        console.log(`[Import Job Worker] Sent notification email to ${user.email}`);
      }

      res.json({ 
        message: "Job processed successfully",
        jobId: job.id,
        itemsExtracted: extractedItems.length
      });
    } catch (error: any) {
      console.error("Error processing job:", error);
      
      // Try to update job status to failed if we have a job
      const job = await storage.getNextQueuedJob();
      if (job) {
        await storage.updateImportJob(job.id, {
          status: 'failed',
          completedAt: new Date(),
          error: error.message || 'Processing failed',
        });
      }
      
      res.status(500).json({ message: error.message || "Failed to process job" });
    }
  });

  // Barcode scanning
  app.post('/api/scan/barcode', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { barcode, hospitalId } = req.body;
      if (!barcode || !hospitalId) {
        return res.status(400).json({ message: "Barcode and hospitalId are required" });
      }
      
      const userId = req.user.id;
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const item = await storage.findItemByBarcode(barcode, hospitalId, unitId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error scanning barcode:", error);
      res.status(500).json({ message: "Failed to scan barcode" });
    }
  });

  // External barcode lookup
  app.post('/api/scan/lookup', isAuthenticated, requireWriteAccess, async (req, res) => {
    try {
      const { barcode } = req.body;
      if (!barcode) {
        return res.status(400).json({ message: "Barcode is required" });
      }

      const apiKey = process.env.EAN_SEARCH_API_KEY;
      if (!apiKey) {
        console.error("EAN_SEARCH_API_KEY not configured");
        return res.status(503).json({ message: "External lookup service not configured" });
      }

      const url = `https://api.ean-search.org/api?token=${apiKey}&op=barcode-lookup&format=json&ean=${barcode}`;
      console.log(`[External Lookup] Calling EAN-Search API for barcode: ${barcode}`);
      
      const response = await fetch(url);
      console.log(`[External Lookup] API response status: ${response.status}`);
      
      if (!response.ok) {
        console.error(`[External Lookup] API returned ${response.status}: ${response.statusText}`);
        return res.status(404).json({ message: "Product not found in external database" });
      }

      const data = await response.json();
      console.log(`[External Lookup] API response data:`, JSON.stringify(data));
      
      // Check for API errors
      if (data.error) {
        console.error(`[External Lookup] API error: ${data.error}`);
        return res.status(404).json({ message: data.error || "Product not found in external database" });
      }

      // EAN-Search returns { result: [...] }
      if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
        console.error(`[External Lookup] No results found in API response`);
        return res.status(404).json({ message: "Product not found in external database" });
      }

      const product = data.result[0];
      console.log(`[External Lookup] Found product:`, product.name);
      
      res.json({
        name: product.name || '',
        manufacturer: product.issuing_country || product.brand || '',
        category: product.category || '',
        barcode: barcode,
        found: true,
      });
    } catch (error) {
      console.error("[External Lookup] Error:", error);
      res.status(500).json({ message: "Failed to lookup barcode" });
    }
  });

  // Stock operations
  app.post('/api/stock/update', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { itemId, qty, delta, notes, activeUnitId } = req.body;
      const userId = req.user.id;
      
      if (!itemId || qty === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get the item to find its hospital and unit
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Get user's unitId for this hospital (use activeUnitId from request if provided)
      const unitId = activeUnitId || await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify item belongs to user's unit
      if (item.unitId !== unitId) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
      
      // Update stock level
      const stockLevel = await storage.updateStockLevel(itemId, unitId, qty);
      
      // Create activity log
      await storage.createActivity({
        userId,
        action: 'count',
        itemId,
        unitId,
        delta: delta || 0,
        notes,
      });
      
      res.json(stockLevel);
    } catch (error) {
      console.error("Error updating stock:", error);
      res.status(500).json({ message: "Failed to update stock" });
    }
  });

  // Orders routes
  app.get('/api/orders/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { status } = req.query;
      const userId = req.user.id;
      
      // Verify user has access to this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const orders = await storage.getOrders(hospitalId, status as string);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.get('/api/orders/open-items/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      // Verify user has access to this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get items in draft or sent orders
      const results = await db
        .select({
          itemId: orderLines.itemId,
          totalQty: sql<number>`CAST(SUM(${orderLines.qty}) AS INTEGER)`,
        })
        .from(orders)
        .innerJoin(orderLines, eq(orders.id, orderLines.orderId))
        .where(
          and(
            eq(orders.hospitalId, hospitalId),
            inArray(orders.status, ['draft', 'sent'])
          )
        )
        .groupBy(orderLines.itemId);
      
      // Convert to map for easier frontend lookup
      const itemsMap: Record<string, { totalQty: number }> = {};
      for (const result of results) {
        itemsMap[result.itemId] = { totalQty: result.totalQty };
      }
      
      res.json(itemsMap);
    } catch (error) {
      console.error("Error fetching open order items:", error);
      res.status(500).json({ message: "Failed to fetch open order items" });
    }
  });

  app.post('/api/orders', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { hospitalId, vendorId, orderLines: lines } = req.body;
      const userId = req.user.id;
      
      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }
      
      // Verify user has access to this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const order = await storage.createOrder({
        hospitalId,
        unitId,
        vendorId: vendorId || null,
        status: 'draft',
        createdBy: userId,
        totalAmount: '0',
      });

      if (lines && Array.isArray(lines)) {
        for (const line of lines) {
          await storage.addItemToOrder(order.id, line.itemId, line.qty, line.packSize || 1);
        }
      }

      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  app.post('/api/orders/quick-add', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { hospitalId, unitId, itemId, vendorId, qty, packSize } = req.body;
      const userId = req.user.id;
      
      if (!hospitalId || !itemId || !unitId) {
        return res.status(400).json({ message: "Hospital ID, Unit ID, and Item ID are required" });
      }
      
      // Verify user has access to this hospital and unit
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or unit" });
      }

      const order = await storage.findOrCreateDraftOrder(hospitalId, unitId, vendorId || null, userId);
      const orderLine = await storage.addItemToOrder(order.id, itemId, qty || 1, packSize || 1);

      res.json({ order, orderLine });
    } catch (error) {
      console.error("Error adding item to order:", error);
      res.status(500).json({ message: "Failed to add item to order" });
    }
  });

  app.post('/api/orders/:orderId/status', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Status Update] Active Unit ID from header:', activeUnitId);
      console.log('[Order Status Update] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Status Update] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Status Update] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      const updatedOrder = await storage.updateOrderStatus(orderId, status);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  app.patch('/api/orders/:orderId/notes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { notes } = req.body;
      const userId = req.user.id;
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Notes Update] Active Unit ID from header:', activeUnitId);
      console.log('[Order Notes Update] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Notes Update] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Notes Update] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      // Update order notes
      await db.update(orders).set({ notes }).where(eq(orders.id, orderId));
      
      // Return updated order
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order notes:", error);
      res.status(500).json({ message: "Failed to update order notes" });
    }
  });

  app.patch('/api/order-lines/:lineId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { qty, notes } = req.body;
      const userId = req.user.id;
      
      // Get order line to find associated order
      const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
      if (!line) {
        return res.status(404).json({ message: "Order line not found" });
      }
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Line Update] Active Unit ID from header:', activeUnitId);
      console.log('[Order Line Update] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Line Update] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Line Update] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      // Update the order line with qty and/or notes
      const updates: any = {};
      if (qty !== undefined) {
        if (qty < 1) {
          return res.status(400).json({ message: "Valid quantity is required" });
        }
        updates.qty = qty;
      }
      if (notes !== undefined) {
        updates.notes = notes;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updates provided" });
      }
      
      await db.update(orderLines).set(updates).where(eq(orderLines.id, lineId));
      
      // Return updated line
      const [updatedLine] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
      res.json(updatedLine);
    } catch (error) {
      console.error("Error updating order line:", error);
      res.status(500).json({ message: "Failed to update order line" });
    }
  });

  app.post('/api/order-lines/:lineId/move-to-secondary', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const userId = req.user.id;
      
      // Get order line to find associated order
      const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
      if (!line) {
        return res.status(404).json({ message: "Order line not found" });
      }
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify order is in draft status
      if (order.status !== 'draft') {
        return res.status(400).json({ message: "Can only move items from draft orders" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Move to Secondary] Active Unit ID from header:', activeUnitId);
      console.log('[Move to Secondary] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Move to Secondary] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Move to Secondary] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      // Find all draft orders for this unit, sorted by createdAt (oldest first)
      const draftOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.hospitalId, order.hospitalId),
            eq(orders.unitId, order.unitId),
            eq(orders.status, 'draft')
          )
        )
        .orderBy(asc(orders.createdAt));
      
      if (draftOrders.length === 0) {
        return res.status(400).json({ message: "No draft orders found" });
      }
      
      // Main order is the oldest draft
      const mainOrder = draftOrders[0];
      
      // Verify the line item is in the main order
      if (line.orderId !== mainOrder.id) {
        return res.status(400).json({ message: "This item is not in the main draft order" });
      }
      
      // Find or create secondary order
      // Secondary is the second-oldest draft (index 1), not the newest
      let secondaryOrder;
      if (draftOrders.length > 1) {
        // Use the second-oldest draft as secondary
        secondaryOrder = draftOrders[1];
      } else {
        // Create new secondary order (will become the second-oldest)
        const [newOrder] = await db
          .insert(orders)
          .values({
            hospitalId: order.hospitalId,
            unitId: order.unitId,
            vendorId: order.vendorId,
            status: 'draft',
            createdBy: userId,
          })
          .returning();
        secondaryOrder = newOrder;
      }
      
      // Move the line item to secondary order
      await db
        .update(orderLines)
        .set({ orderId: secondaryOrder.id })
        .where(eq(orderLines.id, lineId));
      
      // Check if main order is now empty
      const remainingLines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, mainOrder.id));
      
      // If main order is empty, delete it
      if (remainingLines.length === 0) {
        await db.delete(orders).where(eq(orders.id, mainOrder.id));
      }
      
      res.json({ 
        success: true, 
        message: "Item moved to secondary order",
        mainOrderDeleted: remainingLines.length === 0
      });
    } catch (error) {
      console.error("Error moving order line to secondary:", error);
      res.status(500).json({ message: "Failed to move order line" });
    }
  });

  app.patch('/api/order-lines/:lineId/offline-worked', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { offlineWorked } = req.body;
      const userId = req.user.id;
      
      // Get order line to find associated order
      const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
      if (!line) {
        return res.status(404).json({ message: "Order line not found" });
      }
      
      // Get order to verify access and status
      const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Only allow toggling in draft or sent orders
      if (order.status !== 'draft' && order.status !== 'sent') {
        return res.status(400).json({ message: "Can only toggle offline worked for draft or sent orders" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      // Update offline worked status
      await db
        .update(orderLines)
        .set({ offlineWorked })
        .where(eq(orderLines.id, lineId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating offline worked status:", error);
      res.status(500).json({ message: "Failed to update offline worked status" });
    }
  });

  app.post('/api/order-lines/:lineId/receive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { notes, signature } = req.body;
      const userId = req.user.id;
      
      // Get order line with item details
      const [lineWithItem] = await db
        .select({
          line: orderLines,
          item: items,
          order: orders,
        })
        .from(orderLines)
        .innerJoin(items, eq(orderLines.itemId, items.id))
        .innerJoin(orders, eq(orderLines.orderId, orders.id))
        .where(eq(orderLines.id, lineId));
      
      if (!lineWithItem) {
        return res.status(404).json({ message: "Order line not found" });
      }
      
      const { line, item, order } = lineWithItem;
      
      // Check if already received
      if (line.received) {
        return res.status(400).json({ message: "Item already received" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Line Receive] Active Unit ID from header:', activeUnitId);
      console.log('[Order Line Receive] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Line Receive] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Line Receive] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only receive items for orders from your unit" });
      }
      
      // For controlled items, require signature and notes
      if (item.controlled) {
        if (!signature) {
          return res.status(400).json({ message: "Signature required for controlled substances" });
        }
        if (!notes || notes.trim() === '') {
          return res.status(400).json({ message: "Notes are required for controlled substances" });
        }
      }
      
      // Get current stock level
      const [currentStock] = await db
        .select()
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.itemId, item.id),
            eq(stockLevels.unitId, item.unitId)
          )
        );
      
      const currentQty = currentStock?.qtyOnHand || 0;
      const newQty = currentQty + line.qty;
      
      // Update stock level
      await storage.updateStockLevel(item.id, item.unitId, newQty);
      
      // For items with exact quantity tracking, also update current units
      let addedUnits = 0;
      if (item.trackExactQuantity) {
        const [currentItem] = await db
          .select({ currentUnits: items.currentUnits })
          .from(items)
          .where(eq(items.id, item.id));
        
        const currentCurrentUnits = currentItem?.currentUnits || 0;
        addedUnits = line.qty * (line.packSize || 1);
        await db
          .update(items)
          .set({ 
            currentUnits: currentCurrentUnits + addedUnits 
          })
          .where(eq(items.id, item.id));
      }
      
      // Mark order line as received
      await db
        .update(orderLines)
        .set({
          received: true,
          receivedAt: new Date(),
          receivedBy: userId,
          receiveNotes: notes || null,
          receiveSignature: signature || null,
        })
        .where(eq(orderLines.id, lineId));
      
      // Log activity for controlled items
      if (item.controlled) {
        await db.insert(activities).values({
          timestamp: new Date(),
          userId,
          action: 'receive',
          itemId: item.id,
          unitId: item.unitId,
          delta: addedUnits || line.qty,
          movementType: 'IN',
          notes: notes || 'Order received',
          signatures: signature ? [signature] : null,
          controlledVerified: true,
        });
      }
      
      // Check if all lines in the order are now received
      const allLines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id));
      
      const allReceived = allLines.every(l => l.id === lineId || l.received);
      
      // If all lines received, update order status
      if (allReceived && order.status !== 'received') {
        await storage.updateOrderStatus(order.id, 'received');
      }
      
      res.json({ success: true, allReceived });
    } catch (error) {
      console.error("Error receiving order line:", error);
      res.status(500).json({ message: "Failed to receive order line" });
    }
  });

  app.delete('/api/order-lines/:lineId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const userId = req.user.id;
      
      // Get order line to find associated order
      const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
      if (!line) {
        return res.status(404).json({ message: "Order line not found" });
      }
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Line Delete] Active Unit ID from header:', activeUnitId);
      console.log('[Order Line Delete] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Line Delete] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Line Delete] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
      }
      
      await storage.removeOrderLine(lineId);
      
      // Check if all remaining lines in the order are received
      const remainingLines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id));
      
      // If all remaining lines are received, update order status to 'received'
      if (remainingLines.length > 0 && remainingLines.every(l => l.received) && order.status !== 'received') {
        await storage.updateOrderStatus(order.id, 'received');
      }
      
      // If no lines remain, update order status to 'draft'
      if (remainingLines.length === 0 && order.status !== 'draft') {
        await storage.updateOrderStatus(order.id, 'draft');
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing order line:", error);
      res.status(500).json({ message: "Failed to remove order line" });
    }
  });

  app.delete('/api/orders/:orderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital and unit
      const activeUnitId = getActiveUnitIdFromRequest(req);
      console.log('[Order Delete] Active Unit ID from header:', activeUnitId);
      console.log('[Order Delete] Order Unit ID:', order.unitId);
      const unitId = await getUserUnitForHospital(userId, order.hospitalId, activeUnitId);
      console.log('[Order Delete] Resolved Unit ID:', unitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user belongs to the same unit as the order
      if (unitId !== order.unitId) {
        console.log('[Order Delete] Unit mismatch! Resolved:', unitId, 'vs Order:', order.unitId);
        return res.status(403).json({ message: "Access denied: you can only delete orders from your unit" });
      }
      
      await storage.deleteOrder(orderId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  app.get('/api/vendors/:hospitalId', isAuthenticated, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const vendors = await storage.getVendors(hospitalId);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  // Controlled substances
  app.post('/api/controlled/extract-patient-info', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { image } = req.body;
      
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Use local Tesseract.js OCR to keep patient data private (never send to external AI)
      const { createWorker } = await import('tesseract.js');
      
      const worker = await createWorker('eng');
      
      try {
        const { data: { text } } = await worker.recognize(image);
        await worker.terminate();
        
        // Extract patient ID from OCR text
        // Common patterns: MRN, Patient ID, ID:, #
        const extractedText = text.trim();
        
        if (!extractedText) {
          return res.json({ patientId: null });
        }
        
        // Try to find patient ID patterns in the text
        // Look for numbers after common keywords or standalone numbers
        const patterns = [
          /(?:MRN|Patient\s*ID|ID|#)[\s:]*([A-Z0-9-]+)/i,
          /\b([0-9]{6,})\b/, // 6+ digit number
        ];
        
        for (const pattern of patterns) {
          const match = extractedText.match(pattern);
          if (match && match[1]) {
            return res.json({ patientId: match[1].trim() });
          }
        }
        
        // If no pattern matched, return the first significant text line
        const firstLine = extractedText.split('\n').find(line => line.trim().length > 2);
        res.json({ patientId: firstLine?.trim() || null });
      } catch (ocrError) {
        console.error("OCR processing error:", ocrError);
        await worker.terminate();
        throw ocrError;
      }
    } catch (error) {
      console.error("Error extracting patient info:", error);
      res.status(500).json({ message: "Failed to extract patient information" });
    }
  });

  app.post('/api/controlled/dispense', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { items: dispenseItems, patientId, patientPhoto, notes, signatures } = req.body;
      
      if (!dispenseItems || !Array.isArray(dispenseItems) || dispenseItems.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }
      
      if (!patientId && !patientPhoto) {
        return res.status(400).json({ message: "Patient identification (ID or photo) is required for controlled substances" });
      }
      
      // Encrypt patient data before storing
      const encryptedPatientId = patientId ? encryptPatientData(patientId) : null;
      const encryptedPatientPhoto = patientPhoto ? encryptPatientData(patientPhoto) : null;
      
      // Create activity for each dispensed item and update stock
      const activities = await Promise.all(
        dispenseItems.map(async (item: any) => {
          // Get the item to find its hospital and location
          const itemData = await storage.getItem(item.itemId);
          if (!itemData) {
            throw new Error(`Item ${item.itemId} not found`);
          }
          
          // Get user's unitId for this hospital
          const unitId = await getUserUnitForHospital(userId, itemData.hospitalId);
          if (!unitId) {
            throw new Error("Access denied to this hospital");
          }
          
          // Verify item belongs to user's unit
          if (itemData.unitId !== unitId) {
            throw new Error(`Access denied to item ${item.itemId}'s unit`);
          }
          
          // Check if this item has exact quantity tracking enabled
          let beforeQty: number;
          let afterQty: number;
          
          if (itemData.trackExactQuantity) {
            // For items with exact quantity tracking: update current units and recalculate stock
            const currentCurrentUnits = itemData.currentUnits || 0;
            const newCurrentUnits = Math.max(0, currentCurrentUnits - item.qty);
            const packSize = itemData.packSize || 1;
            const newQty = Math.ceil(newCurrentUnits / packSize);
            
            beforeQty = currentCurrentUnits;
            afterQty = newCurrentUnits;
            
            // Update both current units and stock
            await db
              .update(items)
              .set({ currentUnits: newCurrentUnits })
              .where(eq(items.id, item.itemId));
            
            await storage.updateStockLevel(item.itemId, unitId, newQty);
          } else {
            // For normal items: subtract from stock directly
            const currentStock = await storage.getStockLevel(item.itemId, unitId);
            const currentQty = currentStock?.qtyOnHand || 0;
            const newQty = Math.max(0, currentQty - item.qty);
            
            beforeQty = currentQty;
            afterQty = newQty;
            
            await storage.updateStockLevel(item.itemId, unitId, newQty);
          }
          
          return await storage.createActivity({
            userId,
            action: 'use', // Changed from 'dispense' to 'use' for consistency with PDF filtering
            itemId: item.itemId,
            unitId,
            delta: -item.qty, // Negative for dispensing
            movementType: 'OUT', // Dispensing is always OUT
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
      console.error("Error recording controlled substance:", error);
      
      // Return 403 for access control errors
      if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
        return res.status(403).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to record controlled substance" });
    }
  });

  // Manual adjustment of controlled substance inventory
  app.post('/api/controlled/adjust', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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
      
      // Get the item
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify it's a controlled substance
      if (!item.controlled) {
        return res.status(400).json({ message: "This endpoint is only for controlled substances" });
      }
      
      // Verify item has exact quantity tracking enabled
      if (!item.trackExactQuantity) {
        return res.status(400).json({ message: "Item must have exact quantity tracking enabled" });
      }
      
      // Get user's unitId for this hospital
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify item belongs to user's unit
      if (item.unitId !== unitId) {
        return res.status(403).json({ message: "Access denied to this item's location" });
      }
      
      // Calculate the delta
      const currentUnits = item.currentUnits || 0;
      const delta = newCurrentUnits - currentUnits;
      
      // Determine movement type based on delta
      const movementType = delta >= 0 ? 'IN' : 'OUT';
      
      // Store before/after quantities for the report
      const beforeQty = currentUnits;
      const afterQty = newCurrentUnits;
      
      // Update current units
      await db
        .update(items)
        .set({ currentUnits: newCurrentUnits })
        .where(eq(items.id, itemId));
      
      // Calculate and update stock level
      const packSize = item.packSize || 1;
      const newStock = Math.ceil(newCurrentUnits / packSize);
      await storage.updateStockLevel(itemId, unitId, newStock);
      
      // Create activity log entry
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
        controlledVerified: false, // Manual adjustments require second signature verification
        metadata: { beforeQty, afterQty },
      });
      
      res.status(201).json(activity);
    } catch (error: any) {
      console.error("Error adjusting controlled substance:", error);
      
      if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
        return res.status(403).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to adjust controlled substance inventory" });
    }
  });

  app.get('/api/controlled/log/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Only show actual administrations and manual adjustments in controlled log
      // Exclude 'count' actions which are triggered by item edits and shouldn't appear in controlled register
      const activities = await storage.getActivities({
        hospitalId,
        unitId,
        controlled: true,
        actions: ['use', 'adjust'],
        limit: 50,
      });
      
      // UUID regex pattern to identify potential patient record IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      // Decrypt patient data for each activity and fetch patient records
      const decryptedActivities = await Promise.all(activities.map(async (activity: any) => {
        const decrypted = { ...activity };
        
        if (activity.patientId) {
          try {
            const decryptedPatientId = decryptPatientData(activity.patientId);
            decrypted.patientId = decryptedPatientId;
            
            // If the decrypted patientId looks like a UUID, try to fetch patient data
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
                // Patient lookup failed, continue with just the ID
              }
            }
          } catch (error) {
            console.error("Error decrypting patient ID:", error);
          }
        }
        
        if (activity.patientPhoto) {
          try {
            decrypted.patientPhoto = decryptPatientData(activity.patientPhoto);
          } catch (error) {
            console.error("Error decrypting patient photo:", error);
          }
        }
        
        return decrypted;
      }));
      
      res.json(decryptedActivities);
    } catch (error) {
      console.error("Error fetching controlled log:", error);
      res.status(500).json({ message: "Failed to fetch controlled log" });
    }
  });

  app.post('/api/controlled/checks', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId, unitId, signature, checkItems, notes } = req.body;
      
      if (!hospitalId || !unitId || !signature || !checkItems) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const userUnitId = await getUserUnitForHospital(userId, hospitalId);
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
      console.error("Error creating controlled check:", error);
      res.status(500).json({ message: "Failed to create controlled check" });
    }
  });
  
  app.get('/api/controlled/checks/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const checks = await storage.getControlledChecks(hospitalId, unitId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching controlled checks:", error);
      res.status(500).json({ message: "Failed to fetch controlled checks" });
    }
  });

  app.post('/api/controlled/verify/:activityId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { activityId } = req.params;
      const { signature } = req.body;
      const userId = req.user.id;
      
      if (!signature) {
        return res.status(400).json({ message: "Signature is required" });
      }
      
      // Get the activity to verify access
      const activityData = await storage.getActivityById(activityId);
      if (!activityData) {
        return res.status(404).json({ message: "Activity not found" });
      }
      
      // Get the item to find hospital and location
      const item = await storage.getItem(activityData.itemId!);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this hospital/unit
      const userUnitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!userUnitId || userUnitId !== item.unitId) {
        return res.status(403).json({ message: "Access denied to this activity" });
      }
      
      const activity = await storage.verifyControlledActivity(activityId, signature, userId);
      res.json(activity);
    } catch (error: any) {
      console.error("Error verifying controlled activity:", error);
      
      if (error.message?.includes("Access denied") || error.message?.includes("not found")) {
        return res.status(403).json({ message: error.message });
      }
      
      res.status(500).json({ message: "Failed to verify controlled activity" });
    }
  });

  // Alerts routes
  app.get('/api/alerts/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { unitId, acknowledged } = req.query;
      const userId = req.user.id;
      
      // Verify user has access to this hospital and unit
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or unit" });
      }
      
      const acknowledgedBool = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;
      const alerts = await storage.getAlerts(hospitalId, unitId, acknowledgedBool);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post('/api/alerts/:alertId/acknowledge', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;
      
      const alert = await storage.acknowledgeAlert(alertId, userId);
      res.json(alert);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  app.post('/api/alerts/:alertId/snooze', isAuthenticated, requireWriteAccess, async (req, res) => {
    try {
      const { alertId } = req.params;
      const { until } = req.body;
      
      if (!until) {
        return res.status(400).json({ message: "Snooze until date is required" });
      }
      
      const alert = await storage.snoozeAlert(alertId, new Date(until));
      res.json(alert);
    } catch (error) {
      console.error("Error snoozing alert:", error);
      res.status(500).json({ message: "Failed to snooze alert" });
    }
  });

  // Recent activities
  app.get('/api/activities/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      const unitId = await getUserUnitForHospital(userId, hospitalId);
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
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // NOTE: Admin routes (/api/admin/*, /api/surgeons, /api/hospitals/*/users-by-module) have been moved to server/routes/admin.ts
  // NOTE: Checklist routes (/api/checklists/*) have been moved to server/routes/checklists.ts

  // Seed hospital with default data (admin only)
  app.post('/api/hospitals/:id/seed', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { id: hospitalId } = req.params;
      const userId = req.user.id;

      // Check if user has admin access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hospital) {
        return res.status(403).json({ message: "Admin access required to seed hospital data" });
      }

      // Import seedHospitalData function
      const { seedHospitalData } = await import('./seed-hospital');
      
      // Seed the hospital (only adds missing data, never replaces)
      const result = await seedHospitalData(hospitalId);
      
      res.json({
        message: "Hospital seeded successfully",
        result: {
          locationsCreated: result.locationsCreated,
          surgeryRoomsCreated: result.surgeryRoomsCreated,
          adminGroupsCreated: result.adminGroupsCreated,
          medicationsCreated: result.medicationsCreated,
        }
      });
    } catch (error) {
      console.error("Error seeding hospital:", error);
      res.status(500).json({ message: "Failed to seed hospital data" });
    }
  });

  // Reset allergies, medications, and checklists to defaults (admin only)
  app.post('/api/hospitals/:id/reset-lists', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { id: hospitalId } = req.params;
      const userId = req.user.id;

      // Check if user has admin access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hospital) {
        return res.status(403).json({ message: "Admin access required to reset lists" });
      }

      // Import resetListsToDefaults function
      const { resetListsToDefaults } = await import('./seed-hospital');
      
      // Reset the lists (destructive operation - replaces existing data)
      const result = await resetListsToDefaults(hospitalId);
      
      res.json({
        message: "Lists reset to defaults successfully",
        result
      });
    } catch (error) {
      console.error("Error resetting lists:", error);
      res.status(500).json({ message: "Failed to reset lists to defaults" });
    }
  });

  // Notes routes
  // Get notes for user's current unit
  app.get('/api/notes/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId } = req.params;
      const { scope } = req.query; // 'personal', 'unit', or 'hospital'
      
      // Get user's unit for this hospital
      const unitId = await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "No access to this hospital" });
      }

      let allNotes;
      
      if (scope === 'personal') {
        // Personal notes: only notes created by this user with scope='personal'
        allNotes = await db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.hospitalId, hospitalId),
              eq(notes.unitId, unitId),
              eq(notes.userId, userId),
              eq(notes.scope, 'personal')
            )
          )
          .orderBy(sql`${notes.createdAt} DESC`);
      } else if (scope === 'unit') {
        // Unit notes: shared notes for this specific unit
        allNotes = await db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.hospitalId, hospitalId),
              eq(notes.unitId, unitId),
              eq(notes.scope, 'unit')
            )
          )
          .orderBy(sql`${notes.createdAt} DESC`);
      } else if (scope === 'hospital') {
        // Hospital notes: notes visible to all units in this hospital
        allNotes = await db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.hospitalId, hospitalId),
              eq(notes.scope, 'hospital')
            )
          )
          .orderBy(sql`${notes.createdAt} DESC`);
      } else {
        // Default: return all notes (backward compatibility)
        allNotes = await db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.hospitalId, hospitalId),
              eq(notes.unitId, unitId)
            )
          )
          .orderBy(sql`${notes.createdAt} DESC`);
      }

      // Decrypt note content before sending to client
      const decryptedNotes = allNotes.map(note => {
        try {
          return {
            ...note,
            content: decryptNote(note.content)
          };
        } catch (error) {
          console.error(`Failed to decrypt note ${note.id}:`, error);
          // Return note with error indicator if decryption fails
          return {
            ...note,
            content: "[Error: Unable to decrypt note - data may be corrupted]"
          };
        }
      });

      res.json(decryptedNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Create a new note
  app.post('/api/notes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const noteData = insertNoteSchema.parse(req.body);
      
      // Verify user has access to this hospital/unit
      const { hasAccess } = await verifyUserHospitalUnitAccess(userId, noteData.hospitalId, noteData.unitId);
      if (!hasAccess) {
        return res.status(403).json({ message: "No access to this hospital/unit" });
      }

      // Encrypt note content before storing (using AES-GCM for authenticated encryption)
      const encryptedContent = encryptNote(noteData.content);

      // Create the note with encrypted content
      const [note] = await db
        .insert(notes)
        .values({
          ...noteData,
          content: encryptedContent,
          userId,
        })
        .returning();

      // Decrypt content before sending to client
      const decryptedNote = {
        ...note,
        content: decryptNote(note.content)
      };

      res.status(201).json(decryptedNote);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Update a note
  app.patch('/api/notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { noteId } = req.params;
      const { content, isShared } = req.body;

      // Get the note
      const [note] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId));

      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }

      // Check edit permissions based on note scope
      let canEditNote = false;
      
      // Creator can always edit their own notes
      if (note.userId === userId) {
        canEditNote = true;
      } 
      // For unit notes, members of the same unit can edit
      else if (note.scope === 'unit' && note.unitId) {
        const { hasAccess } = await verifyUserHospitalUnitAccess(userId, note.hospitalId, note.unitId);
        canEditNote = hasAccess;
      }
      // For hospital notes, admins can edit
      else if (note.scope === 'hospital') {
        const role = await getUserRole(userId, note.hospitalId);
        canEditNote = role === 'admin';
      }

      if (!canEditNote) {
        return res.status(403).json({ message: "You don't have permission to edit this note" });
      }

      // Encrypt content before storing (using AES-GCM for authenticated encryption)
      const encryptedContent = content ? encryptNote(content) : note.content;

      // Update the note with encrypted content
      const [updatedNote] = await db
        .update(notes)
        .set({
          content: encryptedContent,
          isShared,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, noteId))
        .returning();

      // Decrypt content before sending to client
      const decryptedNote = {
        ...updatedNote,
        content: decryptNote(updatedNote.content)
      };

      res.json(decryptedNote);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  // Delete a note
  app.delete('/api/notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { noteId } = req.params;

      // Get the note
      const [note] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId));

      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }

      // Check delete permissions based on note scope
      let canDeleteNote = false;
      
      // Creator can always delete their own notes
      if (note.userId === userId) {
        canDeleteNote = true;
      } 
      // For unit notes, members of the same unit can delete
      else if (note.scope === 'unit' && note.unitId) {
        const { hasAccess } = await verifyUserHospitalUnitAccess(userId, note.hospitalId, note.unitId);
        canDeleteNote = hasAccess;
      }
      // For hospital notes, admins can delete
      else if (note.scope === 'hospital') {
        const role = await getUserRole(userId, note.hospitalId);
        canDeleteNote = role === 'admin';
      }

      if (!canDeleteNote) {
        return res.status(403).json({ message: "You don't have permission to delete this note" });
      }

      // Delete the note
      await db.delete(notes).where(eq(notes.id, noteId));

      res.json({ message: "Note deleted successfully" });
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ message: "Failed to delete note" });
    }
  });

  return httpServer;
}
