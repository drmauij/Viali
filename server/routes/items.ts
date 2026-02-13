import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { 
  insertItemCodeSchema,
  insertSupplierCodeSchema,
  insertLotSchema,
  items,
  itemCodes,
  stockLevels,
  hinArticles,
} from "@shared/schema";
import { z, ZodError } from "zod";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import OpenAI from "openai";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  checkLicenseLimit,
  requireWriteAccess,
  requireResourceAccess,
  getBulkImportImageLimit,
} from "../utils";
import logger from "../logger";

const router = Router();

// AI image analysis for item data extraction
router.post('/api/items/analyze-image', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const analyzeImageSchema = z.object({
      image: z.string(),
      hospitalId: z.string().optional(),
    });
    let parsedAnalyzeImage;
    try {
      parsedAnalyzeImage = analyzeImageSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { image } = parsedAnalyzeImage;

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    const hospitalId = parsedAnalyzeImage.hospitalId || req.headers['x-active-hospital-id'];
    
    const { analyzeItemImage } = await import('../openai');
    const extractedData = await analyzeItemImage(base64Image, hospitalId);
    
    res.json(extractedData);
  } catch (error: any) {
    logger.error("Error analyzing image:", error);
    res.status(500).json({ message: error.message || "Failed to analyze image" });
  }
});

// AI image analysis for extracting ONLY product codes (pharmacode, GTIN, EAN, supplier codes)
router.post('/api/items/analyze-codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const analyzeCodesSchema = z.object({
      image: z.string(),
      hospitalId: z.string().optional(),
    });
    let parsedAnalyzeCodes;
    try {
      parsedAnalyzeCodes = analyzeCodesSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { image } = parsedAnalyzeCodes;

    // Remove data URL prefix if present
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
    const hospitalId = parsedAnalyzeCodes.hospitalId || req.headers['x-active-hospital-id'];
    
    const { analyzeCodesImage } = await import('../openai');
    const extractedCodes = await analyzeCodesImage(base64Image, hospitalId);
    
    res.json(extractedCodes);
  } catch (error: any) {
    logger.error("Error analyzing codes image:", error);
    res.status(500).json({ message: error.message || "Failed to analyze codes image" });
  }
});

// Galexis product lookup by GTIN - fetches full product info including name, price, pharmacode
router.post('/api/items/galexis-lookup', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const galexisLookupSchema = z.object({
      gtin: z.string().optional(),
      pharmacode: z.string().optional(),
      hospitalId: z.string(),
      unitId: z.string().optional(),
      debug: z.boolean().optional(),
      skipExistingItem: z.boolean().optional(),
    }).refine(data => data.gtin || data.pharmacode, {
      message: "GTIN or Pharmacode is required",
    });
    let parsedGalexis;
    try {
      parsedGalexis = galexisLookupSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { gtin, pharmacode, hospitalId, unitId, debug, skipExistingItem } = parsedGalexis;

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
    
    if (!catalog || !catalog.customerNumber || !catalog.apiPassword) {
      // If Galexis not configured, try catalog database (uploaded product data)
      const catalogResult = await db
        .select()
        .from(hinArticles)
        .where(
          pharmacode 
            ? eq(hinArticles.pharmacode, pharmacode)
            : gtin ? eq(hinArticles.gtin, gtin) : sql`false`
        )
        .limit(1);
      
      if (catalogResult.length > 0) {
        const article = catalogResult[0];
        return res.json({
          found: true,
          source: 'catalog',
          gtin: article.gtin || gtin,
          pharmacode: article.pharmacode || pharmacode,
          name: article.descriptionDe,
          basispreis: article.pexf ? Number(article.pexf) : undefined,
          publikumspreis: article.ppub ? Number(article.ppub) : undefined,
          yourPrice: article.pexf ? Number(article.pexf) : undefined,
          discountPercent: 0,
          available: article.saleCode === 'A',
          availabilityMessage: article.saleCode === 'A' ? 'Available' : (article.saleCode === 'I' ? 'Inactive' : 'Unknown'),
          noGalexis: true,
          existingItem: existingItem || null,
        });
      }
      
      return res.json({ 
        found: false, 
        message: "Product not found in catalog database.",
        noIntegration: true,
        existingItem: existingItem || null,
      });
    }

    // Create Galexis client and lookup product
    const { createGalexisClient } = await import('../services/galexisClient');
    const client = createGalexisClient(catalog.customerNumber, catalog.apiPassword);
    
    // Build lookup request - prefer pharmacode if provided
    const lookupRequest = pharmacode ? { pharmacode } : { gtin };
    logger.info(`[Galexis Lookup] Testing lookup for:`, lookupRequest);
    
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
      // Galexis not found - try catalog database as fallback
      const catalogResult = await db
        .select()
        .from(hinArticles)
        .where(
          pharmacode
            ? eq(hinArticles.pharmacode, pharmacode)
            : gtin ? eq(hinArticles.gtin, gtin) : sql`false`
        )
        .limit(1);
      
      if (catalogResult.length > 0) {
        const article = catalogResult[0];
        const response: any = {
          found: true,
          source: 'catalog',
          gtin: article.gtin || gtin,
          pharmacode: article.pharmacode || pharmacode,
          name: article.descriptionDe,
          basispreis: article.pexf ? Number(article.pexf) : undefined,
          publikumspreis: article.ppub ? Number(article.ppub) : undefined,
          yourPrice: article.pexf ? Number(article.pexf) : undefined,
          discountPercent: 0,
          available: article.saleCode === 'A',
          availabilityMessage: article.saleCode === 'A' ? 'Available' : (article.saleCode === 'I' ? 'Inactive' : 'Unknown'),
          existingItem: existingItem || null,
        };
        
        if (debug) {
          response.debugInfo = { source: 'catalog', galexisDebugInfo: debugInfo };
        }
        
        res.json(response);
      } else {
        const response: any = {
          found: false,
          message: results[0]?.error || "Product not found in Galexis or catalog database",
          gtin,
          pharmacode,
          existingItem: existingItem || null,
        };
        
        if (debug) {
          response.debugInfo = debugInfo;
          response.rawResult = results[0];
        }
        
        res.json(response);
      }
    }
  } catch (error: any) {
    logger.error("Error looking up product in Galexis:", error);
    res.status(500).json({ message: error.message || "Failed to lookup product in Galexis" });
  }
});

// Bulk AI image analysis for multiple items
router.post('/api/items/analyze-images', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    // Set a longer timeout for this endpoint (5 minutes)
    req.setTimeout(300000); // 5 minutes in milliseconds
    res.setTimeout(300000);

    const analyzeImagesSchema = z.object({
      images: z.array(z.string()).min(1, "Images array is required"),
      hospitalId: z.string(),
    });
    let parsedAnalyzeImages;
    try {
      parsedAnalyzeImages = analyzeImagesSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { images, hospitalId } = parsedAnalyzeImages;

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
    
    logger.info(`[Bulk Import] Starting analysis of ${base64Images.length} images for hospital ${hospitalId}`);
    
    const { analyzeBulkItemImages } = await import('../openai');
    const extractedItems = await analyzeBulkItemImages(base64Images, undefined, hospitalId);
    
    logger.info(`[Bulk Import] Completed analysis, extracted ${extractedItems.length} items`);
    
    res.json({ items: extractedItems });
  } catch (error: any) {
    logger.error("Error analyzing bulk images:", error);
    
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
router.post('/api/items/analyze-bulk-codes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    req.setTimeout(300000);
    res.setTimeout(300000);

    const bulkCodesSchema = z.object({
      images: z.array(z.string()).min(1, "Images array is required"),
      hospitalId: z.string(),
    });
    let parsedBulkCodes;
    try {
      parsedBulkCodes = bulkCodesSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { images, hospitalId } = parsedBulkCodes;

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
      const { createGalexisClient } = await import('../services/galexisClient');
      galexisClient = createGalexisClient(catalog.customerNumber, catalog.apiPassword);
    }

    const { analyzeCodesImage } = await import('../openai');
    const results: any[] = [];

    logger.info(`[Bulk Codes Import] Starting analysis of ${images.length} barcode images for hospital ${hospitalId}`);

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
            logger.error(`[Bulk Codes Import] Galexis lookup failed for GTIN ${gtin}:`, lookupError.message);
          }
        }

        results.push(item);
      } catch (imageError: any) {
        logger.error(`[Bulk Codes Import] Failed to analyze image ${i}:`, imageError.message);
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

    logger.info(`[Bulk Codes Import] Completed analysis, processed ${results.length} images, ${results.filter(r => r.galexisFound).length} found in Galexis`);
    
    res.json({ items: results });
  } catch (error: any) {
    logger.error("Error analyzing bulk codes:", error);
    res.status(500).json({ message: error.message || "Failed to analyze barcode images" });
  }
});

// Bulk item creation
router.post('/api/items/bulk', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { items: bulkItems, hospitalId, unitId: requestedUnitId } = req.body;
    const userId = req.user.id;
    const activeUnitId = getActiveUnitIdFromRequest(req);
    
    logger.info('[BULK] Received', bulkItems?.length, 'items for bulk creation');
    if (bulkItems && bulkItems.length > 0) {
      const sample = bulkItems[0];
      logger.info('[BULK] Sample item fields:', Object.keys(sample));
      logger.info('[BULK] Sample item:', {
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
            logger.warn(`[BULK] Failed to create item codes for item ${item.id}:`, codeError);
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
            logger.warn(`[BULK] Failed to create supplier code for item ${item.id}:`, supplierError);
          }
        }
      }
      
      createdItems.push(item);
    }
    
    res.status(201).json({ items: createdItems });
  } catch (error: any) {
    logger.error("Error creating bulk items:", error);
    res.status(500).json({ message: error.message || "Failed to create items" });
  }
});

// Export items catalog to CSV  
router.get('/api/items/export-csv', isAuthenticated, async (req: any, res) => {
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
    const itemsList = await storage.getItems(hospitalId, unitId);
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
    const rows = itemsList.map(item => {
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
    logger.error("Error exporting items:", error);
    res.status(500).json({ message: error.message || "Failed to export items" });
  }
});

// ==================== Item Codes Routes ====================

// Get item codes (universal identifiers) for an item
router.get('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const code = await storage.getItemCode(itemId);
    logger.info(`[ItemCodes] Fetched codes for item ${itemId}:`, code ? 'found' : 'not found');
    res.json(code || null);
  } catch (error: any) {
    logger.error("Error fetching item codes:", error);
    res.status(500).json({ message: error.message || "Failed to fetch item codes" });
  }
});

// Create or update item codes
router.put('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
  try {
    const { itemId } = req.params;
    // Strip out any extra fields (id, itemId, createdAt, updatedAt) that may come from client
    const { id, itemId: bodyItemId, createdAt, updatedAt, ...codeFields } = req.body;
    logger.info(`[ItemCodes] Updating codes for item ${itemId}:`, JSON.stringify(codeFields));
    const validatedData = insertItemCodeSchema.omit({ itemId: true }).parse(codeFields);
    const code = await storage.updateItemCode(itemId, validatedData);
    logger.info(`[ItemCodes] Successfully updated codes for item ${itemId}`);
    res.json(code);
  } catch (error: any) {
    logger.error("Error updating item codes:", error);
    logger.error("Request body was:", JSON.stringify(req.body));
    res.status(500).json({ message: error.message || "Failed to update item codes" });
  }
});

// Delete item codes
router.delete('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
  try {
    const { itemId } = req.params;
    await storage.deleteItemCode(itemId);
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting item codes:", error);
    res.status(500).json({ message: error.message || "Failed to delete item codes" });
  }
});

// ==================== Supplier Codes Routes ====================

// Get supplier codes for an item
router.get('/api/items/:itemId/suppliers', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const codes = await storage.getSupplierCodes(itemId);
    res.json(codes);
  } catch (error: any) {
    logger.error("Error fetching supplier codes:", error);
    res.status(500).json({ message: error.message || "Failed to fetch supplier codes" });
  }
});

// Add a supplier code
router.post('/api/items/:itemId/suppliers', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error creating supplier code:", error);
    res.status(500).json({ message: error.message || "Failed to create supplier code" });
  }
});

// Update a supplier code
router.put('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error updating supplier code:", error);
    res.status(500).json({ message: error.message || "Failed to update supplier code" });
  }
});

// Delete a supplier code
router.delete('/api/items/:itemId/suppliers/:supplierId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error deleting supplier code:", error);
    res.status(500).json({ message: error.message || "Failed to delete supplier code" });
  }
});

// Set preferred supplier
router.post('/api/items/:itemId/suppliers/:supplierId/set-preferred', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error setting preferred supplier:", error);
    res.status(500).json({ message: error.message || "Failed to set preferred supplier" });
  }
});

// ==================== Lot Routes ====================

// Get lots for an item
router.get('/api/items/:itemId/lots', isAuthenticated, requireResourceAccess('itemId'), async (req: any, res) => {
  try {
    const { itemId } = req.params;
    const itemLots = await storage.getLots(itemId);
    res.json(itemLots);
  } catch (error: any) {
    logger.error("Error fetching lots:", error);
    res.status(500).json({ message: error.message || "Failed to fetch lots" });
  }
});

// Add a lot
router.post('/api/items/:itemId/lots', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error creating lot:", error);
    res.status(500).json({ message: error.message || "Failed to create lot" });
  }
});

// Update a lot
router.put('/api/items/:itemId/lots/:lotId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error updating lot:", error);
    res.status(500).json({ message: error.message || "Failed to update lot" });
  }
});

// Delete a lot
router.delete('/api/items/:itemId/lots/:lotId', isAuthenticated, requireResourceAccess('itemId', true), async (req: any, res) => {
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
    logger.error("Error deleting lot:", error);
    res.status(500).json({ message: error.message || "Failed to delete lot" });
  }
});

// Barcode scanning
router.post('/api/scan/barcode', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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
    logger.error("Error scanning barcode:", error);
    res.status(500).json({ message: "Failed to scan barcode" });
  }
});

// External barcode lookup
router.post('/api/scan/lookup', isAuthenticated, requireWriteAccess, async (req, res) => {
  try {
    const { barcode } = req.body;
    if (!barcode) {
      return res.status(400).json({ message: "Barcode is required" });
    }

    const apiKey = process.env.EAN_SEARCH_API_KEY;
    if (!apiKey) {
      logger.error("EAN_SEARCH_API_KEY not configured");
      return res.status(503).json({ message: "External lookup service not configured" });
    }

    const url = `https://api.ean-search.org/api?token=${apiKey}&op=barcode-lookup&format=json&ean=${barcode}`;
    logger.info(`[External Lookup] Calling EAN-Search API for barcode: ${barcode}`);
    
    const response = await fetch(url);
    logger.info(`[External Lookup] API response status: ${response.status}`);
    
    if (!response.ok) {
      logger.error(`[External Lookup] API returned ${response.status}: ${response.statusText}`);
      return res.status(404).json({ message: "Product not found in external database" });
    }

    const data = await response.json();
    logger.info(`[External Lookup] API response data:`, JSON.stringify(data));
    
    // Check for API errors
    if (data.error) {
      logger.error(`[External Lookup] API error: ${data.error}`);
      return res.status(404).json({ message: data.error || "Product not found in external database" });
    }

    // EAN-Search returns { result: [...] }
    if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
      logger.error(`[External Lookup] No results found in API response`);
      return res.status(404).json({ message: "Product not found in external database" });
    }

    const product = data.result[0];
    logger.info(`[External Lookup] Found product:`, product.name);
    
    res.json({
      name: product.name || '',
      manufacturer: product.issuing_country || product.brand || '',
      category: product.category || '',
      barcode: barcode,
      found: true,
    });
  } catch (error) {
    logger.error("[External Lookup] Error:", error);
    res.status(500).json({ message: "Failed to lookup barcode" });
  }
});

// Stock operations
router.post('/api/stock/update', isAuthenticated, requireWriteAccess, async (req: any, res) => {
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
    logger.error("Error updating stock:", error);
    res.status(500).json({ message: "Failed to update stock" });
  }
});

export default router;
