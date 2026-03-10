import { Router, type Request, type Response } from "express";
import logger from "../logger";
import { storage } from "../storage";
import {
  findPortalSessionWithEmail,
  getSurgeriesForSurgeon,
  createSurgeonActionRequest,
  getActionRequestsForSurgeries,
  getHospitalByExternalSurgeryToken,
} from "../storage/surgeonPortal";
import { revokePortalSessionBySessionToken } from "../storage/portalOtp";
import { sendSurgeonActionRequestNotification } from "../resend";

const router = Router();

const MAX_REASON_LENGTH = 2000;

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

/**
 * GET /api/surgeon-portal/:token/surgeries?month=YYYY-MM
 * Returns surgeries for the authenticated surgeon at this hospital.
 */
router.get("/api/surgeon-portal/:token/surgeries", requireSurgeonSession, async (req: Request, res: Response) => {
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

    // Batch fetch pending action requests for all surgeries
    const surgeryIds = surgeries.map((s) => s.id);
    const pendingRequests = await getActionRequestsForSurgeries(surgeryIds, surgeonEmail);

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
router.post("/api/surgeon-portal/:token/action-requests", requireSurgeonSession, async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token } = req.params;
    const { surgeryId, type, reason, proposedDate, proposedTimeFrom, proposedTimeTo } = req.body;

    if (!surgeryId || !type || !reason) {
      return res.status(400).json({ message: "Missing required fields: surgeryId, type, reason" });
    }

    if (typeof reason !== "string" || reason.length > MAX_REASON_LENGTH) {
      return res.status(400).json({ message: `Reason must be a string of at most ${MAX_REASON_LENGTH} characters` });
    }

    if (!["cancellation", "reschedule", "suspension"].includes(type)) {
      return res.status(400).json({ message: "Invalid request type" });
    }

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Verify the surgeon owns this surgery
    const surgeries = await getSurgeriesForSurgeon(hospital.id, surgeonEmail);
    const ownsSurgery = surgeries.some((s) => s.id === surgeryId);
    if (!ownsSurgery) {
      return res.status(403).json({ message: "You do not have access to this surgery" });
    }

    // Check for duplicate pending request of same type for same surgery
    const existingMap = await getActionRequestsForSurgeries([surgeryId], surgeonEmail);
    const existing = existingMap[surgeryId] || [];
    const duplicate = existing.find((r) => r.type === type);
    if (duplicate) {
      return res.status(409).json({ message: "A pending request of this type already exists for this surgery" });
    }

    const actionRequest = await createSurgeonActionRequest({
      hospitalId: hospital.id,
      surgeryId,
      surgeonEmail,
      type,
      reason,
      proposedDate: proposedDate || null,
      proposedTimeFrom: proposedTimeFrom ?? null,
      proposedTimeTo: proposedTimeTo ?? null,
    });

    // Send notification to clinic (fire-and-forget)
    (async () => {
      try {
        const surgery = surgeries.find((s) => s.id === surgeryId);
        const patientName = surgery
          ? [surgery.patientLastName, surgery.patientFirstName].filter(Boolean).join(", ")
          : "N/A";
        const surgeryName = surgery?.plannedSurgery || "N/A";
        const plannedDate = surgery?.plannedDate
          ? new Date(surgery.plannedDate).toLocaleDateString(
              hospital.defaultLanguage === "de" ? "de-CH" : "en-GB",
            )
          : "N/A";
        const lang = (hospital.defaultLanguage as "de" | "en") || "de";

        // Send to configured notification email, or skip if none set
        const notifyEmail = hospital.externalSurgeryNotificationEmail;
        if (notifyEmail) {
          await sendSurgeonActionRequestNotification(
            notifyEmail,
            hospital.name,
            surgeonEmail,
            type as "cancellation" | "reschedule" | "suspension",
            reason,
            { patientName, surgeryName, plannedDate },
            proposedDate || null,
            lang,
          );
        }
      } catch (err) {
        logger.error("[SurgeonPortal] Error sending clinic notification:", err);
      }
    })();

    return res.status(201).json(actionRequest);
  } catch (error) {
    logger.error("[SurgeonPortal] Error creating action request:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/surgeon-portal/:token/logout
 * Revoke the current session and clear the cookie.
 */
router.post("/api/surgeon-portal/:token/logout", async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies?.portal_session;
    if (sessionToken) {
      await revokePortalSessionBySessionToken(sessionToken);
    }
    const isHttps = (process.env.NODE_ENV === "production") ||
      !!process.env.PRODUCTION_URL;
    res.clearCookie("portal_session", {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("[SurgeonPortal] Logout error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
