import { Router } from "express";
import type { Response, Request } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, units, hospitals, workerContracts, insertWorkerContractSchema, supplierCodes, surgeries, anesthesiaRecords, surgeryStaffEntries, inventoryCommits, items, providerTimeOff, patientQuestionnaireResponses, patientQuestionnaireLinks, referralEvents, patients, clinicAppointments, clinicServices, externalWorklogLinks } from "@shared/schema";
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
import { treatmentsStorage } from "../storage/treatments";
import {
  getReferralStats,
  getReferralTimeseries,
  listReferralEvents,
  getReferralFunnel,
  getReferralDailyBySource,
} from "../lib/referralAnalytics";
import { getAdPerformance } from "../lib/adPerformance";

const router = Router();

// Middleware to check business module access (admin, manager, or staff role)
async function isBusinessAccess(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => 
      h.id === hospitalId && 
      (h.role === 'admin' || h.role === 'manager' || h.role === 'staff' || h.role === 'group_admin')
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
      (h.role === 'admin' || h.role === 'manager' || h.role === 'group_admin')
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
      (h.role === 'admin' || h.role === 'manager' || h.role === 'marketing' || h.role === 'group_admin')
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

// Middleware: gate routes behind the per-hospital Personalstammblatt addon flag.
async function requirePersonalstammblattAddon(req: any, res: any, next: any) {
  try {
    const hospitalId = req.params.hospitalId;
    if (!hospitalId) return res.status(400).json({ message: "hospitalId required" });
    const [hosp] = await db.select({ flag: hospitals.addonPersonalstammblatt })
      .from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
    if (!hosp || !hosp.flag) return res.status(403).json({ message: "Addon disabled" });
    next();
  } catch (e) {
    logger.error("addon gate error", e);
    res.status(500).json({ message: "Addon check failed" });
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
      workerPortal: any | null;
      stammblatt: {
        status: 'missing' | 'invited' | 'in_progress' | 'submitted';
        inviteCount: number;
        lastInvitedAt?: Date | null;
        tokenExpiresAt?: Date | null;
        submittedAt?: Date | null;
      };
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
          workerPortal: null,
          stammblatt: { status: 'missing', inviteCount: 0 },
        });
      }
    }

    // Attach external-worker portal data when an externalWorklogLinks entry
    // exists for the same (hospitalId, email). Done in a single batch query
    // to avoid N+1.
    const emails = Array.from(userMap.values())
      .map((u) => u.email)
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase());
    if (emails.length > 0) {
      const { externalWorklogLinks } = await import("@shared/schema");
      const links = await db
        .select()
        .from(externalWorklogLinks)
        .where(and(
          eq(externalWorklogLinks.hospitalId, hospitalId),
          inArray(externalWorklogLinks.email, emails),
        ));
      const byEmail = new Map(links.map((l) => [l.email.toLowerCase(), l]));
      for (const u of userMap.values()) {
        if (!u.email) continue;
        const link = byEmail.get(u.email.toLowerCase());
        if (link) u.workerPortal = link;
      }

      // Attach Stammblatt status using userId for an exact match (email match
      // alone is ambiguous when the same address appears at multiple hospitals).
      const linksByUserId = new Map(
        links.filter((l) => l.userId).map((l) => [l.userId as string, l]),
      );

      function deriveStammblattStatus(link: any): 'invited' | 'in_progress' | 'submitted' {
        if (link.submittedAt) return 'submitted';
        if (link.lastAccessedAt) return 'in_progress';
        return 'invited';
      }

      for (const u of userMap.values()) {
        const link = linksByUserId.get(u.id);
        if (link) {
          u.stammblatt = {
            status: deriveStammblattStatus(link),
            inviteCount: link.inviteCount ?? 0,
            lastInvitedAt: link.lastInvitedAt,
            tokenExpiresAt: link.tokenExpiresAt,
            submittedAt: link.submittedAt,
          };
        }
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

// Personalstammblatt — bulk invite (registered before single-invite to avoid :userId matching "stammblatt-invite")
router.post(
  '/api/business/:hospitalId/staff/stammblatt-invite/bulk',
  isAuthenticated,
  isBusinessManager,
  requirePersonalstammblattAddon,
  async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { userIds, scope } = req.body as { userIds?: string[]; scope?: 'all_incomplete' };
      const { isValidStaffEmail } = await import("../services/stammblatt");

      // Resolve target user ids
      let targetIds: string[] = [];
      if (Array.isArray(userIds) && userIds.length > 0) {
        targetIds = userIds;
      } else if (scope === 'all_incomplete') {
        const rows = await storage.getHospitalUsers(hospitalId);
        const userIdsSet = new Set<string>();
        for (const u of rows) {
          if (u.role === 'admin') continue;
          userIdsSet.add(u.user.id);
        }
        // Exclude users whose stammblatt is already submitted
        if (userIdsSet.size > 0) {
          const links = await db.select().from(externalWorklogLinks)
            .where(and(
              eq(externalWorklogLinks.hospitalId, hospitalId),
              inArray(externalWorklogLinks.userId, Array.from(userIdsSet)),
            ));
          for (const l of links) {
            if (l.userId && l.submittedAt) userIdsSet.delete(l.userId);
          }
        }
        targetIds = Array.from(userIdsSet);
      } else {
        return res.status(400).json({ message: "userIds or scope required" });
      }

      const skipped: Array<{ userId: string; reason: string }> = [];
      let sent = 0;

      const { ensureStammblattLink, rotateStammblattToken } =
        await import("../services/stammblatt");
      const { sendStammblattInviteEmail } = await import("../email");
      const [hosp] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);

      for (const uid of targetIds) {
        const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
        if (!u) { skipped.push({ userId: uid, reason: "not_found" }); continue; }
        if (!isValidStaffEmail(u.email)) { skipped.push({ userId: uid, reason: "no_valid_email" }); continue; }

        try {
          let link = await ensureStammblattLink(uid, hospitalId);
          link = await rotateStammblattToken(link.id);
          await sendStammblattInviteEmail(
            u.email!, link.token, hosp?.name ?? "",
            (hosp?.defaultLanguage as 'de' | 'en') ?? 'de',
          );
          await db.update(externalWorklogLinks).set({
            inviteCount: link.inviteCount + 1,
            lastInvitedAt: new Date(),
            email: u.email!,
            updatedAt: new Date(),
          }).where(eq(externalWorklogLinks.id, link.id));
          sent++;
        } catch (err) {
          logger.error(`Bulk stammblatt invite failed for ${uid}`, err);
          skipped.push({ userId: uid, reason: "send_failed" });
        }
      }

      res.json({ sent, skipped });
    } catch (e) {
      logger.error("Bulk Stammblatt invite failed", e);
      res.status(500).json({ message: "Bulk invite failed" });
    }
  }
);

// Personalstammblatt — single invite / resend
router.post(
  '/api/business/:hospitalId/staff/:userId/stammblatt-invite',
  isAuthenticated,
  isBusinessManager,
  requirePersonalstammblattAddon,
  async (req, res) => {
    try {
      const { hospitalId, userId } = req.params;
      const { ensureStammblattLink, rotateStammblattToken, isValidStaffEmail } =
        await import("../services/stammblatt");

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!isValidStaffEmail(user.email)) {
        return res.status(400).json({ message: "User has no valid email" });
      }

      let link = await ensureStammblattLink(userId, hospitalId);
      // Always rotate token on send/resend
      link = await rotateStammblattToken(link.id);

      const [hosp] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
      const { sendStammblattInviteEmail } = await import("../email");
      await sendStammblattInviteEmail(
        user.email!,
        link.token,
        hosp?.name ?? "",
        (hosp?.defaultLanguage as 'de' | 'en') ?? 'de',
      );

      const [updated] = await db.update(externalWorklogLinks)
        .set({
          inviteCount: link.inviteCount + 1,
          lastInvitedAt: new Date(),
          email: user.email!, // keep email in sync with user
          updatedAt: new Date(),
        })
        .where(eq(externalWorklogLinks.id, link.id))
        .returning();

      res.json({
        inviteCount: updated.inviteCount,
        lastInvitedAt: updated.lastInvitedAt,
        tokenExpiresAt: updated.tokenExpiresAt,
      });
    } catch (e) {
      logger.error("Stammblatt invite failed", e);
      res.status(500).json({ message: "Failed to send invite" });
    }
  }
);

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

    const result = await getReferralStats(hospitalIds, {
      from: from as string | undefined,
      to: to as string | undefined,
    });
    res.json(result);
  } catch (error: any) {
    logger.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Failed to fetch referral stats' });
  }
});

// Referral source time-series (monthly, full history — no date filter)
router.get('/api/business/:hospitalId/referral-timeseries', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    // Task 13: Funnels scope toggle. Widens to every hospital in the group
    // when `X-Active-Scope: group` is sent and caller has group access.
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    const rows = await getReferralTimeseries(hospitalIds);
    res.json(rows);
  } catch (error: any) {
    logger.error('Error fetching referral timeseries:', error);
    res.status(500).json({ message: 'Failed to fetch referral timeseries' });
  }
});

// Referral source daily-by-source counts (powers the upgraded
// "Referral Sources Over Time" line chart + weekday peaks bar).
router.get('/api/business/:hospitalId/referral-daily', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query;

    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    try {
      const result = await getReferralDailyBySource(hospitalIds, {
        from: from as string | undefined,
        to: to as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      if (err?.name === "ReferralDailyRangeError") {
        return res.status(400).json({ message: err.message });
      }
      throw err;
    }
  } catch (error: any) {
    logger.error('Error fetching referral daily-by-source:', error);
    res.status(500).json({ message: 'Failed to fetch referral daily-by-source' });
  }
});

// Recent referral events list (for verifying click ID tracking)
router.get('/api/business/:hospitalId/referral-events', isAuthenticated, isMarketingOrManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    const from = typeof req.query.from === "string" && req.query.from.length > 0 ? req.query.from : undefined;
    const to = typeof req.query.to === "string" && req.query.to.length > 0 ? req.query.to : undefined;
    const campaign = typeof req.query.campaign === "string" && req.query.campaign.length > 0 ? req.query.campaign : undefined;

    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    const result = await listReferralEvents(hospitalIds, { limit, before, from, to, campaign });
    res.json(result);
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

    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const canEdit = hospitals.some((h: any) => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin' || h.role === 'manager'));
    if (!canEdit) {
      return res.status(403).json({ message: 'Only admins or managers can edit referral events' });
    }

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
    const isAdminForHospital = hospitals.some((h: any) => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin'));
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

    // Task 13: Funnels scope toggle — widen `re.hospital_id` to the full
    // group. The LATERAL `surgeries` subquery already joins on
    // `s2.hospital_id = re.hospital_id`, so expanding the outer scope
    // transparently cascades to surgery matching (each referral still only
    // pairs with surgeries at its *own* home hospital).
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }

    const rows = await getReferralFunnel(hospitalIds, {
      from: from as string | undefined,
      to: to as string | undefined,
    });
    res.json(rows);
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
    let hospitalIds: string[];
    try {
      hospitalIds = await resolveHospitalScope(req, req.user.id, hospitalId);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        return res.status(403).json({ message: err.message, code: err.code });
      }
      throw err;
    }
    const rows = await getAdPerformance(hospitalIds);
    res.json(rows);
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

router.get('/api/business/:hospitalId/treatments-summary', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const range = parseInt((req.query.range as string)?.replace('d', '') || '30', 10);
    const summary = await treatmentsStorage.getTreatmentsSummary(hospitalId, range);
    res.json(summary);
  } catch (error) {
    logger.error("Error fetching treatments summary:", error);
    res.status(500).json({ message: "Failed to fetch treatments summary" });
  }
});

// Surgeries summary — counts and revenue split into "planned" (planned_date in range)
// and "converted/won" (payment_date in range). byDay is keyed by payment_date so it
// pairs naturally with the revenue-by-day chart (which represents realized revenue).
router.get('/api/business/:hospitalId/surgeries-summary', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);

    // "Planned" KPIs are strictly forward-looking (planned_date >= today) and
    // intentionally NOT bounded by `range`. The dashboard's range selector is
    // for backward-looking comparison; it should not change how many future
    // surgeries are scheduled.
    const totalsRow = await db.execute<{
      count_planned: string;
      count_converted: string;
      revenue_planned: string;
      revenue_won: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE s.planned_date >= NOW()) AS count_planned,
        COUNT(*) FILTER (WHERE s.payment_date IS NOT NULL AND s.payment_date >= ${bounds.startDate}::date AND s.payment_date < ${bounds.endDate}::date) AS count_converted,
        COALESCE(SUM(CAST(s.price AS numeric)) FILTER (WHERE s.planned_date >= NOW()), 0) AS revenue_planned,
        COALESCE(SUM(CAST(s.price AS numeric)) FILTER (WHERE s.payment_date IS NOT NULL AND s.payment_date >= ${bounds.startDate}::date AND s.payment_date < ${bounds.endDate}::date), 0) AS revenue_won
      FROM surgeries s
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
    `);

    const dayRows = await db.execute<{ date: string; count: string; revenue: string }>(sql`
      SELECT
        s.payment_date AS date,
        COUNT(*) AS count,
        COALESCE(SUM(CAST(s.price AS numeric)), 0) AS revenue
      FROM surgeries s
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
        AND s.payment_date IS NOT NULL
        AND s.payment_date >= ${bounds.startDate}::date
        AND s.payment_date < ${bounds.endDate}::date
      GROUP BY s.payment_date
      ORDER BY s.payment_date ASC
    `);

    const totals = totalsRow.rows[0] as any;
    res.json({
      countPlanned: parseInt(totals?.count_planned || '0'),
      countConverted: parseInt(totals?.count_converted || '0'),
      revenuePlanned: parseFloat(totals?.revenue_planned || '0'),
      revenueWon: parseFloat(totals?.revenue_won || '0'),
      byDay: (dayRows.rows as any[]).map(r => ({
        date: typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().slice(0, 10),
        count: parseInt(r.count) || 0,
        revenue: parseFloat(r.revenue) || 0,
      })),
    });
  } catch (error) {
    logger.error("Error fetching surgeries summary:", error);
    res.status(500).json({ message: "Failed to fetch surgeries summary" });
  }
});

router.get('/api/business/:hospitalId/money-summary', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const range = (req.query.range as string) || '30d';
    const { computeMoneySummary } = await import('./business/moneyHelpers');
    const summary = await computeMoneySummary(hospitalId, range);
    res.json(summary);
  } catch (error) {
    logger.error("Error computing money summary:", error);
    res.status(500).json({ message: "Failed to compute money summary" });
  }
});

router.get('/api/business/:hospitalId/top-procedures-by-margin', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const range = (req.query.range as string) || '30d';
    const limit = Math.min(parseInt((req.query.limit as string) || '5', 10), 50);
    const { computeTopProceduresByMargin } = await import('./business/topProcedures');
    const rows = await computeTopProceduresByMargin(hospitalId, range, limit);
    res.json(rows);
  } catch (error) {
    logger.error("Error computing top procedures by margin:", error);
    res.status(500).json({ message: "Failed to compute top procedures" });
  }
});

router.get('/api/business/:hospitalId/providers-performance', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);
    const startIso = bounds.startIso;
    const endIso = bounds.endIso;
    const startDate = bounds.startDate;
    const endDate = bounds.endDate;

    // Per-provider treatments: count + revenue from treatments + treatment_lines
    const treatmentRows = await db.execute<{
      provider_id: string;
      first_name: string | null;
      last_name: string | null;
      treatments_count: string;
      revenue: string;
    }>(sql`
      SELECT
        t.provider_id,
        u.first_name,
        u.last_name,
        COUNT(DISTINCT t.id) AS treatments_count,
        COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue
      FROM treatments t
      LEFT JOIN treatment_lines tl ON tl.treatment_id = t.id
      LEFT JOIN users u ON u.id = t.provider_id
      WHERE t.hospital_id = ${hospitalId}
        AND t.performed_at >= ${startIso}
        AND t.performed_at < ${endIso}
        AND t.status IN ('signed', 'invoiced')
        AND t.provider_id IS NOT NULL
      GROUP BY t.provider_id, u.first_name, u.last_name
    `);

    // Per-provider surgeries: planned (by planned_date) + converted (by payment_date)
    // counts and revenue. Both ranges are evaluated independently against the same
    // surgeon row, so a surgery planned 6 months ago and paid this month contributes
    // to "converted" only.
    const surgeryRows = await db.execute<{
      provider_id: string;
      first_name: string | null;
      last_name: string | null;
      surgeries_planned: string;
      surgeries_converted: string;
      revenue_planned: string;
      revenue_won: string;
    }>(sql`
      SELECT
        s.surgeon_id AS provider_id,
        u.first_name,
        u.last_name,
        COUNT(*) FILTER (WHERE s.planned_date >= ${startIso} AND s.planned_date < ${endIso}) AS surgeries_planned,
        COUNT(*) FILTER (WHERE s.payment_date IS NOT NULL AND s.payment_date >= ${startDate}::date AND s.payment_date < ${endDate}::date) AS surgeries_converted,
        COALESCE(SUM(CAST(s.price AS numeric)) FILTER (WHERE s.planned_date >= ${startIso} AND s.planned_date < ${endIso}), 0) AS revenue_planned,
        COALESCE(SUM(CAST(s.price AS numeric)) FILTER (WHERE s.payment_date IS NOT NULL AND s.payment_date >= ${startDate}::date AND s.payment_date < ${endDate}::date), 0) AS revenue_won
      FROM surgeries s
      LEFT JOIN users u ON u.id = s.surgeon_id
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
        AND s.surgeon_id IS NOT NULL
        AND (
          (s.planned_date >= ${startIso} AND s.planned_date < ${endIso})
          OR (s.payment_date IS NOT NULL AND s.payment_date >= ${startDate}::date AND s.payment_date < ${endDate}::date)
        )
      GROUP BY s.surgeon_id, u.first_name, u.last_name
    `);

    // Merge both lists keyed by provider_id
    const merged = new Map<string, {
      providerId: string;
      name: string;
      treatmentsCount: number;
      treatmentsRevenue: number;
      surgeriesPlanned: number;
      surgeriesConverted: number;
      revenuePlanned: number;
      revenueWon: number;
      utilizationPct: number | null;
    }>();

    for (const r of treatmentRows.rows as any[]) {
      const treatmentsRevenue = parseFloat(r.revenue) || 0;
      merged.set(r.provider_id, {
        providerId: r.provider_id,
        name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
        treatmentsCount: parseInt(r.treatments_count) || 0,
        treatmentsRevenue,
        surgeriesPlanned: 0,
        surgeriesConverted: 0,
        revenuePlanned: treatmentsRevenue,
        revenueWon: treatmentsRevenue,
        utilizationPct: null, // Phase B.2 follow-up will compute from scheduled hours.
      });
    }
    for (const r of surgeryRows.rows as any[]) {
      const surgeriesPlanned = parseInt(r.surgeries_planned) || 0;
      const surgeriesConverted = parseInt(r.surgeries_converted) || 0;
      const surgeryRevenuePlanned = parseFloat(r.revenue_planned) || 0;
      const surgeryRevenueWon = parseFloat(r.revenue_won) || 0;
      const existing = merged.get(r.provider_id);
      if (existing) {
        existing.surgeriesPlanned = surgeriesPlanned;
        existing.surgeriesConverted = surgeriesConverted;
        existing.revenuePlanned += surgeryRevenuePlanned;
        existing.revenueWon += surgeryRevenueWon;
      } else {
        merged.set(r.provider_id, {
          providerId: r.provider_id,
          name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
          treatmentsCount: 0,
          treatmentsRevenue: 0,
          surgeriesPlanned,
          surgeriesConverted,
          revenuePlanned: surgeryRevenuePlanned,
          revenueWon: surgeryRevenueWon,
          utilizationPct: null,
        });
      }
    }

    const providers = Array.from(merged.values()).sort((a, b) => b.revenueWon - a.revenueWon);
    res.json({ providers });
  } catch (error) {
    logger.error("Error fetching providers performance:", error);
    res.status(500).json({ message: "Failed to fetch providers performance" });
  }
});

router.get('/api/business/:hospitalId/funnel-snapshot', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);

    // Leads + contacted + booked in one query
    const leadsRow = await db.execute<{
      leads: string;
      contacted: string;
      booked: string;
    }>(sql`
      SELECT
        COUNT(*) AS leads,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id
        )) AS contacted,
        COUNT(*) FILTER (WHERE l.appointment_id IS NOT NULL) AS booked
      FROM leads l
      WHERE l.hospital_id = ${hospitalId}
        AND l.created_at >= ${bounds.startIso}
        AND l.created_at < ${bounds.endIso}
    `);

    // First-visit = leads whose appointment actually resolved (completed or confirmed)
    const firstVisitRow = await db.execute<{ first_visit: string }>(sql`
      SELECT COUNT(*) AS first_visit
      FROM leads l
      JOIN clinic_appointments ca ON ca.id = l.appointment_id
      WHERE l.hospital_id = ${hospitalId}
        AND l.created_at >= ${bounds.startIso}
        AND l.created_at < ${bounds.endIso}
        AND ca.status IN ('completed', 'confirmed')
    `);

    const leadsCount = parseInt((leadsRow.rows[0] as any)?.leads || '0');
    const contacted = parseInt((leadsRow.rows[0] as any)?.contacted || '0');
    const booked = parseInt((leadsRow.rows[0] as any)?.booked || '0');
    const firstVisit = parseInt((firstVisitRow.rows[0] as any)?.first_visit || '0');

    res.json({
      leads: leadsCount,
      contacted,
      booked,
      firstVisit,
      conversionPct: leadsCount > 0 ? Number(((firstVisit / leadsCount) * 100).toFixed(1)) : 0,
    });
  } catch (error) {
    logger.error("Error fetching funnel snapshot:", error);
    res.status(500).json({ message: "Failed to fetch funnel snapshot" });
  }
});

// Referrals grouped by source for the selected range. This is the primary
// "where did patients come from" signal on the dashboard — referral_events is
// captured at booking time and carries the normalized source enum, whereas
// raw leads (ad form submissions) have collapsed in quality and conversion.
router.get('/api/business/:hospitalId/referrals-by-source', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);
    const rows = await db.execute<{
      source: string;
      referrals: string;
      completed: string;
      paid: string;
    }>(sql`
      SELECT re.source,
             COUNT(*) AS referrals,
             -- Attended: appointment exists and is completed/confirmed.
             -- Operational signal — did the patient show up?
             COUNT(*) FILTER (
               WHERE re.appointment_id IS NOT NULL
                 AND (
                   re.appointment_final_status IN ('completed', 'confirmed')
                   OR EXISTS (
                     SELECT 1 FROM clinic_appointments ca
                     WHERE ca.id = re.appointment_id
                       AND ca.status IN ('completed', 'confirmed')
                   )
                 )
             ) AS completed,
             -- Paid: referred patient has a paid surgery on or after the
             -- referral date. Money signal — did this referral produce
             -- revenue? Heuristic, since we have no direct FK from referral
             -- to surgery; bounded by the referral date so a previously-paid
             -- patient doesn't get re-attributed to a new referral.
             COUNT(*) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM surgeries s
                 WHERE s.patient_id = re.patient_id
                   AND s.hospital_id = re.hospital_id
                   AND s.is_archived = false
                   AND s.payment_date IS NOT NULL
                   AND s.payment_date >= re.created_at::date
               )
             ) AS paid
      FROM referral_events re
      WHERE re.hospital_id = ${hospitalId}
        AND re.created_at >= ${bounds.startIso}
        AND re.created_at < ${bounds.endIso}
      GROUP BY re.source
      ORDER BY COUNT(*) DESC
    `);

    res.json({
      sources: (rows.rows as any[]).map(r => {
        const referrals = parseInt(r.referrals || '0', 10);
        const completed = parseInt(r.completed || '0', 10);
        const paid = parseInt(r.paid || '0', 10);
        return {
          source: r.source as string,
          referrals,
          completed,
          paid,
          conversionPct: referrals > 0 ? Number(((completed / referrals) * 100).toFixed(1)) : 0,
          conversionPaidPct: referrals > 0 ? Number(((paid / referrals) * 100).toFixed(1)) : 0,
        };
      }),
    });
  } catch (error) {
    logger.error("Error fetching referrals-by-source:", error);
    res.status(500).json({ message: "Failed to fetch referrals by source" });
  }
});

// Referrals over time, grouped by source. Powers the "Referral sources over
// time" chart in the dashboard Pipeline tab. Granularity adapts to the
// range: monthly bins for "all"/year filters, daily for legacy "Nd" so the
// trend is meaningful at any zoom level.
router.get('/api/business/:hospitalId/referrals-over-time', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);

    // Monthly bins when the window spans more than ~60 days, daily otherwise.
    const startMs = Date.parse(bounds.startIso);
    const endMs = Date.parse(bounds.endIso);
    const spanDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
    const useMonthly = bounds.isAll || bounds.isYear || spanDays > 60;
    const truncFn = useMonthly ? sql`to_char(created_at, 'YYYY-MM')` : sql`to_char(created_at, 'YYYY-MM-DD')`;

    const rows = await db.execute<{ period: string; source: string; count: string }>(sql`
      SELECT ${truncFn} AS period,
             source,
             COUNT(*) AS count
      FROM referral_events
      WHERE hospital_id = ${hospitalId}
        AND created_at >= ${bounds.startIso}
        AND created_at < ${bounds.endIso}
      GROUP BY ${truncFn}, source
      ORDER BY ${truncFn}, source
    `);

    const byPeriod = (rows.rows as any[]).map(r => ({
      period: r.period as string,
      source: r.source as string,
      count: parseInt(r.count || '0', 10),
    }));

    // Days in window. For "all"/very-wide ranges fall back to the actual data
    // span (earliest → today) so avg-per-day doesn't get diluted by an
    // arbitrary 1970-start bound.
    let avgDays = spanDays;
    if (bounds.isAll) {
      const earliest = await db.execute<{ first: string | null; latest: string | null }>(sql`
        SELECT MIN(created_at)::text AS first, MAX(created_at)::text AS latest
        FROM referral_events
        WHERE hospital_id = ${hospitalId}
      `);
      const first = (earliest.rows[0] as any)?.first;
      const latest = (earliest.rows[0] as any)?.latest;
      if (first && latest) {
        const fMs = Date.parse(first);
        const lMs = Date.parse(latest);
        avgDays = Math.max(1, Math.round((lMs - fMs) / 86_400_000) + 1);
      }
    }
    const total = byPeriod.reduce((sum, r) => sum + r.count, 0);
    const avgPerDay = avgDays > 0 ? total / avgDays : 0;

    // Prior-window average so the card can show a delta. We use a window of
    // the same length immediately preceding the current one. Skipped for
    // "all" — there is no meaningful prior side for an open-ended range.
    let avgPerDayPrev: number | null = null;
    if (!bounds.isAll) {
      const priorEndIso = bounds.startIso;
      const priorStartMs = startMs - (endMs - startMs);
      const priorStartIso = new Date(priorStartMs).toISOString();
      const priorRow = await db.execute<{ total: string }>(sql`
        SELECT COUNT(*)::text AS total
        FROM referral_events
        WHERE hospital_id = ${hospitalId}
          AND created_at >= ${priorStartIso}
          AND created_at < ${priorEndIso}
      `);
      const priorTotal = parseInt((priorRow.rows[0] as any)?.total || '0', 10);
      avgPerDayPrev = avgDays > 0 ? priorTotal / avgDays : null;
    }

    res.json({
      granularity: useMonthly ? 'month' : 'day',
      byPeriod,
      total,
      totalDays: avgDays,
      avgPerDay,
      avgPerDayPrev,
    });
  } catch (error) {
    logger.error("Error fetching referrals-over-time:", error);
    res.status(500).json({ message: "Failed to fetch referrals over time" });
  }
});

// Drill-down: referral events for one source within range.
router.get('/api/business/:hospitalId/referrals-detail', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const source = (req.query.source as string) || '';
    if (!source) {
      return res.status(400).json({ message: "source is required" });
    }
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);
    const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 500);

    const rows = await db.execute<{
      id: string;
      created_at: string;
      source_detail: string | null;
      capture_method: string;
      patient_first_name: string | null;
      patient_last_name: string | null;
      appointment_status: string | null;
      appointment_final_status: string | null;
      utm_source: string | null;
      utm_campaign: string | null;
    }>(sql`
      SELECT re.id,
             re.created_at,
             re.source_detail,
             re.capture_method,
             p.first_name AS patient_first_name,
             p.surname    AS patient_last_name,
             ca.status     AS appointment_status,
             re.appointment_final_status,
             re.utm_source,
             re.utm_campaign
      FROM referral_events re
      LEFT JOIN patients p ON p.id = re.patient_id
      LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
      WHERE re.hospital_id = ${hospitalId}
        AND re.source = ${source}
        AND re.created_at >= ${bounds.startIso}
        AND re.created_at < ${bounds.endIso}
      ORDER BY re.created_at DESC
      LIMIT ${limit}
    `);

    res.json({
      source,
      referrals: (rows.rows as any[]).map(r => ({
        id: r.id as string,
        createdAt: r.created_at as string,
        sourceDetail: r.source_detail as string | null,
        captureMethod: r.capture_method as string,
        patientName: [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || null,
        appointmentStatus: (r.appointment_final_status ?? r.appointment_status) as string | null,
        utmSource: r.utm_source as string | null,
        utmCampaign: r.utm_campaign as string | null,
      })),
    });
  } catch (error) {
    logger.error("Error fetching referrals-detail:", error);
    res.status(500).json({ message: "Failed to fetch referrals detail" });
  }
});

// Leads grouped by referral source for the selected range. Used by the
// /business Pipeline tab in place of the bare "Leads" funnel stage — direct
// bookings will deflate raw lead counts, so the breakdown is more actionable
// than the total alone.
router.get('/api/business/:hospitalId/leads-by-source', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);
    const rows = await db.execute<{
      source: string;
      leads: string;
      booked: string;
      first_visit: string;
    }>(sql`
      SELECT
        COALESCE(NULLIF(TRIM(l.source), ''), 'unknown') AS source,
        COUNT(*) AS leads,
        COUNT(*) FILTER (WHERE l.appointment_id IS NOT NULL) AS booked,
        COUNT(*) FILTER (
          WHERE l.appointment_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM clinic_appointments ca
              WHERE ca.id = l.appointment_id
                AND ca.status IN ('completed', 'confirmed')
            )
        ) AS first_visit
      FROM leads l
      WHERE l.hospital_id = ${hospitalId}
        AND l.created_at >= ${bounds.startIso}
        AND l.created_at < ${bounds.endIso}
      GROUP BY COALESCE(NULLIF(TRIM(l.source), ''), 'unknown')
      ORDER BY COUNT(*) DESC
    `);

    res.json({
      sources: (rows.rows as any[]).map(r => {
        const leads = parseInt(r.leads || '0', 10);
        const booked = parseInt(r.booked || '0', 10);
        const firstVisit = parseInt(r.first_visit || '0', 10);
        return {
          source: r.source as string,
          leads,
          booked,
          firstVisit,
          conversionPct: leads > 0 ? Number(((firstVisit / leads) * 100).toFixed(1)) : 0,
        };
      }),
    });
  } catch (error) {
    logger.error("Error fetching leads-by-source:", error);
    res.status(500).json({ message: "Failed to fetch leads by source" });
  }
});

// Cash-flow by month — "booked" (surgeries scheduled in the month, by
// planned_date) vs "paid" (surgeries with payment_date in the month). The gap
// between the two lines is the collection lag, which is invisible elsewhere.
router.get('/api/business/:hospitalId/cash-flow', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);

    const rows = await db.execute<{ month: string; booked: string; paid: string }>(sql`
      WITH months AS (
        SELECT to_char(planned_date, 'YYYY-MM') AS month,
               COALESCE(SUM(CAST(price AS numeric)), 0) AS booked,
               0::numeric AS paid
        FROM surgeries
        WHERE hospital_id = ${hospitalId}
          AND is_archived = false
          AND planned_date IS NOT NULL
          AND planned_date >= ${bounds.startIso}
          AND planned_date < ${bounds.endIso}
        GROUP BY to_char(planned_date, 'YYYY-MM')
        UNION ALL
        SELECT to_char(payment_date, 'YYYY-MM') AS month,
               0::numeric AS booked,
               COALESCE(SUM(CAST(price AS numeric)), 0) AS paid
        FROM surgeries
        WHERE hospital_id = ${hospitalId}
          AND is_archived = false
          AND payment_date IS NOT NULL
          AND payment_date >= ${bounds.startDate}::date
          AND payment_date < ${bounds.endDate}::date
        GROUP BY to_char(payment_date, 'YYYY-MM')
      )
      SELECT month,
             SUM(booked)::text AS booked,
             SUM(paid)::text AS paid
      FROM months
      GROUP BY month
      ORDER BY month
    `);

    res.json({
      byMonth: (rows.rows as any[]).map(r => ({
        month: r.month,
        booked: parseFloat(r.booked || '0'),
        paid: parseFloat(r.paid || '0'),
      })),
    });
  } catch (error) {
    logger.error("Error fetching cash-flow:", error);
    res.status(500).json({ message: "Failed to fetch cash flow" });
  }
});

// Auto-detected anomalies: 2-3 most material deltas between last 30 days and
// the 30 days before that. Surfaced at the top of the dashboard so the
// clinic owner doesn't have to hunt for what changed.
router.get('/api/business/:hospitalId/insights', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - 30);
    const prevEnd = new Date(start);
    const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - 30);

    const curStartIso = start.toISOString();
    const curEndIso = now.toISOString();
    const prevStartIso = prevStart.toISOString();
    const prevEndIso = prevEnd.toISOString();

    // Revenue + margin deltas (current vs prior 30d) — reuse the money helpers.
    const { computeMoneySummary } = await import('./business/moneyHelpers');
    const [cur, prev] = await Promise.all([
      computeMoneySummary(hospitalId, '30d'),
      // For the prior window we use the prior-period margin only — we don't
      // need byMonth on the prev side, just totals.
      (async () => {
        const surgeryRows = await db.execute<{ revenue: string; cost: string }>(sql`
          SELECT COALESCE(SUM(CAST(s.price AS numeric)), 0) AS revenue, 0::numeric AS cost
          FROM surgeries s
          WHERE s.hospital_id = ${hospitalId} AND s.is_archived = false
            AND s.payment_date IS NOT NULL
            AND s.payment_date >= ${prevStart.toISOString().slice(0,10)}::date
            AND s.payment_date < ${start.toISOString().slice(0,10)}::date
        `);
        const treatRows = await db.execute<{ revenue: string }>(sql`
          SELECT COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue
          FROM treatments t
          LEFT JOIN treatment_lines tl ON tl.treatment_id = t.id
          WHERE t.hospital_id = ${hospitalId}
            AND t.status IN ('signed', 'invoiced')
            AND t.performed_at >= ${prevStartIso}
            AND t.performed_at < ${prevEndIso}
        `);
        const sr = parseFloat((surgeryRows.rows[0] as any)?.revenue || '0');
        const tr = parseFloat((treatRows.rows[0] as any)?.revenue || '0');
        return { revenue: { total: sr + tr } };
      })(),
    ]);

    const insights: Array<{ id: string; severity: 'critical' | 'positive' | 'negative' | 'neutral'; message: string }> = [];

    // 1) Revenue delta
    const revCur = cur.revenue.total;
    const revPrev = prev.revenue.total;
    if (revPrev > 0) {
      const pct = ((revCur - revPrev) / revPrev) * 100;
      if (Math.abs(pct) >= 10) {
        insights.push({
          id: 'revenue',
          severity: pct >= 0 ? 'positive' : 'negative',
          message: `Revenue ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}% vs the prior 30 days`,
        });
      }
    }

    // 2) Margin pp delta — temporarily disabled. With low-volume prior
    // windows the percent-point swing reads as "+100pp" against essentially
    // empty baselines, which makes the dashboard load with a noisy card.
    // Re-enable once the volume floor is raised or the calc is gated on a
    // minimum prior-period cost+revenue.

    // 3) Top surgeon caseload swing
    const surgeonRows = await db.execute<{
      surgeon_id: string;
      first_name: string | null;
      last_name: string | null;
      cur_cnt: string;
      prev_cnt: string;
    }>(sql`
      SELECT s.surgeon_id,
             u.first_name,
             u.last_name,
             COUNT(*) FILTER (WHERE s.payment_date >= ${start.toISOString().slice(0,10)}::date AND s.payment_date < ${now.toISOString().slice(0,10)}::date) AS cur_cnt,
             COUNT(*) FILTER (WHERE s.payment_date >= ${prevStart.toISOString().slice(0,10)}::date AND s.payment_date < ${start.toISOString().slice(0,10)}::date) AS prev_cnt
      FROM surgeries s
      LEFT JOIN users u ON u.id = s.surgeon_id
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
        AND s.surgeon_id IS NOT NULL
        AND s.payment_date IS NOT NULL
        AND s.payment_date >= ${prevStart.toISOString().slice(0,10)}::date
        AND s.payment_date < ${now.toISOString().slice(0,10)}::date
      GROUP BY s.surgeon_id, u.first_name, u.last_name
    `);
    let topSurgeonSwing: { name: string; cur: number; prev: number; pct: number } | null = null;
    for (const r of surgeonRows.rows as any[]) {
      const cur_cnt = parseInt(r.cur_cnt || '0', 10);
      const prev_cnt = parseInt(r.prev_cnt || '0', 10);
      if (prev_cnt < 3) continue; // ignore noise from low-volume providers
      const pct = ((cur_cnt - prev_cnt) / prev_cnt) * 100;
      if (Math.abs(pct) < 25) continue;
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || 'A surgeon';
      if (!topSurgeonSwing || Math.abs(pct) > Math.abs(topSurgeonSwing.pct)) {
        topSurgeonSwing = { name, cur: cur_cnt, prev: prev_cnt, pct };
      }
    }
    if (topSurgeonSwing) {
      insights.push({
        id: 'surgeon',
        severity: topSurgeonSwing.pct >= 0 ? 'positive' : 'negative',
        message: `${topSurgeonSwing.name}'s caseload ${topSurgeonSwing.pct >= 0 ? 'up' : 'down'} ${Math.abs(topSurgeonSwing.pct).toFixed(0)}% (${topSurgeonSwing.cur} vs ${topSurgeonSwing.prev})`,
      });
    }

    // Critical alerts: getting appointments is the user's #1 priority right
    // now. Any meaningful decline in incoming referrals OR booked
    // appointments needs to surface at the top of the panel, even with
    // small absolute numbers.

    // Total referrals delta — anything ≥10% drop fires as critical.
    const refTotalsRow = await db.execute<{ cur_cnt: string; prev_cnt: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${curStartIso} AND created_at < ${curEndIso}) AS cur_cnt,
        COUNT(*) FILTER (WHERE created_at >= ${prevStartIso} AND created_at < ${prevEndIso}) AS prev_cnt
      FROM referral_events
      WHERE hospital_id = ${hospitalId}
        AND created_at >= ${prevStartIso}
        AND created_at < ${curEndIso}
    `);
    const refCur = parseInt((refTotalsRow.rows[0] as any)?.cur_cnt || '0', 10);
    const refPrev = parseInt((refTotalsRow.rows[0] as any)?.prev_cnt || '0', 10);
    if (refPrev >= 3) {
      const refPct = ((refCur - refPrev) / refPrev) * 100;
      if (refPct <= -10) {
        insights.push({
          id: 'referrals-total',
          severity: 'critical',
          message: `Total referrals down ${Math.abs(refPct).toFixed(0)}% vs prior 30 days (${refCur} vs ${refPrev}) — getting new bookings is suffering`,
        });
      } else if (refPct >= 25) {
        insights.push({
          id: 'referrals-total',
          severity: 'positive',
          message: `Total referrals up ${refPct.toFixed(0)}% vs prior 30 days (${refCur} vs ${refPrev})`,
        });
      }
    }

    // Appointment count delta — count newly created appointments in each
    // window (created_at as proxy for "scheduling activity"). A flat or
    // dropping pipeline of NEW appointments is the leading indicator of
    // future revenue.
    const apptRow = await db.execute<{ cur_cnt: string; prev_cnt: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= ${curStartIso} AND created_at < ${curEndIso}) AS cur_cnt,
        COUNT(*) FILTER (WHERE created_at >= ${prevStartIso} AND created_at < ${prevEndIso}) AS prev_cnt
      FROM clinic_appointments
      WHERE hospital_id = ${hospitalId}
        AND created_at >= ${prevStartIso}
        AND created_at < ${curEndIso}
    `);
    const apptCur = parseInt((apptRow.rows[0] as any)?.cur_cnt || '0', 10);
    const apptPrev = parseInt((apptRow.rows[0] as any)?.prev_cnt || '0', 10);
    if (apptPrev >= 3) {
      const apptPct = ((apptCur - apptPrev) / apptPrev) * 100;
      if (apptPct <= -10) {
        insights.push({
          id: 'appointments-total',
          severity: 'critical',
          message: `New appointments down ${Math.abs(apptPct).toFixed(0)}% vs prior 30 days (${apptCur} vs ${apptPrev}) — booking volume is sliding`,
        });
      } else if (apptPct >= 25) {
        insights.push({
          id: 'appointments-total',
          severity: 'positive',
          message: `New appointments up ${apptPct.toFixed(0)}% vs prior 30 days (${apptCur} vs ${apptPrev})`,
        });
      }
    }

    // 4) Top referral-source swing. We deliberately read referral_events
    // here (not leads) — leads have become low-signal as ad-form traffic
    // dropped in conversion; referral_events captures actual bookings
    // attributed to a source, which is what the user steers on.
    const sourceRows = await db.execute<{
      source: string;
      cur_cnt: string;
      prev_cnt: string;
    }>(sql`
      SELECT source,
             COUNT(*) FILTER (WHERE created_at >= ${curStartIso} AND created_at < ${curEndIso}) AS cur_cnt,
             COUNT(*) FILTER (WHERE created_at >= ${prevStartIso} AND created_at < ${prevEndIso}) AS prev_cnt
      FROM referral_events
      WHERE hospital_id = ${hospitalId}
        AND created_at >= ${prevStartIso}
        AND created_at < ${curEndIso}
      GROUP BY source
    `);
    let topSourceSwing: { source: string; cur: number; prev: number; pct: number } | null = null;
    for (const r of sourceRows.rows as any[]) {
      const cur_cnt = parseInt(r.cur_cnt || '0', 10);
      const prev_cnt = parseInt(r.prev_cnt || '0', 10);
      if (prev_cnt < 5) continue;
      const pct = ((cur_cnt - prev_cnt) / prev_cnt) * 100;
      if (Math.abs(pct) < 25) continue;
      if (!topSourceSwing || Math.abs(pct) > Math.abs(topSourceSwing.pct)) {
        topSourceSwing = { source: r.source, cur: cur_cnt, prev: prev_cnt, pct };
      }
    }
    if (topSourceSwing) {
      insights.push({
        id: 'referrals',
        severity: topSourceSwing.pct >= 0 ? 'positive' : 'negative',
        message: `Referrals from ${topSourceSwing.source} ${topSourceSwing.pct >= 0 ? 'up' : 'down'} ${Math.abs(topSourceSwing.pct).toFixed(0)}% (${topSourceSwing.cur} vs ${topSourceSwing.prev})`,
      });
    }

    // Show at most 4. Sort: critical first (always shown), then negative,
    // then positive, then neutral. Critical alerts are the user's main
    // signal that the booking pipeline is in trouble — never drop them.
    const sevOrder: Record<string, number> = { critical: 0, negative: 1, positive: 2, neutral: 3 };
    const ordered = insights
      .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity])
      .slice(0, 4);

    res.json({ insights: ordered });
  } catch (error) {
    logger.error("Error computing insights:", error);
    res.status(500).json({ message: "Failed to compute insights" });
  }
});

// Inventory value broken down by unit. The /business dashboard inventory
// card uses this in place of the older "items below threshold" view —
// per-unit value is the business-relevant cut (re-introducing the layout
// that existed before the 2026-Q1 dashboard rewrite).
router.get('/api/business/:hospitalId/inventory-by-unit', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    // Multiple snapshots can exist for the same (unit_id, snapshot_date) —
    // there's no unique constraint and the worker can write more than once
    // per day. Use DISTINCT ON to grab exactly one row per unit (newest
    // snapshot, breaking ties by created_at) so each unit appears only once.
    const rows = await db.execute<{
      unit_id: string;
      unit_name: string | null;
      unit_type: string | null;
      total_value: string;
      item_count: string;
      snapshot_date: string;
    }>(sql`
      SELECT *
      FROM (
        SELECT DISTINCT ON (inv.unit_id)
               inv.unit_id,
               u.name AS unit_name,
               u.type AS unit_type,
               inv.total_value::text AS total_value,
               inv.item_count::text AS item_count,
               inv.snapshot_date::text AS snapshot_date
        FROM inventory_snapshots inv
        LEFT JOIN units u ON u.id = inv.unit_id
        WHERE inv.hospital_id = ${hospitalId}
        ORDER BY inv.unit_id, inv.snapshot_date DESC, inv.created_at DESC NULLS LAST
      ) latest_per_unit
      WHERE CAST(total_value AS numeric) > 0
      ORDER BY CAST(total_value AS numeric) DESC
    `);

    const units = (rows.rows as any[]).map(r => ({
      unitId: r.unit_id as string,
      unitName: (r.unit_name as string | null) ?? 'Unknown unit',
      unitType: (r.unit_type as string | null) ?? null,
      totalValue: parseFloat(r.total_value ?? '0'),
      itemCount: parseInt(r.item_count ?? '0', 10),
      snapshotDate: r.snapshot_date as string,
    }));
    const totalValue = units.reduce((sum, u) => sum + u.totalValue, 0);
    res.json({ totalValue, units });
  } catch (error) {
    logger.error("Error fetching inventory-by-unit:", error);
    res.status(500).json({ message: "Failed to fetch inventory by unit" });
  }
});

// Per-item breakdown for one inventory unit — powers the drill-down popup
// from the inventory card.
router.get('/api/business/:hospitalId/inventory-unit-detail', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const unitId = (req.query.unitId as string) || '';
    if (!unitId) return res.status(400).json({ message: "unitId is required" });
    const limit = Math.min(parseInt((req.query.limit as string) || '200', 10), 1000);

    const rows = await db.execute<{
      id: string;
      name: string;
      qty: string;
      unit_price: string | null;
      total_value: string;
    }>(sql`
      WITH stock AS (
        SELECT item_id, COALESCE(SUM(qty_on_hand), 0) AS qty
        FROM stock_levels
        WHERE unit_id = ${unitId}
        GROUP BY item_id
      ),
      best_price AS (
        SELECT DISTINCT ON (item_id) item_id, CAST(basispreis AS numeric) AS unit_price
        FROM supplier_codes
        ORDER BY item_id, is_preferred DESC, basispreis ASC NULLS LAST
      )
      SELECT i.id,
             i.name,
             COALESCE(s.qty, 0)::text AS qty,
             bp.unit_price::text       AS unit_price,
             (COALESCE(s.qty, 0) * COALESCE(bp.unit_price, 0) / GREATEST(COALESCE(i.pack_size, 1), 1))::text AS total_value
      FROM items i
      LEFT JOIN stock s ON s.item_id = i.id
      LEFT JOIN best_price bp ON bp.item_id = i.id
      WHERE i.hospital_id = ${hospitalId}
        AND i.unit_id = ${unitId}
        AND i.status = 'active'
        AND COALESCE(i.is_service, false) = false
      ORDER BY (COALESCE(s.qty, 0) * COALESCE(bp.unit_price, 0)) DESC NULLS LAST, i.name
      LIMIT ${limit}
    `);

    res.json({
      unitId,
      items: (rows.rows as any[]).map(r => ({
        id: r.id as string,
        name: r.name as string,
        qty: parseInt(r.qty ?? '0', 10),
        unitPrice: r.unit_price == null ? null : parseFloat(r.unit_price),
        totalValue: parseFloat(r.total_value ?? '0'),
      })),
    });
  } catch (error) {
    logger.error("Error fetching inventory-unit-detail:", error);
    res.status(500).json({ message: "Failed to fetch inventory unit detail" });
  }
});

// Promoted inventory card data — current value, low-stock count, and a sample
// list of items below their min_threshold so the user knows what's running out.
router.get('/api/business/:hospitalId/inventory-summary', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const totalsRow = await db.execute<{ total_value: string }>(sql`
      SELECT COALESCE(SUM(CAST(total_value AS numeric)), 0)::text AS total_value
      FROM inventory_snapshots
      WHERE hospital_id = ${hospitalId}
        AND snapshot_date = (
          SELECT MAX(snapshot_date) FROM inventory_snapshots WHERE hospital_id = ${hospitalId}
        )
    `);
    const totalValue = parseFloat((totalsRow.rows[0] as any)?.total_value || '0');

    const lowRows = await db.execute<{
      id: string;
      name: string;
      qty_on_hand: string;
      min_threshold: string;
    }>(sql`
      SELECT i.id,
             i.name,
             COALESCE(SUM(sl.qty_on_hand), 0)::text AS qty_on_hand,
             COALESCE(i.min_threshold, 0)::text AS min_threshold
      FROM items i
      LEFT JOIN stock_levels sl ON sl.item_id = i.id
      WHERE i.hospital_id = ${hospitalId}
        AND i.status = 'active'
        AND COALESCE(i.is_service, false) = false
        AND i.min_threshold IS NOT NULL
        AND i.min_threshold > 0
      GROUP BY i.id, i.name, i.min_threshold
      HAVING COALESCE(SUM(sl.qty_on_hand), 0) <= COALESCE(i.min_threshold, 0)
      ORDER BY (COALESCE(SUM(sl.qty_on_hand), 0)::float / NULLIF(i.min_threshold, 0)::float) ASC NULLS FIRST,
               i.name ASC
      LIMIT 10
    `);

    const lowStockItems = (lowRows.rows as any[]).map(r => ({
      id: r.id as string,
      name: r.name as string,
      qtyOnHand: parseInt(r.qty_on_hand || '0', 10),
      minThreshold: parseInt(r.min_threshold || '0', 10),
    }));

    const countRow = await db.execute<{ low_count: string }>(sql`
      SELECT COUNT(*)::text AS low_count
      FROM (
        SELECT i.id
        FROM items i
        LEFT JOIN stock_levels sl ON sl.item_id = i.id
        WHERE i.hospital_id = ${hospitalId}
          AND i.status = 'active'
          AND COALESCE(i.is_service, false) = false
          AND i.min_threshold IS NOT NULL
          AND i.min_threshold > 0
        GROUP BY i.id, i.min_threshold
        HAVING COALESCE(SUM(sl.qty_on_hand), 0) <= COALESCE(i.min_threshold, 0)
      ) sub
    `);
    const lowStockCount = parseInt((countRow.rows[0] as any)?.low_count || '0', 10);

    res.json({
      totalValue,
      lowStockCount,
      lowStockItems,
    });
  } catch (error) {
    logger.error("Error fetching inventory summary:", error);
    res.status(500).json({ message: "Failed to fetch inventory summary" });
  }
});

// Drill-down: list of surgeries paid in a specific month, for the trend
// chart click-through. Limit + offset for paging.
router.get('/api/business/:hospitalId/surgeries-in-month', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const month = (req.query.month as string) || '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }
    const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 200);
    const [y, m] = month.split('-').map((n) => parseInt(n, 10));
    const startDate = `${month}-01`;
    const endDate = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, '0')}-01`;

    const rows = await db.execute<{
      id: string;
      planned_surgery: string | null;
      payment_date: string;
      price: string | null;
      surgeon_first_name: string | null;
      surgeon_last_name: string | null;
      patient_first_name: string | null;
      patient_last_name: string | null;
    }>(sql`
      SELECT s.id,
             s.planned_surgery,
             s.payment_date,
             s.price,
             us.first_name AS surgeon_first_name,
             us.last_name  AS surgeon_last_name,
             p.first_name  AS patient_first_name,
             p.last_name   AS patient_last_name
      FROM surgeries s
      LEFT JOIN users us ON us.id = s.surgeon_id
      LEFT JOIN patients p ON p.id = s.patient_id
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
        AND s.payment_date IS NOT NULL
        AND s.payment_date >= ${startDate}::date
        AND s.payment_date < ${endDate}::date
      ORDER BY s.payment_date DESC, s.id
      LIMIT ${limit}
    `);

    res.json({
      month,
      surgeries: (rows.rows as any[]).map(r => ({
        id: r.id as string,
        plannedSurgery: r.planned_surgery as string | null,
        paymentDate: r.payment_date as string,
        price: parseFloat(r.price ?? '0'),
        surgeonName: [r.surgeon_first_name, r.surgeon_last_name].filter(Boolean).join(' ') || null,
        patientName: [r.patient_first_name, r.patient_last_name].filter(Boolean).join(' ') || null,
      })),
    });
  } catch (error) {
    logger.error("Error fetching surgeries-in-month:", error);
    res.status(500).json({ message: "Failed to fetch surgeries in month" });
  }
});

// Drill-down: leads detail for a specific source within the dashboard range.
router.get('/api/business/:hospitalId/leads-detail', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const source = (req.query.source as string) || '';
    if (!source) {
      return res.status(400).json({ message: "source is required" });
    }
    const { resolveRange } = await import('./business/rangeUtils');
    const bounds = resolveRange(req.query.range as string);
    const limit = Math.min(parseInt((req.query.limit as string) || '100', 10), 500);

    const rows = await db.execute<{
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      operation: string | null;
      status: string;
      created_at: string;
      appointment_id: string | null;
      appointment_status: string | null;
    }>(sql`
      SELECT l.id,
             l.first_name,
             l.last_name,
             l.email,
             l.phone,
             l.operation,
             l.status,
             l.created_at,
             l.appointment_id,
             ca.status AS appointment_status
      FROM leads l
      LEFT JOIN clinic_appointments ca ON ca.id = l.appointment_id
      WHERE l.hospital_id = ${hospitalId}
        AND COALESCE(NULLIF(TRIM(l.source), ''), 'unknown') = ${source}
        AND l.created_at >= ${bounds.startIso}
        AND l.created_at < ${bounds.endIso}
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `);

    res.json({
      source,
      leads: (rows.rows as any[]).map(r => ({
        id: r.id as string,
        firstName: r.first_name as string,
        lastName: r.last_name as string,
        email: r.email as string | null,
        phone: r.phone as string | null,
        operation: r.operation as string | null,
        status: r.status as string,
        createdAt: r.created_at as string,
        appointmentId: r.appointment_id as string | null,
        appointmentStatus: r.appointment_status as string | null,
      })),
    });
  } catch (error) {
    logger.error("Error fetching leads-detail:", error);
    res.status(500).json({ message: "Failed to fetch leads detail" });
  }
});

router.get('/api/business/:hospitalId/inventory-value-trend', isAuthenticated, isBusinessManager, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const days = Math.min(parseInt((req.query.days as string) || '30', 10), 365);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    const rows = await db.execute<{ date: string; value: string }>(sql`
      SELECT snapshot_date::text AS date,
             COALESCE(SUM(CAST(total_value AS numeric)), 0)::text AS value
      FROM inventory_snapshots
      WHERE hospital_id = ${hospitalId}
        AND snapshot_date >= ${cutoffIso}::date
      GROUP BY snapshot_date
      ORDER BY snapshot_date
    `);
    res.json(
      (rows.rows as any[]).map(r => ({ date: r.date, value: parseFloat(r.value ?? '0') })),
    );
  } catch (error) {
    logger.error("Error computing inventory value trend:", error);
    res.status(500).json({ message: "Failed to compute inventory value trend" });
  }
});

export default router;
