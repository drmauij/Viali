import { Router } from "express";
import type { Request, Response } from "express";
import { db, storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  flows,
  flowExecutions,
  flowEvents,
  promoCodes,
  patients,
  clinicAppointments,
  clinicServices,
  patientMessages,
} from "@shared/schema";
import { eq, and, or, desc, isNull, sql } from "drizzle-orm";
import logger from "../logger";
import { z } from "zod";
import { sendSms } from "../sms";
import { getUncachableResendClient } from "../email";
import OpenAI from "openai";

const router = Router();

// ─── Middleware ───────────────────────────────────────────────

async function isMarketingAccess(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(
      (h) =>
        h.id === hospitalId &&
        (h.role === "admin" || h.role === "manager" || h.role === "marketing")
    );
    if (!hasAccess) {
      return res.status(403).json({ message: "Marketing access required" });
    }
    next();
  } catch (error) {
    logger.error("Error checking marketing access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// ─── Flows CRUD ───────────────────────────────────────────────

// List campaigns
router.get(
  "/api/business/:hospitalId/flows",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const result = await db
        .select()
        .from(flows)
        .where(eq(flows.hospitalId, hospitalId))
        .orderBy(desc(flows.createdAt));
      res.json(result);
    } catch (error) {
      logger.error("[flows] list error:", error);
      res.status(500).json({ message: "Failed to list campaigns" });
    }
  }
);

// Get single campaign
router.get(
  "/api/business/:hospitalId/flows/:flowId",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      const [flow] = await db
        .select()
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      res.json(flow);
    } catch (error) {
      logger.error("[flows] get error:", error);
      res.status(500).json({ message: "Failed to get campaign" });
    }
  }
);

// Create draft campaign
router.post(
  "/api/business/:hospitalId/flows",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const userId = (req as any).user.id;
      const [flow] = await db
        .insert(flows)
        .values({
          hospitalId,
          name: req.body.name || "Neue Kampagne",
          status: "draft",
          triggerType: "manual",
          segmentFilters: req.body.segmentFilters,
          channel: req.body.channel,
          messageTemplate: req.body.messageTemplate,
          messageSubject: req.body.messageSubject,
          promoCodeId: req.body.promoCodeId,
          createdBy: userId,
        })
        .returning();
      res.json(flow);
    } catch (error) {
      logger.error("[flows] create error:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  }
);

// Update draft campaign
router.patch(
  "/api/business/:hospitalId/flows/:flowId",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      const [flow] = await db
        .update(flows)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)))
        .returning();
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      res.json(flow);
    } catch (error) {
      logger.error("[flows] update error:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  }
);

// Delete campaign
router.delete(
  "/api/business/:hospitalId/flows/:flowId",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      await db
        .delete(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      res.json({ ok: true });
    } catch (error) {
      logger.error("[flows] delete error:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  }
);

// ─── Segment Count ────────────────────────────────────────────

const segmentFilterSchema = z.object({
  filters: z.array(
    z.object({
      field: z.enum([
        "sex",
        "treatment",
        "lastAppointment",
        "appointmentStatus",
      ]),
      operator: z.string(),
      value: z.string(),
      logic: z.enum(["and", "or"]).optional(),
    })
  ),
});

router.post(
  "/api/business/:hospitalId/flows/segment-count",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const { filters } = segmentFilterSchema.parse(req.body);

      const baseConditions: any[] = [
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
      ];

      let needsAppointmentJoin = false;

      // Build per-filter SQL conditions
      const filterToSql = (f: typeof filters[number]): any => {
        switch (f.field) {
          case "sex":
            return f.operator === "is"
              ? sql`${patients.sex} = ${f.value}`
              : sql`${patients.sex} != ${f.value}`;
          case "treatment":
            needsAppointmentJoin = true;
            return f.operator === "isNot"
              ? sql`cs."name" != ${f.value}`
              : sql`cs."name" = ${f.value}`;
          case "lastAppointment": {
            needsAppointmentJoin = true;
            // value format: "3:months" or "2:weeks"
            const [numStr, unit] = f.value.split(":");
            const num = parseInt(numStr, 10) || 3;
            const pgUnit = unit === "weeks" ? "weeks" : "months";
            return f.operator === "moreThan"
              ? sql`ca."appointment_date" <= NOW() - INTERVAL '${sql.raw(String(num))} ${sql.raw(pgUnit)}'`
              : sql`ca."appointment_date" >= NOW() - INTERVAL '${sql.raw(String(num))} ${sql.raw(pgUnit)}'`;
          }
          case "appointmentStatus":
            needsAppointmentJoin = true;
            return sql`ca."status" = ${f.value}`;
          default:
            return sql`TRUE`;
        }
      }

      // Group filters by AND/OR logic — consecutive OR filters form a group
      // e.g. [AND, OR, OR, AND] → and(first, or(second, third), fourth)
      const filterConditions: any[] = [];
      let orGroup: any[] = [];

      for (let i = 0; i < filters.length; i++) {
        const cond = filterToSql(filters[i]);
        if (i > 0 && filters[i].logic === "or") {
          // Start or continue an OR group
          if (orGroup.length === 0 && filterConditions.length > 0) {
            // Pull the previous AND condition into the OR group
            orGroup.push(filterConditions.pop());
          }
          orGroup.push(cond);
        } else {
          // Flush any pending OR group
          if (orGroup.length > 0) {
            filterConditions.push(or(...orGroup));
            orGroup = [];
          }
          filterConditions.push(cond);
        }
      }
      if (orGroup.length > 0) {
        filterConditions.push(or(...orGroup));
      }

      const allConditions = [...baseConditions, ...filterConditions];

      let result: Array<{
        id: string;
        firstName: string | null;
        surname: string | null;
      }>;

      if (needsAppointmentJoin) {
        result = await db
          .selectDistinct({
            id: patients.id,
            firstName: patients.firstName,
            surname: patients.surname,
          })
          .from(patients)
          .innerJoin(
            clinicAppointments,
            eq(patients.id, clinicAppointments.patientId)
          )
          .leftJoin(
            clinicServices,
            eq(clinicAppointments.serviceId, clinicServices.id)
          )
          .where(and(...allConditions));
      } else {
        result = await db
          .select({
            id: patients.id,
            firstName: patients.firstName,
            surname: patients.surname,
          })
          .from(patients)
          .where(and(...allConditions));
      }

      res.json({
        count: result.length,
        samplePatients: result.slice(0, 5),
      });
    } catch (error) {
      logger.error("[flows] segment-count error:", error);
      res.status(500).json({ message: "Failed to count segment" });
    }
  }
);

// ─── Promo Codes ──────────────────────────────────────────────

function generatePromoCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// List promo codes
router.get(
  "/api/business/:hospitalId/promo-codes",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const result = await db
        .select()
        .from(promoCodes)
        .where(eq(promoCodes.hospitalId, hospitalId))
        .orderBy(desc(promoCodes.createdAt));
      res.json(result);
    } catch (error) {
      logger.error("[flows] promo list error:", error);
      res.status(500).json({ message: "Failed to list promo codes" });
    }
  }
);

// Create promo code
router.post(
  "/api/business/:hospitalId/promo-codes",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const userId = (req as any).user.id;
      const [code] = await db
        .insert(promoCodes)
        .values({
          hospitalId,
          code: (req.body.code || generatePromoCode()).toUpperCase(),
          discountType: req.body.discountType,
          discountValue: req.body.discountValue,
          description: req.body.description,
          validFrom: req.body.validFrom,
          validUntil: req.body.validUntil,
          maxUses: req.body.maxUses,
          flowId: req.body.flowId,
          createdBy: userId,
        })
        .returning();
      res.json(code);
    } catch (error) {
      logger.error("[flows] promo create error:", error);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  }
);

// Delete promo code
router.delete(
  "/api/business/:hospitalId/promo-codes/:id",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, id } = req.params;
      await db
        .delete(promoCodes)
        .where(
          and(eq(promoCodes.id, id), eq(promoCodes.hospitalId, hospitalId))
        );
      res.json({ ok: true });
    } catch (error) {
      logger.error("[flows] promo delete error:", error);
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  }
);

// ─── Test Send ───────────────────────────────────────────────

const testSendSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]),
  recipient: z.string(),
  messageTemplate: z.string(),
  messageSubject: z.string().optional(),
  promoCode: z.string().nullable().optional(),
  testVars: z.object({
    vorname: z.string(),
    nachname: z.string(),
    behandlung: z.string(),
  }).optional(),
});

router.post(
  "/api/business/:hospitalId/flows/test-send",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const body = testSendSchema.parse(req.body);

      // Build real booking URL with promo
      const hospital = await storage.getHospital(hospitalId);
      const bookingToken = hospital?.bookingToken || "";
      const testParams = new URLSearchParams();
      if (body.promoCode) testParams.set("promo", body.promoCode);
      const bookingUrl = `${req.protocol}://${req.get("host")}/book/${bookingToken}${testParams.toString() ? `?${testParams.toString()}` : ""}`;

      // Replace template vars with test data
      const vars = body.testVars || { vorname: "Max", nachname: "Mustermann", behandlung: "Test Treatment" };
      let message = body.messageTemplate;
      message = message.replace(/\{\{vorname\}\}/g, vars.vorname);
      message = message.replace(/\{\{nachname\}\}/g, vars.nachname);
      message = message.replace(/\{\{behandlung\}\}/g, vars.behandlung);
      message = message.replace(/\{\{buchungslink\}\}/g, bookingUrl);

      if (body.channel === "sms") {
        const result = await sendSms(body.recipient, message, hospitalId);
        if (!result.success) throw new Error(result.error || "SMS send failed");
      } else {
        const { client, fromEmail } = await getUncachableResendClient();
        const subject = body.messageSubject || "Test Message";
        const html = body.channel === "html_email"
          ? message
          : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
        await client.emails.send({ from: fromEmail, to: body.recipient, subject, html });
      }

      res.json({ ok: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("[flows] test-send error:", msg);
      res.status(500).json({ message: msg });
    }
  }
);

// ─── AI Compose ───────────────────────────────────────────────

const composeSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]),
  prompt: z.string(),
  segmentDescription: z.string().optional(),
  hospitalName: z.string().optional(),
  bookingUrl: z.string().optional(),
  promoCode: z.string().nullable().optional(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
});

router.post(
  "/api/business/:hospitalId/flows/compose",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    (req as any).setTimeout(120000);
    res.setTimeout(120000);

    try {
      const body = composeSchema.parse(req.body);

      // Get hospital info for branding
      const { hospitalId: hId } = req.params;
      const hospital = await storage.getHospital(hId);
      const clinicName = hospital?.name || body.hospitalName || "Premium Aesthetic Clinic";
      const clinicWebsite = hospital?.companyWebsite || "";

      const channelInstructions: Record<string, string> = {
        sms: "Generate a short SMS message (max 160 characters). Plain text only, no HTML. Include {{buchungslink}} where the booking link should go.",
        email:
          "Generate a plain text email. ALWAYS start with 'Subject: <compelling subject line>' on the first line, then a blank line, then the body. Include {{buchungslink}} where the booking link should go.",
        html_email: `Generate a complete HTML email newsletter. ALWAYS start with 'Subject: <compelling subject line>' on the first line, then a blank line, then the HTML.

TECHNICAL RULES (always follow):
- Use ONLY inline CSS styles for all elements
- Mobile-responsive: max-width:600px centered container, widths in % or max-width, min 14px body font
- Must render well on mobile (320px) and desktop
- Include {{buchungslink}} as the href for the CTA button
- Do NOT include <img> tags
- Header: include clinic name "${clinicName}"
- Footer: clinic name, small muted text

DESIGN: ${clinicWebsite ? `Match the design, color palette, fonts, and visual style of the clinic website at ${clinicWebsite}. Study it as your brand reference.` : "Use an elegant premium aesthetic: warm neutrals, clean whitespace, sophisticated typography."} Dark CTA button with white text. If the user overrides with specific brand instructions, follow those instead.`,
      };

      const systemPrompt = `You are a marketing copywriter for ${body.hospitalName || "a premium aesthetic clinic"} in Switzerland.
Write in German (Swiss German style, formal "Sie").

${channelInstructions[body.channel]}

Available template variables (use exactly as shown):
- {{vorname}} — patient first name
- {{nachname}} — patient last name
- {{behandlung}} — treatment name
- {{buchungslink}} — booking page URL (auto-generated)
${body.promoCode ? `- Promo code to mention: ${body.promoCode}` : ""}
${body.segmentDescription ? `\nTarget audience: ${body.segmentDescription}` : ""}

Return ONLY the message content. No explanations, no markdown code fences.`;

      const messages = [
        ...(body.previousMessages || []),
        { role: "user" as const, content: body.prompt },
      ];

      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

      let responseText: string;

      if (body.channel === "html_email" && ANTHROPIC_API_KEY) {
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            messages,
          }),
        });
        if (!resp.ok)
          throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as {
          content: Array<{ type: string; text?: string }>;
        };
        responseText = data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      } else if (MISTRAL_API_KEY) {
        const client = new OpenAI({
          apiKey: MISTRAL_API_KEY,
          baseURL: "https://api.mistral.ai/v1",
        });
        const resp = await client.chat.completions.create({
          model: process.env.MISTRAL_TEXT_MODEL || "mistral-small-latest",
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          max_tokens: body.channel === "sms" ? 200 : 2000,
        });
        responseText = resp.choices[0]?.message?.content || "";
      } else if (ANTHROPIC_API_KEY) {
        // Fallback: use Anthropic for SMS/email too
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: body.channel === "sms" ? 200 : 4096,
            system: systemPrompt,
            messages,
          }),
        });
        if (!resp.ok)
          throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
        const data = (await resp.json()) as {
          content: Array<{ type: string; text?: string }>;
        };
        responseText = data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      } else {
        return res
          .status(500)
          .json({
            error:
              "No AI API key configured (ANTHROPIC_API_KEY or MISTRAL_API_KEY)",
          });
      }

      res.json({ content: responseText });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("[flows] compose error:", msg);
      res.status(500).json({ error: msg });
    }
  }
);

// ─── Campaign Send ────────────────────────────────────────────

router.post(
  "/api/business/:hospitalId/flows/:flowId/send",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    (req as any).setTimeout(300000); // 5 min for large campaigns
    res.setTimeout(300000);

    try {
      const { hospitalId, flowId } = req.params;
      const userId = (req as any).user.id;

      // Get the campaign
      const [flow] = await db
        .select()
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      if (flow.status !== "draft")
        return res.status(400).json({ message: "Campaign already sent" });
      if (!flow.channel || !flow.messageTemplate || !flow.segmentFilters) {
        return res.status(400).json({ message: "Campaign is incomplete" });
      }

      // Get promo code if attached
      let promoCode: string | null = null;
      if (flow.promoCodeId) {
        const [pc] = await db
          .select()
          .from(promoCodes)
          .where(eq(promoCodes.id, flow.promoCodeId));
        if (pc) promoCode = pc.code;
      }

      // Query segment patients (inline — matching the same logic as segment-count)
      const segmentFilters = flow.segmentFilters as Array<{
        field: string;
        operator: string;
        value: string;
      }>;

      const conditions: any[] = [
        eq(patients.hospitalId, hospitalId),
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
      ];

      let needsAppointmentJoin = false;

      for (const f of segmentFilters) {
        switch (f.field) {
          case "sex":
            conditions.push(
              f.operator === "is"
                ? sql`${patients.sex} = ${f.value}`
                : sql`${patients.sex} != ${f.value}`
            );
            break;
          case "treatment":
            needsAppointmentJoin = true;
            conditions.push(sql`cs."name" = ${f.value}`);
            break;
          case "lastAppointment": {
            needsAppointmentJoin = true;
            const months = parseInt(f.value, 10);
            if (f.operator === "moreThan") {
              conditions.push(
                sql`ca."appointment_date" <= NOW() - INTERVAL '${sql.raw(String(months))} months'`
              );
            } else {
              conditions.push(
                sql`ca."appointment_date" >= NOW() - INTERVAL '${sql.raw(String(months))} months'`
              );
            }
            break;
          }
          case "appointmentStatus":
            needsAppointmentJoin = true;
            conditions.push(sql`ca."status" = ${f.value}`);
            break;
        }
      }

      let patientResults: Array<{
        id: string;
        firstName: string | null;
        surname: string | null;
        email: string | null;
        phone: string | null;
      }>;

      if (needsAppointmentJoin) {
        patientResults = await db
          .selectDistinct({
            id: patients.id,
            firstName: patients.firstName,
            surname: patients.surname,
            email: patients.email,
            phone: patients.phone,
          })
          .from(patients)
          .innerJoin(
            clinicAppointments,
            eq(patients.id, clinicAppointments.patientId)
          )
          .leftJoin(
            clinicServices,
            eq(clinicAppointments.serviceId, clinicServices.id)
          )
          .where(and(...conditions));
      } else {
        patientResults = await db
          .selectDistinct({
            id: patients.id,
            firstName: patients.firstName,
            surname: patients.surname,
            email: patients.email,
            phone: patients.phone,
          })
          .from(patients)
          .where(and(...conditions));
      }

      // Update status to sending
      await db
        .update(flows)
        .set({
          status: "sending",
          recipientCount: patientResults.length,
          updatedAt: new Date(),
        })
        .where(eq(flows.id, flowId));

      // Get hospital booking URL
      const hospital = await storage.getHospital(hospitalId);
      const bookingToken = hospital?.bookingToken || "";
      const baseBookingUrl = `${req.protocol}://${req.get("host")}/book/${bookingToken}`;

      // Extract treatment from segment filters → look up service code for booking link
      const filters = flow.segmentFilters as Array<{ field: string; operator: string; value: string }> | null;
      const treatmentFilter = filters?.find(f => f.field === "treatment");
      let serviceCode: string | null = null;
      let treatmentName = "";
      if (treatmentFilter) {
        treatmentName = treatmentFilter.value;
        const [svc] = await db.select({ code: clinicServices.code })
          .from(clinicServices)
          .where(and(
            eq(clinicServices.hospitalId, hospitalId),
            sql`${clinicServices.name} = ${treatmentFilter.value}`,
          ))
          .limit(1);
        if (svc?.code) serviceCode = svc.code;
      }

      // Build booking URL with service + promo + UTM for referral attribution
      const params = new URLSearchParams();
      if (serviceCode) params.set("service", serviceCode);
      if (promoCode) params.set("promo", promoCode);
      params.set("utm_source", flow.channel === "sms" ? "sms_campaign" : "email_campaign");
      params.set("utm_medium", flow.channel === "sms" ? "sms" : "email");
      params.set("utm_campaign", flow.name || "campaign");
      const bookingUrlSuffix = `?${params.toString()}`;

      let sentCount = 0;
      let failCount = 0;

      for (const patient of patientResults) {
        try {
          let message = flow.messageTemplate!;
          const bookingUrl = baseBookingUrl + bookingUrlSuffix;

          message = message.replace(/\{\{vorname\}\}/g, patient.firstName || "");
          message = message.replace(/\{\{nachname\}\}/g, patient.surname || "");
          message = message.replace(/\{\{behandlung\}\}/g, treatmentName);
          message = message.replace(/\{\{buchungslink\}\}/g, bookingUrl);

          // Create execution record
          const [execution] = await db
            .insert(flowExecutions)
            .values({
              flowId,
              patientId: patient.id,
              status: "running",
            })
            .returning();

          let sendSuccess = false;

          if (flow.channel === "sms" && patient.phone) {
            const result = await sendSms(patient.phone, message, hospitalId);
            sendSuccess = result.success;
          } else if (
            (flow.channel === "email" || flow.channel === "html_email") &&
            patient.email
          ) {
            try {
              const { client, fromEmail } = await getUncachableResendClient();
              const subject = flow.messageSubject || "Nachricht von Ihrer Praxis";
              const emailPayload: {
                from: string;
                to: string;
                subject: string;
                html: string;
              } = {
                from: fromEmail,
                to: patient.email,
                subject,
                html:
                  flow.channel === "html_email"
                    ? message
                    : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`,
              };
              await client.emails.send(emailPayload);
              sendSuccess = true;
            } catch (e) {
              logger.error("[flows] email send error:", e);
            }
          }

          // Log event
          await db.insert(flowEvents).values({
            executionId: execution.id,
            eventType: sendSuccess ? "sent" : "bounced",
            metadata: { channel: flow.channel },
          });

          // Log to patient messages
          if (sendSuccess) {
            await db.insert(patientMessages).values({
              hospitalId,
              patientId: patient.id,
              sentBy: userId,
              channel: flow.channel === "sms" ? "sms" : "email",
              recipient:
                flow.channel === "sms"
                  ? patient.phone || ""
                  : patient.email || "",
              message:
                flow.channel === "html_email"
                  ? `[HTML Campaign: ${flow.name}]`
                  : message,
              status: "sent",
              isAutomatic: false,
              messageType: "manual",
              direction: "outbound",
              conversationId: `${hospitalId}:${patient.id}`,
            });
          }

          // Update execution status
          await db
            .update(flowExecutions)
            .set({
              status: sendSuccess ? "completed" : "failed",
              completedAt: new Date(),
            })
            .where(eq(flowExecutions.id, execution.id));

          if (sendSuccess) sentCount++;
          else failCount++;

          // Small delay to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (err) {
          failCount++;
          logger.error(`[flows] send error for patient ${patient.id}:`, err);
        }
      }

      // Mark flow as sent
      await db
        .update(flows)
        .set({
          status: "sent",
          sentAt: new Date(),
          recipientCount: sentCount,
          updatedAt: new Date(),
        })
        .where(eq(flows.id, flowId));

      res.json({ ok: true, sent: sentCount, failed: failCount });
    } catch (error) {
      logger.error("[flows] send error:", error);
      // Mark as failed
      await db
        .update(flows)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(flows.id, req.params.flowId));
      res.status(500).json({ message: "Campaign send failed" });
    }
  }
);

export default router;
