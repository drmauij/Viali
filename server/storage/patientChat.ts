import { db } from "../db";
import { eq, and, desc, isNull, sql, ne } from "drizzle-orm";
import {
  patientMessages,
  patients,
  users,
  type PatientMessage,
} from "@shared/schema";

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
      pm.patient_id,
      pm.hospital_id,
      pm.conversation_id,
      p.first_name AS patient_name,
      p.surname AS patient_surname,
      last_msg.message AS last_message,
      last_msg.created_at AS last_message_at,
      last_msg.direction AS last_message_direction,
      COALESCE(unread.cnt, 0)::int AS unread_count
    FROM (
      SELECT DISTINCT patient_id, hospital_id, conversation_id
      FROM patient_messages
      WHERE hospital_id = ${hospitalId}
        AND direction = 'inbound'
    ) pm
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
