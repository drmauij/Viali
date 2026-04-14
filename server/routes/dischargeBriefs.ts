import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth/google";
import {
  requireWriteAccess,
  requireHospitalAccess,
  requireHospitalAdmin,
  anonymizeWithOpenMed,
  logAiOutbound,
} from "../utils";
import { z, ZodError } from "zod";
import OpenAI from "openai";
import { Resend } from "resend";
import logger from "../logger";
import {
  getDischargeBriefsForPatient,
  getDischargeBriefById,
  createDischargeBrief,
  updateDischargeBrief,
  deleteDischargeBrief,
  lockDischargeBrief,
  unlockDischargeBrief,
  shareDischargeBrief,
  unshareDischargeBrief,
  getDischargeBriefTemplates,
  getAllDischargeBriefTemplates,
  getDischargeBriefTemplateById,
  createDischargeBriefTemplate,
  updateDischargeBriefTemplate,
  deleteDischargeBriefTemplate,
  getDischargeBriefAuditTrail,
  getUserUnitIds,
} from "../storage/dischargeBriefs";
import { createAuditLog } from "../storage/anesthesia";
import { getPatient } from "../storage/anesthesia";
import { storage, db } from "../storage";
import { patients, patientQuestionnaireLinks, hospitals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendSms } from "../sms";
import {
  collectAnesthesiaRecordData,
  collectDischargeMedicationsData,
  collectFollowUpAppointmentsData,
  collectPatientNotesData,
  collectSurgeryNotesData,
  collectSurgeryData,
  collectStaffNames,
  serializeBlocksToText,
  buildKnownValues,
  getAvailableDataBlocks,
  getSystemPrompt,
  buildUserMessageSuffix,
} from "../utils/dischargeBriefData";

/** Format a date string (YYYY-MM-DD or ISO) per hospital dateFormat setting. */
function formatDateByHospital(dateStr: string, format?: string | null): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (format === "american") {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }
  // Default: european dd.MM.yyyy
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

const MISTRAL_TEXT_BASE_URL = "https://api.mistral.ai/v1";

function getMistralTextClient(): OpenAI {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return new OpenAI({ apiKey, baseURL: MISTRAL_TEXT_BASE_URL });
}

function getMistralTextModel(): string {
  return process.env.MISTRAL_TEXT_MODEL || "mistral-small-latest";
}

const router = Router();

// ========== BRIEF ENDPOINTS ==========

// List briefs for a patient
router.get(
  "/api/patients/:patientId/discharge-briefs",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const briefs = await getDischargeBriefsForPatient(req.params.patientId);
      res.json(briefs);
    } catch (error: any) {
      logger.error("Error fetching discharge briefs:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Preview available data blocks
router.get(
  "/api/patients/:patientId/discharge-brief-data",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const hospitalId =
        req.headers["x-active-hospital-id"] as string;
      const surgeryId = req.query.surgeryId as string | undefined;
      const hospital = await storage.getHospital(hospitalId);
      const blocks = await getAvailableDataBlocks(
        req.params.patientId,
        hospitalId,
        surgeryId,
        hospital?.timezone || "Europe/Zurich",
      );
      res.json(blocks);
    } catch (error: any) {
      logger.error("Error fetching discharge brief data:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Get single brief
router.get(
  "/api/discharge-briefs/:id",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      res.json(brief);
    } catch (error: any) {
      logger.error("Error fetching discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

const BRIEF_TYPE_VALUES = [
  "surgery_discharge",
  "anesthesia_discharge",
  "anesthesia_overnight_discharge",
  "prescription",
  "surgery_report",
  "surgery_estimate",
  "generic",
] as const;

const briefTypeEnum = z.enum(BRIEF_TYPE_VALUES);

const VISIBILITY_VALUES = ["personal", "unit", "hospital"] as const;
const visibilityEnum = z.enum(VISIBILITY_VALUES);

// Generate discharge brief (wizard submit)
const generateSchema = z.object({
  blocks: z.array(z.string()).min(1),
  briefType: briefTypeEnum,
  language: z.enum(["de", "en", "fr", "it"]).default("de"),
  templateId: z.string().nullable().optional(),
  surgeryId: z.string().nullable().optional(),
  annotations: z.string().nullable().optional(),
  selectedNoteIds: z.array(z.string()).nullable().optional(),
  selectedMedicationSlotIds: z.array(z.string()).nullable().optional(),
  selectedAppointmentIds: z.array(z.string()).nullable().optional(),
});

router.post(
  "/api/patients/:patientId/discharge-briefs/generate",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const parsed = generateSchema.parse(req.body);
      const { blocks, briefType, language, templateId, surgeryId, annotations, selectedNoteIds, selectedMedicationSlotIds, selectedAppointmentIds } = parsed;
      const patientId = req.params.patientId;
      const hospitalId = req.headers["x-active-hospital-id"] as string;
      const userId = req.user?.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID required" });
      }

      // 1. Fetch patient + hospital (needed for metadata injection + anonymization)
      const patient = await getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }
      const hospital = await storage.getHospital(hospitalId);
      const tz = hospital?.timezone || "Europe/Zurich";

      // 2. Collect data from selected blocks
      const dataBlocks: (string | null)[] = [];

      // For prescriptions, prepend patient metadata so the AI has actual values
      if (briefType === "prescription") {
        const patientFullName = `${patient.firstName} ${patient.surname}`;
        const formattedBirthday = formatDateByHospital(patient.birthday, hospital?.dateFormat);
        const formattedToday = formatDateByHospital(new Date().toISOString(), hospital?.dateFormat);
        dataBlocks.push(
          `## Patient Metadata\nPatient Name: ${patientFullName}\nDate of Birth: ${formattedBirthday}\nPrescription Date: ${formattedToday}`,
        );
      }

      for (const block of blocks) {
        switch (block) {
          case "anesthesia_record":
            if (surgeryId) {
              dataBlocks.push(await collectAnesthesiaRecordData(surgeryId, tz));
            }
            break;
          case "surgery_notes":
            if (surgeryId) {
              dataBlocks.push(await collectSurgeryNotesData(surgeryId, tz));
            }
            break;
          case "surgery_details":
            if (surgeryId) {
              dataBlocks.push(await collectSurgeryData(surgeryId, tz));
            }
            break;
          case "patient_notes":
            dataBlocks.push(
              await collectPatientNotesData(patientId, selectedNoteIds ?? undefined, tz),
            );
            break;
          case "discharge_medications":
            dataBlocks.push(
              await collectDischargeMedicationsData(patientId, hospitalId, selectedMedicationSlotIds ?? undefined),
            );
            break;
          case "follow_up_appointments":
            dataBlocks.push(
              await collectFollowUpAppointmentsData(patientId, hospitalId, selectedAppointmentIds ?? undefined, tz),
            );
            break;
        }
      }

      // 3. Serialize to text
      const serializedText = serializeBlocksToText(dataBlocks);

      if (!serializedText.trim()) {
        return res.status(400).json({ message: "No data available for the selected blocks" });
      }

      // 4. Build known values for anonymization
      const staffNames = await collectStaffNames(patientId, hospitalId, surgeryId);
      const knownValues = buildKnownValues(patient, hospital, staffNames);

      // 5. Anonymize (known-values + regex + OpenMed ML)
      const { text: safeText, restore, summary } = await anonymizeWithOpenMed(serializedText, { knownValues });

      // 5. Get template content if selected
      let templateContent: string | null = null;
      if (templateId) {
        const template = await getDischargeBriefTemplateById(templateId);
        templateContent = template?.templateContent || null;
        logger.info(`Brief generation: templateId=${templateId}, templateFound=${!!template}, contentLength=${templateContent?.length ?? 0}`);
      }

      // 6. Build prompts
      const systemPrompt = getSystemPrompt(briefType, language, templateContent, blocks);

      let userMessage = safeText;
      if (annotations) {
        const { text: safeAnnotations } = await anonymizeWithOpenMed(annotations, { knownValues });
        userMessage += `\n\n## Additional Notes from Doctor\n${safeAnnotations}`;
      }

      // Reinforce mandatory clinical sections at the end of user message (recency bias)
      // Skip when a template is provided — the template defines the structure,
      // and the system prompt already instructs the AI to add missing clinical
      // sections. The REQUIRED suffix would override the template layout.
      if (!templateContent?.trim()) {
        const suffix = buildUserMessageSuffix(blocks, briefType);
        if (suffix) userMessage += suffix;
      }

      // 7. Create the brief record first (to get ID for audit linking)
      const brief = await createDischargeBrief({
        hospitalId,
        patientId,
        surgeryId: surgeryId || null,
        briefType,
        language,
        content: "", // Will be updated after AI response
        sourceDataSnapshot: {
          selectedBlocks: blocks,
          anonymizedText: safeText,
          annotations: annotations || undefined,
        },
        createdBy: userId,
        isLocked: false,
      });

      // 8. Log AI outbound
      await logAiOutbound({
        anonymizedText: userMessage,
        summary,
        userId,
        purpose: "discharge_brief_generation",
        service: "mistral",
        linkedRecordId: brief.id,
        linkedRecordType: "discharge_brief",
      });

      // 9. Call Mistral
      const mistral = getMistralTextClient();
      const response = await mistral.chat.completions.create({
        model: getMistralTextModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
      });

      let aiContent = response.choices[0]?.message?.content || "";
      // Strip markdown code fences the AI sometimes wraps around HTML
      aiContent = aiContent.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");

      // 10. Restore (de-anonymize)
      let restoredContent = restore(aiContent);

      // 11. Final pass: replace any remaining unreplaced placeholders with actual patient data
      const fallbacks: Record<string, string> = {
        NAME: `${patient.firstName} ${patient.surname}`,
        DATE: formatDateByHospital(new Date().toISOString(), hospital?.dateFormat),
      };
      if (patient.birthday) {
        // Birthday is typically DATE_1
        fallbacks.BIRTHDAY = formatDateByHospital(patient.birthday, hospital?.dateFormat);
      }
      restoredContent = restoredContent.replace(/\[([A-Z_]+)_\d+\]/g, (match, category) => {
        return fallbacks[category] || match;
      });

      // 12. Update brief with content
      const updatedBrief = await updateDischargeBrief(brief.id, {
        content: restoredContent,
      });

      // 12. Audit log for creation
      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "create",
        userId,
        oldValue: null,
        newValue: { briefType, language, blocks },
      });

      const fullBrief = await getDischargeBriefById(brief.id);
      res.json(fullBrief);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error generating discharge brief:", error);
      res.status(500).json({ message: error.message || "Failed to generate discharge brief" });
    }
  },
);

// Update brief content
router.patch(
  "/api/discharge-briefs/:id",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (brief.isLocked) {
        return res.status(403).json({ message: "Brief is locked. Unlock it first to edit." });
      }

      const updateSchema = z.object({
        content: z.string().optional(),
      });
      const parsed = updateSchema.parse(req.body);

      // Audit the edit
      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "update",
        userId: req.user?.id,
        oldValue: { content: brief.content },
        newValue: { content: parsed.content },
      });

      const updated = await updateDischargeBrief(req.params.id, parsed);
      res.json(updated);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error updating discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Sign + lock brief
router.post(
  "/api/discharge-briefs/:id/sign",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }

      const signSchema = z.object({
        signature: z.string().min(1, "Signature is required"),
        signAsUserId: z.string().min(1).optional(),
      });
      const { signature, signAsUserId } = signSchema.parse(req.body);

      const loggedInUserId = req.user?.id;
      const signerId = signAsUserId || loggedInUserId;
      const locked = await lockDischargeBrief(req.params.id, signerId, signature);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "lock",
        userId: loggedInUserId,
        oldValue: signAsUserId ? { signedAsUserId: signAsUserId } : null,
        newValue: { signedAt: locked.signedAt, signedBy: signerId },
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error signing discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Unlock brief
router.post(
  "/api/discharge-briefs/:id/unlock",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (!brief.isLocked) {
        return res.status(400).json({ message: "Brief is not locked" });
      }

      const unlockSchema = z.object({
        reason: z.string().min(1, "Unlock reason is required"),
      });
      const { reason } = unlockSchema.parse(req.body);

      const userId = req.user?.id;
      await unlockDischargeBrief(req.params.id, userId, reason);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "unlock",
        userId,
        oldValue: null,
        newValue: { reason },
        reason,
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error unlocking discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Share brief to patient portal
router.post(
  "/api/discharge-briefs/:id/share",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (!brief.isLocked) {
        return res.status(400).json({ message: "Only signed briefs can be shared" });
      }
      if (!brief.pdfUrl) {
        return res.status(400).json({ message: "Brief must have a PDF before sharing. Export PDF first." });
      }

      const userId = req.user?.id;
      await shareDischargeBrief(req.params.id, userId);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "update",
        userId,
        oldValue: { portalVisible: false },
        newValue: { portalVisible: true },
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      logger.error("Error sharing discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Unshare brief from patient portal
router.post(
  "/api/discharge-briefs/:id/unshare",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }

      const userId = req.user?.id;
      await unshareDischargeBrief(req.params.id);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "update",
        userId,
        oldValue: { portalVisible: true },
        newValue: { portalVisible: false },
      });

      const fullBrief = await getDischargeBriefById(req.params.id);
      res.json(fullBrief);
    } catch (error: any) {
      logger.error("Error unsharing discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Notify patient about shared document
router.post(
  "/api/discharge-briefs/:id/notify-patient",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const { method } = req.body; // "email" or "sms"
      if (!method || !["email", "sms"].includes(method)) {
        return res.status(400).json({ message: "method must be 'email' or 'sms'" });
      }

      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (!brief.portalVisible) {
        return res.status(400).json({ message: "Brief must be shared to portal before notifying" });
      }

      // Find patient contact info
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, brief.patientId));
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Find the patient's portal token for the link
      const [link] = await db
        .select()
        .from(patientQuestionnaireLinks)
        .where(eq(patientQuestionnaireLinks.patientId, brief.patientId))
        .orderBy(patientQuestionnaireLinks.createdAt)
        .limit(1);

      if (!link) {
        return res.status(400).json({ message: "Patient has no portal link" });
      }

      const portalUrl = `${process.env.APP_URL || "https://use.viali.app"}/patient-portal/${link.token}`;

      // Get hospital info for the notification
      const [hospital] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, brief.hospitalId));
      const hospitalName = hospital?.name || "Viali";
      const language = hospital?.defaultLanguage || "de";

      if (method === "email") {
        const email = patient.email;
        if (!email) {
          return res.status(400).json({ message: "Patient has no email address" });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey) {
          return res.status(500).json({ message: "Email service not configured" });
        }

        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@viali.ch";

        const subjects: Record<string, string> = {
          de: `Neues Dokument verfügbar — ${hospitalName}`,
          en: `New document available — ${hospitalName}`,
          fr: `Nouveau document disponible — ${hospitalName}`,
          it: `Nuovo documento disponibile — ${hospitalName}`,
        };

        const bodies: Record<string, string> = {
          de: `<p>Guten Tag</p><p>Ein neues Dokument wurde für Sie im Patientenportal bereitgestellt.</p><p><a href="${portalUrl}">Zum Patientenportal</a></p><p>Freundliche Grüsse<br/>${hospitalName}</p>`,
          en: `<p>Hello</p><p>A new document has been made available for you on the patient portal.</p><p><a href="${portalUrl}">Go to Patient Portal</a></p><p>Best regards<br/>${hospitalName}</p>`,
          fr: `<p>Bonjour</p><p>Un nouveau document a été mis à votre disposition sur le portail patient.</p><p><a href="${portalUrl}">Accéder au portail patient</a></p><p>Cordialement<br/>${hospitalName}</p>`,
          it: `<p>Buongiorno</p><p>Un nuovo documento è stato messo a disposizione nel portale pazienti.</p><p><a href="${portalUrl}">Vai al portale pazienti</a></p><p>Cordiali saluti<br/>${hospitalName}</p>`,
        };

        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: subjects[language] || subjects.de,
          html: bodies[language] || bodies.de,
        });
      } else {
        // SMS
        const phone = patient.phone;
        if (!phone) {
          return res.status(400).json({ message: "Patient has no phone number" });
        }

        const smsMessages: Record<string, string> = {
          de: `${hospitalName}: Ein neues Dokument ist für Sie im Patientenportal verfügbar. ${portalUrl}`,
          en: `${hospitalName}: A new document is available on your patient portal. ${portalUrl}`,
          fr: `${hospitalName}: Un nouveau document est disponible sur votre portail patient. ${portalUrl}`,
          it: `${hospitalName}: Un nuovo documento è disponibile nel portale pazienti. ${portalUrl}`,
        };

        const result = await sendSms(
          phone,
          smsMessages[language] || smsMessages.de,
          brief.hospitalId,
        );
        if (!result.success) {
          return res.status(500).json({ message: "Failed to send SMS: " + result.error });
        }
      }

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "update",
        userId: req.user?.id,
        oldValue: null,
        newValue: { notificationType: method },
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error notifying patient about shared brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Export PDF
router.post(
  "/api/discharge-briefs/:id/export-pdf",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }

      const patient = await getPatient(brief.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      const hospital = await storage.getHospital(brief.hospitalId);

      // Dynamic import to avoid loading jsPDF at module level
      const { renderDischargeBriefPdf } = await import("../utils/htmlToPdf");
      const pdfBuffer = await renderDischargeBriefPdf({
        content: brief.content || "",
        briefType: brief.briefType,
        patientName: `${patient.firstName} ${patient.surname}`,
        patientBirthday: patient.birthday,
        hospitalName: hospital?.name || hospital?.companyName || "",
        hospitalLogoUrl: hospital?.companyLogoUrl || undefined,
        hospitalStreet: hospital?.companyStreet || undefined,
        hospitalPostalCode: hospital?.companyPostalCode || undefined,
        hospitalCity: hospital?.companyCity || undefined,
        hospitalPhone: hospital?.companyPhone || undefined,
        hospitalEmail: hospital?.companyEmail || undefined,
        signature: brief.signature || undefined,
        signedBy: brief.signer
          ? (brief.signer.briefSignature || `${brief.signer.firstName || ""} ${brief.signer.lastName || ""}`.trim())
          : undefined,
        signedAt: brief.signedAt || undefined,
        dateFormat: hospital?.dateFormat || null,
        language: (hospital?.defaultLanguage as string) || 'de',
      });

      // Upload to S3
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorage = new ObjectStorageService();
      const s3Key = `discharge-briefs/${brief.id}.pdf`;

      await objectStorage.uploadBase64ToS3(
        pdfBuffer.toString("base64"),
        s3Key,
        "application/pdf",
      );

      // Save PDF URL
      await updateDischargeBrief(brief.id, { pdfUrl: s3Key } as any);

      // Return the PDF as download
      const downloadUrl = await objectStorage.getObjectDownloadURL(s3Key);
      res.json({ pdfUrl: downloadUrl, storageKey: s3Key });
    } catch (error: any) {
      logger.error("Error exporting discharge brief PDF:", error);
      res.status(500).json({ message: error.message || "Failed to export PDF" });
    }
  },
);

// Delete brief
router.delete(
  "/api/discharge-briefs/:id",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const brief = await getDischargeBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "Brief not found" });
      }
      if (brief.isLocked) {
        return res.status(403).json({ message: "Cannot delete a locked brief" });
      }

      await deleteDischargeBrief(req.params.id);

      await createAuditLog({
        recordType: "discharge_brief",
        recordId: brief.id,
        action: "delete",
        userId: req.user?.id,
        oldValue: { briefType: brief.briefType },
        newValue: null,
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting discharge brief:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Audit trail
router.get(
  "/api/discharge-briefs/:id/audit",
  isAuthenticated,
  requireHospitalAdmin,
  async (req: any, res: Response) => {
    try {
      const trail = await getDischargeBriefAuditTrail(req.params.id);
      res.json(trail);
    } catch (error: any) {
      logger.error("Error fetching audit trail:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// ========== FOLLOW-UP APPOINTMENT QUICK-ADD ==========

const quickAddAppointmentSchema = z.object({
  appointmentDate: z.string().min(1),
  startTime: z.string().min(1),
  notes: z.string().optional(),
  surgeryId: z.string().nullable().optional(),
});

router.post(
  "/api/patients/:patientId/follow-up-appointments",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res: Response) => {
    try {
      const parsed = quickAddAppointmentSchema.parse(req.body);
      const patientId = req.params.patientId;
      const hospitalId = req.headers["x-active-hospital-id"] as string;
      const userId = req.user?.id;

      if (!hospitalId) {
        return res.status(400).json({ message: "Hospital ID required" });
      }

      // Determine provider: surgeon from surgery if available, else current user
      let providerId = userId;
      if (parsed.surgeryId) {
        const { getSurgery } = await import("../storage/anesthesia");
        const surgery = await getSurgery(parsed.surgeryId);
        if (surgery?.surgeonId) {
          providerId = surgery.surgeonId;
        }
      }

      // Find a clinic unit for this hospital
      const { getUnits } = await import("../storage/hospitals");
      const allUnits = await getUnits(hospitalId);
      const clinicUnit = allUnits.find((u) => u.isClinicModule) ?? allUnits[0];
      if (!clinicUnit) {
        return res.status(400).json({ message: "No unit configured for this hospital" });
      }

      // Compute end time (startTime + 30min)
      const [hours, minutes] = parsed.startTime.split(":").map(Number);
      const endDate = new Date(2000, 0, 1, hours, minutes + 30);
      const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

      const { createClinicAppointment } = await import("../storage/clinic");
      const appointment = await createClinicAppointment({
        hospitalId,
        unitId: clinicUnit.id,
        appointmentType: "external",
        patientId,
        providerId,
        appointmentDate: parsed.appointmentDate,
        startTime: parsed.startTime,
        endTime,
        durationMinutes: 30,
        status: "confirmed",
        notes: parsed.notes || null,
        createdBy: userId,
      });

      // Send confirmation notification to patient (async, don't block response)
      const { sendAppointmentNotification } = await import("./clinic");
      sendAppointmentNotification(appointment.id, hospitalId, "confirmation");

      // Return with provider info for the client
      const { getClinicAppointment } = await import("../storage/clinic");
      const full = await getClinicAppointment(appointment.id);
      res.json(full ?? appointment);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error creating follow-up appointment:", error);
      res.status(500).json({ message: error.message || "Failed to create appointment" });
    }
  },
);

// ========== TEMPLATE ENDPOINTS ==========

// List templates for a hospital
router.get(
  "/api/discharge-brief-templates/:hospitalId",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const briefType = req.query.briefType as string | undefined;
      const userId = req.user?.id;
      const hospitalId = req.params.hospitalId;

      // Admin: skip visibility filter but still filter by briefType
      const role = req.headers["x-active-role"] as string;
      if (role === "admin") {
        const templates = await getDischargeBriefTemplates(hospitalId, briefType);
        return res.json(templates);
      }

      const userUnitIds = userId ? await getUserUnitIds(userId, hospitalId) : [];
      const templates = await getDischargeBriefTemplates(
        hospitalId,
        briefType,
        userId,
        userUnitIds,
      );
      res.json(templates);
    } catch (error: any) {
      logger.error("Error fetching discharge brief templates:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Create template
router.post(
  "/api/discharge-brief-templates",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const schema = z.object({
        hospitalId: z.string(),
        briefType: briefTypeEnum.nullable().optional(),
        name: z.string().min(1),
        description: z.string().optional(),
        templateContent: z.string().optional(),
        assignedUserId: z.string().nullable().optional(),
        procedureType: z.string().nullable().optional(),
        visibility: visibilityEnum.optional().default("personal"),
        sharedWithUnitId: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);

      // Non-admin cannot create hospital-visibility templates
      const role = req.headers["x-active-role"] as string;
      if (parsed.visibility === "hospital" && role !== "admin") {
        return res.status(403).json({ message: "Only admins can create hospital-wide templates" });
      }

      const template = await createDischargeBriefTemplate({
        ...parsed,
        assignedUserId: parsed.assignedUserId ?? req.user?.id,
        createdBy: req.user?.id,
      });
      res.json(template);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error creating discharge brief template:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Update template
router.patch(
  "/api/discharge-brief-templates/:id",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const template = await getDischargeBriefTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const role = req.headers["x-active-role"] as string;
      const userId = req.user?.id;

      // Owner or admin can modify
      if (role !== "admin" && template.assignedUserId !== userId) {
        return res.status(403).json({ message: "You can only edit your own templates" });
      }

      const schema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        templateContent: z.string().optional(),
        briefType: briefTypeEnum.nullable().optional(),
        assignedUserId: z.string().nullable().optional(),
        procedureType: z.string().nullable().optional(),
        visibility: visibilityEnum.optional(),
        sharedWithUnitId: z.string().nullable().optional(),
      });
      const parsed = schema.parse(req.body);

      // Non-admin cannot set visibility to hospital
      if (parsed.visibility === "hospital" && role !== "admin") {
        return res.status(403).json({ message: "Only admins can set hospital-wide visibility" });
      }

      const updated = await updateDischargeBriefTemplate(req.params.id, parsed);
      res.json(updated);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request", details: error.errors });
      }
      logger.error("Error updating discharge brief template:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Delete template
router.delete(
  "/api/discharge-brief-templates/:id",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const template = await getDischargeBriefTemplateById(req.params.id);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const role = req.headers["x-active-role"] as string;
      const userId = req.user?.id;

      // Owner or admin can delete
      if (role !== "admin" && template.assignedUserId !== userId) {
        return res.status(403).json({ message: "You can only delete your own templates" });
      }

      await deleteDischargeBriefTemplate(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting discharge brief template:", error);
      res.status(500).json({ message: error.message });
    }
  },
);

// Extract text content from uploaded document (PDF/DOCX) for template import
router.post(
  "/api/discharge-brief-templates/extract-text",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const { fileData, fileName, mimeType } = req.body;

      if (!fileData || !fileName) {
        return res.status(400).json({ message: "fileData and fileName are required" });
      }

      const buffer = Buffer.from(fileData, "base64");
      let rawText = "";

      // Extract raw text based on file type
      if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text;
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.toLowerCase().endsWith(".docx")
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } else if (
        mimeType === "application/msword" ||
        fileName.toLowerCase().endsWith(".doc")
      ) {
        // For old .doc files, try mammoth (limited support)
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } else if (mimeType?.startsWith("text/")) {
        rawText = buffer.toString("utf-8");
      } else {
        return res.status(400).json({ message: "Unsupported file type. Use PDF, DOCX, or text files." });
      }

      if (!rawText.trim()) {
        return res.status(400).json({ message: "Could not extract text from file" });
      }

      // Use Mistral to clean up extracted text — skip headers/footers/letterheads
      const mistral = getMistralTextClient();
      const response = await mistral.chat.completions.create({
        model: getMistralTextModel(),
        messages: [
          {
            role: "system",
            content: `You are a document content extractor. The user will provide raw text extracted from a medical discharge brief document.
Your job is to extract ONLY the body content of the discharge brief — the actual medical text that a doctor would write.

CRITICAL: You MUST preserve the original language of the document exactly. Do NOT translate any text. If the document is in German, return German. If in French, return French. If in Italian, return Italian.

SKIP and DO NOT include:
- Hospital letterheads, logos, headers
- Hospital addresses, phone numbers, fax numbers
- Page numbers, footers
- "Sehr geehrte Damen und Herren" or similar generic salutations (unless they are part of the actual brief structure)
- Signature blocks at the end (Dr. Name, stamps, etc.)

KEEP and INCLUDE:
- The full medical content: diagnosis, procedures, findings, recommendations
- Section headings within the brief
- Medical data, measurements, dates
- Post-operative instructions, medications
- Follow-up recommendations

Return ONLY the extracted body content as plain text. Preserve paragraph structure and section headings. Do NOT translate any text — keep everything in the original language.`,
          },
          {
            role: "user",
            content: rawText,
          },
        ],
        temperature: 0.1,
      });

      const cleanedText = response.choices[0]?.message?.content || rawText;

      res.json({ text: cleanedText });
    } catch (error: any) {
      logger.error("Error extracting text from document:", error);
      res.status(500).json({ message: error.message || "Failed to extract text from document" });
    }
  },
);

// Import a single file and auto-create a template (used by bulk import)
router.post(
  "/api/discharge-brief-templates/import-file",
  isAuthenticated,
  requireHospitalAccess,
  async (req: any, res: Response) => {
    try {
      const { fileData, fileName, mimeType, hospitalId, briefType } = req.body;

      if (!fileData || !fileName || !hospitalId) {
        return res.status(400).json({ message: "fileData, fileName, and hospitalId are required" });
      }

      const buffer = Buffer.from(fileData, "base64");
      let rawText = "";

      // Extract raw text
      if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text;
      } else if (
        mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.toLowerCase().endsWith(".docx") ||
        mimeType === "application/msword" ||
        fileName.toLowerCase().endsWith(".doc")
      ) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } else if (mimeType?.startsWith("text/")) {
        rawText = buffer.toString("utf-8");
      } else {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      if (!rawText.trim()) {
        return res.status(400).json({ message: "Could not extract text from file" });
      }

      // Single AI call: extract body content + generate name/description + detect brief type
      const mistral = getMistralTextClient();
      const response = await mistral.chat.completions.create({
        model: getMistralTextModel(),
        messages: [
          {
            role: "system",
            content: `You are a medical document analyzer. The user will provide raw text extracted from a medical discharge brief document.

CRITICAL: You MUST preserve the original language of the document. Do NOT translate any content, names, descriptions, or medical terms. If the document is in German, ALL output fields must be in German. If in French, all in French. If in Italian, all in Italian. Only the JSON keys and briefType enum values should be in English.

You must return a JSON object with exactly these fields:
{
  "name": "A short descriptive template name IN THE ORIGINAL LANGUAGE of the document (e.g. for German: 'Rhinoplastik Austrittsbericht', for English: 'Rhinoplasty Discharge Brief'). Max 60 chars.",
  "description": "A one-sentence description IN THE ORIGINAL LANGUAGE of what this template covers and when to use it. Max 150 chars.",
  "briefType": "One of: surgery_discharge, anesthesia_discharge, anesthesia_overnight_discharge, surgery_report, surgery_estimate, generic. Pick based on the document content.",
  "procedureType": "The medical procedure type if identifiable, IN THE ORIGINAL LANGUAGE (e.g. 'Rhinoplastik', 'Abdominoplastik' for German), or null if generic.",
  "content": "The cleaned body content of the document as clean HTML IN THE ORIGINAL LANGUAGE — strip all hospital headers, addresses, letterheads, page numbers, footers, and signature blocks. Keep only the medical brief content. Use <h2>/<h3> for section headings, <p> for paragraphs, <strong> for bold, <em> for italic, <ul><li> for bullet lists, <ol><li> for numbered lists, and <hr> for separators. Do NOT use markdown formatting. Do NOT translate any text."
}

Return ONLY valid JSON, no markdown fences.`,
          },
          {
            role: "user",
            content: rawText,
          },
        ],
        temperature: 0.1,
      });

      const aiText = response.choices[0]?.message?.content || "";

      // Parse AI response
      let parsed: any;
      try {
        // Strip markdown fences if present
        const cleaned = aiText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback: use raw text with file name as template name
        parsed = {
          name: fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
          description: "Imported from " + fileName,
          briefType: briefType || "surgery_discharge",
          procedureType: null,
          content: rawText,
        };
      }

      // Create the template — owned by the importing user
      const role = req.headers["x-active-role"] as string;
      const isAdmin = role === "admin";
      const template = await createDischargeBriefTemplate({
        hospitalId,
        briefType: briefType || parsed.briefType || "surgery_discharge",
        name: fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "),
        description: parsed.description || null,
        templateContent: parsed.content || rawText,
        procedureType: parsed.procedureType || null,
        assignedUserId: req.user?.id,
        visibility: isAdmin ? "hospital" : "personal",
        createdBy: req.user?.id,
      });

      res.json(template);
    } catch (error: any) {
      logger.error("Error importing template from file:", error);
      res.status(500).json({ message: error.message || "Failed to import template" });
    }
  },
);

export default router;
