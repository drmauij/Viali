import { Router } from "express";
import type { Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, units, hospitals, workerContracts, insertWorkerContractSchema, supplierCodes, surgeries, anesthesiaRecords, surgeryStaffEntries, inventoryCommits, items, providerTimeOff, patientQuestionnaireResponses, patientQuestionnaireLinks, referralEvents, patients, clinicAppointments } from "@shared/schema";
import { eq, and, inArray, ne, desc, gte, lte, isNull, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { sendSignedContractEmail, sendTimeOffDeclinedEmail } from "../resend";
import { expandRecurringTimeOff } from "../utils/timeoff";
import logger from "../logger";
import { z } from "zod";

const router = Router();

// Middleware to check business module access (admin, manager, or staff role)
async function isBusinessAccess(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => 
      h.id === hospitalId && 
      (h.role === 'admin' || h.role === 'manager' || h.role === 'staff')
    );
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Business access required" });
    }
    
    next();
  } catch (error) {
    logger.error("Error checking business access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// Middleware to check business manager access (admin or manager role only - for sensitive staff data)
async function isBusinessManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => 
      h.id === hospitalId && 
      (h.role === 'admin' || h.role === 'manager')
    );
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Business manager access required" });
    }
    
    next();
  } catch (error) {
    logger.error("Error checking business access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// Get all staff members for a hospital (for business dashboard)
router.get('/api/business/:hospitalId/staff', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get all users associated with this hospital, excluding admin roles
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    // Group by user ID to deduplicate (one entry per user, not per role)
    // Hourly rate is per user, not per role
    const userMap = new Map<string, {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      roles: Array<{ role: string; unitId: string | null; unitName: string | null; unitType: string | null }>;
      staffType: string;
      hourlyRate: number | null;
      weeklyTargetHours: number | null;
      overtimeBalanceMinutes: number | null;
      canLogin: boolean;
      createdAt: Date | null;
    }>();
    
    for (const u of hospitalUsers) {
      if (u.role === 'admin') continue; // Skip admin roles
      
      const existing = userMap.get(u.user.id);
      const roleInfo = {
        role: u.role,
        unitId: u.unitId,
        unitName: u.unit?.name || null,
        unitType: u.unit?.type || null,
      };
      
      if (existing) {
        // Add role to existing user
        existing.roles.push(roleInfo);
      } else {
        // Create new user entry
        userMap.set(u.user.id, {
          id: u.user.id,
          firstName: u.user.firstName,
          lastName: u.user.lastName,
          email: u.user.email,
          roles: [roleInfo],
          staffType: (u.user as any).staffType || 'internal',
          hourlyRate: (u.user as any).hourlyRate ? parseFloat((u.user as any).hourlyRate) : null,
          weeklyTargetHours: (u.user as any).weeklyTargetHours ? parseFloat((u.user as any).weeklyTargetHours) : null,
          overtimeBalanceMinutes: (u.user as any).overtimeBalanceMinutes ?? null,
          canLogin: (u.user as any).canLogin ?? true,
          createdAt: u.user.createdAt,
        });
      }
    }
    
    const staffList = Array.from(userMap.values());
    res.json(staffList);
  } catch (error) {
    logger.error("Error fetching staff:", error);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
});

// Create a new staff member (without app access by default)
router.post('/api/business/:hospitalId/staff', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { firstName, lastName, email, role, unitId, hourlyRate, staffType } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First name and last name are required" });
    }
    
    if (!role || role === 'admin') {
      return res.status(400).json({ message: "Valid non-admin role is required" });
    }
    
    if (!unitId) {
      return res.status(400).json({ message: "Unit is required" });
    }
    
    // Verify unit belongs to this hospital
    const [unit] = await db
      .select()
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
    
    if (!unit) {
      return res.status(400).json({ message: "Invalid unit for this hospital" });
    }
    
    // Generate email if not provided
    const userEmail = email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${nanoid(6)}@staff.local`;
    
    // Check if email already exists
    const existingUser = await storage.searchUserByEmail(userEmail);
    if (existingUser) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }
    
    // Create user with canLogin = false by default (staff without app access)
    const [newUser] = await db
      .insert(users)
      .values({
        email: userEmail,
        firstName,
        lastName,
        canLogin: false,
        staffType: staffType || 'internal',
        hourlyRate: hourlyRate ? String(hourlyRate) : null,
      })
      .returning();
    
    // Create hospital role assignment
    await db
      .insert(userHospitalRoles)
      .values({
        userId: newUser.id,
        hospitalId,
        unitId,
        role,
      });
    
    res.status(201).json({
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role,
      unitId,
      unitName: unit.name,
      staffType: newUser.staffType,
      hourlyRate: newUser.hourlyRate ? parseFloat(newUser.hourlyRate) : null,
      canLogin: newUser.canLogin,
    });
  } catch (error) {
    logger.error("Error creating staff:", error);
    res.status(500).json({ message: "Failed to create staff member" });
  }
});

// Update staff member
router.patch('/api/business/:hospitalId/staff/:userId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { firstName, lastName, email, role, unitId, hourlyRate, staffType, weeklyTargetHours, overtimeBalanceMinutes, annualVacationDays } = req.body;

    // Verify user belongs to this hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalRole = userHospitals.find(h => h.id === hospitalId);

    if (!hospitalRole) {
      return res.status(404).json({ message: "Staff member not found in this hospital" });
    }

    const isAdminUser = hospitalRole.role === 'admin';

    // Prevent changing to admin role
    if (role === 'admin') {
      return res.status(403).json({ message: "Cannot assign admin role from business dashboard" });
    }

    // Build user update object - hourlyRate, staffType, weeklyTargetHours, overtimeBalanceMinutes can always be edited
    const userUpdates: any = {};

    // For admin users, only allow editing hourlyRate, staffType, and business-level fields
    if (isAdminUser) {
      if (hourlyRate !== undefined) userUpdates.hourlyRate = hourlyRate ? String(hourlyRate) : null;
      if (staffType !== undefined) userUpdates.staffType = staffType;
    } else {
      // For non-admin users, allow editing name and other fields too
      if (firstName !== undefined) userUpdates.firstName = firstName;
      if (lastName !== undefined) userUpdates.lastName = lastName;
      // Email is read-only, don't update it
      if (hourlyRate !== undefined) userUpdates.hourlyRate = hourlyRate ? String(hourlyRate) : null;
      if (staffType !== undefined) userUpdates.staffType = staffType;
    }
    // Business-level fields — editable for all users
    if (weeklyTargetHours !== undefined) {
      userUpdates.weeklyTargetHours = weeklyTargetHours === null || weeklyTargetHours === '' ? null : String(weeklyTargetHours);
    }
    if (overtimeBalanceMinutes !== undefined) {
      userUpdates.overtimeBalanceMinutes = overtimeBalanceMinutes === null || overtimeBalanceMinutes === '' ? null : parseInt(overtimeBalanceMinutes);
    }
    if (annualVacationDays !== undefined) {
      userUpdates.annualVacationDays = annualVacationDays === null || annualVacationDays === '' ? null : parseInt(annualVacationDays);
    }
    
    // Update user if there are changes
    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updatedAt = new Date();
      await db
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, userId));
    }
    
    // Update role/unit if provided (but not for admin users)
    if (!isAdminUser && (role !== undefined || unitId !== undefined)) {
      // Verify unit belongs to hospital if unitId is provided
      if (unitId) {
        const [unit] = await db
          .select()
          .from(units)
          .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
        
        if (!unit) {
          return res.status(400).json({ message: "Invalid unit for this hospital" });
        }
      }
      
      // Get the user's role record for this hospital
      const [existingRole] = await db
        .select()
        .from(userHospitalRoles)
        .where(and(
          eq(userHospitalRoles.userId, userId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        ));
      
      if (existingRole) {
        const roleUpdates: any = {};
        if (role !== undefined) roleUpdates.role = role;
        if (unitId !== undefined) roleUpdates.unitId = unitId;
        
        await db
          .update(userHospitalRoles)
          .set(roleUpdates)
          .where(eq(userHospitalRoles.id, existingRole.id));
      }
    }
    
    // Fetch updated user data
    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    const updatedHospitals = await storage.getUserHospitals(userId);
    const updatedRole = updatedHospitals.find(h => h.id === hospitalId);
    
    res.json({
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedRole?.role,
      unitId: updatedRole?.unitId,
      staffType: updatedUser.staffType,
      hourlyRate: updatedUser.hourlyRate ? parseFloat(updatedUser.hourlyRate) : null,
      weeklyTargetHours: updatedUser.weeklyTargetHours ? parseFloat(updatedUser.weeklyTargetHours) : null,
      overtimeBalanceMinutes: updatedUser.overtimeBalanceMinutes ?? null,
      canLogin: updatedUser.canLogin,
    });
  } catch (error) {
    logger.error("Error updating staff:", error);
    res.status(500).json({ message: "Failed to update staff member" });
  }
});

// Toggle staff type (internal/external)
router.patch('/api/business/:hospitalId/staff/:userId/type', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { staffType } = req.body;
    
    if (!staffType || !['internal', 'external'].includes(staffType)) {
      return res.status(400).json({ message: "Invalid staff type. Must be 'internal' or 'external'" });
    }
    
    // Verify user belongs to this hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalRole = userHospitals.find(h => h.id === hospitalId);
    
    if (!hospitalRole) {
      return res.status(404).json({ message: "Staff member not found in this hospital" });
    }
    
    // Update staff type
    await db
      .update(users)
      .set({ staffType, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    res.json({ success: true, staffType });
  } catch (error) {
    logger.error("Error updating staff type:", error);
    res.status(500).json({ message: "Failed to update staff type" });
  }
});

// Get available units for staff assignment (non-admin units)
router.get('/api/business/:hospitalId/units', isAuthenticated, isBusinessAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospitalUnits = await db
      .select()
      .from(units)
      .where(eq(units.hospitalId, hospitalId));
    
    res.json(hospitalUnits);
  } catch (error) {
    logger.error("Error fetching units:", error);
    res.status(500).json({ message: "Failed to fetch units" });
  }
});

// Get available roles for staff assignment (excluding admin)
router.get('/api/business/roles', isAuthenticated, async (req, res) => {
  const roles = [
    { id: 'doctor', label: 'Doctor', description: 'Surgeon or Anesthesiologist' },
    { id: 'nurse', label: 'Nurse', description: 'Surgery or Anesthesia Nurse' },
    { id: 'manager', label: 'Manager', description: 'Business or Department Manager' },
    { id: 'staff', label: 'Staff', description: 'Business unit staff with limited access' },
  ];
  
  res.json(roles);
});

// ============= ROLE MANAGEMENT ENDPOINTS =============

// Get all roles for a specific user in a hospital
router.get('/api/business/:hospitalId/staff/:userId/roles', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    
    // Get all roles for this user in this hospital
    const userRoles = await db
      .select({
        id: userHospitalRoles.id,
        role: userHospitalRoles.role,
        unitId: userHospitalRoles.unitId,
        unit: units,
      })
      .from(userHospitalRoles)
      .leftJoin(units, eq(userHospitalRoles.unitId, units.id))
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
        ne(userHospitalRoles.role, 'admin') // Exclude admin roles
      ));
    
    const rolesList = userRoles.map(r => ({
      id: r.id,
      role: r.role,
      unitId: r.unitId,
      unitName: r.unit?.name || null,
      unitType: r.unit?.type || null,
    }));
    
    res.json(rolesList);
  } catch (error) {
    logger.error("Error fetching user roles:", error);
    res.status(500).json({ message: "Failed to fetch user roles" });
  }
});

// Add a new role for a user in a hospital
router.post('/api/business/:hospitalId/staff/:userId/roles', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { role, unitId } = req.body;
    
    // Validate role
    if (!role || role === 'admin') {
      return res.status(400).json({ message: "Valid non-admin role is required" });
    }
    
    if (!['doctor', 'nurse', 'manager'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'doctor', 'nurse', or 'manager'" });
    }
    
    if (!unitId) {
      return res.status(400).json({ message: "Unit is required" });
    }
    
    // Verify unit belongs to this hospital
    const [unit] = await db
      .select()
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
    
    if (!unit) {
      return res.status(400).json({ message: "Invalid unit for this hospital" });
    }
    
    // Check if user already has this exact role+unit combination
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.unitId, unitId),
        eq(userHospitalRoles.role, role)
      ));
    
    if (existingRole) {
      return res.status(400).json({ message: "User already has this role in this unit" });
    }
    
    // Create new role assignment
    const [newRole] = await db
      .insert(userHospitalRoles)
      .values({
        userId,
        hospitalId,
        unitId,
        role,
      })
      .returning();
    
    res.status(201).json({
      id: newRole.id,
      role: newRole.role,
      unitId: newRole.unitId,
      unitName: unit.name,
      unitType: unit.type,
    });
  } catch (error) {
    logger.error("Error adding user role:", error);
    res.status(500).json({ message: "Failed to add role" });
  }
});

// Update an existing role assignment
router.patch('/api/business/:hospitalId/staff/:userId/roles/:roleId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId, roleId } = req.params;
    const { role, unitId } = req.body;
    
    // Get the existing role assignment
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.id, roleId),
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (!existingRole) {
      return res.status(404).json({ message: "Role assignment not found" });
    }
    
    // Cannot modify admin roles
    if (existingRole.role === 'admin') {
      return res.status(403).json({ message: "Cannot modify admin role from business dashboard" });
    }
    
    // Cannot change to admin role
    if (role === 'admin') {
      return res.status(403).json({ message: "Cannot assign admin role from business dashboard" });
    }
    
    // Validate new role if provided
    if (role && !['doctor', 'nurse', 'manager'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'doctor', 'nurse', or 'manager'" });
    }
    
    // Verify unit belongs to hospital if provided
    let unit = null;
    if (unitId) {
      const [foundUnit] = await db
        .select()
        .from(units)
        .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
      
      if (!foundUnit) {
        return res.status(400).json({ message: "Invalid unit for this hospital" });
      }
      unit = foundUnit;
    }
    
    // Build update object
    const updates: any = {};
    if (role) updates.role = role;
    if (unitId) updates.unitId = unitId;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }
    
    // Update the role assignment
    const [updatedRole] = await db
      .update(userHospitalRoles)
      .set(updates)
      .where(eq(userHospitalRoles.id, roleId))
      .returning();
    
    // Get unit info if not already fetched
    if (!unit && updatedRole.unitId) {
      const [unitInfo] = await db
        .select()
        .from(units)
        .where(eq(units.id, updatedRole.unitId));
      unit = unitInfo;
    }
    
    res.json({
      id: updatedRole.id,
      role: updatedRole.role,
      unitId: updatedRole.unitId,
      unitName: unit?.name || null,
      unitType: unit?.type || null,
    });
  } catch (error) {
    logger.error("Error updating user role:", error);
    res.status(500).json({ message: "Failed to update role" });
  }
});

// Delete a role assignment
router.delete('/api/business/:hospitalId/staff/:userId/roles/:roleId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId, roleId } = req.params;
    
    // Get the existing role assignment
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.id, roleId),
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (!existingRole) {
      return res.status(404).json({ message: "Role assignment not found" });
    }
    
    // Cannot delete admin roles
    if (existingRole.role === 'admin') {
      return res.status(403).json({ message: "Cannot delete admin role from business dashboard" });
    }
    
    // Check if this is the user's only role in this hospital
    const userRolesCount = await db
      .select({ count: userHospitalRoles.id })
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (userRolesCount.length <= 1) {
      return res.status(400).json({ message: "Cannot delete the user's only role. Remove the user instead." });
    }
    
    // Delete the role assignment
    await db
      .delete(userHospitalRoles)
      .where(eq(userHospitalRoles.id, roleId));
    
    res.json({ success: true, message: "Role deleted successfully" });
  } catch (error) {
    logger.error("Error deleting user role:", error);
    res.status(500).json({ message: "Failed to delete role" });
  }
});

// ==================== WORKER CONTRACTS ====================

// Get contract token for a hospital (creates one if doesn't exist)
router.get('/api/business/:hospitalId/contract-token', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    let contractToken = (hospital as any).contractToken;
    
    // Generate token if doesn't exist
    if (!contractToken) {
      contractToken = crypto.randomBytes(16).toString('hex');
      await db
        .update(hospitals)
        .set({ contractToken })
        .where(eq(hospitals.id, hospitalId));
    }
    
    res.json({ contractToken });
  } catch (error) {
    logger.error("Error getting contract token:", error);
    res.status(500).json({ message: "Failed to get contract token" });
  }
});

// Regenerate contract token
router.post('/api/business/:hospitalId/contract-token/regenerate', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const newToken = crypto.randomBytes(16).toString('hex');
    
    await db
      .update(hospitals)
      .set({ contractToken: newToken })
      .where(eq(hospitals.id, hospitalId));
    
    res.json({ contractToken: newToken });
  } catch (error) {
    logger.error("Error regenerating contract token:", error);
    res.status(500).json({ message: "Failed to regenerate token" });
  }
});

// PUBLIC: Get hospital info for contract form (no auth required)
router.get('/api/public/contracts/:token/hospital', async (req, res) => {
  try {
    const { token } = req.params;
    
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.contractToken, token));
    
    if (!hospital) {
      return res.status(404).json({ message: "Invalid contract link" });
    }
    
    res.json({
      id: hospital.id,
      name: hospital.name,
      companyName: hospital.companyName || hospital.name,
      companyStreet: hospital.companyStreet || '',
      companyPostalCode: hospital.companyPostalCode || '',
      companyCity: hospital.companyCity || '',
      companyPhone: hospital.companyPhone || '',
      companyEmail: hospital.companyEmail || '',
      companyLogoUrl: hospital.companyLogoUrl || '',
    });
  } catch (error) {
    logger.error("Error fetching hospital for contract:", error);
    res.status(500).json({ message: "Failed to fetch hospital info" });
  }
});

// Simple in-memory rate limiting for public endpoints (per token)
const contractSubmitRateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_SUBMITS_PER_WINDOW = 5;

// PUBLIC: Submit a new contract (no auth required - worker submits)
router.post('/api/public/contracts/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Rate limiting check
    const now = Date.now();
    let rateLimit = contractSubmitRateLimits.get(token);
    if (rateLimit && now < rateLimit.resetAt) {
      if (rateLimit.count >= MAX_SUBMITS_PER_WINDOW) {
        return res.status(429).json({ message: "Too many requests. Please try again later." });
      }
      rateLimit.count++;
    } else {
      contractSubmitRateLimits.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    }
    
    // Payload size validation (max 2MB for signature data)
    const payloadSize = JSON.stringify(req.body).length;
    if (payloadSize > 2 * 1024 * 1024) {
      return res.status(413).json({ message: "Payload too large" });
    }
    
    // Validate signature size (max 500KB base64 string)
    if (req.body.workerSignature && req.body.workerSignature.length > 500 * 1024) {
      return res.status(413).json({ message: "Signature image too large" });
    }
    
    // Verify token
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.contractToken, token));
    
    if (!hospital) {
      return res.status(404).json({ message: "Invalid contract link" });
    }
    
    // Validate request body with schema (this ensures required fields are present)
    const contractData = insertWorkerContractSchema.parse({
      ...req.body,
      hospitalId: hospital.id,
    });
    
    // Create the contract
    const [newContract] = await db
      .insert(workerContracts)
      .values({
        ...contractData,
        status: 'pending_manager_signature',
        workerSignedAt: new Date(),
      })
      .returning();
    
    res.status(201).json(newContract);
  } catch (error) {
    logger.error("Error submitting contract:", error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ message: "Invalid contract data", errors: (error as any).errors });
    }
    res.status(500).json({ message: "Failed to submit contract" });
  }
});

// Get all contracts for a hospital (authenticated)
router.get('/api/business/:hospitalId/contracts', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const contracts = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.hospitalId, hospitalId))
      .orderBy(desc(workerContracts.createdAt));
    
    res.json(contracts);
  } catch (error) {
    logger.error("Error fetching contracts:", error);
    res.status(500).json({ message: "Failed to fetch contracts" });
  }
});

// Get a single contract
router.get('/api/business/:hospitalId/contracts/:contractId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    
    const [contract] = await db
      .select()
      .from(workerContracts)
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ));
    
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    res.json(contract);
  } catch (error) {
    logger.error("Error fetching contract:", error);
    res.status(500).json({ message: "Failed to fetch contract" });
  }
});

// Sign a contract (manager)
router.post('/api/business/:hospitalId/contracts/:contractId/sign', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    const { signature } = req.body;
    const userId = req.user.id;
    
    if (!signature) {
      return res.status(400).json({ message: "Signature is required" });
    }
    
    // Get the contract
    const [contract] = await db
      .select()
      .from(workerContracts)
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ));
    
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    if (contract.status !== 'pending_manager_signature') {
      return res.status(400).json({ message: "Contract is not pending manager signature" });
    }
    
    // Get manager name
    const user = await storage.getUser(userId);
    const managerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Manager';
    
    // Update contract with manager signature
    const [updated] = await db
      .update(workerContracts)
      .set({
        managerSignature: signature,
        managerSignedAt: new Date(),
        managerId: userId,
        managerName: managerName,
        status: 'signed',
        updatedAt: new Date(),
      })
      .where(eq(workerContracts.id, contractId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    logger.error("Error signing contract:", error);
    res.status(500).json({ message: "Failed to sign contract" });
  }
});

// Reject a contract
router.post('/api/business/:hospitalId/contracts/:contractId/reject', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    
    const [updated] = await db
      .update(workerContracts)
      .set({
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    res.json(updated);
  } catch (error) {
    logger.error("Error rejecting contract:", error);
    res.status(500).json({ message: "Failed to reject contract" });
  }
});

// Delete a contract
router.delete('/api/business/:hospitalId/contracts/:contractId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    
    await db
      .delete(workerContracts)
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting contract:", error);
    res.status(500).json({ message: "Failed to delete contract" });
  }
});

// Archive a contract
router.post('/api/business/:hospitalId/contracts/:contractId/archive', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    
    const [updated] = await db
      .update(workerContracts)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    res.json(updated);
  } catch (error) {
    logger.error("Error archiving contract:", error);
    res.status(500).json({ message: "Failed to archive contract" });
  }
});

// Unarchive a contract
router.post('/api/business/:hospitalId/contracts/:contractId/unarchive', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    
    const [updated] = await db
      .update(workerContracts)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    res.json(updated);
  } catch (error) {
    logger.error("Error unarchiving contract:", error);
    res.status(500).json({ message: "Failed to unarchive contract" });
  }
});

// Send signed contract to worker via email
router.post('/api/business/:hospitalId/contracts/:contractId/send-email', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, contractId } = req.params;
    const { pdfBase64 } = req.body;
    
    if (!pdfBase64) {
      return res.status(400).json({ message: "PDF data is required" });
    }
    
    // Get the contract
    const [contract] = await db
      .select()
      .from(workerContracts)
      .where(and(
        eq(workerContracts.id, contractId),
        eq(workerContracts.hospitalId, hospitalId)
      ));
    
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    
    if (contract.status !== 'signed') {
      return res.status(400).json({ message: "Contract must be fully signed before sending" });
    }
    
    if (!contract.email) {
      return res.status(400).json({ message: "Worker email is not available" });
    }
    
    // Get hospital/clinic name
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId));
    
    const clinicName = hospital?.name || 'Klinik';
    const workerName = `${contract.firstName} ${contract.lastName}`;
    
    // Send the email
    const result = await sendSignedContractEmail(
      contract.email,
      workerName,
      clinicName,
      pdfBase64
    );
    
    if (!result.success) {
      logger.error('Failed to send signed contract email:', result.error);
      return res.status(500).json({ message: "Failed to send email" });
    }
    
    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    logger.error("Error sending signed contract email:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
});

// Get aggregated inventory data from all units within this hospital for business module
router.get('/api/business/:hospitalId/inventory-overview', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get all units within this hospital
    const hospitalUnits = await storage.getUnits(hospitalId);
    
    // Filter to only inventory-capable units (exclude business/logistic type units)
    const inventoryUnits = hospitalUnits.filter(u => 
      u.type !== 'business' && u.type !== 'logistic' && u.showInventory !== false
    );
    
    // Aggregate items from all units within this hospital
    const allItems: any[] = [];
    for (const unit of inventoryUnits) {
      const items = await storage.getItems(hospitalId, unit.id);
      allItems.push(...items);
    }
    
    // Get supplier codes for all items in this hospital
    const allItemIds = allItems.map(item => item.id);
    let supplierCodesData: any[] = [];
    if (allItemIds.length > 0) {
      supplierCodesData = await db
        .select()
        .from(supplierCodes)
        .where(inArray(supplierCodes.itemId, allItemIds));
    }
    
    res.json({ 
      units: inventoryUnits, 
      items: allItems, 
      supplierCodes: supplierCodesData 
    });
  } catch (error) {
    logger.error("Error fetching inventory overview:", error);
    res.status(500).json({ message: "Failed to fetch inventory overview" });
  }
});

// Get aggregated inventory snapshots from all units within this hospital for business module
router.get('/api/business/:hospitalId/inventory-snapshots', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { days = 30 } = req.query;
    
    const daysBack = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const { inventorySnapshots } = await import('@shared/schema');
    const { and, gte, desc: descOrder } = await import('drizzle-orm');
    
    // Get snapshots for all units within this hospital
    const snapshots = await db.select({
      id: inventorySnapshots.id,
      hospitalId: inventorySnapshots.hospitalId,
      unitId: inventorySnapshots.unitId,
      snapshotDate: inventorySnapshots.snapshotDate,
      totalValue: inventorySnapshots.totalValue,
      itemCount: inventorySnapshots.itemCount,
    })
      .from(inventorySnapshots)
      .where(and(
        eq(inventorySnapshots.hospitalId, hospitalId),
        gte(inventorySnapshots.snapshotDate, startDateStr)
      ))
      .orderBy(descOrder(inventorySnapshots.snapshotDate));
    
    // Add unit names
    const hospitalUnits = await storage.getUnits(hospitalId);
    const unitMap = new Map(hospitalUnits.map(u => [u.id, u.name]));
    
    const snapshotsWithUnitName = snapshots.map(s => ({
      ...s,
      unitName: unitMap.get(s.unitId) || 'Unknown'
    }));
    
    res.json(snapshotsWithUnitName);
  } catch (error) {
    logger.error("Error fetching inventory snapshots:", error);
    res.status(500).json({ message: "Failed to fetch inventory snapshots" });
  }
});

// Get surgeries with cost calculations for business dashboard
router.get('/api/business/:hospitalId/surgeries', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Build date filters using raw SQL for proper date comparison
    const { sql } = await import('drizzle-orm');
    const dateFilters: any[] = [];
    
    // Always filter out future surgeries - they have no data yet
    const today = new Date().toISOString().split('T')[0];
    dateFilters.push(sql`${surgeries.plannedDate} <= ${today}::date`);
    
    if (startDate) {
      dateFilters.push(sql`${surgeries.plannedDate} >= ${startDate}::date`);
    }
    if (endDate) {
      dateFilters.push(sql`${surgeries.plannedDate} <= ${endDate}::date`);
    }
    
    // Get all surgeries for this hospital with their anesthesia records
    const surgeriesData = await db
      .select({
        surgery: surgeries,
        anesthesiaRecord: anesthesiaRecords,
      })
      .from(surgeries)
      .leftJoin(anesthesiaRecords, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        eq(surgeries.isArchived, false),
        ...dateFilters
      ))
      .orderBy(desc(surgeries.plannedDate));
    
    // Get all users with hourly rates for cost calculation
    const allUsers = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      hourlyRate: users.hourlyRate,
    }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    
    // Get all supplier prices for items (use preferred supplier or first available)
    const supplierPrices = await db.select({
      itemId: supplierCodes.itemId,
      basispreis: supplierCodes.basispreis,
      isPreferred: supplierCodes.isPreferred,
    }).from(supplierCodes);
    
    // Build map of itemId -> best price (prefer preferred supplier)
    const itemPriceMap = new Map<string, number>();
    for (const sp of supplierPrices) {
      const price = parseFloat(String(sp.basispreis || 0));
      const existing = itemPriceMap.get(sp.itemId);
      if (!existing || sp.isPreferred) {
        itemPriceMap.set(sp.itemId, price);
      }
    }
    
    // Process each surgery to calculate costs
    // Default to 60 minutes (1 hour) if no anesthesia record or no time markers
    // This ensures staff costs are calculated for LA surgeries or cases without recorded times
    const DEFAULT_DURATION_MINUTES = 60;
    
    // Define role categories for staff cost split
    const anesthesiaStaffRoles = ['anesthesiologist', 'anesthesiaNurse', 'pacuNurse'];
    const surgeryStaffRoles = ['surgeon', 'surgicalAssistant', 'instrumentNurse', 'circulatingNurse'];
    
    const results = await Promise.all(surgeriesData.map(async ({ surgery, anesthesiaRecord }) => {
      let surgeryDurationMinutes = DEFAULT_DURATION_MINUTES;
      let staffCost = 0;
      let anesthesiaStaffCost = 0;
      let surgeryStaffCost = 0;
      let anesthesiaCost = 0;
      let surgeryCost = 0;
      
      // Calculate surgery duration from time markers (X1 to A2)
      if (anesthesiaRecord?.timeMarkers) {
        const markers = anesthesiaRecord.timeMarkers as Array<{ code: string; time: number | null }>;
        const x1Marker = markers.find(m => m.code === 'X1');
        const a2Marker = markers.find(m => m.code === 'A2');
        
        if (x1Marker?.time && a2Marker?.time) {
          const calculatedDuration = Math.round((a2Marker.time - x1Marker.time) / 60000); // Convert ms to minutes
          // Use calculated duration if valid (> 0), otherwise use default
          surgeryDurationMinutes = calculatedDuration > 0 ? calculatedDuration : DEFAULT_DURATION_MINUTES;
        }
      }
      
      // Calculate staff cost - split by role type
      if (anesthesiaRecord) {
        const staffEntries = await db
          .select()
          .from(surgeryStaffEntries)
          .where(eq(surgeryStaffEntries.anesthesiaRecordId, anesthesiaRecord.id));
        
        const durationHours = surgeryDurationMinutes / 60;
        
        for (const staff of staffEntries) {
          if (staff.userId) {
            const user = userMap.get(staff.userId);
            if (user?.hourlyRate) {
              const cost = durationHours * parseFloat(String(user.hourlyRate));
              staffCost += cost;
              
              // Split by role type
              if (anesthesiaStaffRoles.includes(staff.role)) {
                anesthesiaStaffCost += cost;
              } else if (surgeryStaffRoles.includes(staff.role)) {
                surgeryStaffCost += cost;
              }
            }
          }
        }
      }
      
      // Calculate inventory costs from commits
      if (anesthesiaRecord) {
        const commits = await db
          .select()
          .from(inventoryCommits)
          .where(and(
            eq(inventoryCommits.anesthesiaRecordId, anesthesiaRecord.id),
            isNull(inventoryCommits.rolledBackAt)
          ));
        
        // Get all item IDs from commits
        const allItemIds = new Set<string>();
        for (const commit of commits) {
          const commitItems = commit.items as Array<{ itemId: string; quantity: number }>;
          commitItems.forEach(item => allItemIds.add(item.itemId));
        }
        
        // Fetch item details for pack size
        const itemIdsArray = Array.from(allItemIds);
        const itemsData = itemIdsArray.length > 0 
          ? await db.select().from(items).where(inArray(items.id, itemIdsArray))
          : [];
        const itemMap = new Map(itemsData.map(i => [i.id, i]));
        
        // Calculate costs per commit (by unit type)
        for (const commit of commits) {
          const commitItems = commit.items as Array<{ itemId: string; quantity: number }>;
          
          for (const commitItem of commitItems) {
            const item = itemMap.get(commitItem.itemId);
            if (item) {
              const supplierPrice = itemPriceMap.get(commitItem.itemId) || 0;
              const packSize = item.packSize || 1;
              const unitPrice = supplierPrice / packSize;
              const cost = unitPrice * commitItem.quantity;
              
              // Check if commit is from anesthesia unit or surgery unit
              if (commit.unitId) {
                const unit = await storage.getUnit(commit.unitId);
                if (unit?.type === 'anesthesia') {
                  anesthesiaCost += cost;
                } else {
                  surgeryCost += cost;
                }
              } else {
                // Legacy commits without unitId - assume anesthesia
                anesthesiaCost += cost;
              }
            }
          }
        }
      }
      
      // Get patient info
      const patient = surgery.patientId ? await storage.getPatient(surgery.patientId) : null;
      
      const totalCost = Math.round((staffCost + anesthesiaCost + surgeryCost) * 100) / 100;
      const paidAmount = surgery.price ? parseFloat(String(surgery.price)) : 0;
      
      // Calculate total anesthesia cost (materials + staff) and surgery cost (materials + staff)
      const anesthesiaTotalCost = anesthesiaCost + anesthesiaStaffCost;
      const surgeryTotalCost = surgeryCost + surgeryStaffCost;
      
      return {
        id: surgery.id,
        date: surgery.plannedDate,
        surgeryName: surgery.plannedSurgery || 'Unknown',
        patientName: patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() : 'Unknown',
        patientId: surgery.patientId,
        anesthesiaRecordId: anesthesiaRecord?.id || null,
        surgeryDurationMinutes,
        staffCost: Math.round(staffCost * 100) / 100,
        anesthesiaStaffCost: Math.round(anesthesiaStaffCost * 100) / 100,
        surgeryStaffCost: Math.round(surgeryStaffCost * 100) / 100,
        anesthesiaCost: Math.round(anesthesiaCost * 100) / 100,
        surgeryCost: Math.round(surgeryCost * 100) / 100,
        anesthesiaTotalCost: Math.round(anesthesiaTotalCost * 100) / 100,
        surgeryTotalCost: Math.round(surgeryTotalCost * 100) / 100,
        totalCost,
        paidAmount: Math.round(paidAmount * 100) / 100,
        difference: Math.round((paidAmount - totalCost) * 100) / 100,
        status: surgery.status,
      };
    }));
    
    res.json(results);
  } catch (error) {
    logger.error("Error fetching business surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

// Get detailed cost breakdown for a specific surgery
router.get('/api/business/:hospitalId/surgeries/:surgeryId/costs', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId, surgeryId } = req.params;
    
    // Get surgery with anesthesia record
    const [surgeryData] = await db
      .select({
        surgery: surgeries,
        anesthesiaRecord: anesthesiaRecords,
      })
      .from(surgeries)
      .leftJoin(anesthesiaRecords, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(and(
        eq(surgeries.id, surgeryId),
        eq(surgeries.hospitalId, hospitalId)
      ));
    
    if (!surgeryData) {
      return res.status(404).json({ message: "Surgery not found" });
    }
    
    const { surgery, anesthesiaRecord } = surgeryData;
    
    // Calculate surgery duration
    // Default to 60 minutes (1 hour) if no anesthesia record or no time markers
    // This ensures staff costs are calculated for LA surgeries or cases without recorded times
    const DEFAULT_DURATION_MINUTES = 60;
    let surgeryDurationMinutes = DEFAULT_DURATION_MINUTES;
    let x1Time: number | null = null;
    let a2Time: number | null = null;
    
    if (anesthesiaRecord?.timeMarkers) {
      const markers = anesthesiaRecord.timeMarkers as Array<{ code: string; time: number | null }>;
      const x1Marker = markers.find(m => m.code === 'X1');
      const a2Marker = markers.find(m => m.code === 'A2');
      
      x1Time = x1Marker?.time || null;
      a2Time = a2Marker?.time || null;
      
      if (x1Time && a2Time) {
        const calculatedDuration = Math.round((a2Time - x1Time) / 60000);
        // Use calculated duration if valid (> 0), otherwise use default
        surgeryDurationMinutes = calculatedDuration > 0 ? calculatedDuration : DEFAULT_DURATION_MINUTES;
      }
    }
    
    // Get all users with hourly rates
    const allUsers = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      hourlyRate: users.hourlyRate,
    }).from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    
    // Get staff breakdown
    const staffBreakdown: Array<{
      name: string;
      role: string;
      durationHours: number;
      hourlyRate: number;
      cost: number;
    }> = [];
    
    if (anesthesiaRecord) {
      const staffEntries = await db
        .select()
        .from(surgeryStaffEntries)
        .where(eq(surgeryStaffEntries.anesthesiaRecordId, anesthesiaRecord.id));
      
      const durationHours = surgeryDurationMinutes / 60;
      
      for (const staff of staffEntries) {
        const user = staff.userId ? userMap.get(staff.userId) : null;
        const hourlyRate = user?.hourlyRate ? parseFloat(String(user.hourlyRate)) : 0;
        const cost = durationHours * hourlyRate;
        
        staffBreakdown.push({
          name: staff.name,
          role: staff.role,
          durationHours: Math.round(durationHours * 100) / 100,
          hourlyRate,
          cost: Math.round(cost * 100) / 100,
        });
      }
    }
    
    // Get inventory breakdown
    const anesthesiaItems: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      cost: number;
    }> = [];
    const surgeryItems: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitPrice: number;
      cost: number;
    }> = [];
    
    if (anesthesiaRecord) {
      const commits = await db
        .select()
        .from(inventoryCommits)
        .where(and(
          eq(inventoryCommits.anesthesiaRecordId, anesthesiaRecord.id),
          isNull(inventoryCommits.rolledBackAt)
        ));
      
      // Get all item IDs
      const allItemIds = new Set<string>();
      for (const commit of commits) {
        const commitItems = commit.items as Array<{ itemId: string; itemName: string; quantity: number }>;
        commitItems.forEach(item => allItemIds.add(item.itemId));
      }
      
      // Fetch item details
      const itemIdsArray = Array.from(allItemIds);
      const itemsData = itemIdsArray.length > 0 
        ? await db.select().from(items).where(inArray(items.id, itemIdsArray))
        : [];
      const itemMap = new Map(itemsData.map(i => [i.id, i]));
      
      // Get supplier prices for these items
      const supplierPricesData = itemIdsArray.length > 0
        ? await db.select({
            itemId: supplierCodes.itemId,
            basispreis: supplierCodes.basispreis,
            isPreferred: supplierCodes.isPreferred,
          }).from(supplierCodes).where(inArray(supplierCodes.itemId, itemIdsArray))
        : [];
      
      // Build itemId -> price map
      const itemPriceMap = new Map<string, number>();
      for (const sp of supplierPricesData) {
        const price = parseFloat(String(sp.basispreis || 0));
        const existing = itemPriceMap.get(sp.itemId);
        if (!existing || sp.isPreferred) {
          itemPriceMap.set(sp.itemId, price);
        }
      }
      
      // Aggregate items by itemId and unit type
      const anesthesiaItemsMap = new Map<string, { name: string; quantity: number; unitPrice: number }>();
      const surgeryItemsMap = new Map<string, { name: string; quantity: number; unitPrice: number }>();
      
      for (const commit of commits) {
        const commitItems = commit.items as Array<{ itemId: string; itemName: string; quantity: number }>;
        
        // Determine if this is anesthesia or surgery commit
        let isAnesthesiaCommit = true;
        if (commit.unitId) {
          const unit = await storage.getUnit(commit.unitId);
          isAnesthesiaCommit = unit?.type === 'anesthesia';
        }
        
        const targetMap = isAnesthesiaCommit ? anesthesiaItemsMap : surgeryItemsMap;
        
        for (const commitItem of commitItems) {
          const item = itemMap.get(commitItem.itemId);
          const supplierPrice = itemPriceMap.get(commitItem.itemId) || 0;
          const packSize = item?.packSize || 1;
          const unitPrice = supplierPrice / packSize;
          
          const existing = targetMap.get(commitItem.itemId);
          if (existing) {
            existing.quantity += commitItem.quantity;
          } else {
            targetMap.set(commitItem.itemId, {
              name: commitItem.itemName || item?.name || 'Unknown',
              quantity: commitItem.quantity,
              unitPrice,
            });
          }
        }
      }
      
      // Convert maps to arrays
      Array.from(anesthesiaItemsMap.entries()).forEach(([itemId, data]) => {
        anesthesiaItems.push({
          itemId,
          itemName: data.name,
          quantity: data.quantity,
          unitPrice: Math.round(data.unitPrice * 100) / 100,
          cost: Math.round(data.quantity * data.unitPrice * 100) / 100,
        });
      });
      
      Array.from(surgeryItemsMap.entries()).forEach(([itemId, data]) => {
        surgeryItems.push({
          itemId,
          itemName: data.name,
          quantity: data.quantity,
          unitPrice: Math.round(data.unitPrice * 100) / 100,
          cost: Math.round(data.quantity * data.unitPrice * 100) / 100,
        });
      });
    }
    
    // Calculate totals
    const staffTotal = staffBreakdown.reduce((sum, s) => sum + s.cost, 0);
    const anesthesiaTotal = anesthesiaItems.reduce((sum, i) => sum + i.cost, 0);
    const surgeryTotal = surgeryItems.reduce((sum, i) => sum + i.cost, 0);
    
    // Get patient info
    const patient = surgery.patientId ? await storage.getPatient(surgery.patientId) : null;
    
    res.json({
      surgery: {
        id: surgery.id,
        date: surgery.plannedDate,
        surgeryName: surgery.plannedSurgery || 'Unknown',
        patientName: patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() : 'Unknown',
        status: surgery.status,
      },
      duration: {
        minutes: surgeryDurationMinutes,
        hours: Math.round((surgeryDurationMinutes / 60) * 100) / 100,
        x1Time,
        a2Time,
      },
      staffBreakdown,
      staffTotal: Math.round(staffTotal * 100) / 100,
      anesthesiaItems,
      anesthesiaTotal: Math.round(anesthesiaTotal * 100) / 100,
      surgeryItems,
      surgeryTotal: Math.round(surgeryTotal * 100) / 100,
      grandTotal: Math.round((staffTotal + anesthesiaTotal + surgeryTotal) * 100) / 100,
    });
  } catch (error) {
    logger.error("Error fetching surgery cost breakdown:", error);
    res.status(500).json({ message: "Failed to fetch cost breakdown" });
  }
});

// Get anesthesia nurse hours aggregated by month
router.get('/api/business/:hospitalId/anesthesia-nurse-hours', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    // Get all non-archived, non-cancelled, non-suspended surgeries with their anesthesia records
    const surgeriesData = await db
      .select({
        surgery: surgeries,
        anesthesiaRecord: anesthesiaRecords,
      })
      .from(surgeries)
      .leftJoin(anesthesiaRecords, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        eq(surgeries.isArchived, false),
        eq(surgeries.isSuspended, false),
        ne(surgeries.status, 'cancelled')
      ))
      .orderBy(desc(surgeries.plannedDate));

    // For each surgery, determine end time
    const surgeryEndTimes: { date: string; endTime: number }[] = [];

    for (const { surgery, anesthesiaRecord } of surgeriesData) {
      let endTime: number;

      // 1. Check for A2 marker in anesthesia record
      if (anesthesiaRecord?.timeMarkers) {
        const markers = anesthesiaRecord.timeMarkers as Array<{ code: string; time: number | null }>;
        const a2Marker = markers.find(m => m.code === 'A2');
        if (a2Marker?.time) {
          endTime = a2Marker.time;
        } else if (surgery.actualEndTime) {
          endTime = new Date(surgery.actualEndTime).getTime();
        } else {
          endTime = new Date(surgery.plannedDate).getTime() + 3 * 60 * 60 * 1000; // +3h default
        }
      } else if (surgery.actualEndTime) {
        endTime = new Date(surgery.actualEndTime).getTime();
      } else {
        endTime = new Date(surgery.plannedDate).getTime() + 3 * 60 * 60 * 1000; // +3h default
      }

      // Extract date portion (YYYY-MM-DD) from plannedDate
      const dateStr = new Date(surgery.plannedDate).toISOString().split('T')[0];
      surgeryEndTimes.push({ date: dateStr, endTime });
    }

    // Group by day and find max end time per day
    const dayMap = new Map<string, number>();
    for (const { date, endTime } of surgeryEndTimes) {
      const current = dayMap.get(date);
      if (!current || endTime > current) {
        dayMap.set(date, endTime);
      }
    }

    // Calculate hours per day: (maxEndTime + 1h buffer - 07:00) in hours
    const dayHoursMap = new Map<string, number>();
    for (const [date, maxEndTime] of dayMap) {
      const dayStart = new Date(date + 'T07:00:00').getTime();
      const dayEnd = maxEndTime + 60 * 60 * 1000; // +1h buffer
      const hours = Math.max(0, (dayEnd - dayStart) / (60 * 60 * 1000));
      dayHoursMap.set(date, Math.round(hours * 10) / 10); // round to 1 decimal
    }

    // Aggregate by month
    const monthMap = new Map<string, { totalHours: number; surgeryDays: number }>();
    for (const [date, hours] of dayHoursMap) {
      const month = date.substring(0, 7); // YYYY-MM
      const existing = monthMap.get(month) || { totalHours: 0, surgeryDays: 0 };
      existing.totalHours += hours;
      existing.surgeryDays += 1;
      monthMap.set(month, existing);
    }

    // Determine current month for isPast flag
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Sort by month and build response
    const months = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        totalHours: Math.round(data.totalHours * 10) / 10,
        surgeryDays: data.surgeryDays,
        isPast: month <= currentMonth,
      }));

    res.json({
      months,
      hourlyRate: 100,
    });
  } catch (error) {
    logger.error("Error fetching anesthesia nurse hours:", error);
    res.status(500).json({ message: "Failed to fetch anesthesia nurse hours" });
  }
});

// === Time Off Approval ===

// GET /api/business/:hospitalId/time-off/pending-count — count of pending time-off requests
router.get("/api/business/:hospitalId/time-off/pending-count", isAuthenticated, isBusinessManager, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const count = await storage.getPendingTimeOffCount(hospitalId);
    res.json({ count });
  } catch (error) {
    logger.error("Error fetching pending time-off count:", error);
    res.status(500).json({ message: "Failed to fetch pending time-off count" });
  }
});

// GET /api/business/:hospitalId/time-off — list all time-off for the hospital
router.get("/api/business/:hospitalId/time-off", isAuthenticated, isBusinessManager, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate, expand } = req.query;

    const timeOffs = await storage.getAllProviderTimeOffsForHospital(
      hospitalId,
      startDate as string | undefined,
      endDate as string | undefined
    );

    // Expand recurring time-off if requested
    let result = timeOffs;
    if (expand === 'true' && startDate && endDate) {
      result = expandRecurringTimeOff(timeOffs, startDate as string, endDate as string);
    }

    // Join with users to include provider names
    const providerIds = [...new Set(result.map(t => t.providerId))];
    const providerUsers = providerIds.length > 0
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(inArray(users.id, providerIds))
      : [];

    const providerMap = new Map(providerUsers.map(u => [u.id, u]));

    const enriched = result.map(t => ({
      ...t,
      providerName: (() => {
        const u = providerMap.get(t.providerId);
        return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : 'Unknown';
      })(),
      providerEmail: providerMap.get(t.providerId)?.email || null,
    }));

    res.json(enriched);
  } catch (error) {
    logger.error("Error fetching time-off for hospital:", error);
    res.status(500).json({ message: "Failed to fetch time-off" });
  }
});

// PATCH /api/business/:hospitalId/time-off/:timeOffId/approve — approve or decline
router.patch("/api/business/:hospitalId/time-off/:timeOffId/approve", isAuthenticated, isBusinessManager, async (req: any, res: Response) => {
  try {
    const { hospitalId, timeOffId } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'declined'].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'declined'" });
    }

    // Verify this time-off belongs to a provider of this hospital
    const allTimeOffs = await storage.getAllProviderTimeOffsForHospital(hospitalId);
    const timeOff = allTimeOffs.find(t => t.id === timeOffId);
    if (!timeOff) {
      return res.status(404).json({ message: "Time-off entry not found" });
    }

    const updated = await storage.approveProviderTimeOff(timeOffId, status, req.user.id);

    if (status === 'declined') {
      // Send email notification to the provider
      const provider = await storage.getUser(timeOff.providerId);
      const hospital = await storage.getHospital(hospitalId);
      const declinedBy = req.user;

      if (provider?.email && hospital) {
        const providerName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim();
        const declinedByName = `${declinedBy.firstName || ''} ${declinedBy.lastName || ''}`.trim();
        const language = (hospital.defaultLanguage as 'de' | 'en') || 'de';

        await sendTimeOffDeclinedEmail(
          provider.email,
          providerName,
          hospital.name,
          timeOff.startDate,
          timeOff.endDate,
          timeOff.reason || undefined,
          declinedByName,
          language
        );
      }

      // Delete the declined time-off entry
      await storage.deleteProviderTimeOff(timeOffId);
    }

    res.json(updated);
  } catch (error) {
    logger.error("Error approving/declining time-off:", error);
    res.status(500).json({ message: "Failed to update time-off status" });
  }
});

// Referral source statistics
router.get('/api/business/:hospitalId/referral-stats', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    const filters = [eq(referralEvents.hospitalId, hospitalId)];
    if (from) filters.push(gte(referralEvents.createdAt, new Date(from as string)));
    if (to) filters.push(lte(referralEvents.createdAt, new Date(to as string)));

    const breakdown = await db
      .select({
        referralSource: referralEvents.source,
        referralSourceDetail: referralEvents.sourceDetail,
        count: sql<number>`count(*)::int`,
      })
      .from(referralEvents)
      .where(and(...filters))
      .groupBy(referralEvents.source, referralEvents.sourceDetail);

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referralEvents)
      .where(and(...filters));

    res.json({
      breakdown,
      totalReferrals: totalResult?.count || 0,
    });
  } catch (error: any) {
    logger.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Failed to fetch referral stats' });
  }
});

// Referral source time-series (monthly, full history — no date filter)
router.get('/api/business/:hospitalId/referral-timeseries', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const rows = await db
      .select({
        month: sql<string>`to_char(${referralEvents.createdAt}, 'YYYY-MM')`,
        referralSource: referralEvents.source,
        count: sql<number>`count(*)::int`,
      })
      .from(referralEvents)
      .where(eq(referralEvents.hospitalId, hospitalId))
      .groupBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`, referralEvents.source)
      .orderBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`);

    res.json(rows);
  } catch (error: any) {
    logger.error('Error fetching referral timeseries:', error);
    res.status(500).json({ message: 'Failed to fetch referral timeseries' });
  }
});

// Recent referral events list (for verifying click ID tracking)
router.get('/api/business/:hospitalId/referral-events', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const rows = await db
      .select({
        id: referralEvents.id,
        source: referralEvents.source,
        sourceDetail: referralEvents.sourceDetail,
        utmSource: referralEvents.utmSource,
        utmMedium: referralEvents.utmMedium,
        utmCampaign: referralEvents.utmCampaign,
        gclid: referralEvents.gclid,
        gbraid: referralEvents.gbraid,
        wbraid: referralEvents.wbraid,
        fbclid: referralEvents.fbclid,
        ttclid: referralEvents.ttclid,
        msclkid: referralEvents.msclkid,
        igshid: referralEvents.igshid,
        li_fat_id: referralEvents.li_fat_id,
        twclid: referralEvents.twclid,
        captureMethod: referralEvents.captureMethod,
        createdAt: referralEvents.createdAt,
        patientFirstName: patients.firstName,
        patientLastName: patients.surname,
      })
      .from(referralEvents)
      .innerJoin(patients, eq(referralEvents.patientId, patients.id))
      .where(eq(referralEvents.hospitalId, hospitalId))
      .orderBy(desc(referralEvents.createdAt))
      .limit(limit);

    res.json(rows);
  } catch (error: any) {
    logger.error('Error fetching referral events:', error);
    res.status(500).json({ message: 'Failed to fetch referral events' });
  }
});

// ========================================
// Referral Funnel (conversion analytics)
// ========================================

router.get('/api/business/:hospitalId/referral-funnel', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    const conditions = [sql`re.hospital_id = ${hospitalId}`];
    if (from) conditions.push(sql`re.created_at >= ${from}::timestamp`);
    if (to) conditions.push(sql`re.created_at <= ${to}::timestamp`);

    const whereClause = sql.join(conditions, sql` AND `);

    const result = await db.execute(sql`
      SELECT
        re.id AS referral_id,
        re.source,
        re.source_detail,
        re.created_at AS referral_date,
        re.patient_id,
        re.capture_method,
        ca.id AS appointment_id,
        ca.status AS appointment_status,
        ca.provider_id,
        ca.appointment_date,
        u.first_name AS provider_first_name,
        u.last_name AS provider_last_name,
        s.id AS surgery_id,
        s.status AS surgery_status,
        s.payment_status,
        s.price,
        s.payment_date,
        s.planned_date AS surgery_planned_date,
        s.surgeon_id
      FROM referral_events re
      LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
      LEFT JOIN users u ON u.id = ca.provider_id
      LEFT JOIN LATERAL (
        SELECT s2.id, s2.status, s2.payment_status, s2.price, s2.payment_date, s2.planned_date, s2.surgeon_id
        FROM surgeries s2
        WHERE s2.patient_id = re.patient_id
          AND s2.hospital_id = re.hospital_id
          AND s2.planned_date >= re.created_at
          AND s2.is_archived = false
          AND COALESCE(s2.is_suspended, false) = false
        ORDER BY s2.planned_date ASC
        LIMIT 1
      ) s ON true
      WHERE ${whereClause}
      ORDER BY re.created_at DESC
    `);

    res.json(result.rows);
  } catch (error: any) {
    logger.error('Error fetching referral funnel:', error);
    res.status(500).json({ message: 'Failed to fetch referral funnel data' });
  }
});

// ========================================
// Lead Conversion Analysis (manager-only)
// ========================================

const leadConversionSchema = z.object({
  leads: z.array(z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })).min(1).max(5000),
});


// Normalize phone: strip spaces, dashes, leading +41/0041 → 0
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-\(\)\.]/g, '');
  p = p.replace(/^(\+41|0041)/, '0');
  return p.toLowerCase();
}

// Normalize name: trim, lowercase
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

router.post('/api/business/:hospitalId/lead-conversion', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = leadConversionSchema.parse(req.body);
    const { leads } = parsed;

    logger.warn(`[AUDIT] Lead conversion analysis by user=${req.user.id} email=${req.user.email} hospital=${hospitalId} leads=${leads.length}`);

    // 1. Fetch all non-archived patients for this hospital
    const allPatients = await db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        surname: patients.surname,
        email: patients.email,
        phone: patients.phone,
      })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
      ));

    // Build lookup indexes for fuzzy matching
    const patientsByNameKey = new Map<string, typeof allPatients>();
    const patientsByEmail = new Map<string, typeof allPatients>();
    const patientsByPhone = new Map<string, typeof allPatients>();

    for (const p of allPatients) {
      // Name key: "firstname|surname"
      const nameKey = `${normalizeName(p.firstName)}|${normalizeName(p.surname)}`;
      if (!patientsByNameKey.has(nameKey)) patientsByNameKey.set(nameKey, []);
      patientsByNameKey.get(nameKey)!.push(p);

      if (p.email) {
        const emailKey = p.email.trim().toLowerCase();
        if (!patientsByEmail.has(emailKey)) patientsByEmail.set(emailKey, []);
        patientsByEmail.get(emailKey)!.push(p);
      }

      if (p.phone) {
        const phoneKey = normalizePhone(p.phone);
        if (phoneKey.length >= 8) {
          if (!patientsByPhone.has(phoneKey)) patientsByPhone.set(phoneKey, []);
          patientsByPhone.get(phoneKey)!.push(p);
        }
      }
    }

    // 2. Match each lead to patients
    type MatchedLead = {
      lead: typeof leads[0];
      matchedPatientIds: string[];
      matchMethod: string;
    };

    const matchedLeads: MatchedLead[] = [];
    const allMatchedPatientIds = new Set<string>();

    for (const lead of leads) {
      const candidates = new Set<string>();
      let matchMethod = '';

      // Try email match first (strongest)
      if (lead.email) {
        const emailKey = lead.email.trim().toLowerCase();
        const matches = patientsByEmail.get(emailKey);
        if (matches) {
          matches.forEach(p => candidates.add(p.id));
          matchMethod = 'email';
        }
      }

      // Try phone match
      if (lead.phone) {
        const phoneKey = normalizePhone(lead.phone);
        if (phoneKey.length >= 8) {
          const matches = patientsByPhone.get(phoneKey);
          if (matches) {
            matches.forEach(p => candidates.add(p.id));
            matchMethod = matchMethod ? `${matchMethod}+phone` : 'phone';
          }
        }
      }

      // Try name match (first+last)
      if (lead.firstName && lead.lastName) {
        const nameKey = `${normalizeName(lead.firstName)}|${normalizeName(lead.lastName)}`;
        const matches = patientsByNameKey.get(nameKey);
        if (matches) {
          matches.forEach(p => candidates.add(p.id));
          matchMethod = matchMethod ? `${matchMethod}+name` : 'name';
        }
        // Also try swapped (some people enter surname first)
        const swappedKey = `${normalizeName(lead.lastName)}|${normalizeName(lead.firstName)}`;
        const swappedMatches = patientsByNameKey.get(swappedKey);
        if (swappedMatches) {
          swappedMatches.forEach(p => candidates.add(p.id));
          matchMethod = matchMethod ? `${matchMethod}+name(swapped)` : 'name(swapped)';
        }
      }

      if (candidates.size > 0) {
        const ids = Array.from(candidates);
        matchedLeads.push({ lead, matchedPatientIds: ids, matchMethod });
        ids.forEach(id => allMatchedPatientIds.add(id));
      }
    }

    if (allMatchedPatientIds.size === 0) {
      return res.json({
        totalLeads: leads.length,
        matchedPatients: 0,
        withAppointment: 0,
        withSurgeryPlanned: 0,
        matchedDetails: [],
      });
    }

    const matchedIds = Array.from(allMatchedPatientIds);

    // 3. Check appointments for matched patients
    const appointmentData = await db
      .select({
        patientId: clinicAppointments.patientId,
        status: clinicAppointments.status,
      })
      .from(clinicAppointments)
      .where(and(
        eq(clinicAppointments.hospitalId, hospitalId),
        inArray(clinicAppointments.patientId, matchedIds),
        sql`${clinicAppointments.status} != 'cancelled'`,
      ));

    const patientsWithAppointment = new Set<string>();
    for (const a of appointmentData) {
      if (a.patientId) {
        patientsWithAppointment.add(a.patientId);
      }
    }

    // 4. Check surgeries for matched patients
    const surgeryData = await db
      .select({
        patientId: surgeries.patientId,
        status: surgeries.status,
      })
      .from(surgeries)
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        inArray(surgeries.patientId, matchedIds),
        eq(surgeries.isArchived, false),
        sql`${surgeries.status} != 'cancelled'`,
      ));

    const patientsWithSurgeryPlanned = new Set<string>();
    for (const s of surgeryData) {
      if (s.patientId) {
        patientsWithSurgeryPlanned.add(s.patientId);
      }
    }

    // 5. Build per-lead details (for the table)
    const matchedDetails = matchedLeads.map(ml => {
      const hasAppointment = ml.matchedPatientIds.some(id => patientsWithAppointment.has(id));
      const hasSurgeryPlanned = ml.matchedPatientIds.some(id => patientsWithSurgeryPlanned.has(id));

      return {
        leadName: [ml.lead.firstName, ml.lead.lastName].filter(Boolean).join(' ') || ml.lead.email || ml.lead.phone || 'Unknown',
        matchMethod: ml.matchMethod,
        hasAppointment,
        hasSurgeryPlanned,
      };
    });

    res.json({
      totalLeads: leads.length,
      matchedPatients: allMatchedPatientIds.size,
      withAppointment: patientsWithAppointment.size,
      withSurgeryPlanned: patientsWithSurgeryPlanned.size,
      matchedDetails,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid lead data', details: error.errors });
    }
    logger.error('[Business] Error in lead conversion analysis:', error);
    res.status(500).json({ message: 'Failed to analyze lead conversion' });
  }
});

// ========================================
// Ad Budget Management (manager-only)
// ========================================

router.get('/api/business/:hospitalId/ad-budgets', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { month } = req.query;

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const { adBudgets } = await import("@shared/schema");
    const results = await db
      .select()
      .from(adBudgets)
      .where(and(eq(adBudgets.hospitalId, hospitalId), eq(adBudgets.month, month as string)));

    res.json(results);
  } catch (error: any) {
    logger.error('Error fetching ad budgets:', error);
    res.status(500).json({ message: 'Failed to fetch ad budgets' });
  }
});

router.put('/api/business/:hospitalId/ad-budgets', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { month, budgets } = req.body;

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
    }

    const validFunnels = ['google_ads', 'meta_ads', 'meta_forms'] as const;
    const { adBudgets } = await import("@shared/schema");
    const results = [];

    for (const funnel of validFunnels) {
      const amount = budgets?.[funnel];
      if (amount === undefined || amount === null) continue;

      const amountChf = Math.round(Number(amount));
      if (isNaN(amountChf) || amountChf < 0) continue;

      if (amountChf === 0) {
        // Delete budget entry if set to 0
        await db
          .delete(adBudgets)
          .where(and(
            eq(adBudgets.hospitalId, hospitalId),
            eq(adBudgets.month, month),
            eq(adBudgets.funnel, funnel),
          ));
        continue;
      }

      const [upserted] = await db
        .insert(adBudgets)
        .values({
          hospitalId,
          month,
          funnel,
          amountChf,
        })
        .onConflictDoUpdate({
          target: [adBudgets.hospitalId, adBudgets.month, adBudgets.funnel],
          set: { amountChf, updatedAt: new Date() },
        })
        .returning();
      results.push(upserted);
    }

    res.json(results);
  } catch (error: any) {
    logger.error('Error upserting ad budgets:', error);
    res.status(500).json({ message: 'Failed to save ad budgets' });
  }
});

router.get('/api/business/:hospitalId/ad-performance', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    const conditions = [sql`re.hospital_id = ${hospitalId}`];
    if (from) conditions.push(sql`re.created_at >= ${from}::timestamp`);
    if (to) conditions.push(sql`re.created_at <= ${to}::timestamp`);
    const whereClause = sql.join(conditions, sql` AND `);

    // Classify referrals into funnels and compute metrics
    const result = await db.execute(sql`
      WITH classified AS (
        SELECT
          CASE
            WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL THEN 'google_ads'
            WHEN (re.fbclid IS NOT NULL OR re.igshid IS NOT NULL) AND re.capture_method != 'staff' THEN 'meta_ads'
            WHEN re.source = 'social' AND re.capture_method = 'staff' AND re.fbclid IS NULL AND re.igshid IS NULL THEN 'meta_forms'
            ELSE NULL
          END AS funnel,
          re.id AS referral_id,
          re.created_at AS referral_date,
          ca.status AS appointment_status,
          s.id AS surgery_id,
          s.payment_status,
          COALESCE(s.price, 0) AS price
        FROM referral_events re
        LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
        LEFT JOIN LATERAL (
          SELECT s2.id, s2.status, s2.payment_status, s2.price
          FROM surgeries s2
          WHERE s2.patient_id = re.patient_id
            AND s2.hospital_id = re.hospital_id
            AND s2.planned_date >= re.created_at
            AND s2.is_archived = false
            AND COALESCE(s2.is_suspended, false) = false
          ORDER BY s2.planned_date ASC
          LIMIT 1
        ) s ON true
        WHERE ${whereClause}
      ),
      funnel_metrics AS (
        SELECT
          funnel,
          COUNT(*) AS leads,
          COUNT(*) FILTER (WHERE appointment_status IN ('arrived', 'in_progress', 'completed')) AS appointments_kept,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS paid_conversions,
          COALESCE(SUM(price) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
        FROM classified
        WHERE funnel IS NOT NULL
        GROUP BY funnel
      )
      SELECT
        fm.funnel,
        fm.leads,
        fm.appointments_kept,
        fm.paid_conversions,
        fm.revenue
      FROM funnel_metrics fm
      ORDER BY fm.funnel
    `);

    // Fetch budgets for the months in the date range
    const monthConditions = [sql`ab.hospital_id = ${hospitalId}`];
    if (from) monthConditions.push(sql`ab.month >= ${(from as string).substring(0, 7)}`);
    if (to) monthConditions.push(sql`ab.month <= ${(to as string).substring(0, 7)}`);
    const monthWhere = sql.join(monthConditions, sql` AND `);

    const budgetResult = await db.execute(sql`
      SELECT funnel, COALESCE(SUM(amount_chf), 0) AS total_budget
      FROM ad_budgets ab
      WHERE ${monthWhere}
      GROUP BY funnel
    `);

    const budgetMap: Record<string, number> = {};
    for (const row of budgetResult.rows as any[]) {
      budgetMap[row.funnel] = Number(row.total_budget);
    }

    // Merge metrics with budgets
    const allFunnels = ['google_ads', 'meta_ads', 'meta_forms'];
    const metricsMap: Record<string, any> = {};
    for (const row of result.rows as any[]) {
      metricsMap[row.funnel] = row;
    }

    const response = allFunnels.map(funnel => {
      const m = metricsMap[funnel];
      const leads = Number(m?.leads || 0);
      const appointmentsKept = Number(m?.appointments_kept || 0);
      const paidConversions = Number(m?.paid_conversions || 0);
      const revenue = Number(m?.revenue || 0);
      const budget = budgetMap[funnel] || 0;

      return {
        funnel,
        budget,
        leads,
        appointmentsKept,
        paidConversions,
        revenue,
        cpl: leads > 0 ? Math.round(budget / leads) : null,
        cpk: appointmentsKept > 0 ? Math.round(budget / appointmentsKept) : null,
        cpa: paidConversions > 0 ? Math.round(budget / paidConversions) : null,
        roi: budget > 0 && paidConversions > 0 ? Math.round(((revenue - budget) / budget) * 100) / 100 : null,
      };
    });

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching ad performance:', error);
    res.status(500).json({ message: 'Failed to fetch ad performance data' });
  }
});

export default router;
