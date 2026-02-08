import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { userMessageTemplates } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, getUserUnitForHospital } from "../utils";
import { z } from "zod";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { sendSms, isSmsConfigured, isSmsConfiguredForHospital } from "../sms";

const router = Router();

// ========== RATE LIMITING ==========
// Simple in-memory rate limiter for public endpoints
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter(options: { windowMs: number; maxRequests: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const token = req.params.token;
    
    // If token is required but missing, reject the request immediately
    // This prevents attackers from bypassing rate limiting by omitting the token
    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid or missing questionnaire token" });
    }
    
    // Use IP + token for specific throttling, with IP-only fallback for edge cases
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

// Rate limiters for different endpoint types
const questionnaireFetchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 30,     // 30 requests per minute
  keyPrefix: 'qfetch'
});

const questionnaireSaveLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 60,     // 60 saves per minute (auto-save friendly)
  keyPrefix: 'qsave'
});

const questionnaireSubmitLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour window
  maxRequests: 5,           // 5 submissions per hour
  keyPrefix: 'qsubmit'
});

const questionnaireUploadLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 20,     // 20 uploads per minute
  keyPrefix: 'qupload'
});

const generateLinkSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  surgeryId: z.string().optional().nullable(),
  expiresInDays: z.number().min(1).max(30).default(7),
  language: z.enum(['en', 'de']).default('de'),
});

const saveProgressSchema = z.object({
  patientFirstName: z.string().optional(),
  patientLastName: z.string().optional(),
  patientBirthday: z.string().optional(),
  patientEmail: z.string().optional(),
  patientPhone: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  allergiesNotes: z.string().optional(),
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string().optional(),
    frequency: z.string().optional(),
    reason: z.string().optional(),
  })).optional(),
  medicationsNotes: z.string().optional(),
  conditions: z.record(z.object({
    checked: z.boolean(),
    notes: z.string().optional(),
  })).optional(),
  smokingStatus: z.string().optional(),
  smokingDetails: z.string().optional(),
  alcoholStatus: z.string().optional(),
  alcoholDetails: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  previousSurgeries: z.string().optional(),
  previousAnesthesiaProblems: z.string().optional(),
  pregnancyStatus: z.string().optional(),
  breastfeeding: z.boolean().optional(),
  womanHealthNotes: z.string().optional(),
  additionalNotes: z.string().optional(),
  questionsForDoctor: z.string().optional(),
  // Dental status
  dentalIssues: z.record(z.boolean()).optional(),
  dentalNotes: z.string().optional(),
  // PONV & Transfusion
  ponvTransfusionIssues: z.record(z.boolean()).optional(),
  ponvTransfusionNotes: z.string().optional(),
  // Drug use
  drugUse: z.record(z.boolean()).optional(),
  drugUseDetails: z.string().optional(),
  // None flags (explicit confirmation that section has nothing to report)
  noAllergies: z.boolean().optional(),
  noMedications: z.boolean().optional(),
  noConditions: z.boolean().optional(),
  noSmokingAlcohol: z.boolean().optional(),
  noPreviousSurgeries: z.boolean().optional(),
  noAnesthesiaProblems: z.boolean().optional(),
  noDentalIssues: z.boolean().optional(),
  noPonvIssues: z.boolean().optional(),
  noDrugUse: z.boolean().optional(),
  // Outpatient caregiver
  outpatientCaregiverFirstName: z.string().optional(),
  outpatientCaregiverLastName: z.string().optional(),
  outpatientCaregiverPhone: z.string().optional(),
  currentStep: z.number().optional(),
  completedSteps: z.array(z.string()).optional(),
});

const submitQuestionnaireSchema = saveProgressSchema;

const createReviewSchema = z.object({
  mappings: z.record(z.string(), z.object({
    patientValue: z.string(),
    professionalField: z.string(),
    professionalValue: z.any(),
    notes: z.string().optional(),
  })).optional().nullable(),
  reviewNotes: z.string().optional(),
  preOpAssessmentId: z.string().optional().nullable(),
  status: z.enum(['pending', 'partial', 'completed']).optional(),
});

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

// ========== AUTHENTICATED ROUTES (for staff) ==========

// Generate a questionnaire link for a patient
router.post('/api/questionnaire/generate-link', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const parsed = generateLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { patientId, surgeryId, expiresInDays, language } = parsed.data;

    // Verify patient exists
    const patient = await storage.getPatient(patientId);
    if (!patient || patient.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Check for existing active link (not expired, not submitted, not reviewed)
    const existingLinks = await storage.getQuestionnaireLinksForPatient(patientId);
    const now = new Date();
    const activeLink = existingLinks.find(l => 
      l.hospitalId === hospitalId &&
      l.status !== 'expired' && 
      l.status !== 'submitted' &&
      l.status !== 'reviewed' &&
      l.expiresAt && new Date(l.expiresAt) > now
    );

    if (activeLink) {
      // Return existing active link instead of creating new one
      const baseUrl = process.env.PRODUCTION_URL || `https://${req.headers.host}`;
      const portalUrl = `${baseUrl}/patient/${activeLink.token}`;
      return res.json({ 
        link: activeLink, 
        url: portalUrl,
        expiresAt: activeLink.expiresAt,
        reused: true,
      });
    }

    // Generate unique token for new link
    const token = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    if (surgeryId) {
      const surgery = await storage.getSurgery(surgeryId);
      if (surgery && surgery.plannedDate) {
        const surgeryDeadline = new Date(surgery.plannedDate);
        surgeryDeadline.setDate(surgeryDeadline.getDate() + 1);
        if (surgeryDeadline > expiresAt) {
          expiresAt.setTime(surgeryDeadline.getTime());
        }
      }
    }

    const link = await storage.createQuestionnaireLink({
      token,
      hospitalId,
      patientId,
      surgeryId: surgeryId || null,
      createdBy: req.user.id,
      expiresAt,
      status: 'pending',
      language,
    });

    // Generate full URL - link to patient portal instead of questionnaire directly
    const baseUrl = process.env.PRODUCTION_URL || `https://${req.headers.host}`;
    const portalUrl = `${baseUrl}/patient/${token}`;

    res.json({ 
      link, 
      url: portalUrl,
      expiresAt,
      reused: false,
    });
  } catch (error) {
    console.error("Error generating questionnaire link:", error);
    res.status(500).json({ message: "Failed to generate questionnaire link" });
  }
});

// Get all questionnaire links for a patient
router.get('/api/questionnaire/patient/:patientId/links', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { patientId } = req.params;
    const links = await storage.getQuestionnaireLinksForPatient(patientId);
    
    // Filter to only links for this hospital
    const hospitalLinks = links.filter(l => l.hospitalId === hospitalId);
    
    // Enrich links with their response data (including response ID)
    const enrichedLinks = await Promise.all(
      hospitalLinks.map(async (link) => {
        const response = await storage.getQuestionnaireResponseByLinkId(link.id);
        return {
          ...link,
          response: response ? {
            id: response.id,
            allergies: response.allergies,
            allergiesNotes: response.allergiesNotes,
            medications: response.medications,
            medicationsNotes: response.medicationsNotes,
            conditions: response.conditions,
            smokingStatus: response.smokingStatus,
            smokingDetails: response.smokingDetails,
            alcoholStatus: response.alcoholStatus,
            alcoholDetails: response.alcoholDetails,
            height: response.height,
            weight: response.weight,
            previousSurgeries: response.previousSurgeries,
            previousAnesthesiaProblems: response.previousAnesthesiaProblems,
            pregnancyStatus: response.pregnancyStatus,
            breastfeeding: response.breastfeeding,
            womanHealthNotes: response.womanHealthNotes,
            additionalNotes: response.additionalNotes,
          } : undefined,
        };
      })
    );
    
    res.json(enrichedLinks);
  } catch (error) {
    console.error("Error fetching questionnaire links:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire links" });
  }
});

// Get all submitted questionnaire responses for hospital
router.get('/api/questionnaire/responses', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const status = req.query.status as string | undefined;
    const responses = await storage.getQuestionnaireResponsesForHospital(hospitalId, status);
    
    // Enrich with patient data
    const enrichedResponses = await Promise.all(
      responses.map(async (response) => {
        const patient = response.link.patientId 
          ? await storage.getPatient(response.link.patientId)
          : null;
        return {
          ...response,
          patient: patient ? {
            id: patient.id,
            firstName: patient.firstName,
            surname: patient.surname,
            patientNumber: patient.patientNumber,
            birthday: patient.birthday,
          } : null
        };
      })
    );
    
    res.json(enrichedResponses);
  } catch (error) {
    console.error("Error fetching questionnaire responses:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire responses" });
  }
});

// Get unassociated questionnaire responses (where patientId is null)
router.get('/api/questionnaire/unassociated', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const responses = await storage.getUnassociatedQuestionnaireResponsesForHospital(hospitalId);
    
    res.json(responses);
  } catch (error) {
    console.error("Error fetching unassociated questionnaire responses:", error);
    res.status(500).json({ message: "Failed to fetch unassociated responses" });
  }
});

// Associate a questionnaire response with a patient
router.post('/api/questionnaire/responses/:responseId/associate', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { responseId } = req.params;
    const { patientId } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    // Get the response and verify access
    const response = await storage.getQuestionnaireResponse(responseId);
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get the link to verify hospital access
    const link = await storage.getQuestionnaireLink(response.linkId);
    if (!link || link.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Verify the patient exists and belongs to this hospital
    const patient = await storage.getPatient(patientId);
    if (!patient || patient.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Associate the link with the patient
    const updatedLink = await storage.associateQuestionnaireWithPatient(link.id, patientId);

    res.json({ 
      success: true, 
      link: updatedLink,
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        surname: patient.surname,
        patientNumber: patient.patientNumber,
      }
    });
  } catch (error) {
    console.error("Error associating questionnaire with patient:", error);
    res.status(500).json({ message: "Failed to associate questionnaire" });
  }
});

// Get response details (for staff review)
router.get('/api/questionnaire/responses/:responseId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { responseId } = req.params;
    const response = await storage.getQuestionnaireResponse(responseId);
    
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get all hospital links to verify access
    const linkData = await storage.getQuestionnaireLinksForHospital(hospitalId);
    const matchingLink = linkData.find(l => l.id === response.linkId);
    
    if (!matchingLink || matchingLink.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get uploads
    const uploads = await storage.getQuestionnaireUploads(responseId);
    
    // Get review if exists
    const review = await storage.getQuestionnaireReview(responseId);
    
    // Get patient data
    const patient = matchingLink.patientId 
      ? await storage.getPatient(matchingLink.patientId)
      : null;

    res.json({
      response,
      link: matchingLink,
      uploads,
      review,
      patient: patient ? {
        id: patient.id,
        firstName: patient.firstName,
        surname: patient.surname,
        patientNumber: patient.patientNumber,
        birthday: patient.birthday,
        sex: patient.sex,
      } : null
    });
  } catch (error) {
    console.error("Error fetching response details:", error);
    res.status(500).json({ message: "Failed to fetch response details" });
  }
});

// Save review/mapping of questionnaire data
router.post('/api/questionnaire/responses/:responseId/review', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { responseId } = req.params;
    const response = await storage.getQuestionnaireResponse(responseId);
    
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { mappings, reviewNotes, preOpAssessmentId, status } = parsed.data;

    // Check if review already exists
    const existingReview = await storage.getQuestionnaireReview(responseId);
    
    // Type for mappings that matches the database schema
    type MappingsType = Record<string, {
      patientValue: string;
      professionalField: string;
      professionalValue: any;
      notes?: string;
    }>;

    if (existingReview) {
      // Update existing review
      const updated = await storage.updateQuestionnaireReview(existingReview.id, {
        mappings: (mappings || undefined) as MappingsType | undefined,
        reviewNotes,
        preOpAssessmentId,
        status: status || existingReview.status,
        completedAt: status === 'completed' ? new Date() : undefined,
      });

      // Audit logging for review update
      await storage.createAuditLog({
        recordType: 'questionnaire_review',
        recordId: existingReview.id,
        action: status === 'completed' ? 'complete' : 'update',
        userId: req.user.id,
        oldValue: { 
          status: existingReview.status,
          reviewNotes: existingReview.reviewNotes,
        },
        newValue: { 
          status: updated.status,
          reviewNotes: updated.reviewNotes,
          preOpAssessmentId: updated.preOpAssessmentId,
        },
      });

      return res.json(updated);
    }

    // Create new review
    const review = await storage.createQuestionnaireReview({
      responseId,
      reviewedBy: req.user.id,
      mappings: (mappings || undefined) as MappingsType | undefined,
      reviewNotes,
      preOpAssessmentId,
      status: status || 'pending',
    });

    // Audit logging for review creation
    await storage.createAuditLog({
      recordType: 'questionnaire_review',
      recordId: review.id,
      action: 'create',
      userId: req.user.id,
      oldValue: null,
      newValue: { 
        responseId,
        status: review.status,
        reviewNotes: review.reviewNotes,
      },
    });

    res.json(review);
  } catch (error) {
    console.error("Error saving review:", error);
    res.status(500).json({ message: "Failed to save review" });
  }
});

// Send questionnaire link via email
router.post('/api/questionnaire/links/:linkId/send-email', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { linkId } = req.params;
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email address required" });
    }

    // Get the link to verify it exists and get the token
    const link = await storage.getQuestionnaireLink(linkId);
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }
    
    if (link.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this link" });
    }

    // Get hospital info for the email
    const hospital = await storage.getHospital(hospitalId);
    
    // Get unit info for the help line phone number
    const unit = await storage.getUnit(unitId);
    const helpPhone = unit?.questionnairePhone || hospital?.companyPhone || null;
    
    // Get patient info if linked
    let patientName = "Patient";
    if (link.patientId) {
      const patient = await storage.getPatient(link.patientId);
      if (patient) {
        patientName = `${patient.firstName} ${patient.surname}`;
      }
    }

    const baseUrl = process.env.PRODUCTION_URL || (req.headers.host ? `https://${req.headers.host}` : 'http://localhost:5000');
    const portalUrl = `${baseUrl}/patient/${link.token}`;
    const expiryDate = link.expiresAt ? new Date(link.expiresAt).toLocaleDateString('de-DE') : '';
    
    // Build help contact section based on available phone
    const helpContactEN = helpPhone 
      ? `If you have any questions or need assistance, please call us at <strong>${helpPhone}</strong>.`
      : `If you have any questions, please contact our office.`;
    const helpContactDE = helpPhone 
      ? `Bei Fragen oder wenn Sie Hilfe benötigen, rufen Sie uns bitte an unter <strong>${helpPhone}</strong>.`
      : `Bei Fragen kontaktieren Sie bitte unser Büro.`;
    
    // Send bilingual email using Resend
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
      to: email,
      subject: `Pre-Op Questionnaire / Präoperativer Fragebogen - ${hospital?.name || 'Hospital'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <!-- English Section -->
          <div style="margin-bottom: 40px;">
            <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">🇬🇧 Pre-Operative Questionnaire</h2>
            <p>Dear ${patientName},</p>
            <p>You have been invited to complete a pre-operative questionnaire for your upcoming procedure at ${hospital?.name || 'our facility'}.</p>
            <p>Please click the button below to access and complete the questionnaire:</p>
            <p style="margin: 25px 0; text-align: center;">
              <a href="${portalUrl}" style="background-color: #0066cc; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Complete Questionnaire
              </a>
            </p>
            <p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser:</p>
            <p style="color: #0066cc; word-break: break-all; font-size: 12px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${portalUrl}</p>
            ${expiryDate ? `<p style="color: #666; font-size: 14px;">⏰ This link will expire on <strong>${expiryDate}</strong>.</p>` : ''}
            <p style="color: #666; font-size: 14px;">${helpContactEN}</p>
          </div>

          <hr style="border: none; border-top: 2px solid #eee; margin: 30px 0;" />

          <!-- German Section -->
          <div>
            <h2 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">🇩🇪 Präoperativer Fragebogen</h2>
            <p>Guten Tag ${patientName},</p>
            <p>Sie wurden eingeladen, einen präoperativen Fragebogen für Ihren bevorstehenden Eingriff bei ${hospital?.name || 'unserer Einrichtung'} auszufüllen.</p>
            <p>Bitte klicken Sie auf die Schaltfläche unten, um den Fragebogen aufzurufen und auszufüllen:</p>
            <p style="margin: 25px 0; text-align: center;">
              <a href="${portalUrl}" style="background-color: #0066cc; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Fragebogen ausfüllen
              </a>
            </p>
            <p style="font-size: 13px; color: #666;">Oder kopieren Sie diesen Link in Ihren Browser:</p>
            <p style="color: #0066cc; word-break: break-all; font-size: 12px; background: #f5f5f5; padding: 10px; border-radius: 4px;">${portalUrl}</p>
            ${expiryDate ? `<p style="color: #666; font-size: 14px;">⏰ Dieser Link ist gültig bis <strong>${expiryDate}</strong>.</p>` : ''}
            <p style="color: #666; font-size: 14px;">${helpContactDE}</p>
          </div>

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px; text-align: center;">
            This is an automated message from ${hospital?.name || 'Viali'}.<br/>
            Dies ist eine automatische Nachricht von ${hospital?.name || 'Viali'}.
          </p>
        </div>
      `,
    });
    
    // Record that email was sent on the questionnaire link
    await storage.updateQuestionnaireLink(linkId, {
      emailSent: true,
      emailSentAt: new Date(),
      emailSentTo: email,
      emailSentBy: req.user.id,
    });
    
    res.json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending questionnaire email:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
});

// Send questionnaire link via SMS
router.post('/api/questionnaire/links/:linkId/send-sms', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    if (!(await isSmsConfiguredForHospital(hospitalId))) {
      return res.status(503).json({ message: "SMS service is not configured" });
    }

    const { linkId } = req.params;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    // Get the link and verify it belongs to this hospital
    const link = await storage.getQuestionnaireLink(linkId);
    if (!link || link.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Questionnaire link not found" });
    }

    // Get hospital and unit info for the message
    const hospital = await storage.getHospital(hospitalId);
    const unit = await storage.getUnit(unitId);
    const helpPhone = unit?.questionnairePhone || hospital?.companyPhone || null;
    
    const baseUrl = process.env.PRODUCTION_URL || (req.headers.host ? `https://${req.headers.host}` : 'http://localhost:5000');
    const portalUrl = `${baseUrl}/patient/${link.token}`;
    
    // Build a short bilingual SMS message
    let message = `${hospital?.name || 'Hospital'}: Bitte füllen Sie Ihren präoperativen Fragebogen aus / Please complete your pre-op questionnaire:\n${portalUrl}`;
    
    if (helpPhone) {
      message += `\n\nBei Fragen / Questions: ${helpPhone}`;
    }
    
    const result = await sendSms(phone, message, hospitalId);
    
    if (!result.success) {
      return res.status(500).json({ message: `Failed to send SMS: ${result.error}` });
    }
    
    // Record that SMS was sent on the questionnaire link
    await storage.updateQuestionnaireLink(linkId, {
      smsSent: true,
      smsSentAt: new Date(),
      smsSentTo: phone,
      smsSentBy: req.user.id,
    });
    
    res.json({ message: "SMS sent successfully" });
  } catch (error) {
    console.error("Error sending questionnaire SMS:", error);
    res.status(500).json({ message: "Failed to send SMS" });
  }
});

// Endpoint to check if SMS is configured
router.get('/api/questionnaire/sms-status', isAuthenticated, async (req: any, res: Response) => {
  const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
  if (hospitalId) {
    const configured = await isSmsConfiguredForHospital(hospitalId);
    return res.json({ configured });
  }
  res.json({ configured: isSmsConfigured() });
});

// Invalidate/expire a questionnaire link
router.post('/api/questionnaire/links/:linkId/invalidate', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { linkId } = req.params;
    await storage.invalidateQuestionnaireLink(linkId);
    
    res.json({ message: "Link invalidated successfully" });
  } catch (error) {
    console.error("Error invalidating link:", error);
    res.status(500).json({ message: "Failed to invalidate link" });
  }
});

// ========== OPEN HOSPITAL LINK ROUTES (for public access without patient association) ==========

// Rate limiter for hospital open link
const hospitalLinkFetchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 30,
  keyPrefix: 'hlink'
});

// Get hospital info for open questionnaire (public)
router.get('/api/public/questionnaire/hospital/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid questionnaire link" });
    }
    
    const hospital = await storage.getHospitalByQuestionnaireToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Invalid questionnaire link" });
    }

    // Get hospital settings for form configuration
    const hospitalSettings = await storage.getHospitalAnesthesiaSettings(hospital.id);

    // Flatten illness lists and filter for patient-visible items
    const flatIllnessList = flattenIllnessLists(hospitalSettings?.illnessLists);
    const patientVisibleConditions = flatIllnessList
      .filter((item: any) => item.patientVisible !== false)
      .map((item: any) => ({
        id: item.id,
        label: item.patientLabel || item.label,
        labelDe: item.patientLabelDe || item.patientLabel || item.label,
        labelEn: item.patientLabelEn || item.label,
        helpText: item.patientHelpText,
        category: item.category,
      }));

    res.json({
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      isOpenLink: true,
      language: 'de', // Default language for open links
      conditions: patientVisibleConditions,
      medicationsList: [
        ...(hospitalSettings?.medicationLists?.anticoagulation?.map((item: any) => ({
          id: item.id,
          label: item.label,
          category: 'anticoagulation',
        })) || []),
        ...(hospitalSettings?.medicationLists?.general?.map((item: any) => ({
          id: item.id,
          label: item.label,
          category: 'general',
        })) || []),
      ],
    });
  } catch (error) {
    console.error("Error fetching hospital questionnaire info:", error);
    res.status(500).json({ message: "Failed to load questionnaire" });
  }
});

// Start a new questionnaire from open hospital link (creates link + response)
router.post('/api/public/questionnaire/hospital/:token/start', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid questionnaire link" });
    }
    
    const hospital = await storage.getHospitalByQuestionnaireToken(token);
    if (!hospital) {
      return res.status(404).json({ message: "Invalid questionnaire link" });
    }

    // Create a new questionnaire link without patient association
    const linkToken = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry for open links

    const link = await storage.createQuestionnaireLink({
      token: linkToken,
      hospitalId: hospital.id,
      patientId: null, // No patient association
      surgeryId: null,
      createdBy: null, // System-generated
      expiresAt,
      status: 'pending',
      language: 'de',
    });

    // Return the new questionnaire token for redirect
    res.json({
      questionnaireToken: linkToken,
      redirectUrl: `/questionnaire/${linkToken}`,
    });
  } catch (error) {
    console.error("Error starting hospital questionnaire:", error);
    res.status(500).json({ message: "Failed to start questionnaire" });
  }
});

// ========== PUBLIC ROUTES (for patients) ==========

// Helper to validate link is still usable (not expired/submitted/reviewed)
async function validateLinkForEdit(token: string): Promise<{ valid: true; link: any } | { valid: false; error: string; status: number }> {
  const link = await storage.getQuestionnaireLinkByToken(token);
  if (!link) {
    return { valid: false, error: "Questionnaire not found", status: 404 };
  }
  if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
    return { valid: false, error: "This questionnaire link has expired", status: 410 };
  }
  if (link.status === 'expired') {
    return { valid: false, error: "This questionnaire link has been expired", status: 410 };
  }
  if (link.status === 'submitted' || link.status === 'reviewed') {
    return { valid: false, error: "This questionnaire has already been submitted", status: 410 };
  }
  return { valid: true, link };
}

// Helper to flatten illness lists into array
function flattenIllnessLists(illnessLists: Record<string, any[]> | null | undefined): any[] {
  if (!illnessLists) return [];
  const result: any[] = [];
  for (const category of Object.keys(illnessLists)) {
    const items = illnessLists[category];
    if (Array.isArray(items)) {
      for (const item of items) {
        result.push({ ...item, category });
      }
    }
  }
  return result;
}

// Get questionnaire form configuration (public)
router.get('/api/public/questionnaire/:token', questionnaireFetchLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    // Check if expired
    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This questionnaire link has expired" });
    }

    // Check status
    if (link.status === 'expired') {
      return res.status(410).json({ message: "This questionnaire link has been expired" });
    }
    
    if (link.status === 'submitted' || link.status === 'reviewed') {
      return res.status(410).json({ message: "This questionnaire has already been submitted" });
    }

    // Get patient basic info (limited fields for privacy) if linked to a patient
    let patient = null;
    if (link.patientId) {
      patient = await storage.getPatient(link.patientId);
    }

    // Get hospital settings for form configuration
    const hospitalSettings = await storage.getHospitalAnesthesiaSettings(link.hospitalId);

    // Get existing response if any (for resume capability)
    const existingResponse = await storage.getQuestionnaireResponseByLinkId(link.id);

    // Get existing uploads if response exists
    const existingUploads = existingResponse 
      ? await storage.getQuestionnaireUploads(existingResponse.id)
      : [];

    // Flatten illness lists and filter for patient-visible items
    const flatIllnessList = flattenIllnessLists(hospitalSettings?.illnessLists);
    const patientVisibleConditions = flatIllnessList
      .filter((item: any) => item.patientVisible !== false)
      .map((item: any) => ({
        id: item.id,
        label: item.patientLabel || item.label,
        labelDe: item.patientLabelDe || item.patientLabel || item.label,
        labelEn: item.patientLabelEn || item.label,
        helpText: item.patientHelpText,
        category: item.category,
      }));

    res.json({
      linkId: link.id,
      language: link.language,
      patientFirstName: patient?.firstName || existingResponse?.patientFirstName,
      patientSurname: patient?.surname || existingResponse?.patientLastName,
      patientBirthday: patient?.birthday || existingResponse?.patientBirthday,
      patientPhone: patient?.phone || existingResponse?.patientPhone,
      patientEmail: patient?.email || existingResponse?.patientEmail,
      hospitalId: link.hospitalId,
      surgeryId: link.surgeryId,
      existingResponse: existingResponse ? {
        id: existingResponse.id,
        patientFirstName: existingResponse.patientFirstName,
        patientLastName: existingResponse.patientLastName,
        patientBirthday: existingResponse.patientBirthday,
        patientEmail: existingResponse.patientEmail,
        patientPhone: existingResponse.patientPhone,
        allergies: existingResponse.allergies,
        allergiesNotes: existingResponse.allergiesNotes,
        medications: existingResponse.medications,
        medicationsNotes: existingResponse.medicationsNotes,
        conditions: existingResponse.conditions,
        smokingStatus: existingResponse.smokingStatus,
        smokingDetails: existingResponse.smokingDetails,
        alcoholStatus: existingResponse.alcoholStatus,
        alcoholDetails: existingResponse.alcoholDetails,
        height: existingResponse.height,
        weight: existingResponse.weight,
        previousSurgeries: existingResponse.previousSurgeries,
        previousAnesthesiaProblems: existingResponse.previousAnesthesiaProblems,
        pregnancyStatus: existingResponse.pregnancyStatus,
        breastfeeding: existingResponse.breastfeeding,
        womanHealthNotes: existingResponse.womanHealthNotes,
        additionalNotes: existingResponse.additionalNotes,
        questionsForDoctor: existingResponse.questionsForDoctor,
        currentStep: existingResponse.currentStep,
        completedSteps: existingResponse.completedSteps,
      } : null,
      existingUploads: existingUploads.map(u => ({
        id: u.id,
        fileName: u.fileName,
        mimeType: u.mimeType,
        fileSize: u.fileSize,
        category: u.category,
        description: u.description,
      })),
      conditionsList: patientVisibleConditions,
      allergyList: hospitalSettings?.allergyList
        ?.filter((item: any) => item.patientVisible !== false)
        .map((item: any) => ({
          id: item.id,
          label: item.patientLabel || item.label,
          labelDe: item.patientLabelDe || item.patientLabel || item.label,
          labelEn: item.patientLabelEn || item.label,
          helpText: item.patientHelpText,
        })) || [],
      medicationsList: [
        ...(hospitalSettings?.medicationLists?.anticoagulation?.map((item: any) => ({
          id: item.id,
          label: item.label,
          category: 'anticoagulation',
        })) || []),
        ...(hospitalSettings?.medicationLists?.general?.map((item: any) => ({
          id: item.id,
          label: item.label,
          category: 'general',
        })) || []),
      ],
    });
  } catch (error) {
    console.error("Error fetching questionnaire config:", error);
    res.status(500).json({ message: "Failed to load questionnaire" });
  }
});

// Save progress (public, auto-save)
router.post('/api/public/questionnaire/:token/save', questionnaireSaveLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    // Validate link is still usable (fresh fetch to prevent stale-link exploitation)
    const validation = await validateLinkForEdit(token);
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.error });
    }
    const link = validation.link;

    const parsed = saveProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const data = parsed.data;

    // Check for existing response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);
    
    // Mark link as started if first save
    if (!response && link.status === 'pending') {
      await storage.updateQuestionnaireLink(link.id, { status: 'started' });
    }

    if (response) {
      // Update existing
      response = await storage.updateQuestionnaireResponse(response.id, {
        patientFirstName: data.patientFirstName ?? response.patientFirstName,
        patientLastName: data.patientLastName ?? response.patientLastName,
        patientBirthday: data.patientBirthday ?? response.patientBirthday,
        patientEmail: data.patientEmail ?? response.patientEmail,
        patientPhone: data.patientPhone ?? response.patientPhone,
        allergies: data.allergies ?? response.allergies,
        allergiesNotes: data.allergiesNotes ?? response.allergiesNotes,
        medications: data.medications ?? response.medications,
        medicationsNotes: data.medicationsNotes ?? response.medicationsNotes,
        conditions: data.conditions ?? response.conditions,
        smokingStatus: data.smokingStatus ?? response.smokingStatus,
        smokingDetails: data.smokingDetails ?? response.smokingDetails,
        alcoholStatus: data.alcoholStatus ?? response.alcoholStatus,
        alcoholDetails: data.alcoholDetails ?? response.alcoholDetails,
        height: data.height ?? response.height,
        weight: data.weight ?? response.weight,
        previousSurgeries: data.previousSurgeries ?? response.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems ?? response.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus ?? response.pregnancyStatus,
        breastfeeding: data.breastfeeding ?? response.breastfeeding,
        womanHealthNotes: data.womanHealthNotes ?? response.womanHealthNotes,
        additionalNotes: data.additionalNotes ?? response.additionalNotes,
        questionsForDoctor: data.questionsForDoctor ?? response.questionsForDoctor,
        dentalIssues: data.dentalIssues ?? response.dentalIssues,
        dentalNotes: data.dentalNotes ?? response.dentalNotes,
        ponvTransfusionIssues: data.ponvTransfusionIssues ?? response.ponvTransfusionIssues,
        ponvTransfusionNotes: data.ponvTransfusionNotes ?? response.ponvTransfusionNotes,
        drugUse: data.drugUse ?? response.drugUse,
        drugUseDetails: data.drugUseDetails ?? response.drugUseDetails,
        noAllergies: data.noAllergies ?? response.noAllergies,
        noMedications: data.noMedications ?? response.noMedications,
        noConditions: data.noConditions ?? response.noConditions,
        noSmokingAlcohol: data.noSmokingAlcohol ?? response.noSmokingAlcohol,
        noPreviousSurgeries: data.noPreviousSurgeries ?? response.noPreviousSurgeries,
        noAnesthesiaProblems: data.noAnesthesiaProblems ?? response.noAnesthesiaProblems,
        noDentalIssues: data.noDentalIssues ?? response.noDentalIssues,
        noPonvIssues: data.noPonvIssues ?? response.noPonvIssues,
        noDrugUse: data.noDrugUse ?? response.noDrugUse,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName ?? response.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName ?? response.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone ?? response.outpatientCaregiverPhone,
        currentStep: data.currentStep ?? response.currentStep,
        completedSteps: data.completedSteps ?? response.completedSteps,
        lastSavedAt: new Date(),
      });
    } else {
      // Create new response
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        patientFirstName: data.patientFirstName,
        patientLastName: data.patientLastName,
        patientBirthday: data.patientBirthday,
        patientEmail: data.patientEmail,
        patientPhone: data.patientPhone,
        allergies: data.allergies,
        allergiesNotes: data.allergiesNotes,
        medications: data.medications,
        medicationsNotes: data.medicationsNotes,
        conditions: data.conditions,
        smokingStatus: data.smokingStatus,
        smokingDetails: data.smokingDetails,
        alcoholStatus: data.alcoholStatus,
        alcoholDetails: data.alcoholDetails,
        height: data.height,
        weight: data.weight,
        previousSurgeries: data.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus,
        breastfeeding: data.breastfeeding,
        womanHealthNotes: data.womanHealthNotes,
        additionalNotes: data.additionalNotes,
        questionsForDoctor: data.questionsForDoctor,
        dentalIssues: data.dentalIssues,
        dentalNotes: data.dentalNotes,
        ponvTransfusionIssues: data.ponvTransfusionIssues,
        ponvTransfusionNotes: data.ponvTransfusionNotes,
        drugUse: data.drugUse,
        drugUseDetails: data.drugUseDetails,
        noAllergies: data.noAllergies,
        noMedications: data.noMedications,
        noConditions: data.noConditions,
        noSmokingAlcohol: data.noSmokingAlcohol,
        noPreviousSurgeries: data.noPreviousSurgeries,
        noAnesthesiaProblems: data.noAnesthesiaProblems,
        noDentalIssues: data.noDentalIssues,
        noPonvIssues: data.noPonvIssues,
        noDrugUse: data.noDrugUse,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone,
        currentStep: data.currentStep ?? 0,
        completedSteps: data.completedSteps,
        lastSavedAt: new Date(),
      });
    }

    res.json({ 
      id: response.id,
      savedAt: response.lastSavedAt,
      currentStep: response.currentStep,
    });
  } catch (error) {
    console.error("Error saving progress:", error);
    res.status(500).json({ message: "Failed to save progress" });
  }
});

// Submit questionnaire (public)
router.post('/api/public/questionnaire/:token/submit', questionnaireSubmitLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const validation = await validateLinkForEdit(token);
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.error });
    }
    const link = validation.link;

    const parsed = submitQuestionnaireSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const data = parsed.data;

    // Get or create response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);
    const priorStatus = response ? 'started' : null; // Track actual prior state for audit

    if (response) {
      // Update with final data
      await storage.updateQuestionnaireResponse(response.id, {
        patientFirstName: data.patientFirstName ?? response.patientFirstName,
        patientLastName: data.patientLastName ?? response.patientLastName,
        patientBirthday: data.patientBirthday ?? response.patientBirthday,
        patientEmail: data.patientEmail ?? response.patientEmail,
        patientPhone: data.patientPhone ?? response.patientPhone,
        allergies: data.allergies ?? response.allergies,
        allergiesNotes: data.allergiesNotes ?? response.allergiesNotes,
        medications: data.medications ?? response.medications,
        medicationsNotes: data.medicationsNotes ?? response.medicationsNotes,
        conditions: data.conditions ?? response.conditions,
        smokingStatus: data.smokingStatus ?? response.smokingStatus,
        smokingDetails: data.smokingDetails ?? response.smokingDetails,
        alcoholStatus: data.alcoholStatus ?? response.alcoholStatus,
        alcoholDetails: data.alcoholDetails ?? response.alcoholDetails,
        height: data.height ?? response.height,
        weight: data.weight ?? response.weight,
        previousSurgeries: data.previousSurgeries ?? response.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems ?? response.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus ?? response.pregnancyStatus,
        breastfeeding: data.breastfeeding ?? response.breastfeeding,
        womanHealthNotes: data.womanHealthNotes ?? response.womanHealthNotes,
        additionalNotes: data.additionalNotes ?? response.additionalNotes,
        questionsForDoctor: data.questionsForDoctor ?? response.questionsForDoctor,
        dentalIssues: data.dentalIssues ?? response.dentalIssues,
        dentalNotes: data.dentalNotes ?? response.dentalNotes,
        ponvTransfusionIssues: data.ponvTransfusionIssues ?? response.ponvTransfusionIssues,
        ponvTransfusionNotes: data.ponvTransfusionNotes ?? response.ponvTransfusionNotes,
        drugUse: data.drugUse ?? response.drugUse,
        drugUseDetails: data.drugUseDetails ?? response.drugUseDetails,
        noAllergies: data.noAllergies ?? response.noAllergies,
        noMedications: data.noMedications ?? response.noMedications,
        noConditions: data.noConditions ?? response.noConditions,
        noSmokingAlcohol: data.noSmokingAlcohol ?? response.noSmokingAlcohol,
        noPreviousSurgeries: data.noPreviousSurgeries ?? response.noPreviousSurgeries,
        noAnesthesiaProblems: data.noAnesthesiaProblems ?? response.noAnesthesiaProblems,
        noDentalIssues: data.noDentalIssues ?? response.noDentalIssues,
        noPonvIssues: data.noPonvIssues ?? response.noPonvIssues,
        noDrugUse: data.noDrugUse ?? response.noDrugUse,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName ?? response.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName ?? response.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone ?? response.outpatientCaregiverPhone,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
      });
    } else {
      // Create new response with submitted data
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        patientFirstName: data.patientFirstName,
        patientLastName: data.patientLastName,
        patientBirthday: data.patientBirthday,
        patientEmail: data.patientEmail,
        patientPhone: data.patientPhone,
        allergies: data.allergies,
        allergiesNotes: data.allergiesNotes,
        medications: data.medications,
        medicationsNotes: data.medicationsNotes,
        conditions: data.conditions,
        smokingStatus: data.smokingStatus,
        smokingDetails: data.smokingDetails,
        alcoholStatus: data.alcoholStatus,
        alcoholDetails: data.alcoholDetails,
        height: data.height,
        weight: data.weight,
        previousSurgeries: data.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus,
        breastfeeding: data.breastfeeding,
        womanHealthNotes: data.womanHealthNotes,
        additionalNotes: data.additionalNotes,
        questionsForDoctor: data.questionsForDoctor,
        dentalIssues: data.dentalIssues,
        dentalNotes: data.dentalNotes,
        ponvTransfusionIssues: data.ponvTransfusionIssues,
        ponvTransfusionNotes: data.ponvTransfusionNotes,
        drugUse: data.drugUse,
        drugUseDetails: data.drugUseDetails,
        noAllergies: data.noAllergies,
        noMedications: data.noMedications,
        noConditions: data.noConditions,
        noSmokingAlcohol: data.noSmokingAlcohol,
        noPreviousSurgeries: data.noPreviousSurgeries,
        noAnesthesiaProblems: data.noAnesthesiaProblems,
        noDentalIssues: data.noDentalIssues,
        noPonvIssues: data.noPonvIssues,
        noDrugUse: data.noDrugUse,
        outpatientCaregiverFirstName: data.outpatientCaregiverFirstName,
        outpatientCaregiverLastName: data.outpatientCaregiverLastName,
        outpatientCaregiverPhone: data.outpatientCaregiverPhone,
        currentStep: 0,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
      });
    }

    // Submit the response
    const submitted = await storage.submitQuestionnaireResponse(response.id);

    // Note: Audit logging skipped for public submissions (no authenticated user)
    // The submission is already tracked via submittedAt, ipAddress, userAgent in the response record

    res.json({ 
      message: "Questionnaire submitted successfully",
      submittedAt: submitted.submittedAt,
    });
  } catch (error) {
    console.error("Error submitting questionnaire:", error);
    res.status(500).json({ message: "Failed to submit questionnaire" });
  }
});

// Get presigned URL for file upload (public)
router.post('/api/public/questionnaire/:token/upload-url', questionnaireUploadLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const validation = await validateLinkForEdit(token);
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.error });
    }
    const link = validation.link;

    const { fileName, mimeType } = req.body;
    if (!fileName) {
      return res.status(400).json({ message: "fileName is required" });
    }

    // Check S3 configuration
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      const missing = [];
      if (!endpoint) missing.push('S3_ENDPOINT');
      if (!accessKeyId) missing.push('S3_ACCESS_KEY');
      if (!secretAccessKey) missing.push('S3_SECRET_KEY');
      if (!bucket) missing.push('S3_BUCKET');
      console.error(`[Questionnaire Upload] Missing S3 configuration: ${missing.join(', ')}`);
      return res.status(503).json({ message: "File storage not configured" });
    }

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    // Generate unique key for the file
    const fileId = randomUUID();
    const extension = fileName.split('.').pop() || '';
    const objectName = extension ? `${fileId}.${extension}` : fileId;
    const key = `questionnaire-uploads/${link.hospitalId}/${link.id}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: mimeType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes

    // Generate the file URL that will be accessible after upload
    const fileUrl = `/objects/${key}`;

    res.json({
      uploadUrl,
      fileUrl,
      key,
    });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

// Upload file attachment (public)
router.post('/api/public/questionnaire/:token/upload', questionnaireUploadLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const validation = await validateLinkForEdit(token);
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.error });
    }
    const link = validation.link;

    // Get or create response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);
    if (!response) {
      // Create a minimal response to attach files to
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        currentStep: 0,
      });
    }

    // Handle file upload (expect file URL from object storage)
    const { fileName, fileUrl, mimeType, fileSize, category, description } = req.body;

    if (!fileName || !fileUrl) {
      return res.status(400).json({ message: "fileName and fileUrl are required" });
    }

    // Validate category
    const validCategories = ['medication_list', 'diagnosis', 'exam_result', 'other'] as const;
    const uploadCategory = validCategories.includes(category) ? category : 'other';

    const upload = await storage.addQuestionnaireUpload({
      responseId: response.id,
      fileName,
      fileUrl,
      mimeType: mimeType || null,
      fileSize: fileSize || null,
      category: uploadCategory,
      description: description || null,
    });

    res.json({ 
      id: upload.id,
      fileName: upload.fileName,
      createdAt: upload.createdAt,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Failed to upload file" });
  }
});

// Delete file attachment (public - only before submission)
router.delete('/api/public/questionnaire/:token/upload/:uploadId', questionnaireUploadLimiter, async (req: Request, res: Response) => {
  try {
    const { token, uploadId } = req.params;
    
    const validation = await validateLinkForEdit(token);
    if (!validation.valid) {
      return res.status(validation.status).json({ message: validation.error });
    }
    const link = validation.link;

    // Verify the upload belongs to this token's response
    const response = await storage.getQuestionnaireResponseByLinkId(link.id);
    if (!response) {
      return res.status(404).json({ message: "No questionnaire response found" });
    }

    const uploads = await storage.getQuestionnaireUploads(response.id);
    const uploadBelongsToResponse = uploads.some(u => u.id === uploadId);
    if (!uploadBelongsToResponse) {
      return res.status(403).json({ message: "Upload does not belong to this questionnaire" });
    }

    await storage.deleteQuestionnaireUpload(uploadId);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ message: "Failed to delete file" });
  }
});

// ========== AUTHENTICATED ROUTES FOR ACCESSING QUESTIONNAIRE UPLOADS ==========

// Get presigned download URL for a questionnaire upload file (authenticated)
router.get('/api/questionnaire/uploads/:uploadId/url', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { uploadId } = req.params;
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    // Get the upload record
    const upload = await storage.getQuestionnaireUploadById(uploadId);
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    // Get the response to verify hospital access
    const response = await storage.getQuestionnaireResponse(upload.responseId);
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get the link to verify hospital
    const link = await storage.getQuestionnaireLink(response.linkId);
    if (!link || link.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this upload" });
    }

    // Verify user has access to this hospital
    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    // Check S3 configuration
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return res.status(500).json({ message: "S3 storage not configured" });
    }

    // Extract the S3 key from the stored fileUrl
    // fileUrl is stored as /objects/questionnaire-uploads/hospitalId/linkId/filename
    const fileUrl = upload.fileUrl;
    const key = fileUrl.startsWith('/objects/') ? fileUrl.slice(9) : fileUrl;

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour

    res.json({
      downloadUrl,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      fileSize: upload.fileSize,
    });
  } catch (error) {
    console.error("Error generating download URL:", error);
    res.status(500).json({ message: "Failed to generate download URL" });
  }
});

// Stream questionnaire upload file directly (authenticated) - for embedding in UI
router.get('/api/questionnaire/uploads/:uploadId/file', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { uploadId } = req.params;
    // Accept hospital_id from query params (for direct URL access) or headers
    const hospitalId = (req.query.hospital_id || req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    // Get the upload record
    const upload = await storage.getQuestionnaireUploadById(uploadId);
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    // Get the response to verify hospital access
    const response = await storage.getQuestionnaireResponse(upload.responseId);
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get the link to verify hospital
    const link = await storage.getQuestionnaireLink(response.linkId);
    if (!link || link.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this upload" });
    }

    // Verify user has access to this hospital
    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    // Check S3 configuration
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return res.status(500).json({ message: "S3 storage not configured" });
    }

    // Extract the S3 key from the stored fileUrl
    const fileUrl = upload.fileUrl;
    const key = fileUrl.startsWith('/objects/') ? fileUrl.slice(9) : fileUrl;

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const s3Response = await s3Client.send(command);

    // Set response headers
    res.set({
      'Content-Type': upload.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${upload.fileName}"`,
      'Cache-Control': 'private, max-age=3600',
    });

    if (s3Response.ContentLength) {
      res.set('Content-Length', s3Response.ContentLength.toString());
    }

    // Stream the file
    if (s3Response.Body) {
      const { Readable } = await import("stream");
      if (s3Response.Body instanceof Readable) {
        s3Response.Body.pipe(res);
      } else {
        const webStream = s3Response.Body as ReadableStream;
        const nodeStream = Readable.fromWeb(webStream as any);
        nodeStream.pipe(res);
      }
    } else {
      res.status(500).json({ message: "Error streaming file" });
    }
  } catch (error: any) {
    console.error("Error streaming file:", error);
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ message: "File not found in storage" });
    } else if (!res.headersSent) {
      res.status(500).json({ message: "Failed to stream file" });
    }
  }
});

// Delete questionnaire upload (authenticated - for staff)
router.delete('/api/questionnaire/uploads/:uploadId', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { uploadId } = req.params;
    const hospitalId = (req.headers['x-active-hospital-id'] || req.headers['x-hospital-id']) as string;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    // Get the upload record
    const upload = await storage.getQuestionnaireUploadById(uploadId);
    if (!upload) {
      return res.status(404).json({ message: "Upload not found" });
    }

    // Get the response to verify hospital access
    const response = await storage.getQuestionnaireResponse(upload.responseId);
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get the link to verify hospital
    const link = await storage.getQuestionnaireLink(response.linkId);
    if (!link || link.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this upload" });
    }

    // Verify user has access to this hospital
    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    // Delete from S3 if configured
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (endpoint && accessKeyId && secretAccessKey && bucket) {
      try {
        const fileUrl = upload.fileUrl;
        const key = fileUrl.startsWith('/objects/') ? fileUrl.slice(9) : fileUrl;

        const s3Client = new S3Client({
          endpoint,
          region,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        });

        const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        const command = new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        });
        await s3Client.send(command);
      } catch (s3Error) {
        console.error("Error deleting file from S3:", s3Error);
        // Continue to delete from database even if S3 delete fails
      }
    }

    // Delete from database
    await storage.deleteQuestionnaireUpload(uploadId);

    res.json({ message: "Upload deleted successfully" });
  } catch (error) {
    console.error("Error deleting questionnaire upload:", error);
    res.status(500).json({ message: "Failed to delete upload" });
  }
});

// Get info flyers for the surgery's units (public endpoint for post-submission)
router.get('/api/public/questionnaire/:token/info-flyers', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    // Get the link to find the associated surgery
    const link = await storage.getQuestionnaireLink(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }
    
    const flyers: Array<{ unitName: string; unitType: string | null; flyerUrl: string }> = [];
    
    // If linked to a surgery, get the surgery's room and unit
    if (link.surgeryId) {
      const surgery = await storage.getSurgery(link.surgeryId);
      if (surgery && surgery.surgeryRoomId) {
        const room = await storage.getSurgeryRoomById(surgery.surgeryRoomId);
        if (room && room.unitId) {
          const unit = await storage.getUnit(room.unitId);
          if (unit && unit.infoFlyerUrl) {
            flyers.push({
              unitName: unit.name,
              unitType: unit.type,
              flyerUrl: unit.infoFlyerUrl,
            });
          }
        }
      }
    }
    
    // Also get the anesthesia module's info flyer (if different from surgery unit)
    const hospitalUnits = await storage.getUnits(link.hospitalId);
    // Check for anesthesia unit by type
    const anesthesiaUnit = hospitalUnits.find(u => u.type === 'anesthesia' && u.infoFlyerUrl);
    if (anesthesiaUnit && !flyers.some(f => f.flyerUrl === anesthesiaUnit.infoFlyerUrl)) {
      flyers.push({
        unitName: anesthesiaUnit.name,
        unitType: anesthesiaUnit.type,
        flyerUrl: anesthesiaUnit.infoFlyerUrl!,
      });
    }
    
    // Generate download URLs for each flyer
    const { ObjectStorageService } = await import('../objectStorage');
    const objectStorageService = new ObjectStorageService();
    
    const flyersWithUrls = await Promise.all(
      flyers.map(async (flyer) => {
        try {
          if (objectStorageService.isConfigured() && flyer.flyerUrl.startsWith('/objects/')) {
            const downloadUrl = await objectStorageService.getObjectDownloadURL(flyer.flyerUrl, 3600);
            return { ...flyer, downloadUrl };
          }
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        } catch (error) {
          console.error(`Error getting download URL for ${flyer.flyerUrl}:`, error);
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        }
      })
    );
    
    res.json({ flyers: flyersWithUrls });
  } catch (error) {
    console.error("Error fetching info flyers:", error);
    res.status(500).json({ message: "Failed to fetch info flyers" });
  }
});

// ========== PATIENT PORTAL (PUBLIC) ==========
// Get patient portal data by questionnaire token
// Returns limited surgery info for patient-facing portal
const patientPortalLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 30,     // 30 requests per minute
  keyPrefix: 'portal'
});

router.get('/api/patient-portal/:token', patientPortalLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid token" });
    }
    
    // Get the questionnaire link
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      console.log(`Patient portal: token ${token.substring(0, 10)}... not found in database`);
      return res.status(404).json({ message: "Link not found or expired", debug: { reason: "not_found", token: token.substring(0, 10) } });
    }
    
    // Check if link status is invalidated (always block)
    if (link.status === 'invalidated') {
      const debugInfo = { reason: "invalidated", status: link.status, expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null, surgeryId: link.surgeryId, patientId: link.patientId };
      console.log(`Patient portal: token ${token.substring(0, 10)}... rejected - invalidated`, debugInfo);
      return res.status(410).json({ message: "Link has expired", debug: debugInfo });
    }

    // Check if expired by time or status
    const isTimeExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
    const isStatusExpired = link.status === 'expired';
    
    if (isTimeExpired || isStatusExpired) {
      // Before rejecting, check if there's an upcoming surgery — if so, auto-extend and allow access
      let upcomingSurgeryDate: Date | null = null;
      
      if (link.surgeryId) {
        const surgery = await storage.getSurgery(link.surgeryId);
        if (surgery?.plannedDate && new Date(surgery.plannedDate) > new Date()) {
          upcomingSurgeryDate = new Date(surgery.plannedDate);
        }
      }
      
      if (!upcomingSurgeryDate && link.patientId) {
        const patientSurgeries = await storage.getSurgeries(link.hospitalId, {
          patientId: link.patientId,
          dateFrom: new Date(),
        });
        if (patientSurgeries.length > 0) {
          const sorted = patientSurgeries.sort((a, b) =>
            new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
          );
          upcomingSurgeryDate = new Date(sorted[0].plannedDate);
        }
      }
      
      if (upcomingSurgeryDate) {
        // Auto-extend the link to surgery date + 1 day
        const newExpiresAt = new Date(upcomingSurgeryDate);
        newExpiresAt.setDate(newExpiresAt.getDate() + 1);
        
        const updateData: any = { expiresAt: newExpiresAt };
        if (link.status === 'expired') {
          const existingResponse = await storage.getQuestionnaireResponseByLinkId(link.id);
          updateData.status = existingResponse ? 'started' : 'pending';
        }
        await storage.updateQuestionnaireLink(link.id, updateData);
        console.log(`Patient portal: token ${token.substring(0, 10)}... auto-extended to ${newExpiresAt.toISOString()} (surgery: ${upcomingSurgeryDate.toISOString()})`);
        // Continue to load the portal (don't return error)
      } else {
        const debugInfo = { reason: isTimeExpired ? "expired_by_time" : "expired_by_status", expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString() : null, now: new Date().toISOString(), status: link.status, surgeryId: link.surgeryId, patientId: link.patientId };
        console.log(`Patient portal: token ${token.substring(0, 10)}... expired, no upcoming surgery`, debugInfo);
        return res.status(410).json({ message: "Link has expired", debug: debugInfo });
      }
    }
    
    // Get hospital info
    const hospital = await storage.getHospital(link.hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    // Get patient info (limited fields only)
    let patientInfo = null;
    if (link.patientId) {
      const patient = await storage.getPatient(link.patientId);
      if (patient) {
        patientInfo = {
          firstName: patient.firstName,
          surname: patient.surname,
        };
      }
    }
    
    // Get surgery info if linked, or fallback to patient's next upcoming surgery
    let surgeryInfo = null;
    let surgeryCompleted = false;
    let resolvedSurgeryId = link.surgeryId;
    
    // If no surgery linked, try to find the patient's next upcoming surgery
    if (!resolvedSurgeryId && link.patientId) {
      const patientSurgeries = await storage.getSurgeries(link.hospitalId, {
        patientId: link.patientId,
        dateFrom: new Date(),
      });
      if (patientSurgeries.length > 0) {
        // Sort by planned date ascending to get the next upcoming one
        const sorted = patientSurgeries.sort((a, b) => 
          new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
        );
        resolvedSurgeryId = sorted[0].id;
      }
    }
    
    if (resolvedSurgeryId) {
      const surgery = await storage.getSurgery(resolvedSurgeryId);
      if (surgery) {
        // Get surgery room info
        let roomName = null;
        if (surgery.surgeryRoomId) {
          const room = await storage.getSurgeryRoomById(surgery.surgeryRoomId);
          roomName = room?.name || null;
        }
        
        // Get anesthesia type from anesthesia record if available
        let anesthesiaType = null;
        const anesthesiaRecordForType = await storage.getAnesthesiaRecord(resolvedSurgeryId);
        if (anesthesiaRecordForType?.anesthesiaType) {
          anesthesiaType = anesthesiaRecordForType.anesthesiaType;
        }
        
        // Get surgeon name
        let surgeonName = surgery.surgeon || null;
        if (surgery.surgeonId) {
          const surgeonUser = await storage.getUser(surgery.surgeonId);
          if (surgeonUser) {
            const fullName = [surgeonUser.firstName, surgeonUser.lastName].filter(Boolean).join(' ');
            surgeonName = fullName || surgeonName;
          }
        }
        
        surgeryInfo = {
          plannedDate: surgery.plannedDate,
          admissionTime: surgery.admissionTime,
          procedure: surgery.plannedSurgery,
          roomName,
          anesthesiaType,
          surgeonName,
        };
        
        // Check if surgery is actually completed
        // A surgery is completed only if its status indicates completion AND the date has passed
        // Having an anesthesia record alone doesn't mean surgery is done (records are created early for pre-op)
        const completedStatuses = ['completed', 'discharged', 'finished'];
        const surgeryDatePassed = new Date(surgery.plannedDate) < new Date();
        surgeryCompleted = completedStatuses.includes(surgery.status || '') || 
          (surgeryDatePassed && surgery.status !== 'planned' && surgery.status !== 'scheduled' && surgery.status !== 'confirmed');
      }
    }
    
    // Get info flyers
    const flyers: Array<{ unitName: string; unitType: string | null; flyerUrl: string; downloadUrl?: string }> = [];
    
    // Get unit info flyers based on surgery room
    if (surgeryInfo && resolvedSurgeryId) {
      const surgery = await storage.getSurgery(resolvedSurgeryId);
      if (surgery?.surgeryRoomId) {
        const room = await storage.getSurgeryRoomById(surgery.surgeryRoomId);
        if (room) {
          // Surgery rooms are linked to hospital, try to get anesthesia unit info flyer
          const hospitalUnitsForRoom = await storage.getUnits(room.hospitalId);
          const anesthesiaUnitForRoom = hospitalUnitsForRoom.find(u => u.type === 'anesthesia' && u.infoFlyerUrl);
          if (anesthesiaUnitForRoom) {
            flyers.push({
              unitName: anesthesiaUnitForRoom.name,
              unitType: anesthesiaUnitForRoom.type,
              flyerUrl: anesthesiaUnitForRoom.infoFlyerUrl!,
            });
          }
        }
      }
    }
    
    // Also get the anesthesia module's info flyer
    const hospitalUnits = await storage.getUnits(link.hospitalId);
    const anesthesiaUnit = hospitalUnits.find(u => u.type === 'anesthesia' && u.infoFlyerUrl);
    if (anesthesiaUnit && !flyers.some(f => f.flyerUrl === anesthesiaUnit.infoFlyerUrl)) {
      flyers.push({
        unitName: anesthesiaUnit.name,
        unitType: anesthesiaUnit.type,
        flyerUrl: anesthesiaUnit.infoFlyerUrl!,
      });
    }
    
    // Generate download URLs
    const { ObjectStorageService } = await import('../objectStorage');
    const objectStorageService = new ObjectStorageService();
    
    const flyersWithUrls = await Promise.all(
      flyers.map(async (flyer) => {
        try {
          if (objectStorageService.isConfigured() && flyer.flyerUrl.startsWith('/objects/')) {
            const downloadUrl = await objectStorageService.getObjectDownloadURL(flyer.flyerUrl, 3600);
            return { ...flyer, downloadUrl };
          }
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        } catch (error) {
          console.error(`Error getting download URL for ${flyer.flyerUrl}:`, error);
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        }
      })
    );
    
    // Get questionnaire status
    const response = await storage.getQuestionnaireResponseByLinkId(link.id);
    const questionnaireStatus = link.status === 'submitted' 
      ? 'completed' 
      : response 
        ? 'in_progress' 
        : 'not_started';
    
    res.json({
      token,
      language: link.language || 'de',
      hospital: {
        name: hospital.name,
        address: hospital.address,
        phone: hospital.companyPhone,
      },
      patient: patientInfo,
      surgery: surgeryInfo,
      surgeryCompleted,
      flyers: flyersWithUrls,
      questionnaireStatus,
      questionnaireUrl: `/questionnaire/${token}`,
    });
  } catch (error) {
    console.error("Error fetching patient portal data:", error);
    res.status(500).json({ message: "Failed to fetch portal data" });
  }
});

// ========== USER MESSAGE TEMPLATES ==========

router.get('/api/user/message-templates', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const templates = await db.select().from(userMessageTemplates)
      .where(eq(userMessageTemplates.userId, userId))
      .orderBy(userMessageTemplates.createdAt);
    res.json(templates);
  } catch (error) {
    console.error("Error fetching message templates:", error);
    res.status(500).json({ message: "Failed to fetch templates" });
  }
});

router.post('/api/user/message-templates', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const schema = z.object({
      title: z.string().min(1).max(100),
      body: z.string().min(1),
    });
    const parsed = schema.parse(req.body);
    const [template] = await db.insert(userMessageTemplates).values({
      userId,
      title: parsed.title,
      body: parsed.body,
    }).returning();
    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Error creating message template:", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

router.patch('/api/user/message-templates/:id', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const templateId = req.params.id;
    const schema = z.object({
      title: z.string().min(1).max(100).optional(),
      body: z.string().min(1).optional(),
    });
    const parsed = schema.parse(req.body);
    const [updated] = await db.update(userMessageTemplates)
      .set({ ...parsed, updatedAt: new Date() })
      .where(and(eq(userMessageTemplates.id, templateId), eq(userMessageTemplates.userId, userId)))
      .returning();
    if (!updated) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    console.error("Error updating message template:", error);
    res.status(500).json({ message: "Failed to update template" });
  }
});

router.delete('/api/user/message-templates/:id', isAuthenticated, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const templateId = req.params.id;
    const [deleted] = await db.delete(userMessageTemplates)
      .where(and(eq(userMessageTemplates.id, templateId), eq(userMessageTemplates.userId, userId)))
      .returning();
    if (!deleted) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting message template:", error);
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// ========== PATIENT PORTAL CONSENT ENDPOINTS ==========

const consentFetchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'cfetch'
});

const consentSignLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'csign'
});

router.get('/api/patient-portal/:token/consent-data', consentFetchLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Invalid link" });
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This link has expired" });
    }

    if (link.status === 'expired') {
      return res.status(410).json({ message: "This link has been expired" });
    }

    let surgeryId = link.surgeryId;
    if (!surgeryId && link.patientId) {
      const patientSurgeries = await storage.getSurgeries(link.hospitalId, {
        patientId: link.patientId,
        dateFrom: new Date(),
      });
      if (patientSurgeries.length > 0) {
        const sorted = patientSurgeries.sort((a, b) =>
          new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
        );
        surgeryId = sorted[0].id;
      }
    }
    if (!surgeryId) {
      return res.status(404).json({ message: "No surgery linked to this questionnaire" });
    }

    const assessment = await storage.getPreOpAssessment(surgeryId);
    if (!assessment) {
      return res.status(404).json({ message: "No pre-op assessment found for this surgery" });
    }

    const needsSignature = assessment.standBy === true && assessment.standByReason === 'signature_missing';
    const needsCallbackAppointment = assessment.standBy === true && assessment.standByReason === 'consent_required';

    const surgery = await storage.getSurgery(surgeryId);
    const patient = surgery ? await storage.getPatient(surgery.patientId) : null;
    const hospital = link.hospitalId ? await storage.getHospital(link.hospitalId) : null;

    res.json({
      consentData: {
        general: assessment.consentGiven ?? false,
        analgosedation: assessment.consentAnalgosedation ?? false,
        regional: assessment.consentRegional ?? false,
        installations: assessment.consentInstallations ?? false,
        icuAdmission: assessment.consentICU ?? false,
        notes: assessment.consentNotes ?? null,
        doctorSignature: assessment.consentDoctorSignature ?? null,
        date: assessment.consentDate ?? null,
      },
      patientSignature: assessment.patientSignature ?? null,
      signedByProxy: assessment.consentSignedByProxy ?? false,
      needsSignature,
      needsCallbackAppointment,
      callbackAppointmentSlots: assessment.callbackAppointmentSlots ?? null,
      callbackPhoneNumber: assessment.callbackPhoneNumber ?? null,
      callbackInvitationSentAt: assessment.callbackInvitationSentAt ?? null,
      patientName: patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() : null,
      hospitalName: hospital?.name ?? null,
      surgeryDescription: surgery?.plannedSurgery ?? null,
      consentRemoteSignedAt: assessment.consentRemoteSignedAt ?? null,
    });
  } catch (error) {
    console.error("Error fetching consent data:", error);
    res.status(500).json({ message: "Failed to fetch consent data" });
  }
});

const signConsentSchema = z.object({
  signature: z.string().min(1, "Signature is required"),
  signedByProxy: z.boolean().default(false),
  proxySignerName: z.string().optional(),
  proxySignerRelation: z.string().optional(),
  idFrontImage: z.string().min(1, "ID front image is required"),
  idBackImage: z.string().min(1, "ID back image is required"),
});

router.post('/api/patient-portal/:token/sign-consent', consentSignLimiter, async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Invalid link" });
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This link has expired" });
    }

    if (link.status === 'expired') {
      return res.status(410).json({ message: "This link has been expired" });
    }

    let surgeryId = link.surgeryId;
    if (!surgeryId && link.patientId) {
      const patientSurgeries = await storage.getSurgeries(link.hospitalId, {
        patientId: link.patientId,
        dateFrom: new Date(),
      });
      if (patientSurgeries.length > 0) {
        const sorted = patientSurgeries.sort((a, b) =>
          new Date(a.plannedDate).getTime() - new Date(b.plannedDate).getTime()
        );
        surgeryId = sorted[0].id;
      }
    }
    if (!surgeryId) {
      return res.status(404).json({ message: "No surgery linked to this questionnaire" });
    }

    const assessment = await storage.getPreOpAssessment(surgeryId);
    if (!assessment) {
      return res.status(404).json({ message: "No pre-op assessment found" });
    }

    if (!(assessment.standBy === true && assessment.standByReason === 'signature_missing')) {
      return res.status(400).json({ message: "This consent does not require a remote signature" });
    }

    if (assessment.consentRemoteSignedAt) {
      return res.status(400).json({ message: "This consent has already been signed remotely" });
    }

    const parsed = signConsentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
    }

    const { signature, signedByProxy, proxySignerName, proxySignerRelation, idFrontImage, idBackImage } = parsed.data;

    const assessmentUpdate: Record<string, any> = {
      patientSignature: signature,
      consentSignedByProxy: signedByProxy,
      consentSignerIdFrontUrl: idFrontImage,
      consentSignerIdBackUrl: idBackImage,
      consentRemoteSignedAt: new Date(),
      standBy: false,
      standByReason: null,
      standByReasonNote: null,
    };

    if (signedByProxy) {
      assessmentUpdate.consentProxySignerName = proxySignerName || null;
      assessmentUpdate.consentProxySignerRelation = proxySignerRelation || null;
    }

    await storage.updatePreOpAssessment(assessment.id, assessmentUpdate);

    res.json({ success: true, message: "Consent signed successfully" });
  } catch (error) {
    console.error("Error signing consent:", error);
    res.status(500).json({ message: "Failed to sign consent" });
  }
});

export default router;
