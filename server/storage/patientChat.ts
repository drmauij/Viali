import { db } from "../db";
import { eq, and, desc, isNull, sql, ne } from "drizzle-orm";
import {
  patientMessages,
  patientChatArchives,
  patients,
  users,
  type PatientMessage,
} from "@shared/schema";

import { getQuestionnaireLinksForPatient } from "./questionnaires";

// ========== PATIENT CHAT OPERATIONS ==========

export interface PatientConversation {
  patientId: string;
  hospitalId: string;
  conversationId: string;
  patientName: string;
  patientSurname: string;
  lastMessage: string;
  lastMessageAt: Date;
  lastMessageDirection: string;
  unreadCount: number;
}

/**
 * Get all patient conversations that have at least one inbound message.
 * Returns conversations sorted by last activity.
 */
export async function getPatientConversations(hospitalId: string): Promise<PatientConversation[]> {
  const rows = await db.execute(sql`
    SELECT
      pm.patient_id AS "patientId",
      pm.hospital_id AS "hospitalId",
      pm.conversation_id AS "conversationId",
      p.first_name AS "patientName",
      p.surname AS "patientSurname",
      last_msg.message AS "lastMessage",
      last_msg.created_at AS "lastMessageAt",
      last_msg.direction AS "lastMessageDirection",
      COALESCE(unread.cnt, 0)::int AS "unreadCount"
    FROM (
      SELECT DISTINCT patient_id, hospital_id, conversation_id
      FROM patient_messages
      WHERE hospital_id = ${hospitalId}
        AND direction = 'inbound'
    ) pm
    LEFT JOIN patient_chat_archives pca
      ON pca.hospital_id = pm.hospital_id AND pca.patient_id = pm.patient_id
    JOIN patients p ON p.id = pm.patient_id
    JOIN LATERAL (
      SELECT message, created_at, direction
      FROM patient_messages
      WHERE conversation_id = pm.conversation_id
      ORDER BY created_at DESC
      LIMIT 1
    ) last_msg ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS cnt
      FROM patient_messages
      WHERE conversation_id = pm.conversation_id
        AND direction = 'inbound'
        AND read_by_staff_at IS NULL
    ) unread ON true
    WHERE pca.id IS NULL
    ORDER BY last_msg.created_at DESC
  `);

  return rows.rows as unknown as PatientConversation[];
}

/**
 * Get ALL messages for a patient (full history including automatic) -- for clinic staff view.
 */
export async function getConversationMessages(hospitalId: string, patientId: string): Promise<(PatientMessage & { senderFirstName?: string | null; senderLastName?: string | null })[]> {
  const rows = await db
    .select({
      id: patientMessages.id,
      hospitalId: patientMessages.hospitalId,
      patientId: patientMessages.patientId,
      sentBy: patientMessages.sentBy,
      channel: patientMessages.channel,
      recipient: patientMessages.recipient,
      message: patientMessages.message,
      status: patientMessages.status,
      isAutomatic: patientMessages.isAutomatic,
      messageType: patientMessages.messageType,
      direction: patientMessages.direction,
      conversationId: patientMessages.conversationId,
      readByStaffAt: patientMessages.readByStaffAt,
      readByPatientAt: patientMessages.readByPatientAt,
      createdAt: patientMessages.createdAt,
      senderFirstName: users.firstName,
      senderLastName: users.lastName,
    })
    .from(patientMessages)
    .leftJoin(users, eq(patientMessages.sentBy, users.id))
    .where(
      and(
        eq(patientMessages.hospitalId, hospitalId),
        eq(patientMessages.patientId, patientId)
      )
    )
    .orderBy(patientMessages.createdAt);

  return rows;
}

/**
 * Get messages visible to patient (manual outbound + all inbound, excludes auto messages).
 */
export async function getPortalMessages(hospitalId: string, patientId: string): Promise<PatientMessage[]> {
  const rows = await db
    .select()
    .from(patientMessages)
    .where(
      and(
        eq(patientMessages.hospitalId, hospitalId),
        eq(patientMessages.patientId, patientId),
        sql`(
          ${patientMessages.direction} = 'inbound'
          OR (${patientMessages.direction} = 'outbound' AND ${patientMessages.messageType} = 'manual')
        )`
      )
    )
    .orderBy(patientMessages.createdAt);

  return rows;
}

/**
 * Create an inbound message from a patient via the portal.
 */
export async function createInboundMessage(
  hospitalId: string,
  patientId: string,
  message: string
): Promise<PatientMessage> {
  const [created] = await db
    .insert(patientMessages)
    .values({
      hospitalId,
      patientId,
      channel: "portal",
      recipient: "portal",
      message,
      direction: "inbound",
      conversationId: `${hospitalId}:${patientId}`,
      status: "delivered",
      messageType: "manual",
    })
    .returning();
  return created;
}

/**
 * Create an outbound chat message from staff to a patient via the chat interface.
 */
export async function createOutboundChatMessage(
  hospitalId: string,
  patientId: string,
  sentBy: string,
  message: string
): Promise<PatientMessage> {
  const [created] = await db
    .insert(patientMessages)
    .values({
      hospitalId,
      patientId,
      sentBy,
      channel: "portal",
      recipient: "portal",
      message,
      direction: "outbound",
      conversationId: `${hospitalId}:${patientId}`,
      status: "sent",
      messageType: "manual",
    })
    .returning();
  return created;
}

/**
 * Mark all unread inbound messages in a conversation as read by staff.
 */
export async function markConversationReadByStaff(hospitalId: string, patientId: string): Promise<void> {
  await db
    .update(patientMessages)
    .set({ readByStaffAt: new Date() })
    .where(
      and(
        eq(patientMessages.hospitalId, hospitalId),
        eq(patientMessages.patientId, patientId),
        eq(patientMessages.direction, "inbound"),
        isNull(patientMessages.readByStaffAt)
      )
    );
}

/**
 * Mark all unread outbound messages in a conversation as read by patient.
 */
export async function markConversationReadByPatient(hospitalId: string, patientId: string): Promise<void> {
  await db
    .update(patientMessages)
    .set({ readByPatientAt: new Date() })
    .where(
      and(
        eq(patientMessages.hospitalId, hospitalId),
        eq(patientMessages.patientId, patientId),
        eq(patientMessages.direction, "outbound"),
        isNull(patientMessages.readByPatientAt)
      )
    );
}

/**
 * Count of conversations with unread inbound messages for a hospital.
 */
export async function getUnreadPatientConversationCount(hospitalId: string): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(DISTINCT conversation_id)::int AS count
    FROM patient_messages
    WHERE hospital_id = ${hospitalId}
      AND direction = 'inbound'
      AND read_by_staff_at IS NULL
  `);
  return (result.rows[0] as any)?.count ?? 0;
}

/**
 * Check if patient already has OTHER unread outbound manual messages (notified or not).
 * If yes, we skip sending another SMS — either a notification was already sent,
 * or there's a pending message that will be included in the same notification batch.
 * @param excludeMessageId - exclude this message from the check (the one we just created)
 */
export async function hasOtherUnreadOutboundMessages(hospitalId: string, patientId: string, excludeMessageId?: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM patient_messages
    WHERE hospital_id = ${hospitalId}
      AND patient_id = ${patientId}
      AND direction = 'outbound'
      AND message_type = 'manual'
      AND read_by_patient_at IS NULL
      ${excludeMessageId ? sql`AND id != ${excludeMessageId}` : sql``}
  `);
  return ((result.rows[0] as any)?.count ?? 0) > 0;
}

/**
 * Mark all pending outbound messages as 'notified' (SMS notification was sent).
 */
export async function markMessagesAsNotified(hospitalId: string, patientId: string): Promise<void> {
  await db
    .update(patientMessages)
    .set({ status: "notified" })
    .where(
      and(
        eq(patientMessages.hospitalId, hospitalId),
        eq(patientMessages.patientId, patientId),
        eq(patientMessages.direction, "outbound"),
        eq(patientMessages.messageType, "manual"),
        sql`${patientMessages.status} = 'sent'`,
        isNull(patientMessages.readByPatientAt)
      )
    );
}

/**
 * Get the patient's portal token for building the portal URL.
 */
export async function getPatientPortalToken(patientId: string): Promise<string | null> {
  const links = await getQuestionnaireLinksForPatient(patientId);
  // Find the most recent active (non-expired) link
  const activeLink = links.find(l => l.status !== 'expired' && new Date(l.expiresAt) > new Date());
  return activeLink?.token ?? null;
}

/**
 * Get the patient's phone number.
 */
export async function getPatientPhone(patientId: string): Promise<string | null> {
  const [patient] = await db
    .select({ phone: patients.phone })
    .from(patients)
    .where(eq(patients.id, patientId));
  return patient?.phone ?? null;
}

/**
 * Archive a patient chat conversation (hide from staff chat list).
 */
export async function archivePatientChat(hospitalId: string, patientId: string, userId: string): Promise<void> {
  // Upsert: delete existing then insert to reset timestamp
  await db.delete(patientChatArchives).where(
    and(
      eq(patientChatArchives.hospitalId, hospitalId),
      eq(patientChatArchives.patientId, patientId)
    )
  );
  await db.insert(patientChatArchives).values({
    hospitalId,
    patientId,
    archivedBy: userId,
  });
}

/**
 * Unarchive a patient chat conversation (show in staff chat list again).
 */
export async function unarchivePatientChat(hospitalId: string, patientId: string): Promise<void> {
  await db.delete(patientChatArchives).where(
    and(
      eq(patientChatArchives.hospitalId, hospitalId),
      eq(patientChatArchives.patientId, patientId)
    )
  );
}

/**
 * Search patients by name for starting a new chat.
 */
export async function searchPatientsForChat(hospitalId: string, query: string): Promise<{ id: string; firstName: string | null; surname: string | null; birthday: string }[]> {
  const rows = await db
    .select({
      id: patients.id,
      firstName: patients.firstName,
      surname: patients.surname,
      birthday: patients.birthday,
    })
    .from(patients)
    .where(
      and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
        sql`(
          LOWER(${patients.firstName}) LIKE ${`%${query.toLowerCase()}%`}
          OR LOWER(${patients.surname}) LIKE ${`%${query.toLowerCase()}%`}
        )`
      )
    )
    .limit(10);
  return rows;
}
