import { db } from "../storage";
import { eq, and, sql } from "drizzle-orm";
import {
  users,
  userHospitalRoles,
  staffMerges,
  surgeryStaffEntries,
  chatParticipants,
  calcomProviderMappings,
  dailyStaffPool,
  plannedSurgeryStaff,
  dailyRoomStaff,
} from "@shared/schema";
import logger from "../logger";
import { randomUUID } from "crypto";

// ============================================================
// FK Reference Map -- every (table, column) that points to users.id
// Excludes: user_hospital_roles (special merge logic),
//           chat_participants (unique constraint),
//           calcom_provider_mappings (unique constraint),
//           daily_staff_pool.user_id (duplicate check),
//           staff_merges (audit table, never rewritten)
// ============================================================

const SIMPLE_FK_REFS: Array<[string, string]> = [
  // Surgeries
  ["surgeries", "surgeon_id"],
  ["surgeries", "suspended_by"],
  ["surgeries", "archived_by"],
  ["surgery_notes", "author_id"],
  ["surgeon_checklist_templates", "owner_user_id"],

  // Anesthesia records
  ["anesthesia_records", "provider_id"],
  ["anesthesia_records", "closed_by"],
  ["anesthesia_records", "locked_by"],
  ["anesthesia_records", "unlocked_by"],
  ["anesthesia_record_medications", "imported_by"],
  ["anesthesia_medications", "administered_by"],
  ["anesthesia_events", "created_by"],
  ["anesthesia_positions", "created_by"],

  // Medications
  ["medication_couplings", "created_by"],
  ["medication_sets", "created_by"],

  // Surgery staff
  ["surgery_staff_entries", "user_id"],
  ["surgery_staff_entries", "created_by"],

  // Staff pool (daily_staff_pool.user_id handled separately)
  ["staff_pool_rules", "user_id"],
  ["staff_pool_rules", "created_by"],
  ["daily_staff_pool", "created_by"],
  ["planned_surgery_staff", "user_id"],
  ["planned_surgery_staff", "created_by"],
  ["daily_room_staff", "user_id"],
  ["daily_room_staff", "created_by"],

  // Inventory
  ["inventory_usage", "overridden_by"],
  ["inventory_commits", "committed_by"],
  ["inventory_commits", "rolled_back_by"],

  // Audit / Activities
  ["activities", "user_id"],
  ["audit_trail", "user_id"],

  // Notes
  ["notes", "user_id"],
  ["patient_notes", "author_id"],
  ["note_attachments", "uploaded_by"],

  // Chat (participants handled separately)
  ["chat_conversations", "creator_id"],
  ["chat_messages", "sender_id"],
  ["chat_mentions", "mentioned_user_id"],
  ["chat_notifications", "user_id"],

  // Orders & Logistics
  ["orders", "created_by"],
  ["order_lines", "received_by"],
  ["order_attachments", "uploaded_by"],
  ["price_sync_jobs", "triggered_by"],

  // Alerts & Checks
  ["alerts", "acknowledged_by"],
  ["controlled_checks", "user_id"],
  ["import_jobs", "user_id"],

  // Checklists
  ["checklist_templates", "created_by"],
  ["checklist_completions", "completed_by"],
  ["checklist_dismissals", "dismissed_by"],

  // Patients
  ["patients", "created_by"],
  ["patients", "archived_by"],
  ["patient_documents", "uploaded_by"],
  ["patient_episodes", "created_by"],
  ["patient_episodes", "closed_by"],
  ["patient_messages", "sent_by"],
  ["patient_discharge_medications", "doctor_id"],
  ["patient_discharge_medications", "created_by"],

  // Questionnaires
  ["patient_questionnaire_links", "created_by"],
  ["patient_questionnaire_links", "reviewed_by"],
  ["patient_questionnaire_links", "email_sent_by"],
  ["patient_questionnaire_links", "sms_sent_by"],
  ["patient_questionnaire_reviews", "reviewed_by"],

  // Provider scheduling
  ["provider_availability", "provider_id"],
  ["provider_time_off", "provider_id"],
  ["provider_time_off", "created_by"],
  ["provider_availability_windows", "provider_id"],
  ["provider_availability_windows", "created_by"],
  ["provider_absences", "provider_id"],

  // Clinic
  ["clinic_invoices", "created_by"],
  ["clinic_appointments", "provider_id"],
  ["clinic_appointments", "internal_colleague_id"],
  ["clinic_appointments", "created_by"],

  // Worker / Worktime
  ["worker_contracts", "manager_id"],
  ["external_worklog_entries", "countersigned_by"],
  ["worktime_logs", "user_id"],
  ["worktime_logs", "entered_by_id"],

  // Terms / External
  ["terms_acceptances", "signed_by_user_id"],
  ["external_surgery_requests", "scheduled_by"],

  // Personal (cascade-delete tables -- still need reassignment)
  ["personal_todos", "user_id"],
  ["user_message_templates", "user_id"],

  // Sets
  ["anesthesia_sets", "created_by"],
  ["inventory_sets", "created_by"],
  ["surgery_sets", "created_by"],

  // Item matching
  ["item_hin_matches", "verified_by"],

  // Discharge
  ["discharge_medication_templates", "created_by"],
  ["discharge_brief_templates", "assigned_user_id"],
  ["discharge_brief_templates", "created_by"],
  ["discharge_briefs", "signed_by"],
  ["discharge_briefs", "locked_by"],
  ["discharge_briefs", "unlocked_by"],
  ["discharge_briefs", "created_by"],
];

// ============================================================
// Types
// ============================================================

export interface FieldChoice {
  field: string;
  chosen: "primary" | "secondary";
  value: any;
}

interface FkUpdateRecord {
  table: string;
  column: string;
  count: number;
  recordIds?: string[];
}

interface RoleMergeRecord {
  action: "transferred" | "merged" | "deleted";
  roleId: string;
  details: Record<string, any>;
}

interface OrphanLinkRecord {
  table: string;
  recordId: string;
  matchedName: string;
  confidence: number;
}

export interface MergePreview {
  primaryUser: Record<string, any>;
  secondaryUser: Record<string, any>;
  fieldConflicts: Array<{
    field: string;
    primaryValue: any;
    secondaryValue: any;
    recommended: "primary" | "secondary";
    reason: string;
  }>;
  roleConflicts: Array<{
    roleId: string;
    hospitalId: string;
    unitId: string;
    role: string;
    action: "transfer" | "merge";
    details: string;
  }>;
  fkUpdateCounts: Record<string, number>;
  orphanMatches: Array<{
    recordId: string;
    name: string;
    confidence: number;
  }>;
}

// ============================================================
// Name similarity (reuses pattern from polymedMatching.ts)
// ============================================================

function calculateNameSimilarity(name1: string, name2: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\sàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;

  const words1 = new Set(n1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(n2.split(" ").filter((w) => w.length > 1));

  const intersection = new Set(
    Array.from(words1).filter((x) => words2.has(x))
  );
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Levenshtein distance for character-level similarity
  const levDist = levenshtein(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

  // Weighted combination: 60% word-level, 40% character-level
  return Math.min(1.0, jaccard * 0.6 + levSim * 0.4);
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ============================================================
// Helper: determine best field value
// ============================================================

const MERGEABLE_FIELDS = [
  "email",
  "phone",
  "staffType",
  "hourlyRate",
  "weeklyTargetHours",
  "briefSignature",
  "profileImageUrl",
  "timebutlerIcsUrl",
  "adminNotes",
] as const;

function isDummyEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.endsWith("@staff.local") || email.endsWith("@internal.local");
}

function recommendField(
  field: string,
  primaryVal: any,
  secondaryVal: any
): { recommended: "primary" | "secondary"; reason: string } {
  if (field === "email") {
    const pDummy = isDummyEmail(primaryVal);
    const sDummy = isDummyEmail(secondaryVal);
    if (pDummy && !sDummy) return { recommended: "secondary", reason: "Real email preferred over dummy" };
    if (!pDummy && sDummy) return { recommended: "primary", reason: "Real email preferred over dummy" };
  }

  // Prefer non-null / non-empty over null
  if (primaryVal == null && secondaryVal != null)
    return { recommended: "secondary", reason: "Non-null value preferred" };
  if (primaryVal != null && secondaryVal == null)
    return { recommended: "primary", reason: "Non-null value preferred" };

  // Default: keep primary
  return { recommended: "primary", reason: "Primary value kept by default" };
}

// ============================================================
// PREVIEW (dry run)
// ============================================================

export async function previewStaffMerge(
  primaryUserId: string,
  secondaryUserId: string,
  hospitalId: string
): Promise<MergePreview> {
  // Fetch both users
  const [primaryUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, primaryUserId));
  const [secondaryUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, secondaryUserId));

  if (!primaryUser) throw new Error("Primary user not found");
  if (!secondaryUser) throw new Error("Secondary user not found");

  // Field conflicts
  const fieldConflicts: MergePreview["fieldConflicts"] = [];
  for (const field of MERGEABLE_FIELDS) {
    const pVal = (primaryUser as any)[field];
    const sVal = (secondaryUser as any)[field];
    if (pVal !== sVal && (pVal != null || sVal != null)) {
      const rec = recommendField(field, pVal, sVal);
      fieldConflicts.push({
        field,
        primaryValue: pVal,
        secondaryValue: sVal,
        ...rec,
      });
    }
  }

  // Role conflicts
  const primaryRoles = await db
    .select()
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, primaryUserId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      )
    );
  const secondaryRoles = await db
    .select()
    .from(userHospitalRoles)
    .where(
      and(
        eq(userHospitalRoles.userId, secondaryUserId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      )
    );

  const roleConflicts: MergePreview["roleConflicts"] = [];
  for (const sRole of secondaryRoles) {
    const match = primaryRoles.find(
      (p) =>
        p.hospitalId === sRole.hospitalId &&
        p.unitId === sRole.unitId &&
        p.role === sRole.role
    );
    if (match) {
      roleConflicts.push({
        roleId: sRole.id,
        hospitalId: sRole.hospitalId,
        unitId: sRole.unitId,
        role: sRole.role,
        action: "merge",
        details: `Duplicate role -- flags will be merged (isBookable: ${match.isBookable} | ${sRole.isBookable})`,
      });
    } else {
      roleConflicts.push({
        roleId: sRole.id,
        hospitalId: sRole.hospitalId,
        unitId: sRole.unitId,
        role: sRole.role,
        action: "transfer",
        details: "Role will be transferred to primary user",
      });
    }
  }

  // FK update counts (estimate from simple refs)
  const fkUpdateCounts: Record<string, number> = {};
  for (const [table, column] of SIMPLE_FK_REFS) {
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM ${sql.raw(`"${table}"`)} WHERE ${sql.raw(`"${column}"`)} = ${secondaryUserId}`
    );
    const count = Number((result.rows[0] as any)?.count ?? 0);
    if (count > 0) {
      fkUpdateCounts[`${table}.${column}`] = count;
    }
  }

  // Also count special tables
  const [chatCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatParticipants)
    .where(eq(chatParticipants.userId, secondaryUserId));
  if (Number(chatCount.count) > 0) fkUpdateCounts["chat_participants.user_id"] = Number(chatCount.count);

  const [calcomCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(calcomProviderMappings)
    .where(eq(calcomProviderMappings.providerId, secondaryUserId));
  if (Number(calcomCount.count) > 0) fkUpdateCounts["calcom_provider_mappings.provider_id"] = Number(calcomCount.count);

  const [dspCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dailyStaffPool)
    .where(eq(dailyStaffPool.userId, secondaryUserId));
  if (Number(dspCount.count) > 0) fkUpdateCounts["daily_staff_pool.user_id"] = Number(dspCount.count);

  const [roleCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(userHospitalRoles)
    .where(eq(userHospitalRoles.userId, secondaryUserId));
  if (Number(roleCount.count) > 0) fkUpdateCounts["user_hospital_roles.user_id"] = Number(roleCount.count);

  // Orphan matches (surgery_staff_entries where userId IS NULL, name similar)
  const orphanMatches: MergePreview["orphanMatches"] = [];
  const orphans = await db
    .select()
    .from(surgeryStaffEntries)
    .where(sql`${surgeryStaffEntries.userId} IS NULL`);

  const primaryName = `${primaryUser.firstName ?? ""} ${primaryUser.lastName ?? ""}`.trim();
  const secondaryName = `${secondaryUser.firstName ?? ""} ${secondaryUser.lastName ?? ""}`.trim();

  for (const entry of orphans) {
    const sim1 = primaryName ? calculateNameSimilarity(entry.name, primaryName) : 0;
    const sim2 = secondaryName ? calculateNameSimilarity(entry.name, secondaryName) : 0;
    const bestSim = Math.max(sim1, sim2);
    if (bestSim >= 0.8) {
      orphanMatches.push({
        recordId: entry.id,
        name: entry.name,
        confidence: bestSim,
      });
    }
  }

  return {
    primaryUser: primaryUser as any,
    secondaryUser: secondaryUser as any,
    fieldConflicts,
    roleConflicts,
    fkUpdateCounts,
    orphanMatches,
  };
}

// ============================================================
// EXECUTE MERGE
// ============================================================

export async function executeStaffMerge(
  primaryUserId: string,
  secondaryUserId: string,
  fieldChoices: Record<string, { chosen: "primary" | "secondary"; value: any }>,
  mergedBy: string,
  hospitalId: string
): Promise<{ mergeId: string; fkUpdates: FkUpdateRecord[] }> {
  if (primaryUserId === secondaryUserId) {
    throw new Error("Cannot merge a user with themselves");
  }

  return await db.transaction(async (tx) => {
    // ---- 1. Snapshot both users ----
    const [primaryUser] = await tx
      .select()
      .from(users)
      .where(eq(users.id, primaryUserId));
    const [secondaryUser] = await tx
      .select()
      .from(users)
      .where(eq(users.id, secondaryUserId));

    if (!primaryUser) throw new Error("Primary user not found");
    if (!secondaryUser) throw new Error("Secondary user not found");

    // Validate both users have roles in the specified hospital
    const [primaryHasRole] = await tx
      .select()
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.userId, primaryUserId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      );
    const [secondaryHasRole] = await tx
      .select()
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.userId, secondaryUserId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      );

    if (!primaryHasRole) throw new Error("Primary user does not belong to this hospital");
    if (!secondaryHasRole) throw new Error("Secondary user does not belong to this hospital");

    const primarySnapshot = { ...primaryUser };
    const secondarySnapshot = { ...secondaryUser };

    // ---- 2. Update primary user fields based on choices ----
    const userUpdates: Record<string, any> = {};
    for (const [field, choice] of Object.entries(fieldChoices)) {
      if (choice.chosen === "secondary") {
        userUpdates[field] = choice.value;
      }
    }

    // Special: inherit login credentials if secondary has canLogin and primary doesn't
    if (secondaryUser.canLogin && !primaryUser.canLogin) {
      if (
        !fieldChoices.email ||
        fieldChoices.email.chosen === "secondary"
      ) {
        userUpdates.canLogin = true;
        if (secondaryUser.passwordHash && !primaryUser.passwordHash) {
          userUpdates.passwordHash = secondaryUser.passwordHash;
        }
      }
    }

    // Special: prefer real email over dummy
    if (!fieldChoices.email) {
      if (isDummyEmail(primaryUser.email) && !isDummyEmail(secondaryUser.email)) {
        userUpdates.email = secondaryUser.email;
      }
    }

    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updatedAt = new Date();
      await tx
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, primaryUserId));
    }

    // ---- 3. Merge userHospitalRoles ----
    const primaryRoles = await tx
      .select()
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.userId, primaryUserId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      );
    const secondaryRoles = await tx
      .select()
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.userId, secondaryUserId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      );

    const roleMerges: RoleMergeRecord[] = [];

    for (const sRole of secondaryRoles) {
      const match = primaryRoles.find(
        (p) =>
          p.hospitalId === sRole.hospitalId &&
          p.unitId === sRole.unitId &&
          p.role === sRole.role
      );

      if (match) {
        // Merge flags: isBookable = true if either is true
        const mergedBookable = match.isBookable || sRole.isBookable;
        if (mergedBookable !== match.isBookable) {
          await tx
            .update(userHospitalRoles)
            .set({ isBookable: mergedBookable })
            .where(eq(userHospitalRoles.id, match.id));
        }
        // Delete the secondary's duplicate role
        await tx
          .delete(userHospitalRoles)
          .where(eq(userHospitalRoles.id, sRole.id));

        roleMerges.push({
          action: "merged",
          roleId: sRole.id,
          details: {
            primaryRoleId: match.id,
            primaryOriginalBookable: match.isBookable,
            mergedBookable,
            deletedSecondaryRoleId: sRole.id,
            unitId: sRole.unitId,
            role: sRole.role,
            secondaryBookable: sRole.isBookable,
            secondaryIsDefaultLogin: sRole.isDefaultLogin,
            secondaryAvailabilityMode: sRole.availabilityMode,
          },
        });
      } else {
        // Transfer role to primary user
        await tx
          .update(userHospitalRoles)
          .set({ userId: primaryUserId })
          .where(eq(userHospitalRoles.id, sRole.id));

        roleMerges.push({
          action: "transferred",
          roleId: sRole.id,
          details: { fromUser: secondaryUserId, toUser: primaryUserId },
        });
      }
    }

    // ---- 4. Update all FK references ----
    const fkUpdates: FkUpdateRecord[] = [];

    // 4a. Simple FK updates
    for (const [table, column] of SIMPLE_FK_REFS) {
      const result = await tx.execute(
        sql`UPDATE ${sql.raw(`"${table}"`)} SET ${sql.raw(`"${column}"`)} = ${primaryUserId} WHERE ${sql.raw(`"${column}"`)} = ${secondaryUserId} RETURNING id`
      );
      const count = result.rows.length;
      if (count > 0) {
        fkUpdates.push({
          table,
          column,
          count,
          recordIds: result.rows.map((r: any) => r.id),
        });
      }
    }

    // 4b. daily_staff_pool.user_id -- check for duplicates on (hospital_id, date, role)
    const secondaryPoolEntries = await tx
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.userId, secondaryUserId));

    for (const entry of secondaryPoolEntries) {
      // Check if primary already has a pool entry for same hospital/date/role
      const [existing] = await tx
        .select()
        .from(dailyStaffPool)
        .where(
          and(
            eq(dailyStaffPool.userId, primaryUserId),
            eq(dailyStaffPool.hospitalId, entry.hospitalId),
            eq(dailyStaffPool.date, entry.date),
            eq(dailyStaffPool.role, entry.role)
          )
        );

      if (existing) {
        // Reassign downstream refs (planned_surgery_staff, daily_room_staff) to primary's pool entry
        await tx.execute(
          sql`UPDATE "planned_surgery_staff" SET "daily_staff_pool_id" = ${existing.id} WHERE "daily_staff_pool_id" = ${entry.id}`
        );
        await tx.execute(
          sql`UPDATE "daily_room_staff" SET "daily_staff_pool_id" = ${existing.id} WHERE "daily_staff_pool_id" = ${entry.id}`
        );
        // Delete secondary's duplicate pool entry
        await tx
          .delete(dailyStaffPool)
          .where(eq(dailyStaffPool.id, entry.id));

        fkUpdates.push({
          table: "daily_staff_pool",
          column: "user_id",
          count: 1,
          recordIds: [entry.id],
        });
      } else {
        // No conflict, just reassign
        await tx
          .update(dailyStaffPool)
          .set({ userId: primaryUserId })
          .where(eq(dailyStaffPool.id, entry.id));

        fkUpdates.push({
          table: "daily_staff_pool",
          column: "user_id",
          count: 1,
          recordIds: [entry.id],
        });
      }
    }

    // 4c. chat_participants -- unique(conversation_id, user_id)
    const secondaryParticipations = await tx
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.userId, secondaryUserId));

    for (const part of secondaryParticipations) {
      const [existing] = await tx
        .select()
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.conversationId, part.conversationId),
            eq(chatParticipants.userId, primaryUserId)
          )
        );

      if (existing) {
        // Primary already in conversation, delete secondary's participation
        await tx
          .delete(chatParticipants)
          .where(eq(chatParticipants.id, part.id));
      } else {
        // Transfer participation to primary
        await tx
          .update(chatParticipants)
          .set({ userId: primaryUserId })
          .where(eq(chatParticipants.id, part.id));
      }

      fkUpdates.push({
        table: "chat_participants",
        column: "user_id",
        count: 1,
        recordIds: [part.id],
      });
    }

    // 4d. calcom_provider_mappings -- unique(hospital_id, provider_id)
    const secondaryCalcomMappings = await tx
      .select()
      .from(calcomProviderMappings)
      .where(eq(calcomProviderMappings.providerId, secondaryUserId));

    for (const mapping of secondaryCalcomMappings) {
      const [existing] = await tx
        .select()
        .from(calcomProviderMappings)
        .where(
          and(
            eq(calcomProviderMappings.hospitalId, mapping.hospitalId),
            eq(calcomProviderMappings.providerId, primaryUserId)
          )
        );

      if (existing) {
        // Keep primary's mapping, delete secondary's
        await tx
          .delete(calcomProviderMappings)
          .where(eq(calcomProviderMappings.id, mapping.id));
      } else {
        // Transfer mapping to primary
        await tx
          .update(calcomProviderMappings)
          .set({ providerId: primaryUserId })
          .where(eq(calcomProviderMappings.id, mapping.id));
      }

      fkUpdates.push({
        table: "calcom_provider_mappings",
        column: "provider_id",
        count: 1,
        recordIds: [mapping.id],
      });
    }

    // ---- 5. Link orphan name-only entries ----
    const linkedOrphans: OrphanLinkRecord[] = [];

    const orphans = await tx
      .select()
      .from(surgeryStaffEntries)
      .where(sql`${surgeryStaffEntries.userId} IS NULL`);

    const primaryName = `${primaryUser.firstName ?? ""} ${primaryUser.lastName ?? ""}`.trim();
    const secondaryName = `${secondaryUser.firstName ?? ""} ${secondaryUser.lastName ?? ""}`.trim();

    for (const entry of orphans) {
      const sim1 = primaryName
        ? calculateNameSimilarity(entry.name, primaryName)
        : 0;
      const sim2 = secondaryName
        ? calculateNameSimilarity(entry.name, secondaryName)
        : 0;
      const bestSim = Math.max(sim1, sim2);

      if (bestSim >= 0.8) {
        await tx
          .update(surgeryStaffEntries)
          .set({ userId: primaryUserId })
          .where(eq(surgeryStaffEntries.id, entry.id));

        linkedOrphans.push({
          table: "surgery_staff_entries",
          recordId: entry.id,
          matchedName: entry.name,
          confidence: bestSim,
        });
      }
    }

    // ---- 6. Archive secondary user ----
    const mergeNote = `[Merged into ${primaryUser.firstName} ${primaryUser.lastName} (${primaryUserId}) on ${new Date().toISOString()}]`;
    const existingNotes = secondaryUser.adminNotes || "";
    await tx
      .update(users)
      .set({
        archivedAt: new Date(),
        adminNotes: existingNotes
          ? `${existingNotes}\n${mergeNote}`
          : mergeNote,
        updatedAt: new Date(),
      })
      .where(eq(users.id, secondaryUserId));

    // ---- 7. Write staffMerges audit record ----
    const mergeId = randomUUID();
    await tx.insert(staffMerges).values({
      id: mergeId,
      hospitalId,
      primaryUserId,
      secondaryUserId,
      mergedBy,
      primaryUserSnapshot: primarySnapshot as any,
      secondaryUserSnapshot: secondarySnapshot as any,
      fkUpdates: fkUpdates as any,
      roleMerges: roleMerges as any,
      fieldChoices: fieldChoices as any,
      linkedOrphans: linkedOrphans.length > 0 ? (linkedOrphans as any) : null,
      status: "completed",
    });

    logger.info(
      `[StaffMerge] Merged user ${secondaryUserId} into ${primaryUserId} (merge ${mergeId}). ` +
        `FK updates: ${fkUpdates.reduce((s, f) => s + f.count, 0)}, ` +
        `roles merged: ${roleMerges.length}, ` +
        `orphans linked: ${linkedOrphans.length}`
    );

    return { mergeId, fkUpdates };
  });
}

// ============================================================
// UNDO MERGE
// ============================================================

export async function undoStaffMerge(
  mergeId: string,
  undoneBy: string
): Promise<void> {
  return await db.transaction(async (tx) => {
    // Load merge record
    const [merge] = await tx
      .select()
      .from(staffMerges)
      .where(eq(staffMerges.id, mergeId));

    if (!merge) throw new Error("Merge record not found");
    if (merge.status === "undone") throw new Error("Merge already undone");

    const primarySnapshot = merge.primaryUserSnapshot as Record<string, any>;
    const secondarySnapshot = merge.secondaryUserSnapshot as Record<string, any>;
    const fkUpdateLog = merge.fkUpdates as FkUpdateRecord[];
    const roleMergeLog = merge.roleMerges as RoleMergeRecord[];
    const linkedOrphansLog = (merge.linkedOrphans ?? []) as OrphanLinkRecord[];
    const fieldChoicesLog = merge.fieldChoices as Record<
      string,
      { chosen: string; value: any }
    >;

    // Build set of known FK refs for validation
    const knownRefs = new Set(SIMPLE_FK_REFS.map(([t, c]) => `${t}.${c}`));
    // Also add the special-handling tables
    knownRefs.add("daily_staff_pool.user_id");
    knownRefs.add("chat_participants.user_id");
    knownRefs.add("calcom_provider_mappings.provider_id");

    // 1. Reverse FK updates
    for (const update of fkUpdateLog) {
      if (!update.recordIds || update.recordIds.length === 0) continue;

      // Validate table/column against known FK refs to prevent injection
      const refKey = `${update.table}.${update.column}`;
      if (!knownRefs.has(refKey)) {
        logger.warn(`[StaffMerge:Undo] Unknown FK ref ${refKey}, skipping`);
        continue;
      }

      // For each recorded FK update, revert to secondary user
      for (const recordId of update.recordIds) {
        try {
          await tx.execute(
            sql`UPDATE ${sql.raw(`"${update.table}"`)} SET ${sql.raw(`"${update.column}"`)} = ${merge.secondaryUserId} WHERE id = ${recordId}`
          );
        } catch (err) {
          // Record may have been deleted since merge; log and continue
          logger.warn(
            `[StaffMerge:Undo] Could not revert ${update.table}.${update.column} for record ${recordId}: ${err}`
          );
        }
      }
    }

    // 2. Reverse role merges
    for (const rm of roleMergeLog) {
      if (rm.action === "transferred") {
        // Transfer back to secondary user
        try {
          await tx
            .update(userHospitalRoles)
            .set({ userId: merge.secondaryUserId })
            .where(eq(userHospitalRoles.id, rm.roleId));
        } catch (err) {
          logger.warn(
            `[StaffMerge:Undo] Could not revert role transfer ${rm.roleId}: ${err}`
          );
        }
      } else if (rm.action === "merged") {
        const details = rm.details as any;
        try {
          // Restore primary role's original isBookable
          if (details.primaryRoleId && details.primaryOriginalBookable !== undefined) {
            await tx
              .update(userHospitalRoles)
              .set({ isBookable: details.primaryOriginalBookable })
              .where(eq(userHospitalRoles.id, details.primaryRoleId));
          }

          // Re-create secondary's deleted role with stored values
          await tx.insert(userHospitalRoles).values({
            id: rm.roleId,
            userId: merge.secondaryUserId,
            hospitalId: merge.hospitalId,
            unitId: details.unitId,
            role: details.role,
            isBookable: details.secondaryBookable ?? false,
            isDefaultLogin: details.secondaryIsDefaultLogin ?? false,
            availabilityMode: details.secondaryAvailabilityMode ?? "always_available",
          });
        } catch (err) {
          logger.warn(
            `[StaffMerge:Undo] Could not restore merged role ${rm.roleId}: ${err}`
          );
        }
      }
    }

    // 3. Unlink orphans
    for (const orphan of linkedOrphansLog) {
      try {
        await tx
          .update(surgeryStaffEntries)
          .set({ userId: null })
          .where(eq(surgeryStaffEntries.id, orphan.recordId));
      } catch (err) {
        logger.warn(
          `[StaffMerge:Undo] Could not unlink orphan ${orphan.recordId}: ${err}`
        );
      }
    }

    // 4. Restore secondary user from snapshot
    const restoreFields: Record<string, any> = {
      archivedAt: secondarySnapshot.archivedAt,
      adminNotes: secondarySnapshot.adminNotes,
      updatedAt: new Date(),
    };
    await tx
      .update(users)
      .set(restoreFields)
      .where(eq(users.id, merge.secondaryUserId));

    // 5. Restore primary user fields that were changed
    const primaryRestoreFields: Record<string, any> = {};
    for (const [field, choice] of Object.entries(fieldChoicesLog)) {
      if (choice.chosen === "secondary") {
        primaryRestoreFields[field] = (primarySnapshot as any)[field];
      }
    }
    // Also restore login fields if they were inherited
    if (
      secondarySnapshot.canLogin &&
      !primarySnapshot.canLogin
    ) {
      primaryRestoreFields.canLogin = primarySnapshot.canLogin;
      primaryRestoreFields.passwordHash = primarySnapshot.passwordHash;
    }
    if (Object.keys(primaryRestoreFields).length > 0) {
      primaryRestoreFields.updatedAt = new Date();
      await tx
        .update(users)
        .set(primaryRestoreFields)
        .where(eq(users.id, merge.primaryUserId));
    }

    // 6. Mark merge as undone
    await tx
      .update(staffMerges)
      .set({
        status: "undone",
        undoneAt: new Date(),
        undoneBy,
      })
      .where(eq(staffMerges.id, mergeId));

    logger.info(
      `[StaffMerge] Undid merge ${mergeId} (primary: ${merge.primaryUserId}, secondary: ${merge.secondaryUserId})`
    );
  });
}

