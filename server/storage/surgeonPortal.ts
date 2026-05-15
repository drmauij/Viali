import { db } from "../db";
import { eq, and, sql, gte, lt, isNotNull, inArray } from "drizzle-orm";
import {
  surgeries,
  surgeryRooms,
  patients,
  users,
  hospitals,
  externalSurgeryRequests,
  portalAccessSessions,
  surgeonActionRequests,
  userHospitalRoles,
  type SurgeonActionRequest,
} from "@shared/schema";

type InsertSurgeonActionRequest = typeof surgeonActionRequests.$inferInsert;

// ========== SURGERY QUERIES ==========

/**
 * Get all surgeries for a surgeon at a hospital.
 * Aggregates from two sources:
 * 1. Surgeries linked via externalSurgeryRequests (by surgeon email)
 * 2. Surgeries where the main surgeon's user email matches
 * Deduplicates by surgery ID.
 */
export async function getSurgeriesForSurgeon(
  hospitalId: string,
  surgeonEmail: string,
  month?: string, // YYYY-MM format
) {
  const callerEmailLower = surgeonEmail.toLowerCase();

  // Resolve caller user record (for is_praxis lookup)
  const [caller] = await db
    .select({ id: users.id, email: users.email, isPraxis: users.isPraxis })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${callerEmailLower}`)
    .limit(1);

  // Build the set of (id, email) tuples to match against
  const matchUserIds: string[] = [];
  const matchEmailsLower: string[] = [callerEmailLower];

  if (caller) {
    matchUserIds.push(caller.id);
    if (caller.isPraxis) {
      const children = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.parentSurgeonId, caller.id));
      for (const child of children) {
        matchUserIds.push(child.id);
        if (child.email) matchEmailsLower.push(child.email.toLowerCase());
      }
    }
  }

  // Build date range filter if month is provided
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (month) {
    const [year, monthNum] = month.split("-").map(Number);
    dateFrom = new Date(year, monthNum - 1, 1);
    // First day of the next month
    dateTo = new Date(year, monthNum, 1);
  }

  // Source 1: surgeries linked from external_surgery_requests by email OR by surgeon_id
  const externalRows = await db
    .select({ surgeryId: externalSurgeryRequests.surgeryId })
    .from(externalSurgeryRequests)
    .where(
      and(
        eq(externalSurgeryRequests.hospitalId, hospitalId),
        eq(externalSurgeryRequests.status, "scheduled"),
        isNotNull(externalSurgeryRequests.surgeryId),
        sql`(LOWER(${externalSurgeryRequests.surgeonEmail}) IN (${sql.join(
          matchEmailsLower.map((e) => sql`${e}`),
          sql`, `,
        )}) OR ${externalSurgeryRequests.surgeonId} IN (${sql.join(
          matchUserIds.length > 0 ? matchUserIds.map((id) => sql`${id}`) : [sql`NULL`],
          sql`, `,
        )}))`,
      ),
    );

  const linkedSurgeryIds = externalRows
    .map((r) => r.surgeryId)
    .filter((id): id is string => id !== null);

  // Source 2: surgeries.surgeonId points to any matched user OR matched email
  const userSurgeries = await db
    .select({ surgeryId: surgeries.id })
    .from(surgeries)
    .innerJoin(users, eq(surgeries.surgeonId, users.id))
    .where(
      and(
        eq(surgeries.hospitalId, hospitalId),
        sql`(${users.id} IN (${sql.join(
          matchUserIds.length > 0 ? matchUserIds.map((id) => sql`${id}`) : [sql`NULL`],
          sql`, `,
        )}) OR LOWER(${users.email}) IN (${sql.join(
          matchEmailsLower.map((e) => sql`${e}`),
          sql`, `,
        )}))`,
      ),
    );

  const userSurgeryIds = userSurgeries.map((r) => r.surgeryId);

  // Combine and deduplicate
  const allSurgeryIds = [...new Set([...linkedSurgeryIds, ...userSurgeryIds])];

  if (allSurgeryIds.length === 0) {
    return [];
  }

  // Fetch full surgery details for all matched IDs
  const conditions = [
    sql`${surgeries.id} IN (${sql.join(
      allSurgeryIds.map((id) => sql`${id}`),
      sql`, `,
    )})`,
    eq(surgeries.isArchived, false),
    sql`${surgeries.status} != 'cancelled'`,
  ];

  if (dateFrom && dateTo) {
    conditions.push(gte(surgeries.plannedDate, dateFrom));
    conditions.push(lt(surgeries.plannedDate, dateTo));
  }

  const results = await db
    .select({
      id: surgeries.id,
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      chopCode: surgeries.chopCode,
      status: surgeries.status,
      isSuspended: surgeries.isSuspended,
      isArchived: surgeries.isArchived,
      patientPosition: surgeries.patientPosition,
      surgeon: surgeries.surgeon,
      roomName: surgeryRooms.name,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      actualEndTime: surgeries.actualEndTime,
    })
    .from(surgeries)
    .leftJoin(surgeryRooms, eq(surgeries.surgeryRoomId, surgeryRooms.id))
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .where(and(...conditions));

  return results;
}

// ========== ACTION REQUESTS ==========

/**
 * Create a new surgeon action request.
 */
export async function createSurgeonActionRequest(
  data: InsertSurgeonActionRequest,
): Promise<SurgeonActionRequest> {
  const [created] = await db
    .insert(surgeonActionRequests)
    .values(data)
    .returning();

  return created;
}

/**
 * Fetch action requests for a hospital with surgery details.
 * Optionally filter by status.
 */
export async function getSurgeonActionRequests(
  hospitalId: string,
  status?: "pending" | "accepted" | "refused",
) {
  const conditions = [eq(surgeonActionRequests.hospitalId, hospitalId)];

  if (status) {
    conditions.push(eq(surgeonActionRequests.status, status));
  }

  const results = await db
    .select({
      // Action request fields
      id: surgeonActionRequests.id,
      hospitalId: surgeonActionRequests.hospitalId,
      surgeryId: surgeonActionRequests.surgeryId,
      surgeonEmail: surgeonActionRequests.surgeonEmail,
      type: surgeonActionRequests.type,
      reason: surgeonActionRequests.reason,
      proposedDate: surgeonActionRequests.proposedDate,
      proposedTimeFrom: surgeonActionRequests.proposedTimeFrom,
      proposedTimeTo: surgeonActionRequests.proposedTimeTo,
      status: surgeonActionRequests.status,
      responseNote: surgeonActionRequests.responseNote,
      respondedBy: surgeonActionRequests.respondedBy,
      respondedAt: surgeonActionRequests.respondedAt,
      confirmationEmailSent: surgeonActionRequests.confirmationEmailSent,
      confirmationSmsSent: surgeonActionRequests.confirmationSmsSent,
      createdAt: surgeonActionRequests.createdAt,
      updatedAt: surgeonActionRequests.updatedAt,
      // Surgery details
      plannedDate: surgeries.plannedDate,
      plannedSurgery: surgeries.plannedSurgery,
      surgeonName: surgeries.surgeon,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      roomName: surgeryRooms.name,
    })
    .from(surgeonActionRequests)
    .innerJoin(surgeries, eq(surgeonActionRequests.surgeryId, surgeries.id))
    .leftJoin(patients, eq(surgeries.patientId, patients.id))
    .leftJoin(surgeryRooms, eq(surgeries.surgeryRoomId, surgeryRooms.id))
    .where(and(...conditions))
    .orderBy(sql`${surgeonActionRequests.createdAt} DESC`);

  return results;
}

/**
 * Fetch a single action request by ID.
 */
export async function getSurgeonActionRequest(
  id: string,
): Promise<SurgeonActionRequest | null> {
  const [request] = await db
    .select()
    .from(surgeonActionRequests)
    .where(eq(surgeonActionRequests.id, id))
    .limit(1);

  return request || null;
}

/**
 * Update an action request and return the updated row.
 * Always sets updatedAt to now.
 */
export async function updateSurgeonActionRequest(
  id: string,
  updates: Partial<InsertSurgeonActionRequest>,
): Promise<SurgeonActionRequest> {
  const [updated] = await db
    .update(surgeonActionRequests)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(surgeonActionRequests.id, id))
    .returning();

  return updated;
}

/**
 * Count pending action requests for a hospital.
 */
export async function getPendingSurgeonActionRequestsCount(
  hospitalId: string,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(surgeonActionRequests)
    .where(
      and(
        eq(surgeonActionRequests.hospitalId, hospitalId),
        eq(surgeonActionRequests.status, "pending"),
      ),
    );

  return result?.count ?? 0;
}

/**
 * Get pending action requests for a specific surgery by a specific surgeon email.
 */
export async function getActionRequestsForSurgery(
  surgeryId: string,
  surgeonEmail: string,
): Promise<SurgeonActionRequest[]> {
  const email = surgeonEmail.toLowerCase();

  const results = await db
    .select()
    .from(surgeonActionRequests)
    .where(
      and(
        eq(surgeonActionRequests.surgeryId, surgeryId),
        sql`LOWER(${surgeonActionRequests.surgeonEmail}) = ${email}`,
        eq(surgeonActionRequests.status, "pending"),
      ),
    );

  return results;
}

/**
 * Get pending action requests for multiple surgeries by a specific surgeon email.
 * Returns a map of surgeryId -> action requests.
 */
export async function getActionRequestsForSurgeries(
  surgeryIds: string[],
  surgeonEmail: string,
): Promise<Record<string, SurgeonActionRequest[]>> {
  if (surgeryIds.length === 0) return {};

  const email = surgeonEmail.toLowerCase();

  const results = await db
    .select()
    .from(surgeonActionRequests)
    .where(
      and(
        sql`${surgeonActionRequests.surgeryId} IN (${sql.join(
          surgeryIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        sql`LOWER(${surgeonActionRequests.surgeonEmail}) = ${email}`,
        eq(surgeonActionRequests.status, "pending"),
      ),
    );

  const grouped: Record<string, SurgeonActionRequest[]> = {};
  for (const r of results) {
    if (!grouped[r.surgeryId]) grouped[r.surgeryId] = [];
    grouped[r.surgeryId].push(r);
  }
  return grouped;
}

// ========== PORTAL SESSION ==========

/**
 * Find a portal session and return validity + surgeon email.
 * Checks expiration.
 */
export async function findPortalSessionWithEmail(
  sessionToken: string,
  portalType: "patient" | "worklog" | "surgeon",
  portalToken: string,
): Promise<{ valid: boolean; surgeonEmail: string | null }> {
  const [session] = await db
    .select()
    .from(portalAccessSessions)
    .where(
      and(
        eq(portalAccessSessions.sessionToken, sessionToken),
        eq(portalAccessSessions.portalType, portalType),
        eq(portalAccessSessions.portalToken, portalToken),
      ),
    )
    .limit(1);

  if (!session) {
    return { valid: false, surgeonEmail: null };
  }

  if (new Date(session.expiresAt) < new Date()) {
    return { valid: false, surgeonEmail: null };
  }

  return { valid: true, surgeonEmail: session.surgeonEmail };
}

// ========== HOSPITAL LOOKUP ==========

/**
 * Find a hospital by its externalSurgeryToken.
 * Returns id, name, defaultLanguage.
 */
export async function getHospitalByExternalSurgeryToken(
  token: string,
): Promise<{ id: string; name: string; defaultLanguage: string | null; externalSurgeryNotificationEmail: string | null } | null> {
  const [hospital] = await db
    .select({
      id: hospitals.id,
      name: hospitals.name,
      defaultLanguage: hospitals.defaultLanguage,
      externalSurgeryNotificationEmail: hospitals.externalSurgeryNotificationEmail,
    })
    .from(hospitals)
    .where(eq(hospitals.externalSurgeryToken, token))
    .limit(1);

  return hospital || null;
}

// ========== PRAXIS HELPERS ==========

/**
 * Return users where parent_surgeon_id = praxisUserId.
 * If hospitalId is provided, restricts to children that have at least one
 * userHospitalRoles row at that hospital — the "hospital slice" of the praxis.
 *
 * is_praxis and parent_surgeon_id live on users globally, but the admin UI
 * operates per-clinic; pass hospitalId so a Kreuzlingen admin only sees
 * Kreuzlingen-side children, never Weinberg-side ones.
 */
export async function getChildrenOfPraxis(
  praxisUserId: string,
  hospitalId?: string,
) {
  if (!hospitalId) {
    return await db
      .select()
      .from(users)
      .where(eq(users.parentSurgeonId, praxisUserId));
  }
  const rows = await db
    .selectDistinct({ user: users })
    .from(users)
    .innerJoin(userHospitalRoles, eq(userHospitalRoles.userId, users.id))
    .where(
      and(
        eq(users.parentSurgeonId, praxisUserId),
        eq(userHospitalRoles.hospitalId, hospitalId),
      ),
    );
  return rows.map((r) => r.user);
}

/**
 * Replace the set of children for a praxis WITHIN ONE HOSPITAL'S SLICE.
 * Children at other hospitals are not touched, even when they are not in
 * childUserIds — each clinic admin manages only their own slice.
 *
 * Within the hospital slice:
 *   - children newly in childUserIds get parent_surgeon_id = praxisUserId
 *   - children previously linked at this hospital but not in childUserIds get
 *     parent_surgeon_id = null (only if they have no roles at any other hospital
 *     where the praxis still owns them — see below)
 *
 * Because parent_surgeon_id is one column per user, "unlinking at one hospital
 * only" cannot truly preserve linkage at another hospital for the SAME user.
 * Practically, a doctor user typically belongs to one clinic; if a child is
 * shared across clinics, unlinking it here unlinks it everywhere. That edge
 * case is intentionally accepted as the trade-off of a per-user parent column.
 *
 * Throws if:
 *   - any candidate child has is_praxis=true (one-level only),
 *   - the praxis is included in its own children (self-loop),
 *   - the praxis target is not flagged is_praxis=true,
 *   - any candidate child does not belong to hospitalId,
 *   - any candidate child currently has a different parent (linked to another praxis).
 */
export async function setPraxisChildren(
  praxisUserId: string,
  childUserIds: string[],
  hospitalId: string,
) {
  if (childUserIds.includes(praxisUserId)) {
    throw new Error(
      `Praxis ${praxisUserId} cannot be a child of itself`,
    );
  }

  const [praxisRow] = await db
    .select({ id: users.id, isPraxis: users.isPraxis })
    .from(users)
    .where(eq(users.id, praxisUserId))
    .limit(1);
  if (!praxisRow) {
    throw new Error(`Praxis ${praxisUserId} not found`);
  }
  if (!praxisRow.isPraxis) {
    throw new Error(
      `User ${praxisUserId} is not flagged as a praxis — toggle is_praxis first`,
    );
  }

  if (childUserIds.length > 0) {
    const candidates = await db
      .select({ id: users.id, isPraxis: users.isPraxis, parentSurgeonId: users.parentSurgeonId })
      .from(users)
      .where(inArray(users.id, childUserIds));

    const praxisChildren = candidates.filter((c) => c.isPraxis);
    if (praxisChildren.length > 0) {
      throw new Error(
        `User(s) ${praxisChildren.map((c) => c.id).join(", ")} cannot be a child — already a praxis`,
      );
    }

    const otherParented = candidates.filter(
      (c) => c.parentSurgeonId && c.parentSurgeonId !== praxisUserId,
    );
    if (otherParented.length > 0) {
      throw new Error(
        `User(s) ${otherParented.map((c) => c.id).join(", ")} are already linked to a different praxis`,
      );
    }

    const candidateHospitals = await db
      .select({ userId: userHospitalRoles.userId })
      .from(userHospitalRoles)
      .where(
        and(
          inArray(userHospitalRoles.userId, childUserIds),
          eq(userHospitalRoles.hospitalId, hospitalId),
        ),
      );
    const validIds = new Set(candidateHospitals.map((r) => r.userId));
    const invalid = childUserIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new Error(
        `User(s) ${invalid.join(", ")} do not belong to this hospital`,
      );
    }
  }

  // Compute the hospital-scoped diff so other clinics' linkages survive.
  const currentAtHospital = await getChildrenOfPraxis(praxisUserId, hospitalId);
  const currentIds = new Set(currentAtHospital.map((c) => c.id));
  const desiredIds = new Set(childUserIds);
  const toUnlink = currentAtHospital
    .map((c) => c.id)
    .filter((id) => !desiredIds.has(id));
  const toLink = childUserIds.filter((id) => !currentIds.has(id));

  await db.transaction(async (tx) => {
    if (toUnlink.length > 0) {
      await tx
        .update(users)
        .set({ parentSurgeonId: null })
        .where(
          and(
            inArray(users.id, toUnlink),
            eq(users.parentSurgeonId, praxisUserId),
          ),
        );
    }
    if (toLink.length > 0) {
      await tx
        .update(users)
        .set({ parentSurgeonId: praxisUserId })
        .where(inArray(users.id, toLink));
    }
  });
}

/**
 * Toggle is_praxis on a user. When turning OFF:
 *   - If hospitalId is provided, only blocks if children remain AT THAT
 *     hospital. Children at other clinics keep their parent_surgeon_id
 *     pointing at this user (now non-praxis); each other clinic's admin can
 *     re-toggle is_praxis on if they still need praxis roll-up there.
 *   - If hospitalId is omitted, falls back to the global check (any child
 *     anywhere blocks).
 */
export async function togglePraxis(
  userId: string,
  isPraxis: boolean,
  hospitalId?: string,
) {
  if (!isPraxis) {
    const children = await getChildrenOfPraxis(userId, hospitalId);
    if (children.length > 0) {
      const where = hospitalId ? " at this hospital" : "";
      throw new Error(
        `User ${userId} still has linked children${where} — unlink them before disabling praxis`,
      );
    }
  }

  await db
    .update(users)
    .set({ isPraxis })
    .where(eq(users.id, userId));
}

/**
 * Surgeon-portal eligibility gate. Used by the OTP request/verify handlers
 * to silently drop login attempts from emails that aren't onboarded as
 * surgeons at the requesting clinic.
 *
 * Eligible at clinic `hospitalId` if the user is non-archived AND ANY of:
 *  1. Has a userHospitalRoles row at THIS clinic with role 'doctor' or 'admin'
 *     (covers solo doctors + clinic admins).
 *  2. is_praxis=true AND has any userHospitalRoles row at THIS clinic
 *     (proves the praxis is associated with this clinic, regardless of which
 *     role they hold there).
 *  3. parent_surgeon_id is set (i.e. they're a praxis child) AND the parent
 *     has any userHospitalRoles row at THIS clinic.
 *
 * Email match is case-insensitive (matches the rest of the portal flow).
 */
export async function isUserEligibleForSurgeonPortal(
  email: string,
  hospitalId: string,
): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();

  const [user] = await db
    .select()
    .from(users)
    .where(sql`LOWER(${users.email}) = ${normalizedEmail}`)
    .limit(1);

  if (!user) return false;
  if (user.archivedAt) return false;

  // Path 1 + 2 entry: any of this user's role rows at this clinic.
  const roleRows = await db
    .select({ role: userHospitalRoles.role })
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, user.id),
        eq(userHospitalRoles.hospitalId, hospitalId),
      ),
    );

  // 1: solo doctor or clinic admin at this clinic.
  if (roleRows.some((r) => r.role === "doctor" || r.role === "admin")) {
    return true;
  }
  // 2: praxis with any role at this clinic.
  if (user.isPraxis && roleRows.length > 0) {
    return true;
  }
  // 3: praxis child whose parent has any role at this clinic.
  if (user.parentSurgeonId) {
    const [parentRole] = await db
      .select({ id: userHospitalRoles.id })
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.userId, user.parentSurgeonId),
          eq(userHospitalRoles.hospitalId, hospitalId),
        ),
      )
      .limit(1);
    if (parentRole) return true;
  }

  return false;
}
