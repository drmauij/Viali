import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { patients, surgeries, externalSurgeryRequests } from "@shared/schema";
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
  insertSurgeryStaffEntrySchema,
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
  itemCodes,
  stockLevels, 
  orders,
  orderAttachments,
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
  surgeryStaffEntries,
  preOpAssessments,
  anesthesiaAirwayManagement,
  insertPersonalTodoSchema,
  externalWorklogLinks,
  externalWorklogEntries,
  workerContracts,
  hinSyncStatus
} from "@shared/schema";
import { z } from "zod";
import { eq, and, or, inArray, sql, asc, desc } from "drizzle-orm";
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
  requireResourceAccess,
  canWrite,
  isUserInLogisticUnit,
  hasLogisticsAccess,
  canAccessOrder
} from "./utils";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "./services/aiMonitorAnalysis";
import { registerDomainRoutes } from "./routes/index";
import { ObjectStorageService } from "./objectStorage";

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

  // Vitabyte API Proxy (to avoid CORS issues when testing external APIs)
  app.post('/api/proxy-vitabyte', async (req: Request, res: Response) => {
    try {
      const { url, body } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL is required' });
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
      });

      const data = await response.json();
      res.status(response.status).json(data);
    } catch (error: any) {
      console.error('Vitabyte API proxy error:', error);
      res.status(500).json({ 
        error: 'Failed to proxy request', 
        details: error.message 
      });
    }
  });

  // Activity logging endpoint for tracking sensitive data access
  app.post('/api/activity/log', isAuthenticated, async (req: any, res) => {
    try {
      const { action, resourceType, resourceId, hospitalId, details } = req.body;
      const userId = req.user.id;
      
      if (!action || !resourceType || !resourceId) {
        return res.status(400).json({ message: "Missing required fields: action, resourceType, resourceId" });
      }

      await storage.createActivity({
        userId,
        action,
        itemId: resourceType === 'item' ? resourceId : undefined,
        metadata: {
          resourceType,
          resourceId,
          hospitalId: hospitalId || null,
          ...details
        },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error logging activity:", error);
      // Don't fail the request for logging errors
      res.json({ success: true, warning: "Activity may not have been logged" });
    }
  });

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
  
  // Update hospital settings (admin only)
  app.patch('/api/hospitals/:hospitalId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      // Check if user has admin access to this hospital
      const userHospitals = await storage.getUserHospitals(userId);
      const hospitalAccess = userHospitals.find(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hospitalAccess) {
        return res.status(403).json({ message: "Admin access required to update hospital settings" });
      }
      
      // Whitelist allowed fields to update
      const { visionAiProvider } = req.body;
      const updates: any = {};
      
      if (visionAiProvider !== undefined) {
        if (!['openai', 'pixtral'].includes(visionAiProvider)) {
          return res.status(400).json({ message: "Invalid vision AI provider. Must be 'openai' or 'pixtral'" });
        }
        updates.visionAiProvider = visionAiProvider;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }
      
      const updatedHospital = await storage.updateHospital(hospitalId, updates);
      res.json(updatedHospital);
    } catch (error: any) {
      console.error("Error updating hospital:", error);
      res.status(500).json({ message: "Failed to update hospital settings" });
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
      const hospitalId = req.body.hospitalId || req.headers['x-active-hospital-id'];
      
      const { analyzeItemImage } = await import('./openai');
      const extractedData = await analyzeItemImage(base64Image, hospitalId);
      
      res.json(extractedData);
    } catch (error: any) {
      console.error("Error analyzing image:", error);
      res.status(500).json({ message: error.message || "Failed to analyze image" });
    }
  });

  // AI image analysis for extracting ONLY product codes (pharmacode, GTIN, EAN, supplier codes)
  app.post('/api/items/analyze-codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Remove data URL prefix if present
      const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
      const hospitalId = req.body.hospitalId || req.headers['x-active-hospital-id'];
      
      const { analyzeCodesImage } = await import('./openai');
      const extractedCodes = await analyzeCodesImage(base64Image, hospitalId);
      
      res.json(extractedCodes);
    } catch (error: any) {
      console.error("Error analyzing codes image:", error);
      res.status(500).json({ message: error.message || "Failed to analyze codes image" });
    }
  });

  // Galexis product lookup by GTIN - fetches full product info including name, price, pharmacode
  app.post('/api/items/galexis-lookup', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { gtin, pharmacode, hospitalId, unitId, debug, skipExistingItem } = req.body;
      if (!gtin && !pharmacode) {
        return res.status(400).json({ message: "GTIN or Pharmacode is required" });
      }
      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Check if item with same pharmacode/GTIN already exists in this unit (not hospital-wide)
      // Different units can have the same item - inventories are separated by unit
      let existingItem: any = null;
      if (!skipExistingItem && unitId) {
        const existingItems = await db
          .select({
            itemId: itemCodes.itemId,
            gtin: itemCodes.gtin,
            pharmacode: itemCodes.pharmacode,
            itemName: items.name,
          })
          .from(itemCodes)
          .innerJoin(items, eq(items.id, itemCodes.itemId))
          .where(and(
            eq(items.unitId, unitId),
            or(
              pharmacode ? eq(itemCodes.pharmacode, pharmacode) : sql`false`,
              gtin ? eq(itemCodes.gtin, gtin) : sql`false`
            )
          ))
          .limit(1);
        
        if (existingItems.length > 0) {
          existingItem = existingItems[0];
        }
      }

      // Get Galexis catalog credentials for this hospital
      const catalog = await storage.getGalexisCatalogWithCredentials(hospitalId);
      
      // If Galexis not configured, try HIN MediUpdate directly
      if (!catalog || !catalog.customerNumber || !catalog.apiPassword) {
        const { hinClient, parsePackSizeFromDescription: parseHinPackSize } = await import('./services/hinMediupdateClient');
        const hinResult = await hinClient.lookupByCode(pharmacode || gtin);
        
        if (hinResult.found && hinResult.article) {
          // Try to parse pack size from HIN description
          const hinPackSize = parseHinPackSize(hinResult.article.descriptionDe);
          
          return res.json({
            found: true,
            source: 'hin',
            gtin: hinResult.article.gtin || gtin,
            pharmacode: hinResult.article.pharmacode || pharmacode,
            name: hinResult.article.descriptionDe,
            basispreis: hinResult.article.pexf,
            publikumspreis: hinResult.article.ppub,
            yourPrice: hinResult.article.pexf,
            discountPercent: 0,
            available: hinResult.article.saleCode === 'A',
            availabilityMessage: hinResult.article.saleCode === 'A' ? 'Available' : 'Inactive',
            packSize: hinPackSize,
            noGalexis: true,
            existingItem: existingItem || null,
          });
        }
        
        return res.json({ 
          found: false, 
          message: "Galexis not configured and product not found in HIN database.",
          noIntegration: true,
          existingItem: existingItem || null,
        });
      }

      // Create Galexis client and lookup product
      const { createGalexisClient } = await import('./services/galexisClient');
      const client = createGalexisClient(catalog.customerNumber, catalog.apiPassword);
      
      // Build lookup request - prefer pharmacode if provided
      const lookupRequest = pharmacode ? { pharmacode } : { gtin };
      console.log(`[Galexis Lookup] Testing lookup for:`, lookupRequest);
      
      const { results, debugInfo } = await client.lookupProducts([lookupRequest]);
      
      if (results.length > 0 && results[0].found && results[0].price) {
        const product = results[0];
        const response: any = {
          found: true,
          source: 'galexis',
          gtin: product.gtin || gtin,
          pharmacode: product.pharmacode || pharmacode,
          name: product.price?.description || '',
          basispreis: product.price?.basispreis,
          publikumspreis: product.price?.publikumspreis,
          yourPrice: product.price?.yourPrice,
          discountPercent: product.price?.discountPercent,
          available: product.price?.available,
          availabilityMessage: product.price?.availabilityMessage,
          packSize: product.price?.packSize,
          deliveryQuantity: product.price?.deliveryQuantity,
          existingItem: existingItem || null,
        };
        
        // Include debug info if requested
        if (debug) {
          response.debugInfo = debugInfo;
        }
        
        res.json(response);
      } else {
        // Galexis not found - try HIN MediUpdate as fallback
        const { hinClient, parsePackSizeFromDescription: parseHinPackSize } = await import('./services/hinMediupdateClient');
        const hinResult = await hinClient.lookupByCode(pharmacode || gtin);
        
        if (hinResult.found && hinResult.article) {
          // Try to parse pack size from HIN description
          const hinPackSize = parseHinPackSize(hinResult.article.descriptionDe);
          
          const response: any = {
            found: true,
            source: 'hin',
            gtin: hinResult.article.gtin || gtin,
            pharmacode: hinResult.article.pharmacode || pharmacode,
            name: hinResult.article.descriptionDe,
            basispreis: hinResult.article.pexf,
            publikumspreis: hinResult.article.ppub,
            yourPrice: hinResult.article.pexf, // HIN doesn't have customer-specific pricing
            discountPercent: 0,
            available: hinResult.article.saleCode === 'A',
            availabilityMessage: hinResult.article.saleCode === 'A' ? 'Available' : 'Inactive',
            packSize: hinPackSize,
            existingItem: existingItem || null,
          };
          
          if (debug) {
            response.debugInfo = { source: 'hin', galexisDebugInfo: debugInfo };
          }
          
          res.json(response);
        } else {
          const response: any = {
            found: false,
            message: results[0]?.error || "Product not found in Galexis or HIN database",
            gtin,
            pharmacode,
            existingItem: existingItem || null,
          };
          
          // Include debug info if requested (important for troubleshooting)
          if (debug) {
            response.debugInfo = debugInfo;
            response.rawResult = results[0];
          }
          
          res.json(response);
        }
      }
    } catch (error: any) {
      console.error("Error looking up product in Galexis:", error);
      res.status(500).json({ message: error.message || "Failed to lookup product in Galexis" });
    }
  });

  // HIN MediUpdate product lookup - free fallback when Galexis not configured
  app.post('/api/items/hin-lookup', isAuthenticated, async (req: any, res) => {
    try {
      const { gtin, pharmacode } = req.body;
      if (!gtin && !pharmacode) {
        return res.status(400).json({ message: "GTIN or Pharmacode is required" });
      }

      const { hinClient, parsePackSizeFromDescription: parseHinPackSize } = await import('./services/hinMediupdateClient');
      const result = await hinClient.lookupByCode(pharmacode || gtin);
      
      if (result.found && result.article) {
        // Try to parse pack size from HIN description
        const hinPackSize = parseHinPackSize(result.article.descriptionDe);
        
        res.json({
          found: true,
          source: 'hin',
          gtin: result.article.gtin,
          pharmacode: result.article.pharmacode,
          name: result.article.descriptionDe,
          nameFr: result.article.descriptionFr,
          basispreis: result.article.pexf,
          publikumspreis: result.article.ppub,
          swissmedicNo: result.article.swissmedicNo,
          smcat: result.article.smcat,
          saleCode: result.article.saleCode,
          available: result.article.saleCode === 'A',
          packSize: hinPackSize,
        });
      } else {
        res.json({
          found: false,
          message: "Product not found in HIN MediUpdate database",
        });
      }
    } catch (error: any) {
      console.error("Error looking up product in HIN:", error);
      res.status(500).json({ message: error.message || "Failed to lookup product in HIN" });
    }
  });

  // HIN MediUpdate sync status
  app.get('/api/hin/status', isAuthenticated, async (req: any, res) => {
    try {
      const { hinClient } = await import('./services/hinMediupdateClient');
      const status = await hinClient.getSyncStatus();
      res.json(status);
    } catch (error: any) {
      console.error("Error getting HIN sync status:", error);
      res.status(500).json({ message: error.message || "Failed to get HIN sync status" });
    }
  });

  // Trigger HIN MediUpdate sync (admin only)
  app.post('/api/hin/sync', isAuthenticated, async (req: any, res) => {
    try {
      // Check if user is admin
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.role === 'admin');
      
      if (!hasAdminRole) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Start sync in background
      const { hinClient } = await import('./services/hinMediupdateClient');
      
      // Return immediately, sync runs in background
      res.json({ message: "HIN sync started", status: "syncing" });
      
      // Run sync async
      hinClient.syncArticles((processed, total) => {
        console.log(`[HIN Sync] Progress: ${processed}/${total}`);
      }).then(result => {
        if (result.success) {
          console.log(`[HIN Sync] Completed: ${result.articlesCount} articles in ${(result.duration / 1000).toFixed(1)}s`);
        } else {
          console.error(`[HIN Sync] Failed: ${result.error}`);
        }
      }).catch(err => {
        console.error(`[HIN Sync] Error:`, err);
      });
    } catch (error: any) {
      console.error("Error triggering HIN sync:", error);
      res.status(500).json({ message: error.message || "Failed to trigger HIN sync" });
    }
  });

  // Reset stuck HIN sync status (admin only)
  app.post('/api/hin/reset-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.role === 'admin');
      
      if (!hasAdminRole) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Reset any stuck "syncing" status to "idle"
      await db
        .update(hinSyncStatus)
        .set({ status: 'idle', errorMessage: 'Reset by admin' })
        .where(eq(hinSyncStatus.status, 'syncing'));
      
      console.log('[HIN] Sync status reset by admin');
      res.json({ message: "HIN sync status reset successfully" });
    } catch (error: any) {
      console.error("Error resetting HIN sync status:", error);
      res.status(500).json({ message: error.message || "Failed to reset HIN sync status" });
    }
  });

  // HIN test lookup endpoint - test a specific code
  app.post('/api/hin/lookup', isAuthenticated, async (req: any, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Code (pharmacode or GTIN) is required" });
      }

      const { hinClient, parsePackSizeFromDescription } = await import('./services/hinMediupdateClient');
      
      // First check sync status
      const status = await hinClient.getSyncStatus();
      
      const result = await hinClient.lookupByCode(code);
      
      if (result.found && result.article) {
        const packSize = parsePackSizeFromDescription(result.article.descriptionDe);
        res.json({
          found: true,
          syncStatus: status,
          article: {
            ...result.article,
            packSize,
          },
        });
      } else {
        res.json({
          found: false,
          syncStatus: status,
          message: status.articlesCount === 0 
            ? "HIN database is empty - please sync first" 
            : "Product not found in HIN database",
        });
      }
    } catch (error: any) {
      console.error("Error looking up HIN product:", error);
      res.status(500).json({ message: error.message || "Failed to lookup HIN product" });
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
      const extractedItems = await analyzeBulkItemImages(base64Images, undefined, hospitalId);
      
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

  // Bulk AI analysis for barcode/GTIN images with Galexis lookup
  app.post('/api/items/analyze-bulk-codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      req.setTimeout(300000);
      res.setTimeout(300000);

      const { images, hospitalId } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }
      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

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

      // Get Galexis credentials
      const catalog = await storage.getGalexisCatalogWithCredentials(hospitalId);
      let galexisClient: any = null;
      
      if (catalog?.customerNumber && catalog?.apiPassword) {
        const { createGalexisClient } = await import('./services/galexisClient');
        galexisClient = createGalexisClient(catalog.customerNumber, catalog.apiPassword);
      }

      const { analyzeCodesImage } = await import('./openai');
      const results: any[] = [];

      console.log(`[Bulk Codes Import] Starting analysis of ${images.length} barcode images for hospital ${hospitalId}`);

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
        
        try {
          // Extract codes from image
          const extractedCodes = await analyzeCodesImage(base64Image, hospitalId);
          const gtin = extractedCodes.gtin || '';
          
          let item: any = {
            imageIndex: i,
            gtin: gtin,
            pharmacode: extractedCodes.pharmacode || '',
            lotNumber: extractedCodes.lotNumber || '',
            expiryDate: extractedCodes.expiryDate || '',
            name: '',
            description: '',
            source: 'ocr',
            galexisFound: false,
            error: null,
          };

          // If GTIN found and Galexis is configured, do lookup
          if (gtin && galexisClient) {
            try {
              const { results: lookupResults } = await galexisClient.lookupProducts([{ gtin }]);
              
              if (lookupResults.length > 0 && lookupResults[0].found && lookupResults[0].price) {
                const product = lookupResults[0];
                item.name = product.price?.description || '';
                item.pharmacode = product.pharmacode || item.pharmacode;
                item.basispreis = product.price?.basispreis;
                item.publikumspreis = product.price?.publikumspreis;
                item.yourPrice = product.price?.yourPrice;
                item.available = product.price?.available;
                item.source = 'galexis';
                item.galexisFound = true;
              }
            } catch (lookupError: any) {
              console.error(`[Bulk Codes Import] Galexis lookup failed for GTIN ${gtin}:`, lookupError.message);
            }
          }

          results.push(item);
        } catch (imageError: any) {
          console.error(`[Bulk Codes Import] Failed to analyze image ${i}:`, imageError.message);
          results.push({
            imageIndex: i,
            gtin: '',
            pharmacode: '',
            name: '',
            source: 'error',
            galexisFound: false,
            error: imageError.message || 'Failed to analyze image',
          });
        }
      }

      console.log(`[Bulk Codes Import] Completed analysis, processed ${results.length} images, ${results.filter(r => r.galexisFound).length} found in Galexis`);
      
      res.json({ items: results });
    } catch (error: any) {
      console.error("Error analyzing bulk codes:", error);
      res.status(500).json({ message: error.message || "Failed to analyze barcode images" });
    }
  });

  // AI medical monitor analysis for anesthesia vitals and ventilation
  app.post('/api/analyze-monitor', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { image, hospitalId } = req.body;
      const effectiveHospitalId = hospitalId || req.headers['x-active-hospital-id'];
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      const result = await analyzeMonitorImage(image, effectiveHospitalId);
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
      const { items: bulkItems, hospitalId, unitId: requestedUnitId } = req.body;
      const userId = req.user.id;
      const activeUnitId = getActiveUnitIdFromRequest(req);
      
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

      // Use unitId from request body or header, falling back to user's default unit
      const unitId = requestedUnitId || activeUnitId || await getUserUnitForHospital(userId, hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify user has access to this unit
      const verifyUnitId = await getUserUnitForHospital(userId, hospitalId, unitId);
      if (!verifyUnitId || verifyUnitId !== unitId) {
        return res.status(403).json({ message: "Access denied to this unit" });
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
          barcodes: bulkItem.barcodes && bulkItem.barcodes.length > 0 ? bulkItem.barcodes : [],
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
          imageUrl: bulkItem.imageUrl ?? null,
          folderId,
          vendorId,
          patientPrice: bulkItem.patientPrice ?? null,
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
        
        // Create item codes if provided (from CSV catalog import)
        if (bulkItem.itemCodes && typeof bulkItem.itemCodes === 'object') {
          const codes = bulkItem.itemCodes;
          const hasAnyCode = codes.gtin || codes.pharmacode || codes.swissmedicNr || 
                             codes.migel || codes.atc || codes.manufacturer || 
                             codes.manufacturerRef || codes.packContent || 
                             codes.unitsPerPack || codes.contentPerUnit || codes.abgabekategorie;
          
          if (hasAnyCode) {
            try {
              await storage.createItemCode({
                itemId: item.id,
                gtin: codes.gtin || null,
                pharmacode: codes.pharmacode || null,
                swissmedicNr: codes.swissmedicNr || null,
                migel: codes.migel || null,
                atc: codes.atc || null,
                manufacturer: codes.manufacturer || null,
                manufacturerRef: codes.manufacturerRef || null,
                packContent: codes.packContent || null,
                unitsPerPack: codes.unitsPerPack || null,
                contentPerUnit: codes.contentPerUnit || null,
                abgabekategorie: codes.abgabekategorie || null,
              });
            } catch (codeError) {
              console.warn(`[BULK] Failed to create item codes for item ${item.id}:`, codeError);
            }
          }
        }
        
        // Create supplier code if provided (from CSV catalog import)
        if (bulkItem.supplierInfo && typeof bulkItem.supplierInfo === 'object') {
          const supplier = bulkItem.supplierInfo;
          // Create supplier code if we have a supplier name OR if we have article code/price
          const hasSupplierData = supplier.preferredSupplier || supplier.supplierArticleCode || supplier.supplierPrice;
          if (hasSupplierData) {
            try {
              await storage.createSupplierCode({
                itemId: item.id,
                supplierName: supplier.preferredSupplier || 'Unknown Supplier',
                articleCode: supplier.supplierArticleCode || null,
                basispreis: supplier.supplierPrice || null,
                isPreferred: !!supplier.preferredSupplier,
              });
            } catch (supplierError) {
              console.warn(`[BULK] Failed to create supplier code for item ${item.id}:`, supplierError);
            }
          }
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
  app.get('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const code = await storage.getItemCode(itemId);
      console.log(`[ItemCodes] Fetched codes for item ${itemId}:`, code ? 'found' : 'not found');
      res.json(code || null);
    } catch (error: any) {
      console.error("Error fetching item codes:", error);
      res.status(500).json({ message: error.message || "Failed to fetch item codes" });
    }
  });

  // Create or update item codes
  app.put('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId } = req.params;
      // Strip out any extra fields (id, itemId, createdAt, updatedAt) that may come from client
      const { id, itemId: bodyItemId, createdAt, updatedAt, ...codeFields } = req.body;
      console.log(`[ItemCodes] Updating codes for item ${itemId}:`, JSON.stringify(codeFields));
      const validatedData = insertItemCodeSchema.omit({ itemId: true }).parse(codeFields);
      const code = await storage.updateItemCode(itemId, validatedData);
      console.log(`[ItemCodes] Successfully updated codes for item ${itemId}`);
      res.json(code);
    } catch (error: any) {
      console.error("Error updating item codes:", error);
      console.error("Request body was:", JSON.stringify(req.body));
      res.status(500).json({ message: error.message || "Failed to update item codes" });
    }
  });

  // Delete item codes
  app.delete('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
  app.get('/api/items/:itemId/suppliers', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
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
  app.post('/api/items/:itemId/suppliers', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId } = req.params;
      // When manually added by user, auto-confirm the match since user explicitly added it
      const validatedData = insertSupplierCodeSchema.parse({ 
        ...req.body, 
        itemId,
        matchStatus: 'confirmed' // User-added suppliers are automatically confirmed
      });
      const code = await storage.createSupplierCode(validatedData);
      res.status(201).json(code);
    } catch (error: any) {
      console.error("Error creating supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to create supplier code" });
    }
  });

  // Update a supplier code
  app.put('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId, supplierId } = req.params;
      
      // Verify supplierId belongs to this itemId
      const supplierCode = await storage.getSupplierCode(supplierId);
      if (!supplierCode || supplierCode.itemId !== itemId) {
        return res.status(404).json({ message: "Supplier code not found for this item" });
      }
      
      // Omit itemId, hospitalId, and unitId from updates to prevent cross-hospital reassignment
      const { itemId: _itemId, hospitalId: _hospitalId, unitId: _unitId, ...safeBody } = req.body;
      const validatedData = insertSupplierCodeSchema.partial().parse(safeBody);
      const code = await storage.updateSupplierCode(supplierId, validatedData);
      res.json(code);
    } catch (error: any) {
      console.error("Error updating supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to update supplier code" });
    }
  });

  // Delete a supplier code
  app.delete('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId, supplierId } = req.params;
      
      // Verify supplierId belongs to this itemId
      const supplierCode = await storage.getSupplierCode(supplierId);
      if (!supplierCode || supplierCode.itemId !== itemId) {
        return res.status(404).json({ message: "Supplier code not found for this item" });
      }
      
      await storage.deleteSupplierCode(supplierId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting supplier code:", error);
      res.status(500).json({ message: error.message || "Failed to delete supplier code" });
    }
  });

  // Set preferred supplier
  app.post('/api/items/:itemId/suppliers/:supplierId/set-preferred', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId, supplierId } = req.params;
      
      // Verify supplierId belongs to this itemId
      const supplierCode = await storage.getSupplierCode(supplierId);
      if (!supplierCode || supplierCode.itemId !== itemId) {
        return res.status(404).json({ message: "Supplier code not found for this item" });
      }
      
      await storage.setPreferredSupplier(itemId, supplierId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting preferred supplier:", error);
      res.status(500).json({ message: error.message || "Failed to set preferred supplier" });
    }
  });

  // ==================== Lot Routes ====================
  
  // Get lots for an item
  app.get('/api/items/:itemId/lots', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
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
  app.post('/api/items/:itemId/lots', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
  app.put('/api/items/:itemId/lots/:lotId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId, lotId } = req.params;
      const { lotNumber, expiryDate, qty } = req.body;
      
      // Verify lotId belongs to this itemId
      const existingLot = await storage.getLotById(lotId);
      if (!existingLot || existingLot.itemId !== itemId) {
        return res.status(404).json({ message: "Lot not found for this item" });
      }
      
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
  app.delete('/api/items/:itemId/lots/:lotId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
    try {
      const { itemId, lotId } = req.params;
      
      // Verify lotId belongs to this itemId
      const existingLot = await storage.getLotById(lotId);
      if (!existingLot || existingLot.itemId !== itemId) {
        return res.status(404).json({ message: "Lot not found for this item" });
      }
      
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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
        },
        job.hospitalId
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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

  // Logistic Orders - cross-unit view (no unit filtering)
  // Only available to users who have at least one unit with isLogisticModule: true
  app.get('/api/logistic/orders/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { status } = req.query;
      const userId = req.user.id;
      
      // Get all user's units for this hospital
      const userHospitals = await storage.getUserHospitals(userId);
      const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
      
      if (userUnitsForHospital.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Check if any of the user's units has type === 'logistic'
      const unitIds = userUnitsForHospital.map(h => h.unitId).filter(Boolean) as string[];
      let hasLogisticAccess = false;
      
      for (const unitId of unitIds) {
        const unit = await storage.getUnit(unitId);
        if (unit?.type === 'logistic') {
          hasLogisticAccess = true;
          break;
        }
      }
      
      if (!hasLogisticAccess) {
        return res.status(403).json({ message: "Access denied - logistics module required" });
      }
      
      // Get orders for the entire hospital (no unit filter for logistic view)
      const orders = await storage.getOrders(hospitalId, status as string);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching logistic orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Orders routes - shows only orders for the specified unit
  // Each unit sees only their own orders
  app.get('/api/orders/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { status, unitId: queryUnitId } = req.query;
      const userId = req.user.id;
      
      // Get all hospitals/units the user has access to
      const userHospitals = await storage.getUserHospitals(userId);
      const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
      
      if (userUnitsForHospital.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get the unit to filter by - either from query or from X-Active-Unit-Id header
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const filterUnitId = (queryUnitId as string) || activeUnitId;
      
      if (filterUnitId) {
        // Verify user has access to the requested unit
        const hasAccessToUnit = userUnitsForHospital.some(h => h.unitId === filterUnitId);
        if (!hasAccessToUnit) {
          // Allow logistics users to access orders from any unit in their hospital
          const userHasLogisticsAccess = await hasLogisticsAccess(userId, hospitalId);
          if (!userHasLogisticsAccess) {
            return res.status(403).json({ message: "Access denied to this unit" });
          }
        }
        const orders = await storage.getOrders(hospitalId, status as string, filterUnitId);
        return res.json(orders);
      }
      
      // No specific unit requested - use the first unit the user has access to
      const defaultUnitId = userUnitsForHospital[0]?.unitId;
      if (!defaultUnitId) {
        return res.status(403).json({ message: "No unit access found" });
      }
      
      const orders = await storage.getOrders(hospitalId, status as string, defaultUnitId);
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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

  // Merge multiple sent orders into one
  app.post('/api/orders/:hospitalId/merge', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { orderIds } = req.body;
      const userId = req.user.id;
      
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length < 2) {
        return res.status(400).json({ message: "At least 2 order IDs are required" });
      }
      
      // Verify user has access to this hospital
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get all orders and verify they are all "sent" and from the same unit
      const ordersToMerge = await Promise.all(
        orderIds.map(async (id: string) => {
          const [order] = await db.select().from(orders).where(eq(orders.id, id));
          return order;
        })
      );
      
      // Validate all orders exist, have same status (except received), and from the same unit
      const firstOrderUnitId = ordersToMerge[0]?.unitId;
      const firstOrderStatus = ordersToMerge[0]?.status;
      for (const order of ordersToMerge) {
        if (!order) {
          return res.status(404).json({ message: "One or more orders not found" });
        }
        // Allow merge for draft, ready_to_send, and sent orders (not received)
        if (order.status === 'received') {
          return res.status(400).json({ message: "Received orders cannot be merged" });
        }
        // All orders must have the same status to merge
        if (order.status !== firstOrderStatus) {
          return res.status(400).json({ message: "All orders must have the same status to merge" });
        }
        if (order.hospitalId !== hospitalId) {
          return res.status(400).json({ message: "All orders must be from the same hospital" });
        }
        // All orders must be from the same unit for data integrity
        if (order.unitId !== firstOrderUnitId) {
          return res.status(400).json({ message: "All orders must be from the same unit to merge" });
        }
      }
      
      // Security: Verify user has access to the orders' unit
      if (firstOrderUnitId !== unitId) {
        // Allow logistics users to merge orders from any unit
        const userHasLogisticsAccess = await hasLogisticsAccess(userId, hospitalId);
        if (!userHasLogisticsAccess) {
          return res.status(403).json({ message: "Access denied: you can only merge orders from your unit" });
        }
      }
      
      // Use the first order as the target, move all lines from other orders to it
      const targetOrder = ordersToMerge[0];
      const otherOrderIds = orderIds.slice(1);
      
      // Move all order lines to the target order
      for (const otherId of otherOrderIds) {
        await db.update(orderLines)
          .set({ orderId: targetOrder.id })
          .where(eq(orderLines.orderId, otherId));
      }
      
      // Delete the now-empty orders
      for (const otherId of otherOrderIds) {
        await db.delete(orders).where(eq(orders.id, otherId));
      }
      
      // Return success with merged order info
      res.json({ 
        success: true, 
        mergedOrderId: targetOrder.id,
        mergedCount: otherOrderIds.length + 1
      });
    } catch (error: any) {
      console.error("Error merging orders:", error);
      console.error("Error stack:", error?.stack);
      res.status(500).json({ message: "Failed to merge orders", error: error?.message || String(error) });
    }
  });

  // Split order - move selected items from a draft order to a new order
  // The new order inherits the same unit as the source order
  app.post('/api/orders/:orderId/split', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { lineIds } = req.body; // Array of order line IDs to move to new order
      const userId = req.user.id;
      
      if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
        return res.status(400).json({ message: "At least one line ID is required to split" });
      }
      
      // Get the source order
      const [sourceOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!sourceOrder) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Allow split for draft, ready_to_send, and sent orders (not received)
      if (sourceOrder.status === 'received') {
        return res.status(400).json({ message: "Received orders cannot be split" });
      }
      
      // Verify user has access to this hospital
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, sourceOrder.hospitalId, activeUnitId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Security: Verify user has access to this order's unit
      if (sourceOrder.unitId !== unitId) {
        // Allow logistics users to split orders from any unit
        const userHasLogisticsAccess = await hasLogisticsAccess(userId, sourceOrder.hospitalId);
        if (!userHasLogisticsAccess) {
          return res.status(403).json({ message: "Access denied: you can only split orders from your unit" });
        }
      }
      
      // Verify all lines belong to the source order
      const linesToMove = await db.select().from(orderLines).where(
        and(
          eq(orderLines.orderId, orderId),
          inArray(orderLines.id, lineIds)
        )
      );
      
      if (linesToMove.length !== lineIds.length) {
        return res.status(400).json({ message: "Some line IDs do not belong to this order" });
      }
      
      // Create new order with SAME unitId as source order (inherits unit)
      const newOrder = await storage.createOrder({
        hospitalId: sourceOrder.hospitalId,
        unitId: sourceOrder.unitId, // CRITICAL: inherit unit from source order
        vendorId: sourceOrder.vendorId,
        status: 'draft',
        createdBy: userId,
      });
      
      // Move the selected lines to the new order
      await db.update(orderLines)
        .set({ orderId: newOrder.id })
        .where(inArray(orderLines.id, lineIds));
      
      res.json({ 
        success: true, 
        newOrderId: newOrder.id,
        movedCount: linesToMove.length
      });
    } catch (error: any) {
      console.error("Error splitting order:", error);
      console.error("Error stack:", error?.stack);
      res.status(500).json({ message: "Failed to split order", error: error?.message || String(error) });
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Get current stock level - use order.unitId (the receiving unit), not item.unitId
      const [currentStock] = await db
        .select()
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.itemId, item.id),
            eq(stockLevels.unitId, order.unitId)
          )
        );
      
      const currentQty = currentStock?.qtyOnHand || 0;
      const newQty = currentQty + line.qty;
      
      console.log('[Order Line Receive] Stock update: item', item.id, 'unit', order.unitId, 'current', currentQty, '+ received', line.qty, '= new', newQty);
      
      // Update stock level for the order's unit (where the receiving happens)
      await storage.updateStockLevel(item.id, order.unitId, newQty);
      
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
          unitId: order.unitId,
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
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
      
      // Verify user can access this order (direct unit access or logistics access)
      const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
      if (!canAccess) {
        return res.status(403).json({ message: "Access denied: you can only delete orders from your unit" });
      }
      
      await storage.deleteOrder(orderId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order:", error);
      res.status(500).json({ message: "Failed to delete order" });
    }
  });

  // Order Attachments - Get presigned upload URL
  app.post('/api/orders/:orderId/attachments/upload-url', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { filename, contentType } = req.body;

      // Verify order exists
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const objectStorageService = new ObjectStorageService();
      if (!objectStorageService.isConfigured()) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const { uploadURL, storageKey } = await objectStorageService.getOrderAttachmentUploadURL(
        orderId,
        filename,
        contentType
      );

      res.json({ uploadURL, storageKey });
    } catch (error) {
      console.error("Error getting upload URL for order attachment:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // Order Attachments - Create attachment record after upload
  app.post('/api/orders/:orderId/attachments', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { filename, contentType, storageKey } = req.body;
      const userId = req.user.id;

      if (!filename || !storageKey) {
        return res.status(400).json({ message: "Filename and storageKey are required" });
      }

      // Verify order exists
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const [attachment] = await db.insert(orderAttachments).values({
        orderId,
        filename,
        contentType: contentType || 'application/octet-stream',
        storageKey,
        uploadedBy: userId,
      }).returning();

      res.json(attachment);
    } catch (error) {
      console.error("Error creating order attachment:", error);
      res.status(500).json({ message: "Failed to create attachment" });
    }
  });

  // Order Attachments - List attachments for an order
  app.get('/api/orders/:orderId/attachments', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.params;

      const attachments = await db
        .select()
        .from(orderAttachments)
        .where(eq(orderAttachments.orderId, orderId))
        .orderBy(desc(orderAttachments.createdAt));

      res.json(attachments);
    } catch (error) {
      console.error("Error fetching order attachments:", error);
      res.status(500).json({ message: "Failed to fetch attachments" });
    }
  });

  // Order Attachments - Get download URL for an attachment
  app.get('/api/orders/attachments/:attachmentId/download-url', isAuthenticated, async (req: any, res) => {
    try {
      const { attachmentId } = req.params;

      const [attachment] = await db
        .select()
        .from(orderAttachments)
        .where(eq(orderAttachments.id, attachmentId));

      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      const objectStorageService = new ObjectStorageService();
      if (!objectStorageService.isConfigured()) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const downloadURL = await objectStorageService.getObjectDownloadURL(attachment.storageKey, 3600);
      res.json({ downloadURL, filename: attachment.filename, contentType: attachment.contentType });
    } catch (error) {
      console.error("Error getting download URL for order attachment:", error);
      res.status(500).json({ message: "Failed to get download URL" });
    }
  });

  // Order Attachments - Delete an attachment
  app.delete('/api/orders/attachments/:attachmentId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { attachmentId } = req.params;

      const [attachment] = await db
        .select()
        .from(orderAttachments)
        .where(eq(orderAttachments.id, attachmentId));

      if (!attachment) {
        return res.status(404).json({ message: "Attachment not found" });
      }

      // Delete from S3
      const objectStorageService = new ObjectStorageService();
      if (objectStorageService.isConfigured()) {
        try {
          await objectStorageService.deleteObject(attachment.storageKey);
        } catch (deleteError) {
          console.warn(`Failed to delete attachment from S3 ${attachment.storageKey}:`, deleteError);
        }
      }

      // Delete from database
      await db.delete(orderAttachments).where(eq(orderAttachments.id, attachmentId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting order attachment:", error);
      res.status(500).json({ message: "Failed to delete attachment" });
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
      
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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
      
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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
      
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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

  app.delete('/api/controlled/checks/:checkId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { checkId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;
      
      const check = await storage.getControlledCheck(checkId);
      if (!check) {
        return res.status(404).json({ message: "Verification check not found" });
      }
      
      const unitId = await getUserUnitForHospital(userId, check.hospitalId);
      if (!unitId || unitId !== check.unitId) {
        return res.status(403).json({ message: "Access denied to this check" });
      }
      
      await storage.deleteControlledCheck(checkId);
      
      await storage.createAuditLog({
        recordType: 'controlled_check',
        recordId: checkId,
        hospitalId: check.hospitalId,
        userId,
        action: 'delete',
        oldData: check,
        newData: null,
        reason: reason || 'Routine verification check deleted',
      });
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting controlled check:", error);
      res.status(500).json({ message: "Failed to delete controlled check" });
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const userUnitId = await getUserUnitForHospital(userId, item.hospitalId, activeUnitId || undefined);
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
      
      // Get alert and verify hospital access
      const existingAlert = await storage.getAlertById(alertId);
      if (!existingAlert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      // Verify user has access to the hospital this alert belongs to
      const unitId = await getUserUnitForHospital(userId, existingAlert.hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this alert" });
      }
      
      const alert = await storage.acknowledgeAlert(alertId, userId);
      res.json(alert);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  app.post('/api/alerts/:alertId/snooze', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { alertId } = req.params;
      const { until } = req.body;
      const userId = req.user.id;
      
      if (!until) {
        return res.status(400).json({ message: "Snooze until date is required" });
      }
      
      // Get alert and verify hospital access
      const existingAlert = await storage.getAlertById(alertId);
      if (!existingAlert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      // Verify user has access to the hospital this alert belongs to
      const unitId = await getUserUnitForHospital(userId, existingAlert.hospitalId);
      if (!unitId) {
        return res.status(403).json({ message: "Access denied to this alert" });
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
      
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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

  // Normalize phone numbers (admin only)
  // Adds +41 prefix to numbers without prefix, removes leading 0
  app.post('/api/hospitals/:id/normalize-phones', isAuthenticated, requireWriteAccess, async (req: any, res) => {
    try {
      const { id: hospitalId } = req.params;
      const userId = req.user.id;

      // Check if user has admin access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hospital) {
        return res.status(403).json({ message: "Admin access required to normalize phone numbers" });
      }

      // Function to normalize a phone number
      const normalizePhone = (phone: string | null): string | null => {
        if (!phone) return phone;
        
        let cleaned = phone.trim();
        
        // If already has a + prefix, leave it as is
        if (cleaned.startsWith('+')) {
          return cleaned;
        }
        
        // If starts with 00, assume it's an international format
        if (cleaned.startsWith('00')) {
          return '+' + cleaned.slice(2);
        }
        
        // Remove leading 0 if present
        if (cleaned.startsWith('0')) {
          cleaned = cleaned.slice(1);
        }
        
        // Add Swiss prefix +41
        return '+41 ' + cleaned;
      };

      let patientsUpdated = 0;
      let usersUpdated = 0;
      let externalRequestsUpdated = 0;

      // Normalize patient phone numbers
      const patientsData = await db
        .select({ id: patients.id, phone: patients.phone })
        .from(patients)
        .where(eq(patients.hospitalId, hospitalId));
      
      for (const patient of patientsData) {
        if (patient.phone) {
          const normalized = normalizePhone(patient.phone);
          if (normalized !== patient.phone) {
            await db.update(patients)
              .set({ phone: normalized })
              .where(eq(patients.id, patient.id));
            patientsUpdated++;
          }
        }
      }

      // Normalize user phone numbers for users in this hospital
      const hospitalRoles = await db
        .select({ userId: userHospitalRoles.userId })
        .from(userHospitalRoles)
        .where(eq(userHospitalRoles.hospitalId, hospitalId));
      
      const userIds = hospitalRoles.map(r => r.userId);
      
      if (userIds.length > 0) {
        const usersData = await db
          .select({ id: users.id, phone: users.phone })
          .from(users)
          .where(inArray(users.id, userIds));
        
        for (const user of usersData) {
          if (user.phone) {
            const normalized = normalizePhone(user.phone);
            if (normalized !== user.phone) {
              await db.update(users)
                .set({ phone: normalized })
                .where(eq(users.id, user.id));
              usersUpdated++;
            }
          }
        }
      }

      // Normalize preOpAssessment phone numbers (linked through surgeries)
      let preOpUpdated = 0;
      const preOpData = await db
        .select({ 
          id: preOpAssessments.id, 
          outpatientCaregiverPhone: preOpAssessments.outpatientCaregiverPhone
        })
        .from(preOpAssessments)
        .innerJoin(surgeries, eq(preOpAssessments.surgeryId, surgeries.id))
        .where(eq(surgeries.hospitalId, hospitalId));
      
      for (const p of preOpData) {
        if (p.outpatientCaregiverPhone) {
          const normalized = normalizePhone(p.outpatientCaregiverPhone);
          if (normalized !== p.outpatientCaregiverPhone) {
            await db.update(preOpAssessments)
              .set({ outpatientCaregiverPhone: normalized })
              .where(eq(preOpAssessments.id, p.id));
            preOpUpdated++;
          }
        }
      }

      // Normalize external surgery request phone numbers
      const externalRequests = await db
        .select({ 
          id: externalSurgeryRequests.id, 
          surgeonPhone: externalSurgeryRequests.surgeonPhone,
          patientPhone: externalSurgeryRequests.patientPhone
        })
        .from(externalSurgeryRequests)
        .where(eq(externalSurgeryRequests.hospitalId, hospitalId));
      
      for (const r of externalRequests) {
        const updates: Record<string, string | null> = {};
        
        if (r.surgeonPhone) {
          const normalized = normalizePhone(r.surgeonPhone);
          if (normalized !== r.surgeonPhone) {
            updates.surgeonPhone = normalized;
          }
        }
        
        if (r.patientPhone) {
          const normalized = normalizePhone(r.patientPhone);
          if (normalized !== r.patientPhone) {
            updates.patientPhone = normalized;
          }
        }
        
        if (Object.keys(updates).length > 0) {
          await db.update(externalSurgeryRequests)
            .set(updates)
            .where(eq(externalSurgeryRequests.id, r.id));
          externalRequestsUpdated++;
        }
      }

      res.json({
        message: "Phone numbers normalized successfully",
        result: {
          patientsUpdated,
          usersUpdated,
          preOpUpdated,
          externalRequestsUpdated,
          totalUpdated: patientsUpdated + usersUpdated + preOpUpdated + externalRequestsUpdated
        }
      });
    } catch (error) {
      console.error("Error normalizing phone numbers:", error);
      res.status(500).json({ message: "Failed to normalize phone numbers" });
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
      const activeUnitId = getActiveUnitIdFromRequest(req);
      const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
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

  // ========== PERSONAL TODO API ROUTES ==========

  // Get all personal todos for the current user in a hospital
  app.get('/api/hospitals/:hospitalId/todos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId } = req.params;

      const todos = await storage.getPersonalTodos(userId, hospitalId);
      res.json(todos);
    } catch (error) {
      console.error("Error fetching todos:", error);
      res.status(500).json({ message: "Failed to fetch todos" });
    }
  });

  // Create a new personal todo
  app.post('/api/hospitals/:hospitalId/todos', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId } = req.params;

      const parsed = insertPersonalTodoSchema.safeParse({
        ...req.body,
        userId,
        hospitalId
      });

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid todo data", errors: parsed.error.errors });
      }

      const todo = await storage.createPersonalTodo(parsed.data);
      res.status(201).json(todo);
    } catch (error) {
      console.error("Error creating todo:", error);
      res.status(500).json({ message: "Failed to create todo" });
    }
  });

  // Update a personal todo
  app.patch('/api/todos/:todoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { todoId } = req.params;

      // Check ownership
      const existing = await storage.getPersonalTodo(todoId);
      if (!existing) {
        return res.status(404).json({ message: "Todo not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { title, description, status } = req.body;
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;

      const updated = await storage.updatePersonalTodo(todoId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating todo:", error);
      res.status(500).json({ message: "Failed to update todo" });
    }
  });

  // Delete a personal todo
  app.delete('/api/todos/:todoId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { todoId } = req.params;

      // Check ownership
      const existing = await storage.getPersonalTodo(todoId);
      if (!existing) {
        return res.status(404).json({ message: "Todo not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deletePersonalTodo(todoId);
      res.json({ message: "Todo deleted successfully" });
    } catch (error) {
      console.error("Error deleting todo:", error);
      res.status(500).json({ message: "Failed to delete todo" });
    }
  });

  // Reorder todos (for drag-and-drop)
  app.post('/api/hospitals/:hospitalId/todos/reorder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { hospitalId } = req.params;
      const { todoIds, status } = req.body;

      if (!Array.isArray(todoIds) || !status) {
        return res.status(400).json({ message: "Invalid reorder data" });
      }

      // Verify all todos belong to this user
      for (const todoId of todoIds) {
        const todo = await storage.getPersonalTodo(todoId);
        if (!todo || todo.userId !== userId) {
          return res.status(403).json({ message: "Access denied to one or more todos" });
        }
      }

      await storage.reorderPersonalTodos(todoIds, status);
      res.json({ message: "Todos reordered successfully" });
    } catch (error) {
      console.error("Error reordering todos:", error);
      res.status(500).json({ message: "Failed to reorder todos" });
    }
  });

  // ==================== EXTERNAL WORKLOG ROUTES ====================

  // Public route: Get worklog link info by token (no auth required)
  app.get('/api/worklog/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      if (!link.isActive) {
        return res.status(410).json({ message: "This link has been deactivated" });
      }
      
      // Update last accessed timestamp
      await storage.updateExternalWorklogLinkLastAccess(link.id);
      
      // Get existing entries for this link
      const entries = await storage.getExternalWorklogEntriesByLink(link.id);
      
      res.json({
        email: link.email,
        unitName: link.unit.name,
        hospitalName: link.hospital.name,
        linkId: link.id,
        unitId: link.unitId,
        hospitalId: link.hospitalId,
        entries,
        personalData: {
          firstName: link.firstName || '',
          lastName: link.lastName || '',
          address: link.address || '',
          city: link.city || '',
          zip: link.zip || '',
          bankAccount: link.bankAccount || '',
        },
      });
    } catch (error) {
      console.error("Error fetching worklog link:", error);
      res.status(500).json({ message: "Failed to fetch worklog data" });
    }
  });

  // Public route: Save personal data (no auth required, uses token)
  app.patch('/api/worklog/:token/personal-data', async (req, res) => {
    try {
      const { token } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link || !link.isActive) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      const { firstName, lastName, address, city, zip, bankAccount } = req.body;
      
      await db.update(externalWorklogLinks)
        .set({
          firstName: firstName || null,
          lastName: lastName || null,
          address: address || null,
          city: city || null,
          zip: zip || null,
          bankAccount: bankAccount || null,
          updatedAt: new Date(),
        })
        .where(eq(externalWorklogLinks.id, link.id));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving personal data:", error);
      res.status(500).json({ message: "Failed to save personal data" });
    }
  });

  // Public route: Submit a time entry (no auth required)
  app.post('/api/worklog/:token/entries', async (req, res) => {
    try {
      const { token } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link || !link.isActive) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      const { firstName, lastName, workDate, timeStart, timeEnd, pauseMinutes, activityType, workerSignature, notes } = req.body;
      
      if (!firstName || !lastName || !workDate || !timeStart || !timeEnd || !activityType || !workerSignature) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const entry = await storage.createExternalWorklogEntry({
        linkId: link.id,
        unitId: link.unitId,
        hospitalId: link.hospitalId,
        email: link.email,
        firstName,
        lastName,
        workDate,
        timeStart,
        timeEnd,
        pauseMinutes: pauseMinutes || 0,
        activityType,
        workerSignature,
        notes: notes || null,
      });
      
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating worklog entry:", error);
      res.status(500).json({ message: "Failed to create entry" });
    }
  });

  // Public route: Resend worklog link to email
  app.post('/api/worklog/resend', async (req, res) => {
    try {
      const { email, hospitalId } = req.body;
      
      if (!email || !hospitalId) {
        return res.status(400).json({ message: "Email and hospital ID are required" });
      }
      
      // Find any active links for this email across all units in the hospital
      const { sendWorklogLinkEmail } = await import('./email');
      const allLinks = await db.select()
        .from(externalWorklogLinks)
        .innerJoin(units, eq(units.id, externalWorklogLinks.unitId))
        .where(and(
          eq(externalWorklogLinks.hospitalId, hospitalId),
          eq(externalWorklogLinks.email, email.toLowerCase()),
          eq(externalWorklogLinks.isActive, true)
        ));
      
      if (allLinks.length === 0) {
        // Don't reveal if the email doesn't exist
        return res.json({ message: "If your email is registered, you will receive the link shortly." });
      }
      
      // Send email for each link
      for (const linkData of allLinks) {
        const link = linkData.external_worklog_links;
        const unit = linkData.units;
        const hospital = await storage.getHospital(link.hospitalId);
        
        if (hospital) {
          await sendWorklogLinkEmail(
            email,
            link.token,
            unit.name,
            hospital.name
          );
        }
      }
      
      res.json({ message: "If your email is registered, you will receive the link shortly." });
    } catch (error) {
      console.error("Error resending worklog link:", error);
      res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Get pending worklog entries for countersigning (authenticated)
  app.get('/api/hospitals/:hospitalId/worklog/pending', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const unitId = getActiveUnitIdFromRequest(req);
      
      const entries = await storage.getPendingWorklogEntries(hospitalId, unitId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching pending worklogs:", error);
      res.status(500).json({ message: "Failed to fetch pending entries" });
    }
  });

  // Get all worklog entries with filters (authenticated, manager/business view)
  app.get('/api/hospitals/:hospitalId/worklog/entries', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { unitId, status, email, dateFrom, dateTo } = req.query;
      
      const entries = await storage.getAllWorklogEntries(hospitalId, {
        unitId: unitId as string,
        status: status as string,
        email: email as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
      });
      
      res.json(entries);
    } catch (error) {
      console.error("Error fetching worklog entries:", error);
      res.status(500).json({ message: "Failed to fetch entries" });
    }
  });

  // Countersign a worklog entry (authenticated, requires user to be assigned to entry's unit)
  app.post('/api/hospitals/:hospitalId/worklog/entries/:entryId/countersign', isAuthenticated, async (req: any, res) => {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;
      const { signature } = req.body;
      
      if (!signature) {
        return res.status(400).json({ message: "Signature is required" });
      }
      
      // Fetch the entry to check unit assignment
      const entry = await storage.getExternalWorklogEntry(entryId);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      // Check if user is assigned to the entry's unit
      const userHospitals = await storage.getUserHospitals(userId);
      const hasUnitAccess = userHospitals.some(h => h.unitId === entry.unitId);
      
      if (!hasUnitAccess) {
        return res.status(403).json({ message: "You do not have permission to countersign entries for this unit" });
      }
      
      const user = await storage.getUser(userId);
      const signerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';
      
      const updated = await storage.countersignWorklogEntry(entryId, userId, signature, signerName);
      res.json(updated);
    } catch (error) {
      console.error("Error countersigning entry:", error);
      res.status(500).json({ message: "Failed to countersign entry" });
    }
  });

  // Reject a worklog entry (authenticated, requires user to be assigned to entry's unit)
  app.post('/api/hospitals/:hospitalId/worklog/entries/:entryId/reject', isAuthenticated, async (req: any, res) => {
    try {
      const { entryId } = req.params;
      const userId = req.user.id;
      const { reason } = req.body;
      
      // Fetch the entry to check unit assignment
      const entry = await storage.getExternalWorklogEntry(entryId);
      if (!entry) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      // Check if user is assigned to the entry's unit
      const userHospitals = await storage.getUserHospitals(userId);
      const hasUnitAccess = userHospitals.some(h => h.unitId === entry.unitId);
      
      if (!hasUnitAccess) {
        return res.status(403).json({ message: "You do not have permission to reject entries for this unit" });
      }
      
      const user = await storage.getUser(userId);
      const signerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';
      
      const updated = await storage.rejectWorklogEntry(entryId, userId, reason || '', signerName);
      res.json(updated);
    } catch (error) {
      console.error("Error rejecting entry:", error);
      res.status(500).json({ message: "Failed to reject entry" });
    }
  });

  // Get all worklog links for the current unit (gets unitId from header)
  app.get('/api/hospitals/:hospitalId/worklog/links', isAuthenticated, async (req: any, res) => {
    try {
      const unitId = getActiveUnitIdFromRequest(req);
      if (!unitId) {
        return res.status(400).json({ message: "Unit ID required" });
      }
      const links = await storage.getWorklogLinksByUnit(unitId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching worklog links:", error);
      res.status(500).json({ message: "Failed to fetch links" });
    }
  });

  // Create a new worklog link (gets unitId from header)
  app.post('/api/hospitals/:hospitalId/worklog/links', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const unitId = getActiveUnitIdFromRequest(req);
      if (!unitId) {
        return res.status(400).json({ message: "Unit ID required" });
      }
      const { email, name, sendEmail = false } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Check if link already exists for this unit+email
      const existing = await storage.getExternalWorklogLinkByEmail(unitId, email);
      if (existing) {
        return res.status(409).json({ 
          message: "A link already exists for this email", 
          link: existing 
        });
      }
      
      const token = crypto.randomUUID();
      const link = await storage.createExternalWorklogLink({
        unitId,
        hospitalId,
        email,
        token,
        isActive: true,
      });
      
      if (sendEmail) {
        const { sendWorklogLinkEmail } = await import('./email');
        const unit = await storage.getUnit(unitId);
        const hospital = await storage.getHospital(hospitalId);
        
        if (unit && hospital) {
          await sendWorklogLinkEmail(email, token, unit.name, hospital.name);
        }
      }
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating worklog link:", error);
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  // Send worklog link email (authenticated)
  app.post('/api/hospitals/:hospitalId/worklog/links/:linkId/send', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, linkId } = req.params;
      const link = await storage.getExternalWorklogLink(linkId);
      
      if (!link) {
        return res.status(404).json({ message: "Link not found" });
      }
      
      const { sendWorklogLinkEmail } = await import('./email');
      const unit = await storage.getUnit(link.unitId);
      const hospital = await storage.getHospital(hospitalId);
      
      if (unit && hospital) {
        await sendWorklogLinkEmail(link.email, link.token, unit.name, hospital.name);
        res.json({ success: true, message: "Email sent" });
      } else {
        res.status(400).json({ message: "Unit or hospital not found" });
      }
    } catch (error) {
      console.error("Error sending worklog link:", error);
      res.status(500).json({ message: "Failed to send email" });
    }
  });

  // Delete worklog link (authenticated)
  app.delete('/api/hospitals/:hospitalId/worklog/links/:linkId', isAuthenticated, async (req: any, res) => {
    try {
      const { linkId } = req.params;
      await storage.deleteExternalWorklogLink(linkId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting worklog link:", error);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  // Generate a new worklog link for a unit+email (authenticated, admin/manager)
  app.post('/api/hospitals/:hospitalId/units/:unitId/worklog/links', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, unitId } = req.params;
      const { email, sendEmail = true } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }
      
      // Check if link already exists for this unit+email
      const existing = await storage.getExternalWorklogLinkByEmail(unitId, email);
      if (existing) {
        return res.status(409).json({ 
          message: "A link already exists for this email", 
          link: existing 
        });
      }
      
      const token = crypto.randomUUID();
      const link = await storage.createExternalWorklogLink({
        unitId,
        hospitalId,
        email,
        token,
        isActive: true,
      });
      
      if (sendEmail) {
        const { sendWorklogLinkEmail } = await import('./email');
        const unit = await storage.getUnit(unitId);
        const hospital = await storage.getHospital(hospitalId);
        
        if (unit && hospital) {
          await sendWorklogLinkEmail(email, token, unit.name, hospital.name);
        }
      }
      
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating worklog link:", error);
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  // Get all worklog links for a unit (authenticated)
  app.get('/api/hospitals/:hospitalId/units/:unitId/worklog/links', isAuthenticated, async (req: any, res) => {
    try {
      const { unitId } = req.params;
      const links = await storage.getWorklogLinksByUnit(unitId);
      res.json(links);
    } catch (error) {
      console.error("Error fetching worklog links:", error);
      res.status(500).json({ message: "Failed to fetch links" });
    }
  });

  // Get worklog entry for PDF generation (public with token validation)
  app.get('/api/worklog/:token/entries/:entryId', async (req, res) => {
    try {
      const { token, entryId } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link || !link.isActive) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      const entry = await storage.getExternalWorklogEntry(entryId);
      
      if (!entry || entry.linkId !== link.id) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      res.json({
        ...entry,
        hospitalName: link.hospital.name,
        unitName: link.unit.name,
      });
    } catch (error) {
      console.error("Error fetching entry:", error);
      res.status(500).json({ message: "Failed to fetch entry" });
    }
  });

  // Delete worklog entry (public with token validation, only pending entries)
  app.delete('/api/worklog/:token/entries/:entryId', async (req, res) => {
    try {
      const { token, entryId } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link || !link.isActive) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      const entry = await storage.getExternalWorklogEntry(entryId);
      
      if (!entry || entry.linkId !== link.id) {
        return res.status(404).json({ message: "Entry not found" });
      }
      
      if (entry.status !== "pending") {
        return res.status(400).json({ message: "Only pending entries can be deleted" });
      }
      
      await db.delete(externalWorklogEntries).where(eq(externalWorklogEntries.id, entryId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting entry:", error);
      res.status(500).json({ message: "Failed to delete entry" });
    }
  });

  // Get contracts linked to this worklog email
  app.get('/api/worklog/:token/contracts', async (req, res) => {
    try {
      const { token } = req.params;
      const link = await storage.getExternalWorklogLinkByToken(token);
      
      if (!link || !link.isActive) {
        return res.status(404).json({ message: "Invalid or expired link" });
      }
      
      const contracts = await db.select({
        id: workerContracts.id,
        firstName: workerContracts.firstName,
        lastName: workerContracts.lastName,
        email: workerContracts.email,
        role: workerContracts.role,
        status: workerContracts.status,
        workerSignedAt: workerContracts.workerSignedAt,
        managerSignedAt: workerContracts.managerSignedAt,
        archivedAt: workerContracts.archivedAt,
      })
        .from(workerContracts)
        .where(and(
          eq(workerContracts.email, link.email),
          eq(workerContracts.hospitalId, link.hospitalId)
        ))
        .orderBy(desc(workerContracts.createdAt));
      
      res.json(contracts);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  return httpServer;
}
