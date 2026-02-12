import { db } from "../db";
import { eq, and, desc, asc, sql, isNull } from "drizzle-orm";
import {
  chatConversations,
  chatParticipants,
  chatMessages,
  chatMentions,
  chatAttachments,
  chatNotifications,
  users,
  type User,
  type ChatConversation,
  type InsertChatConversation,
  type ChatParticipant,
  type InsertChatParticipant,
  type ChatMessage,
  type InsertChatMessage,
  type ChatMention,
  type InsertChatMention,
  type ChatAttachment,
  type InsertChatAttachment,
  type ChatNotification,
  type InsertChatNotification,
} from "@shared/schema";

export async function getConversations(userId: string, hospitalId: string): Promise<(ChatConversation & { 
  participants: (ChatParticipant & { user: User })[]; 
  lastMessage?: ChatMessage; 
  unreadCount: number 
})[]> {
  const userParticipations = await db
    .select()
    .from(chatParticipants)
    .innerJoin(chatConversations, eq(chatParticipants.conversationId, chatConversations.id))
    .where(and(
      eq(chatParticipants.userId, userId),
      eq(chatConversations.hospitalId, hospitalId)
    ))
    .orderBy(desc(chatConversations.lastMessageAt));

  const results = [];
  for (const row of userParticipations) {
    const conversation = row.chat_conversations;
    const userParticipant = row.chat_participants;

    const allParticipants = await db
      .select()
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.conversationId, conversation.id));

    const [lastMessage] = await db
      .select()
      .from(chatMessages)
      .where(and(
        eq(chatMessages.conversationId, conversation.id),
        isNull(chatMessages.deletedAt)
      ))
      .orderBy(desc(chatMessages.createdAt))
      .limit(1);

    const unreadMessages = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.conversationId, conversation.id),
        isNull(chatMessages.deletedAt),
        userParticipant.lastReadAt 
          ? sql`${chatMessages.createdAt} > ${userParticipant.lastReadAt}`
          : sql`1=1`
      ));

    results.push({
      ...conversation,
      participants: allParticipants.map(p => ({
        ...p.chat_participants,
        user: p.users
      })),
      lastMessage,
      unreadCount: unreadMessages[0]?.count || 0
    });
  }

  return results;
}

export async function getConversation(id: string): Promise<(ChatConversation & { 
  participants: (ChatParticipant & { user: User })[] 
}) | undefined> {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id));

  if (!conversation) return undefined;

  const participants = await db
    .select()
    .from(chatParticipants)
    .innerJoin(users, eq(chatParticipants.userId, users.id))
    .where(eq(chatParticipants.conversationId, id));

  return {
    ...conversation,
    participants: participants.map(p => ({
      ...p.chat_participants,
      user: p.users
    }))
  };
}

export async function createConversation(conversation: InsertChatConversation & { creatorId: string }): Promise<ChatConversation> {
  const [created] = await db
    .insert(chatConversations)
    .values(conversation)
    .returning();

  await db.insert(chatParticipants).values({
    conversationId: created.id,
    userId: conversation.creatorId,
    role: "owner"
  });

  return created;
}

export async function updateConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
  const [updated] = await db
    .update(chatConversations)
    .set(updates)
    .where(eq(chatConversations.id, id))
    .returning();
  return updated;
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(chatConversations).where(eq(chatConversations.id, id));
}

export async function getOrCreateSelfConversation(userId: string, hospitalId: string): Promise<ChatConversation> {
  const [existing] = await db
    .select()
    .from(chatConversations)
    .innerJoin(chatParticipants, eq(chatConversations.id, chatParticipants.conversationId))
    .where(and(
      eq(chatConversations.hospitalId, hospitalId),
      eq(chatConversations.scopeType, "self"),
      eq(chatConversations.creatorId, userId),
      eq(chatParticipants.userId, userId)
    ));

  if (existing) {
    return existing.chat_conversations;
  }

  return createConversation({
    hospitalId,
    creatorId: userId,
    scopeType: "self",
    title: null,
    unitId: null,
    patientId: null
  });
}

export async function findDirectConversation(userId1: string, userId2: string, hospitalId: string): Promise<ChatConversation | undefined> {
  const user1Convos = await db
    .select({ conversationId: chatParticipants.conversationId })
    .from(chatParticipants)
    .innerJoin(chatConversations, eq(chatParticipants.conversationId, chatConversations.id))
    .where(and(
      eq(chatParticipants.userId, userId1),
      eq(chatConversations.hospitalId, hospitalId),
      eq(chatConversations.scopeType, "direct")
    ));

  for (const { conversationId } of user1Convos) {
    const participants = await db
      .select()
      .from(chatParticipants)
      .where(eq(chatParticipants.conversationId, conversationId));

    if (participants.length === 2 && 
        participants.some(p => p.userId === userId1) && 
        participants.some(p => p.userId === userId2)) {
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId));
      return conv;
    }
  }
  return undefined;
}

export async function addParticipant(conversationId: string, userId: string, role: string = "member"): Promise<ChatParticipant> {
  const [created] = await db
    .insert(chatParticipants)
    .values({ conversationId, userId, role: role as "owner" | "admin" | "member" })
    .onConflictDoNothing()
    .returning();
  
  if (!created) {
    const [existing] = await db
      .select()
      .from(chatParticipants)
      .where(and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.userId, userId)
      ));
    return existing;
  }
  return created;
}

export async function removeParticipant(conversationId: string, userId: string): Promise<void> {
  await db
    .delete(chatParticipants)
    .where(and(
      eq(chatParticipants.conversationId, conversationId),
      eq(chatParticipants.userId, userId)
    ));
}

export async function updateParticipant(id: string, updates: Partial<ChatParticipant>): Promise<ChatParticipant> {
  const [updated] = await db
    .update(chatParticipants)
    .set(updates)
    .where(eq(chatParticipants.id, id))
    .returning();
  return updated;
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  await db
    .update(chatParticipants)
    .set({ lastReadAt: new Date() })
    .where(and(
      eq(chatParticipants.conversationId, conversationId),
      eq(chatParticipants.userId, userId)
    ));
}

export async function getMessages(conversationId: string, limit: number = 50, before?: Date): Promise<(ChatMessage & { 
  sender: User; 
  mentions: ChatMention[]; 
  attachments: ChatAttachment[] 
})[]> {
  let query = db
    .select()
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.senderId, users.id))
    .where(and(
      eq(chatMessages.conversationId, conversationId),
      isNull(chatMessages.deletedAt),
      before ? sql`${chatMessages.createdAt} < ${before}` : sql`1=1`
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  const messages = await query;

  const results = [];
  for (const row of messages) {
    const mentions = await db
      .select()
      .from(chatMentions)
      .where(eq(chatMentions.messageId, row.chat_messages.id));

    const attachments = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.messageId, row.chat_messages.id));

    results.push({
      ...row.chat_messages,
      sender: row.users,
      mentions,
      attachments
    });
  }

  return results.reverse();
}

export async function getMessage(id: string): Promise<ChatMessage | undefined> {
  const [message] = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.id, id));
  return message;
}

export async function createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage> {
  const [created] = await db
    .insert(chatMessages)
    .values(message)
    .returning();

  await db
    .update(chatConversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatConversations.id, message.conversationId));

  return created;
}

export async function updateMessage(id: string, content: string): Promise<ChatMessage> {
  const [updated] = await db
    .update(chatMessages)
    .set({ content, editedAt: new Date() })
    .where(eq(chatMessages.id, id))
    .returning();
  return updated;
}

export async function deleteMessage(id: string): Promise<ChatMessage> {
  const [deleted] = await db
    .update(chatMessages)
    .set({ deletedAt: new Date() })
    .where(eq(chatMessages.id, id))
    .returning();
  return deleted;
}

export async function createMention(mention: InsertChatMention): Promise<ChatMention> {
  const [created] = await db
    .insert(chatMentions)
    .values(mention)
    .returning();
  return created;
}

export async function getMentionsForUser(userId: string, hospitalId: string, unreadOnly: boolean = false): Promise<(ChatMention & { message: ChatMessage & { sender?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } } })[]> {
  const mentions = await db
    .select()
    .from(chatMentions)
    .innerJoin(chatMessages, eq(chatMentions.messageId, chatMessages.id))
    .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
    .leftJoin(users, eq(chatMessages.senderId, users.id))
    .where(and(
      eq(chatMentions.mentionedUserId, userId),
      eq(chatConversations.hospitalId, hospitalId),
      isNull(chatMessages.deletedAt)
    ))
    .orderBy(desc(chatMentions.createdAt));

  return mentions.map(row => ({
    ...row.chat_mentions,
    message: {
      ...row.chat_messages,
      sender: row.users ? {
        id: row.users.id,
        firstName: row.users.firstName,
        lastName: row.users.lastName,
        email: row.users.email
      } : undefined
    }
  }));
}

export async function createAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment> {
  const [created] = await db
    .insert(chatAttachments)
    .values(attachment)
    .returning();
  return created;
}

export async function updateAttachment(id: string, updates: Partial<ChatAttachment>): Promise<ChatAttachment> {
  const [updated] = await db
    .update(chatAttachments)
    .set(updates)
    .where(eq(chatAttachments.id, id))
    .returning();
  return updated;
}

export async function getAttachment(id: string): Promise<ChatAttachment | undefined> {
  const [attachment] = await db
    .select()
    .from(chatAttachments)
    .where(eq(chatAttachments.id, id));
  return attachment;
}

export async function getConversationAttachments(conversationId: string): Promise<ChatAttachment[]> {
  return await db
    .select({
      id: chatAttachments.id,
      messageId: chatAttachments.messageId,
      storageKey: chatAttachments.storageKey,
      filename: chatAttachments.filename,
      mimeType: chatAttachments.mimeType,
      sizeBytes: chatAttachments.sizeBytes,
      thumbnailKey: chatAttachments.thumbnailKey,
      savedToPatientId: chatAttachments.savedToPatientId,
      createdAt: chatAttachments.createdAt,
    })
    .from(chatAttachments)
    .innerJoin(chatMessages, eq(chatAttachments.messageId, chatMessages.id))
    .where(eq(chatMessages.conversationId, conversationId));
}

export async function createNotification(notification: InsertChatNotification): Promise<ChatNotification> {
  const [created] = await db
    .insert(chatNotifications)
    .values(notification)
    .returning();
  return created;
}

export async function getUnreadNotifications(userId: string, hospitalId?: string): Promise<ChatNotification[]> {
  if (hospitalId) {
    return await db
      .select({
        id: chatNotifications.id,
        userId: chatNotifications.userId,
        conversationId: chatNotifications.conversationId,
        messageId: chatNotifications.messageId,
        notificationType: chatNotifications.notificationType,
        emailSent: chatNotifications.emailSent,
        emailSentAt: chatNotifications.emailSentAt,
        read: chatNotifications.read,
        createdAt: chatNotifications.createdAt,
      })
      .from(chatNotifications)
      .innerJoin(chatConversations, eq(chatNotifications.conversationId, chatConversations.id))
      .where(and(
        eq(chatNotifications.userId, userId),
        eq(chatNotifications.read, false),
        eq(chatConversations.hospitalId, hospitalId)
      ))
      .orderBy(desc(chatNotifications.createdAt));
  }
  return await db
    .select()
    .from(chatNotifications)
    .where(and(
      eq(chatNotifications.userId, userId),
      eq(chatNotifications.read, false)
    ))
    .orderBy(desc(chatNotifications.createdAt));
}

export async function getUserNotificationsForConversation(userId: string, conversationId: string, notificationType?: string): Promise<ChatNotification[]> {
  const conditions = [
    eq(chatNotifications.userId, userId),
    eq(chatNotifications.conversationId, conversationId)
  ];
  if (notificationType) {
    conditions.push(eq(chatNotifications.notificationType, notificationType));
  }
  return await db
    .select()
    .from(chatNotifications)
    .where(and(...conditions));
}

export async function markNotificationRead(id: string): Promise<ChatNotification> {
  const [updated] = await db
    .update(chatNotifications)
    .set({ read: true })
    .where(eq(chatNotifications.id, id))
    .returning();
  return updated;
}

export async function markNotificationEmailSent(id: string): Promise<ChatNotification> {
  const [updated] = await db
    .update(chatNotifications)
    .set({ emailSent: true, emailSentAt: new Date() })
    .where(eq(chatNotifications.id, id))
    .returning();
  return updated;
}

export async function getUnsentEmailNotifications(limit: number = 50): Promise<(ChatNotification & { user: User; conversation: ChatConversation })[]> {
  const notifications = await db
    .select()
    .from(chatNotifications)
    .innerJoin(users, eq(chatNotifications.userId, users.id))
    .innerJoin(chatConversations, eq(chatNotifications.conversationId, chatConversations.id))
    .where(eq(chatNotifications.emailSent, false))
    .orderBy(asc(chatNotifications.createdAt))
    .limit(limit);

  return notifications.map(row => ({
    ...row.chat_notifications,
    user: row.users,
    conversation: row.chat_conversations
  }));
}
