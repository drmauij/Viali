import { Router, type Request, type Response } from "express";
import logger from "../logger";
import {
  findPortalSessionWithEmail,
  getSurgeriesForSurgeon,
  createSurgeonActionRequest,
  getActionRequestsForSurgery,
  getHospitalByExternalSurgeryToken,
} from "../storage/surgeonPortal";

const router = Router();

/**
 * Middleware: verify surgeon portal session and extract email.
 * The surgeon portal uses hospital-wide tokens (not per-person),
 * so the session stores the authenticated surgeon's email.
 */
async function requireSurgeonSession(req: Request, res: Response, next: any) {
  try {
    const { token } = req.params;
    const sessionToken = req.cookies?.portal_session;

    if (!sessionToken) {
      return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
    }

    const session = await findPortalSessionWithEmail(sessionToken, "surgeon", token);
    if (!session.valid || !session.surgeonEmail) {
      return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
    }

    (req as any).surgeonEmail = session.surgeonEmail;
    (req as any).portalToken = token;
    next();
  } catch (error) {
    logger.error("[SurgeonPortal] Session check error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

router.use("/api/surgeon-portal/:token", requireSurgeonSession);

/**
 * GET /api/surgeon-portal/:token/surgeries?month=YYYY-MM
 * Returns surgeries for the authenticated surgeon at this hospital.
 */
router.get("/api/surgeon-portal/:token/surgeries", async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token } = req.params;
    const month = req.query.month as string | undefined;

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM." });
    }

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const surgeries = await getSurgeriesForSurgeon(hospital.id, surgeonEmail, month);

    // For each surgery, check for pending action requests from this surgeon
    const pendingRequests: Record<string, any[]> = {};
    for (const surgery of surgeries) {
      const pending = await getActionRequestsForSurgery(surgery.id, surgeonEmail);
      if (pending.length > 0) {
        pendingRequests[surgery.id] = pending;
      }
    }

    return res.json({
      hospitalName: hospital.name,
      surgeries,
      pendingRequests,
    });
  } catch (error) {
    logger.error("[SurgeonPortal] Error fetching surgeries:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/surgeon-portal/:token/action-requests
 * Submit a cancellation/reschedule/suspension request.
 * Body: { surgeryId, type, reason, proposedDate?, proposedTimeFrom?, proposedTimeTo? }
 */
router.post("/api/surgeon-portal/:token/action-requests", async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token } = req.params;
    const { surgeryId, type, reason, proposedDate, proposedTimeFrom, proposedTimeTo } = req.body;

    if (!surgeryId || !type || !reason) {
      return res.status(400).json({ message: "Missing required fields: surgeryId, type, reason" });
    }

    if (!["cancellation", "reschedule", "suspension"].includes(type)) {
      return res.status(400).json({ message: "Invalid request type" });
    }

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Check for duplicate pending request of same type for same surgery
    const existing = await getActionRequestsForSurgery(surgeryId, surgeonEmail);
    const duplicate = existing.find((r) => r.type === type);
    if (duplicate) {
      return res.status(409).json({ message: "A pending request of this type already exists for this surgery" });
    }

    const request = await createSurgeonActionRequest({
      hospitalId: hospital.id,
      surgeryId,
      surgeonEmail,
      type,
      reason,
      proposedDate: proposedDate || null,
      proposedTimeFrom: proposedTimeFrom ?? null,
      proposedTimeTo: proposedTimeTo ?? null,
    });

    // TODO: Send notification to clinic (Task 6)

    return res.status(201).json(request);
  } catch (error) {
    logger.error("[SurgeonPortal] Error creating action request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
