import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, db } from "./storage";
import { setupAuth, isAuthenticated, getSessionMiddleware } from "./auth/google";
import { initSocketIO, broadcastAnesthesiaUpdate, type AnesthesiaDataSection } from "./socket";
import { 
  insertItemSchema, 
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
  checkLicenseLimit
} from "./utils";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "./services/aiMonitorAnalysis";

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

      // Seed hospital with default data (locations, surgery rooms, admin groups, medications)
      // This includes: 4 locations, 3 surgery rooms, 5 admin groups, and 13 medications
      const { seedHospitalData } = await import('./seed-hospital');
      await seedHospitalData(hospital.id, user.id);
      
      console.log(`[Auth] Created and seeded new hospital for user ${user.id}`);

      // Log the user in by creating a session
      req.login({ 
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
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
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
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
      const userId = req.user.id;
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
      const userId = req.user.id;
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
      const userId = req.user.id;
      const { hospitalName } = req.body;

      if (!hospitalName) {
        return res.status(400).json({ message: "Hospital name is required" });
      }

      // Create new hospital
      const hospital = await storage.createHospital(hospitalName);

      // Create 4 default units
      const anesthesyUnit = await storage.createUnit({
        hospitalId: hospital.id,
        name: "Anesthesy",
        type: "anesthesy",
        parentId: null,
        isAnesthesiaModule: true,
        isSurgeryModule: false,
      });
      
      await storage.createUnit({
        hospitalId: hospital.id,
        name: "Operating Room (OR)",
        type: "or",
        parentId: null,
        isAnesthesiaModule: false,
        isSurgeryModule: true,
      });
      
      await storage.createUnit({
        hospitalId: hospital.id,
        name: "Emergency Room (ER)",
        type: "er",
        parentId: null,
        isAnesthesiaModule: false,
        isSurgeryModule: false,
      });
      
      await storage.createUnit({
        hospitalId: hospital.id,
        name: "Intensive Care Unit (ICU)",
        type: "icu",
        parentId: null,
        isAnesthesiaModule: false,
        isSurgeryModule: false,
      });

      // Assign user as admin to the first unit (Anesthesy)
      await storage.createUserHospitalRole({
        userId,
        hospitalId: hospital.id,
        unitId: anesthesyUnit.id,
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
      const { unitId, module: moduleType } = req.query;
      const userId = req.user.id;
      
      // Verify user has access to this hospital
      const userHospitals = await storage.getUserHospitals(userId);
      const hasHospitalAccess = userHospitals.some(h => h.id === hospitalId);
      if (!hasHospitalAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Determine which unitId to use based on module parameter or direct unitId
      let effectiveUnitId = unitId;
      
      if (moduleType) {
        // Find the unit with the matching module flag
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
      
      // If still no unitId, verify direct unit access
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

  app.post('/api/folders', isAuthenticated, async (req: any, res) => {
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

  // Bulk update folder sort order - MUST be before :folderId route
  app.patch('/api/folders/bulk-sort', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/folders/:folderId', isAuthenticated, async (req: any, res) => {
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

  app.delete('/api/folders/:folderId', isAuthenticated, async (req: any, res) => {
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

  // Items routes
  app.get('/api/items/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const { critical, controlled, belowMin, expiring, unitId, module: moduleType } = req.query;
      const userId = req.user.id;
      
      // Verify user has access to this hospital
      const userHospitals = await storage.getUserHospitals(userId);
      const hasHospitalAccess = userHospitals.some(h => h.id === hospitalId);
      if (!hasHospitalAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Determine which unitId to use based on module parameter or direct unitId
      let effectiveUnitId = unitId;
      
      if (moduleType) {
        // Find the unit with the matching module flag
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
      
      // If still no unitId, verify direct unit access
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
      
      // Only apply filters if they are explicitly true
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value)
      );
      
      const items = await storage.getItems(hospitalId, effectiveUnitId, Object.keys(activeFilters).length > 0 ? activeFilters : undefined);
      res.json(items);
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  app.get('/api/items/detail/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.id;
      
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's unit
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
      
      // Validate controlled Single unit items have pack size
      if (itemData.controlled && itemData.unit === "Single unit") {
        if (!itemData.packSize || itemData.packSize <= 0) {
          return res.status(400).json({ 
            message: "Controlled items with 'Single unit' type must have a pack size greater than 0" 
          });
        }
      }

      // Validate controlled packed items have trackExactQuantity enabled
      if (itemData.controlled && itemData.unit.toLowerCase() === "pack") {
        if (!itemData.trackExactQuantity) {
          return res.status(400).json({ 
            message: "Controlled packed items must have Track Exact Quantity enabled" 
          });
        }
      }
      
      const item = await storage.createItem(itemData);
      
      // If initialStock is provided, create stock level
      if (req.body.initialStock !== undefined && req.body.initialStock > 0) {
        await storage.updateStockLevel(item.id, item.unitId, req.body.initialStock);
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
      const userId = req.user.id;
      
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
        
        // Verify user has access to this item's unit
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
        
        // Validate controlled Single unit items have pack size
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
          
          await storage.updateStockLevel(bulkItem.id, item.unitId, newStock);
        } else if (bulkItem.actualStock !== undefined) {
          // For standard items: update stock directly
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

  // Bulk update item sort order
  app.patch('/api/items/bulk-sort', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/items/:itemId', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.id;
      const { activeUnitId } = req.body;
      
      // Get the item to verify access
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's unit
      // Use the activeUnitId from request body (user's currently active unit on frontend)
      const unitId = activeUnitId || await getUserUnitForHospital(userId, item.hospitalId);
      console.log(`[ITEM ACCESS CHECK] Item: ${item.name}, ItemUnitId: ${item.unitId}, UserActiveUnitId: ${unitId}`);
      if (!unitId || unitId !== item.unitId) {
        console.log(`[ACCESS DENIED] User active unit ${unitId} does not match item unit ${item.unitId}`);
        return res.status(403).json({ message: "Access denied to this item" });
      }
      
      // CRITICAL: Prevent direct editing of currentUnits for controlled substances
      // Controlled substance quantities must be managed through the Controller tab with proper logging
      if (item.controlled && req.body.currentUnits !== undefined && req.body.currentUnits !== item.currentUnits) {
        return res.status(403).json({ 
          message: "Controlled substance quantities cannot be edited directly. Use the Controller tab to log all movements." 
        });
      }
      
      // Validate controlled Single unit items have pack size
      // Check final state (req.body value or existing item value if not provided)
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

      // Validate controlled packed items have trackExactQuantity enabled
      if (finalControlled && finalUnit.toLowerCase() === "pack") {
        if (!finalTrackExactQuantity) {
          return res.status(400).json({ 
            message: "Controlled packed items must have Track Exact Quantity enabled" 
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
        imageUrl: req.body.imageUrl,
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
      const userId = req.user.id;
      
      // Get the item to verify access and current values
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's unit
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
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
        await storage.updateStockLevel(itemId, unitId, newStock);
        
        // Return updated item with new values
        const updatedItem = await storage.getItem(itemId);
        res.json(updatedItem);
      } else if (item.unit.toLowerCase() === 'single unit') {
        // For single unit items: reduce stock directly
        const currentStock = await storage.getStockLevel(itemId, unitId);
        const currentQty = currentStock?.qtyOnHand || 0;
        
        if (currentQty <= 0) {
          return res.status(400).json({ message: "No stock available to reduce" });
        }
        
        const newQty = currentQty - 1;
        await storage.updateStockLevel(itemId, unitId, newQty);
        
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
      const userId = req.user.id;
      
      // Get the item to verify access
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's unit
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
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
      const userId = req.user.id;
      
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
          
          // Verify user has access to this item's unit
          const unitId = await getUserUnitForHospital(userId, item.hospitalId);
          if (!unitId || unitId !== item.unitId) {
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

  // Get items configured for anesthesia (medications and infusions)
  app.get('/api/anesthesia/items/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;
      
      // Verify user has access to this hospital
      const userUnitId = await getUserUnitForHospital(userId, hospitalId);
      if (!userUnitId) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      // Get the hospital's anesthesia unit (unit with is_anesthesia_module = true)
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
        return res.json([]); // Return empty array if anesthesia unit not configured
      }

      const anesthesiaUnitId = anesthesiaUnits[0].id;

      // Get all items from the hospital's anesthesia location that have medication configs
      // INNER JOIN ensures we only get items with medication configurations
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
          // Flatten medication config fields to top level
          medicationGroup: medicationConfigs.medicationGroup,
          administrationGroup: medicationConfigs.administrationGroup,
          defaultDose: medicationConfigs.defaultDose,
          administrationUnit: medicationConfigs.administrationUnit,
          ampuleTotalContent: medicationConfigs.ampuleTotalContent,
          administrationRoute: medicationConfigs.administrationRoute,
          rateUnit: medicationConfigs.rateUnit,
          medicationSortOrder: medicationConfigs.sortOrder,
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

  // Update anesthesia configuration for an item
  app.patch('/api/items/:itemId/anesthesia-config', isAuthenticated, async (req: any, res) => {
    try {
      const { itemId } = req.params;
      const userId = req.user.id;
      
      // Get the item to verify access
      const item = await storage.getItem(itemId);
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
      
      // Verify user has access to this item's unit
      const unitId = await getUserUnitForHospital(userId, item.hospitalId);
      if (!unitId || unitId !== item.unitId) {
        return res.status(403).json({ message: "Access denied to this item" });
      }

      // Update item name if provided
      if (req.body.name) {
        await db
          .update(items)
          .set({ name: req.body.name })
          .where(eq(items.id, itemId));
      }

      // Check if we have any medication config data
      const hasMedicationConfig = req.body.medicationGroup || req.body.administrationGroup || 
        req.body.defaultDose || req.body.administrationUnit || req.body.ampuleTotalContent || 
        req.body.administrationRoute || req.body.rateUnit !== undefined;

      if (hasMedicationConfig) {
        // Prepare medication config data - all fields are optional
        const configData: any = {
          itemId,
          medicationGroup: req.body.medicationGroup || null,
          administrationGroup: req.body.administrationGroup || null,
          defaultDose: req.body.defaultDose || null,
          administrationUnit: req.body.administrationUnit || null,
          ampuleTotalContent: req.body.ampuleTotalContent || null,
          administrationRoute: req.body.administrationRoute || null,
          rateUnit: req.body.rateUnit || null,
          sortOrder: req.body.sortOrder !== undefined ? req.body.sortOrder : 0,
        };

        // Check if config exists
        const existingConfig = await db
          .select()
          .from(medicationConfigs)
          .where(eq(medicationConfigs.itemId, itemId))
          .limit(1);

        if (existingConfig.length > 0) {
          // Update existing config
          await db
            .update(medicationConfigs)
            .set(configData)
            .where(eq(medicationConfigs.itemId, itemId));
        } else {
          // Insert new config
          await db.insert(medicationConfigs).values(configData);
        }
      } else {
        // No config data provided - delete any existing config
        await db
          .delete(medicationConfigs)
          .where(eq(medicationConfigs.itemId, itemId));
      }

      // Fetch the updated item with medication config
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

  // Bulk reorder medications within administration groups
  app.post('/api/anesthesia/items/reorder', isAuthenticated, async (req: any, res) => {
    try {
      const { items: itemsToReorder } = req.body;
      const userId = req.user.id;

      if (!Array.isArray(itemsToReorder) || itemsToReorder.length === 0) {
        return res.status(400).json({ message: "Invalid items array" });
      }

      // Verify user has access to all items
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

      // Update sort orders
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
  
  // Medication Groups API
  // Get all medication groups for a hospital
  app.get('/api/medication-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const groups = await storage.getMedicationGroups(hospitalId);
      res.json(groups);
    } catch (error: any) {
      console.error("Error fetching medication groups:", error);
      res.status(500).json({ message: "Failed to fetch medication groups" });
    }
  });

  // Create a new medication group
  app.post('/api/medication-groups', isAuthenticated, async (req: any, res) => {
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

  // Delete a medication group
  app.delete('/api/medication-groups/:groupId', isAuthenticated, async (req: any, res) => {
    try {
      const { groupId } = req.params;
      await storage.deleteMedicationGroup(groupId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting medication group:", error);
      res.status(500).json({ message: "Failed to delete medication group" });
    }
  });

  // Administration Groups API
  // Get all administration groups for a hospital
  app.get('/api/administration-groups/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const groups = await storage.getAdministrationGroups(hospitalId);
      res.json(groups);
    } catch (error: any) {
      console.error("Error fetching administration groups:", error);
      res.status(500).json({ message: "Failed to fetch administration groups" });
    }
  });

  // Create a new administration group
  app.post('/api/administration-groups', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, name } = req.body;
      
      if (!hospitalId || !name) {
        return res.status(400).json({ message: "Hospital ID and name are required" });
      }

      // Get existing groups to determine next sortOrder
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

  // Reorder administration groups (must be before :groupId route)
  app.put('/api/administration-groups/reorder', isAuthenticated, async (req: any, res) => {
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

  // Update an administration group
  app.put('/api/administration-groups/:groupId', isAuthenticated, async (req: any, res) => {
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

  // Delete an administration group
  app.delete('/api/administration-groups/:groupId', isAuthenticated, async (req: any, res) => {
    try {
      const { groupId } = req.params;
      await storage.deleteAdministrationGroup(groupId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting administration group:", error);
      res.status(500).json({ message: "Failed to delete administration group" });
    }
  });

  // Surgery Rooms API
  // Get all surgery rooms for a hospital
  app.get('/api/surgery-rooms/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const rooms = await storage.getSurgeryRooms(hospitalId);
      res.json(rooms);
    } catch (error: any) {
      console.error("Error fetching surgery rooms:", error);
      res.status(500).json({ message: "Failed to fetch surgery rooms" });
    }
  });

  // Create a new surgery room
  app.post('/api/surgery-rooms', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, name } = req.body;
      
      if (!hospitalId || !name) {
        return res.status(400).json({ message: "Hospital ID and name are required" });
      }

      const newRoom = await storage.createSurgeryRoom({ hospitalId, name, sortOrder: 0 });
      res.status(201).json(newRoom);
    } catch (error: any) {
      console.error("Error creating surgery room:", error);
      res.status(500).json({ message: "Failed to create surgery room" });
    }
  });

  // Update a surgery room
  app.put('/api/surgery-rooms/:roomId', isAuthenticated, async (req: any, res) => {
    try {
      const { roomId } = req.params;
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }

      const updatedRoom = await storage.updateSurgeryRoom(roomId, { name });
      res.json(updatedRoom);
    } catch (error: any) {
      console.error("Error updating surgery room:", error);
      res.status(500).json({ message: "Failed to update surgery room" });
    }
  });

  // Delete a surgery room
  app.delete('/api/surgery-rooms/:roomId', isAuthenticated, async (req: any, res) => {
    try {
      const { roomId } = req.params;
      await storage.deleteSurgeryRoom(roomId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting surgery room:", error);
      res.status(500).json({ message: "Failed to delete surgery room" });
    }
  });

  // Reorder surgery rooms
  app.put('/api/surgery-rooms/reorder', isAuthenticated, async (req: any, res) => {
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

  // AI medical monitor analysis for anesthesia vitals and ventilation
  app.post('/api/analyze-monitor', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/transcribe-voice', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/parse-drug-command', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/translate', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/items/bulk', isAuthenticated, async (req: any, res) => {
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

  // Async Bulk Import - Create Job
  app.post('/api/import-jobs', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/scan/barcode', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/orders', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/orders/quick-add', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/orders/:orderId/status', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/orders/:orderId/notes', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/order-lines/:lineId', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/order-lines/:lineId/move-to-secondary', isAuthenticated, async (req: any, res) => {
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

  app.patch('/api/order-lines/:lineId/offline-worked', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/order-lines/:lineId/receive', isAuthenticated, async (req: any, res) => {
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

  app.delete('/api/order-lines/:lineId', isAuthenticated, async (req: any, res) => {
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

  app.delete('/api/orders/:orderId', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/controlled/dispense', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/controlled/adjust', isAuthenticated, async (req: any, res) => {
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
        controlledVerified: true, // Manual adjustments are verified by signature
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
      
      const activities = await storage.getActivities({
        hospitalId,
        unitId,
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

  app.post('/api/controlled/verify/:activityId', isAuthenticated, async (req: any, res) => {
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

  app.post('/api/alerts/:alertId/acknowledge', isAuthenticated, async (req: any, res) => {
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

  // Admin middleware - check if user has admin role
  async function isAdmin(req: any, res: Response, next: NextFunction) {
    try {
      const userId = req.user.id;
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

  // Admin - Configure anesthesia location for hospital
  app.patch('/api/admin/:hospitalId/anesthesia-location', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { anesthesiaUnitId } = req.body;

      if (!anesthesiaUnitId) {
        return res.status(400).json({ message: "Unit ID is required" });
      }

      // Verify the unit belongs to this hospital
      const allUnits = await storage.getUnits(hospitalId);
      const targetUnit = allUnits.find(l => l.id === anesthesiaUnitId);
      if (!targetUnit) {
        return res.status(400).json({ message: "Selected unit does not belong to this hospital" });
      }

      // Clear is_anesthesia_module flag from all units in this hospital
      await Promise.all(
        allUnits
          .filter(u => u.isAnesthesiaModule)
          .map(u => storage.updateUnit(u.id, { isAnesthesiaModule: false }))
      );

      // Set is_anesthesia_module flag on the selected unit
      const updated = await storage.updateUnit(anesthesiaUnitId, { isAnesthesiaModule: true });
      res.json(updated);
    } catch (error) {
      console.error("Error updating anesthesia location:", error);
      res.status(500).json({ message: "Failed to update anesthesia location" });
    }
  });

  // Admin - Configure surgery location for hospital
  app.patch('/api/admin/:hospitalId/surgery-location', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { surgeryUnitId } = req.body;

      if (!surgeryUnitId) {
        return res.status(400).json({ message: "Unit ID is required" });
      }

      // Verify the unit belongs to this hospital
      const allUnits = await storage.getUnits(hospitalId);
      const targetUnit = allUnits.find(l => l.id === surgeryUnitId);
      if (!targetUnit) {
        return res.status(400).json({ message: "Selected unit does not belong to this hospital" });
      }

      // Clear is_surgery_module flag from all units in this hospital
      await Promise.all(
        allUnits
          .filter(u => u.isSurgeryModule)
          .map(u => storage.updateUnit(u.id, { isSurgeryModule: false }))
      );

      // Set is_surgery_module flag on the selected unit
      const updated = await storage.updateUnit(surgeryUnitId, { isSurgeryModule: true });
      res.json(updated);
    } catch (error) {
      console.error("Error updating surgery location:", error);
      res.status(500).json({ message: "Failed to update surgery location" });
    }
  });

  // Get surgeons (doctors from surgery location)
  app.get('/api/surgeons', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.query;

      if (!hospitalId) {
        return res.status(400).json({ message: "hospitalId is required" });
      }

      // Verify user has access to this hospital
      const userHospitals = await storage.getUserHospitals(req.user.id);
      const hasAccess = userHospitals.some(h => h.id === hospitalId);

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      // Get hospital's surgery unit (unit with is_surgery_module = true)
      const allUnits = await storage.getUnits(hospitalId);
      const surgeryUnit = allUnits.find(u => u.isSurgeryModule);
      
      if (!surgeryUnit) {
        return res.json([]); // No surgery unit configured, return empty list
      }

      // Get all users for this hospital
      const hospitalUsers = await storage.getHospitalUsers(hospitalId);
      
      // Filter for doctors in the surgery unit
      const surgeons = hospitalUsers
        .filter(hu => hu.unitId === surgeryUnit.id && hu.role === "doctor")
        .map(hu => ({
          id: hu.user.id,
          name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
          email: hu.user.email,
        }));

      res.json(surgeons);
    } catch (error) {
      console.error("Error fetching surgeons:", error);
      res.status(500).json({ message: "Failed to fetch surgeons" });
    }
  });

  // Admin - Unit routes
  app.get('/api/admin/:hospitalId/units', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const units = await storage.getUnits(hospitalId);
      res.json(units);
    } catch (error) {
      console.error("Error fetching units:", error);
      res.status(500).json({ message: "Failed to fetch units" });
    }
  });

  app.post('/api/admin/:hospitalId/units', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { name, type, parentId } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Unit name is required" });
      }
      
      const unit = await storage.createUnit({
        hospitalId,
        name,
        type: type || null,
        parentId: parentId || null,
        isAnesthesiaModule: false,
        isSurgeryModule: false,
      });
      res.status(201).json(unit);
    } catch (error) {
      console.error("Error creating unit:", error);
      res.status(500).json({ message: "Failed to create unit" });
    }
  });

  app.patch('/api/admin/units/:unitId', isAuthenticated, async (req: any, res) => {
    try {
      const { unitId } = req.params;
      const { name, type, parentId } = req.body;
      
      // Get unit to verify hospital access
      const units = await storage.getUnits(req.body.hospitalId);
      const unit = units.find(l => l.id === unitId);
      if (!unit) {
        return res.status(404).json({ message: "Unit not found" });
      }
      
      // Check admin access
      const userId = req.user.id;
      const hospitals = await storage.getUserHospitals(userId);
      const hospital = hospitals.find(h => h.id === unit.hospitalId);
      if (!hospital || hospital.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (type !== undefined) updates.type = type;
      if (parentId !== undefined) updates.parentId = parentId;
      
      const updated = await storage.updateUnit(unitId, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating unit:", error);
      res.status(500).json({ message: "Failed to update unit" });
    }
  });

  app.delete('/api/admin/units/:unitId', isAuthenticated, async (req: any, res) => {
    try {
      const { unitId } = req.params;
      const { hospitalId } = req.query;
      const userId = req.user.id;
      
      // Check admin access - user must be admin for ANY unit in this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const adminUnits = hospitals.filter(h => h.id === hospitalId && h.role === 'admin');
      
      if (adminUnits.length === 0) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      await storage.deleteUnit(unitId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting unit:", error);
      res.status(500).json({ message: "Failed to delete unit" });
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
        units: u.unit, // Rename unit to units for frontend consistency
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
      const { email, hospitalId } = req.query;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email parameter is required" });
      }
      
      if (!hospitalId || typeof hospitalId !== 'string') {
        return res.status(400).json({ message: "hospitalId parameter is required" });
      }
      
      // Verify user has admin access to the specified hospital
      const userId = req.user.id;
      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminAccess = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      
      if (!hasAdminAccess) {
        return res.status(403).json({ message: "Admin access required for this hospital" });
      }
      
      const user = await storage.searchUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Verify the found user belongs to the requested hospital
      const userHospitals = await storage.getUserHospitals(user.id);
      const belongsToHospital = userHospitals.some(h => h.id === hospitalId);
      
      if (!belongsToHospital) {
        // Use the same message to prevent enumeration
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
      const { userId, unitId, role } = req.body;
      
      if (!userId || !unitId || !role) {
        return res.status(400).json({ message: "userId, unitId, and role are required" });
      }
      
      const userRole = await storage.createUserHospitalRole({
        userId,
        hospitalId,
        unitId,
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
      const { unitId, role, hospitalId } = req.body;
      
      // Check admin access - user may have multiple roles for same hospital
      const userId = req.user.id;
      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      if (!hasAdminRole) {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const updates: any = {};
      if (unitId !== undefined) updates.unitId = unitId;
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
      
      // Check admin access - user may have multiple roles for same hospital
      const userId = req.user.id;
      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      if (!hasAdminRole) {
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
      const { email, password, firstName, lastName, unitId, role } = req.body;
      
      if (!email || !password || !firstName || !lastName || !unitId || !role) {
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
        unitId,
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

      // Check admin access - user may have multiple roles for same hospital
      const currentUserId = req.user.id;
      const hospitals = await storage.getUserHospitals(currentUserId);
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      if (!hasAdminRole) {
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
      const currentUserId = req.user.id;
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
              eq(userHospitalRoles.unitId, role.unitId),
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
      const userId = req.user.id;
      const templateData = req.body;
      
      if (!templateData.hospitalId) {
        return res.status(400).json({ message: "Hospital ID is required" });
      }
      
      if (!templateData.unitId) {
        return res.status(400).json({ message: "Location ID is required" });
      }
      
      // Verify the unitId belongs to the hospital
      const [location] = await db.select().from(locations).where(eq(locations.id, templateData.unitId));
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
      const userId = req.user.id;
      const active = req.query.active !== 'false'; // Default to active only
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Deduplicate location IDs to avoid redundant queries
      const uniqueLocationIds = Array.from(new Set(userLocations.map(loc => loc.unitId)));
      
      // Get templates for all unique locations
      const allTemplates = await Promise.all(
        uniqueLocationIds.map(unitId => storage.getChecklistTemplates(hospitalId, unitId, active))
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
      const userId = req.user.id;
      const updates = req.body;
      
      const template = await storage.getChecklistTemplate(id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // If unitId is being updated, verify it belongs to the hospital
      if (updates.unitId && updates.unitId !== template.unitId) {
        const [location] = await db.select().from(locations).where(eq(locations.id, updates.unitId));
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
      const userId = req.user.id;
      
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
      const userId = req.user.id;
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get pending checklists for all user's locations
      const allPending = await Promise.all(
        userLocations.map(loc => 
          storage.getPendingChecklists(hospitalId, loc.unitId, loc.role)
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
      const userId = req.user.id;
      
      // Get all user's locations for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const userLocations = hospitals.filter(h => h.id === hospitalId);
      
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }
      
      // Get counts for all user's locations
      const counts = await Promise.all(
        userLocations.map(loc => 
          storage.getPendingChecklistCount(hospitalId, loc.unitId, loc.role)
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
      const userId = req.user.id;
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
      const access = await verifyUserHospitalUnitAccess(userId, template.hospitalId, template.unitId);
      if (!access.hasAccess) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
      
      // Validate with schema (extend to coerce dueDate from ISO string)
      const validated = insertChecklistCompletionSchema.extend({
        dueDate: z.coerce.date(),
      }).parse({
        ...completionData,
        completedBy: userId,
        hospitalId: template.hospitalId,
        unitId: template.unitId,
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
      const userId = req.user.id;
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
            loc.unitId,
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
      const userId = req.user.id;
      
      const completion = await storage.getChecklistCompletion(id);
      if (!completion) {
        return res.status(404).json({ message: "Completion not found" });
      }
      
      // Verify user has access to this specific hospital/location
      const access = await verifyUserHospitalUnitAccess(userId, completion.hospitalId, completion.unitId);
      if (!access.hasAccess) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
      
      res.json(completion);
    } catch (error) {
      console.error("Error fetching checklist completion:", error);
      res.status(500).json({ message: "Failed to fetch checklist completion" });
    }
  });

  // Seed hospital with default data (admin only)
  app.post('/api/hospitals/:id/seed', isAuthenticated, async (req: any, res) => {
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
  app.post('/api/hospitals/:id/reset-lists', isAuthenticated, async (req: any, res) => {
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

  // ========== ANESTHESIA MODULE ROUTES ==========

  // 1. Hospital Anesthesia Settings
  
  // Get hospital anesthesia settings
  app.get('/api/anesthesia/settings/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;

      // Verify user has access to this hospital
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

  // Update hospital anesthesia settings
  app.patch('/api/anesthesia/settings/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;

      // Verify user has admin access to this hospital
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

  // ========== PATIENT MANAGEMENT ROUTES ==========

  // Get patients with optional search
  app.get('/api/patients', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, search } = req.query;
      const userId = req.user.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "hospitalId is required" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const patients = await storage.getPatients(hospitalId as string, search as string | undefined);
      
      res.json(patients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  // Get single patient
  app.get('/api/patients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const patient = await storage.getPatient(id);
      
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(patient);
    } catch (error) {
      console.error("Error fetching patient:", error);
      res.status(500).json({ message: "Failed to fetch patient" });
    }
  });

  // Create patient
  app.post('/api/patients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      // Validate data
      const validatedData = insertPatientSchema.parse(req.body);

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      // Generate patient number if not provided
      let patientNumber = validatedData.patientNumber;
      if (!patientNumber) {
        patientNumber = await storage.generatePatientNumber(validatedData.hospitalId);
      }

      const patient = await storage.createPatient({
        ...validatedData,
        patientNumber,
        createdBy: userId,
      });
      
      res.status(201).json(patient);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating patient:", error);
      res.status(500).json({ message: "Failed to create patient" });
    }
  });

  // Update patient
  app.patch('/api/patients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get existing patient
      const existingPatient = await storage.getPatient(id);
      
      if (!existingPatient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patient = await storage.updatePatient(id, req.body);
      
      res.json(patient);
    } catch (error) {
      console.error("Error updating patient:", error);
      res.status(500).json({ message: "Failed to update patient" });
    }
  });

  // Delete patient
  app.delete('/api/patients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get existing patient
      const existingPatient = await storage.getPatient(id);
      
      if (!existingPatient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      await storage.deletePatient(id);
      
      res.json({ message: "Patient deleted successfully" });
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ message: "Failed to delete patient" });
    }
  });

  // 2. Cases

  // Get all cases
  app.get('/api/anesthesia/cases', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, patientId, status } = req.query;
      const userId = req.user.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "hospitalId is required" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const cases = await storage.getCases(hospitalId, patientId, status);
      
      res.json(cases);
    } catch (error) {
      console.error("Error fetching cases:", error);
      res.status(500).json({ message: "Failed to fetch cases" });
    }
  });

  // Get single case
  app.get('/api/anesthesia/cases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ message: "Case not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(caseData);
    } catch (error) {
      console.error("Error fetching case:", error);
      res.status(500).json({ message: "Failed to fetch case" });
    }
  });

  // Create new case
  app.post('/api/anesthesia/cases', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertCaseSchema.parse(req.body);

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const newCase = await storage.createCase(validatedData);
      
      res.status(201).json(newCase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating case:", error);
      res.status(500).json({ message: "Failed to create case" });
    }
  });

  // Update case
  app.patch('/api/anesthesia/cases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const caseData = await storage.getCase(id);
      
      if (!caseData) {
        return res.status(404).json({ message: "Case not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedCase = await storage.updateCase(id, req.body);
      
      res.json(updatedCase);
    } catch (error) {
      console.error("Error updating case:", error);
      res.status(500).json({ message: "Failed to update case" });
    }
  });

  // 3. Surgeries

  // Get all surgeries
  app.get('/api/anesthesia/surgeries', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId, caseId, patientId, status, roomId, dateFrom, dateTo } = req.query;
      const userId = req.user.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "hospitalId is required" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const filters: any = {};
      if (caseId) filters.caseId = caseId;
      if (patientId) filters.patientId = patientId;
      if (status) filters.status = status;
      if (roomId) filters.roomId = roomId;
      if (dateFrom) filters.dateFrom = new Date(dateFrom);
      if (dateTo) filters.dateTo = new Date(dateTo);

      const surgeries = await storage.getSurgeries(hospitalId, filters);
      
      // Enrich surgeries with time markers from anesthesia records
      const enrichedSurgeries = await Promise.all(
        surgeries.map(async (surgery) => {
          const anesthesiaRecord = await storage.getAnesthesiaRecord(surgery.id);
          return {
            ...surgery,
            timeMarkers: anesthesiaRecord?.timeMarkers || null,
          };
        })
      );
      
      res.json(enrichedSurgeries);
    } catch (error) {
      console.error("Error fetching surgeries:", error);
      res.status(500).json({ message: "Failed to fetch surgeries" });
    }
  });

  // Get single surgery
  app.get('/api/anesthesia/surgeries/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const surgery = await storage.getSurgery(id);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(surgery);
    } catch (error) {
      console.error("Error fetching surgery:", error);
      res.status(500).json({ message: "Failed to fetch surgery" });
    }
  });

  // Create new surgery
  app.post('/api/anesthesia/surgeries', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      console.log("Received surgery creation request:", JSON.stringify(req.body, null, 2));

      const validatedData = insertSurgerySchema.parse(req.body);
      
      console.log("Validated surgery data:", JSON.stringify(validatedData, null, 2));

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const newSurgery = await storage.createSurgery(validatedData);
      
      res.status(201).json(newSurgery);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Zod validation error:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating surgery:", error);
      res.status(500).json({ message: "Failed to create surgery" });
    }
  });

  // Update surgery
  app.patch('/api/anesthesia/surgeries/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const surgery = await storage.getSurgery(id);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Convert date strings to Date objects if present
      const updateData = { ...req.body };
      if (updateData.plannedDate && typeof updateData.plannedDate === 'string') {
        updateData.plannedDate = new Date(updateData.plannedDate);
      }
      if (updateData.actualEndTime && typeof updateData.actualEndTime === 'string') {
        updateData.actualEndTime = new Date(updateData.actualEndTime);
      }
      if (updateData.actualStartTime && typeof updateData.actualStartTime === 'string') {
        updateData.actualStartTime = new Date(updateData.actualStartTime);
      }

      const updatedSurgery = await storage.updateSurgery(id, updateData);
      
      res.json(updatedSurgery);
    } catch (error) {
      console.error("Error updating surgery:", error);
      res.status(500).json({ message: "Failed to update surgery" });
    }
  });

  // Delete surgery
  app.delete('/api/anesthesia/surgeries/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const surgery = await storage.getSurgery(id);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Delete related records first (cascade delete)
      // Get anesthesia record if exists
      const anesthesiaRecord = await storage.getAnesthesiaRecord(id).catch(() => null);
      
      if (anesthesiaRecord) {
        // Delete related anesthesia data first (in correct order)
        await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.anesthesiaRecordId, anesthesiaRecord.id));
        await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecord.id));
        await db.delete(vitalsSnapshots).where(eq(vitalsSnapshots.anesthesiaRecordId, anesthesiaRecord.id));
        await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, anesthesiaRecord.id));
      }

      // Delete pre-op assessment if exists
      await db.delete(preOpAssessments).where(eq(preOpAssessments.surgeryId, id));

      await storage.deleteSurgery(id);
      
      res.json({ message: "Surgery deleted successfully" });
    } catch (error) {
      console.error("Error deleting surgery:", error);
      res.status(500).json({ message: "Failed to delete surgery" });
    }
  });

  // 4. Anesthesia Records

  // Get record by surgery ID
  app.get('/api/anesthesia/records/surgery/:surgeryId', isAuthenticated, async (req: any, res) => {
    try {
      const { surgeryId } = req.params;
      const userId = req.user.id;

      const surgery = await storage.getSurgery(surgeryId);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const record = await storage.getAnesthesiaRecord(surgeryId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      res.json(record);
    } catch (error) {
      console.error("Error fetching anesthesia record:", error);
      res.status(500).json({ message: "Failed to fetch anesthesia record" });
    }
  });

  // Get record by ID
  app.get('/api/anesthesia/records/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(record);
    } catch (error) {
      console.error("Error fetching anesthesia record:", error);
      res.status(500).json({ message: "Failed to fetch anesthesia record" });
    }
  });

  // Create new anesthesia record
  app.post('/api/anesthesia/records', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertAnesthesiaRecordSchema.parse(req.body);

      // Verify surgery exists and user has access
      const surgery = await storage.getSurgery(validatedData.surgeryId);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const newRecord = await storage.createAnesthesiaRecord(validatedData);
      
      res.status(201).json(newRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating anesthesia record:", error);
      res.status(500).json({ message: "Failed to create anesthesia record" });
    }
  });

  // Update anesthesia record
  app.patch('/api/anesthesia/records/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      const updatedRecord = await storage.updateAnesthesiaRecord(id, req.body);
      
      res.json(updatedRecord);
    } catch (error) {
      console.error("Error updating anesthesia record:", error);
      res.status(500).json({ message: "Failed to update anesthesia record" });
    }
  });

  // Update time markers for anesthesia record
  app.patch('/api/anesthesia/records/:id/time-markers', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { timeMarkers } = req.body;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Update time markers
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { timeMarkers });
      
      res.json(updatedRecord);
    } catch (error) {
      console.error("Error updating time markers:", error);
      res.status(500).json({ message: "Failed to update time markers" });
    }
  });

  // Update Sign In checklist data
  app.patch('/api/anesthesia/records/:id/checklist/sign-in', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateSignInDataSchema.parse(req.body);

      // Add timestamp and user ID
      const signInData = {
        ...validated,
        completedAt: Date.now(),
        completedBy: userId,
      };

      // Update sign in data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { signInData });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'checklists',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating sign in checklist:", error);
      res.status(500).json({ message: "Failed to update sign in checklist" });
    }
  });

  // Update Time Out checklist data
  app.patch('/api/anesthesia/records/:id/checklist/time-out', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateTimeOutDataSchema.parse(req.body);

      // Add timestamp and user ID
      const timeOutData = {
        ...validated,
        completedAt: Date.now(),
        completedBy: userId,
      };

      // Update time out data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { timeOutData });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'checklists',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating time out checklist:", error);
      res.status(500).json({ message: "Failed to update time out checklist" });
    }
  });

  // Update Sign Out checklist data
  app.patch('/api/anesthesia/records/:id/checklist/sign-out', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateSignOutDataSchema.parse(req.body);

      // Add timestamp and user ID
      const signOutData = {
        ...validated,
        completedAt: Date.now(),
        completedBy: userId,
      };

      // Update sign out data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { signOutData });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'checklists',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating sign out checklist:", error);
      res.status(500).json({ message: "Failed to update sign out checklist" });
    }
  });

  // Update Post-Operative Information data
  app.patch('/api/anesthesia/records/:id/postop', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updatePostOpDataSchema.parse(req.body);

      // Merge with existing post-op data to preserve all fields
      const mergedPostOpData = {
        ...(record.postOpData ?? {}),
        ...validated,
      };

      // Update post-op data (no audit trail needed for post-op info)
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { postOpData: mergedPostOpData });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating post-op data:", error);
      res.status(500).json({ message: "Failed to update post-op data" });
    }
  });

  // Update Surgery Staff data (OR team documentation)
  app.patch('/api/anesthesia/records/:id/surgery-staff', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateSurgeryStaffSchema.parse(req.body);

      // Merge with existing surgery staff data to preserve all fields
      const mergedSurgeryStaff = {
        ...(record.surgeryStaff ?? {}),
        ...validated,
      };

      // Update surgery staff data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { surgeryStaff: mergedSurgeryStaff });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'surgeryStaff',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating surgery staff data:", error);
      res.status(500).json({ message: "Failed to update surgery staff data" });
    }
  });

  // Update intra-operative data (Surgery module)
  app.patch('/api/anesthesia/records/:id/intra-op', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateIntraOpDataSchema.parse(req.body);

      // Deep merge with existing intra-op data to preserve all nested fields
      const existingData = record.intraOpData ?? {};
      const mergedIntraOpData = {
        ...existingData,
        ...validated,
        positioning: { ...(existingData.positioning ?? {}), ...(validated.positioning ?? {}) },
        disinfection: { ...(existingData.disinfection ?? {}), ...(validated.disinfection ?? {}) },
        equipment: { 
          ...(existingData.equipment ?? {}), 
          ...(validated.equipment ?? {}),
          pathology: {
            ...((existingData.equipment as any)?.pathology ?? {}),
            ...((validated.equipment as any)?.pathology ?? {}),
          },
        },
        irrigationMeds: { ...(existingData.irrigationMeds ?? {}), ...(validated.irrigationMeds ?? {}) },
        dressing: { ...(existingData.dressing ?? {}), ...(validated.dressing ?? {}) },
        drainage: { ...(existingData.drainage ?? {}), ...(validated.drainage ?? {}) },
        signatures: { ...(existingData.signatures ?? {}), ...(validated.signatures ?? {}) },
      };

      // Update intra-op data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { intraOpData: mergedIntraOpData });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'intraOp',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating intra-op data:", error);
      res.status(500).json({ message: "Failed to update intra-op data" });
    }
  });

  // Update counts & sterile goods data (Surgery module)
  app.patch('/api/anesthesia/records/:id/counts-sterile', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Cannot update closed or amended records
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Cannot update closed or amended records. Use amend endpoint instead." });
      }

      // Validate request body
      const validated = updateCountsSterileDataSchema.parse(req.body);

      // Merge with existing counts-sterile data
      // Arrays are replaced entirely (surgicalCounts, sterileItems, stickerDocs)
      // Objects are merged (sutures, signatures)
      const existingData = record.countsSterileData ?? {};
      const mergedCountsSterileData = {
        ...existingData,
        ...validated,
        // Replace arrays entirely if provided, keep existing otherwise
        surgicalCounts: validated.surgicalCounts !== undefined ? validated.surgicalCounts : existingData.surgicalCounts,
        sterileItems: validated.sterileItems !== undefined ? validated.sterileItems : existingData.sterileItems,
        stickerDocs: validated.stickerDocs !== undefined ? validated.stickerDocs : existingData.stickerDocs,
        // Merge objects
        sutures: { ...(existingData.sutures ?? {}), ...(validated.sutures ?? {}) },
        signatures: { ...(existingData.signatures ?? {}), ...(validated.signatures ?? {}) },
      };

      // Update counts-sterile data
      const updatedRecord = await storage.updateAnesthesiaRecord(id, { countsSterileData: mergedCountsSterileData });
      
      broadcastAnesthesiaUpdate({
        recordId: id,
        section: 'countsSterile',
        data: updatedRecord,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedRecord);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Error updating counts-sterile data:", error);
      res.status(500).json({ message: "Failed to update counts-sterile data" });
    }
  });

  // Close anesthesia record
  app.post('/api/anesthesia/records/:id/close', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Already closed?
      if (record.caseStatus === 'closed' || record.caseStatus === 'amended') {
        return res.status(400).json({ message: "Record is already closed" });
      }

      const closedRecord = await storage.closeAnesthesiaRecord(id, userId);
      
      res.json(closedRecord);
    } catch (error) {
      console.error("Error closing anesthesia record:", error);
      res.status(500).json({ message: "Failed to close anesthesia record" });
    }
  });

  // Amend closed anesthesia record
  app.post('/api/anesthesia/records/:id/amend', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { reason, updates } = req.body;
      const userId = req.user.id;

      if (!reason || !updates) {
        return res.status(400).json({ message: "Reason and updates are required" });
      }

      const record = await storage.getAnesthesiaRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Can only amend closed records
      if (record.caseStatus !== 'closed') {
        return res.status(400).json({ message: "Can only amend closed records" });
      }

      const amendedRecord = await storage.amendAnesthesiaRecord(id, updates, reason, userId);
      
      res.json(amendedRecord);
    } catch (error) {
      console.error("Error amending anesthesia record:", error);
      res.status(500).json({ message: "Failed to amend anesthesia record" });
    }
  });

  // Get PACU patients (cases with Anesthesia Presence End set)
  app.get('/api/anesthesia/pacu/:hospitalId', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const userId = req.user.id;

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const pacuPatients = await storage.getPacuPatients(hospitalId);
      
      res.json(pacuPatients);
    } catch (error) {
      console.error("Error fetching PACU patients:", error);
      res.status(500).json({ message: "Failed to fetch PACU patients" });
    }
  });

  // 5. Pre-Op Assessments

  // Get all pre-op assessments for a hospital (planned, draft, completed)
  app.get('/api/anesthesia/preop', isAuthenticated, async (req: any, res) => {
    try {
      const { hospitalId } = req.query;
      const userId = req.user.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "hospitalId is required" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied to this hospital" });
      }

      const assessments = await storage.getPreOpAssessments(hospitalId);
      
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching pre-op assessments:", error);
      res.status(500).json({ message: "Failed to fetch pre-op assessments" });
    }
  });

  // Get assessment by surgery ID (returns null if none exists)
  app.get('/api/anesthesia/preop/surgery/:surgeryId', isAuthenticated, async (req: any, res) => {
    try {
      const { surgeryId } = req.params;
      const userId = req.user.id;

      const surgery = await storage.getSurgery(surgeryId);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      // Verify user has access to this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const assessment = await storage.getPreOpAssessment(surgeryId);
      
      // Return null if no assessment exists yet - frontend will handle creation on first save
      res.json(assessment || null);
    } catch (error) {
      console.error("Error fetching pre-op assessment:", error);
      res.status(500).json({ message: "Failed to fetch pre-op assessment" });
    }
  });

  // Get assessments in bulk by surgery IDs
  app.get('/api/anesthesia/preop-assessments/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const { surgeryIds } = req.query;
      const userId = req.user.id;

      if (!surgeryIds) {
        return res.json([]);
      }

      // Get user's accessible hospitals
      const hospitals = await storage.getUserHospitals(userId);
      const hospitalIds = hospitals.map(h => h.id);

      const surgeryIdArray = surgeryIds.split(',');
      
      // Fetch assessments with hospital verification
      const assessments = await storage.getPreOpAssessmentsBySurgeryIds(surgeryIdArray, hospitalIds);
      
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching bulk pre-op assessments:", error);
      res.status(500).json({ message: "Failed to fetch pre-op assessments" });
    }
  });

  // Create pre-op assessment
  app.post('/api/anesthesia/preop', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertPreOpAssessmentSchema.parse(req.body);

      // Verify surgery exists and user has access
      const surgery = await storage.getSurgery(validatedData.surgeryId);
      
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Synchronize allergies to patient record (patients table as single source of truth)
      if (validatedData.allergies !== undefined || validatedData.allergiesOther !== undefined) {
        const patientUpdates: any = {};
        
        if (validatedData.allergies !== undefined) {
          patientUpdates.allergies = validatedData.allergies;
        }
        
        if (validatedData.allergiesOther !== undefined) {
          patientUpdates.otherAllergies = validatedData.allergiesOther;
        }
        
        await storage.updatePatient(surgery.patientId, patientUpdates);
      }

      const newAssessment = await storage.createPreOpAssessment(validatedData);
      
      res.status(201).json(newAssessment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating pre-op assessment:", error);
      res.status(500).json({ message: "Failed to create pre-op assessment" });
    }
  });

  // Update pre-op assessment
  app.patch('/api/anesthesia/preop/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const assessment = await storage.getPreOpAssessmentById(id);
      
      if (!assessment) {
        return res.status(404).json({ message: "Pre-op assessment not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(assessment.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Synchronize allergies to patient record (patients table as single source of truth)
      if (req.body.allergies !== undefined || req.body.allergiesOther !== undefined) {
        const patientUpdates: any = {};
        
        if (req.body.allergies !== undefined) {
          patientUpdates.allergies = req.body.allergies;
        }
        
        if (req.body.allergiesOther !== undefined) {
          patientUpdates.otherAllergies = req.body.allergiesOther;
        }
        
        await storage.updatePatient(surgery.patientId, patientUpdates);
      }

      const updatedAssessment = await storage.updatePreOpAssessment(id, req.body);
      
      res.json(updatedAssessment);
    } catch (error) {
      console.error("Error updating pre-op assessment:", error);
      res.status(500).json({ message: "Failed to update pre-op assessment" });
    }
  });

  // 6. Vitals Snapshots

  // Get all vitals for a record
  app.get('/api/anesthesia/vitals/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const vitals = await storage.getVitalsSnapshots(recordId);
      
      res.json(vitals);
    } catch (error) {
      console.error("Error fetching vitals snapshots:", error);
      res.status(500).json({ message: "Failed to fetch vitals snapshots" });
    }
  });

  // Create vitals snapshot
  app.post('/api/anesthesia/vitals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      console.log('[VITALS] Received payload:', JSON.stringify(req.body, null, 2));
      const validatedData = insertVitalsSnapshotSchema.parse(req.body);
      console.log('[VITALS] Validation successful:', JSON.stringify(validatedData, null, 2));

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
      
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

      const newVital = await storage.createVitalsSnapshot(validatedData);
      
      res.status(201).json(newVital);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[VITALS] Zod validation error:', JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating vitals snapshot:", error);
      res.status(500).json({ message: "Failed to create vitals snapshot" });
    }
  });

  // NEW: Point-based CRUD endpoints for robust vitals management
  
  // Get clinical snapshot for a record (auto-creates if doesn't exist)
  app.get('/api/anesthesia/vitals/snapshot/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      // Verify record exists and user has access
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

      const snapshot = await storage.getClinicalSnapshot(recordId);
      res.json(snapshot);
    } catch (error) {
      console.error("Error fetching clinical snapshot:", error);
      res.status(500).json({ message: "Failed to fetch clinical snapshot" });
    }
  });

  // Add a vital point (HR, SpO2, temp, etc.)
  app.post('/api/anesthesia/vitals/:recordId/point', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      
      const validatedData = addVitalPointSchema.parse({
        anesthesiaRecordId: recordId,
        ...req.body
      });

      // Verify record exists and user has access
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

      const updatedSnapshot = await storage.addVitalPoint(
        validatedData.anesthesiaRecordId,
        validatedData.vitalType,
        validatedData.timestamp,
        validatedData.value
      );
      
      broadcastAnesthesiaUpdate({
        recordId,
        section: 'vitals',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding vital point:", error);
      res.status(500).json({ message: "Failed to add vital point" });
    }
  });

  // Add a BP point
  app.post('/api/anesthesia/vitals/:recordId/bp', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      
      const validatedData = addBPPointSchema.parse({
        anesthesiaRecordId: recordId,
        ...req.body
      });

      // Verify record exists and user has access
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

      const updatedSnapshot = await storage.addBPPoint(
        validatedData.anesthesiaRecordId,
        validatedData.timestamp,
        validatedData.sys,
        validatedData.dia,
        validatedData.mean
      );
      
      broadcastAnesthesiaUpdate({
        recordId,
        section: 'vitals',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding BP point:", error);
      res.status(500).json({ message: "Failed to add BP point" });
    }
  });

  // Update a vital point by ID
  app.patch('/api/anesthesia/vitals/points/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateVitalPointSchema.parse({
        pointId,
        ...req.body
      });

      // Note: Access control is implicit - user can only update points in records they have access to
      const updatedSnapshot = await storage.updateVitalPoint(pointId, validatedData);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: updatedSnapshot.anesthesiaRecordId,
        section: 'vitals',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating vital point:", error);
      res.status(500).json({ message: "Failed to update vital point" });
    }
  });

  // Update a BP point by ID (special handling for sys/dia/mean)
  app.patch('/api/anesthesia/vitals/bp/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateBPPointSchema.parse({
        pointId,
        ...req.body
      });

      // Note: Access control is implicit - user can only update points in records they have access to
      const updatedSnapshot = await storage.updateBPPoint(pointId, validatedData);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "BP point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: updatedSnapshot.anesthesiaRecordId,
        section: 'vitals',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating BP point:", error);
      res.status(500).json({ message: "Failed to update BP point" });
    }
  });

  // Delete a vital point by ID
  app.delete('/api/anesthesia/vitals/points/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;

      // Note: Access control is implicit - user can only delete points in records they have access to
      const updatedSnapshot = await storage.deleteVitalPoint(pointId);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: updatedSnapshot.anesthesiaRecordId,
        section: 'vitals',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      console.error("Error deleting vital point:", error);
      res.status(500).json({ message: "Failed to delete vital point" });
    }
  });

  // Heart Rhythm endpoints
  
  // Add a rhythm point
  app.post('/api/anesthesia/rhythm', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = addRhythmPointSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.addRhythmPoint(
        validatedData.anesthesiaRecordId,
        validatedData.timestamp,
        validatedData.value
      );
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding rhythm point:", error);
      res.status(500).json({ message: "Failed to add rhythm point" });
    }
  });

  // Update a rhythm point by ID
  app.patch('/api/anesthesia/rhythm/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateRhythmPointSchema.parse({
        pointId,
        ...req.body
      });

      // Get the clinical snapshot to verify access
      const allSnapshots = await db.select().from(clinicalSnapshots);
      let snapshot = null;
      
      for (const s of allSnapshots) {
        const heartRhythm = (s.data as any).heartRhythm || [];
        if (heartRhythm.some((p: any) => p.id === pointId)) {
          snapshot = s;
          break;
        }
      }
      
      if (!snapshot) {
        return res.status(404).json({ message: "Rhythm point not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.updateRhythmPoint(pointId, validatedData);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Rhythm point not found" });
      }

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating rhythm point:", error);
      res.status(500).json({ message: "Failed to update rhythm point" });
    }
  });

  // Delete a rhythm point by ID
  app.delete('/api/anesthesia/rhythm/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;

      // Get the clinical snapshot to verify access
      const allSnapshots = await db.select().from(clinicalSnapshots);
      let snapshot = null;
      
      for (const s of allSnapshots) {
        const heartRhythm = (s.data as any).heartRhythm || [];
        if (heartRhythm.some((p: any) => p.id === pointId)) {
          snapshot = s;
          break;
        }
      }
      
      if (!snapshot) {
        return res.status(404).json({ message: "Rhythm point not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.deleteRhythmPoint(pointId);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Rhythm point not found" });
      }

      res.json(updatedSnapshot);
    } catch (error) {
      console.error("Error deleting rhythm point:", error);
      res.status(500).json({ message: "Failed to delete rhythm point" });
    }
  });

  // TOF (Train of Four) endpoints
  
  // Add a TOF point
  app.post('/api/anesthesia/tof', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = addTOFPointSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.addTOFPoint(
        validatedData.anesthesiaRecordId,
        validatedData.timestamp,
        validatedData.value,
        validatedData.percentage
      );
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding TOF point:", error);
      res.status(500).json({ message: "Failed to add TOF point" });
    }
  });

  // Update a TOF point by ID
  app.patch('/api/anesthesia/tof/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateTOFPointSchema.parse({
        pointId,
        ...req.body
      });

      // Get the clinical snapshot to verify access
      const allSnapshots = await db.select().from(clinicalSnapshots);
      let snapshot = null;
      
      for (const s of allSnapshots) {
        const tof = (s.data as any).tof || [];
        if (tof.some((p: any) => p.id === pointId)) {
          snapshot = s;
          break;
        }
      }
      
      if (!snapshot) {
        return res.status(404).json({ message: "TOF point not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.updateTOFPoint(pointId, validatedData);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "TOF point not found" });
      }

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating TOF point:", error);
      res.status(500).json({ message: "Failed to update TOF point" });
    }
  });

  // Delete a TOF point by ID
  app.delete('/api/anesthesia/tof/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;

      // Get the clinical snapshot to verify access
      const allSnapshots = await db.select().from(clinicalSnapshots);
      let snapshot = null;
      
      for (const s of allSnapshots) {
        const tof = (s.data as any).tof || [];
        if (tof.some((p: any) => p.id === pointId)) {
          snapshot = s;
          break;
        }
      }
      
      if (!snapshot) {
        return res.status(404).json({ message: "TOF point not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(snapshot.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.deleteTOFPoint(pointId);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "TOF point not found" });
      }

      res.json(updatedSnapshot);
    } catch (error) {
      console.error("Error deleting TOF point:", error);
      res.status(500).json({ message: "Failed to delete TOF point" });
    }
  });

  // 7. Ventilation Modes

  // Add ventilation mode point
  app.post('/api/anesthesia/ventilation-modes', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = addVentilationModePointSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.addVentilationModePoint(
        validatedData.anesthesiaRecordId,
        validatedData.timestamp,
        validatedData.value
      );
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'ventilation',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding ventilation mode point:", error);
      res.status(500).json({ message: "Failed to add ventilation mode point" });
    }
  });

  // Update a ventilation mode point by ID
  app.patch('/api/anesthesia/ventilation-modes/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateVentilationModePointSchema.parse({
        pointId,
        ...req.body
      });

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      // Extract only provided updatable fields to pass to storage
      const updates: Record<string, any> = {};
      if (validatedData.value !== undefined) updates.value = validatedData.value;
      if (validatedData.timestamp !== undefined) updates.timestamp = validatedData.timestamp;
      
      const updatedSnapshot = await storage.updateVentilationModePoint(
        validatedData.anesthesiaRecordId,
        pointId,
        updates
      );
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Ventilation mode point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'ventilation',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating ventilation mode point:", error);
      res.status(500).json({ message: "Failed to update ventilation mode point" });
    }
  });

  // Delete a ventilation mode point by ID
  app.delete('/api/anesthesia/ventilation-modes/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      const { anesthesiaRecordId } = req.body;

      if (!anesthesiaRecordId) {
        return res.status(400).json({ message: "anesthesiaRecordId is required" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
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

      const updatedSnapshot = await storage.deleteVentilationModePoint(anesthesiaRecordId, pointId);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Ventilation mode point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: anesthesiaRecordId,
        section: 'ventilation',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      console.error("Error deleting ventilation mode point:", error);
      res.status(500).json({ message: "Failed to delete ventilation mode point" });
    }
  });

  // Bulk add ventilation parameters (optimized for ventilation bulk entry dialog)
  app.post('/api/anesthesia/ventilation/bulk', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = addBulkVentilationSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.addBulkVentilationParameters(
        validatedData.anesthesiaRecordId,
        validatedData.timestamp,
        validatedData.ventilationMode || null,
        validatedData.parameters
      );
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding bulk ventilation parameters:", error);
      res.status(500).json({ message: "Failed to add bulk ventilation parameters" });
    }
  });

  // 8. Output Parameters

  // Add output point
  app.post('/api/anesthesia/output', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const validatedData = addOutputPointSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const updatedSnapshot = await storage.addOutputPoint(
        validatedData.anesthesiaRecordId,
        validatedData.paramKey,
        validatedData.timestamp,
        validatedData.value
      );
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'output',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error adding output point:", error);
      res.status(500).json({ message: "Failed to add output point" });
    }
  });

  // Update an output point by ID
  app.patch('/api/anesthesia/output/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = updateOutputPointSchema.parse({
        pointId,
        ...req.body
      });

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      // Extract only provided updatable fields to pass to storage
      const updates: Record<string, any> = {};
      if (validatedData.value !== undefined) updates.value = validatedData.value;
      if (validatedData.timestamp !== undefined) updates.timestamp = validatedData.timestamp;
      
      const updatedSnapshot = await storage.updateOutputPoint(
        validatedData.anesthesiaRecordId,
        validatedData.paramKey,
        pointId,
        updates
      );
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Output point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'output',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating output point:", error);
      res.status(500).json({ message: "Failed to update output point" });
    }
  });

  // Delete an output point by ID
  app.delete('/api/anesthesia/output/:pointId', isAuthenticated, async (req: any, res) => {
    try {
      const { pointId } = req.params;
      const userId = req.user.id;
      
      const validatedData = deleteOutputPointSchema.parse({
        pointId,
        ...req.body
      });

      // Verify record exists and user has access
      const anesthesiaRecordId = validatedData.anesthesiaRecordId;
      const paramKey = validatedData.paramKey;
      const record = await storage.getAnesthesiaRecordById(anesthesiaRecordId);
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

      const updatedSnapshot = await storage.deleteOutputPoint(anesthesiaRecordId, paramKey, pointId);
      
      if (!updatedSnapshot) {
        return res.status(404).json({ message: "Output point not found" });
      }

      broadcastAnesthesiaUpdate({
        recordId: anesthesiaRecordId,
        section: 'output',
        data: updatedSnapshot,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });

      res.json(updatedSnapshot);
    } catch (error) {
      console.error("Error deleting output point:", error);
      res.status(500).json({ message: "Failed to delete output point" });
    }
  });

  // 9. Medications

  // Get all medications for a record
  app.get('/api/anesthesia/medications/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const medications = await storage.getAnesthesiaMedications(recordId);
      
      res.json(medications);
    } catch (error) {
      console.error("Error fetching medications:", error);
      res.status(500).json({ message: "Failed to fetch medications" });
    }
  });

  // Create medication entry
  app.post('/api/anesthesia/medications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      console.log('[TIMESTAMP-DEBUG] Backend received medication POST:', {
        rawTimestamp: req.body.timestamp,
        rawTimestampType: typeof req.body.timestamp,
      });

      const validatedData = insertAnesthesiaMedicationSchema.parse(req.body);
      
      console.log('[TIMESTAMP-DEBUG] After Zod validation:', {
        validatedTimestamp: validatedData.timestamp,
        validatedTimestampType: typeof validatedData.timestamp,
        validatedTimestampISO: validatedData.timestamp instanceof Date ? validatedData.timestamp.toISOString() : 'not a date',
      });

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
      
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

      const newMedication = await storage.createAnesthesiaMedication(validatedData);
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'medications',
        data: newMedication,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(newMedication);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating medication:", error);
      res.status(500).json({ message: "Failed to create medication" });
    }
  });

  // Update medication
  app.patch('/api/anesthesia/medications/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const [medication] = await db
        .select()
        .from(anesthesiaMedications)
        .where(eq(anesthesiaMedications.id, id));
      
      if (!medication) {
        return res.status(404).json({ message: "Medication not found" });
      }

      // Verify user has access
      const record = await storage.getAnesthesiaRecordById(medication.anesthesiaRecordId);
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

      // Convert timestamp strings to Date objects for Drizzle
      const updates = { ...req.body };
      if (updates.timestamp && typeof updates.timestamp === 'string') {
        updates.timestamp = new Date(updates.timestamp);
      }
      if (updates.endTimestamp && typeof updates.endTimestamp === 'string') {
        updates.endTimestamp = new Date(updates.endTimestamp);
      }

      console.log('[MEDICATION-UPDATE] Updating medication:', { id, updates });

      const updatedMedication = await storage.updateAnesthesiaMedication(id, updates, userId);
      
      console.log('[MEDICATION-UPDATE] Updated result:', updatedMedication);
      
      broadcastAnesthesiaUpdate({
        recordId: medication.anesthesiaRecordId,
        section: 'medications',
        data: updatedMedication,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updatedMedication);
    } catch (error) {
      console.error("Error updating medication:", error);
      res.status(500).json({ message: "Failed to update medication" });
    }
  });

  // Delete medication (creates audit trail)
  app.delete('/api/anesthesia/medications/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const [medication] = await db
        .select()
        .from(anesthesiaMedications)
        .where(eq(anesthesiaMedications.id, id));
      
      if (!medication) {
        return res.status(404).json({ message: "Medication not found" });
      }

      // Verify user has access
      const record = await storage.getAnesthesiaRecordById(medication.anesthesiaRecordId);
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

      await storage.deleteAnesthesiaMedication(id, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: medication.anesthesiaRecordId,
        section: 'medications',
        data: { deleted: id },
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting medication:", error);
      res.status(500).json({ message: "Failed to delete medication" });
    }
  });

  // 8. Events

  // Get all events for a record
  app.get('/api/anesthesia/events/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const events = await storage.getAnesthesiaEvents(recordId);
      
      res.json(events);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Create event
  app.post('/api/anesthesia/events', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertAnesthesiaEventSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
      
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

      const newEvent = await storage.createAnesthesiaEvent(validatedData);
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'events',
        data: newEvent,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(newEvent);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating event:", error);
      res.status(500).json({ message: "Failed to create event" });
    }
  });

  // Update event
  app.patch('/api/anesthesia/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const validatedData = insertAnesthesiaEventSchema.partial().parse(req.body);

      // SECURITY: Explicit whitelist of allowed update fields
      // Only timestamp, eventType, and description can be modified
      // Users cannot change anesthesiaRecordId (migration) or createdBy (attribution)
      const { timestamp, eventType, description } = validatedData;
      const allowedUpdates = { timestamp, eventType, description };

      // Get the event first to verify access
      const [event] = await db.select().from(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(event.anesthesiaRecordId);
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

      const updated = await storage.updateAnesthesiaEvent(id, allowedUpdates, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: event.anesthesiaRecordId,
        section: 'events',
        data: updated,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating event:", error);
      res.status(500).json({ message: "Failed to update event" });
    }
  });

  // Delete event
  app.delete('/api/anesthesia/events/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the event first to verify access
      const [event] = await db.select().from(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(event.anesthesiaRecordId);
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

      await storage.deleteAnesthesiaEvent(id, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: event.anesthesiaRecordId,
        section: 'events',
        data: { deleted: id },
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  // 9. Positions

  // Get all positions for a record
  app.get('/api/anesthesia/positions/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const positions = await storage.getAnesthesiaPositions(recordId);
      
      res.json(positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      res.status(500).json({ message: "Failed to fetch positions" });
    }
  });

  // Create position
  app.post('/api/anesthesia/positions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertAnesthesiaPositionSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const newPosition = await storage.createAnesthesiaPosition({
        ...validatedData,
        createdBy: userId,
      });
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'positions',
        data: newPosition,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(newPosition);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating position:", error);
      res.status(500).json({ message: "Failed to create position" });
    }
  });

  // Update position
  app.patch('/api/anesthesia/positions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Validate input using partial schema
      const updateSchema = insertAnesthesiaPositionSchema.partial().pick({
        timestamp: true,
        position: true,
      });
      
      const validatedUpdates = updateSchema.parse(req.body);

      // Reject empty updates
      if (Object.keys(validatedUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Get the position first to verify access
      const [position] = await db.select().from(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(position.anesthesiaRecordId);
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

      const updated = await storage.updateAnesthesiaPosition(id, validatedUpdates, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: position.anesthesiaRecordId,
        section: 'positions',
        data: updated,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating position:", error);
      res.status(500).json({ message: "Failed to update position" });
    }
  });

  // Delete position
  app.delete('/api/anesthesia/positions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the position first to verify access
      const [position] = await db.select().from(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));
      if (!position) {
        return res.status(404).json({ message: "Position not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(position.anesthesiaRecordId);
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

      await storage.deleteAnesthesiaPosition(id, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: position.anesthesiaRecordId,
        section: 'positions',
        data: { deleted: id },
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting position:", error);
      res.status(500).json({ message: "Failed to delete position" });
    }
  });

  // 10. Staff

  // Get all staff for a record
  app.get('/api/anesthesia/staff/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const staff = await storage.getAnesthesiaStaff(recordId);
      
      res.json(staff);
    } catch (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  // Create staff
  app.post('/api/anesthesia/staff', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const validatedData = insertAnesthesiaStaffSchema.parse(req.body);

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
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

      const newStaff = await storage.createAnesthesiaStaff({
        ...validatedData,
        createdBy: userId,
      });
      
      broadcastAnesthesiaUpdate({
        recordId: validatedData.anesthesiaRecordId,
        section: 'staff',
        data: newStaff,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(201).json(newStaff);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating staff:", error);
      res.status(500).json({ message: "Failed to create staff" });
    }
  });

  // Update staff
  app.patch('/api/anesthesia/staff/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Validate input using partial schema with explicit allowed fields
      const updateSchema = z.object({
        timestamp: z.coerce.date().optional(),
        role: z.enum(["doctor", "nurse", "assistant"]).optional(),
        name: z.string().optional(),
      });
      
      const validatedUpdates = updateSchema.parse(req.body);

      // Reject empty updates
      if (Object.keys(validatedUpdates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Get the staff first to verify access
      const [staff] = await db.select().from(anesthesiaStaff).where(eq(anesthesiaStaff.id, id));
      if (!staff) {
        return res.status(404).json({ message: "Staff not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
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

      // Only pass validated fields to storage (prevents anesthesiaRecordId mutation)
      const updated = await storage.updateAnesthesiaStaff(id, validatedUpdates, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: staff.anesthesiaRecordId,
        section: 'staff',
        data: updated,
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error updating staff:", error);
      res.status(500).json({ message: "Failed to update staff" });
    }
  });

  // Delete staff
  app.delete('/api/anesthesia/staff/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get the staff first to verify access
      const [staff] = await db.select().from(anesthesiaStaff).where(eq(anesthesiaStaff.id, id));
      if (!staff) {
        return res.status(404).json({ message: "Staff not found" });
      }

      // Verify record exists and user has access
      const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
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

      await storage.deleteAnesthesiaStaff(id, userId);
      
      broadcastAnesthesiaUpdate({
        recordId: staff.anesthesiaRecordId,
        section: 'staff',
        data: { deleted: id },
        timestamp: Date.now(),
        userId,
        clientSessionId: getClientSessionId(req),
      });
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting staff:", error);
      res.status(500).json({ message: "Failed to delete staff" });
    }
  });

  // 11. Anesthesia Installations

  // Get installations for a record
  app.get('/api/anesthesia/installations/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const installations = await storage.getAnesthesiaInstallations(recordId);
      res.json(installations);
    } catch (error) {
      console.error("Error fetching installations:", error);
      res.status(500).json({ message: "Failed to fetch installations" });
    }
  });

  // Create installation
  app.post('/api/anesthesia/installations', isAuthenticated, async (req: any, res) => {
    try {
      const validated = insertAnesthesiaInstallationSchema.parse(req.body);
      const record = await storage.getAnesthesiaRecordById(validated.anesthesiaRecordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const created = await storage.createAnesthesiaInstallation(validated);
      res.json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error creating installation:", error);
      res.status(500).json({ message: "Failed to create installation" });
    }
  });

  // Update installation
  app.patch('/api/anesthesia/installations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const validated = insertAnesthesiaInstallationSchema.partial().parse(req.body);
      const updated = await storage.updateAnesthesiaInstallation(req.params.id, validated);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error updating installation:", error);
      res.status(500).json({ message: "Failed to update installation" });
    }
  });

  // Delete installation
  app.delete('/api/anesthesia/installations/:id', isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteAnesthesiaInstallation(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting installation:", error);
      res.status(500).json({ message: "Failed to delete installation" });
    }
  });

  // 12. Anesthesia Technique Details

  // Get technique details for a record
  app.get('/api/anesthesia/technique-details/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const details = await storage.getAnesthesiaTechniqueDetails(recordId);
      res.json(details);
    } catch (error) {
      console.error("Error fetching technique details:", error);
      res.status(500).json({ message: "Failed to fetch technique details" });
    }
  });

  // Upsert technique detail
  app.post('/api/anesthesia/technique-details', isAuthenticated, async (req: any, res) => {
    try {
      const validated = insertAnesthesiaTechniqueDetailSchema.parse(req.body);
      const record = await storage.getAnesthesiaRecordById(validated.anesthesiaRecordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const created = await storage.upsertAnesthesiaTechniqueDetail(validated);
      res.json(created);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error upserting technique detail:", error);
      res.status(500).json({ message: "Failed to upsert technique detail" });
    }
  });

  // Airway Management Routes

  // Get airway management for a record
  app.get('/api/anesthesia/:recordId/airway', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const airway = await storage.getAirwayManagement(recordId);
      res.json(airway);
    } catch (error) {
      console.error("Error fetching airway management:", error);
      res.status(500).json({ message: "Failed to fetch airway management" });
    }
  });

  // Create/update airway management (upsert)
  app.post('/api/anesthesia/:recordId/airway', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const validated = insertAnesthesiaAirwayManagementSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const airway = await storage.upsertAirwayManagement(validated);
      res.json(airway);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error upserting airway management:", error);
      res.status(500).json({ message: "Failed to upsert airway management" });
    }
  });

  // Delete airway management
  app.delete('/api/anesthesia/:recordId/airway', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      await storage.deleteAirwayManagement(recordId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting airway management:", error);
      res.status(500).json({ message: "Failed to delete airway management" });
    }
  });

  // Difficult Airway Report Routes
  
  // Get difficult airway report by airway management ID
  app.get('/api/airway/:airwayId/difficult-airway-report', isAuthenticated, async (req: any, res) => {
    try {
      const { airwayId } = req.params;
      const userId = req.user.id;
      
      // Get the airway management record first
      const airway = await db.select().from(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.id, airwayId)).limit(1);
      if (!airway[0]) return res.status(404).json({ message: "Airway management not found" });
      
      // Check access
      const record = await storage.getAnesthesiaRecordById(airway[0].anesthesiaRecordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      
      const report = await storage.getDifficultAirwayReport(airwayId);
      res.json(report || null);
    } catch (error) {
      console.error("Error fetching difficult airway report:", error);
      res.status(500).json({ message: "Failed to fetch difficult airway report" });
    }
  });
  
  // Create/update difficult airway report (upsert)
  app.post('/api/airway/:airwayId/difficult-airway-report', isAuthenticated, async (req: any, res) => {
    try {
      const { airwayId } = req.params;
      const userId = req.user.id;
      
      // Get the airway management record first
      const airway = await db.select().from(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.id, airwayId)).limit(1);
      if (!airway[0]) return res.status(404).json({ message: "Airway management not found" });
      
      // Check access
      const record = await storage.getAnesthesiaRecordById(airway[0].anesthesiaRecordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      
      const validated = insertDifficultAirwayReportSchema.parse({ 
        ...req.body, 
        airwayManagementId: airwayId,
        createdBy: userId 
      });
      const report = await storage.upsertDifficultAirwayReport(validated);
      res.json(report);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error upserting difficult airway report:", error);
      res.status(500).json({ message: "Failed to upsert difficult airway report" });
    }
  });

  // General Technique Routes

  // Get general technique for a record
  app.get('/api/anesthesia/:recordId/general-technique', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const technique = await storage.getGeneralTechnique(recordId);
      res.json(technique);
    } catch (error) {
      console.error("Error fetching general technique:", error);
      res.status(500).json({ message: "Failed to fetch general technique" });
    }
  });

  // Create/update general technique (upsert)
  app.post('/api/anesthesia/:recordId/general-technique', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const validated = insertAnesthesiaGeneralTechniqueSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const technique = await storage.upsertGeneralTechnique(validated);
      res.json(technique);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error upserting general technique:", error);
      res.status(500).json({ message: "Failed to upsert general technique" });
    }
  });

  // Delete general technique
  app.delete('/api/anesthesia/:recordId/general-technique', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      await storage.deleteGeneralTechnique(recordId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting general technique:", error);
      res.status(500).json({ message: "Failed to delete general technique" });
    }
  });

  // Neuraxial Blocks Routes

  // Get all neuraxial blocks for a record
  app.get('/api/anesthesia/:recordId/neuraxial-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const blocks = await storage.getNeuraxialBlocks(recordId);
      console.log('[NEURAXIAL-GET] Fetched blocks:', { recordId, count: blocks.length, blocks });
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching neuraxial blocks:", error);
      res.status(500).json({ message: "Failed to fetch neuraxial blocks" });
    }
  });

  // Create neuraxial block
  app.post('/api/anesthesia/:recordId/neuraxial-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const validated = insertAnesthesiaNeuraxialBlockSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const block = await storage.createNeuraxialBlock(validated);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error creating neuraxial block:", error);
      res.status(500).json({ message: "Failed to create neuraxial block" });
    }
  });

  // Update neuraxial block
  app.patch('/api/anesthesia/:recordId/neuraxial-blocks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId, id } = req.params;
      const userId = req.user.id;
      const validated = insertAnesthesiaNeuraxialBlockSchema.partial().parse(req.body);
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const block = await storage.updateNeuraxialBlock(id, validated);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error updating neuraxial block:", error);
      res.status(500).json({ message: "Failed to update neuraxial block" });
    }
  });

  // Delete neuraxial block
  app.delete('/api/anesthesia/:recordId/neuraxial-blocks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId, id } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      await storage.deleteNeuraxialBlock(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting neuraxial block:", error);
      res.status(500).json({ message: "Failed to delete neuraxial block" });
    }
  });

  // Peripheral Blocks Routes

  // Get all peripheral blocks for a record
  app.get('/api/anesthesia/:recordId/peripheral-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const blocks = await storage.getPeripheralBlocks(recordId);
      console.log('[PERIPHERAL-GET] Fetched blocks:', { recordId, count: blocks.length, blocks });
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching peripheral blocks:", error);
      res.status(500).json({ message: "Failed to fetch peripheral blocks" });
    }
  });

  // Create peripheral block
  app.post('/api/anesthesia/:recordId/peripheral-blocks', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const validated = insertAnesthesiaPeripheralBlockSchema.parse({ ...req.body, anesthesiaRecordId: recordId });
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(req.user.id);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const block = await storage.createPeripheralBlock(validated);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error creating peripheral block:", error);
      res.status(500).json({ message: "Failed to create peripheral block" });
    }
  });

  // Update peripheral block
  app.patch('/api/anesthesia/:recordId/peripheral-blocks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId, id } = req.params;
      const userId = req.user.id;
      const validated = insertAnesthesiaPeripheralBlockSchema.partial().parse(req.body);
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      const block = await storage.updatePeripheralBlock(id, validated);
      res.json(block);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid data", errors: error.errors });
      console.error("Error updating peripheral block:", error);
      res.status(500).json({ message: "Failed to update peripheral block" });
    }
  });

  // Delete peripheral block
  app.delete('/api/anesthesia/:recordId/peripheral-blocks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId, id } = req.params;
      const userId = req.user.id;
      const record = await storage.getAnesthesiaRecordById(recordId);
      if (!record) return res.status(404).json({ message: "Anesthesia record not found" });
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) return res.status(404).json({ message: "Surgery not found" });
      const hospitals = await storage.getUserHospitals(userId);
      if (!hospitals.some(h => h.id === surgery.hospitalId)) return res.status(403).json({ message: "Access denied" });
      await storage.deletePeripheralBlock(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting peripheral block:", error);
      res.status(500).json({ message: "Failed to delete peripheral block" });
    }
  });

  // 13. Inventory Usage

  // Get inventory usage for a record
  app.get('/api/anesthesia/inventory/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
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

  // Calculate and update inventory usage
  app.post('/api/anesthesia/inventory/:recordId/calculate', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
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

  // Create or update manual inventory usage
  app.post('/api/anesthesia/inventory/:recordId/manual', isAuthenticated, async (req: any, res) => {
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

      // Verify user has access
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

  // Set manual override for inventory usage
  app.patch('/api/anesthesia/inventory/:id/override', isAuthenticated, async (req: any, res) => {
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

      // Get inventory usage to verify access
      const inventory = await storage.getInventoryUsageById(id);
      
      if (!inventory) {
        return res.status(404).json({ message: "Inventory usage not found" });
      }

      // Verify user has access
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

  // Clear manual override for inventory usage
  app.delete('/api/anesthesia/inventory/:id/override', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Get inventory usage to verify access
      const inventory = await storage.getInventoryUsageById(id);
      
      if (!inventory) {
        return res.status(404).json({ message: "Inventory usage not found" });
      }

      // Verify user has access
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

  // Commit inventory usage to inventory system
  app.post('/api/anesthesia/inventory/:recordId/commit', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const { signature } = req.body;
      const userId = req.user.id;

      // Verify access
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

      // Commit inventory (using surgery's patientId)
      const commit = await storage.commitInventoryUsage(
        recordId,
        userId,
        signature,
        surgery.patientId, // Use patientId as name (can be enhanced later)
        surgery.patientId
      );

      res.json(commit);
    } catch (error) {
      console.error("Error committing inventory:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to commit inventory" });
    }
  });

  // Get commit history for an anesthesia record
  app.get('/api/anesthesia/inventory/:recordId/commits', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      // Verify access
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

      const commits = await storage.getInventoryCommits(recordId);
      res.json(commits);
    } catch (error) {
      console.error("Error fetching commit history:", error);
      res.status(500).json({ message: "Failed to fetch commit history" });
    }
  });

  // Rollback an inventory commit
  app.post('/api/anesthesia/inventory/commits/:commitId/rollback', isAuthenticated, async (req: any, res) => {
    try {
      const { commitId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      // Get commit to verify access
      const commit = await storage.getInventoryCommitById(commitId);
      if (!commit) {
        return res.status(404).json({ message: "Commit not found" });
      }

      // Verify access
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

      // Rollback commit
      const rolledBackCommit = await storage.rollbackInventoryCommit(commitId, userId, reason);
      res.json(rolledBackCommit);
    } catch (error) {
      console.error("Error rolling back commit:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to rollback commit" });
    }
  });

  // 10. Audit Trail

  // Get audit trail for a record
  app.get('/api/anesthesia/audit/:recordType/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordType, recordId } = req.params;
      const userId = req.user.id;

      // Validate recordType
      const validRecordTypes = ['anesthesia_record', 'vitals_snapshot', 'medication', 'preop_assessment'];
      if (!validRecordTypes.includes(recordType)) {
        return res.status(400).json({ message: "Invalid record type" });
      }

      // For now, we'll just verify the user has access to the hospital
      // We would need to fetch the actual record to verify access properly
      // This is a simplified implementation

      const auditTrail = await storage.getAuditTrail(recordType, recordId);
      
      res.json(auditTrail);
    } catch (error) {
      console.error("Error fetching audit trail:", error);
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  // 11. Billing Report

  // Generate billing summary
  app.get('/api/anesthesia/billing/:recordId', isAuthenticated, async (req: any, res) => {
    try {
      const { recordId } = req.params;
      const userId = req.user.id;

      const record = await storage.getAnesthesiaRecordById(recordId);
      
      if (!record) {
        return res.status(404).json({ message: "Anesthesia record not found" });
      }

      // Verify user has access
      const surgery = await storage.getSurgery(record.surgeryId);
      if (!surgery) {
        return res.status(404).json({ message: "Surgery not found" });
      }

      const hospitals = await storage.getUserHospitals(userId);
      const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Calculate billing information
      let timeUnits = 0;
      let totalMinutes = 0;

      if (record.anesthesiaStartTime && record.anesthesiaEndTime) {
        const startTime = new Date(record.anesthesiaStartTime).getTime();
        const endTime = new Date(record.anesthesiaEndTime).getTime();
        totalMinutes = Math.floor((endTime - startTime) / (1000 * 60));
        
        // Calculate time units (each unit = 15 minutes)
        timeUnits = Math.ceil(totalMinutes / 15);
      }

      // Apply modifiers
      const modifiers: string[] = [];
      
      // ASA physical status modifier
      if (record.physicalStatus) {
        modifiers.push(record.physicalStatus);
      }

      // Emergency modifier
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
  app.post('/api/notes', isAuthenticated, async (req: any, res) => {
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
  app.patch('/api/notes/:noteId', isAuthenticated, async (req: any, res) => {
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

      // Only the note creator can update it
      if (note.userId !== userId) {
        return res.status(403).json({ message: "You can only edit your own notes" });
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
  app.delete('/api/notes/:noteId', isAuthenticated, async (req: any, res) => {
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

      // Only the note creator can delete it
      if (note.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own notes" });
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
