import { Router } from "express";
import type { Response, NextFunction } from "express";
import { db } from "../db";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import { leads, leadContacts, leadWebhookConfig, users, patients, clinicAppointments, referralEvents } from "@shared/schema";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import logger from "../logger";
import { createHash, randomBytes } from "crypto";
import { calculateNameSimilarity } from "../services/patientDeduplication";
import { normalizePhoneForMatching } from "../utils/normalizePhone";

const router = Router();

// --- Validation ---

const META_SOURCES = ["fb", "ig"] as const;

interface ValidatedLead {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  metaLeadId: string | null;
  metaFormId: string | null;
  operation: string | null;
  message: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  msclkid: string | null;
  igshid: string | null;
  li_fat_id: string | null;
  twclid: string | null;
}

export function validateLeadPayload(body: unknown): {
  success: boolean;
  data?: ValidatedLead;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Body must be a non-null object" };
  }

  const b = body as Record<string, unknown>;

  // source is required (any non-empty string)
  if (typeof b.source !== "string" || b.source.trim() === "") {
    return { success: false, error: "Missing or invalid field: source" };
  }

  const source = b.source.trim();
  const isMeta = META_SOURCES.includes(source as any);

  // first_name and last_name always required
  if (typeof b.first_name !== "string" || b.first_name.trim() === "") {
    return { success: false, error: "Missing or invalid field: first_name" };
  }
  if (typeof b.last_name !== "string" || b.last_name.trim() === "") {
    return { success: false, error: "Missing or invalid field: last_name" };
  }

  // Meta leads require lead_id, form_id, operation
  if (isMeta) {
    if (typeof b.lead_id !== "string" || b.lead_id.trim() === "") {
      return { success: false, error: "Missing or invalid field: lead_id (required for Meta leads)" };
    }
    if (typeof b.form_id !== "string" || b.form_id.trim() === "") {
      return { success: false, error: "Missing or invalid field: form_id (required for Meta leads)" };
    }
    if (typeof b.operation !== "string" || b.operation.trim() === "") {
      return { success: false, error: "Missing or invalid field: operation (required for Meta leads)" };
    }
  }

  // At least one contact method required
  const email = typeof b.email === "string" && b.email.trim() !== "" ? b.email.trim() : null;
  const phone = typeof b.phone === "string" && b.phone.trim() !== "" ? b.phone.trim() : null;
  if (!email && !phone) {
    return { success: false, error: "At least one of email or phone is required" };
  }

  const optStr = (key: string): string | null =>
    typeof b[key] === "string" && (b[key] as string).trim() !== "" ? (b[key] as string).trim() : null;

  return {
    success: true,
    data: {
      firstName: (b.first_name as string).trim(),
      lastName: (b.last_name as string).trim(),
      email,
      phone,
      source,
      metaLeadId: optStr("lead_id"),
      metaFormId: optStr("form_id"),
      operation: optStr("operation"),
      message: optStr("message"),
      utmSource: optStr("utm_source"),
      utmMedium: optStr("utm_medium"),
      utmCampaign: optStr("utm_campaign"),
      utmTerm: optStr("utm_term"),
      utmContent: optStr("utm_content"),
      gclid: optStr("gclid"),
      gbraid: optStr("gbraid"),
      wbraid: optStr("wbraid"),
      fbclid: optStr("fbclid"),
      ttclid: optStr("ttclid"),
      msclkid: optStr("msclkid"),
      igshid: optStr("igshid"),
      li_fat_id: optStr("li_fat_id"),
      twclid: optStr("twclid"),
    },
  };
}

// --- Helpers ---

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// --- Webhook endpoint ---

router.post("/api/webhooks/leads/:hospitalId", async (req, res) => {
  const { hospitalId } = req.params;
  const apiKey = req.query.key as string | undefined;

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  try {
    const [config] = await db
      .select()
      .from(leadWebhookConfig)
      .where(eq(leadWebhookConfig.hospitalId, hospitalId))
      .limit(1);

    if (!config || config.apiKey !== hashApiKey(apiKey)) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!config.enabled) {
      return res.status(403).json({ error: "Webhook is disabled for this hospital" });
    }

    const validation = validateLeadPayload(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const data = validation.data!;

    // Dedup: Meta leads by metaLeadId, website leads by email within 1 hour
    if (data.metaLeadId) {
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.hospitalId, hospitalId),
            eq(leads.metaLeadId, data.metaLeadId),
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(200).json({ status: "received", id: existing.id });
      }
    } else if (data.email) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [existing] = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            eq(leads.hospitalId, hospitalId),
            eq(leads.email, data.email),
            eq(leads.source, data.source),
            sql`${leads.createdAt} > ${oneHourAgo}`,
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(200).json({ status: "received", id: existing.id });
      }
    }

    const [inserted] = await db
      .insert(leads)
      .values({
        hospitalId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        operation: data.operation,
        message: data.message,
        source: data.source,
        metaLeadId: data.metaLeadId,
        metaFormId: data.metaFormId,
        status: "new",
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        utmTerm: data.utmTerm,
        utmContent: data.utmContent,
        gclid: data.gclid,
        gbraid: data.gbraid,
        wbraid: data.wbraid,
        fbclid: data.fbclid,
        ttclid: data.ttclid,
        msclkid: data.msclkid,
        igshid: data.igshid,
        li_fat_id: data.li_fat_id,
        twclid: data.twclid,
      })
      .returning({ id: leads.id });

    logger.info({ hospitalId, leadId: inserted.id, source: data.source }, "Lead received");

    return res.status(200).json({ status: "received", id: inserted.id });
  } catch (err) {
    logger.error({ err, hospitalId }, "Error processing lead webhook");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Auth middleware ---

async function isMarketingOrManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h =>
      h.id === hospitalId &&
      (h.role === 'admin' || h.role === 'manager' || h.role === 'marketing')
    );

    if (!hasAccess) {
      return res.status(403).json({ message: "Marketing or business manager access required" });
    }

    next();
  } catch (error) {
    logger.error("Error checking marketing access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// --- Valid contact outcomes ---

const VALID_CONTACT_OUTCOMES = ["reached", "no_answer", "wants_callback", "will_call_back", "needs_time"] as const;

// --- Internal API endpoints ---

// 1. List leads with contact summary
router.get(
  "/api/business/:hospitalId/leads",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const status = (req.query.status as string) || "all";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const before = req.query.before as string | undefined;

      const conditions = [eq(leads.hospitalId, hospitalId)];

      if (status !== "all") {
        conditions.push(eq(leads.status, status as any));
      }

      if (before) {
        conditions.push(lt(leads.createdAt, new Date(before)));
      }

      const leadRows = await db
        .select({
          id: leads.id,
          hospitalId: leads.hospitalId,
          firstName: leads.firstName,
          lastName: leads.lastName,
          email: leads.email,
          phone: leads.phone,
          operation: leads.operation,
          message: leads.message,
          source: leads.source,
          metaLeadId: leads.metaLeadId,
          metaFormId: leads.metaFormId,
          status: leads.status,
          patientId: leads.patientId,
          appointmentId: leads.appointmentId,
          closedReason: leads.closedReason,
          utmSource: leads.utmSource,
          utmMedium: leads.utmMedium,
          utmCampaign: leads.utmCampaign,
          utmTerm: leads.utmTerm,
          utmContent: leads.utmContent,
          gclid: leads.gclid,
          createdAt: leads.createdAt,
          updatedAt: leads.updatedAt,
          contactCount: sql<number>`(SELECT COUNT(*) FROM lead_contacts WHERE lead_id = "leads"."id")`.as("contact_count"),
          lastContactOutcome: sql<string | null>`(SELECT outcome FROM lead_contacts WHERE lead_id = "leads"."id" ORDER BY created_at DESC LIMIT 1)`.as("last_contact_outcome"),
          lastContactAt: sql<Date | null>`(SELECT created_at FROM lead_contacts WHERE lead_id = "leads"."id" ORDER BY created_at DESC LIMIT 1)`.as("last_contact_at"),
        })
        .from(leads)
        .where(and(...conditions))
        .orderBy(desc(leads.createdAt))
        .limit(limit);

      return res.json(leadRows);
    } catch (err) {
      logger.error({ err }, "Error listing leads");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Fuzzy match (must be before :leadId routes) ---
router.post(
  "/api/business/:hospitalId/leads/fuzzy-match",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { firstName, lastName, email, phone } = req.body;

      if (!firstName && !lastName) {
        return res.status(400).json({ error: "At least firstName or lastName is required" });
      }

      // 1. Fetch all non-archived patients for hospital
      const allPatients = await db
        .select({
          id: patients.id,
          firstName: patients.firstName,
          surname: patients.surname,
          email: patients.email,
          phone: patients.phone,
          dateOfBirth: patients.birthday,
        })
        .from(patients)
        .where(and(
          eq(patients.hospitalId, hospitalId),
          eq(patients.isArchived, false),
        ));

      // 2. Normalize input
      const leadFullName = [firstName, lastName].filter(Boolean).join(' ');
      const leadSwappedName = [lastName, firstName].filter(Boolean).join(' ');
      const leadPhone = phone ? normalizePhoneForMatching(phone) : '';
      const leadEmail = email ? email.trim().toLowerCase() : '';

      // 3. Score each patient
      const candidates: Array<{
        patientId: string;
        firstName: string;
        surname: string;
        phone: string | null;
        email: string | null;
        dateOfBirth: string | null;
        confidence: number;
        phoneMatch: boolean;
        emailMatch: boolean;
      }> = [];

      for (const p of allPatients) {
        let confidence = 0;
        let phoneMatch = false;
        let emailMatch = false;

        // Name similarity (best of normal and swapped order)
        const fullName = `${p.firstName} ${p.surname}`;
        const nameSim = calculateNameSimilarity(leadFullName, fullName);
        const swappedSim = leadSwappedName !== leadFullName
          ? calculateNameSimilarity(leadSwappedName, fullName)
          : 0;
        confidence = Math.max(nameSim, swappedSim);

        // Phone match boost (+20%)
        const pPhone = p.phone ? normalizePhoneForMatching(p.phone) : '';
        if (leadPhone && leadPhone.length >= 8 && pPhone && pPhone.length >= 8 && leadPhone === pPhone) {
          confidence += 0.20;
          phoneMatch = true;
        }

        // Email match boost (+15%)
        const pEmail = p.email ? p.email.trim().toLowerCase() : '';
        if (leadEmail && pEmail && leadEmail === pEmail) {
          confidence += 0.15;
          emailMatch = true;
        }

        confidence = Math.min(1.0, confidence);

        if (confidence >= 0.40) {
          candidates.push({
            patientId: p.id,
            firstName: p.firstName,
            surname: p.surname,
            phone: p.phone,
            email: p.email,
            dateOfBirth: p.dateOfBirth ? String(p.dateOfBirth) : null,
            confidence: Math.round(confidence * 100) / 100,
            phoneMatch,
            emailMatch,
          });
        }
      }

      // Sort desc by confidence, limit 5
      candidates.sort((a, b) => b.confidence - a.confidence);
      return res.json(candidates.slice(0, 5));
    } catch (err) {
      logger.error({ err }, "Error in lead fuzzy match");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Convert lead to patient + appointment + referral ---
router.post(
  "/api/business/:hospitalId/leads/:leadId/convert",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;
      const { patientId, patient, appointmentDate, appointmentTime, duration, unitId, providerId, surgeryRoomId } = req.body;

      // Validate required fields
      if (!appointmentDate || !appointmentTime || !unitId || !providerId) {
        return res.status(400).json({ error: "appointmentDate, appointmentTime, unitId, and providerId are required" });
      }

      const durationMinutes = duration || 30;

      // 1. Verify lead exists, belongs to hospital, not already converted
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.hospitalId, hospitalId)))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      if (lead.status === "converted") {
        return res.status(409).json({ error: "Lead is already converted" });
      }

      // 2. Resolve patient
      let resolvedPatientId: string;

      if (patientId) {
        // Use existing patient — verify it exists
        const [existing] = await db
          .select({ id: patients.id })
          .from(patients)
          .where(and(eq(patients.id, patientId), eq(patients.hospitalId, hospitalId)))
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: "Patient not found" });
        }
        resolvedPatientId = patientId;
      } else if (patient) {
        // Create new patient
        if (!patient.firstName || !patient.lastName) {
          return res.status(400).json({ error: "patient.firstName and patient.lastName are required" });
        }

        // Generate patient number
        const patientNumber = await storage.generatePatientNumber(hospitalId);

        const [newPatient] = await db
          .insert(patients)
          .values({
            hospitalId,
            firstName: patient.firstName,
            surname: patient.lastName,
            email: patient.email || null,
            phone: patient.phone || null,
            patientNumber,
            birthday: patient.birthday || "1900-01-01",
            sex: patient.sex || "O",
          })
          .returning({ id: patients.id });

        resolvedPatientId = newPatient.id;
      } else {
        return res.status(400).json({ error: "Either patientId or patient data is required" });
      }

      // 3. Calculate endTime
      const [hours, minutes] = appointmentTime.split(':').map(Number);
      const startDate = new Date(2000, 0, 1, hours, minutes);
      startDate.setMinutes(startDate.getMinutes() + durationMinutes);
      const endTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

      // 4. Create clinic appointment
      const [appointment] = await db
        .insert(clinicAppointments)
        .values({
          hospitalId,
          unitId,
          patientId: resolvedPatientId,
          providerId,
          appointmentDate,
          startTime: appointmentTime,
          endTime,
          durationMinutes,
          status: "confirmed",
          appointmentType: "external",
          notes: lead.operation || undefined,
          createdBy: req.user.id,
        })
        .returning({ id: clinicAppointments.id });

      // 5. Create referral event — map source and copy UTM/click IDs
      const isMetaSource = lead.source === 'fb' || lead.source === 'ig';
      let referralSource: 'social' | 'search_engine' | 'other';
      let referralSourceDetail: string;

      if (isMetaSource) {
        referralSource = 'social';
        referralSourceDetail = lead.source === 'ig' ? 'Instagram Lead Form' : 'Facebook Lead Form';
      } else if (lead.gclid || lead.msclkid) {
        referralSource = 'search_engine';
        referralSourceDetail = 'Website Contact Form';
      } else {
        referralSource = 'other';
        referralSourceDetail = 'Website Contact Form';
      }

      await db.insert(referralEvents).values({
        hospitalId,
        patientId: resolvedPatientId,
        appointmentId: appointment.id,
        source: referralSource,
        sourceDetail: referralSourceDetail,
        captureMethod: 'staff',
        metaLeadId: lead.metaLeadId || undefined,
        metaFormId: lead.metaFormId || undefined,
        utmSource: lead.utmSource || undefined,
        utmMedium: lead.utmMedium || undefined,
        utmCampaign: lead.utmCampaign || undefined,
        utmTerm: lead.utmTerm || undefined,
        utmContent: lead.utmContent || undefined,
        gclid: lead.gclid || undefined,
        gbraid: lead.gbraid || undefined,
        wbraid: lead.wbraid || undefined,
        fbclid: lead.fbclid || undefined,
        ttclid: lead.ttclid || undefined,
        msclkid: lead.msclkid || undefined,
        igshid: lead.igshid || undefined,
        li_fat_id: lead.li_fat_id || undefined,
        twclid: lead.twclid || undefined,
      });

      // 6. Update lead status
      await db
        .update(leads)
        .set({
          status: "converted",
          patientId: resolvedPatientId,
          appointmentId: appointment.id,
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));

      // 7. Return result
      return res.json({ status: "converted", patientId: resolvedPatientId, appointmentId: appointment.id });
    } catch (err) {
      logger.error({ err, leadId: req.params.leadId }, "Error converting lead");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 2. Lead detail with contact history
router.get(
  "/api/business/:hospitalId/leads/:leadId",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;

      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.hospitalId, hospitalId)))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const contacts = await db
        .select({
          id: leadContacts.id,
          leadId: leadContacts.leadId,
          outcome: leadContacts.outcome,
          note: leadContacts.note,
          createdAt: leadContacts.createdAt,
          createdBy: leadContacts.createdBy,
          userName: sql<string>`(SELECT first_name || ' ' || last_name FROM users WHERE id = ${leadContacts.createdBy})`.as("user_name"),
        })
        .from(leadContacts)
        .where(eq(leadContacts.leadId, leadId))
        .orderBy(desc(leadContacts.createdAt));

      return res.json({ ...lead, contacts });
    } catch (err) {
      logger.error({ err }, "Error fetching lead detail");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 3. Log a contact attempt
router.post(
  "/api/business/:hospitalId/leads/:leadId/contacts",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;
      const { outcome, note } = req.body;

      if (!outcome || !VALID_CONTACT_OUTCOMES.includes(outcome)) {
        return res.status(400).json({
          error: `Invalid outcome. Must be one of: ${VALID_CONTACT_OUTCOMES.join(", ")}`,
        });
      }

      // Verify lead exists and belongs to this hospital
      const [lead] = await db
        .select({ id: leads.id, status: leads.status })
        .from(leads)
        .where(and(eq(leads.id, leadId), eq(leads.hospitalId, hospitalId)))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Create contact entry
      const [contact] = await db
        .insert(leadContacts)
        .values({
          leadId: leadId,
          outcome,
          note: note || null,
          createdBy: req.user.id,
        })
        .returning();

      // Auto-advance status from new -> in_progress
      if (lead.status === "new") {
        await db
          .update(leads)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(leads.id, leadId));
      }

      return res.status(201).json(contact);
    } catch (err) {
      logger.error({ err }, "Error logging lead contact");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 4. Close a lead
router.patch(
  "/api/business/:hospitalId/leads/:leadId",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;
      const { status, closedReason } = req.body;

      if (status !== "closed" && status !== "in_progress") {
        return res.status(400).json({ error: "Status must be 'closed' or 'in_progress'" });
      }

      const [updated] = await db
        .update(leads)
        .set({
          status,
          closedReason: status === "closed" ? (closedReason || null) : null,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, leadId), eq(leads.hospitalId, hospitalId)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Lead not found" });
      }

      return res.json(updated);
    } catch (err) {
      logger.error({ err }, "Error closing lead");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 5. Badge count (new leads)
router.get(
  "/api/business/:hospitalId/leads-count",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const [result] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(leads)
        .where(and(eq(leads.hospitalId, hospitalId), eq(leads.status, "new")));

      return res.json({ count: Number(result.count) });
    } catch (err) {
      logger.error({ err }, "Error fetching leads count");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// --- Admin middleware ---

async function isAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');

    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    logger.error("Error checking admin:", error);
    res.status(500).json({ message: "Failed to verify admin access" });
  }
}

// --- Admin API: Webhook Config ---

// GET /api/admin/:hospitalId/lead-config
router.get(
  "/api/admin/:hospitalId/lead-config",
  isAuthenticated,
  isAdmin,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const [config] = await db
        .select()
        .from(leadWebhookConfig)
        .where(eq(leadWebhookConfig.hospitalId, hospitalId))
        .limit(1);

      // Get last received lead timestamp
      const [lastLead] = await db
        .select({ createdAt: leads.createdAt })
        .from(leads)
        .where(eq(leads.hospitalId, hospitalId))
        .orderBy(desc(leads.createdAt))
        .limit(1);

      const webhookUrl = `${req.protocol}://${req.get("host")}/api/webhooks/leads/${hospitalId}`;

      return res.json({
        configured: !!config,
        enabled: config?.enabled ?? false,
        webhookUrl,
        hasApiKey: !!config?.apiKey,
        lastReceivedAt: lastLead?.createdAt ?? null,
        createdAt: config?.createdAt ?? null,
      });
    } catch (err) {
      logger.error({ err }, "Error fetching lead config");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// POST /api/admin/:hospitalId/lead-config/generate-key
router.post(
  "/api/admin/:hospitalId/lead-config/generate-key",
  isAuthenticated,
  isAdmin,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const rawKey = randomBytes(32).toString("hex");
      const hashed = hashApiKey(rawKey);

      // Upsert: insert or update
      const [existing] = await db
        .select({ hospitalId: leadWebhookConfig.hospitalId })
        .from(leadWebhookConfig)
        .where(eq(leadWebhookConfig.hospitalId, hospitalId))
        .limit(1);

      if (existing) {
        await db
          .update(leadWebhookConfig)
          .set({ apiKey: hashed })
          .where(eq(leadWebhookConfig.hospitalId, hospitalId));
      } else {
        await db
          .insert(leadWebhookConfig)
          .values({
            hospitalId,
            apiKey: hashed,
            enabled: true,
          });
      }

      return res.json({ apiKey: rawKey });
    } catch (err) {
      logger.error({ err }, "Error generating lead API key");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PATCH /api/admin/:hospitalId/lead-config
router.patch(
  "/api/admin/:hospitalId/lead-config",
  isAuthenticated,
  isAdmin,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }

      const [updated] = await db
        .update(leadWebhookConfig)
        .set({ enabled })
        .where(eq(leadWebhookConfig.hospitalId, hospitalId))
        .returning({ enabled: leadWebhookConfig.enabled });

      if (!updated) {
        return res.status(404).json({ error: "Webhook config not found. Generate an API key first." });
      }

      return res.json({ enabled: updated.enabled });
    } catch (err) {
      logger.error({ err }, "Error updating lead config");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
