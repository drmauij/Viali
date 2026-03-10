import { db } from "../db";
import { eq, and, sql, gte, lt, isNotNull } from "drizzle-orm";
import {
  surgeries,
  surgeryRooms,
  patients,
  users,
  hospitals,
  externalSurgeryRequests,
  portalAccessSessions,
  surgeonActionRequests,
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
  const email = surgeonEmail.toLowerCase();

  // Build date range filter if month is provided
  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (month) {
    const [year, monthNum] = month.split("-").map(Number);
    dateFrom = new Date(year, monthNum - 1, 1);
    // First day of the next month
    dateTo = new Date(year, monthNum, 1);
  }

  // Source 1: Surgeries linked from externalSurgeryRequests
  const externalConditions = [
    eq(externalSurgeryRequests.hospitalId, hospitalId),
    sql`LOWER(${externalSurgeryRequests.surgeonEmail}) = ${email}`,
    eq(externalSurgeryRequests.status, "scheduled"),
    isNotNull(externalSurgeryRequests.surgeryId),
  ];

  const externalSurgeryIds = await db
    .select({ surgeryId: externalSurgeryRequests.surgeryId })
    .from(externalSurgeryRequests)
    .where(and(...externalConditions));

  const linkedSurgeryIds = externalSurgeryIds
    .map((r) => r.surgeryId)
    .filter((id): id is string => id !== null);

  // Source 2: Surgeries where surgeonId user's email matches
  const surgeonUserConditions = [
    eq(surgeries.hospitalId, hospitalId),
    sql`LOWER(${users.email}) = ${email}`,
  ];

  const surgeonUserSurgeryIds = await db
    .select({ surgeryId: surgeries.id })
    .from(surgeries)
    .innerJoin(users, eq(surgeries.surgeonId, users.id))
    .where(and(...surgeonUserConditions));

  const userSurgeryIds = surgeonUserSurgeryIds.map((r) => r.surgeryId);

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
