import { Router } from "express";
import type { Response, Request } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, units, hospitals, workerContracts, insertWorkerContractSchema, supplierCodes, surgeries, anesthesiaRecords, surgeryStaffEntries, inventoryCommits, items, providerTimeOff, patientQuestionnaireResponses, patientQuestionnaireLinks, referralEvents, patients, clinicAppointments, clinicServices } from "@shared/schema";
import { eq, and, inArray, ne, desc, gte, lte, isNull, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { sendSignedContractEmail, sendTimeOffDeclinedEmail } from "../resend";
import { expandRecurringTimeOff } from "../utils/timeoff";
import { normalizePhoneForMatching } from "../utils/normalizePhone";
import { calculateNameSimilarity } from "../services/patientDeduplication";
import {
  getHospitalGroupIdCached,
  getGroupHospitalIdsCached,
  userHasGroupAwareHospitalAccess,
} from "../utils";
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

async function isMarketingOrManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h =>
      h.id === hospitalId &&
      (h.role === 'admin' || h.role === 'manager' || h.role === 'marketing')
    );

    if (!hasAccess) {
      return res.status(403).json({ message: "Marketing or business manager access required" });
    }

    next();
  } catch (error) {
    logger.error("Error checking marketing access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

/**
 * Task 11: resolve the hospital scope for a business-dashboard aggregation
 * endpoint. Reads the optional `X-Active-Scope` header (default `"hospital"`)
 * and returns the list of hospital IDs the aggregation should cover.
 *
 * Rules (mirror `/api/patients` from Task 5):
 *   - Default / `scope !== "group"` → `[activeHospitalId]`.
 *   - `scope === "group"` but the active hospital has no `groupId` → silently
 *     fall back to `[activeHospitalId]`. Single-location tenants that send
 *     the header should not see an error.
 *   - `scope === "group"` and the active hospital belongs to a group → the
 *     caller must have group-aware read access (direct role somewhere in the
 *     group, `group_admin` on the group, or platform admin). If not, throw
 *     a `ScopeForbiddenError` which the route handler turns into a 403.
 *   - On success with group access, returns every hospital ID in that group.
 *
 * Returns a discriminated result so the route can render an explicit 403
 * JSON body (route-level) rather than leaking generic 500s.
 */
class ScopeForbiddenError extends Error {
  code = "GROUP_SCOPE_FORBIDDEN" as const;
  constructor() {
    super("Access denied for group-scope business read.");
  }
}

async function resolveHospitalScope(
  req: Request,
  userId: string,
  activeHospitalId: string,
): Promise<string[]> {
  const scopeHeader = (req.headers["x-active-scope"] as string | undefined)?.toLowerCase();
  if (scopeHeader !== "group") {
    return [activeHospitalId];
  }
  const groupId = await getHospitalGroupIdCached(activeHospitalId, req);
  if (!groupId) {
    // Un-grouped tenant: silently fall back to hospital scope so a single-
    // location client that always sends `scope=group` does not break.
    return [activeHospitalId];
  }
  const hasAccess = await userHasGroupAwareHospitalAccess(
    userId,
    activeHospitalId,
    req,
  );
  if (!hasAccess) {
    throw new ScopeForbiddenError();
  }
  return await getGroupHospitalIdsCached(groupId, req);
}

/**
 * Helper: build a `WHERE hospital_id IN (...)` (or `= single`) clause for
 * an arbitrary drizzle column. Keeps `inArray` vs. `eq` selection local so
 * the aggregation endpoints don't each need to think about this.
 */
function hospitalScopeClause<T>(column: T, hospitalIds: string[]) {
  // Narrow to drizzle column. `eq`/`inArray` both accept our schema columns.
  const col = column as any;
  return hospitalIds.length === 1
    ? eq(col, hospitalIds[0])
    : inArray(col, hospitalIds);
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

    // Task 11: optional group-scope expansion. In group scope we aggregate
    // inventory units across every hospital in the group.
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    // Get all units within the scoped hospital(s)
    const allUnitsInScope: any[] = [];
    for (const hid of hospitalIds) {
      const hospitalUnits = await storage.getUnits(hid);
      allUnitsInScope.push(...hospitalUnits);
    }

    // Filter to only inventory-capable units (exclude business/logistic type units)
    const inventoryUnits = allUnitsInScope.filter(u =>
      u.type !== 'business' && u.type !== 'logistic' && u.showInventory !== false
    );

    // Aggregate items from all units within the scoped hospital(s)
    const allItems: any[] = [];
    for (const unit of inventoryUnits) {
      const items = await storage.getItems(unit.hospitalId, unit.id);
      allItems.push(...items);
    }

    // Get supplier codes for all items in this scope
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

    // Task 11: optional group-scope expansion. Defaults to [hospitalId] when
    // no `X-Active-Scope: group` header is present (single-location behaviour).
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

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

    // Get all surgeries for this/these hospital(s) with their anesthesia records
    const surgeriesData = await db
      .select({
        surgery: surgeries,
        anesthesiaRecord: anesthesiaRecords,
      })
      .from(surgeries)
      .leftJoin(anesthesiaRecords, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(and(
        hospitalScopeClause(surgeries.hospitalId, hospitalIds),
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

    // Task 11: optional group-scope expansion.
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    // Get all non-archived, non-cancelled, non-suspended surgeries with their anesthesia records
    const surgeriesData = await db
      .select({
        surgery: surgeries,
        anesthesiaRecord: anesthesiaRecords,
      })
      .from(surgeries)
      .leftJoin(anesthesiaRecords, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .where(and(
        hospitalScopeClause(surgeries.hospitalId, hospitalIds),
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
router.get('/api/business/:hospitalId/referral-stats', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    // Task 11: optional group-scope expansion. Marketing KPIs roll up across
    // the whole group when `X-Active-Scope: group` is sent.
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    const filters: any[] = [hospitalScopeClause(referralEvents.hospitalId, hospitalIds)];
    if (from) filters.push(gte(referralEvents.createdAt, new Date(from as string)));
    if (to) filters.push(lte(referralEvents.createdAt, new Date(to as string)));

    const isPaidExpr = sql`CASE WHEN ${referralEvents.utmMedium} IN ('cpc', 'paid', 'ppc', 'paidsocial', 'paid_social') OR ${referralEvents.gclid} IS NOT NULL OR ${referralEvents.gbraid} IS NOT NULL OR ${referralEvents.wbraid} IS NOT NULL OR ${referralEvents.fbclid} IS NOT NULL OR ${referralEvents.ttclid} IS NOT NULL OR ${referralEvents.msclkid} IS NOT NULL OR ${referralEvents.metaLeadId} IS NOT NULL THEN true ELSE false END`;

    const breakdown = await db
      .select({
        referralSource: referralEvents.source,
        referralSourceDetail: sql<string>`INITCAP(${referralEvents.sourceDetail})`,
        isPaid: sql<boolean>`${isPaidExpr}`,
        count: sql<number>`count(*)::int`,
      })
      .from(referralEvents)
      .where(and(...filters))
      .groupBy(referralEvents.source, sql`INITCAP(${referralEvents.sourceDetail})`, isPaidExpr);

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
router.get('/api/business/:hospitalId/referral-timeseries', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
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
router.get('/api/business/:hospitalId/referral-events', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const rows = await db
      .select({
        id: referralEvents.id,
        source: referralEvents.source,
        sourceDetail: referralEvents.sourceDetail,
        utmSource: referralEvents.utmSource,
        utmMedium: referralEvents.utmMedium,
        utmCampaign: referralEvents.utmCampaign,
        utmTerm: referralEvents.utmTerm,
        utmContent: referralEvents.utmContent,
        gclid: referralEvents.gclid,
        gbraid: referralEvents.gbraid,
        wbraid: referralEvents.wbraid,
        fbclid: referralEvents.fbclid,
        ttclid: referralEvents.ttclid,
        msclkid: referralEvents.msclkid,
        igshid: referralEvents.igshid,
        li_fat_id: referralEvents.li_fat_id,
        twclid: referralEvents.twclid,
        metaLeadId: referralEvents.metaLeadId,
        metaFormId: referralEvents.metaFormId,
        campaignId: referralEvents.campaignId,
        campaignName: referralEvents.campaignName,
        adsetId: referralEvents.adsetId,
        adId: referralEvents.adId,
        // Unified campaign label: prefer ad-platform webhook name, fall back to URL utm_campaign
        campaign: sql<string | null>`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign})`.as('campaign'),
        captureMethod: referralEvents.captureMethod,
        createdAt: referralEvents.createdAt,
        patientFirstName: patients.firstName,
        patientLastName: patients.surname,
        treatmentName: clinicServices.name,
      })
      .from(referralEvents)
      .innerJoin(patients, eq(referralEvents.patientId, patients.id))
      .leftJoin(clinicAppointments, eq(referralEvents.appointmentId, clinicAppointments.id))
      .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
      .where(and(
        eq(referralEvents.hospitalId, hospitalId),
        before ? sql`${referralEvents.createdAt} < ${before}` : sql`1=1`
      ))
      .orderBy(desc(referralEvents.createdAt))
      .limit(limit);

    res.json(rows);
  } catch (error: any) {
    logger.error('Error fetching referral events:', error);
    res.status(500).json({ message: 'Failed to fetch referral events' });
  }
});

// PATCH /api/business/:hospitalId/referral-events/:eventId — edit source/sourceDetail
router.patch('/api/business/:hospitalId/referral-events/:eventId', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, eventId } = req.params;
    const { source, sourceDetail } = req.body;

    const validSources = ['social', 'search_engine', 'llm', 'word_of_mouth', 'belegarzt', 'marketing', 'other'];
    if (source && !validSources.includes(source)) {
      return res.status(400).json({ message: `source must be one of: ${validSources.join(', ')}` });
    }

    // Verify event belongs to hospital
    const [existing] = await db
      .select({ id: referralEvents.id })
      .from(referralEvents)
      .where(and(eq(referralEvents.id, eventId), eq(referralEvents.hospitalId, hospitalId)))
      .limit(1);

    if (!existing) return res.status(404).json({ message: 'Referral event not found' });

    const updates: Record<string, any> = {};
    if (source !== undefined) updates.source = source;
    if (sourceDetail !== undefined) updates.sourceDetail = sourceDetail || null;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const [updated] = await db
      .update(referralEvents)
      .set(updates)
      .where(eq(referralEvents.id, eventId))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error('Error updating referral event:', error);
    res.status(500).json({ message: 'Failed to update referral event' });
  }
});

// DELETE /api/business/:hospitalId/referral-events/:eventId — admin only
router.delete('/api/business/:hospitalId/referral-events/:eventId', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, eventId } = req.params;

    // Admin-only check — user may have multiple unit roles for same hospital
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const isAdminForHospital = hospitals.some((h: any) => h.id === hospitalId && (h.role === 'admin' || h.role === 'manager'));
    if (!isAdminForHospital) {
      return res.status(403).json({ message: 'Only admins can delete referral events' });
    }

    // Verify event belongs to hospital
    const [existing] = await db
      .select({ id: referralEvents.id })
      .from(referralEvents)
      .where(and(eq(referralEvents.id, eventId), eq(referralEvents.hospitalId, hospitalId)))
      .limit(1);

    if (!existing) return res.status(404).json({ message: 'Referral event not found' });

    await db.delete(referralEvents).where(eq(referralEvents.id, eventId));

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting referral event:', error);
    res.status(500).json({ message: 'Failed to delete referral event' });
  }
});

// ========================================
// Referral Funnel (conversion analytics)
// ========================================

router.get('/api/business/:hospitalId/referral-funnel', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
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
    CASE WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL OR re.fbclid IS NOT NULL OR re.igshid IS NOT NULL OR re.ttclid IS NOT NULL OR re.msclkid IS NOT NULL OR re.li_fat_id IS NOT NULL OR re.twclid IS NOT NULL OR re.meta_lead_id IS NOT NULL OR re.meta_form_id IS NOT NULL THEN true ELSE false END AS has_click_id,
    re.gclid,
    re.gbraid,
    re.wbraid,
    re.fbclid,
    re.igshid,
    re.meta_lead_id,
    re.meta_form_id,
    re.utm_source,
    re.utm_campaign,
    COALESCE(re.campaign_name, re.utm_campaign) AS campaign,
    re.campaign_id,
    re.campaign_name,
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
    s.surgeon_id,
    tr.id AS treatment_id,
    tr.status AS treatment_status,
    tr.performed_at AS treatment_performed_at,
    tr.total AS treatment_total
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
  LEFT JOIN LATERAL (
    SELECT
      t.id,
      t.status,
      t.performed_at,
      (SELECT COALESCE(SUM(tl.total), 0)
       FROM treatment_lines tl
       WHERE tl.treatment_id = t.id) AS total
    FROM treatments t
    WHERE t.hospital_id = re.hospital_id
      AND t.status = 'signed'
      AND (
        t.appointment_id = re.appointment_id
        OR (
          t.appointment_id IS NULL
          AND t.patient_id = re.patient_id
          AND ca.appointment_date IS NOT NULL
          AND (t.performed_at AT TIME ZONE 'UTC')::date = ca.appointment_date
        )
      )
    ORDER BY t.performed_at ASC
    LIMIT 1
  ) tr ON true
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
    status: z.string().optional(),
    leadDate: z.string().optional(),
    operation: z.string().optional(),
    adSource: z.string().optional(),
    metaLeadId: z.string().optional(),
    metaFormId: z.string().optional(),
  })).min(1).max(5000),
});


// Phone normalization for matching — see server/utils/normalizePhone.ts
const normalizePhone = normalizePhoneForMatching;

// Normalize name: trim, lowercase
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

router.post('/api/business/:hospitalId/lead-conversion', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = leadConversionSchema.parse(req.body);
    const { leads } = parsed;

    logger.warn(`[AUDIT] Lead conversion analysis by user=${req.user.id} email=${req.user.email} hospital=${hospitalId} leads=${leads.length}`);
    // Debug: log first 3 parsed leads to check parsing
    logger.info(`[Lead Debug] First 3 leads: ${JSON.stringify(leads.slice(0, 3))}`);

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

    // Debug: log patient count and sample name keys
    logger.info(`[Lead Debug] Patients loaded: ${allPatients.length}, sample name keys: ${Array.from(patientsByNameKey.keys()).slice(0, 5).join(', ')}`);
    // Debug: log first 3 lead name keys attempted
    const debugLeadKeys = leads.slice(0, 3).map(l => l.firstName && l.lastName ? `${normalizeName(l.firstName)}|${normalizeName(l.lastName)}` : 'no-name');
    logger.info(`[Lead Debug] First 3 lead name keys: ${debugLeadKeys.join(', ')}`);

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
        backfillEligibleCount: 0,
        matchedDetails: [],
      });
    }

    const matchedIds = Array.from(allMatchedPatientIds);

    // 3. Check appointments for matched patients
    const appointmentData = await db
      .select({
        id: clinicAppointments.id,
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
    const appointmentIdsByPatient = new Map<string, string[]>();
    for (const a of appointmentData) {
      if (a.patientId) {
        patientsWithAppointment.add(a.patientId);
        if (!appointmentIdsByPatient.has(a.patientId)) appointmentIdsByPatient.set(a.patientId, []);
        appointmentIdsByPatient.get(a.patientId)!.push(a.id);
      }
    }

    // 3b. Check which appointments already have referral events
    const allAppointmentIds = appointmentData.map(a => a.id);
    const existingReferrals = allAppointmentIds.length > 0
      ? await db
          .select({
            appointmentId: referralEvents.appointmentId,
            captureMethod: referralEvents.captureMethod,
            createdAt: referralEvents.createdAt,
          })
          .from(referralEvents)
          .where(and(
            eq(referralEvents.hospitalId, hospitalId),
            inArray(referralEvents.appointmentId, allAppointmentIds),
          ))
      : [];
    // Staff-backfilled referrals created today are eligible for update
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const appointmentsWithFixedReferral = new Set<string>();
    const appointmentsWithUpdatableReferral = new Set<string>();
    for (const r of existingReferrals) {
      if (!r.appointmentId) continue;
      const isStaffToday = r.captureMethod === 'staff' && r.createdAt && new Date(r.createdAt) >= todayStart;
      if (isStaffToday) {
        appointmentsWithUpdatableReferral.add(r.appointmentId);
      } else {
        appointmentsWithFixedReferral.add(r.appointmentId);
      }
    }

    // Count leads eligible for referral backfill: has adSource and either:
    // - has appointment without fixed referral, OR
    // - has no appointment at all (patient-level referral)
    let backfillEligibleCount = 0;
    for (const ml of matchedLeads) {
      if (!ml.lead.adSource) continue;
      const isEligible = ml.matchedPatientIds.some(pid => {
        const apptIds = appointmentIdsByPatient.get(pid) || [];
        if (apptIds.length === 0) return true; // no appointments — eligible for patient-level referral
        return apptIds.some(aid => !appointmentsWithFixedReferral.has(aid));
      });
      if (isEligible) backfillEligibleCount++;
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
        leadStatus: ml.lead.status || null,
        leadDate: ml.lead.leadDate || null,
        operation: ml.lead.operation || null,
        adSource: ml.lead.adSource || null,
        matchMethod: ml.matchMethod,
        hasAppointment,
        hasSurgeryPlanned,
      };
    });

    // 6. Build status breakdown
    const statusCounts: Record<string, { total: number; matched: number; withAppointment: number; withSurgery: number }> = {};
    for (const lead of leads) {
      const status = lead.status || '(no status)';
      if (!statusCounts[status]) statusCounts[status] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      statusCounts[status].total++;
    }
    for (const ml of matchedLeads) {
      const status = ml.lead.status || '(no status)';
      if (!statusCounts[status]) statusCounts[status] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      statusCounts[status].matched++;
      const hasAppt = ml.matchedPatientIds.some(id => patientsWithAppointment.has(id));
      const hasSurg = ml.matchedPatientIds.some(id => patientsWithSurgeryPlanned.has(id));
      if (hasAppt) statusCounts[status].withAppointment++;
      if (hasSurg) statusCounts[status].withSurgery++;
    }

    // 7. Build operation breakdown (if operation data present)
    const operationCounts: Record<string, { total: number; matched: number; withAppointment: number; withSurgery: number }> = {};
    for (const lead of leads) {
      if (!lead.operation) continue;
      const op = lead.operation;
      if (!operationCounts[op]) operationCounts[op] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      operationCounts[op].total++;
    }
    for (const ml of matchedLeads) {
      if (!ml.lead.operation) continue;
      const op = ml.lead.operation;
      if (!operationCounts[op]) operationCounts[op] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      operationCounts[op].matched++;
      if (ml.matchedPatientIds.some(id => patientsWithAppointment.has(id))) operationCounts[op].withAppointment++;
      if (ml.matchedPatientIds.some(id => patientsWithSurgeryPlanned.has(id))) operationCounts[op].withSurgery++;
    }

    // 8. Build source breakdown (fb/ig, if present)
    const sourceCounts: Record<string, { total: number; matched: number; withAppointment: number; withSurgery: number }> = {};
    for (const lead of leads) {
      if (!lead.adSource) continue;
      const src = lead.adSource;
      if (!sourceCounts[src]) sourceCounts[src] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      sourceCounts[src].total++;
    }
    for (const ml of matchedLeads) {
      if (!ml.lead.adSource) continue;
      const src = ml.lead.adSource;
      if (!sourceCounts[src]) sourceCounts[src] = { total: 0, matched: 0, withAppointment: 0, withSurgery: 0 };
      sourceCounts[src].matched++;
      if (ml.matchedPatientIds.some(id => patientsWithAppointment.has(id))) sourceCounts[src].withAppointment++;
      if (ml.matchedPatientIds.some(id => patientsWithSurgeryPlanned.has(id))) sourceCounts[src].withSurgery++;
    }

    res.json({
      totalLeads: leads.length,
      matchedPatients: allMatchedPatientIds.size,
      withAppointment: patientsWithAppointment.size,
      withSurgeryPlanned: patientsWithSurgeryPlanned.size,
      backfillEligibleCount,
      matchedDetails,
      statusBreakdown: Object.entries(statusCounts)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([status, counts]) => ({ status, ...counts })),
      operationBreakdown: Object.keys(operationCounts).length > 0
        ? Object.entries(operationCounts)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([status, counts]) => ({ status, ...counts }))
        : undefined,
      sourceBreakdown: Object.keys(sourceCounts).length > 0
        ? Object.entries(sourceCounts)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([status, counts]) => ({ status, ...counts }))
        : undefined,
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
// Fuzzy-match leads to patients (preview)
// ========================================

router.post('/api/business/:hospitalId/lead-conversion/fuzzy-match', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = leadConversionSchema.parse(req.body);
    const { leads } = parsed;

    // 1. Fetch all non-archived patients for hospital
    const allPatients = await db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        surname: patients.surname,
        email: patients.email,
        phone: patients.phone,
        dateOfBirth: patients.birthday,
      })
      .from(patients)
      .where(and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
      ));

    // 2. Fetch latest non-cancelled appointment date per patient
    const appointmentRows = await db
      .select({
        patientId: clinicAppointments.patientId,
        latestDate: sql<string>`max(${clinicAppointments.appointmentDate})`.as('latestDate'),
      })
      .from(clinicAppointments)
      .where(and(
        eq(clinicAppointments.hospitalId, hospitalId),
        ne(clinicAppointments.status, 'cancelled'),
      ))
      .groupBy(clinicAppointments.patientId);

    const latestAppointmentByPatient = new Map<string, string>();
    for (const row of appointmentRows) {
      if (row.patientId) latestAppointmentByPatient.set(row.patientId, row.latestDate);
    }

    // 3. Pre-normalize patient data for matching
    const normalizedPatients = allPatients.map(p => ({
      ...p,
      normalizedPhone: p.phone ? normalizePhoneForMatching(p.phone) : '',
      normalizedEmail: p.email ? p.email.trim().toLowerCase() : '',
      fullName: `${p.firstName} ${p.surname}`,
    }));

    // 4. For each lead with adSource, compute fuzzy matches
    const matches: Array<{
      leadIndex: number;
      lead: typeof leads[0];
      candidates: Array<{
        patientId: string;
        firstName: string;
        surname: string;
        phone: string | null;
        email: string | null;
        dateOfBirth: string | null;
        nextAppointmentDate: string | null;
        confidence: number;
        reasons: string[];
        missingFields: string[];
      }>;
    }> = [];

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      if (!lead.adSource) continue;

      const leadFullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
      const leadSwappedName = [lead.lastName, lead.firstName].filter(Boolean).join(' ');
      const leadPhone = lead.phone ? normalizePhoneForMatching(lead.phone) : '';
      const leadEmail = lead.email ? lead.email.trim().toLowerCase() : '';

      const candidateList: typeof matches[0]['candidates'] = [];

      for (const p of normalizedPatients) {
        let confidence = 0;
        const reasons: string[] = [];

        // Name similarity (take best of normal and swapped order)
        if (leadFullName) {
          const nameSim = calculateNameSimilarity(leadFullName, p.fullName);
          const swappedSim = leadSwappedName !== leadFullName
            ? calculateNameSimilarity(leadSwappedName, p.fullName)
            : 0;
          const bestNameSim = Math.max(nameSim, swappedSim);
          if (bestNameSim > 0) {
            confidence = bestNameSim;
            reasons.push(`Name similarity: ${Math.round(bestNameSim * 100)}%`);
          }
        }

        // Phone match — exact after normalization
        if (leadPhone && leadPhone.length >= 8 && p.normalizedPhone && p.normalizedPhone.length >= 8 && leadPhone === p.normalizedPhone) {
          confidence += 0.15;
          reasons.push('Phone match');
        }

        // Email match — exact lowercase
        if (leadEmail && p.normalizedEmail && leadEmail === p.normalizedEmail) {
          confidence += 0.15;
          reasons.push('Email match');
        }

        confidence = Math.min(1.0, confidence);

        if (confidence >= 0.50) {
          // Compute missing fields — fields patient lacks that lead has
          const missingFields: string[] = [];
          if (lead.email && !p.email) missingFields.push('email');
          if (lead.phone && !p.phone) missingFields.push('phone');
          if (lead.firstName && !p.firstName) missingFields.push('firstName');
          if (lead.lastName && !p.surname) missingFields.push('surname');

          candidateList.push({
            patientId: p.id,
            firstName: p.firstName,
            surname: p.surname,
            phone: p.phone,
            email: p.email,
            dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth) : null,
            nextAppointmentDate: latestAppointmentByPatient.get(p.id) ?? null,
            confidence: Math.round(confidence * 100) / 100,
            reasons,
            missingFields,
          });
        }
      }

      // Sort by confidence desc, take top 5
      candidateList.sort((a, b) => b.confidence - a.confidence);
      const topCandidates = candidateList.slice(0, 5);

      if (topCandidates.length > 0) {
        matches.push({
          leadIndex: i,
          lead,
          candidates: topCandidates,
        });
      }
    }

    res.json({ matches });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid lead data', errors: error.errors });
    }
    logger.error('[Business] Error in lead fuzzy-match:', error);
    res.status(500).json({ message: 'Failed to compute fuzzy matches' });
  }
});

// ========================================
// Backfill referral events from lead data
// ========================================

router.post('/api/business/:hospitalId/lead-conversion/backfill-referrals', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const approvedBackfillSchema = z.object({
      approvedMatches: z.array(z.object({
        leadIndex: z.number(),
        patientId: z.string(),
        lead: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          leadDate: z.string().optional(),
          adSource: z.string().optional(),
          metaLeadId: z.string().optional(),
          metaFormId: z.string().optional(),
        }),
        fillMissingData: z.boolean().default(true),
      })).min(1).max(5000),
    });

    const parsed = approvedBackfillSchema.parse(req.body);
    const { approvedMatches } = parsed;

    logger.warn(`[AUDIT] Referral backfill (approved pairs) by user=${req.user.id} email=${req.user.email} hospital=${hospitalId} matches=${approvedMatches.length}`);

    const allPatientIds = [...new Set(approvedMatches.map(m => m.patientId))];

    // 1. Fill missing patient data (phone/email) from lead data
    const matchesNeedingFill = approvedMatches.filter(m => m.fillMissingData && (m.lead.email || m.lead.phone));
    let patientUpdates = 0;

    if (matchesNeedingFill.length > 0) {
      // Fetch current patient records for those needing fill
      const patientsToFill = await db
        .select({
          id: patients.id,
          email: patients.email,
          phone: patients.phone,
        })
        .from(patients)
        .where(and(
          eq(patients.hospitalId, hospitalId),
          inArray(patients.id, matchesNeedingFill.map(m => m.patientId)),
        ));

      const patientMap = new Map(patientsToFill.map(p => [p.id, p]));

      for (const match of matchesNeedingFill) {
        const patient = patientMap.get(match.patientId);
        if (!patient) continue;

        const updates: { email?: string; phone?: string } = {};
        if (!patient.email && match.lead.email) {
          updates.email = match.lead.email.trim();
        }
        if (!patient.phone && match.lead.phone) {
          updates.phone = match.lead.phone.trim();
        }

        if (Object.keys(updates).length > 0) {
          await db.update(patients)
            .set(updates)
            .where(eq(patients.id, match.patientId));
          patientUpdates++;
        }
      }
    }

    // 2. Get non-cancelled appointments for matched patients
    const appointmentData = await db
      .select({
        id: clinicAppointments.id,
        patientId: clinicAppointments.patientId,
      })
      .from(clinicAppointments)
      .where(and(
        eq(clinicAppointments.hospitalId, hospitalId),
        inArray(clinicAppointments.patientId, allPatientIds),
        sql`${clinicAppointments.status} != 'cancelled'`,
      ));

    const appointmentIdsByPatient = new Map<string, string[]>();
    const allAppointmentIds: string[] = [];
    for (const a of appointmentData) {
      if (a.patientId) {
        if (!appointmentIdsByPatient.has(a.patientId)) appointmentIdsByPatient.set(a.patientId, []);
        appointmentIdsByPatient.get(a.patientId)!.push(a.id);
        allAppointmentIds.push(a.id);
      }
    }

    // 3. Find which appointments already have referral events
    const existingReferrals = allAppointmentIds.length > 0
      ? await db
          .select({
            id: referralEvents.id,
            appointmentId: referralEvents.appointmentId,
            captureMethod: referralEvents.captureMethod,
            createdAt: referralEvents.createdAt,
          })
          .from(referralEvents)
          .where(and(
            eq(referralEvents.hospitalId, hospitalId),
            inArray(referralEvents.appointmentId, allAppointmentIds),
          ))
      : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const referralByAppointment = new Map<string, { id: string; captureMethod: string; isToday: boolean }>();
    for (const r of existingReferrals) {
      if (r.appointmentId) {
        const createdDate = r.createdAt ? new Date(r.createdAt) : null;
        const isToday = createdDate ? createdDate >= today : false;
        referralByAppointment.set(r.appointmentId, { id: r.id, captureMethod: r.captureMethod, isToday });
      }
    }

    // 4. Create or update referral events
    const parseLeadDate = (dateStr?: string): Date | null => {
      if (!dateStr) return null;
      const v = dateStr.trim();
      const dotMatch = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (dotMatch) return new Date(parseInt(dotMatch[3]), parseInt(dotMatch[2]) - 1, parseInt(dotMatch[1]));
      const isoMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      return null;
    };

    // 4b. Check for existing patient-level referrals (no appointment) to avoid duplicates
    const existingPatientReferrals = allPatientIds.length > 0
      ? await db
          .select({
            id: referralEvents.id,
            patientId: referralEvents.patientId,
            captureMethod: referralEvents.captureMethod,
            createdAt: referralEvents.createdAt,
          })
          .from(referralEvents)
          .where(and(
            eq(referralEvents.hospitalId, hospitalId),
            inArray(referralEvents.patientId, allPatientIds),
            sql`${referralEvents.appointmentId} IS NULL`,
            eq(referralEvents.captureMethod, 'staff'),
          ))
      : [];
    const patientLevelReferral = new Map<string, { id: string; isToday: boolean }>();
    for (const r of existingPatientReferrals) {
      if (r.patientId) {
        const createdDate = r.createdAt ? new Date(r.createdAt) : null;
        const isToday = createdDate ? createdDate >= today : false;
        patientLevelReferral.set(r.patientId, { id: r.id, isToday });
      }
    }

    const toInsert: {
      hospitalId: string;
      patientId: string;
      appointmentId?: string;
      source: "social" | "search_engine";
      sourceDetail: string;
      captureMethod: "staff";
      createdAt: Date;
      metaLeadId?: string;
      metaFormId?: string;
    }[] = [];
    const toUpdate: { id: string; source: "social" | "search_engine"; sourceDetail: string; createdAt: Date; metaLeadId?: string; metaFormId?: string }[] = [];
    const handledAppointments = new Set<string>();
    const handledPatients = new Set<string>();

    for (const match of approvedMatches) {
      const { lead, patientId } = match;
      if (!lead.adSource) continue;

      const isGoogle = lead.adSource === 'gg';
      const source = isGoogle ? 'search_engine' as const : 'social' as const;
      const sourceDetail = isGoogle ? 'google' : lead.adSource === 'ig' ? 'instagram' : 'facebook';
      const leadDate = parseLeadDate(lead.leadDate) || new Date();
      const apptIds = appointmentIdsByPatient.get(patientId) || [];

      if (apptIds.length > 0) {
        for (const apptId of apptIds) {
          if (handledAppointments.has(apptId)) continue;
          handledAppointments.add(apptId);

          const existing = referralByAppointment.get(apptId);
          if (!existing) {
            toInsert.push({
              hospitalId,
              patientId,
              appointmentId: apptId,
              source,
              sourceDetail,
              captureMethod: "staff",
              createdAt: leadDate,
              ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}),
              ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}),
            });
          } else if (existing.captureMethod === 'staff' && existing.isToday) {
            toUpdate.push({ id: existing.id, source, sourceDetail, createdAt: leadDate, ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}), ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}) });
          }
        }
      } else {
        if (handledPatients.has(patientId)) continue;
        handledPatients.add(patientId);

        const existing = patientLevelReferral.get(patientId);
        if (!existing) {
          toInsert.push({
            hospitalId,
            patientId,
            source,
            sourceDetail,
            captureMethod: "staff",
            createdAt: leadDate,
            ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}),
            ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}),
          });
        } else if (existing.isToday) {
          toUpdate.push({ id: existing.id, source, sourceDetail, createdAt: leadDate, ...(lead.metaLeadId ? { metaLeadId: lead.metaLeadId } : {}), ...(lead.metaFormId ? { metaFormId: lead.metaFormId } : {}) });
        }
      }
    }

    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        await db.insert(referralEvents).values(batch);
      }
    }

    if (toUpdate.length > 0) {
      for (const upd of toUpdate) {
        await db.update(referralEvents)
          .set({
            source: upd.source,
            sourceDetail: upd.sourceDetail,
            createdAt: upd.createdAt,
            ...(upd.metaLeadId ? { metaLeadId: upd.metaLeadId } : {}),
            ...(upd.metaFormId ? { metaFormId: upd.metaFormId } : {}),
          })
          .where(eq(referralEvents.id, upd.id));
      }
    }

    logger.info(`[Business] Referral backfill (approved): created ${toInsert.length}, updated ${toUpdate.length} referrals, ${patientUpdates} patient updates for hospital=${hospitalId}`);

    res.json({ created: toInsert.length, updated: toUpdate.length, patientUpdates });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: 'Invalid approved match data', details: error.errors });
    }
    logger.error('[Business] Error in referral backfill:', error);
    res.status(500).json({ message: 'Failed to backfill referrals' });
  }
});

// ========================================
// Ad Budget Management (manager-only)
// ========================================

router.get('/api/business/:hospitalId/ad-budgets', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { month } = req.query;

    const { adBudgets } = await import("@shared/schema");

    if (month) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month as string)) {
        return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
      }
      const results = await db
        .select()
        .from(adBudgets)
        .where(and(eq(adBudgets.hospitalId, hospitalId), eq(adBudgets.month, month as string)));
      return res.json(results);
    }

    // No month param: return all budgets for this hospital
    const results = await db
      .select()
      .from(adBudgets)
      .where(eq(adBudgets.hospitalId, hospitalId))
      .orderBy(adBudgets.month);
    res.json(results);
  } catch (error: any) {
    logger.error('Error fetching ad budgets:', error);
    res.status(500).json({ message: 'Failed to fetch ad budgets' });
  }
});

router.put('/api/business/:hospitalId/ad-budgets', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
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

router.get('/api/business/:hospitalId/ad-performance', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    // Get all months that have budgets
    const { adBudgets } = await import("@shared/schema");
    const allBudgets = await db
      .select()
      .from(adBudgets)
      .where(eq(adBudgets.hospitalId, hospitalId))
      .orderBy(adBudgets.month);

    // Get distinct months
    const months = [...new Set(allBudgets.map(b => b.month))].sort();
    if (months.length === 0) {
      return res.json([]);
    }

    // Classify referrals into funnels, grouped by month
    const result = await db.execute(sql`
      WITH classified AS (
        SELECT
          TO_CHAR(re.created_at, 'YYYY-MM') AS month,
          CASE
            WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL THEN 'google_ads'
            WHEN (re.fbclid IS NOT NULL OR re.igshid IS NOT NULL) AND re.capture_method != 'staff' THEN 'meta_ads'
            WHEN re.source = 'social' AND re.capture_method = 'staff' AND re.fbclid IS NULL AND re.igshid IS NULL THEN 'meta_forms'
            ELSE NULL
          END AS funnel,
          ca.status AS appointment_status,
          s.payment_status,
          s.payment_date,
          COALESCE(s.price, 0) AS price,
          tr.id AS treatment_id,
          tr.status AS treatment_status,
          COALESCE(tr.total, 0) AS treatment_total
        FROM referral_events re
        LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
        LEFT JOIN LATERAL (
          SELECT s2.id, s2.status, s2.payment_status, s2.payment_date, s2.price
          FROM surgeries s2
          WHERE s2.patient_id = re.patient_id
            AND s2.hospital_id = re.hospital_id
            AND s2.planned_date >= re.created_at
            AND s2.is_archived = false
            AND COALESCE(s2.is_suspended, false) = false
          ORDER BY s2.planned_date ASC
          LIMIT 1
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT
            t.id,
            t.status,
            (SELECT COALESCE(SUM(tl.total), 0)
             FROM treatment_lines tl
             WHERE tl.treatment_id = t.id) AS total
          FROM treatments t
          WHERE t.hospital_id = re.hospital_id
            AND t.status = 'signed'
            AND (
              t.appointment_id = re.appointment_id
              OR (
                t.appointment_id IS NULL
                AND t.patient_id = re.patient_id
                AND ca.appointment_date IS NOT NULL
                AND (t.performed_at AT TIME ZONE 'UTC')::date = ca.appointment_date
              )
            )
          ORDER BY t.performed_at ASC
          LIMIT 1
        ) tr ON true
        WHERE re.hospital_id = ${hospitalId}
      )
      SELECT
        month,
        funnel,
        COUNT(*) AS leads,
        COUNT(*) FILTER (WHERE appointment_status IN ('scheduled', 'confirmed')) AS appointments_confirmed,
        COUNT(*) FILTER (WHERE appointment_status IN ('arrived', 'in_progress', 'completed')) AS appointments_kept,
        COUNT(*) FILTER (WHERE payment_date IS NOT NULL OR treatment_status = 'signed') AS paid_conversions,
        COALESCE(SUM(price + treatment_total) FILTER (WHERE payment_date IS NOT NULL OR treatment_status = 'signed'), 0) AS revenue
      FROM classified
      WHERE funnel IS NOT NULL
      GROUP BY month, funnel
      ORDER BY month, funnel
    `);

    // Build budget lookup: month -> funnel -> amount
    const budgetMap: Record<string, Record<string, number>> = {};
    for (const b of allBudgets) {
      if (!budgetMap[b.month]) budgetMap[b.month] = {};
      budgetMap[b.month][b.funnel] = b.amountChf;
    }

    // Build metrics lookup: month -> funnel -> metrics
    const metricsMap: Record<string, Record<string, any>> = {};
    for (const row of result.rows as any[]) {
      if (!metricsMap[row.month]) metricsMap[row.month] = {};
      metricsMap[row.month][row.funnel] = row;
    }

    // Build per-month response
    const allFunnels = ['google_ads', 'meta_ads', 'meta_forms'];
    const response = months.map(month => {
      let totalBudget = 0;
      let totalLeads = 0;
      let totalConfirmed = 0;
      let totalKept = 0;
      let totalPaid = 0;
      let totalRevenue = 0;

      const funnels = allFunnels.map(funnel => {
        const m = metricsMap[month]?.[funnel];
        const budget = budgetMap[month]?.[funnel] || 0;
        const leads = Number(m?.leads || 0);
        const appointmentsConfirmed = Number(m?.appointments_confirmed || 0);
        const appointmentsKept = Number(m?.appointments_kept || 0);
        const paidConversions = Number(m?.paid_conversions || 0);
        const revenue = Number(m?.revenue || 0);

        totalBudget += budget;
        totalLeads += leads;
        totalConfirmed += appointmentsConfirmed;
        totalKept += appointmentsKept;
        totalPaid += paidConversions;
        totalRevenue += revenue;

        return {
          funnel,
          budget,
          leads,
          appointmentsConfirmed,
          appointmentsKept,
          paidConversions,
          revenue,
        };
      });

      return {
        month,
        totalBudget,
        totalLeads,
        totalConfirmed,
        totalKept,
        totalPaid,
        totalRevenue,
        totalCpl: totalLeads > 0 ? Math.round(totalBudget / totalLeads) : null,
        totalCpk: totalKept > 0 ? Math.round(totalBudget / totalKept) : null,
        totalCpa: totalPaid > 0 ? Math.round(totalBudget / totalPaid) : null,
        totalRoi: totalBudget > 0 && totalPaid > 0 ? Math.round(((totalRevenue - totalBudget) / totalBudget) * 100) / 100 : null,
        funnels,
      };
    });

    res.json(response);
  } catch (error: any) {
    logger.error('Error fetching ad performance:', error);
    res.status(500).json({ message: 'Failed to fetch ad performance data' });
  }
});

// Delete all budgets for a specific month
router.delete('/api/business/:hospitalId/ad-budgets/:month', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId, month } = req.params;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ message: 'Invalid month format.' });
    }
    const { adBudgets } = await import("@shared/schema");
    await db.delete(adBudgets).where(and(eq(adBudgets.hospitalId, hospitalId), eq(adBudgets.month, month)));
    res.json({ ok: true });
  } catch (error: any) {
    logger.error('Error deleting ad budgets:', error);
    res.status(500).json({ message: 'Failed to delete budgets' });
  }
});

export default router;
