import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, requireHospitalAccess, getUserUnitForHospital, getActiveUnitIdFromRequest } from "../utils";
import { insertChatConversationSchema, insertChatMessageSchema, insertChatMentionSchema, insertChatAttachmentSchema } from "@shared/schema";
import { z } from "zod";
import { broadcastChatMessage, broadcastChatMessageDeleted, broadcastChatMessageEdited, notifyUserOfNewMessage } from "../socket";
import { ObjectStorageService, ObjectNotFoundError, ObjectPermission } from "../objectStorage";
import { sendNewMessageEmail, sendMentionEmail, sendNewConversationEmail } from "../email";
import logger from "../logger";

const createConversationSchema = z.object({
  scopeType: z.enum(['self', 'direct', 'unit', 'hospital']),
  title: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  patientId: z.string().optional().nullable(),
  participantIds: z.array(z.string()).optional()
});

const createMessageSchema = z.object({
  content: z.string().min(1, "Message content is required"),
  messageType: z.enum(['text', 'file', 'image', 'system']).optional().default('text'),
  replyToMessageId: z.string().optional().nullable(),
  mentions: z.array(z.object({
    type: z.enum(['user', 'unit', 'patient']),
    userId: z.string().optional().nullable(),
    unitId: z.string().optional().nullable(),
    patientId: z.string().optional().nullable()
  })).optional(),
  attachments: z.array(z.object({
    storageKey: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    thumbnailKey: z.string().optional().nullable()
  })).optional()
});

const updateConversationSchema = z.object({
  title: z.string().optional()
});

const updateMessageSchema = z.object({
  content: z.string().min(1, "Message content is required")
});

const addParticipantSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  role: z.enum(['owner', 'admin', 'member']).optional().default('member')
});

const saveToPatientSchema = z.object({
  patientId: z.string().min(1, "patientId is required")
});

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

const router = Router();

async function verifyConversationAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user.id;
    const conversationId = req.params.conversationId;
    
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied to this conversation" });
    }
    
    (req as any).conversation = conversation;
    next();
  } catch (error) {
    logger.error("Error verifying conversation access:", error);
    res.status(500).json({ message: "Failed to verify conversation access" });
  }
}

router.get('/api/chat/:hospitalId/conversations', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const conversations = await storage.getConversations(userId, hospitalId);
    res.json(conversations);
  } catch (error) {
    logger.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

router.get('/api/chat/:hospitalId/conversations/self', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const conversation = await storage.getOrCreateSelfConversation(userId, hospitalId);
    const fullConversation = await storage.getConversation(conversation.id);
    res.json(fullConversation);
  } catch (error) {
    logger.error("Error fetching/creating self conversation:", error);
    res.status(500).json({ message: "Failed to get self conversation" });
  }
});

router.post('/api/chat/:hospitalId/conversations', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const validated = createConversationSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { scopeType, title, unitId: targetUnitId, patientId, participantIds } = validated.data;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const userUnitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!userUnitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (scopeType === 'direct' && participantIds && participantIds.length === 1) {
      const existingConvo = await storage.findDirectConversation(userId, participantIds[0], hospitalId);
      if (existingConvo) {
        const fullConversation = await storage.getConversation(existingConvo.id);
        return res.json(fullConversation);
      }
    }
    
    const conversation = await storage.createConversation({
      hospitalId,
      creatorId: userId,
      scopeType,
      title: title || null,
      unitId: targetUnitId || null,
      patientId: patientId || null
    });
    
    if (participantIds && Array.isArray(participantIds)) {
      for (const participantId of participantIds) {
        if (participantId !== userId) {
          await storage.addParticipant(conversation.id, participantId, "member");
          
          await storage.createNotification({
            userId: participantId,
            conversationId: conversation.id,
            messageId: null,
            notificationType: "new_conversation",
            emailSent: false,
            read: false
          });
          // Email will be sent with the first message, not here
        }
      }
    }
    
    const fullConversation = await storage.getConversation(conversation.id);
    res.status(201).json(fullConversation);
  } catch (error) {
    logger.error("Error creating conversation:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
});

router.get('/api/chat/conversations/:conversationId', isAuthenticated, verifyConversationAccess, async (req: any, res) => {
  try {
    res.json(req.conversation);
  } catch (error) {
    logger.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Failed to fetch conversation" });
  }
});

router.patch('/api/chat/conversations/:conversationId', isAuthenticated, verifyConversationAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    
    const validated = updateConversationSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { title } = validated.data;
    const updated = await storage.updateConversation(conversationId, { title });
    const fullConversation = await storage.getConversation(conversationId);
    res.json(fullConversation);
  } catch (error) {
    logger.error("Error updating conversation:", error);
    res.status(500).json({ message: "Failed to update conversation" });
  }
});

router.delete('/api/chat/conversations/:conversationId', isAuthenticated, verifyConversationAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const conversation = req.conversation;
    
    const userParticipant = conversation.participants.find((p: any) => p.userId === userId);
    if (userParticipant?.role !== 'owner') {
      return res.status(403).json({ message: "Only the conversation owner can delete it" });
    }
    
    // Clean up attachments from object storage before deleting conversation
    try {
      const attachments = await storage.getConversationAttachments(conversationId);
      if (attachments.length > 0) {
        const objectStorageService = new ObjectStorageService();
        for (const attachment of attachments) {
          try {
            await objectStorageService.deleteObject(attachment.storageKey);
            if (attachment.thumbnailKey) {
              await objectStorageService.deleteObject(attachment.thumbnailKey);
            }
          } catch (deleteError) {
            // Log but continue - don't fail the whole delete if a file is already gone
            logger.warn(`Failed to delete attachment ${attachment.storageKey}:`, deleteError);
          }
        }
      }
    } catch (cleanupError) {
      logger.error("Error cleaning up attachments:", cleanupError);
      // Continue with conversation deletion even if cleanup fails
    }
    
    await storage.deleteConversation(conversationId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting conversation:", error);
    res.status(500).json({ message: "Failed to delete conversation" });
  }
});

router.post('/api/chat/conversations/:conversationId/participants', isAuthenticated, verifyConversationAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const conversation = req.conversation;
    
    const validated = addParticipantSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { userId: newUserId, role } = validated.data;
    
    const userParticipant = conversation.participants.find((p: any) => p.userId === req.user.id);
    if (!['owner', 'admin'].includes(userParticipant?.role)) {
      return res.status(403).json({ message: "Only owners/admins can add participants" });
    }
    
    const participant = await storage.addParticipant(conversationId, newUserId, role);
    
    await storage.createNotification({
      userId: newUserId,
      conversationId,
      messageId: null,
      notificationType: "new_conversation",
      emailSent: false,
      read: false
    });
    // Email will be sent with the first message the user receives, not here
    
    const fullConversation = await storage.getConversation(conversationId);
    res.status(201).json(fullConversation);
  } catch (error) {
    logger.error("Error adding participant:", error);
    res.status(500).json({ message: "Failed to add participant" });
  }
});

router.delete('/api/chat/conversations/:conversationId/participants/:userId', isAuthenticated, verifyConversationAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { conversationId, userId: targetUserId } = req.params;
    const currentUserId = req.user.id;
    const conversation = req.conversation;
    
    const currentUserParticipant = conversation.participants.find((p: any) => p.userId === currentUserId);
    
    if (targetUserId !== currentUserId && !['owner', 'admin'].includes(currentUserParticipant?.role)) {
      return res.status(403).json({ message: "Only owners/admins can remove other participants" });
    }
    
    await storage.removeParticipant(conversationId, targetUserId);
    
    if (targetUserId === currentUserId) {
      return res.json({ success: true, left: true });
    }
    
    const fullConversation = await storage.getConversation(conversationId);
    res.json(fullConversation);
  } catch (error) {
    logger.error("Error removing participant:", error);
    res.status(500).json({ message: "Failed to remove participant" });
  }
});

router.post('/api/chat/conversations/:conversationId/read', isAuthenticated, verifyConversationAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    await storage.markConversationRead(conversationId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error marking conversation as read:", error);
    res.status(500).json({ message: "Failed to mark conversation as read" });
  }
});

router.get('/api/chat/conversations/:conversationId/messages', isAuthenticated, verifyConversationAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;
    
    const messages = await storage.getMessages(conversationId, limit, before);
    res.json(messages);
  } catch (error) {
    logger.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

router.post('/api/chat/conversations/:conversationId/messages', isAuthenticated, verifyConversationAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const validated = createMessageSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { content, messageType, replyToMessageId, mentions, attachments } = validated.data;
    
    const message = await storage.createMessage({
      conversationId,
      senderId: userId,
      content,
      messageType,
      replyToMessageId: replyToMessageId || null
    });
    
    if (mentions && Array.isArray(mentions)) {
      for (const mention of mentions) {
        await storage.createMention({
          messageId: message.id,
          mentionType: mention.type,
          mentionedUserId: mention.userId || null,
          mentionedUnitId: mention.unitId || null,
          mentionedPatientId: mention.patientId || null
        });
        
        if (mention.type === 'user' && mention.userId && mention.userId !== userId) {
          // Check if this user has already received a mention email in this conversation
          const existingMentionNotifications = await storage.getUserNotificationsForConversation(
            mention.userId, 
            conversationId, 
            "mention"
          );
          const hasReceivedMentionEmail = existingMentionNotifications.some(n => n.emailSent);
          
          await storage.createNotification({
            userId: mention.userId,
            conversationId,
            messageId: message.id,
            notificationType: "mention",
            emailSent: !hasReceivedMentionEmail, // Only mark as sent if we're sending now
            read: false
          });
          
          // Only send email for the FIRST mention in this conversation
          if (!hasReceivedMentionEmail) {
            const mentionedUser = await storage.getUser(mention.userId);
            if (mentionedUser?.email) {
              const senderName = req.user.firstName 
                ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() 
                : 'Someone';
              sendMentionEmail(mentionedUser.email, senderName, content.substring(0, 200), req.conversation?.title || undefined, conversationId)
                .catch(err => logger.error('Failed to send mention email:', err));
            }
          }
        }
      }
    }
    
    if (attachments && Array.isArray(attachments)) {
      for (const attachment of attachments) {
        await storage.createAttachment({
          messageId: message.id,
          storageKey: attachment.storageKey,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          thumbnailKey: attachment.thumbnailKey || null,
          savedToPatientId: null
        });
      }
    }
    
    const conversation = req.conversation;
    const senderName = req.user.firstName 
      ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() 
      : 'Someone';
    
    for (const participant of conversation.participants) {
      if (participant.userId !== userId) {
        // Check if this user has already received an email for this conversation (first message)
        const existingNotifications = await storage.getUserNotificationsForConversation(
          participant.userId, 
          conversationId, 
          "new_message"
        );
        const existingConvoNotifications = await storage.getUserNotificationsForConversation(
          participant.userId, 
          conversationId, 
          "new_conversation"
        );
        const hasReceivedEmail = existingNotifications.some(n => n.emailSent) || 
                                  existingConvoNotifications.some(n => n.emailSent);
        
        await storage.createNotification({
          userId: participant.userId,
          conversationId,
          messageId: message.id,
          notificationType: "new_message",
          emailSent: !hasReceivedEmail, // Only mark as sent if we're sending now
          read: false
        });
        
        // Only send email for the FIRST message in this conversation
        if (!hasReceivedEmail) {
          const participantUser = participant.user || await storage.getUser(participant.userId);
          if (participantUser?.email) {
            sendNewMessageEmail(participantUser.email, senderName, content.substring(0, 200), conversation?.title || undefined, conversationId)
              .catch(err => logger.error('Failed to send new message email:', err));
          }
        }
      }
    }
    
    const fullMessages = await storage.getMessages(conversationId, 1);
    const fullMessage = fullMessages.find(m => m.id === message.id) || message;
    
    broadcastChatMessage({
      conversationId,
      message: {
        id: fullMessage.id,
        senderId: fullMessage.senderId,
        content: fullMessage.content,
        messageType: fullMessage.messageType,
        createdAt: fullMessage.createdAt?.toISOString() || new Date().toISOString(),
        sender: (fullMessage as any).sender,
        mentions: (fullMessage as any).mentions,
        attachments: (fullMessage as any).attachments
      },
      timestamp: Date.now()
    });
    
    for (const participant of conversation.participants) {
      if (participant.userId !== userId) {
        notifyUserOfNewMessage(participant.userId, {
          conversationId,
          messageId: fullMessage.id,
          senderName,
          preview: content.substring(0, 100)
        });
      }
    }
    
    res.status(201).json(fullMessage);
  } catch (error) {
    logger.error("Error creating message:", error);
    res.status(500).json({ message: "Failed to create message" });
  }
});

router.patch('/api/chat/messages/:messageId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    const validated = updateMessageSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { content } = validated.data;
    
    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    if (message.senderId !== userId) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }
    
    const updated = await storage.updateMessage(messageId, content);
    
    broadcastChatMessageEdited(message.conversationId, updated);
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating message:", error);
    res.status(500).json({ message: "Failed to update message" });
  }
});

router.delete('/api/chat/messages/:messageId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    const message = await storage.getMessage(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    if (message.senderId !== userId) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }
    
    const conversationId = message.conversationId;
    const deleted = await storage.deleteMessage(messageId);
    
    broadcastChatMessageDeleted(conversationId, messageId);
    
    res.json(deleted);
  } catch (error) {
    logger.error("Error deleting message:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
});

router.get('/api/chat/:hospitalId/notifications', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const notifications = await storage.getUnreadNotifications(userId, hospitalId);
    res.json(notifications);
  } catch (error) {
    logger.error("Error fetching notifications:", error);
    res.status(500).json({ message: "Failed to fetch notifications" });
  }
});

router.post('/api/chat/notifications/:notificationId/read', isAuthenticated, async (req: any, res) => {
  try {
    const { notificationId } = req.params;
    
    const updated = await storage.markNotificationRead(notificationId);
    res.json(updated);
  } catch (error) {
    logger.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Failed to mark notification as read" });
  }
});

router.post('/api/chat/:hospitalId/notifications/mark-all-read', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const notifications = await storage.getUnreadNotifications(userId, hospitalId);
    for (const notification of notifications) {
      await storage.markNotificationRead(notification.id);
    }
    
    res.json({ success: true, markedRead: notifications.length });
  } catch (error) {
    logger.error("Error marking all notifications as read:", error);
    res.status(500).json({ message: "Failed to mark notifications as read" });
  }
});

router.get('/api/chat/:hospitalId/mentions', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const unreadOnly = req.query.unread === 'true';
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const mentions = await storage.getMentionsForUser(userId, hospitalId, unreadOnly);
    res.json(mentions);
  } catch (error) {
    logger.error("Error fetching mentions:", error);
    res.status(500).json({ message: "Failed to fetch mentions" });
  }
});

router.get('/api/chat/attachments/:attachmentId/download', isAuthenticated, async (req: any, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;
    
    const attachment = await storage.getAttachment(attachmentId);
    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }
    
    const message = await storage.getMessage(attachment.messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    const conversation = await storage.getConversation(message.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied to this attachment" });
    }
    
    const objectStorageService = new ObjectStorageService();
    
    res.setHeader('Content-Disposition', `inline; filename="${attachment.filename}"`);
    if (attachment.mimeType) {
      res.setHeader('Content-Type', attachment.mimeType);
    }
    
    await objectStorageService.downloadObject(attachment.storageKey, res);
  } catch (error) {
    logger.error("Error downloading attachment:", error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ message: "File not found in storage" });
    }
    res.status(500).json({ message: "Failed to download attachment" });
  }
});

router.patch('/api/chat/attachments/:attachmentId/save-to-patient', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { attachmentId } = req.params;
    
    const validated = saveToPatientSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: validated.error.errors[0]?.message || "Invalid request data" });
    }
    
    const { patientId } = validated.data;
    
    const updated = await storage.updateAttachment(attachmentId, { savedToPatientId: patientId });
    res.json(updated);
  } catch (error) {
    logger.error("Error saving attachment to patient:", error);
    res.status(500).json({ message: "Failed to save attachment to patient" });
  }
});

router.post('/api/chat/upload', isAuthenticated, async (req: any, res) => {
  try {
    const { filename } = req.body;
    const objectStorageService = new ObjectStorageService();
    const result = await objectStorageService.getObjectEntityUploadURL(filename);
    res.json(result);
  } catch (error) {
    logger.error("Error getting upload URL:", error);
    res.status(500).json({ message: "Failed to get upload URL" });
  }
});

router.get('/api/chat/objects/:objectPath(*)', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const objectPath = `/objects/${req.params.objectPath}`;
    const objectStorageService = new ObjectStorageService();
    
    const canAccess = await objectStorageService.canAccessObject(objectPath, userId, ObjectPermission.READ);
    if (!canAccess) {
      return res.status(401).json({ message: "Access denied" });
    }
    
    await objectStorageService.downloadObject(objectPath, res);
  } catch (error) {
    logger.error("Error fetching object:", error);
    if (error instanceof ObjectNotFoundError) {
      return res.status(404).json({ message: "Object not found" });
    }
    res.status(500).json({ message: "Failed to fetch object" });
  }
});

router.post('/api/chat/attachments/confirm', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { storageKey, filename, mimeType, sizeBytes } = req.body;
    
    if (!storageKey || !filename || !mimeType) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    const objectStorageService = new ObjectStorageService();
    
    if (objectStorageService.isConfigured()) {
      try {
        await objectStorageService.setObjectAclPolicy(storageKey, {
          owner: userId,
          visibility: "private",
        });
      } catch (aclError) {
        logger.warn("Could not set ACL policy (object may not exist yet):", aclError);
      }
    }
    
    res.json({ 
      storageKey,
      filename,
      mimeType,
      sizeBytes: sizeBytes || 0,
      success: true 
    });
  } catch (error) {
    logger.error("Error confirming attachment:", error);
    res.status(500).json({ message: "Failed to confirm attachment" });
  }
});

export default router;
