import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertItemSchema, insertFolderSchema, insertActivitySchema, insertChecklistTemplateSchema, insertChecklistCompletionSchema, orderLines, items, stockLevels, orders, users, userHospitalRoles, activities, locations } from "@shared/schema";
import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

async function getUserLocationForHospital(userId: string, hospitalId: string): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  const hospital = hospitals.find(h => h.id === hospitalId);
  return hospital?.locationId || null;
}

async function getUserRole(userId: string, hospitalId: string): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  const hospital = hospitals.find(h => h.id === hospitalId);
  return hospital?.role || null;
}

async function verifyUserHospitalLocationAccess(userId: string, hospitalId: string, locationId: string): Promise<{ hasAccess: boolean; role: string | null }> {
  const hospitals = await storage.getUserHospitals(userId);
  const match = hospitals.find(h => h.id === hospitalId && h.locationId === locationId);
  return {
    hasAccess: !!match,
    role: match?.role || null
  };
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

function getBulkImportImageLimit(licenseType: string): number {
  // Async job queue system allows higher limits without timeout constraints
  // Background worker processes images within 30s timeout per job
  switch (licenseType) {
    case "basic":
      return 50;  // Basic accounts: up to 50 images
    case "free":
    default:
      return 10;  // Free accounts: up to 10 images
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

// Encryption utilities for patient data
if (!process.env.ENCRYPTION_SECRET) {
  throw new Error("ENCRYPTION_SECRET environment variable is required for patient data encryption");
}

const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_SECRET,
  "salt",
  32
);
const IV_LENGTH = 16;

function encryptPatientData(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decryptPatientData(text: string): string {
  // Check if data is encrypted (has IV:encrypted format)
  if (!text.includes(":")) {
    // Data is not encrypted, return as-is (backward compatibility)
    return text;
  }
  
  const parts = text.split(":");
  
  // Validate format
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    console.warn("Invalid encrypted data format, returning as-is");
    return text;
  }
  
  // Validate IV length (should be 32 hex chars = 16 bytes)
  if (parts[0].length !== 32) {
    console.warn(`Invalid IV length: ${parts[0].length}, expected 32. Returning as-is`);
    return text;
  }
  
  try {
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt data:", error);
    // Return original text if decryption fails
    return text;
  }
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

  // Forgot password route
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Get user by email
      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
      
      // Always return success to prevent email enumeration
      if (!user || user.length === 0 || !user[0].passwordHash) {
        return res.json({ message: "If an account with that email exists, a password reset link has been sent." });
      }

      const foundUser = user[0];

      // Generate reset token
      const crypto = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Save reset token to database
      await db.update(users)
        .set({ 
          resetToken, 
          resetTokenExpiry 
        })
        .where(eq(users.id, foundUser.id));

      // Send reset email
      const { sendPasswordResetEmail } = await import('./resend.js');
      const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
      
      await sendPasswordResetEmail(
        foundUser.email!,
        resetUrl,
        foundUser.firstName || undefined
      );

      res.json({ message: "If an account with that email exists, a password reset link has been sent." });
    } catch (error: any) {
      console.error("Error in forgot password:", error);
      res.status(500).json({ message: "An error occurred. Please try again later." });
    }
  });

  // Reset password route
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Find user with valid reset token
      const user = await db.select()
        .from(users)
        .where(eq(users.resetToken, token))
        .limit(1);

      if (!user || user.length === 0) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const foundUser = user[0];

      // Check if token is expired
      if (!foundUser.resetTokenExpiry || foundUser.resetTokenExpiry < new Date()) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Update password and clear reset token
      await storage.updateUserPassword(foundUser.id, newPassword);
      await db.update(users)
        .set({ 
          resetToken: null, 
          resetTokenExpiry: null,
          mustChangePassword: false
        })
        .where(eq(users.id, foundUser.id));

      res.json({ message: "Password reset successfully" });
    } catch (error: any) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
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
      const { locationId } = req.query;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this hospital and location
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.locationId === locationId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or location" });
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

  // Bulk update folder sort order
  app.patch('/api/folders/bulk-sort', isAuthenticated, async (req: any, res) => {
    try {
      const { folders: folderUpdates } = req.body;
      const userId = req.user.claims.sub;
      
      if (!folderUpdates || !Array.isArray(folderUpdates)) {
        return res.status(400).json({ message: "Folders array is required" });
      }

      for (const folderUpdate of folderUpdates) {
        if (!folderUpdate.id || folderUpdate.sortOrder === undefined) {
          continue;
        }

        const folder = await storage.getFolder(folderUpdate.id);
        if (!folder) continue;

        const locationId = await getUserLocationForHospital(userId, folder.hospitalId);
        if (!locationId || locationId !== folder.locationId) {
          continue;
        }

        await storage.updateFolder(folderUpdate.id, { sortOrder: folderUpdate.sortOrder });
      }

      res.json({ message: "Folder sort order updated successfully" });
    } catch (error) {
      console.error("Error updating folder sort order:", error);
      res.status(500).json({ message: "Failed to update folder sort order" });
    }
  });

  // Items routes
  app.get('/api/items/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { critical, controlled, belowMin, expiring, locationId } = req.query;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this hospital and location
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.locationId === locationId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or location" });
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
        
        // Handle stock updates
        if (item.trackExactQuantity && bulkItem.currentUnits !== undefined) {
          // For items with exact quantity tracking: update currentUnits and recalculate stock
          const packSize = item.packSize || 1;
          const newStock = Math.ceil(bulkItem.currentUnits / packSize);
          
          await db
            .update(items)
            .set({ currentUnits: bulkItem.currentUnits })
            .where(eq(items.id, bulkItem.id));
          
          await storage.updateStockLevel(bulkItem.id, item.locationId, newStock);
        } else if (bulkItem.actualStock !== undefined) {
          // For standard items: update stock directly
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

  // Bulk update item sort order
  app.patch('/api/items/bulk-sort', isAuthenticated, async (req: any, res) => {
    try {
      const { items: itemUpdates } = req.body;
      const userId = req.user.claims.sub;
      
      if (!itemUpdates || !Array.isArray(itemUpdates)) {
        return res.status(400).json({ message: "Items array is required" });
      }

      for (const itemUpdate of itemUpdates) {
        if (!itemUpdate.id || itemUpdate.sortOrder === undefined) {
          continue;
        }

        const item = await storage.getItem(itemUpdate.id);
        if (!item) continue;

        const locationId = await getUserLocationForHospital(userId, item.hospitalId);
        if (!locationId || locationId !== item.locationId) {
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
      };
      
      // Handle folderId separately to allow null values
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

  // Quick reduce unit count (for trackExactQuantity or single unit items)
  app.patch('/api/items/:itemId/reduce-unit', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get the item to verify access and current values
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's location
      const locationId = await getUserLocationForHospital(userId, item.hospitalId);
      if (!locationId || locationId !== item.locationId) {
        return res.status(403).json({ message: "Access denied to this item" });
      }
      
      // Check if item is controlled - controlled substances must be managed via Controller tab only
      if (item.controlled) {
        return res.status(403).json({ message: "Controlled substances must be managed through the Controller tab only" });
      }
      
      // Handle reduction based on item configuration
      if (item.trackExactQuantity) {
        // For items with exact quantity tracking: reduce currentUnits by 1 and recalculate stock
        const currentCurrentUnits = item.currentUnits || 0;
        if (currentCurrentUnits <= 0) {
          return res.status(400).json({ message: "No units available to reduce" });
        }
        
        const newCurrentUnits = currentCurrentUnits - 1;
        const packSize = item.packSize || 1;
        const newStock = Math.ceil(newCurrentUnits / packSize);
        
        // Update current units in items table
        await db
          .update(items)
          .set({ currentUnits: newCurrentUnits })
          .where(eq(items.id, itemId));
        
        // Update stock level
        await storage.updateStockLevel(itemId, locationId, newStock);
        
        // Return updated item with new values
        const updatedItem = await storage.getItem(itemId);
        res.json(updatedItem);
      } else if (item.unit.toLowerCase() === 'single unit') {
        // For single unit items: reduce stock directly
        const currentStock = await storage.getStockLevel(itemId, locationId);
        const currentQty = currentStock?.qtyOnHand || 0;
        
        if (currentQty <= 0) {
          return res.status(400).json({ message: "No stock available to reduce" });
        }
        
        const newQty = currentQty - 1;
        await storage.updateStockLevel(itemId, locationId, newQty);
        
        // Return updated item
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

  // Bulk delete items
  app.post('/api/items/bulk-delete', isAuthenticated, async (req: any, res) => {
    try {
      const { itemIds } = req.body;
      const userId = req.user.claims.sub;
      
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ message: "Item IDs array is required" });
      }

      const results = {
        deleted: [] as string[],
        failed: [] as { id: string; reason: string }[]
      };

      // Process each item
      for (const itemId of itemIds) {
        try {
          // Get the item to verify access
          const item = await storage.getItem(itemId);
          if (!item) {
            results.failed.push({ id: itemId, reason: "Item not found" });
            continue;
          }
          
          // Verify user has access to this item's location
          const locationId = await getUserLocationForHospital(userId, item.hospitalId);
          if (!locationId || locationId !== item.locationId) {
            results.failed.push({ id: itemId, reason: "Access denied" });
            continue;
          }
          
          // Delete the item
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
          description: bulkItem.description ?? "",
          unit: bulkItem.unit ?? "pack",
          packSize: bulkItem.packSize ?? 1,
          minThreshold: bulkItem.minThreshold ?? 0,
          maxThreshold: bulkItem.maxThreshold ?? 0,
          defaultOrderQty: 0,
          critical: bulkItem.critical ?? false,
          controlled: bulkItem.controlled ?? false,
          trackExactQuantity: bulkItem.trackExactQuantity ?? false,
          currentUnits: bulkItem.currentUnits ?? 0,
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

  // Async Bulk Import - Create Job
  app.post('/api/import-jobs', isAuthenticated, async (req: any, res) => {
    try {
      const { images, hospitalId } = req.body;
      const userId = req.user.claims.sub;

      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "Images array is required" });
      }

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }

      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
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
        locationId,
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
      const userId = req.user.claims.sub;

      const job = await storage.getImportJob(id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Verify user owns this job or has access to the hospital
      if (job.userId !== userId) {
        const locationId = await getUserLocationForHospital(userId, job.hospitalId);
        if (!locationId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      res.json({
        id: job.id,
        status: job.status,
        totalImages: job.totalImages,
        processedImages: job.processedImages,
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

      console.log(`[Import Job Worker] Processing job ${job.id}`);

      // Update job status to processing
      await storage.updateImportJob(job.id, {
        status: 'processing',
        startedAt: new Date(),
      });

      // Process images
      const { analyzeBulkItemImages } = await import('./openai');
      const extractedItems = await analyzeBulkItemImages(job.imagesData as string[]);

      // Update job with results
      await storage.updateImportJob(job.id, {
        status: 'completed',
        completedAt: new Date(),
        processedImages: job.totalImages,
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
  app.get('/api/orders/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { status } = req.query;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
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
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
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
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const order = await storage.findOrCreateDraftOrder(hospitalId, vendorId || null, userId);
      const orderLine = await storage.addItemToOrder(order.id, itemId, qty || 1, packSize || 1);

      res.json({ order, orderLine });
    } catch (error) {
      console.error("Error adding item to order:", error);
      res.status(500).json({ message: "Failed to add item to order" });
    }
  });

  app.post('/api/orders/:orderId/status', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { status } = req.body;
      const userId = req.user.claims.sub;
      
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, order.hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
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
          const isControlledPack = item.controlled && normalizedUnit === 'pack';
          
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
          const newQty = currentQty + line.qty;
          
          // Update stock level
          await storage.updateStockLevel(item.id, item.locationId, newQty);
          
          // For items with exact quantity tracking, also update current units
          if (item.trackExactQuantity) {
            // Fetch current currentUnits to avoid using stale value
            const [currentItem] = await db
              .select({ currentUnits: items.currentUnits })
              .from(items)
              .where(eq(items.id, item.id));
            
            const currentCurrentUnits = currentItem?.currentUnits || 0;
            const addedUnits = line.qty * (line.packSize || 1);
            await db
              .update(items)
              .set({ 
                currentUnits: currentCurrentUnits + addedUnits 
              })
              .where(eq(items.id, item.id));
          }
        }
      }
      
      const updatedOrder = await storage.updateOrderStatus(orderId, status);
      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  app.patch('/api/order-lines/:lineId', isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const { qty } = req.body;
      const userId = req.user.claims.sub;
      
      if (!qty || qty < 1) {
        return res.status(400).json({ message: "Valid quantity is required" });
      }
      
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
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, order.hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      const orderLine = await storage.updateOrderLine(lineId, qty);
      res.json(orderLine);
    } catch (error) {
      console.error("Error updating order line:", error);
      res.status(500).json({ message: "Failed to update order line" });
    }
  });

  app.delete('/api/order-lines/:lineId', isAuthenticated, async (req: any, res) => {
    try {
      const { lineId } = req.params;
      const userId = req.user.claims.sub;
      
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
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, order.hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      await storage.removeOrderLine(lineId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing order line:", error);
      res.status(500).json({ message: "Failed to remove order line" });
    }
  });

  app.delete('/api/orders/:orderId', isAuthenticated, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get order to verify access
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify user has access to this hospital
      const locationId = await getUserLocationForHospital(userId, order.hospitalId);
      if (!locationId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
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
  app.post('/api/controlled/extract-patient-info', isAuthenticated, async (req: any, res) => {
    try {
      const { image } = req.body;
      
      if (!image) {
        return res.status(400).json({ message: "Image data is required" });
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Extract patient info using GPT-4 Vision
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract patient identification information from this medical wristband or label. Look for patient ID, MRN (Medical Record Number), name, or any other identifier. Return only the most prominent patient identifier as plain text, nothing else. If you cannot find any patient identifier, respond with 'NOT_FOUND'."
              },
              {
                type: "image_url",
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        max_tokens: 100,
      });

      const extractedText = response.choices[0]?.message?.content?.trim() || "";
      
      if (extractedText === "NOT_FOUND" || !extractedText) {
        return res.json({ patientId: null });
      }

      res.json({ patientId: extractedText });
    } catch (error) {
      console.error("Error extracting patient info:", error);
      res.status(500).json({ message: "Failed to extract patient information" });
    }
  });

  app.post('/api/controlled/dispense', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
          
          // Get user's locationId for this hospital
          const locationId = await getUserLocationForHospital(userId, itemData.hospitalId);
          if (!locationId) {
            throw new Error("Access denied to this hospital");
          }
          
          // Verify item belongs to user's location
          if (itemData.locationId !== locationId) {
            throw new Error(`Access denied to item ${item.itemId}'s location`);
          }
          
          // Check if this item has exact quantity tracking enabled
          if (itemData.trackExactQuantity) {
            // For items with exact quantity tracking: update current units and recalculate stock
            const currentCurrentUnits = itemData.currentUnits || 0;
            const newCurrentUnits = Math.max(0, currentCurrentUnits - item.qty);
            const packSize = itemData.packSize || 1;
            const newQty = Math.ceil(newCurrentUnits / packSize);
            
            // Update both current units and stock
            await db
              .update(items)
              .set({ currentUnits: newCurrentUnits })
              .where(eq(items.id, item.itemId));
            
            await storage.updateStockLevel(item.itemId, locationId, newQty);
          } else {
            // For normal items: subtract from stock directly
            const currentStock = await storage.getStockLevel(item.itemId, locationId);
            const currentQty = currentStock?.qtyOnHand || 0;
            const newQty = Math.max(0, currentQty - item.qty);
            
            await storage.updateStockLevel(item.itemId, locationId, newQty);
          }
          
          return await storage.createActivity({
            userId,
            action: 'dispense',
            itemId: item.itemId,
            locationId,
            delta: -item.qty, // Negative for dispensing
            notes,
            patientId: encryptedPatientId,
            patientPhoto: encryptedPatientPhoto,
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
      
      // Decrypt patient data for each activity
      const decryptedActivities = activities.map((activity: any) => {
        const decrypted = { ...activity };
        
        if (activity.patientId) {
          try {
            decrypted.patientId = decryptPatientData(activity.patientId);
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
      });
      
      res.json(decryptedActivities);
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
  app.get('/api/alerts/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { locationId, acknowledged } = req.query;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this hospital and location
      const userHospitals = await storage.getUserHospitals(userId);
      const hasAccess = userHospitals.some(h => h.id === hospitalId && h.locationId === locationId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital or location" });
      }
      
      const acknowledgedBool = acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined;
      const alerts = await storage.getAlerts(hospitalId, locationId, acknowledgedBool);
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
      // Check if user has admin role for this hospital (any location)
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hasAdminRole) {
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
      const userId = req.user.claims.sub;
      
      // Check admin access - user must be admin for ANY location in this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const adminLocations = hospitals.filter(h => h.id === hospitalId && h.role === 'admin');
      
      if (adminLocations.length === 0) {
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
      // Use production URL if available, otherwise fall back to REPLIT_DOMAINS
      const loginUrl = process.env.PRODUCTION_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')?.[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/` 
          : 'https://use.viali.app/');
      
      try {
        const { sendWelcomeEmail } = await import('./resend');
        console.log('[User Creation] Attempting to send welcome email to:', newUser.email);
        const result = await sendWelcomeEmail(
          newUser.email!,
          newUser.firstName!,
          hospital?.name || 'Your Hospital',
          password,
          loginUrl
        );
        if (result.success) {
          console.log('[User Creation] Welcome email sent successfully:', result.data);
        } else {
          console.error('[User Creation] Failed to send welcome email:', result.error);
        }
      } catch (emailError) {
        console.error('[User Creation] Exception sending welcome email:', emailError);
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

  // Update user details (name)
  app.patch('/api/admin/users/:userId/details', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { firstName, lastName, hospitalId } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      // Check admin access
      const currentUserId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(currentUserId);
      const hospital = hospitals.find(h => h.id === hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      await storage.updateUser(userId, { firstName, lastName });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user details:", error);
      res.status(500).json({ message: "Failed to update user details" });
    }
  });

  // Delete user entirely
  app.delete('/api/admin/users/:userId/delete', isAuthenticated, async (req: any, res) => {
    try {
      const { userId } = req.params;
      const { hospitalId } = req.query;
      
      console.log('[Delete User] Request received:', { userId, hospitalId, query: req.query });
      
      if (!hospitalId) {
        console.log('[Delete User] ERROR: No hospitalId provided in query');
        return res.status(400).json({ message: "Hospital ID is required" });
      }
      
      // Check admin access - user may have multiple roles for same hospital
      const currentUserId = req.user.claims.sub;
      const hospitals = await storage.getUserHospitals(currentUserId);
      console.log('[Delete User] User hospitals:', hospitals.map(h => ({ id: h.id, role: h.role })));
      
      // Check if user has admin role for this hospital (may have multiple roles)
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      if (!hasAdminRole) {
        console.log('[Delete User] Admin check failed - no admin role found for hospital:', hospitalId);
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all user's hospital associations
      const userHospitals = await storage.getUserHospitals(userId);
      
      // Remove all associations for this hospital
      const hospitalRoles = userHospitals.filter(h => h.id === hospitalId);
      for (const role of hospitalRoles) {
        // Get the role record ID by looking up user_hospital_roles
        const [roleRecord] = await db
          .select()
          .from(userHospitalRoles)
          .where(
            and(
              eq(userHospitalRoles.userId, userId),
              eq(userHospitalRoles.hospitalId, hospitalId),
              eq(userHospitalRoles.locationId, role.locationId),
              eq(userHospitalRoles.role, role.role)
            )
          );
        
        if (roleRecord) {
          await storage.deleteUserHospitalRole(roleRecord.id);
        }
      }
      
      // Check if user has associations with other hospitals
      const remainingHospitals = userHospitals.filter(h => h.id !== hospitalId);
      
      // Check if user has any activity records (for audit trail)
      const [activityCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activities)
        .where(eq(activities.userId, userId));
      
      const hasActivities = activityCount?.count > 0;
      
      // Only delete user if they have no other hospitals AND no activities
      // This preserves audit trails for compliance
      if (remainingHospitals.length === 0 && !hasActivities) {
        await storage.deleteUser(userId);
        res.json({ 
          success: true, 
          deleted: true,
          message: "User completely removed from system"
        });
      } else {
        res.json({ 
          success: true, 
          deleted: false,
          message: hasActivities 
            ? "User removed from hospital but preserved for audit trail"
            : "User removed from hospital but has access to other hospitals"
        });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Checklist Template Routes
  
  // Create checklist template (admin only)
  app.post('/api/checklists/templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const templateData = req.body;
      
      if (!templateData.hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }
      
      if (!templateData.locationId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      // Verify the locationId belongs to the hospital
      const [location] = await db.select().from(locations).where(eq(locations.id, templateData.locationId));
      if (!location || location.hospitalId !== templateData.hospitalId) {
        return res.status(400).json({ message: "Invalid location for this hospital" });
      }
      
      // Verify user is admin for ANY location in the hospital
      // Admins can create templates for any location in their hospital
      const hospitals = await storage.getUserHospitals(userId);
      const adminLocations = hospitals.filter(h => h.id === templateData.hospitalId && h.role === 'admin');
      if (adminLocations.length === 0) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Validate with schema and add createdBy
      const validated = insertChecklistTemplateSchema.parse({
        ...templateData,
        createdBy: userId,
      });
      
      const template = await storage.createChecklistTemplate(validated);
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating checklist template:", error);
      if (error.name === 'ZodError') {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create checklist template" });
    }
  });
  
  // Get all checklist templates for a hospital (all locations user has access to)
  app.get('/api/checklists/templates/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      const active = req.query.active !== 'false'; // Default to active only
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Deduplicate location IDs to avoid redundant queries
      const uniqueLocationIds = Array.from(new Set(userLocations.map(loc => loc.locationId)));
      
      // Get templates for all unique locations
      const allTemplates = await Promise.all(
        uniqueLocationIds.map(locationId => storage.getChecklistTemplates(hospitalId, locationId, active))
      );
      
      // Flatten and deduplicate by template ID (defensive fallback)
      const templatesMap = new Map();
      allTemplates.flat().forEach(template => {
        templatesMap.set(template.id, template);
      });
      const templates = Array.from(templatesMap.values());
      res.json(templates);
    } catch (error) {
      console.error("Error fetching checklist templates:", error);
      res.status(500).json({ message: "Failed to fetch checklist templates" });
    }
  });
  
  // Update checklist template (admin only)
  app.patch('/api/checklists/templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const updates = req.body;
      
      const template = await storage.getChecklistTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // If locationId is being updated, verify it belongs to the hospital
      if (updates.locationId && updates.locationId !== template.locationId) {
        const [location] = await db.select().from(locations).where(eq(locations.id, updates.locationId));
        if (!location || location.hospitalId !== template.hospitalId) {
          return res.status(400).json({ message: "Invalid location for this hospital" });
        }
      }
      
      // Verify user is admin for ANY location in the hospital
      // Admins can update/delete templates for any location in their hospital
      const hospitals = await storage.getUserHospitals(userId);
      const adminLocations = hospitals.filter(h => h.id === template.hospitalId && h.role === 'admin');
      if (adminLocations.length === 0) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      // Coerce startDate string to Date if present
      const processedUpdates = { ...updates };
      if (processedUpdates.startDate && typeof processedUpdates.startDate === 'string') {
        processedUpdates.startDate = new Date(processedUpdates.startDate);
      }
      
      // Also coerce items if present to ensure proper structure
      if (processedUpdates.items && Array.isArray(processedUpdates.items)) {
        processedUpdates.items = processedUpdates.items.map((item: any) => 
          typeof item === 'string' ? { description: item } : item
        );
      }
      
      const updated = await storage.updateChecklistTemplate(id, processedUpdates);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating checklist template:", error);
      res.status(500).json({ message: "Failed to update checklist template" });
    }
  });
  
  // Delete checklist template (admin only)
  app.delete('/api/checklists/templates/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const template = await storage.getChecklistTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Verify user is admin for ANY location in the hospital
      // Admins can update/delete templates for any location in their hospital
      const hospitals = await storage.getUserHospitals(userId);
      const adminLocations = hospitals.filter(h => h.id === template.hospitalId && h.role === 'admin');
      if (adminLocations.length === 0) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteChecklistTemplate(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting checklist template:", error);
      res.status(500).json({ message: "Failed to delete checklist template" });
    }
  });
  
  // Checklist Completion Routes
  
  // Get pending checklists for all user's locations
  app.get('/api/checklists/pending/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get pending checklists for all user's locations
      const allPending = await Promise.all(
        userLocations.map(loc => 
          storage.getPendingChecklists(hospitalId, loc.locationId, loc.role)
        )
      );
      
      // Flatten and deduplicate by template ID
      const pendingMap = new Map();
      allPending.flat().forEach(checklist => {
        pendingMap.set(checklist.id, checklist);
      });
      const pending = Array.from(pendingMap.values()).sort((a, b) => 
        a.nextDueDate.getTime() - b.nextDueDate.getTime()
      );
      
      res.json(pending);
    } catch (error) {
      console.error("Error fetching pending checklists:", error);
      res.status(500).json({ message: "Failed to fetch pending checklists" });
    }
  });
  
  // Get pending checklist count (for badge) across all user's locations
  app.get('/api/checklists/count/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get counts for all user's locations
      const counts = await Promise.all(
        userLocations.map(loc => 
          storage.getPendingChecklistCount(hospitalId, loc.locationId, loc.role)
        )
      );
      
      // Sum all counts
      const totalCount = counts.reduce((sum, count) => sum + count, 0);
      
      res.json({ count: totalCount });
    } catch (error) {
      console.error("Error fetching pending checklist count:", error);
      res.status(500).json({ message: "Failed to fetch pending checklist count" });
    }
  });
  
  // Complete a checklist
  app.post('/api/checklists/complete', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const completionData = req.body;
      
      if (!completionData.templateId || !completionData.signature) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get template to verify access
      const template = await storage.getChecklistTemplate(completionData.templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // Verify user has access to this specific hospital/location
      const access = await verifyUserHospitalLocationAccess(userId, template.hospitalId, template.locationId);
      if (!access.hasAccess) {
        return res.status(403).json({ message: "Access denied to this location" });
      }
      
      // Validate with schema (extend to coerce dueDate from ISO string)
      const validated = insertChecklistCompletionSchema.extend({
        dueDate: z.coerce.date(),
      }).parse({
        ...completionData,
        completedBy: userId,
        hospitalId: template.hospitalId,
        locationId: template.locationId,
        completedAt: new Date(),
      });
      
      const completion = await storage.completeChecklist(validated);
      res.status(201).json(completion);
    } catch (error: any) {
      console.error("Error completing checklist:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid completion data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to complete checklist" });
    }
  });
  
  // Get checklist completion history for all user's locations
  app.get('/api/checklists/history/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.claims.sub;
      const { templateId, limit } = req.query;
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get completions for all user's locations
      const allCompletions = await Promise.all(
        userLocations.map(loc => 
          storage.getChecklistCompletions(
            hospitalId,
            loc.locationId,
            templateId as string | undefined,
            limit ? parseInt(limit as string) : undefined
          )
        )
      );
      
      // Flatten and sort by completion date (most recent first)
      const completions = allCompletions.flat().sort((a, b) => 
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      );
      
      res.json(completions);
    } catch (error) {
      console.error("Error fetching checklist history:", error);
      res.status(500).json({ message: "Failed to fetch checklist history" });
    }
  });
  
  // Get single checklist completion (for PDF generation)
  app.get('/api/checklists/completion/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      const completion = await storage.getChecklistCompletion(id);
      if (!completion) {
        return res.status(404).json({ message: "Completion not found" });
      }
      
      // Verify user has access to this specific hospital/location
      const access = await verifyUserHospitalLocationAccess(userId, completion.hospitalId, completion.locationId);
      if (!access.hasAccess) {
        return res.status(403).json({ message: "Access denied to this location" });
      }
      
      res.json(completion);
    } catch (error) {
      console.error("Error fetching checklist completion:", error);
      res.status(500).json({ message: "Failed to fetch checklist completion" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
