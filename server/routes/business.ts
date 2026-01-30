import { Router } from "express";
import type { Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, units, hospitals, workerContracts, insertWorkerContractSchema } from "@shared/schema";
import { eq, and, inArray, ne, desc } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { sendSignedContractEmail } from "../resend";

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
    console.error("Error checking business access:", error);
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
    console.error("Error checking business access:", error);
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
          canLogin: (u.user as any).canLogin ?? true,
          createdAt: u.user.createdAt,
        });
      }
    }
    
    const staffList = Array.from(userMap.values());
    res.json(staffList);
  } catch (error) {
    console.error("Error fetching staff:", error);
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
    console.error("Error creating staff:", error);
    res.status(500).json({ message: "Failed to create staff member" });
  }
});

// Update staff member
router.patch('/api/business/:hospitalId/staff/:userId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { firstName, lastName, email, role, unitId, hourlyRate, staffType } = req.body;
    
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
    
    // Build user update object - hourlyRate and staffType can always be edited
    const userUpdates: any = {};
    
    // For admin users, only allow editing hourlyRate and staffType
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
      canLogin: updatedUser.canLogin,
    });
  } catch (error) {
    console.error("Error updating staff:", error);
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
    console.error("Error updating staff type:", error);
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
    console.error("Error fetching units:", error);
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
    console.error("Error fetching user roles:", error);
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
    console.error("Error adding user role:", error);
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
    console.error("Error updating user role:", error);
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
    console.error("Error deleting user role:", error);
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
    console.error("Error getting contract token:", error);
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
    console.error("Error regenerating contract token:", error);
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
    console.error("Error fetching hospital for contract:", error);
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
    console.error("Error submitting contract:", error);
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
    console.error("Error fetching contracts:", error);
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
    console.error("Error fetching contract:", error);
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
    console.error("Error signing contract:", error);
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
    console.error("Error rejecting contract:", error);
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
    console.error("Error deleting contract:", error);
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
    console.error("Error archiving contract:", error);
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
    console.error("Error unarchiving contract:", error);
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
      console.error('Failed to send signed contract email:', result.error);
      return res.status(500).json({ message: "Failed to send email" });
    }
    
    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending signed contract email:", error);
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
    const allItems = [];
    for (const unit of inventoryUnits) {
      const items = await storage.getItems(hospitalId, unit.id);
      allItems.push(...items);
    }
    
    // Get supplier codes for this hospital
    const supplierCodes = await db
      .select()
      .from(require('@shared/schema').preferredSupplierCodes)
      .where(eq(require('@shared/schema').preferredSupplierCodes.hospitalId, hospitalId));
    
    res.json({ 
      units: inventoryUnits, 
      items: allItems, 
      supplierCodes: supplierCodes 
    });
  } catch (error) {
    console.error("Error fetching inventory overview:", error);
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
    console.error("Error fetching inventory snapshots:", error);
    res.status(500).json({ message: "Failed to fetch inventory snapshots" });
  }
});

export default router;
