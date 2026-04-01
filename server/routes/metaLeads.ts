import { Router } from "express";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { metaLeads, metaLeadWebhookConfig } from "@shared/schema";
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

export default router;
