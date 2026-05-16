import { Router, type Request, type Response } from "express";
import logger from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import {
  users,
  externalSurgeryRequests,
  insertExternalSurgeryRequestSchema,
} from "@shared/schema";
import {
  findPortalSessionWithEmail,
  getSurgeriesForSurgeon,
  createSurgeonActionRequest,
  getActionRequestsForSurgeries,
  getHospitalByExternalSurgeryToken,
} from "../storage/surgeonPortal";
import { revokePortalSessionBySessionToken } from "../storage/portalOtp";
import {
  sendSurgeonActionRequestNotification,
  sendExternalSurgeryRequestNotification,
} from "../resend";
import { isDateInClosure } from "../storage/clinicClosures";
import { calculateQuick } from "@shared/scoring/ambulantEligibility";
import type { SurgeryRiskClass } from "@shared/scoring/types";
import {
  getAnesthesiaRecord,
  getSurgeryStaff,
  getGeneralTechnique,
  getNeuraxialBlocks,
  getPeripheralBlocks,
} from "../storage/anesthesia";

const router = Router();

const MAX_REASON_LENGTH = 2000;

/**
 * Middleware: verify surgeon portal session and extract email.
 * The surgeon portal uses hospital-wide tokens (not per-person),
 * so the session stores the authenticated surgeon's email.
 */
export async function requireSurgeonSession(req: Request, res: Response, next: any) {
  try {
    const { token } = req.params;
    const sessionToken = req.cookies?.portal_session;

    if (!sessionToken) {
      logger.info(`[DEBUG-AUTH] requireSurgeonSession: NO cookie, path=${req.path}`);
      return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
    }

    const session = await findPortalSessionWithEmail(sessionToken, "surgeon", token);
    if (!session.valid || !session.surgeonEmail) {
      logger.info(`[DEBUG-AUTH] requireSurgeonSession: INVALID session, valid=${session.valid}, email=${session.surgeonEmail}, token=${token.slice(0,8)}..., cookie=${sessionToken.slice(0,8)}...`);
      return res.status(403).json({ requiresVerification: true, portalType: "surgeon" });
    }

    logger.info(`[DEBUG-AUTH] requireSurgeonSession: OK, email=${session.surgeonEmail}`);
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
      logger.info(`[DEBUG-AUTH] surgeries: hospital NOT FOUND for token=${token.slice(0,8)}...`);
      return res.status(404).json({ message: "Hospital not found" });
    }

    logger.info(`[DEBUG-AUTH] surgeries: fetching for email=${surgeonEmail}, hospital=${hospital.id.slice(0,8)}..., month=${month}`);
    const surgeries = await getSurgeriesForSurgeon(hospital.id, surgeonEmail, month);
    logger.info(`[DEBUG-AUTH] surgeries: found ${surgeries.length} for email=${surgeonEmail}`);

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
 * GET /api/surgeon-portal/:token/surgeries/:surgeryId/summary-data
 * Returns all data needed to generate the Surgery Summary PDF.
 */
router.get("/api/surgeon-portal/:token/surgeries/:surgeryId/summary-data", requireSurgeonSession, async (req: Request, res: Response) => {
  try {
    const surgeonEmail = (req as any).surgeonEmail;
    const { token, surgeryId } = req.params;

    const hospital = await getHospitalByExternalSurgeryToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Verify the surgeon owns this surgery
    const surgeriesList = await getSurgeriesForSurgeon(hospital.id, surgeonEmail);
    const surgery = surgeriesList.find((s) => s.id === surgeryId);
    if (!surgery) {
      return res.status(403).json({ message: "You do not have access to this surgery" });
    }

    // Fetch full surgery + patient data
    const fullSurgery = await storage.getSurgery(surgeryId);
    if (!fullSurgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const patient = fullSurgery.patientId
      ? await storage.getPatient(fullSurgery.patientId)
      : null;

    // Fetch anesthesia data
    const anesthesiaRecord = await getAnesthesiaRecord(surgeryId);

    let staffMembers: any[] = [];
    let generalTechniqueData: any = null;
    let neuraxialBlocksData: any[] = [];
    let peripheralBlocksData: any[] = [];

    if (anesthesiaRecord) {
      [staffMembers, generalTechniqueData, neuraxialBlocksData, peripheralBlocksData] = await Promise.all([
        getSurgeryStaff(anesthesiaRecord.id),
        getGeneralTechnique(anesthesiaRecord.id),
        getNeuraxialBlocks(anesthesiaRecord.id),
        getPeripheralBlocks(anesthesiaRecord.id),
      ]);
    }

    return res.json({
      patient: patient ? {
        firstName: patient.firstName,
        surname: patient.surname,
        birthday: patient.birthday,
        patientNumber: patient.patientNumber,
      } : null,
      surgery: {
        plannedSurgery: fullSurgery.plannedSurgery,
        chopCode: fullSurgery.chopCode,
        surgeon: fullSurgery.surgeon,
        plannedDate: fullSurgery.plannedDate,
        actualStartTime: fullSurgery.actualStartTime,
        actualEndTime: fullSurgery.actualEndTime,
        status: fullSurgery.status,
        anesthesiaType: anesthesiaRecord?.anesthesiaType ?? null,
        noPreOpRequired: fullSurgery.noPreOpRequired,
      },
      anesthesiaRecord: anesthesiaRecord ? {
        anesthesiaStartTime: anesthesiaRecord.anesthesiaStartTime,
        anesthesiaEndTime: anesthesiaRecord.anesthesiaEndTime,
        timeMarkers: anesthesiaRecord.timeMarkers,
        anesthesiaOverview: {
          general: !!(generalTechniqueData?.approach && generalTechniqueData.approach !== "sedation") || !!generalTechniqueData?.rsi,
          sedation: generalTechniqueData?.approach === "sedation",
          regionalSpinal: neuraxialBlocksData.some((b: any) => b.blockType === "spinal"),
          regionalEpidural: neuraxialBlocksData.some((b: any) => b.blockType === "epidural"),
          regionalPeripheral: peripheralBlocksData.length > 0,
        },
      } : null,
      staffMembers: staffMembers.map((s) => ({
        id: s.id,
        role: s.role,
        name: s.name,
        timestamp: s.createdAt,
      })),
      language: hospital.defaultLanguage || "de",
    });
  } catch (error) {
    logger.error("[SurgeonPortal] Error fetching summary data:", error);
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

    // For reschedule requests, check if proposed date falls on a clinic closure
    if (type === "reschedule" && proposedDate) {
      const isClosed = await isDateInClosure(hospital.id, proposedDate);
      if (isClosed) {
        return res.status(400).json({
          message: "The clinic is closed on the proposed date. Please select a different date.",
          code: "CLINIC_CLOSED",
        });
      }
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

/**
 * POST /api/surgeon-portal/:token/requests
 * Submit a new external surgery request from inside the authenticated portal.
 * Body must include `surgeonId`. Authorization rules:
 *   - Solo doctor: surgeonId must equal their own id.
 *   - Praxis: surgeonId must be themselves or one of their children.
 * Denormalized surgeon name/email/phone are populated from the resolved user.
 */
router.post(
  "/api/surgeon-portal/:token/requests",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const sessionEmail: string = ((req as any).surgeonEmail as string).toLowerCase();
      const portalToken = req.params.token;

      const hospital = await getHospitalByExternalSurgeryToken(portalToken);
      if (!hospital) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      const [sessionUser] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${sessionEmail}`)
        .limit(1);
      if (!sessionUser) {
        return res.status(401).json({ message: "Session user not found" });
      }

      const { surgeonId, ...rest } = req.body as { surgeonId: string; [k: string]: any };
      if (!surgeonId) {
        return res.status(400).json({ message: "surgeonId is required" });
      }

      const [targetSurgeon] = await db
        .select()
        .from(users)
        .where(eq(users.id, surgeonId))
        .limit(1);
      if (!targetSurgeon) {
        return res.status(400).json({ message: "Target surgeon not found" });
      }

      // Authorization: solo can only submit for self; praxis can submit for self or children
      if (sessionUser.isPraxis) {
        const isSelf = targetSurgeon.id === sessionUser.id;
        const isChild = targetSurgeon.parentSurgeonId === sessionUser.id;
        if (!isSelf && !isChild) {
          return res.status(403).json({
            message: "Target surgeon is not yourself or one of your children",
          });
        }
      } else {
        if (targetSurgeon.id !== sessionUser.id) {
          return res.status(403).json({
            message: "You may only submit requests for yourself",
          });
        }
      }

      // Spread the body FIRST, then overwrite the surgeon-* fields with the
      // authoritative values from the resolved targetSurgeon. The form's
      // SurgeryRequestFormValues default these to "" — without this ordering,
      // the form's empties would clobber the real surgeon name/email/phone.
      const requestPayload = {
        ...rest,
        hospitalId: hospital.id,
        surgeonId: targetSurgeon.id,
        surgeonFirstName: targetSurgeon.firstName ?? "",
        surgeonLastName: targetSurgeon.lastName ?? "",
        surgeonEmail: targetSurgeon.email ?? "",
        surgeonPhone: targetSurgeon.phone ?? "",
      };

      const parsed = insertExternalSurgeryRequestSchema.safeParse(requestPayload);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid payload",
          errors: parsed.error.flatten(),
        });
      }

      // Compute ambulant eligibility snapshot at submission time so the
      // clinic-side admin queue can render the 🔴/🟡/🟢 pill without
      // re-running the engine on every list render. Portal does not get
      // an override path — a red request lands in the queue as-is, the
      // clinic reviewer decides at conversion time.
      const data = parsed.data as any;
      const riskClass = data.surgeryRiskClass as SurgeryRiskClass | undefined;
      let ambulantQuickCheck: ReturnType<typeof calculateQuick> | null = null;
      if (riskClass) {
        const ageYears = data.patientBirthday
          ? Math.floor(
              (Date.now() - new Date(data.patientBirthday).getTime()) /
                (365.25 * 24 * 3600 * 1000),
            )
          : null;
        ambulantQuickCheck = calculateQuick({
          ageYears,
          bmi: null,
          sex: null,
          plannedMinutes: data.surgeryDurationMinutes ?? null,
          surgeryRiskClass: riskClass,
          stayType: (data.stayType ?? null) as "ambulant" | "overnight" | null,
          knownOsasUntreated: false,
          vteHistory: false,
          activeCancer: false,
        });
      }

      const [created] = await db
        .insert(externalSurgeryRequests)
        .values({ ...data, ambulantQuickCheck } as any)
        .returning();

      // Fire-and-forget clinic notification. The legacy public POST sent this
      // email; when the route moved to surgeon-portal in commit 1d86897a, the
      // notification call was dropped. Sends to the hospital's configured
      // notification address only — if none is set the row still lands but no
      // email goes out (matching the action-requests handler's behavior).
      (async () => {
        try {
          const notifyEmail = hospital.externalSurgeryNotificationEmail;
          if (!notifyEmail) return;
          const lang = (hospital.defaultLanguage as "de" | "en") || "de";
          const patientName = [created.patientLastName, created.patientFirstName]
            .filter(Boolean)
            .join(", ") || "—";
          const surgeryName = created.surgeryName || "—";
          const surgeonName = [targetSurgeon.firstName, targetSurgeon.lastName]
            .filter(Boolean)
            .join(" ") || targetSurgeon.email || "—";
          const wishedDate = created.wishedDate
            ? new Date(created.wishedDate).toLocaleDateString(
                lang === "de" ? "de-CH" : "en-GB",
              )
            : "—";
          const baseUrl = process.env.PRODUCTION_URL || "";
          const deepLinkUrl = `${baseUrl}/anesthesia/op`;
          await sendExternalSurgeryRequestNotification(
            notifyEmail,
            hospital.name,
            hospital.name,
            patientName,
            surgeryName,
            surgeonName,
            wishedDate,
            deepLinkUrl,
            lang,
            (created as any).wishedTimeFrom ?? null,
            (created as any).wishedTimeTo ?? null,
          );
        } catch (err) {
          logger.error(
            "[SurgeonPortal] Error sending new-request clinic notification:",
            err,
          );
        }
      })();

      return res.status(201).json(created);
    } catch (error) {
      logger.error("[SurgeonPortal] Error creating surgeon-portal request:", error);
      const message =
        error instanceof Error ? error.message : "Failed to create request";
      return res.status(500).json({ message });
    }
  },
);

/**
 * POST /api/surgeon-portal/:token/upload-url
 * Issues a presigned S3 PUT URL for a single document attached to a portal
 * surgery request. Mirrors the public /external-surgery upload route but
 * is gated by the surgeon-portal session and resolves the hospital from the
 * portal token instead of the public hospital token.
 */
router.post(
  "/api/surgeon-portal/:token/upload-url",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { filename, contentType, requestId } = req.body as {
        filename?: string;
        contentType?: string;
        requestId?: string;
      };
      if (!filename) {
        return res.status(400).json({ message: "filename is required" });
      }

      const result = await getHospitalByExternalSurgeryToken(token);
      if (!result) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      if (requestId) {
        const request = await storage.getExternalSurgeryRequest(requestId);
        if (!request || request.hospitalId !== result.id) {
          return res.status(403).json({ message: "Invalid request" });
        }
      }

      const endpoint = process.env.S3_ENDPOINT;
      const accessKeyId = process.env.S3_ACCESS_KEY;
      const secretAccessKey = process.env.S3_SECRET_KEY;
      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION || "ch-dk-2";

      if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
        return res.status(500).json({ message: "Object storage not configured" });
      }

      const s3Client = new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });

      const fileId = randomUUID();
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
      const key = `external-surgery-documents/${result.id}/${fileId}-${sanitizedFilename}`;

      const putCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType || "application/octet-stream",
      });

      const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });

      return res.json({
        uploadUrl,
        fileUrl: `/objects/${key}`,
        key,
      });
    } catch (error) {
      logger.error("[SurgeonPortal] Error generating upload URL:", error);
      return res.status(500).json({ message: "Failed to generate upload URL" });
    }
  },
);

/**
 * POST /api/surgeon-portal/:token/documents
 * Persists the metadata of a previously-uploaded document and links it to the
 * given surgery request. Same authorization shape as upload-url.
 */
router.post(
  "/api/surgeon-portal/:token/documents",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { requestId, fileName, fileUrl, mimeType, fileSize, description } = req.body as {
        requestId?: string;
        fileName?: string;
        fileUrl?: string;
        mimeType?: string;
        fileSize?: number;
        description?: string;
      };
      if (!requestId || !fileName || !fileUrl) {
        return res.status(400).json({ message: "requestId, fileName, and fileUrl are required" });
      }

      const result = await getHospitalByExternalSurgeryToken(token);
      if (!result) {
        return res.status(404).json({ message: "Hospital not found" });
      }

      const request = await storage.getExternalSurgeryRequest(requestId);
      if (!request || request.hospitalId !== result.id) {
        return res.status(403).json({ message: "Invalid request" });
      }

      const doc = await storage.createExternalSurgeryRequestDocument({
        requestId,
        fileName,
        fileUrl,
        mimeType,
        fileSize,
        description,
      });

      return res.json(doc);
    } catch (error) {
      logger.error("[SurgeonPortal] Error saving document:", error);
      return res.status(500).json({ message: "Failed to save document" });
    }
  },
);

/**
 * GET /api/surgeon-portal/:token/me
 * Returns the authenticated surgeon's basic profile (id, name, email, isPraxis).
 * Used by the in-portal surgery-request form to know whether to show the
 * "Operating surgeon" picker (for praxes) and to resolve the default surgeonId.
 */
router.get(
  "/api/surgeon-portal/:token/me",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const email = ((req as any).surgeonEmail as string).toLowerCase();
      const [u] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${email}`)
        .limit(1);
      if (!u) return res.status(404).json({ message: "Not found" });
      res.json({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        isPraxis: u.isPraxis,
      });
    } catch (error) {
      logger.error("Error in /me:", error);
      res.status(500).json({ message: "Failed" });
    }
  },
);

const updateMeSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstName cannot be empty").max(120),
    lastName: z.string().trim().min(1, "lastName cannot be empty").max(120),
    phone: z.union([z.string().trim().max(40), z.null()]),
  })
  .strict();

/**
 * PATCH /api/surgeon-portal/:token/me
 * Updates the authenticated surgeon's first name, last name, and phone.
 * Email and all other fields are intentionally excluded (schema is .strict()).
 * Empty-string phone is normalized to null.
 */
router.patch(
  "/api/surgeon-portal/:token/me",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: "Invalid payload",
          errors: parsed.error.flatten(),
        });
      }
      const email = ((req as any).surgeonEmail as string).toLowerCase();
      const phoneNormalized =
        parsed.data.phone === "" ? null : parsed.data.phone;

      const [updated] = await db
        .update(users)
        .set({
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          phone: phoneNormalized,
          updatedAt: new Date(),
        })
        .where(sql`LOWER(${users.email}) = ${email}`)
        .returning();

      if (!updated) return res.status(404).json({ message: "Not found" });

      res.json({
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        isPraxis: updated.isPraxis,
      });
    } catch (error) {
      logger.error("Error in PATCH /me:", error);
      res.status(500).json({ message: "Failed" });
    }
  },
);

/**
 * GET /api/surgeon-portal/:token/children
 * For praxis users, returns the list of child surgeons (parent_surgeon_id = me.id).
 * For non-praxis users, returns an empty array.
 */
router.get(
  "/api/surgeon-portal/:token/children",
  requireSurgeonSession,
  async (req: Request, res: Response) => {
    try {
      const email = ((req as any).surgeonEmail as string).toLowerCase();
      const [u] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${email}`)
        .limit(1);
      if (!u) return res.status(404).json({ message: "Not found" });
      if (!u.isPraxis) return res.json([]);
      const { getChildrenOfPraxis } = await import("../storage/surgeonPortal");
      const children = await getChildrenOfPraxis(u.id);
      res.json(
        children.map((c: any) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
        })),
      );
    } catch (error) {
      logger.error("Error in /children:", error);
      res.status(500).json({ message: "Failed" });
    }
  },
);

export default router;
