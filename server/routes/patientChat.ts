import { Router, Request, Response } from "express";
import { isAuthenticated } from "../auth/google";
import { requirePortalVerification } from "../auth/portalAuth";
import { getQuestionnaireLinkByToken } from "../storage/questionnaires";
import {
  getPatientConversations,
  getConversationMessages,
  getPortalMessages,
  createInboundMessage,
  createOutboundChatMessage,
  markConversationReadByStaff,
  markConversationReadByPatient,
  getUnreadPatientConversationCount,
  hasOtherUnreadOutboundMessages,
  markMessagesAsNotified,
  getPatientPortalToken,
  getPatientPhone,
  archivePatientChat,
  unarchivePatientChat,
  searchPatientsForChat,
} from "../storage/patientChat";
import { broadcastPatientChatMessage, notifyStaffOfPatientMessage, notifyStaffOfPatientRead } from "../socket";
import { sendSms } from "../sms";
import { storage } from "../storage";
import logger from "../logger";

export const patientChatRouter = Router();

// ========== CLINIC ROUTES (staff auth) ==========

patientChatRouter.get(
  "/api/patient-chat/:hospitalId/conversations",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const conversations = await getPatientConversations(hospitalId);
      res.json(conversations);
    } catch (error) {
      logger.error("[PatientChat] Error fetching conversations:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.get(
  "/api/patient-chat/:hospitalId/conversations/:patientId/messages",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, patientId } = req.params;
      const messages = await getConversationMessages(hospitalId, patientId);
      res.json(messages);
    } catch (error) {
      logger.error("[PatientChat] Error fetching messages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.post(
  "/api/patient-chat/:hospitalId/conversations/:patientId/messages",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, patientId } = req.params;
      const { message } = req.body;
      const user = req.user as any;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      const created = await createOutboundChatMessage(
        hospitalId,
        patientId,
        user.id,
        message.trim()
      );

      // Broadcast to patient via portal namespace
      broadcastPatientChatMessage(hospitalId, patientId, created);

      // Send SMS notification if patient hasn't been notified yet
      try {
        const alreadyNotified = await hasOtherUnreadOutboundMessages(hospitalId, patientId, created.id);
        if (!alreadyNotified) {
          const [phone, portalToken] = await Promise.all([
            getPatientPhone(patientId),
            getPatientPortalToken(patientId),
          ]);
          if (phone && portalToken) {
            const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
            const portalUrl = `${baseUrl}/patient/${portalToken}`;
            const hospital = await storage.getHospital(hospitalId);
            const hospitalName = hospital?.name || 'Your hospital';
            const smsText = `${hospitalName}: You have a new message. View it here: ${portalUrl}`;
            const result = await sendSms(phone, smsText, hospitalId);
            if (result.success) {
              await markMessagesAsNotified(hospitalId, patientId);
              logger.info(`[PatientChat] SMS notification sent to patient ${patientId}`);
            } else {
              logger.warn(`[PatientChat] Failed to send SMS notification: ${result.error}`);
            }
          } else {
            logger.info(`[PatientChat] Skipping SMS notification: phone=${!!phone}, token=${!!portalToken}`);
          }
        }
      } catch (smsError) {
        logger.error("[PatientChat] Error sending SMS notification:", smsError);
      }

      res.status(201).json(created);
    } catch (error) {
      logger.error("[PatientChat] Error sending message:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.post(
  "/api/patient-chat/:hospitalId/conversations/:patientId/mark-read",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, patientId } = req.params;
      await markConversationReadByStaff(hospitalId, patientId);
      res.json({ success: true });
    } catch (error) {
      logger.error("[PatientChat] Error marking read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.get(
  "/api/patient-chat/:hospitalId/unread-count",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const count = await getUnreadPatientConversationCount(hospitalId);
      res.json({ count });
    } catch (error) {
      logger.error("[PatientChat] Error fetching unread count:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.post(
  "/api/patient-chat/:hospitalId/conversations/:patientId/archive",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, patientId } = req.params;
      const user = req.user as any;
      await archivePatientChat(hospitalId, patientId, user.id);
      res.json({ success: true });
    } catch (error) {
      logger.error("[PatientChat] Error archiving conversation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.get(
  "/api/patient-chat/:hospitalId/patients/search",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const query = (req.query.q as string) || '';
      if (query.length < 2) {
        return res.json([]);
      }
      const patients = await searchPatientsForChat(hospitalId, query);
      res.json(patients);
    } catch (error) {
      logger.error("[PatientChat] Error searching patients:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ========== PORTAL ROUTES (patient auth) ==========

patientChatRouter.use(
  "/api/patient-portal/:token/messages",
  requirePortalVerification("patient")
);

patientChatRouter.get(
  "/api/patient-portal/:token/messages",
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const link = await getQuestionnaireLinkByToken(token);
      if (!link || !link.patientId) {
        return res.status(404).json({ message: "Link not found" });
      }

      const messages = await getPortalMessages(link.hospitalId, link.patientId);
      res.json(messages);
    } catch (error) {
      logger.error("[PatientChat] Portal error fetching messages:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.post(
  "/api/patient-portal/:token/messages",
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { message } = req.body;

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Message is required" });
      }

      const link = await getQuestionnaireLinkByToken(token);
      if (!link || !link.patientId) {
        return res.status(404).json({ message: "Link not found" });
      }

      const created = await createInboundMessage(
        link.hospitalId,
        link.patientId,
        message.trim()
      );

      // Unarchive conversation if it was archived (new patient message should resurface it)
      await unarchivePatientChat(link.hospitalId, link.patientId);

      // Notify staff via main namespace
      notifyStaffOfPatientMessage(link.hospitalId, link.patientId, created);

      res.status(201).json(created);
    } catch (error) {
      logger.error("[PatientChat] Portal error sending message:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

patientChatRouter.post(
  "/api/patient-portal/:token/messages/mark-read",
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const link = await getQuestionnaireLinkByToken(token);
      if (!link || !link.patientId) {
        return res.status(404).json({ message: "Link not found" });
      }

      await markConversationReadByPatient(link.hospitalId, link.patientId);
      notifyStaffOfPatientRead(link.hospitalId, link.patientId);
      res.json({ success: true });
    } catch (error) {
      logger.error("[PatientChat] Portal error marking read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);
