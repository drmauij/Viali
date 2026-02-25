import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, getUserUnitForHospital, getActiveUnitIdFromRequest } from "../utils";
import { z } from "zod";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { sendSms, isSmsConfigured, isSmsConfiguredForHospital } from "../sms";
import { sendExternalSurgeryRequestNotification } from "../resend";
import { Resend } from "resend";
import { db } from "../db";
import { users, userHospitalRoles, units } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import logger from "../logger";

const router = Router();

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  Array.from(rateLimitStore.entries()).forEach(([key, entry]) => {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

function createRateLimiter(options: { windowMs: number; maxRequests: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const token = req.params.token;
    
    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid or missing token" });
    }
    
    const key = `${options.keyPrefix}:${ip}:${token}`;
    const now = Date.now();
    
    let entry = rateLimitStore.get(key);
    
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + options.windowMs };
      rateLimitStore.set(key, entry);
    }
    
    entry.count++;
    
    if (entry.count > options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ 
        message: "Too many requests. Please try again later.",
        retryAfter 
      });
    }
    
    next();
  };
}

const fetchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'extsurg_fetch'
});

const submitLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'extsurg_submit'
});

const uploadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'extsurg_upload'
});

const externalSurgeryRequestSchema = z.object({
  surgeonFirstName: z.string().min(1, "Surgeon first name is required"),
  surgeonLastName: z.string().min(1, "Surgeon last name is required"),
  surgeonEmail: z.string().email("Valid email is required"),
  surgeonPhone: z.string().min(5, "Surgeon phone is required"),
  surgeryName: z.string().optional().nullable().transform(v => v === '' ? null : v),
  surgeryDurationMinutes: z.number().min(15).max(720),
  withAnesthesia: z.boolean(),
  surgeryNotes: z.string().optional(),
  wishedDate: z.string().min(1, "Wished date is required"),
  isReservationOnly: z.boolean().optional().default(false),
  patientFirstName: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientLastName: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientBirthday: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientEmail: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientPhone: z.string().optional().nullable().transform(v => v === '' ? null : v),
  patientPosition: z.enum(["supine", "trendelenburg", "reverse_trendelenburg", "lithotomy", "lateral_decubitus", "prone", "jackknife", "sitting", "kidney", "lloyd_davies"]).optional().nullable().or(z.literal("").transform(() => null)),
  leftArmPosition: z.enum(["ausgelagert", "angelagert"]).optional().nullable().or(z.literal("").transform(() => null)),
  rightArmPosition: z.enum(["ausgelagert", "angelagert"]).optional().nullable().or(z.literal("").transform(() => null)),
}).refine((data) => {
  // If not reservation-only, patient fields are required
  if (!data.isReservationOnly) {
    return !!(data.patientFirstName && data.patientLastName && data.patientBirthday && data.patientPhone && data.surgeryName);
  }
  return true;
}, {
  message: "Patient details and surgery name are required for non-reservation requests",
});

router.get('/public/external-surgery/:token', fetchLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const result = await storage.getExternalSurgeryRequestByHospitalToken(token);
    
    if (!result) {
      return res.status(404).json({ message: "Invalid link" });
    }
    
    res.json({
      hospitalName: result.hospital.name,
      hospitalId: result.hospital.id,
    });
  } catch (error) {
    logger.error("Error fetching external surgery form:", error);
    res.status(500).json({ message: "Failed to load form" });
  }
});

router.post('/public/external-surgery/:token', submitLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const result = await storage.getExternalSurgeryRequestByHospitalToken(token);
    
    if (!result) {
      return res.status(404).json({ message: "Invalid link" });
    }
    
    const parsed = externalSurgeryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }
    
    const request = await storage.createExternalSurgeryRequest({
      hospitalId: result.hospital.id,
      ...parsed.data,
      status: 'pending',
    });
    
    res.json({ 
      success: true, 
      requestId: request.id,
      message: "Your surgery reservation request has been submitted successfully."
    });

    (async () => {
      try {
        const baseUrl = process.env.PRODUCTION_URL || process.env.PUBLIC_URL || 'http://localhost:5000';
        const deepLinkUrl = `${baseUrl}/anesthesia/op?openRequests=true`;
        const patientName = parsed.data.isReservationOnly
          ? 'Slot Reservation (no patient)'
          : `${parsed.data.patientLastName}, ${parsed.data.patientFirstName}`;
        const surgeonName = `Dr. ${parsed.data.surgeonLastName}, ${parsed.data.surgeonFirstName}`;
        const wishedDate = parsed.data.wishedDate || '';

        // If a dedicated notification email is configured, send to that address only
        if (result.hospital.externalSurgeryNotificationEmail) {
          sendExternalSurgeryRequestNotification(
            result.hospital.externalSurgeryNotificationEmail,
            result.hospital.name,
            result.hospital.name,
            patientName,
            parsed.data.surgeryName || 'Slot Reservation',
            surgeonName,
            wishedDate,
            deepLinkUrl,
            (result.hospital.defaultLanguage as 'de' | 'en') || 'de'
          ).catch(err => logger.error('[ExternalSurgery] Failed to send notification to configured email', result.hospital.externalSurgeryNotificationEmail, err));
          logger.info(`[ExternalSurgery] Sent notification to configured email ${result.hospital.externalSurgeryNotificationEmail} for hospital ${result.hospital.name}`);
          return;
        }

        // Fallback: notify all OR admins
        const orAdmins = await db
          .select({
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(userHospitalRoles)
          .innerJoin(users, eq(users.id, userHospitalRoles.userId))
          .innerJoin(units, eq(units.id, userHospitalRoles.unitId))
          .where(
            and(
              eq(userHospitalRoles.hospitalId, result.hospital.id),
              eq(userHospitalRoles.role, 'admin'),
              eq(units.type, 'or')
            )
          );

        if (orAdmins.length === 0) {
          logger.info('[ExternalSurgery] No OR-admin users found for hospital', result.hospital.id);
          return;
        }

        for (const admin of orAdmins) {
          if (!admin.email) continue;
          const userName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || 'Admin';
          sendExternalSurgeryRequestNotification(
            admin.email,
            userName,
            result.hospital.name,
            patientName,
            parsed.data.surgeryName || 'Slot Reservation',
            surgeonName,
            wishedDate,
            deepLinkUrl,
            (result.hospital.defaultLanguage as 'de' | 'en') || 'de'
          ).catch(err => logger.error('[ExternalSurgery] Failed to send notification to', admin.email, err));
        }
        logger.info(`[ExternalSurgery] Sent notifications to ${orAdmins.length} OR-admin(s) for hospital ${result.hospital.name}`);
      } catch (err) {
        logger.error('[ExternalSurgery] Error sending admin notifications:', err);
      }
    })();
  } catch (error) {
    logger.error("Error submitting external surgery request:", error);
    res.status(500).json({ message: "Failed to submit request" });
  }
});

router.post('/public/external-surgery/:token/upload-url', uploadLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { filename, contentType, requestId } = req.body;
    
    const result = await storage.getExternalSurgeryRequestByHospitalToken(token);
    
    if (!result) {
      return res.status(404).json({ message: "Invalid link" });
    }
    
    if (requestId) {
      const request = await storage.getExternalSurgeryRequest(requestId);
      if (!request || request.hospitalId !== result.hospital.id) {
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
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `external-surgery-documents/${result.hospital.id}/${fileId}-${sanitizedFilename}`;

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, putCommand, { expiresIn: 3600 });

    res.json({
      uploadUrl,
      fileUrl: `/objects/${key}`,
      key,
    });
  } catch (error) {
    logger.error("Error generating upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

router.post('/public/external-surgery/:token/documents', uploadLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { requestId, fileName, fileUrl, mimeType, fileSize, description } = req.body;
    
    const result = await storage.getExternalSurgeryRequestByHospitalToken(token);
    
    if (!result) {
      return res.status(404).json({ message: "Invalid link" });
    }
    
    const request = await storage.getExternalSurgeryRequest(requestId);
    if (!request || request.hospitalId !== result.hospital.id) {
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
    
    res.json(doc);
  } catch (error) {
    logger.error("Error saving document:", error);
    res.status(500).json({ message: "Failed to save document" });
  }
});

router.get('/api/hospitals/:hospitalId/external-surgery-requests', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const { status } = req.query;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const requests = await storage.getExternalSurgeryRequests(hospitalId, status as string);
    
    const requestsWithDocuments = await Promise.all(
      requests.map(async (request) => {
        const documents = await storage.getExternalSurgeryRequestDocuments(request.id);
        return { ...request, documents };
      })
    );
    
    res.json(requestsWithDocuments);
  } catch (error) {
    logger.error("Error fetching external surgery requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

router.get('/api/hospitals/:hospitalId/external-surgery-requests/count', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const count = await storage.getPendingExternalSurgeryRequestsCount(hospitalId);
    
    res.json({ count });
  } catch (error) {
    logger.error("Error fetching pending count:", error);
    res.status(500).json({ message: "Failed to fetch count" });
  }
});

router.get('/api/external-surgery-requests/:id', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const request = await storage.getExternalSurgeryRequest(id);
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, request.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const documents = await storage.getExternalSurgeryRequestDocuments(id);
    
    res.json({ ...request, documents });
  } catch (error) {
    logger.error("Error fetching request:", error);
    res.status(500).json({ message: "Failed to fetch request" });
  }
});

router.patch('/api/external-surgery-requests/:id', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status, internalNotes, declineReason } = req.body;
    const userId = req.user.id;
    
    const request = await storage.getExternalSurgeryRequest(id);
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, request.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const updates: any = {};
    if (status !== undefined) updates.status = status;
    if (internalNotes !== undefined) updates.internalNotes = internalNotes;
    if (declineReason !== undefined) updates.declineReason = declineReason;
    
    const updated = await storage.updateExternalSurgeryRequest(id, updates);
    
    res.json(updated);
  } catch (error) {
    logger.error("Error updating request:", error);
    res.status(500).json({ message: "Failed to update request" });
  }
});

router.post('/api/external-surgery-requests/:id/schedule', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { plannedDate, surgeryRoomId, admissionTime, sendConfirmation } = req.body;
    const userId = req.user.id;
    
    const request = await storage.getExternalSurgeryRequest(id);
    
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    
    const unitId = await getUserUnitForHospital(userId, request.hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    if (request.status === 'scheduled') {
      return res.status(400).json({ message: "Request already scheduled" });
    }
    
    // Create or find patient (skip for reservation-only requests)
    let patientId = request.patientId;
    if (!patientId && !request.isReservationOnly && request.patientFirstName && request.patientLastName && request.patientBirthday) {
      const patientNumber = await storage.generatePatientNumber(request.hospitalId);
      const patient = await storage.createPatient({
        hospitalId: request.hospitalId,
        firstName: request.patientFirstName,
        surname: request.patientLastName,
        birthday: request.patientBirthday,
        patientNumber,
        sex: 'O',
        email: request.patientEmail || undefined,
        phone: request.patientPhone || undefined,
      });
      patientId = patient.id;
    }
    
    // Create or find external surgeon
    let surgeonUserId: string | null = null;
    const surgeonFullName = `${request.surgeonFirstName} ${request.surgeonLastName}`;
    
    // Find the surgery unit for this hospital (surgeons must be assigned to surgery unit with role 'doctor')
    const allUnits = await storage.getUnits(request.hospitalId);
    const surgeryUnit = allUnits.find(u => u.type === 'or');
    const surgeryUnitId = surgeryUnit?.id || unitId;
    
    // Look up by email first (email has a unique constraint, so it's the reliable key)
    const existingSurgeon = await storage.searchUserByEmail(request.surgeonEmail);

    if (existingSurgeon) {
      surgeonUserId = existingSurgeon.id;
      // Ensure they're assigned to this hospital's surgery unit as a doctor
      const hospitalUsers = await storage.getHospitalUsers(request.hospitalId);
      const hasRoleInSurgeryUnit = hospitalUsers.some(hu =>
        hu.userId === existingSurgeon.id && hu.unitId === surgeryUnitId && hu.role === 'doctor'
      );
      if (!hasRoleInSurgeryUnit) {
        // Add them to surgery unit with doctor role
        await storage.createUserHospitalRole({
          userId: existingSurgeon.id,
          hospitalId: request.hospitalId,
          unitId: surgeryUnitId,
          role: 'doctor',
          isBookable: false,
          isDefaultLogin: false,
          availabilityMode: null,
          calcomUserId: null,
          calcomEventTypeId: null,
        });
      }
    } else {
      // Create new external surgeon user
      const newSurgeon = await storage.createUser({
        email: request.surgeonEmail,
        firstName: request.surgeonFirstName,
        lastName: request.surgeonLastName,
        phone: request.surgeonPhone,
        staffType: 'external',
        canLogin: false, // External surgeons don't need app access by default
      });
      surgeonUserId = newSurgeon.id;

      // Add them to surgery unit with doctor role
      await storage.createUserHospitalRole({
        userId: newSurgeon.id,
        hospitalId: request.hospitalId,
        unitId: surgeryUnitId,
        role: 'doctor',
        isBookable: false,
        isDefaultLogin: false,
        availabilityMode: null,
        calcomUserId: null,
        calcomEventTypeId: null,
      });
    }
    
    const surgery = await storage.createSurgery({
      hospitalId: request.hospitalId,
      patientId: patientId || null,
      surgeryRoomId: surgeryRoomId || null,
      plannedDate: new Date(plannedDate),
      plannedSurgery: request.surgeryName || null,
      surgeon: surgeonFullName,
      surgeonId: surgeonUserId,
      notes: request.surgeryNotes || '',
      admissionTime: admissionTime ? new Date(admissionTime) : undefined,
      patientPosition: request.patientPosition || null,
      leftArmPosition: request.leftArmPosition || null,
      rightArmPosition: request.rightArmPosition || null,
    });
    
    await storage.updateExternalSurgeryRequest(id, {
      status: 'scheduled',
      surgeryId: surgery.id,
      patientId,
      scheduledAt: new Date(),
      scheduledBy: userId,
    });
    
    // Transfer documents from external request to patient record (only if patient exists)
    if (patientId) {
      const documents = await storage.getExternalSurgeryRequestDocuments(id);
      for (const doc of documents) {
        await storage.createPatientDocument({
          hospitalId: request.hospitalId,
          patientId,
          category: 'other',
          fileName: doc.fileName,
          fileUrl: doc.fileUrl,
          mimeType: doc.mimeType || undefined,
          fileSize: doc.fileSize || undefined,
          description: `From external surgery request: ${request.surgeryName || 'Slot Reservation'}`,
          uploadedBy: userId,
        });
      }
    }
    
    if (sendConfirmation) {
      const hospital = await storage.getHospital(request.hospitalId);
      const hospitalName = hospital?.name || 'the hospital';
      const lang = (hospital?.defaultLanguage as 'de' | 'en') || 'de';
      const isGerman = lang === 'de';
      const dateLocale = isGerman ? 'de-CH' : 'en-GB';
      const formattedDate = new Date(plannedDate).toLocaleDateString(dateLocale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = new Date(plannedDate).toLocaleTimeString(dateLocale, {
        hour: '2-digit',
        minute: '2-digit',
      });

      // Try email first; only fall back to SMS if email wasn't sent
      let emailSent = false;
      if (request.surgeonEmail) {
        try {
          const resendApiKey = process.env.RESEND_API_KEY;
          if (resendApiKey) {
            const resend = new Resend(resendApiKey);

            const subjectText = request.isReservationOnly
              ? (isGerman ? `Slot-Reservierung bestätigt – ${formattedDate}` : `Slot Reservation Confirmed - ${formattedDate}`)
              : (isGerman
                ? `OP bestätigt – ${request.patientLastName}, ${request.patientFirstName}`
                : `Surgery Confirmed - ${request.patientLastName}, ${request.patientFirstName}`);

            const headingText = request.isReservationOnly
              ? (isGerman ? 'Slot-Reservierung bestätigt' : 'Slot Reservation Confirmed')
              : (isGerman ? 'OP-Reservierung bestätigt' : 'Surgery Reservation Confirmed');

            await resend.emails.send({
              from: process.env.RESEND_FROM_EMAIL || 'noreply@mail.viali.app',
              to: request.surgeonEmail,
              subject: subjectText,
              html: `
                <h2>${headingText}</h2>
                <p>${isGerman ? 'Sehr geehrte/r Dr.' : 'Dear Dr.'} ${request.surgeonLastName},</p>
                <p>${isGerman
                  ? `Ihre ${request.isReservationOnly ? 'Slot-Reservierung' : 'OP-Reservierung'} wurde bei ${hospitalName} bestätigt.`
                  : `Your ${request.isReservationOnly ? 'slot reservation' : 'surgery reservation'} request has been confirmed at ${hospitalName}.`}</p>
                <h3>${isGerman ? 'Details:' : 'Details:'}</h3>
                <ul>
                  ${!request.isReservationOnly ? `<li><strong>${isGerman ? 'Patient' : 'Patient'}:</strong> ${request.patientLastName}, ${request.patientFirstName}</li>` : ''}
                  <li><strong>${isGerman ? 'Eingriff' : 'Surgery'}:</strong> ${request.surgeryName || (isGerman ? 'Slot-Reservierung' : 'Slot Reservation')}</li>
                  <li><strong>${isGerman ? 'Datum' : 'Date'}:</strong> ${formattedDate}, ${formattedTime}</li>
                  <li><strong>${isGerman ? 'Dauer' : 'Duration'}:</strong> ${request.surgeryDurationMinutes} ${isGerman ? 'Minuten' : 'minutes'}</li>
                  <li><strong>${isGerman ? 'Anästhesie' : 'Anesthesia'}:</strong> ${request.withAnesthesia ? (isGerman ? 'Ja' : 'Yes') : (isGerman ? 'Nein' : 'No')}</li>
                </ul>
                <p>${isGerman ? 'Bei Fragen kontaktieren Sie uns bitte direkt.' : 'If you have any questions, please contact us directly.'}</p>
                <p>${isGerman ? 'Freundliche Grüsse' : 'Best regards'},<br>${hospitalName}</p>
              `,
            });

            await storage.updateExternalSurgeryRequest(id, {
              confirmationEmailSent: true,
            });
            emailSent = true;
          }
        } catch (emailError) {
          logger.error("Error sending confirmation email:", emailError);
        }
      }

      // SMS only as fallback when email wasn't available or failed
      if (!emailSent && request.surgeonPhone && (await isSmsConfiguredForHospital(request.hospitalId) || isSmsConfigured())) {
        try {
          const smsText = request.isReservationOnly
            ? (isGerman
              ? `Slot-Reservierung bestätigt bei ${hospitalName} am ${formattedDate} um ${formattedTime}. – ${hospitalName}`
              : `Slot reservation confirmed at ${hospitalName} on ${formattedDate} at ${formattedTime}. - ${hospitalName}`)
            : (isGerman
              ? `OP bestätigt bei ${hospitalName}: ${request.patientLastName}, ${request.patientFirstName} am ${formattedDate} um ${formattedTime}. – ${hospitalName}`
              : `Surgery confirmed at ${hospitalName}: ${request.patientLastName}, ${request.patientFirstName} on ${formattedDate} at ${formattedTime}. - ${hospitalName}`);
          await sendSms(
            request.surgeonPhone,
            smsText,
            request.hospitalId
          );

          await storage.updateExternalSurgeryRequest(id, {
            confirmationSmsSent: true,
          });
        } catch (smsError) {
          logger.error("Error sending confirmation SMS:", smsError);
        }
      }
    }
    
    res.json({ 
      success: true, 
      surgeryId: surgery.id,
      patientId,
    });
  } catch (error) {
    logger.error("Error scheduling surgery:", error);
    res.status(500).json({ message: "Failed to schedule surgery" });
  }
});

router.get('/api/hospitals/:hospitalId/external-surgery-token', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    res.json({ token: hospital.externalSurgeryToken || null, notificationEmail: hospital.externalSurgeryNotificationEmail || null });
  } catch (error) {
    logger.error("Error fetching token:", error);
    res.status(500).json({ message: "Failed to fetch token" });
  }
});

router.post('/api/hospitals/:hospitalId/external-surgery-token', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const token = nanoid(24);
    
    const hospital = await storage.updateHospital(hospitalId, {
      externalSurgeryToken: token,
    });
    
    res.json({ token: hospital.externalSurgeryToken });
  } catch (error) {
    logger.error("Error generating token:", error);
    res.status(500).json({ message: "Failed to generate token" });
  }
});

router.delete('/api/hospitals/:hospitalId/external-surgery-token', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied" });
    }
    
    await storage.updateHospital(hospitalId, {
      externalSurgeryToken: null,
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting token:", error);
    res.status(500).json({ message: "Failed to delete token" });
  }
});

export default router;
