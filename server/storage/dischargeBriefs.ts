import { db } from "../db";
import { eq, and, desc, or, isNull, inArray } from "drizzle-orm";
import {
  dischargeBriefs,
  dischargeBriefTemplates,
  auditTrail,
  users,
  userHospitalRoles,
  type DischargeBrief,
  type InsertDischargeBrief,
  type DischargeBriefTemplate,
  type InsertDischargeBriefTemplate,
  type AuditTrail,
  type User,
} from "../../shared/schema";

// ========== DISCHARGE BRIEFS ==========

export async function getDischargeBriefsForPatient(
  patientId: string,
): Promise<(DischargeBrief & { creator: User; signer: User | null })[]> {
  const briefs = await db
    .select()
    .from(dischargeBriefs)
    .where(eq(dischargeBriefs.patientId, patientId))
    .orderBy(desc(dischargeBriefs.createdAt));

  const results = [];
  for (const brief of briefs) {
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.id, brief.createdBy));
    let signer: User | null = null;
    if (brief.signedBy) {
      const [s] = await db
        .select()
        .from(users)
        .where(eq(users.id, brief.signedBy));
      signer = s || null;
    }
    results.push({ ...brief, creator, signer });
  }
  return results;
}

export async function getDischargeBriefById(
  id: string,
): Promise<(DischargeBrief & { creator: User; signer: User | null }) | undefined> {
  const [brief] = await db
    .select()
    .from(dischargeBriefs)
    .where(eq(dischargeBriefs.id, id));
  if (!brief) return undefined;

  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, brief.createdBy));
  let signer: User | null = null;
  if (brief.signedBy) {
    const [s] = await db
      .select()
      .from(users)
      .where(eq(users.id, brief.signedBy));
    signer = s || null;
  }
  return { ...brief, creator, signer };
}

export async function createDischargeBrief(
  data: InsertDischargeBrief,
): Promise<DischargeBrief> {
  const [brief] = await db
    .insert(dischargeBriefs)
    .values(data)
    .returning();
  return brief;
}

export async function updateDischargeBrief(
  id: string,
  data: Partial<InsertDischargeBrief>,
): Promise<DischargeBrief> {
  const [brief] = await db
    .update(dischargeBriefs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(dischargeBriefs.id, id))
    .returning();
  return brief;
}

export async function deleteDischargeBrief(id: string): Promise<void> {
  await db.delete(dischargeBriefs).where(eq(dischargeBriefs.id, id));
}

export async function lockDischargeBrief(
  id: string,
  userId: string,
  signature: string,
): Promise<DischargeBrief> {
  const now = new Date();
  const [brief] = await db
    .update(dischargeBriefs)
    .set({
      isLocked: true,
      lockedAt: now,
      lockedBy: userId,
      signature,
      signedBy: userId,
      signedAt: now,
      updatedAt: now,
    })
    .where(eq(dischargeBriefs.id, id))
    .returning();
  return brief;
}

export async function unlockDischargeBrief(
  id: string,
  userId: string,
  reason: string,
): Promise<DischargeBrief> {
  const now = new Date();
  const [brief] = await db
    .update(dischargeBriefs)
    .set({
      isLocked: false,
      unlockedAt: now,
      unlockedBy: userId,
      unlockReason: reason,
      // Clear signature on unlock so it must be re-signed
      signature: null,
      signedBy: null,
      signedAt: null,
      updatedAt: now,
    })
    .where(eq(dischargeBriefs.id, id))
    .returning();
  return brief;
}

// ========== DISCHARGE BRIEF TEMPLATES ==========

export async function getDischargeBriefTemplates(
  hospitalId: string,
  briefType?: string,
  userId?: string,
  userUnitIds?: string[],
): Promise<DischargeBriefTemplate[]> {
  const conditions = [
    eq(dischargeBriefTemplates.hospitalId, hospitalId),
  ];
  if (briefType) {
    // Include templates matching the selected type OR universal templates (null briefType)
    conditions.push(
      or(
        eq(dischargeBriefTemplates.briefType, briefType as any),
        isNull(dischargeBriefTemplates.briefType),
      )!,
    );
  }

  const templates = await db
    .select()
    .from(dischargeBriefTemplates)
    .where(and(...conditions))
    .orderBy(desc(dischargeBriefTemplates.createdAt));

  // Filter by visibility: hospital-wide, unit-level, or personal
  if (userId) {
    return templates.filter((t) => {
      if (t.visibility === "hospital") return true;
      if (t.visibility === "unit" && t.sharedWithUnitId && userUnitIds?.includes(t.sharedWithUnitId)) return true;
      if (t.visibility === "personal" && t.assignedUserId === userId) return true;
      return false;
    });
  }
  return templates;
}

export async function getUserUnitIds(
  userId: string,
  hospitalId: string,
): Promise<string[]> {
  const rows = await db
    .select({ unitId: userHospitalRoles.unitId })
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
      ),
    );
  return rows.map((r) => r.unitId).filter((id): id is string => id !== null);
}

export async function getAllDischargeBriefTemplates(
  hospitalId: string,
): Promise<DischargeBriefTemplate[]> {
  // Admin view — shows all templates (shared + personal)
  return db
    .select()
    .from(dischargeBriefTemplates)
    .where(eq(dischargeBriefTemplates.hospitalId, hospitalId))
    .orderBy(desc(dischargeBriefTemplates.createdAt));
}

export async function getDischargeBriefTemplateById(
  id: string,
): Promise<DischargeBriefTemplate | undefined> {
  const [template] = await db
    .select()
    .from(dischargeBriefTemplates)
    .where(eq(dischargeBriefTemplates.id, id));
  return template;
}

export async function createDischargeBriefTemplate(
  data: InsertDischargeBriefTemplate,
): Promise<DischargeBriefTemplate> {
  const [template] = await db
    .insert(dischargeBriefTemplates)
    .values(data)
    .returning();
  return template;
}

export async function updateDischargeBriefTemplate(
  id: string,
  data: Partial<InsertDischargeBriefTemplate>,
): Promise<DischargeBriefTemplate> {
  const [template] = await db
    .update(dischargeBriefTemplates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(dischargeBriefTemplates.id, id))
    .returning();
  return template;
}

export async function deleteDischargeBriefTemplate(
  id: string,
): Promise<void> {
  await db
    .delete(dischargeBriefTemplates)
    .where(eq(dischargeBriefTemplates.id, id));
}

// ========== AUDIT TRAIL ==========

export async function getDischargeBriefAuditTrail(
  briefId: string,
): Promise<(AuditTrail & { user: User })[]> {
  const entries = await db
    .select()
    .from(auditTrail)
    .where(
      and(
        eq(auditTrail.recordId, briefId),
        eq(auditTrail.recordType, "discharge_brief"),
      ),
    )
    .orderBy(desc(auditTrail.timestamp));

  const results = [];
  for (const entry of entries) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, entry.userId));
    results.push({ ...entry, user });
  }
  return results;
}
