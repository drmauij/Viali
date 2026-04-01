import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import { metaLeads, metaLeadContacts, metaLeadWebhookConfig, users } from "@shared/schema";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import logger from "../logger";
import { createHash } from "crypto";

const router = Router();

// --- Validation ---

const VALID_SOURCES = ["fb", "ig"] as const;

interface ValidatedLead {
  metaLeadId: string;
  metaFormId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  operation: string;
  source: string;
}

export function validateMetaLeadPayload(body: unknown): {
  success: boolean;
  data?: ValidatedLead;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { success: false, error: "Body must be a non-null object" };
  }

  const b = body as Record<string, unknown>;

  // Required string fields
  const requiredFields = ["lead_id", "form_id", "first_name", "last_name", "operation"] as const;
  for (const field of requiredFields) {
    if (typeof b[field] !== "string" || b[field].trim() === "") {
      return { success: false, error: `Missing or invalid field: ${field}` };
    }
  }

  // Source must be one of the valid values
  if (typeof b.source !== "string" || !VALID_SOURCES.includes(b.source as any)) {
    return { success: false, error: `Invalid source: must be one of ${VALID_SOURCES.join(", ")}` };
  }

  // At least one contact method required
  const email = typeof b.email === "string" && b.email.trim() !== "" ? b.email.trim() : null;
  const phone = typeof b.phone === "string" && b.phone.trim() !== "" ? b.phone.trim() : null;
  if (!email && !phone) {
    return { success: false, error: "At least one of email or phone is required" };
  }

  return {
    success: true,
    data: {
      metaLeadId: (b.lead_id as string).trim(),
      metaFormId: (b.form_id as string).trim(),
      firstName: (b.first_name as string).trim(),
      lastName: (b.last_name as string).trim(),
      email,
      phone,
      operation: (b.operation as string).trim(),
      source: b.source as string,
    },
  };
}

// --- Helpers ---

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// --- Webhook endpoint ---

router.post("/api/webhooks/meta-leads/:hospitalId", async (req, res) => {
  const { hospitalId } = req.params;
  const apiKey = req.query.key as string | undefined;

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" });
  }

  try {
    // Look up config for this hospital
    const [config] = await db
      .select()
      .from(metaLeadWebhookConfig)
      .where(eq(metaLeadWebhookConfig.hospitalId, hospitalId))
      .limit(1);

    if (!config || config.apiKey !== hashApiKey(apiKey)) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    if (!config.enabled) {
      return res.status(403).json({ error: "Webhook is disabled for this hospital" });
    }

    // Validate payload
    const validation = validateMetaLeadPayload(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const data = validation.data!;

    // Dedup: check if lead already exists for this hospital
    const [existing] = await db
      .select({ id: metaLeads.id })
      .from(metaLeads)
      .where(
        and(
          eq(metaLeads.hospitalId, hospitalId),
          eq(metaLeads.metaLeadId, data.metaLeadId),
        ),
      )
      .limit(1);

    if (existing) {
      return res.status(200).json({ status: "received", id: existing.id });
    }

    // Insert new lead
    const [inserted] = await db
      .insert(metaLeads)
      .values({
        hospitalId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        operation: data.operation,
        source: data.source,
        metaLeadId: data.metaLeadId,
        metaFormId: data.metaFormId,
        status: "new",
      })
      .returning({ id: metaLeads.id });

    logger.info({ hospitalId, leadId: inserted.id, metaLeadId: data.metaLeadId }, "Meta lead received");

    return res.status(200).json({ status: "received", id: inserted.id });
  } catch (err) {
    logger.error({ err, hospitalId }, "Error processing meta lead webhook");
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
  "/api/business/:hospitalId/meta-leads",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const status = (req.query.status as string) || "all";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 100);
      const before = req.query.before as string | undefined;

      const conditions = [eq(metaLeads.hospitalId, hospitalId)];

      if (status !== "all") {
        conditions.push(eq(metaLeads.status, status as any));
      }

      if (before) {
        conditions.push(lt(metaLeads.createdAt, new Date(before)));
      }

      const leads = await db
        .select({
          id: metaLeads.id,
          hospitalId: metaLeads.hospitalId,
          firstName: metaLeads.firstName,
          lastName: metaLeads.lastName,
          email: metaLeads.email,
          phone: metaLeads.phone,
          operation: metaLeads.operation,
          source: metaLeads.source,
          metaLeadId: metaLeads.metaLeadId,
          metaFormId: metaLeads.metaFormId,
          status: metaLeads.status,
          patientId: metaLeads.patientId,
          appointmentId: metaLeads.appointmentId,
          closedReason: metaLeads.closedReason,
          createdAt: metaLeads.createdAt,
          updatedAt: metaLeads.updatedAt,
          contactCount: sql<number>`(SELECT COUNT(*) FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id})`.as("contact_count"),
          lastContactOutcome: sql<string | null>`(SELECT outcome FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id} ORDER BY created_at DESC LIMIT 1)`.as("last_contact_outcome"),
          lastContactAt: sql<Date | null>`(SELECT created_at FROM meta_lead_contacts WHERE meta_lead_id = ${metaLeads.id} ORDER BY created_at DESC LIMIT 1)`.as("last_contact_at"),
        })
        .from(metaLeads)
        .where(and(...conditions))
        .orderBy(desc(metaLeads.createdAt))
        .limit(limit);

      return res.json(leads);
    } catch (err) {
      logger.error({ err }, "Error listing meta leads");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 2. Lead detail with contact history
router.get(
  "/api/business/:hospitalId/meta-leads/:leadId",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;

      const [lead] = await db
        .select()
        .from(metaLeads)
        .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const contacts = await db
        .select({
          id: metaLeadContacts.id,
          metaLeadId: metaLeadContacts.metaLeadId,
          outcome: metaLeadContacts.outcome,
          note: metaLeadContacts.note,
          createdAt: metaLeadContacts.createdAt,
          createdBy: metaLeadContacts.createdBy,
          userName: sql<string>`(SELECT first_name || ' ' || surname FROM users WHERE id = ${metaLeadContacts.createdBy})`.as("user_name"),
        })
        .from(metaLeadContacts)
        .where(eq(metaLeadContacts.metaLeadId, leadId))
        .orderBy(desc(metaLeadContacts.createdAt));

      return res.json({ ...lead, contacts });
    } catch (err) {
      logger.error({ err }, "Error fetching meta lead detail");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 3. Log a contact attempt
router.post(
  "/api/business/:hospitalId/meta-leads/:leadId/contacts",
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
        .select({ id: metaLeads.id, status: metaLeads.status })
        .from(metaLeads)
        .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
        .limit(1);

      if (!lead) {
        return res.status(404).json({ error: "Lead not found" });
      }

      // Create contact entry
      const [contact] = await db
        .insert(metaLeadContacts)
        .values({
          metaLeadId: leadId,
          outcome,
          note: note || null,
          createdBy: req.user.id,
        })
        .returning();

      // Auto-advance status from new -> in_progress
      if (lead.status === "new") {
        await db
          .update(metaLeads)
          .set({ status: "in_progress", updatedAt: new Date() })
          .where(eq(metaLeads.id, leadId));
      }

      return res.status(201).json(contact);
    } catch (err) {
      logger.error({ err }, "Error logging meta lead contact");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 4. Close a lead
router.patch(
  "/api/business/:hospitalId/meta-leads/:leadId",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId, leadId } = req.params;
      const { status, closedReason } = req.body;

      if (status !== "closed") {
        return res.status(400).json({ error: "Only 'closed' status can be set manually" });
      }

      const [updated] = await db
        .update(metaLeads)
        .set({
          status: "closed",
          closedReason: closedReason || null,
          updatedAt: new Date(),
        })
        .where(and(eq(metaLeads.id, leadId), eq(metaLeads.hospitalId, hospitalId)))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Lead not found" });
      }

      return res.json(updated);
    } catch (err) {
      logger.error({ err }, "Error closing meta lead");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// 5. Badge count (new leads)
router.get(
  "/api/business/:hospitalId/meta-leads-count",
  isAuthenticated,
  isMarketingOrManager,
  async (req: any, res: Response) => {
    try {
      const { hospitalId } = req.params;

      const [result] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(metaLeads)
        .where(and(eq(metaLeads.hospitalId, hospitalId), eq(metaLeads.status, "new")));

      return res.json({ count: Number(result.count) });
    } catch (err) {
      logger.error({ err }, "Error fetching meta leads count");
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
