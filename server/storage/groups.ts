import { randomUUID } from "crypto";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  hospitalGroups,
  hospitals,
  users,
  userHospitalRoles,
} from "@shared/schema";

/**
 * Storage layer for the multi-location "hospital groups" feature.
 * Platform admins manage groups; group admins manage members within a group.
 * See docs/superpowers/plans/2026-04-22-multi-location-groups.md (Task 2).
 */

export type GroupSummary = {
  id: string;
  name: string;
  bookingToken: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  memberCount: number;
  patientCount: number;
};

export async function listGroups(): Promise<GroupSummary[]> {
  // Raw SQL to keep the correlated subqueries readable. Drizzle's builder
  // leaked an ambiguous "id" reference in an earlier attempt; raw SQL sidesteps
  // the issue and yields clearer execution plans.
  const result = await db.execute<{
    id: string;
    name: string;
    booking_token: string | null;
    created_at: Date | null;
    updated_at: Date | null;
    member_count: number | string;
    patient_count: number | string;
  }>(sql`
    SELECT
      g.id,
      g.name,
      g.booking_token,
      g.created_at,
      g.updated_at,
      (SELECT COUNT(*)::int FROM hospitals hm WHERE hm.group_id = g.id) AS member_count,
      (
        SELECT COUNT(DISTINCT ph.patient_id)::int
        FROM patient_hospitals ph
        JOIN hospitals hp ON hp.id = ph.hospital_id
        WHERE hp.group_id = g.id
      ) AS patient_count
    FROM hospital_groups g
    ORDER BY g.name
  `);
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    bookingToken: r.booking_token,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    memberCount: Number(r.member_count),
    patientCount: Number(r.patient_count),
  }));
}

export async function getGroup(id: string) {
  const [group] = await db
    .select()
    .from(hospitalGroups)
    .where(eq(hospitalGroups.id, id));
  return group ?? null;
}

export async function createGroup(name: string, initialHospitalIds: string[]) {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(hospitalGroups)
      .values({ name })
      .returning();
    let skippedHospitalIds: string[] = [];
    if (initialHospitalIds.length > 0) {
      // Only assign hospitals that currently have no group. This keeps the
      // operation safe: we won't silently poach a hospital from another group.
      // We capture which IDs were actually updated so the route can surface
      // skipped ones to the platform admin (they shouldn't silently disappear).
      const result = await tx
        .update(hospitals)
        .set({ groupId: group.id, updatedAt: new Date() })
        .where(
          and(
            inArray(hospitals.id, initialHospitalIds),
            sql`${hospitals.groupId} IS NULL`,
          ),
        )
        .returning({ id: hospitals.id });
      const assignedIds = new Set(result.map((r) => r.id));
      skippedHospitalIds = initialHospitalIds.filter(
        (id) => !assignedIds.has(id),
      );
    }
    return { group, skippedHospitalIds };
  });
}

export async function renameGroup(id: string, name: string) {
  const [updated] = await db
    .update(hospitalGroups)
    .set({ name, updatedAt: new Date() })
    .where(eq(hospitalGroups.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Refuse delete if any hospital still has group_id OR any group-owned service
 * exists. Throws a user-readable Error; the route translates to 409.
 *
 * Wrapped in a transaction so the pre-check and delete run under the same
 * snapshot (prevents a race where a concurrent insert sneaks a member in
 * between our count and our delete). FK violations are translated to a
 * clean 409-friendly message in case an unforeseen reference survives.
 */
export async function deleteGroup(id: string) {
  await db.transaction(async (tx) => {
    const result = await tx.execute<{
      member_count: number | string;
      service_count: number | string;
    }>(sql`
      SELECT
        (SELECT COUNT(*) FROM hospitals WHERE group_id = ${id}) AS member_count,
        (SELECT COUNT(*) FROM clinic_services WHERE group_id = ${id}) AS service_count
    `);
    const row = result.rows[0];
    const memberCount = Number(row?.member_count ?? 0);
    const serviceCount = Number(row?.service_count ?? 0);
    if (memberCount > 0) {
      throw new Error("Group has member hospitals; remove them first");
    }
    if (serviceCount > 0) {
      throw new Error("Group has services; delete them first");
    }

    try {
      await tx.delete(hospitalGroups).where(eq(hospitalGroups.id, id));
    } catch (e: any) {
      if (e?.code === "23503") {
        throw new Error(
          "Group is still referenced by other rows; remove them first",
        );
      }
      throw e;
    }
  });
}

export async function listGroupMembers(groupId: string) {
  return db.select().from(hospitals).where(eq(hospitals.groupId, groupId));
}

export async function addHospitalToGroup(
  groupId: string,
  hospitalId: string,
) {
  // Atomic: only updates if still unassigned OR already at this group
  // (idempotent). Closes a TOCTOU race where two concurrent platform admins
  // both see groupId IS NULL and both succeed.
  const result = await db
    .update(hospitals)
    .set({ groupId, updatedAt: new Date() })
    .where(
      and(
        eq(hospitals.id, hospitalId),
        or(isNull(hospitals.groupId), eq(hospitals.groupId, groupId)),
      ),
    )
    .returning({ id: hospitals.id });
  if (result.length === 0) {
    // Either the hospital doesn't exist, or it's assigned to a different
    // group. Distinguish the two so the caller can produce a useful error.
    const [h] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId));
    if (!h) throw new Error("Hospital not found");
    throw new Error("Hospital already in another group");
  }
}

/**
 * Returns info about whether removing this hospital would orphan any
 * patients whose "home" is still this hospital. Lets the route surface a
 * warning without preventing the operation — Phase 1 accepts the degraded
 * state and the platform admin knows what they're doing.
 */
export async function countHomePatientsForHospital(
  hospitalId: string,
): Promise<number> {
  const result = await db.execute<{ cnt: number | string }>(sql`
    SELECT COUNT(*)::int AS cnt
    FROM patients
    WHERE hospital_id = ${hospitalId}
      AND is_archived = false
      AND deleted_at IS NULL
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

/**
 * Removes a hospital from a specific group. Returns true if a row was
 * updated, false if the hospital either doesn't exist or belongs to a
 * different group (so callers can 404 instead of silently orphaning it).
 */
export async function removeHospitalFromGroup(
  groupId: string,
  hospitalId: string,
): Promise<boolean> {
  const result = await db
    .update(hospitals)
    .set({ groupId: null, updatedAt: new Date() })
    .where(
      and(eq(hospitals.id, hospitalId), eq(hospitals.groupId, groupId)),
    )
    .returning({ id: hospitals.id });
  return result.length > 0;
}

export async function listGroupAdmins(groupId: string) {
  const members = await listGroupMembers(groupId);
  const memberIds = members.map((h) => h.id);
  if (memberIds.length === 0) return [];
  return db
    .select({
      userId: userHospitalRoles.userId,
      hospitalId: userHospitalRoles.hospitalId,
      roleId: userHospitalRoles.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(userHospitalRoles)
    .innerJoin(users, eq(users.id, userHospitalRoles.userId))
    .where(
      and(
        inArray(userHospitalRoles.hospitalId, memberIds),
        eq(userHospitalRoles.role, "group_admin"),
      ),
    );
}

/**
 * Non-destructive: insert a NEW user_hospital_roles row with role "group_admin"
 * at the target hospital. Keeps the user's existing doctor/nurse/admin rows
 * intact. Fails if the user has no existing role at the hospital — the
 * invariant the spec asks for (prevents accidental cross-group promotion leaks).
 *
 * TODO(task-13): this will be re-exposed under /api/business/group/admins so
 * group admins (not just platform admins) can self-manage their team.
 */
export async function promoteGroupAdmin(
  groupId: string,
  userId: string,
  hospitalId: string,
) {
  const [h] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));
  if (!h || h.groupId !== groupId) {
    throw new Error("Hospital not in group");
  }
  const existing = await db
    .select()
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
      ),
    );
  if (existing.length === 0) {
    throw new Error("User has no role at this hospital; cannot promote");
  }
  // Already a group_admin at this hospital? Make the call idempotent.
  if (existing.some((r) => r.role === "group_admin")) {
    return;
  }
  // Borrow a unitId from one of the user's existing rows at this hospital —
  // user_hospital_roles.unit_id is NOT NULL.
  const unitId = existing[0].unitId;
  await db.insert(userHospitalRoles).values({
    userId,
    hospitalId,
    unitId,
    role: "group_admin",
  });
}

// TODO(task-13): re-expose under /api/business/group/admins for group admins.
export async function revokeGroupAdmin(userId: string, hospitalId: string) {
  await db
    .delete(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.role, "group_admin"),
      ),
    );
}

export async function regenerateGroupBookingToken(id: string): Promise<string> {
  // 24-char hex token (base-16, 96 bits of entropy). Collision-resistant and
  // URL-safe without escaping.
  const token = randomUUID().replace(/-/g, "").slice(0, 24);
  await db
    .update(hospitalGroups)
    .set({ bookingToken: token, updatedAt: new Date() })
    .where(eq(hospitalGroups.id, id));
  return token;
}

export async function listAllHospitalsWithGroup() {
  return db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      groupId: hospitals.groupId,
    })
    .from(hospitals)
    .orderBy(hospitals.name);
}
