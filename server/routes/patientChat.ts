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
} from "../storage/patientChat";
import { broadcastPatientChatMessage, notifyStaffOfPatientMessage } from "../socket";
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
      res.json({ success: true });
    } catch (error) {
      logger.error("[PatientChat] Portal error marking read:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);
