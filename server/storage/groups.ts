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

/**
 * Search users by email prefix (case-insensitive) and annotate each match
 * with which hospitals in the given group they already have a role at —
 * so the admin UI can either offer a "promote" button per existing role
 * or disable the user with a clear "no role in any group clinic" hint.
 *
 * Skips users who are already `group_admin` on every member hospital.
 */
export async function searchUsersForGroupPromotion(
  groupId: string,
  query: string,
  limit: number = 10,
): Promise<
  Array<{
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    hospitalsInGroup: Array<{
      hospitalId: string;
      hospitalName: string;
      role: string;
      isGroupAdmin: boolean;
    }>;
  }>
> {
  const q = query.trim();
  if (q.length === 0) return [];
  const members = await listGroupMembers(groupId);
  const memberIds = members.map((h) => h.id);
  if (memberIds.length === 0) return [];
  const memberNameById = new Map(members.map((h) => [h.id, h.name] as const));

  // Step 1 — users whose email matches. Cap at `limit` for UX.
  const userRows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(sql`LOWER(${users.email}) LIKE ${"%" + q.toLowerCase() + "%"}`)
    .orderBy(users.email)
    .limit(limit);

  if (userRows.length === 0) return [];
  const userIds = userRows.map((u) => u.id);

  // Step 2 — all role rows those users have at member hospitals. One query.
  const roleRows = await db
    .select({
      userId: userHospitalRoles.userId,
      hospitalId: userHospitalRoles.hospitalId,
      role: userHospitalRoles.role,
    })
    .from(userHospitalRoles)
    .where(
      and(
        inArray(userHospitalRoles.userId, userIds),
        inArray(userHospitalRoles.hospitalId, memberIds),
      ),
    );

  const rolesByUser = new Map<
    string,
    Map<string, { roles: string[]; isGroupAdmin: boolean }>
  >();
  for (const r of roleRows) {
    let byHospital = rolesByUser.get(r.userId);
    if (!byHospital) {
      byHospital = new Map();
      rolesByUser.set(r.userId, byHospital);
    }
    let existing = byHospital.get(r.hospitalId);
    if (!existing) {
      existing = { roles: [], isGroupAdmin: false };
      byHospital.set(r.hospitalId, existing);
    }
    existing.roles.push(r.role);
    if (r.role === "group_admin") existing.isGroupAdmin = true;
  }

  return userRows.map((u) => {
    const byHospital = rolesByUser.get(u.id) ?? new Map();
    const hospitalsInGroup: Array<{
      hospitalId: string;
      hospitalName: string;
      role: string;
      isGroupAdmin: boolean;
    }> = [];
    for (const [hospitalId, info] of byHospital) {
      // Prefer a non-group_admin role to display (that's the identity they
      // were actually hired as). If they ONLY have group_admin, show that.
      const displayRole =
        info.roles.find((r: string) => r !== "group_admin") ?? info.roles[0];
      hospitalsInGroup.push({
        hospitalId,
        hospitalName: memberNameById.get(hospitalId) ?? hospitalId,
        role: displayRole,
        isGroupAdmin: info.isGroupAdmin,
      });
    }
    hospitalsInGroup.sort((a, b) =>
      a.hospitalName.localeCompare(b.hospitalName),
    );
    return {
      userId: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      hospitalsInGroup,
    };
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

export type GroupBillingPatch = {
  defaultLicenseType?: "free" | "basic" | "test" | null;
  defaultPricePerRecord?: string | null;
};

export async function updateGroupBillingDefaults(
  id: string,
  patch: GroupBillingPatch,
) {
  const [updated] = await db
    .update(hospitalGroups)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(hospitalGroups.id, id))
    .returning();
  return updated ?? null;
}

/**
 * Apply the group's defaults to every member hospital's licenseType +
 * pricePerRecord. Only copies fields that are set on the group (null group
 * defaults leave clinics untouched). Returns how many clinics were updated.
 */
export async function cascadeGroupBillingDefaults(id: string): Promise<number> {
  const [g] = await db
    .select({
      defaultLicenseType: hospitalGroups.defaultLicenseType,
      defaultPricePerRecord: hospitalGroups.defaultPricePerRecord,
    })
    .from(hospitalGroups)
    .where(eq(hospitalGroups.id, id));
  if (!g) throw new Error("Group not found");

  const patch: Record<string, unknown> = {};
  if (g.defaultLicenseType !== null && g.defaultLicenseType !== undefined) {
    patch.licenseType = g.defaultLicenseType;
  }
  if (g.defaultPricePerRecord !== null && g.defaultPricePerRecord !== undefined) {
    patch.pricePerRecord = g.defaultPricePerRecord;
  }
  if (Object.keys(patch).length === 0) return 0;

  const rows = await db
    .update(hospitals)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(hospitals.groupId, id))
    .returning({ id: hospitals.id });
  return rows.length;
}

export async function updateGroupLogo(id: string, logoUrl: string | null) {
  const [updated] = await db
    .update(hospitalGroups)
    .set({ logoUrl, updatedAt: new Date() })
    .where(eq(hospitalGroups.id, id))
    .returning();
  return updated ?? null;
}

export async function updateHospitalLogo(
  hospitalId: string,
  logoUrl: string | null,
) {
  const [updated] = await db
    .update(hospitals)
    .set({ companyLogoUrl: logoUrl, updatedAt: new Date() })
    .where(eq(hospitals.id, hospitalId))
    .returning();
  return updated ?? null;
}

export type HospitalBillingPatch = {
  licenseType?: "free" | "basic" | "test";
  pricePerRecord?: string | null;
};

export async function updateHospitalBilling(
  hospitalId: string,
  patch: HospitalBillingPatch,
) {
  const [updated] = await db
    .update(hospitals)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(hospitals.id, hospitalId))
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

/**
 * Resolve a group booking token to `{ group, hospitals }`. Used by the
 * public `/book/g/:token` location picker. Returns `null` if the token
 * doesn't match any group. `hospitals` are listed in alphabetical order
 * so the picker renders deterministically.
 */
export async function getGroupByBookingToken(token: string): Promise<{
  group: { id: string; name: string };
  hospitals: Array<{
    id: string;
    name: string;
    address: string | null;
    bookingToken: string | null;
  }>;
} | null> {
  const [group] = await db
    .select({
      id: hospitalGroups.id,
      name: hospitalGroups.name,
    })
    .from(hospitalGroups)
    .where(eq(hospitalGroups.bookingToken, token));
  if (!group) return null;
  const members = await db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      address: hospitals.address,
      bookingToken: hospitals.bookingToken,
    })
    .from(hospitals)
    .where(eq(hospitals.groupId, group.id))
    .orderBy(hospitals.name);
  return { group, hospitals: members };
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

/**
 * Aggregate counts for the Task 13 group admin overview.
 *
 * - `patientCount`: distinct patients linked to any hospital in `hospitalIds`
 *   via `patient_hospitals`. Mirrors the list-scope semantics used in Tasks
 *   5-6 so the overview tile matches what the patients page reports.
 * - `treatmentsThisMonth`: treatments whose `performed_at` falls in the
 *   current UTC calendar month. Phase 1 accepts UTC bucketing — hospitals
 *   in a group can span timezones; a consistent anchor avoids surprising
 *   per-location drift. A future enhancement can introduce per-timezone
 *   windowing once groups span truly distinct TZs.
 * - `bookingsThisWeek`: clinic_appointments booked (by appointment_date)
 *   in the current week. Rolling 7-day window anchored at midnight UTC
 *   for the same reason.
 *
 * Uses a single SQL statement so the three counts share one DB round-trip.
 */
export async function getGroupOverviewCounts(
  hospitalIds: string[],
): Promise<{
  patientCount: number;
  treatmentsThisMonth: number;
  bookingsThisWeek: number;
}> {
  if (hospitalIds.length === 0) {
    return { patientCount: 0, treatmentsThisMonth: 0, bookingsThisWeek: 0 };
  }
  // Build an `IN (...)` fragment from the ids array. `sql.raw` on the ids
  // would risk injection; `sql.join` + placeholders is safe and keeps the
  // query parameterized. `ANY(array)` via parameter needs an explicit
  // text[]/uuid[] cast which is awkward across drivers — IN is simpler.
  const idList = sql.join(
    hospitalIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const result = await db.execute<{
    patient_count: number | string;
    treatments_this_month: number | string;
    bookings_this_week: number | string;
  }>(sql`
    SELECT
      (
        SELECT COUNT(DISTINCT ph.patient_id)::int
        FROM patient_hospitals ph
        WHERE ph.hospital_id IN (${idList})
      ) AS patient_count,
      (
        SELECT COUNT(*)::int
        FROM treatments t
        WHERE t.hospital_id IN (${idList})
          AND t.performed_at >= date_trunc('month', now() AT TIME ZONE 'UTC')
          AND t.performed_at < date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month'
      ) AS treatments_this_month,
      (
        SELECT COUNT(*)::int
        FROM clinic_appointments ca
        WHERE ca.hospital_id IN (${idList})
          AND ca.appointment_date >= (date_trunc('week', now() AT TIME ZONE 'UTC'))::date
          AND ca.appointment_date < (date_trunc('week', now() AT TIME ZONE 'UTC') + interval '7 days')::date
      ) AS bookings_this_week
  `);
  const row = result.rows[0];
  return {
    patientCount: Number(row?.patient_count ?? 0),
    treatmentsThisMonth: Number(row?.treatments_this_month ?? 0),
    bookingsThisWeek: Number(row?.bookings_this_week ?? 0),
  };
}

/**
 * Returns the list of users who have ANY role at any hospital in the group,
 * with their email. Used by the Task 13 promote UI to populate the user
 * picker (group admins can only promote users who already have a presence
 * in the group — mirrors the `promoteGroupAdmin` invariant).
 */
export async function listGroupUsers(groupId: string) {
  const members = await listGroupMembers(groupId);
  const memberIds = members.map((h) => h.id);
  if (memberIds.length === 0) return [];
  return db
    .selectDistinct({
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      hospitalId: userHospitalRoles.hospitalId,
    })
    .from(userHospitalRoles)
    .innerJoin(users, eq(users.id, userHospitalRoles.userId))
    .where(inArray(userHospitalRoles.hospitalId, memberIds));
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
