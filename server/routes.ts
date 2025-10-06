import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertItemSchema, insertFolderSchema, insertActivitySchema, orderLines, items, stockLevels, orders, users } from "@shared/schema";
import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";

async function getUserLocationForHospital(userId: string, hospitalId: string): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  const hospital = hospitals.find(h => h.id === hospitalId);
  return hospital?.locationId || null;
}

function getLicenseLimit(licenseType: string): number {
  switch (licenseType) {
    case "free":
      return 10;
    case "basic":
      return 100;
    default:
      return 10;
  }
}

async function checkLicenseLimit(hospitalId: string): Promise<{ allowed: boolean; currentCount: number; limit: number; licenseType: string }> {
  const hospital = await storage.getHospital(hospitalId);
  if (!hospital) {
    throw new Error("Hospital not found");
  }
  
  const licenseType = hospital.licenseType || "free";
  const limit = getLicenseLimit(licenseType);
  
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.hospitalId, hospitalId));
  
  const currentCount = result?.count || 0;
  
  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
    licenseType,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Email/Password Signup Route (before auth required)
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, firstName, lastName, hospitalName } = req.body;

      // Validate input
      if (!email || !password || !firstName || !lastName || !hospitalName) {
        return res.status(400).json({ 
          message: "Email, password, first name, last name, and hospital name are required" 
        });
      }

      // Check if user already exists
      const existingUser = await storage.searchUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }

      // Create user
      const user = await storage.createUserWithPassword(email, password, firstName, lastName);

      // Create hospital
      const hospital = await storage.createHospital(hospitalName);

      // Create 4 default locations
      const anesthesyLocation = await storage.createLocation({
        hospitalId: hospital.id,
        name: "Anesthesy",
        type: "anesthesy",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Operating Room (OR)",
        type: "or",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Emergency Room (ER)",
        type: "er",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Intensive Care Unit (ICU)",
        type: "icu",
        parentId: null,
      });

      // Assign user as admin to the first location (Anesthesy)
      await storage.createUserHospitalRole({
        userId: user.id,
        hospitalId: hospital.id,
        locationId: anesthesyLocation.id,
        role: "admin",
      });

      // Log the user in by creating a session
      req.login({ 
        claims: { 
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          profile_image_url: user.profileImageUrl
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 1 week
      }, (err) => {
        if (err) {
          console.error("Error logging in user:", err);
          return res.status(500).json({ message: "Account created but login failed" });
        }
        res.status(201).json({ 
          message: "Account created successfully",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          },
          hospital
        });
      });
    } catch (error: any) {
      console.error("Error during signup:", error);
      res.status(500).json({ message: error.message || "Failed to create account" });
    }
  });

  // Email/Password Login Route
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user
      const user = await storage.searchUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Log the user in
      req.login({
        claims: {
          sub: user.id,
          email: user.email,
          first_name: user.firstName,
          last_name: user.lastName,
          profile_image_url: user.profileImageUrl
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 1 week
        mustChangePassword: user.mustChangePassword
      }, (err) => {
        if (err) {
          console.error("Error logging in user:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json({ 
          message: "Login successful",
          mustChangePassword: user.mustChangePassword,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          }
        });
      });
    } catch (error: any) {
      console.error("Error during login:", error);
      res.status(500).json({ message: error.message || "Login failed" });
    }
  });

  // Change own password route
  app.post('/api/auth/change-password', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ message: "User does not have a password set" });
      }

      // Verify current password
      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      // Update password and clear mustChangePassword flag
      await storage.updateUserPassword(userId, newPassword);
      await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));

      // Update session
      req.user.mustChangePassword = false;

      res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: error.message || "Failed to change password" });
    }
  });

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get user hospitals
      const hospitals = await storage.getUserHospitals(userId);
      
      // Sanitize user object - remove passwordHash
      const { passwordHash, ...sanitizedUser } = user;
      
      res.json({
        ...sanitizedUser,
        hospitals,
        mustChangePassword: user.mustChangePassword || false,
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post('/api/signup', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { hospitalName } = req.body;

      if (!hospitalName) {
        return res.status(400).json({ message: "Hospital name is required" });
      }

      // Create new hospital
      const hospital = await storage.createHospital(hospitalName);

      // Create 4 default locations
      const anesthesyLocation = await storage.createLocation({
        hospitalId: hospital.id,
        name: "Anesthesy",
        type: "anesthesy",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Operating Room (OR)",
        type: "or",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Emergency Room (ER)",
        type: "er",
        parentId: null,
      });
      
      await storage.createLocation({
        hospitalId: hospital.id,
        name: "Intensive Care Unit (ICU)",
        type: "icu",
        parentId: null,
      });

      // Assign user as admin to the first location (Anesthesy)
      await storage.createUserHospitalRole({
        userId,
        hospitalId: hospital.id,
        locationId: anesthesyLocation.id,
        role: "admin",
      });

      res.status(201).json({ 
        message: "Hospital created successfully",
        hospital,
      });
    } catch (error) {
      console.error("Error during signup:", error);
      res.status(500).json({ message: "Failed to create hospital" });
    }
  });

  // Dashboard KPIs
  app.get('/api/dashboard/kpis/:hospitalId', isAuthenticated, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const kpis = await storage.getDashboardKPIs(hospitalId);
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching KPIs:", error);
      res.status(500).json({ message: "Failed to fetch KPIs" });
    }
  });

  // Folder routes
  app.get('/api/folders/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const folders = await storage.getFolders(hospitalId, locationId);
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.post('/api/folders', isAuthenticated, async (req: any, res) => {
    try {
      const folderData = insertFolderSchema.parse(req.body);
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, folderData.hospitalId);
      if (!locationId || locationId !== folderData.locationId) {
        return res.status(403).json({ message: "Access denied to this hospital/location" });
      }
      
      const folder = await storage.createFolder(folderData);
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.patch('/api/folders/:folderId', isAuthenticated, async (req: any, res) => {
    try {
      const { folderId } = req.params;
      const updates = req.body;
      const userId = req.user.claims.sub;
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const locationId = await getUserLocationForHospital(userId, folder.hospitalId);
      if (!locationId || locationId !== folder.locationId) {
        return res.status(403).json({ message: "Access denied to this folder" });
      }
      
      const updated = await storage.updateFolder(folderId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating folder:", error);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  app.delete('/api/folders/:folderId', isAuthenticated, async (req: any, res) => {
    try {
      const { folderId } = req.params;
      const userId = req.user.claims.sub;
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      const locationId = await getUserLocationForHospital(userId, folder.hospitalId);
      if (!locationId || locationId !== folder.locationId) {
        return res.status(403).json({ message: "Access denied to this folder" });
      }
      
      await storage.deleteFolder(folderId);
      res.json({ message: "Folder deleted successfully" });
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // Items routes
  app.get('/api/items/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { critical, controlled, belowMin, expiring } = req.query;
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const filters = {
        critical: critical === 'true',
        controlled: controlled === 'true',
        belowMin: belowMin === 'true',
        expiring: expiring === 'true',
      };
      
      // Only apply filters if they are explicitly true
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value)
      );
      
      const items = await storage.getItems(hospitalId, locationId, Object.keys(activeFilters).length > 0 ? activeFilters : undefined);
      res.json(items);
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  app.get('/api/items/detail/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.claims.sub;
      
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's location
      const locationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!locationId || locationId !== item.locationId) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
      
      const lots = await storage.getLots(itemId);
      res.json({ ...item, lots });
    } catch (error) {
      console.error("Error fetching item:", error);
      res.status(500).json({ message: "Failed to fetch item" });
    }
  });

  app.post('/api/items', isAuthenticated, async (req: any, res) => {
    try {
      const itemData = insertItemSchema.parse(req.body);
      
      // Check license limit
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
      
      // Validate controlled ampulle items have pack size
      if (itemData.controlled && itemData.unit === "ampulle") {
        if (!itemData.packSize || itemData.packSize <= 0) {
          return res.status(400).json({ 
            message: "Controlled items with 'ampulle' unit type must have a pack size greater than 0" 
          });
        }
      }
      
      const item = await storage.createItem(itemData);
      
      // If initialStock is provided, create stock level
      if (req.body.initialStock !== undefined && req.body.initialStock > 0) {
        await storage.updateStockLevel(item.id, item.locationId, req.body.initialStock);
      }
      
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating item:", error);
      res.status(500).json({ message: "Failed to create item" });
    }
  });

  // Bulk item update (must be before :itemId route to avoid conflict)
  app.patch('/api/items/bulk-update', isAuthenticated, async (req: any, res) => {
    try {
      const { items: bulkItems } = req.body;
      const userId = req.user.claims.sub;
      
      if (!bulkItems || !Array.isArray(bulkItems) || bulkItems.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      const updatedItems = [];
      for (const bulkItem of bulkItems) {
        if (!bulkItem.id) {
          continue;
        }

        // Get the item to verify access
        const item = await storage.getItem(bulkItem.id);
        if (!item) {
          continue;
        }
        
        // Verify user has access to this item's location
        const locationId = await getUserLocationForHospital(userId, item.hospitalId);
        if (!locationId || locationId !== item.locationId) {
          continue;
        }

        const updates: any = {};
        if (bulkItem.minThreshold !== undefined) updates.minThreshold = bulkItem.minThreshold;
        if (bulkItem.maxThreshold !== undefined) updates.maxThreshold = bulkItem.maxThreshold;
        if (bulkItem.name !== undefined) updates.name = bulkItem.name;
        if (bulkItem.unit !== undefined) updates.unit = bulkItem.unit;
        if (bulkItem.packSize !== undefined) updates.packSize = bulkItem.packSize;
        if (bulkItem.controlled !== undefined) updates.controlled = bulkItem.controlled;
        
        // Validate controlled ampulle items have pack size
        const finalControlled = bulkItem.controlled !== undefined ? bulkItem.controlled : item.controlled;
        const finalUnit = bulkItem.unit !== undefined ? bulkItem.unit : item.unit;
        const finalPackSize = bulkItem.packSize !== undefined ? bulkItem.packSize : item.packSize;
        
        if (finalControlled && finalUnit === "ampulle") {
          if (!finalPackSize || finalPackSize <= 0) {
            return res.status(400).json({ 
              message: `Item "${item.name}" is controlled with 'ampulle' unit type and must have a pack size greater than 0` 
            });
          }
        }
        
        // Update item fields
        if (Object.keys(updates).length > 0) {
          await storage.updateItem(bulkItem.id, updates);
        }
        
        // Update stock level if provided
        if (bulkItem.actualStock !== undefined) {
          await storage.updateStockLevel(bulkItem.id, item.locationId, bulkItem.actualStock);
        }
        
        updatedItems.push({ id: bulkItem.id, ...updates });
      }
      
      res.json({ items: updatedItems });
    } catch (error: any) {
      console.error("Error updating bulk items:", error);
      res.status(500).json({ message: error.message || "Failed to update items" });
    }
  });

  app.patch('/api/items/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the item to verify access
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's location
      const locationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!locationId || locationId !== item.locationId) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
      
      // Validate controlled ampulle items have pack size
      // Check final state (req.body value or existing item value if not provided)
      const finalControlled = req.body.controlled !== undefined ? req.body.controlled : item.controlled;
      const finalUnit = req.body.unit !== undefined ? req.body.unit : item.unit;
      const finalPackSize = req.body.packSize !== undefined ? req.body.packSize : item.packSize;
      
      if (finalControlled && finalUnit === "ampulle") {
        if (!finalPackSize || finalPackSize <= 0) {
          return res.status(400).json({ 
            message: "Controlled items with 'ampulle' unit type must have a pack size greater than 0" 
          });
        }
      }
      
      // Update the item
      const updates = {
        name: req.body.name,
        description: req.body.description,
        unit: req.body.unit,
        barcodes: req.body.barcodes,
        minThreshold: req.body.minThreshold,
        maxThreshold: req.body.maxThreshold,
        defaultOrderQty: req.body.defaultOrderQty,
        packSize: req.body.packSize,
        critical: req.body.critical,
        controlled: req.body.controlled,
        folderId: req.body.folderId !== undefined ? req.body.folderId : undefined,
      };
      
      const updatedItem = await storage.updateItem(itemId, updates);
      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating item:", error);
      res.status(500).json({ message: "Failed to update item" });
    }
  });

  app.delete('/api/items/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the item to verify access
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's location
      const locationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!locationId || locationId !== item.locationId) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
      
      // Delete the item
      await storage.deleteItem(itemId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting item:", error);
      res.status(500).json({ message: "Failed to delete item" });
    }
  });
  
  // AI image analysis for item data extraction
  app.post('/api/items/analyze-image', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/items/analyze-images', isAuthenticated, async (req: any, res) => {
    try {
      const { images } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }

      if (images.length > 10) {
        return res.status(400).json({ message: "Maximum 10 images allowed per batch" });
      }

      // Remove data URL prefix if present
      const base64Images = images.map((img: string) => img.replace(/^data:image\/\w+;base64,/, ''));
      
      const { analyzeBulkItemImages } = await import('./openai');
      const extractedItems = await analyzeBulkItemImages(base64Images);
      
      res.json({ items: extractedItems });
    } catch (error: any) {
      console.error("Error analyzing bulk images:", error);
      res.status(500).json({ message: error.message || "Failed to analyze images" });
    }
  });

  // Bulk item creation
  app.post('/api/items/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const { items: bulkItems, hospitalId } = req.body;
      const userId = req.user.claims.sub;
      
      if (!bulkItems || !Array.isArray(bulkItems) || bulkItems.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
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

      const createdItems = [];
      for (const bulkItem of bulkItems) {
        const itemData = {
          hospitalId,
          locationId,
          name: bulkItem.name,
          description: bulkItem.description || "",
          unit: bulkItem.unit || "pack",
          packSize: bulkItem.packSize || 1,
          minThreshold: bulkItem.minThreshold || 0,
          maxThreshold: bulkItem.maxThreshold || 0,
          defaultOrderQty: 0,
          critical: bulkItem.critical || false,
          controlled: bulkItem.controlled || false,
        };

        const item = await storage.createItem(itemData);
        
        // Set initial stock if provided
        if (bulkItem.initialStock !== undefined && bulkItem.initialStock > 0) {
          await storage.updateStockLevel(item.id, locationId, bulkItem.initialStock);
        }
        
        createdItems.push(item);
      }
      
      res.status(201).json({ items: createdItems });
    } catch (error: any) {
      console.error("Error creating bulk items:", error);
      res.status(500).json({ message: error.message || "Failed to create items" });
    }
  });

  // Barcode scanning
  app.post('/api/scan/barcode', isAuthenticated, async (req: any, res) => {
    try {
      const { barcode, hospitalId } = req.body;
      if (!barcode || !hospitalId) {
        return res.status(400).json({ message: "Barcode and hospitalId are required" });
      }
      
      const userId = req.user.claims.sub;
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const item = await storage.findItemByBarcode(barcode, hospitalId, locationId);
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
  app.post('/api/scan/lookup', isAuthenticated, async (req, res) => {
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
  app.post('/api/stock/update', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId, qty, delta, notes } = req.body;
      const userId = req.user.claims.sub;
      
      if (!itemId || qty === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get the item to find its hospital and location
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Get user's locationId for this hospital
      const locationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Verify item belongs to user's location
      if (item.locationId !== locationId) {
        return res.status(403).json({ message: "Access denied to this item's location" });
      }
      
      // Update stock level
      const stockLevel = await storage.updateStockLevel(itemId, locationId, qty);
      
      // Create activity log
      await storage.createActivity({
        userId,
        action: 'count',
        itemId,
        locationId,
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
  app.get('/api/orders/:hospitalId', isAuthenticated, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { status } = req.query;
      
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
      const userId = req.user.claims.sub;
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
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

  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, vendorId, orderLines: lines } = req.body;
      const userId = req.user.claims.sub;
      
      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      const order = await storage.createOrder({
        hospitalId,
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

  app.post('/api/orders/quick-add', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, itemId, vendorId, qty, packSize } = req.body;
      const userId = req.user.claims.sub;
      
      if (!hospitalId || !itemId) {
        return res.status(400).json({ message: "Hospital ID and Item ID are required" });
      }

      const order = await storage.findOrCreateDraftOrder(hospitalId, vendorId || null, userId);
      const orderLine = await storage.addItemToOrder(order.id, itemId, qty || 1, packSize || 1);

      res.json({ order, orderLine });
    } catch (error) {
      console.error("Error adding item to order:", error);
      res.status(500).json({ message: "Failed to add item to order" });
    }
  });

  app.post('/api/orders/:orderId/status', isAuthenticated, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      // If marking as received, update stock levels
      if (status === 'received') {
        // Get order lines with item details
        const lines = await db
          .select({
            id: orderLines.id,
            orderId: orderLines.orderId,
            itemId: orderLines.itemId,
            qty: orderLines.qty,
            packSize: orderLines.packSize,
            item: items,
          })
          .from(orderLines)
          .innerJoin(items, eq(orderLines.itemId, items.id))
          .where(eq(orderLines.orderId, orderId));
        
        // Update stock for each item
        for (const line of lines) {
          const item = line.item;
          const normalizedUnit = item.unit.toLowerCase();
          const isControlledAmpulle = item.controlled && normalizedUnit === 'ampulle';
          
          // Calculate quantity to add to stock
          let qtyToAdd = line.qty;
          if (isControlledAmpulle) {
            // For controlled ampulle items: pack quantity × pack size
            qtyToAdd = line.qty * (line.packSize || 1);
          }
          
          // Get current stock level
          const [currentStock] = await db
            .select()
            .from(stockLevels)
            .where(
              and(
                eq(stockLevels.itemId, item.id),
                eq(stockLevels.locationId, item.locationId)
              )
            );
          
          const currentQty = currentStock?.qtyOnHand || 0;
          const newQty = currentQty + qtyToAdd;
          
          // Update stock level
          await storage.updateStockLevel(item.id, item.locationId, newQty);
        }
      }
      
      const order = await storage.updateOrderStatus(orderId, status);
      res.json(order);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  app.patch('/api/order-lines/:lineId', isAuthenticated, async (req, res) => {
    try {
      const { lineId } = req.params;
      const { qty } = req.body;
      
      if (!qty || qty < 1) {
        return res.status(400).json({ message: "Valid quantity is required" });
      }
      
      const orderLine = await storage.updateOrderLine(lineId, qty);
      res.json(orderLine);
    } catch (error) {
      console.error("Error updating order line:", error);
      res.status(500).json({ message: "Failed to update order line" });
    }
  });

  app.delete('/api/order-lines/:lineId', isAuthenticated, async (req, res) => {
    try {
      const { lineId } = req.params;
      await storage.removeOrderLine(lineId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing order line:", error);
      res.status(500).json({ message: "Failed to remove order line" });
    }
  });

  app.delete('/api/orders/:orderId', isAuthenticated, async (req, res) => {
    try {
      const { orderId } = req.params;
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
  app.post('/api/controlled/dispense', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { items, patientId, patientPhoto, notes, signatures } = req.body;
      
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }
      
      if (!patientId) {
        return res.status(400).json({ message: "Patient ID is required for controlled substances" });
      }
      
      // Create activity for each dispensed item and update stock
      const activities = await Promise.all(
        items.map(async (item: any) => {
          // Get the item to find its hospital and location
          const itemData = await storage.getItem(item.itemId);
          if (!itemData) {
            throw new Error(`Item ${item.itemId} not found`);
          }
          
          // Get user's locationId for this hospital
          const locationId = await getUserLocationForHospital(userId, itemData.hospitalId);
          if (!locationId) {
            throw new Error("Access denied to this hospital");
          }
          
          // Verify item belongs to user's location
          if (itemData.locationId !== locationId) {
            throw new Error(`Access denied to item ${item.itemId}'s location`);
          }
          
          // Get current stock level
          const currentStock = await storage.getStockLevel(item.itemId, locationId);
          const currentQty = currentStock?.qtyOnHand || 0;
          const newQty = Math.max(0, currentQty - item.qty);
          
          // Update stock level
          await storage.updateStockLevel(item.itemId, locationId, newQty);
          
          return await storage.createActivity({
            userId,
            action: 'dispense',
            itemId: item.itemId,
            locationId,
            delta: -item.qty, // Negative for dispensing
            notes,
            patientId,
            patientPhoto,
            signatures,
            controlledVerified: signatures && signatures.length >= 2,
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

  app.get('/api/controlled/log/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const activities = await storage.getActivities({
        hospitalId,
        locationId,
        controlled: true,
        limit: 50,
      });
      res.json(activities);
    } catch (error) {
      console.error("Error fetching controlled log:", error);
      res.status(500).json({ message: "Failed to fetch controlled log" });
    }
  });

  app.post('/api/controlled/checks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { hospitalId, locationId, signature, checkItems, notes } = req.body;
      
      if (!hospitalId || !locationId || !signature || !checkItems) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const userLocationId = await getUserLocationForHospital(userId, hospitalId);
      if (!userLocationId || userLocationId !== locationId) {
        return res.status(403).json({ message: "Access denied to this location" });
      }
      
      const allMatch = checkItems.every((item: any) => item.match);
      
      const check = await storage.createControlledCheck({
        hospitalId,
        locationId,
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
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const checks = await storage.getControlledChecks(hospitalId, locationId);
      res.json(checks);
    } catch (error) {
      console.error("Error fetching controlled checks:", error);
      res.status(500).json({ message: "Failed to fetch controlled checks" });
    }
  });

  app.post('/api/controlled/verify/:activityId', isAuthenticated, async (req: any, res) => {
    try {
      const { activityId } = req.params;
      const { signature } = req.body;
      const userId = req.user.claims.sub;
      
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
      
      // Verify user has access to this hospital/location
      const userLocationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!userLocationId || userLocationId !== item.locationId) {
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
  app.get('/api/alerts/:hospitalId', isAuthenticated, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { acknowledged } = req.query;
      
      const acknowledgedBool = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;
      const alerts = await storage.getAlerts(hospitalId, acknowledgedBool);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.post('/api/alerts/:alertId/acknowledge', isAuthenticated, async (req: any, res) => {
    try {
      const { alertId } = req.params;
      const userId = req.user.claims.sub;
      
      const alert = await storage.acknowledgeAlert(alertId, userId);
      res.json(alert);
    } catch (error) {
      console.error("Error acknowledging alert:", error);
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  app.post('/api/alerts/:alertId/snooze', isAuthenticated, async (req, res) => {
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
      const userId = req.user.claims.sub;
      
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const activities = await storage.getActivities({
        hospitalId,
        locationId,
        limit: 10,
      });
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  // Admin middleware - check if user has admin role
  async function isAdmin(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.user.claims.sub;
      const { hospitalId } = req.params;
      
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      next();
    } catch (error) {
      console.error("Error checking admin:", error);
      res.status(500).json({ message: "Failed to verify admin access" });
    }
  }

  // Admin - Hospital routes
  app.patch('/api/admin/:hospitalId', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Hospital name is required" });
      }

      const updated = await storage.updateHospital(hospitalId, { name });
      res.json(updated);
    } catch (error) {
      console.error("Error updating hospital:", error);
      res.status(500).json({ message: "Failed to update hospital" });
    }
  });

  // Admin - Location routes
  app.get('/api/admin/:hospitalId/locations', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const locations = await storage.getLocations(hospitalId);
      res.json(locations);
    } catch (error) {
      console.error("Error fetching locations:", error);
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post('/api/admin/:hospitalId/locations', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { name, type, parentId } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Location name is required" });
      }
      
      const location = await storage.createLocation({
        hospitalId,
        name,
        type: type || null,
        parentId: parentId || null,
      });
      res.status(201).json(location);
    } catch (error) {
      console.error("Error creating location:", error);
      res.status(500).json({ message: "Failed to create location" });
    }
  });

  app.patch('/api/admin/locations/:locationId', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      const { name, type, parentId } = req.body;
      
      // Get location to verify hospital access
      const locations = await storage.getLocations(req.body.hospitalId);
      const location = locations.find(l => l.id === locationId);
      if (!location) {
        return res.status(404).json({ message: "Location not found" });
      }
      
      // Check admin access
      const userId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === location.hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (type !== undefined) updates.type = type;
      if (parentId !== undefined) updates.parentId = parentId;
      
      const updated = await storage.updateLocation(locationId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating location:", error);
      res.status(500).json({ message: "Failed to update location" });
    }
  });

  app.delete('/api/admin/locations/:locationId', isAuthenticated, async (req: any, res) => {
    try {
      const { locationId } = req.params;
      const { hospitalId } = req.query;
      
      // Check admin access
      const userId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteLocation(locationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting location:", error);
      res.status(500).json({ message: "Failed to delete location" });
    }
  });

  // Admin - User management routes
  app.get('/api/admin/:hospitalId/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const users = await storage.getHospitalUsers(hospitalId);
      
      // Sanitize user objects - remove passwordHash from all users
      const sanitizedUsers = users.map(u => ({
        ...u,
        user: {
          id: u.user.id,
          email: u.user.email,
          firstName: u.user.firstName,
          lastName: u.user.lastName,
          profileImageUrl: u.user.profileImageUrl,
          createdAt: u.user.createdAt,
          updatedAt: u.user.updatedAt,
        }
      }));
      
      res.json(sanitizedUsers);
    } catch (error) {
      console.error("Error fetching hospital users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get('/api/admin/users/search', isAuthenticated, async (req: any, res) => {
    try {
      const { email } = req.query;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email parameter is required" });
      }
      
      // Check if user is admin of at least one hospital
      const userId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(userId);
      const isAdmin = hospitals.some(h => h.role === 'admin');
      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const user = await storage.searchUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Sanitize user object - remove passwordHash
      const { passwordHash, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error) {
      console.error("Error searching user:", error);
      res.status(500).json({ message: "Failed to search user" });
    }
  });

  app.post('/api/admin/:hospitalId/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { userId, locationId, role } = req.body;
      
      if (!userId || !locationId || !role) {
        return res.status(400).json({ message: "userId, locationId, and role are required" });
      }
      
      const userRole = await storage.createUserHospitalRole({
        userId,
        hospitalId,
        locationId,
        role,
      });
      res.status(201).json(userRole);
    } catch (error) {
      console.error("Error creating user role:", error);
      res.status(500).json({ message: "Failed to create user role" });
    }
  });

  app.patch('/api/admin/users/:roleId', isAuthenticated, async (req: any, res) => {
    try {
      const { roleId } = req.params;
      const { locationId, role, hospitalId } = req.body;
      
      // Check admin access
      const userId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const updates: any = {};
      if (locationId !== undefined) updates.locationId = locationId;
      if (role !== undefined) updates.role = role;
      
      const updated = await storage.updateUserHospitalRole(roleId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  app.delete('/api/admin/users/:roleId', isAuthenticated, async (req: any, res) => {
    try {
      const { roleId } = req.params;
      const { hospitalId } = req.query;
      
      // Check admin access
      const userId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteUserHospitalRole(roleId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user role:", error);
      res.status(500).json({ message: "Failed to delete user role" });
    }
  });

  // Create user with email/password
  app.post('/api/admin/:hospitalId/users/create', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { email, password, firstName, lastName, locationId, role } = req.body;
      
      if (!email || !password || !firstName || !lastName || !locationId || !role) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if user already exists
      const existingUser = await storage.searchUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Create user
      const newUser = await storage.createUserWithPassword(email, password, firstName, lastName);

      // Set mustChangePassword flag for new users
      await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, newUser.id));

      // Assign user to hospital
      await storage.createUserHospitalRole({
        userId: newUser.id,
        hospitalId,
        locationId,
        role,
      });

      // Get hospital name
      const hospital = await storage.getHospital(hospitalId);
      
      // Send email with login credentials
      const loginUrl = process.env.REPLIT_DOMAINS?.split(',')?.[0] 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/` 
        : 'your-app-url';
      
      try {
        const { sendWelcomeEmail } = await import('./resend');
        await sendWelcomeEmail(
          newUser.email!,
          newUser.firstName!,
          hospital?.name || 'Your Hospital',
          password,
          loginUrl
        );
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
        // Continue even if email fails
      }

      // Sanitize user object - remove passwordHash
      const { passwordHash: _, ...sanitizedUser } = newUser;
      res.status(201).json({ ...sanitizedUser, mustChangePassword: true });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update user password
  app.patch('/api/admin/users/:userId/password', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { password, hospitalId } = req.body;
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      // Check admin access
      const currentUserId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(currentUserId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.updateUserPassword(userId, password);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Delete user entirely
  app.delete('/api/admin/users/:userId/delete', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { hospitalId } = req.query;
      
      // Check admin access
      const currentUserId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(currentUserId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
