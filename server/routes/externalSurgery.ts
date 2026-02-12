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
  surgeryName: z.string().min(1, "Surgery name is required"),
  surgeryDurationMinutes: z.number().min(15).max(720),
  withAnesthesia: z.boolean(),
  surgeryNotes: z.string().optional(),
  wishedDate: z.string().min(1, "Wished date is required"),
  patientFirstName: z.string().min(1, "Patient first name is required"),
  patientLastName: z.string().min(1, "Patient last name is required"),
  patientBirthday: z.string().min(1, "Patient birthday is required"),
  patientEmail: z.string().optional().nullable(),
  patientPhone: z.string().min(5, "Patient phone is required"),
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
    console.error("Error fetching external surgery form:", error);
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
          console.log('[ExternalSurgery] No OR-admin users found for hospital', result.hospital.id);
          return;
        }

        const baseUrl = process.env.PRODUCTION_URL || process.env.PUBLIC_URL || 'http://localhost:5000';
        const deepLinkUrl = `${baseUrl}/anesthesia/op?openRequests=true`;
        const patientName = `${parsed.data.patientLastName}, ${parsed.data.patientFirstName}`;
        const surgeonName = `Dr. ${parsed.data.surgeonLastName}, ${parsed.data.surgeonFirstName}`;
        const wishedDate = parsed.data.wishedDate || '';

        for (const admin of orAdmins) {
          if (!admin.email) continue;
          const userName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || 'Admin';
          sendExternalSurgeryRequestNotification(
            admin.email,
            userName,
            result.hospital.name,
            patientName,
            parsed.data.surgeryName,
            surgeonName,
            wishedDate,
            deepLinkUrl,
            'de'
          ).catch(err => console.error('[ExternalSurgery] Failed to send notification to', admin.email, err));
        }
        console.log(`[ExternalSurgery] Sent notifications to ${orAdmins.length} OR-admin(s) for hospital ${result.hospital.name}`);
      } catch (err) {
        console.error('[ExternalSurgery] Error sending admin notifications:', err);
      }
    })();
  } catch (error) {
    console.error("Error submitting external surgery request:", error);
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
    console.error("Error generating upload URL:", error);
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
    console.error("Error saving document:", error);
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
    console.error("Error fetching external surgery requests:", error);
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
    console.error("Error fetching pending count:", error);
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
    console.error("Error fetching request:", error);
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
    console.error("Error updating request:", error);
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
    
    // Create or find patient
    let patientId = request.patientId;
    if (!patientId) {
      const patientNumber = await storage.generatePatientNumber(request.hospitalId);
      const patient = await storage.createPatient({
        hospitalId: request.hospitalId,
        firstName: request.patientFirstName,
        surname: request.patientLastName,
        birthday: request.patientBirthday,
        patientNumber,
        sex: 'O',
        email: request.patientEmail || undefined,
        phone: request.patientPhone,
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
    
    // Check if a user with matching email + firstName + lastName already exists
    const existingSurgeon = await storage.findUserByEmailAndName(
      request.surgeonEmail,
      request.surgeonFirstName,
      request.surgeonLastName
    );
    
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
      patientId,
      surgeryRoomId: surgeryRoomId || null,
      plannedDate: new Date(plannedDate),
      plannedSurgery: request.surgeryName,
      surgeon: surgeonFullName,
      surgeonId: surgeonUserId,
      notes: request.surgeryNotes || '',
      admissionTime: admissionTime ? new Date(admissionTime) : undefined,
    });
    
    await storage.updateExternalSurgeryRequest(id, {
      status: 'scheduled',
      surgeryId: surgery.id,
      patientId,
      scheduledAt: new Date(),
      scheduledBy: userId,
    });
    
    // Transfer documents from external request to patient record
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
        description: `From external surgery request: ${request.surgeryName}`,
        uploadedBy: userId,
      });
    }
    
    if (sendConfirmation) {
      const hospital = await storage.getHospital(request.hospitalId);
      const hospitalName = hospital?.name || 'the hospital';
      const formattedDate = new Date(plannedDate).toLocaleDateString('de-CH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      
      if (request.surgeonEmail) {
        try {
          const resendApiKey = process.env.RESEND_API_KEY;
          if (resendApiKey) {
            const resend = new Resend(resendApiKey);
            await resend.emails.send({
              from: 'noreply@viali.ch',
              to: request.surgeonEmail,
              subject: `Surgery Confirmed - ${request.patientLastName}, ${request.patientFirstName}`,
              html: `
                <h2>Surgery Reservation Confirmed</h2>
                <p>Dear Dr. ${request.surgeonLastName},</p>
                <p>Your surgery reservation request has been confirmed at ${hospitalName}.</p>
                <h3>Details:</h3>
                <ul>
                  <li><strong>Patient:</strong> ${request.patientLastName}, ${request.patientFirstName}</li>
                  <li><strong>Surgery:</strong> ${request.surgeryName}</li>
                  <li><strong>Date:</strong> ${formattedDate}</li>
                  <li><strong>Duration:</strong> ${request.surgeryDurationMinutes} minutes</li>
                  <li><strong>Anesthesia:</strong> ${request.withAnesthesia ? 'Yes' : 'No'}</li>
                </ul>
                <p>If you have any questions, please contact us directly.</p>
                <p>Best regards,<br>${hospitalName}</p>
              `,
            });
            
            await storage.updateExternalSurgeryRequest(id, {
              confirmationEmailSent: true,
            });
          }
        } catch (emailError) {
          console.error("Error sending confirmation email:", emailError);
        }
      }
      
      if (request.surgeonPhone && (await isSmsConfiguredForHospital(request.hospitalId) || isSmsConfigured())) {
        try {
          await sendSms(
            request.surgeonPhone,
            `Surgery confirmed at ${hospitalName}: ${request.patientLastName}, ${request.patientFirstName} on ${formattedDate}. - ${hospitalName}`,
            request.hospitalId
          );
          
          await storage.updateExternalSurgeryRequest(id, {
            confirmationSmsSent: true,
          });
        } catch (smsError) {
          console.error("Error sending confirmation SMS:", smsError);
        }
      }
    }
    
    res.json({ 
      success: true, 
      surgeryId: surgery.id,
      patientId,
    });
  } catch (error) {
    console.error("Error scheduling surgery:", error);
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
    
    res.json({ token: hospital.externalSurgeryToken || null });
  } catch (error) {
    console.error("Error fetching token:", error);
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
    console.error("Error generating token:", error);
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
    console.error("Error deleting token:", error);
    res.status(500).json({ message: "Failed to delete token" });
  }
});

export default router;
