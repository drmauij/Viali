import { db } from "../storage";
import { eq, sql } from "drizzle-orm";
import { patients, patientMerges } from "@shared/schema";
import logger from "../logger";
import { randomUUID } from "crypto";
import { scorePatient } from "./patientDeduplication";

// ============================================================
// FK Reference Map -- every (table, column) that points to patients.id
// Excludes: patient_merges (audit table, never rewritten)
//
// Hospital filter types:
//   'direct'  — table has its own hospital_id column
//   { via }   — 1-hop: fkColumn IN (SELECT id FROM parentTable WHERE hospital_id = ?)
//   null      — no hospital scoping
// ============================================================

type HospitalFilter =
  | "direct"
  | { via: string; parent: string }
  | { via2: string; mid: string; midVia: string; parent: string }
  | null;

interface FkRef {
  table: string;
  column: string;
  filter: HospitalFilter;
}

const via = (fk: string, parent: string): HospitalFilter => ({
  via: fk,
  parent,
});

const via2 = (
  fk: string,
  mid: string,
  midFk: string,
  parent: string,
): HospitalFilter => ({
  via2: fk,
  mid,
  midVia: midFk,
  parent,
});

export const PATIENT_FK_REFS: FkRef[] = [
  // Cascade FK (notNull)
  { table: "patient_documents", column: "patient_id", filter: "direct" },
  { table: "patient_episodes", column: "patient_id", filter: "direct" },
  {
    table: "patient_document_folders",
    column: "patient_id",
    filter: "direct",
  },
  { table: "patient_notes", column: "patient_id", filter: null },
  { table: "patient_messages", column: "patient_id", filter: "direct" },
  { table: "patient_chat_archives", column: "patient_id", filter: "direct" },
  {
    table: "patient_discharge_medications",
    column: "patient_id",
    filter: "direct",
  },

  // FK (nullable)
  { table: "chat_conversations", column: "patient_id", filter: "direct" },
  {
    table: "chat_mentions",
    column: "mentioned_patient_id",
    filter: via2("message_id", "chat_messages", "conversation_id", "chat_conversations"),
  },
  {
    table: "chat_attachments",
    column: "saved_to_patient_id",
    filter: via2("message_id", "chat_messages", "conversation_id", "chat_conversations"),
  },
  { table: "clinic_invoices", column: "patient_id", filter: "direct" },
  {
    table: "patient_questionnaire_links",
    column: "patient_id",
    filter: "direct",
  },
  { table: "clinic_appointments", column: "patient_id", filter: "direct" },
  {
    table: "external_surgery_requests",
    column: "patient_id",
    filter: "direct",
  },
  { table: "discharge_briefs", column: "patient_id", filter: "direct" },
  { table: "tardoc_invoices", column: "patient_id", filter: "direct" },

  // No FK constraint (plain column)
  { table: "surgeries", column: "patient_id", filter: "direct" },
  { table: "cases", column: "patient_id", filter: "direct" },
  {
    table: "activities",
    column: "patient_id",
    filter: via("unit_id", "units"),
  },
  {
    table: "inventory_commits",
    column: "patient_id",
    filter: via("unit_id", "units"),
  },
];

// ============================================================
// Types
// ============================================================

function buildHospitalFilter(ref: FkRef, hospitalId: string) {
  const f = ref.filter;
  if (f === null) return sql``;
  if (f === "direct") return sql` AND "hospital_id" = ${hospitalId}`;
  if ("via" in f) {
    return sql` AND ${sql.raw(`"${f.via}"`)} IN (SELECT id FROM ${sql.raw(`"${f.parent}"`)} WHERE "hospital_id" = ${hospitalId})`;
  }
  // 2-hop
  return sql` AND ${sql.raw(`"${f.via2}"`)} IN (SELECT id FROM ${sql.raw(`"${f.mid}"`)} WHERE ${sql.raw(`"${f.midVia}"`)} IN (SELECT id FROM ${sql.raw(`"${f.parent}"`)} WHERE "hospital_id" = ${hospitalId}))`;
}

export interface FieldChoice {
  field: string;
  chosen: "primary" | "secondary" | "merge";
  value: any;
}

interface FkUpdateRecord {
  table: string;
  column: string;
  count: number;
  recordIds?: string[];
}

const MERGEABLE_FIELDS = [
  "email",
  "phone",
  "sex",
  "address",
  "street",
  "postalCode",
  "city",
  "insuranceProvider",
  "insuranceNumber",
  "healthInsuranceNumber",
  "insurerGln",
  "emergencyContactName",
  "emergencyContact",
  "otherAllergies",
  "idCardFrontUrl",
  "idCardBackUrl",
  "insuranceCardFrontUrl",
  "insuranceCardBackUrl",
] as const;

// ============================================================
// PREVIEW
// ============================================================

export interface PatientFieldConflict {
  field: string;
  primaryValue: any;
  secondaryValue: any;
  recommendation: "primary" | "secondary" | "merge";
  reason: string;
}

export interface PatientMergePreview {
  primaryScore: number;
  secondaryScore: number;
  fieldConflicts: PatientFieldConflict[];
  fkUpdateCounts: { table: string; column: string; count: number }[];
  totalAffectedRecords: number;
}

export async function previewPatientMerge(
  primaryPatientId: string,
  secondaryPatientId: string,
  hospitalId: string
): Promise<PatientMergePreview> {
  if (primaryPatientId === secondaryPatientId) {
    throw new Error("Cannot merge a patient with themselves");
  }

  // Fetch both patients
  const [primaryPatient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, primaryPatientId));
  const [secondaryPatient] = await db
    .select()
    .from(patients)
    .where(eq(patients.id, secondaryPatientId));

  if (!primaryPatient) throw new Error("Primary patient not found");
  if (!secondaryPatient) throw new Error("Secondary patient not found");
  if (primaryPatient.hospitalId !== hospitalId)
    throw new Error("Primary patient does not belong to this hospital");
  if (secondaryPatient.hospitalId !== hospitalId)
    throw new Error("Secondary patient does not belong to this hospital");
  if (primaryPatient.isArchived)
    throw new Error("Primary patient is archived");
  if (secondaryPatient.isArchived)
    throw new Error("Secondary patient is archived");
  if (primaryPatient.deletedAt)
    throw new Error("Primary patient is deleted");
  if (secondaryPatient.deletedAt)
    throw new Error("Secondary patient is deleted");

  // Field conflicts for MERGEABLE_FIELDS
  const fieldConflicts: PatientFieldConflict[] = [];
  for (const field of MERGEABLE_FIELDS) {
    const pVal = (primaryPatient as any)[field];
    const sVal = (secondaryPatient as any)[field];

    // Both null → skip
    if (pVal == null && sVal == null) continue;
    // Both same → skip
    if (pVal === sVal) continue;

    if (pVal == null && sVal != null) {
      fieldConflicts.push({
        field,
        primaryValue: pVal,
        secondaryValue: sVal,
        recommendation: "secondary",
        reason: "Non-null value preferred",
      });
    } else if (pVal != null && sVal == null) {
      // Primary has value, secondary null → no conflict, primary kept
      continue;
    } else {
      // Both different → recommend primary, flag as conflict
      fieldConflicts.push({
        field,
        primaryValue: pVal,
        secondaryValue: sVal,
        recommendation: "primary",
        reason: "Primary value kept by default",
      });
    }
  }

  // Handle allergies (array union)
  const pAllergies = primaryPatient.allergies;
  const sAllergies = secondaryPatient.allergies;
  if (pAllergies?.length && sAllergies?.length) {
    fieldConflicts.push({
      field: "allergies",
      primaryValue: pAllergies,
      secondaryValue: sAllergies,
      recommendation: "merge",
      reason: "Both patients have allergies — union recommended",
    });
  } else if (!pAllergies?.length && sAllergies?.length) {
    fieldConflicts.push({
      field: "allergies",
      primaryValue: pAllergies,
      secondaryValue: sAllergies,
      recommendation: "secondary",
      reason: "Non-null value preferred",
    });
  }

  // Handle internalNotes (concatenation)
  const pNotes = primaryPatient.internalNotes;
  const sNotes = secondaryPatient.internalNotes;
  if (pNotes && sNotes) {
    fieldConflicts.push({
      field: "internalNotes",
      primaryValue: pNotes,
      secondaryValue: sNotes,
      recommendation: "merge",
      reason: "Both patients have internal notes — concatenation recommended",
    });
  } else if (!pNotes && sNotes) {
    fieldConflicts.push({
      field: "internalNotes",
      primaryValue: pNotes,
      secondaryValue: sNotes,
      recommendation: "secondary",
      reason: "Non-null value preferred",
    });
  }

  // Count FK references per table
  const fkUpdateCounts: { table: string; column: string; count: number }[] = [];
  let totalAffectedRecords = 0;

  for (const ref of PATIENT_FK_REFS) {
    const hospitalFilter = buildHospitalFilter(ref, hospitalId);
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM ${sql.raw(`"${ref.table}"`)} WHERE ${sql.raw(`"${ref.column}"`)} = ${secondaryPatientId}${hospitalFilter}`
    );
    const count = Number((result.rows[0] as any)?.count ?? 0);
    if (count > 0) {
      fkUpdateCounts.push({ table: ref.table, column: ref.column, count });
      totalAffectedRecords += count;
    }
  }

  // Score both patients
  const [primaryScore, secondaryScore] = await Promise.all([
    scorePatient(primaryPatientId, hospitalId),
    scorePatient(secondaryPatientId, hospitalId),
  ]);

  return {
    primaryScore,
    secondaryScore,
    fieldConflicts,
    fkUpdateCounts,
    totalAffectedRecords,
  };
}

// ============================================================
// EXECUTE MERGE
// ============================================================

export async function executePatientMerge(
  primaryPatientId: string,
  secondaryPatientId: string,
  fieldChoices: Record<
    string,
    { chosen: "primary" | "secondary" | "merge"; value?: any }
  >,
  mergedBy: string,
  hospitalId: string
): Promise<{ mergeId: string; fkUpdates: FkUpdateRecord[] }> {
  if (primaryPatientId === secondaryPatientId) {
    throw new Error("Cannot merge a patient with themselves");
  }

  return await db.transaction(async (tx) => {
    // ---- 1. Snapshot both patients ----
    const [primaryPatient] = await tx
      .select()
      .from(patients)
      .where(eq(patients.id, primaryPatientId));
    const [secondaryPatient] = await tx
      .select()
      .from(patients)
      .where(eq(patients.id, secondaryPatientId));

    if (!primaryPatient) throw new Error("Primary patient not found");
    if (!secondaryPatient) throw new Error("Secondary patient not found");
    if (primaryPatient.hospitalId !== hospitalId)
      throw new Error("Primary patient does not belong to this hospital");
    if (secondaryPatient.hospitalId !== hospitalId)
      throw new Error("Secondary patient does not belong to this hospital");

    const primarySnapshot = { ...primaryPatient };
    const secondarySnapshot = { ...secondaryPatient };

    // ---- 2. Merge fields ----
    const patientUpdates: Record<string, any> = {};

    for (const field of MERGEABLE_FIELDS) {
      const choice = fieldChoices[field];
      if (choice?.chosen === "secondary") {
        patientUpdates[field] = (secondaryPatient as any)[field];
      }
    }

    // Handle allergies
    const allergiesChoice = fieldChoices.allergies;
    if (allergiesChoice?.chosen === "merge") {
      const pArr = primaryPatient.allergies ?? [];
      const sArr = secondaryPatient.allergies ?? [];
      patientUpdates.allergies = [...new Set([...pArr, ...sArr])];
    } else if (allergiesChoice?.chosen === "secondary") {
      patientUpdates.allergies = secondaryPatient.allergies;
    }

    // Handle internalNotes
    const notesChoice = fieldChoices.internalNotes;
    if (notesChoice?.chosen === "merge") {
      const pNotes = primaryPatient.internalNotes || "";
      const sNotes = secondaryPatient.internalNotes || "";
      const separator = `\n---\n[Merged from ${secondaryPatient.surname} ${secondaryPatient.firstName} (${secondaryPatientId}) on ${new Date().toISOString()}]\n`;
      patientUpdates.internalNotes = pNotes
        ? `${pNotes}${separator}${sNotes}`
        : `${separator}${sNotes}`;
    } else if (notesChoice?.chosen === "secondary") {
      patientUpdates.internalNotes = secondaryPatient.internalNotes;
    }

    if (Object.keys(patientUpdates).length > 0) {
      patientUpdates.updatedAt = new Date();
      await tx
        .update(patients)
        .set(patientUpdates)
        .where(eq(patients.id, primaryPatientId));
    }

    // ---- 3. Relink FK references ----
    const fkUpdates: FkUpdateRecord[] = [];

    for (const ref of PATIENT_FK_REFS) {
      const hospitalFilter = buildHospitalFilter(ref, hospitalId);
      const result = await tx.execute(
        sql`UPDATE ${sql.raw(`"${ref.table}"`)} SET ${sql.raw(`"${ref.column}"`)} = ${primaryPatientId} WHERE ${sql.raw(`"${ref.column}"`)} = ${secondaryPatientId}${hospitalFilter} RETURNING id`
      );
      const rows = result.rows ?? (result as any) ?? [];
      const count = Array.isArray(rows) ? rows.length : 0;
      logger.info(
        `[PatientMerge] Relink ${ref.table}.${ref.column}: ${count} records updated`
      );
      if (count > 0) {
        fkUpdates.push({
          table: ref.table,
          column: ref.column,
          count,
          recordIds: rows.map((r: any) => r.id),
        });
      }
    }

    // ---- 4b. Fix patient_messages.conversationId ----
    const convResult = await tx.execute(
      sql`UPDATE "patient_messages" SET "conversation_id" = REPLACE("conversation_id", ${secondaryPatientId}, ${primaryPatientId}) WHERE "patient_id" = ${primaryPatientId} AND "conversation_id" LIKE '%' || ${secondaryPatientId} || '%' RETURNING id`
    );
    const conversationIdUpdates = convResult.rows.map((r: any) => r.id);

    // ---- 4c. Deduplicate patient_chat_archives ----
    let deletedChatArchives: Record<string, any>[] = [];

    // Check if primary already has archive entries for this hospital
    const existingArchives = await tx.execute(
      sql`SELECT id FROM "patient_chat_archives" WHERE "patient_id" = ${primaryPatientId} AND "hospital_id" = ${hospitalId}`
    );

    if (existingArchives.rows.length > 0) {
      // Find secondary's original record IDs that were just relinked
      const chatArchiveFkUpdate = fkUpdates.find(
        (u) =>
          u.table === "patient_chat_archives" && u.column === "patient_id"
      );
      if (chatArchiveFkUpdate?.recordIds?.length) {
        const deleteResult = await tx.execute(
          sql`DELETE FROM "patient_chat_archives" WHERE "patient_id" = ${primaryPatientId} AND "hospital_id" = ${hospitalId} AND id = ANY(${chatArchiveFkUpdate.recordIds}) RETURNING *`
        );
        deletedChatArchives = deleteResult.rows as Record<string, any>[];
      }
    }

    // ---- 5. Archive secondary patient ----
    const mergeNote = `[Merged into ${primaryPatient.surname} ${primaryPatient.firstName} (${primaryPatientId}) on ${new Date().toISOString()}]`;
    const existingNotes = secondaryPatient.internalNotes || "";

    await tx
      .update(patients)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        internalNotes: existingNotes
          ? `${existingNotes}\n${mergeNote}`
          : mergeNote,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, secondaryPatientId));

    // ---- 6. Write audit record ----
    const mergeId = randomUUID();
    await tx.insert(patientMerges).values({
      id: mergeId,
      hospitalId,
      primaryPatientId,
      secondaryPatientId,
      mergedBy,
      primaryPatientSnapshot: primarySnapshot as any,
      secondaryPatientSnapshot: secondarySnapshot as any,
      fkUpdates: fkUpdates as any,
      fieldChoices: fieldChoices as any,
      deletedChatArchives:
        deletedChatArchives.length > 0 ? (deletedChatArchives as any) : null,
      conversationIdUpdates:
        conversationIdUpdates.length > 0
          ? (conversationIdUpdates as any)
          : null,
      status: "completed",
    });

    logger.info(
      `[PatientMerge] Merged patient ${secondaryPatientId} into ${primaryPatientId} (merge ${mergeId}). ` +
        `FK updates: ${fkUpdates.reduce((s, f) => s + f.count, 0)}, ` +
        `conversation IDs updated: ${conversationIdUpdates.length}, ` +
        `chat archives deduped: ${deletedChatArchives.length}`
    );

    return { mergeId, fkUpdates };
  });
}

// ============================================================
// UNDO MERGE
// ============================================================

export async function undoPatientMerge(
  mergeId: string,
  undoneBy: string
): Promise<void> {
  return await db.transaction(async (tx) => {
    // Load merge record
    const [merge] = await tx
      .select()
      .from(patientMerges)
      .where(eq(patientMerges.id, mergeId));

    if (!merge) throw new Error("Merge record not found");
    if (merge.status === "undone") throw new Error("Merge already undone");

    const primarySnapshot = merge.primaryPatientSnapshot as Record<
      string,
      any
    >;
    const secondarySnapshot = merge.secondaryPatientSnapshot as Record<
      string,
      any
    >;
    const fkUpdateLog = merge.fkUpdates as FkUpdateRecord[];
    const fieldChoicesLog = merge.fieldChoices as Record<
      string,
      { chosen: string; value: any }
    >;
    const conversationIdUpdateLog = (merge.conversationIdUpdates ??
      []) as string[];
    const deletedChatArchivesLog = (merge.deletedChatArchives ??
      []) as Record<string, any>[];

    // Build set of known FK refs for validation
    const knownRefs = new Set(
      PATIENT_FK_REFS.map((ref) => `${ref.table}.${ref.column}`)
    );

    // ---- 1. Reverse FK updates ----
    for (const update of fkUpdateLog) {
      if (!update.recordIds || update.recordIds.length === 0) continue;

      const refKey = `${update.table}.${update.column}`;
      if (!knownRefs.has(refKey)) {
        logger.warn(
          `[PatientMerge:Undo] Unknown FK ref ${refKey}, skipping`
        );
        continue;
      }

      for (const recordId of update.recordIds) {
        try {
          await tx.execute(
            sql`UPDATE ${sql.raw(`"${update.table}"`)} SET ${sql.raw(`"${update.column}"`)} = ${merge.secondaryPatientId} WHERE id = ${recordId}`
          );
        } catch (err) {
          logger.warn(
            `[PatientMerge:Undo] Could not revert ${update.table}.${update.column} for record ${recordId}: ${err}`
          );
        }
      }
    }

    // ---- 2. Reverse conversationId updates ----
    for (const recordId of conversationIdUpdateLog) {
      try {
        await tx.execute(
          sql`UPDATE "patient_messages" SET "conversation_id" = REPLACE("conversation_id", ${merge.primaryPatientId}, ${merge.secondaryPatientId}) WHERE id = ${recordId}`
        );
      } catch (err) {
        logger.warn(
          `[PatientMerge:Undo] Could not revert conversationId for message ${recordId}: ${err}`
        );
      }
    }

    // ---- 3. Restore deleted chat archives ----
    for (const row of deletedChatArchivesLog) {
      try {
        // Re-insert using raw SQL to preserve all original columns
        await tx.execute(
          sql`INSERT INTO "patient_chat_archives" (id, hospital_id, patient_id, archived_by, archived_at) VALUES (${row.id}, ${row.hospital_id}, ${row.patient_id}, ${row.archived_by}, ${row.archived_at})`
        );
      } catch (err) {
        logger.warn(
          `[PatientMerge:Undo] Could not restore chat archive ${row.id}: ${err}`
        );
      }
    }

    // ---- 4. Restore secondary patient from snapshot ----
    await tx
      .update(patients)
      .set({
        isArchived: secondarySnapshot.isArchived ?? false,
        archivedAt: secondarySnapshot.archivedAt ?? null,
        internalNotes: secondarySnapshot.internalNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, merge.secondaryPatientId));

    // ---- 5. Restore primary patient fields that were changed ----
    const primaryRestoreFields: Record<string, any> = {};
    for (const [field, choice] of Object.entries(fieldChoicesLog)) {
      if (
        choice.chosen === "secondary" ||
        choice.chosen === "merge"
      ) {
        primaryRestoreFields[field] = (primarySnapshot as any)[field];
      }
    }
    if (Object.keys(primaryRestoreFields).length > 0) {
      primaryRestoreFields.updatedAt = new Date();
      await tx
        .update(patients)
        .set(primaryRestoreFields)
        .where(eq(patients.id, merge.primaryPatientId));
    }

    // ---- 6. Mark undone ----
    await tx
      .update(patientMerges)
      .set({
        status: "undone",
        undoneAt: new Date(),
        undoneBy,
      })
      .where(eq(patientMerges.id, mergeId));

    logger.info(
      `[PatientMerge] Undid merge ${mergeId} (primary: ${merge.primaryPatientId}, secondary: ${merge.secondaryPatientId})`
    );
  });
}
