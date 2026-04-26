import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { users, userHospitalRoles } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import logger from "../logger";
import {
  getHospitalGroupId as getHospitalGroupIdFromDb,
  getGroupHospitalIds as getGroupHospitalIdsFromDb,
} from "../storage/hospitals";
import {
  ROLE_HIERARCHY as SHARED_ROLE_HIERARCHY,
  WRITE_ROLES as SHARED_WRITE_ROLES,
  READ_ONLY_ROLES as SHARED_READ_ONLY_ROLES,
  type UserRole as SharedUserRole,
} from "@shared/roles";

// Re-export from the shared module so existing server callers keep working.
// `group_admin`'s position in this array is cosmetic (display/listing order),
// not a privilege ranking — it's orthogonal to the standard hospital-admin
// hierarchy (admin > manager > doctor > ...).
export const ROLE_HIERARCHY = SHARED_ROLE_HIERARCHY;
export type UserRole = SharedUserRole;

// 'group_admin' is write-capable — it's the multi-location chain-level admin
// (spec: "Patrick / chain CEO or CMO"). They run the group catalog and
// marketing from any hospital in the group.
export const WRITE_ROLES: UserRole[] = SHARED_WRITE_ROLES;
export const READ_ONLY_ROLES: UserRole[] = SHARED_READ_ONLY_ROLES;

// Helper to get hospitalId from various resource types
export async function getHospitalIdFromResource(params: {
  surgeryId?: string;
  anesthesiaRecordId?: string;
  recordId?: string;
  preOpId?: string;
  itemId?: string;
  orderId?: string;
  orderLineId?: string;
  alertId?: string;
  lotId?: string;
  noteId?: string;
  todoId?: string;
  roomId?: string;
  groupId?: string;
  surgeryRoomId?: string;
  medicationGroupId?: string;
  administrationGroupId?: string;
  unitId?: string;
  roleId?: string;
}): Promise<string | null> {
  // Direct hospitalId resources
  if (params.surgeryId) {
    const surgery = await storage.getSurgery(params.surgeryId);
    return surgery?.hospitalId || null;
  }

  if (params.itemId) {
    const item = await storage.getItem(params.itemId);
    return item?.hospitalId || null;
  }

  if (params.orderId) {
    const order = await storage.getOrderById(params.orderId);
    return order?.hospitalId || null;
  }

  if (params.alertId) {
    const alert = await storage.getAlertById(params.alertId);
    return alert?.hospitalId || null;
  }
  
  // Try anesthesia record ID (need to get surgeryId first, then hospitalId)
  if (params.anesthesiaRecordId || params.recordId) {
    const recordId = params.anesthesiaRecordId || params.recordId;
    const record = await storage.getAnesthesiaRecordById(recordId!);
    if (record?.surgeryId) {
      const surgery = await storage.getSurgery(record.surgeryId);
      return surgery?.hospitalId || null;
    }
    return null;
  }
  
  // Try preop assessment ID (need to get surgeryId first, then hospitalId)
  if (params.preOpId) {
    const assessment = await storage.getPreOpAssessmentById(params.preOpId);
    if (assessment?.surgeryId) {
      const surgery = await storage.getSurgery(assessment.surgeryId);
      return surgery?.hospitalId || null;
    }
    return null;
  }

  // Order line → order → hospital
  if (params.orderLineId) {
    const line = await storage.getOrderLineById(params.orderLineId);
    if (line?.orderId) {
      const order = await storage.getOrderById(line.orderId);
      return order?.hospitalId || null;
    }
    return null;
  }

  // Lot → item → hospital
  if (params.lotId) {
    const lot = await storage.getLotById(params.lotId);
    if (lot?.itemId) {
      const item = await storage.getItem(lot.itemId);
      return item?.hospitalId || null;
    }
    return null;
  }
  
  // Surgery room resolution (roomId or surgeryRoomId)
  if (params.roomId || params.surgeryRoomId) {
    const roomId = params.roomId || params.surgeryRoomId;
    const room = await storage.getSurgeryRoomById(roomId!);
    return room?.hospitalId || null;
  }
  
  // Medication group resolution (groupId might be medication or administration, try both)
  if (params.medicationGroupId) {
    const group = await storage.getMedicationGroupById(params.medicationGroupId);
    return group?.hospitalId || null;
  }
  
  // Administration group resolution
  if (params.administrationGroupId) {
    const group = await storage.getAdministrationGroupById(params.administrationGroupId);
    return group?.hospitalId || null;
  }
  
  // Generic groupId - try medication group first, then administration group
  if (params.groupId) {
    const medGroup = await storage.getMedicationGroupById(params.groupId);
    if (medGroup) return medGroup.hospitalId;
    const adminGroup = await storage.getAdministrationGroupById(params.groupId);
    if (adminGroup) return adminGroup.hospitalId;
    return null;
  }
  
  // Unit resolution
  if (params.unitId) {
    const unit = await storage.getUnit(params.unitId);
    return unit?.hospitalId || null;
  }
  
  // User hospital role resolution
  if (params.roleId) {
    const role = await storage.getUserHospitalRoleById(params.roleId);
    return role?.hospitalId || null;
  }
  
  return null;
}

// Middleware factory for resource-based access control
// Usage: app.get('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId'), handler)
export function requireResourceAccess(paramName: string, requireWrite: boolean = false) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({ message: `Missing required parameter: ${paramName}` });
      }

      // Build params object for getHospitalIdFromResource
      const params: Record<string, string> = {};
      params[paramName] = resourceId;

      const hospitalId = await getHospitalIdFromResource(params);
      logger.info(`[AccessControl] Resource ${paramName}=${resourceId} -> hospitalId=${hospitalId}`);
      if (!hospitalId) {
        logger.info(`[AccessControl] Resource not found for ${paramName}=${resourceId}`);
        return res.status(404).json({ message: "Resource not found" });
      }

      // Verify user has access to this hospital (group-aware: lets a user at
      // hospital X in group G read resources at hospital Y in the same group).
      const hasAccess = await userHasGroupAwareHospitalAccess(userId, hospitalId, req);
      logger.info(`[AccessControl] User ${userId} access to hospital ${hospitalId}: ${hasAccess}`);
      if (!hasAccess) {
        return res.status(403).json({
          message: "Access denied. You do not have access to this resource.",
          code: "RESOURCE_ACCESS_DENIED"
        });
      }

      // If write access required, check role. Note: for cross-location group
      // access, the user may not have a direct role at `hospitalId`. In that
      // case we use their group_admin role (write-capable) or the active
      // hospital's role if they're acting within the group.
      if (requireWrite) {
        const role = await getGroupAwareUserRole(userId, hospitalId, req);
        if (!canWrite(role)) {
          return res.status(403).json({
            message: "Insufficient permissions. Guest users have read-only access.",
            code: "READ_ONLY_ACCESS"
          });
        }
        req.resolvedRole = role;
      }

      // Store verified hospital info for route handlers
      req.verifiedHospitalId = hospitalId;
      req.resolvedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking resource access for ${paramName}:`, error);
      res.status(500).json({ message: "Error checking resource permissions" });
    }
  };
}

// Middleware factory for admin-only resource access control
// Verifies user is admin for the hospital that owns the resource
export function requireResourceAdmin(paramName: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({ message: `Missing required parameter: ${paramName}` });
      }

      // Build params object for getHospitalIdFromResource
      const params: Record<string, string> = {};
      params[paramName] = resourceId;

      const hospitalId = await getHospitalIdFromResource(params);
      if (!hospitalId) {
        return res.status(404).json({ message: "Resource not found" });
      }

      // Verify user has admin role for this hospital. group_admin counts
      // as admin at every member clinic in the chain.
      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin'));
      if (!hasAdminRole) {
        return res.status(403).json({ 
          message: "Admin access required for this resource.",
          code: "ADMIN_ACCESS_REQUIRED"
        });
      }

      // Store verified hospital info for route handlers
      req.verifiedHospitalId = hospitalId;
      req.resolvedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking admin resource access for ${paramName}:`, error);
      res.status(500).json({ message: "Error checking resource permissions" });
    }
  };
}

// Check if user has any access (read or write) to a hospital.
//
// Legacy single-hospital check (no group awareness). Kept for places that
// need the original semantics. Group-aware callers should use
// `userHasGroupAwareHospitalAccess` (which respects multi-location group
// membership and group_admin escalation).
export async function userHasHospitalAccess(userId: string, hospitalId: string): Promise<boolean> {
  const hospitals = await storage.getUserHospitals(userId);
  return hospitals.some(h => h.id === hospitalId);
}

// ============================================================================
// Group-aware access control (multi-location groups, Phase 1).
// ============================================================================

// Per-request memo: resolving a hospital's groupId runs on every patient read,
// so we cache it on `req` so we don't re-hit the DB multiple times in a
// single request. The cache lives for the lifetime of the request — a
// simple `req._groupCache` property (same pattern as `req.verifiedHospitalId`).
type GroupCache = {
  hospitalToGroup: Map<string, string | null>;
  groupToHospitals: Map<string, string[]>;
};

function getOrInitGroupCache(req: any): GroupCache {
  if (!req) {
    // No request object — return a fresh cache so callers outside middleware
    // (e.g. unit tests) still work. They just don't get memoization.
    return {
      hospitalToGroup: new Map(),
      groupToHospitals: new Map(),
    };
  }
  if (!req._groupCache) {
    req._groupCache = {
      hospitalToGroup: new Map(),
      groupToHospitals: new Map(),
    } as GroupCache;
  }
  return req._groupCache as GroupCache;
}

/**
 * Per-request memoized wrapper around `getHospitalGroupId`. Uses `req`
 * as the cache scope so repeated calls in the same Express request hit
 * memory, not the database.
 */
export async function getHospitalGroupIdCached(
  hospitalId: string,
  req?: any,
): Promise<string | null> {
  const cache = getOrInitGroupCache(req);
  if (cache.hospitalToGroup.has(hospitalId)) {
    return cache.hospitalToGroup.get(hospitalId) ?? null;
  }
  const groupId = await getHospitalGroupIdFromDb(hospitalId);
  cache.hospitalToGroup.set(hospitalId, groupId);
  return groupId;
}

/**
 * Per-request memoized wrapper around `getGroupHospitalIds`. Same contract
 * as `getHospitalGroupIdCached`.
 */
export async function getGroupHospitalIdsCached(
  groupId: string,
  req?: any,
): Promise<string[]> {
  const cache = getOrInitGroupCache(req);
  const existing = cache.groupToHospitals.get(groupId);
  if (existing) return existing;
  const ids = await getGroupHospitalIdsFromDb(groupId);
  cache.groupToHospitals.set(groupId, ids);
  return ids;
}

/**
 * Check if a user has `role = "group_admin"` at any hospital that shares a
 * group with the target hospital. Platform admins implicitly satisfy this;
 * callers that already know the user is a platform admin should short-circuit
 * before calling.
 *
 * Intended callsite: Task 13 group-admin management surface (`/business/group`).
 * Exposed from this file because the query logic mirrors what group-aware
 * access checks already do and we want one canonical implementation.
 */
export async function userIsGroupAdminForHospital(
  userId: string,
  hospitalId: string,
  req?: any,
): Promise<boolean> {
  const targetGroup = await getHospitalGroupIdCached(hospitalId, req);
  if (!targetGroup) return false;
  const rows = await db
    .select({ hospitalId: userHospitalRoles.hospitalId })
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.role, "group_admin"),
      ),
    );
  for (const row of rows) {
    const g = await getHospitalGroupIdCached(row.hospitalId, req);
    if (g === targetGroup) return true;
  }
  return false;
}

/**
 * Core group-aware access check. Given the user's *active* hospital context
 * (from `X-Active-Hospital-Id`), the hospital the resource lives at, and the
 * user's role rows, return whether access is allowed.
 *
 * - Platform admin → always allowed.
 * - Same hospital (active === resource) → allowed.
 * - Active hospital and resource hospital share a non-null group → allowed.
 * - User has `group_admin` at any hospital whose group matches the resource's
 *   group → allowed (cross-active-scope escalation).
 * - Un-grouped hospitals (both `groupId IS NULL`) with different IDs → denied.
 *
 * NOTE: this function does NOT verify the user has a role at the active
 * hospital. The middleware wraps it with `userHasHospitalAccess` beforehand
 * (or equivalent), so `activeHospitalId` is already trusted when passed in.
 */
export async function canAccessHospitalInGroup(
  activeHospitalId: string | null,
  resourceHospitalId: string,
  userRoles: Array<{ hospitalId: string; role: string }>,
  isPlatformAdmin: boolean,
  req?: any,
): Promise<boolean> {
  if (isPlatformAdmin) return true;
  if (activeHospitalId && activeHospitalId === resourceHospitalId) return true;

  const resourceGroup = await getHospitalGroupIdCached(resourceHospitalId, req);
  // Un-grouped resource: no cross-hospital access. Only exact match (handled
  // above) and platform admin (handled above) can reach this resource.
  if (!resourceGroup) return false;

  // Same-group implicit access via the active hospital.
  if (activeHospitalId) {
    const activeGroup = await getHospitalGroupIdCached(activeHospitalId, req);
    if (activeGroup && activeGroup === resourceGroup) return true;
  }

  // group_admin escalation: any group_admin role at a hospital whose group
  // matches the resource's group unlocks access, independent of active hospital.
  for (const r of userRoles) {
    if (r.role !== "group_admin") continue;
    const g = await getHospitalGroupIdCached(r.hospitalId, req);
    if (g === resourceGroup) return true;
  }

  return false;
}

/**
 * Resolves the caller's active hospital from the request. Preferred signal is
 * the `X-Active-Hospital-Id` header (set by the client hospital-picker).
 * Returns null if unknown — callers should still try direct-role match
 * before deciding access.
 */
function getActiveHospitalIdFromRequest(req: any): string | null {
  const header = req?.headers?.["x-active-hospital-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

/**
 * Internal: fetch `users.is_platform_admin` for a user, memoized per request.
 */
async function isPlatformAdminCached(
  userId: string,
  req?: any,
): Promise<boolean> {
  if (req && typeof req._isPlatformAdmin === "boolean") {
    return req._isPlatformAdmin;
  }
  const [u] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId));
  const val = u?.isPlatformAdmin === true;
  if (req) req._isPlatformAdmin = val;
  return val;
}

/**
 * Resolve the user's *effective* role for the given hospital under the
 * group-aware rules. Order of preference:
 *   1. Direct role at the hospital (existing behavior).
 *   2. Platform admin → 'admin'.
 *   3. group_admin role anywhere in the resource's group → 'group_admin'.
 *   4. Highest role at any hospital in the resource's group (implicit
 *      same-group access).
 *   5. null if none of the above apply.
 *
 * The existing role hierarchy (admin > manager > doctor > nurse > ...) is
 * preserved for same-hospital requests. Cross-location requests bubble the
 * role up via the group.
 *
 * -------------------------------------------------------------------------
 * IMPORTANT: step-4 semantics
 * -------------------------------------------------------------------------
 * Step 4 deliberately returns the user's BEST role held at ANY hospital in
 * the resource's group when no direct role at the resource hospital exists.
 * This is correct for `canWrite` / role-hierarchy comparisons used by the
 * read/write middlewares — a user with `admin` at hospital A in group G is
 * treated as having admin-grade write permissions on resources at hospital
 * B (also in G) when they have same-group implicit access.
 *
 * What this function is NOT:
 *   - Not a "role AT this hospital" check. The returned role may have been
 *     earned at a DIFFERENT hospital in the group.
 *   - Not suitable for admin-only equality checks.
 *
 * Admin-only gates (e.g. `requireResourceAdmin`, `requireHospitalAdmin`, any
 * handler guarded by `role === 'admin'` exactly for operations like user
 * invites, unit creation, or settings mutations) MUST continue to use the
 * DIRECT role at the hospital — not this function's return value. Otherwise
 * an admin at hospital A in group G could perform admin-only actions at
 * hospital B, which is NOT what the multi-location spec grants.
 *
 * Safe use:
 *   // Write gate for any write-capable role (including group_admin):
 *   const role = await getGroupAwareUserRole(userId, hospitalId, req);
 *   if (!canWrite(role)) return res.status(403)...
 *
 * Unsafe use (DO NOT do this):
 *   // Wrong — would allow "admin at A" to admin-manage B in the same group:
 *   const role = await getGroupAwareUserRole(userId, hospitalId, req);
 *   if (role !== 'admin') return res.status(403)...
 *
 * Correct admin check:
 *   const hospitals = await storage.getUserHospitals(userId);
 *   const isAdminAtTarget = hospitals.some(
 *     (h) => h.id === hospitalId && h.role === 'admin',
 *   );
 *   if (!isAdminAtTarget) return res.status(403)...
 */
export async function getGroupAwareUserRole(
  userId: string,
  hospitalId: string,
  req?: any,
): Promise<string | null> {
  // Fetch the user's hospital-role rows once; reuse for both direct and
  // group-wide lookups to avoid duplicate DB hits on the hot path.
  const userHospitals = await storage.getUserHospitals(userId);

  // 1. Direct role at the target hospital (same-hospital, original semantics).
  const directRoles = userHospitals
    .filter((h) => h.id === hospitalId)
    .map((h) => h.role)
    .filter(Boolean) as string[];
  if (directRoles.length > 0) {
    for (const pref of [
      "admin",
      "manager",
      "doctor",
      "nurse",
      "staff",
      "marketing",
      "guest",
    ]) {
      if (directRoles.includes(pref)) return pref;
    }
    return directRoles[0];
  }

  // 2. Platform admin bypass — treat as 'admin' for write-capability.
  if (await isPlatformAdminCached(userId, req)) return "admin";

  const resourceGroup = await getHospitalGroupIdCached(hospitalId, req);
  if (!resourceGroup) return null;

  // 3. group_admin anywhere in the resource's group.
  for (const h of userHospitals) {
    if (h.role !== "group_admin") continue;
    const g = await getHospitalGroupIdCached(h.id, req);
    if (g === resourceGroup) return "group_admin";
  }

  // 4. Highest-ranked role held at ANY hospital in the resource's group
  //    (same-group implicit access).
  const rolesInGroup: string[] = [];
  for (const h of userHospitals) {
    const g = await getHospitalGroupIdCached(h.id, req);
    if (g === resourceGroup && h.role) rolesInGroup.push(h.role);
  }
  if (rolesInGroup.length === 0) return null;
  for (const pref of [
    "admin",
    "manager",
    "doctor",
    "nurse",
    "staff",
    "marketing",
    "guest",
  ]) {
    if (rolesInGroup.includes(pref)) return pref;
  }
  return rolesInGroup[0] ?? null;
}

/**
 * Group-aware version of `userHasHospitalAccess`. Used by the access-control
 * middlewares. Preserves the fast path (direct role match at the resource)
 * for un-grouped hospitals and adds the group-aware extensions from the
 * multi-location spec. Per-request memoized via `req`.
 */
export async function userHasGroupAwareHospitalAccess(
  userId: string,
  resourceHospitalId: string,
  req?: any,
): Promise<boolean> {
  // Platform admins see everything — short-circuit before any role lookup.
  if (await isPlatformAdminCached(userId, req)) return true;

  // Direct role match preserves existing single-hospital behavior cheaply.
  const userHospitals = await storage.getUserHospitals(userId);
  if (userHospitals.some((h) => h.id === resourceHospitalId)) return true;

  // No direct role — fall back to group-aware checks. Only trust the client
  // header's active hospital if the user actually has a role there; otherwise
  // a caller could forge any header to jump groups.
  const headerActive = getActiveHospitalIdFromRequest(req);
  const activeHospitalId =
    headerActive && userHospitals.some((h) => h.id === headerActive)
      ? headerActive
      : null;
  const userRoles = userHospitals.map((h) => ({
    hospitalId: h.id,
    role: h.role,
  }));
  return canAccessHospitalInGroup(
    activeHospitalId,
    resourceHospitalId,
    userRoles,
    false,
    req,
  );
}

export async function getUserUnitForHospital(
  userId: string, 
  hospitalId: string, 
  activeUnitId?: string
): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  
  if (activeUnitId) {
    const hasAccess = hospitals.some(h => h.id === hospitalId && h.unitId === activeUnitId);
    if (hasAccess) {
      return activeUnitId;
    }
  }
  
  const hospital = hospitals.find(h => h.id === hospitalId);
  return hospital?.unitId || null;
}

export function getActiveUnitIdFromRequest(req: Request): string | null {
  return (req.headers as any)['x-active-unit-id'] || null;
}

export async function getUserRole(userId: string, hospitalId: string): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  const matchingHospitals = hospitals.filter(h => h.id === hospitalId);
  
  if (matchingHospitals.length === 0) {
    return null;
  }
  
  const roles = matchingHospitals.map(h => h.role).filter(Boolean);
  
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('doctor')) return 'doctor';
  if (roles.includes('nurse')) return 'nurse';
  if (roles.includes('staff')) return 'staff';
  if (roles.includes('guest')) return 'guest';
  
  return roles[0] || null;
}

export async function verifyUserHospitalUnitAccess(
  userId: string, 
  hospitalId: string, 
  unitId: string
): Promise<{ hasAccess: boolean; role: string | null }> {
  const hospitals = await storage.getUserHospitals(userId);
  const match = hospitals.find(h => h.id === hospitalId && h.unitId === unitId);
  return {
    hasAccess: !!match,
    role: match?.role || null
  };
}

export function canWrite(role: string | null): boolean {
  if (!role) return false;
  return WRITE_ROLES.includes(role as UserRole);
}

export function isGuest(role: string | null): boolean {
  return role === 'guest';
}

// Check if user's active unit is a logistics unit (type === 'logistic')
// Logistics users can manage orders from any unit in the hospital
export async function isUserInLogisticUnit(
  userId: string, 
  hospitalId: string, 
  activeUnitId?: string
): Promise<boolean> {
  const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId);
  if (!unitId) return false;
  
  const unit = await storage.getUnit(unitId);
  return unit?.type === 'logistic';
}

// Check if user has logistics access for a hospital (any of their units has type === 'logistic')
// This allows logistic users to manage orders from ALL units in the hospital
export async function hasLogisticsAccess(
  userId: string, 
  hospitalId: string
): Promise<boolean> {
  const userHospitals = await storage.getUserHospitals(userId);
  const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
  
  if (userUnitsForHospital.length === 0) return false;
  
  const unitIds = userUnitsForHospital.map(h => h.unitId).filter(Boolean) as string[];
  
  for (const unitId of unitIds) {
    const unit = await storage.getUnit(unitId);
    if (unit?.type === 'logistic') {
      return true;
    }
  }
  
  return false;
}

// Check if user can access a specific order (either owns the unit or has logistics access)
export async function canAccessOrder(
  userId: string,
  hospitalId: string,
  orderUnitId: string
): Promise<boolean> {
  const userHospitals = await storage.getUserHospitals(userId);
  const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
  
  if (userUnitsForHospital.length === 0) return false;
  
  // Check if user has direct access to the order's unit
  const hasDirectAccess = userUnitsForHospital.some(h => h.unitId === orderUnitId);
  if (hasDirectAccess) return true;
  
  // Check if user has logistics access (any of their units has isLogisticModule)
  return hasLogisticsAccess(userId, hospitalId);
}

// Helper to resolve hospitalId from request parameters.
//
// Security note: the `X-Active-Hospital-Id` header is set by the client, so we
// must validate it before trusting it downstream. A user who has a role at
// hospital A (in group G) could otherwise forge the header to point at
// hospital B (also in G) and upgrade their effective "home" hospital — which
// downstream handlers sometimes treat as the caller's own tenant for side
// effects (e.g. stamping `createdByHospitalId`). Before returning the header
// value we verify the authenticated user actually holds a role at that
// hospital; if not, we fall through to body/params/resource lookup so
// `req.resolvedHospitalId` is either a hospital the user has a direct role
// at, or a hospital determined by the resource itself.
async function resolveHospitalIdFromRequest(
  req: any,
  userId?: string,
): Promise<string | null> {
  // 1. Try X-Active-Hospital-Id header (most reliable) — but only trust it if
  //    the caller actually has a role at that hospital.
  const headerHospitalId = req.headers['x-active-hospital-id'];
  if (headerHospitalId && typeof headerHospitalId === "string") {
    if (!userId) {
      // Backwards-compatible path: no userId passed in. We can't validate, so
      // keep the original behavior (trust the header). All in-tree callers
      // now pass userId; this branch only protects external/legacy callers.
      return headerHospitalId;
    }
    const userHospitals = await storage.getUserHospitals(userId);
    if (userHospitals.some((h) => h.id === headerHospitalId)) {
      return headerHospitalId;
    }
    // Header is forged / user has no role there — fall through to the other
    // sources below instead of trusting it.
  }

  // 2. Try explicit hospitalId from params, body, or query
  const explicitHospitalId = req.params.hospitalId || req.body?.hospitalId || req.query?.hospitalId;
  if (explicitHospitalId) return explicitHospitalId;

  // 3. Try to resolve from resource IDs (surgery, anesthesia record, etc.)
  const resourceHospitalId = await getHospitalIdFromResource({
    surgeryId: req.params.surgeryId || req.body?.surgeryId,
    anesthesiaRecordId: req.params.anesthesiaRecordId || req.body?.anesthesiaRecordId,
    recordId: req.params.recordId || req.params.id, // Many routes use :id for record ID
    preOpId: req.params.preOpId || req.params.assessmentId,
  });
  if (resourceHospitalId) return resourceHospitalId;

  return null;
}

// Middleware to verify user has read access to the hospital (lenient - allows if hospitalId not found)
export async function requireHospitalAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const hospitalId = await resolveHospitalIdFromRequest(req, userId);

    if (!hospitalId) {
      // If we can't determine hospitalId, allow the request but log it
      // The route handler should handle data isolation
      logger.warn(`[Access Control] Could not resolve hospitalId for ${req.method} ${req.path}`);
      return next();
    }

    const hasAccess = await userHasGroupAwareHospitalAccess(userId, hospitalId, req);

    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }

    // Store the resolved hospitalId for use by route handlers
    req.resolvedHospitalId = hospitalId;
    next();
  } catch (error) {
    logger.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware - fails if hospitalId cannot be resolved (use for multi-tenant routes)
export async function requireStrictHospitalAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req, userId);
    
    if (!hospitalId) {
      logger.error(`[Access Control] STRICT: Missing hospitalId for ${req.method} ${req.path}`);
      return res.status(400).json({
        message: "Hospital context required. Please select a hospital.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }

    const hasAccess = await userHasGroupAwareHospitalAccess(userId, hospitalId, req);

    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }

    // Store the resolved hospitalId for use by route handlers
    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId; // Alias for clarity
    next();
  } catch (error) {
    logger.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware for admin-only access to hospital
export async function requireHospitalAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req, userId);
    
    if (!hospitalId) {
      return res.status(400).json({ 
        message: "Hospital context required.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin'));

    if (!hospital) {
      return res.status(403).json({
        message: "Admin access required for this operation.",
        code: "ADMIN_ACCESS_REQUIRED"
      });
    }

    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = hospital.role;
    next();
  } catch (error) {
    logger.error("Error checking admin access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Helper to get the active role from request headers, validated against database
async function getActiveRoleFromRequest(req: any, userId: string, hospitalId: string): Promise<string | null> {
  const headerRole = req.headers['x-active-role'] as string | undefined;
  
  // Get the user's actual roles for this hospital from the database
  const hospitals = await storage.getUserHospitals(userId);
  const matchingHospitals = hospitals.filter(h => h.id === hospitalId);
  
  if (matchingHospitals.length === 0) {
    return null;
  }
  
  // Get all roles user has for this hospital
  const availableRoles = matchingHospitals.map(h => h.role).filter(Boolean);
  
  // If header specifies a role, verify user actually has it
  if (headerRole && availableRoles.includes(headerRole)) {
    return headerRole;
  }
  
  // Fall back to highest role if header role is invalid or not provided
  if (availableRoles.includes('admin')) return 'admin';
  if (availableRoles.includes('manager')) return 'manager';
  if (availableRoles.includes('doctor')) return 'doctor';
  if (availableRoles.includes('nurse')) return 'nurse';
  if (availableRoles.includes('staff')) return 'staff';
  if (availableRoles.includes('guest')) return 'guest';
  
  return availableRoles[0] || null;
}

// Middleware to verify user has write access (non-guest role) to the hospital (lenient).
//
// Group-aware: a user with `group_admin` at hospital A in group G can write to
// resources at hospital B (also in G) even without a direct role at B. This
// mirrors `requireHospitalAccess` / `requireResourceAccess` so reads and
// writes are symmetric across a group.
export async function requireWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const hospitalId = await resolveHospitalIdFromRequest(req, userId);

    if (!hospitalId) {
      // If we can't determine hospitalId, check if the active role from header allows writes
      const headerRole = req.headers['x-active-role'] as string | undefined;

      if (headerRole && !canWrite(headerRole)) {
        return res.status(403).json({
          message: "Insufficient permissions. Guest users have read-only access.",
          code: "READ_ONLY_ACCESS"
        });
      }

      // If no header role, fall back to checking if user has write access to any hospital
      if (!headerRole) {
        const hospitals = await storage.getUserHospitals(userId);
        const hasAnyWriteAccess = hospitals.some(h => canWrite(h.role));

        if (!hasAnyWriteAccess) {
          return res.status(403).json({
            message: "Insufficient permissions. Guest users have read-only access.",
            code: "READ_ONLY_ACCESS"
          });
        }
      }

      logger.warn(`[Access Control] Could not resolve hospitalId for write check on ${req.method} ${req.path}`);
      return next();
    }

    // Group-aware access: allow same-hospital, same-group via active header,
    // or group_admin escalation. Symmetric with `requireHospitalAccess`.
    const hasAccess = await userHasGroupAwareHospitalAccess(userId, hospitalId, req);
    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }

    // Resolve the effective role. For a direct role at `hospitalId`, prefer
    // the explicit `X-Active-Role` header (validated by `getActiveRoleFromRequest`).
    // Otherwise bubble up the group-aware role (e.g. group_admin) via
    // `getGroupAwareUserRole`. Either path must end in a write-capable role.
    let role: string | null = null;
    const directHospitals = await storage.getUserHospitals(userId);
    const hasDirectRole = directHospitals.some((h) => h.id === hospitalId);
    if (hasDirectRole) {
      role = await getActiveRoleFromRequest(req, userId, hospitalId);
    } else {
      role = await getGroupAwareUserRole(userId, hospitalId, req);
    }

    if (!canWrite(role)) {
      return res.status(403).json({
        message: "Insufficient permissions. Guest users have read-only access.",
        code: "READ_ONLY_ACCESS"
      });
    }

    // Store the resolved hospitalId and role for use by route handlers
    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = role;
    next();
  } catch (error) {
    logger.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Middleware to verify user has admin role for the hospital.
//
// Admin operations (e.g. shift management) are intentionally hospital-scoped,
// NOT group-scoped. `req.resolvedRole` is populated by `requireWriteAccess`
// via `getGroupAwareUserRole`, which bubbles up the user's BEST role across
// the group — that would silently grant an admin at hospital A the ability
// to perform admin ops at hospital B in the same group. To prevent that, we
// ignore `req.resolvedRole` here and re-check the user's DIRECT role at the
// resolved hospital. Platform admins still bypass.
//
// Must be placed AFTER requireWriteAccess (which sets req.resolvedHospitalId).
export async function requireAdminWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Platform admins bypass the per-hospital check.
    if (await isPlatformAdminCached(userId, req)) {
      return next();
    }

    const hospitalId =
      req.resolvedHospitalId ??
      (await resolveHospitalIdFromRequest(req, userId));
    if (!hospitalId) {
      return res.status(403).json({ message: "Admin access required", code: "ADMIN_REQUIRED" });
    }

    // Direct-role check only: the user must hold `admin` (or the
    // chain-level `group_admin`, which is *also* stored as a direct row at
    // each member hospital) AT this specific hospital. We still do NOT
    // accept group-escalated `admin` roles bubbled up from elsewhere.
    const hospitals = await storage.getUserHospitals(userId);
    const hasDirectAdmin = hospitals.some(
      (h) => h.id === hospitalId && (h.role === 'admin' || h.role === 'group_admin'),
    );
    if (!hasDirectAdmin) {
      return res.status(403).json({ message: "Admin access required", code: "ADMIN_REQUIRED" });
    }

    next();
  } catch (error) {
    logger.error("Error checking admin write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware for write access - fails if hospitalId cannot be resolved.
//
// Group-aware (mirrors `requireStrictHospitalAccess`): a user without a
// direct role at `hospitalId` can still write if they have `group_admin` in
// the resource's group, or same-group implicit access via their active
// hospital header.
export async function requireStrictWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const hospitalId = await resolveHospitalIdFromRequest(req, userId);

    if (!hospitalId) {
      logger.error(`[Access Control] STRICT: Missing hospitalId for write on ${req.method} ${req.path}`);
      return res.status(400).json({
        message: "Hospital context required. Please select a hospital.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }

    // Group-aware access check (symmetric with `requireStrictHospitalAccess`).
    const hasAccess = await userHasGroupAwareHospitalAccess(userId, hospitalId, req);
    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }

    // Resolve the effective role. Direct role at `hospitalId` → honor the
    // `X-Active-Role` header (if valid). Otherwise use the group-aware role
    // (e.g. group_admin) so cross-location writes succeed with the right
    // rank. Either path must be write-capable.
    let role: string | null = null;
    const directHospitals = await storage.getUserHospitals(userId);
    const hasDirectRole = directHospitals.some((h) => h.id === hospitalId);
    if (hasDirectRole) {
      role = await getActiveRoleFromRequest(req, userId, hospitalId);
    } else {
      role = await getGroupAwareUserRole(userId, hospitalId, req);
    }

    if (!canWrite(role)) {
      return res.status(403).json({
        message: "Insufficient permissions. Guest users have read-only access.",
        code: "READ_ONLY_ACCESS"
      });
    }

    // Store the resolved hospitalId and role for use by route handlers
    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = role;
    next();
  } catch (error) {
    logger.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Middleware to restrict surgery planning to admin/doctor roles in OR/anesthesia units
export async function requireSurgeryPlanAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const hospitalId = await resolveHospitalIdFromRequest(req, userId);

    if (!hospitalId) {
      return res.status(400).json({
        message: "Hospital context required.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }

    // Check unit type from active unit header
    const unitId = req.headers['x-active-unit-id'] as string | undefined;
    let unitType: string | null = null;
    if (unitId) {
      const unit = await storage.getUnit(unitId);
      unitType = unit?.type || null;
    }

    // Get the user's active role
    const role = await getActiveRoleFromRequest(req, userId, hospitalId);

    const allowedRoles = ['admin', 'doctor'];
    const allowedUnitTypes = ['or', 'anesthesia'];

    if (!role || !allowedRoles.includes(role) || !unitType || !allowedUnitTypes.includes(unitType)) {
      return res.status(403).json({
        message: "Surgery planning requires admin or doctor role in an OR or anesthesia unit.",
        code: "SURGERY_PLAN_ACCESS_DENIED"
      });
    }

    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = role;
    next();
  } catch (error) {
    logger.error("Error checking surgery plan access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Helper to verify a record belongs to the expected hospital (for use in route handlers)
export async function verifyRecordBelongsToHospital(
  recordHospitalId: string | null | undefined,
  expectedHospitalId: string,
  recordType: string = 'Record'
): Promise<{ valid: boolean; error?: string }> {
  if (!recordHospitalId) {
    return { valid: false, error: `${recordType} not found` };
  }
  if (recordHospitalId !== expectedHospitalId) {
    logger.error(`[Access Control] Hospital mismatch: ${recordType} belongs to ${recordHospitalId}, user accessing ${expectedHospitalId}`);
    return { valid: false, error: `Access denied to this ${recordType.toLowerCase()}` };
  }
  return { valid: true };
}

export type PermissionFlag = 'canConfigure' | 'canChat' | 'canPlanOps' | 'canManageControlled';

// Check if user has a specific permission for a hospital
// Admin role implicitly has all permissions
export async function userHasPermission(
  userId: string,
  hospitalId: string,
  permission: PermissionFlag
): Promise<boolean> {
  const hospitals = await storage.getUserHospitals(userId);
  return hospitals.some(
    h =>
      h.id === hospitalId &&
      (h.role === 'admin' || h.role === 'group_admin' || h[permission] === true)
  );
}

// Middleware factory: requirePermission('canConfigure')
export function requirePermission(permission: PermissionFlag) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const hospitalId = await resolveHospitalIdFromRequest(req, userId);
      if (!hospitalId) {
        return res.status(400).json({
          message: "Hospital context required.",
          code: "HOSPITAL_ID_REQUIRED"
        });
      }

      const hasAccess = await userHasPermission(userId, hospitalId, permission);
      if (!hasAccess) {
        return res.status(403).json({
          message: "Insufficient permissions for this action.",
          code: "PERMISSION_DENIED"
        });
      }

      req.resolvedHospitalId = hospitalId;
      req.verifiedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking permission ${permission}:`, error);
      res.status(500).json({ message: "Error checking permissions" });
    }
  };
}

/**
 * Platform-admin gate. Cross-tenant: does NOT require X-Active-Hospital-Id.
 * Reads users.is_platform_admin for the authenticated user and allows through
 * only when the flag is true. Used by /api/admin/groups/* and any other
 * platform-wide operations the platform operator owns.
 */
export async function requirePlatformAdmin(
  req: any,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const [u] = await db
      .select({ isPlatformAdmin: users.isPlatformAdmin })
      .from(users)
      .where(eq(users.id, userId));
    if (!u?.isPlatformAdmin) {
      return res.status(403).json({
        message: "Platform admin access required",
        code: "PLATFORM_ADMIN_REQUIRED",
      });
    }
    // Cache the result for downstream group-aware checks in the same request
    // (see `isPlatformAdminCached`). Saves a redundant DB hit on every call.
    req._isPlatformAdmin = true;
    return next();
  } catch (error) {
    logger.error("Error checking platform admin access:", error);
    return res
      .status(500)
      .json({ message: "Error checking platform admin access" });
  }
}

/**
 * Group-admin gate. Used by `/api/business/group/*` (Task 13).
 *
 * Allows through when ONE of the following holds:
 *  - The caller is a platform admin (implicit group admin everywhere).
 *  - The caller has `role = "group_admin"` at any hospital that shares a group
 *    with the currently-active hospital (`X-Active-Hospital-Id`).
 *
 * 401 on no user, 400 when the active hospital is not part of any group
 * (mirrors `adminGroups` "no group" semantics — group admins can only
 * operate within a group), 403 when the caller is not privileged.
 *
 * On success sets `req.verifiedHospitalId` to the active hospital and
 * `req._groupId` to the resolved group id so handlers can skip the lookup.
 */
export async function requireGroupAdmin(
  req: any,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const activeHospitalId = getActiveHospitalIdFromRequest(req);
    if (!activeHospitalId) {
      return res.status(400).json({
        message: "Active hospital required (X-Active-Hospital-Id header).",
        code: "ACTIVE_HOSPITAL_REQUIRED",
      });
    }

    // Platform admins are implicit group admins for every group.
    if (await isPlatformAdminCached(userId, req)) {
      const groupId = await getHospitalGroupIdCached(activeHospitalId, req);
      if (!groupId) {
        return res.status(400).json({
          message: "Active hospital is not in a group.",
          code: "NO_GROUP",
        });
      }
      req.verifiedHospitalId = activeHospitalId;
      req._groupId = groupId;
      return next();
    }

    // Verify the caller actually has a role at the active hospital — otherwise
    // a forged header could be used to probe other groups.
    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === activeHospitalId)) {
      return res.status(403).json({
        message: "No access to active hospital.",
        code: "HOSPITAL_ACCESS_DENIED",
      });
    }

    const groupId = await getHospitalGroupIdCached(activeHospitalId, req);
    if (!groupId) {
      return res.status(400).json({
        message: "Active hospital is not in a group.",
        code: "NO_GROUP",
      });
    }

    const isGroupAdmin = await userIsGroupAdminForHospital(
      userId,
      activeHospitalId,
      req,
    );
    if (!isGroupAdmin) {
      return res.status(403).json({
        message: "Group admin access required.",
        code: "GROUP_ADMIN_REQUIRED",
      });
    }

    req.verifiedHospitalId = activeHospitalId;
    req._groupId = groupId;
    return next();
  } catch (error) {
    logger.error("Error checking group admin access:", error);
    return res
      .status(500)
      .json({ message: "Error checking group admin access" });
  }
}
