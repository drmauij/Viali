import { Router } from "express";
import type { Request, Response } from "express";
import { db, storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  flows,
  flowExecutions,
  flowEvents,
  flowHospitals,
  flowVariants,
  promoCodes,
  patients,
  clinicAppointments,
  clinicServices,
  patientMessages,
  users,
} from "@shared/schema";
import { eq, and, or, desc, isNull, inArray, sql } from "drizzle-orm";
import logger from "../logger";
import { z } from "zod";
import { sendSms } from "../sms";
import { getUncachableResendClient } from "../email";
import { consentConditionsFor, appendUnsubscribeFooter } from "../services/marketingConsent";
import {
  getHospitalGroupIdCached,
  getGroupHospitalIdsCached,
  userIsGroupAdminForHospital,
} from "../utils";
import { generateUnsubscribeToken } from "../services/marketingUnsubscribeToken";
import { generateExecutionToken } from "../services/marketingExecutionToken";
import { assignVariant } from "../services/marketingAbAssignment";
import { summarizeFlows, flowDetail } from "../services/marketingMetricsQuery";
import { sendRemainderForWinner } from "../services/marketingAbSendRemainder";
import {
  SNIPPET_EDIT_SYSTEM_PROMPT,
  buildSnippetEditUserMessage,
  stripMarkdownFencesServer,
} from "./flowsComposeHelpers";
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

class FlowsScopeForbiddenError extends Error {
  code = "GROUP_SCOPE_FORBIDDEN" as const;
  constructor() {
    super("Access denied for group-scope Flows audience.");
  }
}

/**
 * Resolve the audience hospital-ID list for a Flows segment/send query.
 *
 * Chain-aware: reads the `flow_hospitals` join table when a `flowId` is
 * provided (for edit flows or send-loop). Falls back to `[activeHospitalId]`
 * for the segment-preview endpoint when no flow exists yet.
 *
 * For the create-preview path, the caller may include `explicitHospitalIds`
 * (from the new MultiLocationSelector on /chain/campaigns/new). We trust
 * it only after verifying every listed hospital is in the active hospital's
 * group AND the caller is group_admin/platform admin when targeting more
 * than the active hospital alone.
 *
 * The `X-Active-Scope` header is no longer consulted — the UI paths that
 * previously sent it have been replaced by /chain/campaigns where audience
 * is explicit in the request body.
 */
async function resolveFlowsAudienceScope(
  req: Request,
  userId: string,
  activeHospitalId: string,
  opts: { flowId?: string; explicitHospitalIds?: string[] } = {},
): Promise<string[]> {
  const { flowId, explicitHospitalIds } = opts;

  // Path 1: send-loop / edit existing flow — read from flow_hospitals join
  if (flowId) {
    const rows = await db
      .select({ hospitalId: flowHospitals.hospitalId })
      .from(flowHospitals)
      .where(eq(flowHospitals.flowId, flowId));
    if (rows.length === 0) {
      // Defensive: pre-migration flow or data issue. Fall back to active
      // hospital so we never silently send zero recipients.
      return [activeHospitalId];
    }
    return rows.map(r => r.hospitalId);
  }

  // Path 2: create-preview with explicit audience list — validate every ID
  // is in the active hospital's group before trusting the input.
  if (explicitHospitalIds && explicitHospitalIds.length > 0) {
    const groupId = await getHospitalGroupIdCached(activeHospitalId, req);
    if (!groupId) {
      // Un-grouped tenant cannot target multiple locations — clamp to active.
      return [activeHospitalId];
    }
    const groupHospitalIds = await getGroupHospitalIdsCached(groupId, req);
    const valid = explicitHospitalIds.filter(h => groupHospitalIds.includes(h));
    if (valid.length === 0) return [activeHospitalId];

    // Authorisation: caller must be group_admin (or platform admin) to target
    // sibling clinics. Plain marketing/manager is fine for the active one.
    if (valid.length > 1 || !valid.includes(activeHospitalId)) {
      const [u] = await db
        .select({ isPlatformAdmin: users.isPlatformAdmin })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const isPlatformAdmin = u?.isPlatformAdmin === true;
      if (!isPlatformAdmin) {
        const isGroupAdmin = await userIsGroupAdminForHospital(userId, activeHospitalId, req);
        if (!isGroupAdmin) {
          throw new FlowsScopeForbiddenError();
        }
      }
    }
    return valid;
  }

  // Path 3: no flowId, no explicit list — default to single active hospital.
  return [activeHospitalId];
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

      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      res.json({ ...flow, variants });
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
          campaignTreatmentId: req.body.campaignTreatmentId ?? null,
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
      const { variants: incomingVariants, ...flowPatch } = req.body ?? {};

      const [flow] = await db
        .update(flows)
        .set({ ...flowPatch, updatedAt: new Date() })
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)))
        .returning();
      if (!flow) return res.status(404).json({ message: "Campaign not found" });

      if (Array.isArray(incomingVariants)) {
        // Replace variants for this flow with the provided array.
        // Delete existing then insert fresh rows.
        await db.delete(flowVariants).where(eq(flowVariants.flowId, flow.id));
        if (incomingVariants.length > 0) {
          await db.insert(flowVariants).values(
            incomingVariants.map((v: any) => ({
              flowId: flow.id,
              label: v.label,
              messageSubject: v.messageSubject ?? null,
              messageTemplate: v.messageTemplate,
              promoCodeId: v.promoCodeId ?? null,
              weight: v.weight ?? 1,
            })),
          );
        }
      }

      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      res.json({ ...flow, variants });
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
  channel: z.enum(["sms", "email", "html_email"]).optional(),
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
      const userId = (req as any).user.id;
      const bodyParsed = segmentFilterSchema.extend({
        audienceHospitalIds: z.array(z.string()).optional(),
      }).parse(req.body);
      const { channel, filters } = bodyParsed;

      // Phase C: resolve audience scope from flow_hospitals join table (for
      // existing flows) or from an explicit list supplied by the chain-campaign
      // create-preview flow. Falls back to [hospitalId] for single-clinic use.
      let audienceHospitalIds: string[];
      try {
        audienceHospitalIds = await resolveFlowsAudienceScope(req, userId, hospitalId, {
          explicitHospitalIds: bodyParsed.audienceHospitalIds,
        });
      } catch (e) {
        if (e instanceof FlowsScopeForbiddenError) {
          return res.status(403).json({ message: e.message, code: e.code });
        }
        throw e;
      }

      const hospitalCond = audienceHospitalIds.length === 1
        ? eq(patients.hospitalId, audienceHospitalIds[0])
        : inArray(patients.hospitalId, audienceHospitalIds);

      const baseConditions: any[] = [
        hospitalCond,
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
        ...(channel ? consentConditionsFor(channel) : []),
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

      // Task 12: `groupWide = true` lets the code be redeemed at any hospital
      // in the issuer's group. Only group_admins (or platform admins) are
      // allowed to mint group-wide codes — otherwise a plain marketing role
      // at one location could hand out sibling-clinic discounts. Non-grouped
      // hospitals silently get `groupWide = false` regardless of the
      // requested value.
      let groupWide = req.body.groupWide === true;
      if (groupWide) {
        const groupId = await getHospitalGroupIdCached(hospitalId, req);
        if (!groupId) {
          groupWide = false;
        } else {
          const [u] = await db
            .select({ isPlatformAdmin: users.isPlatformAdmin })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          const isPlatformAdmin = u?.isPlatformAdmin === true;
          if (!isPlatformAdmin) {
            const isGroupAdmin = await userIsGroupAdminForHospital(userId, hospitalId, req);
            if (!isGroupAdmin) {
              return res.status(403).json({
                message: "Group-wide promo codes require group_admin.",
                code: "GROUP_SCOPE_FORBIDDEN",
              });
            }
          }
        }
      }

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
          groupWide,
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

// ─── Booking-link helper ─────────────────────────────────────
// Build the query string portion of a campaign booking link. Same shape used
// by the test-send and the real campaign send so a "Send test" preview shows
// the recipient exactly what real recipients will get (treatment preselect,
// "how did you hear" auto-skipped, name/email prefilled, etc.).
function buildBookingQuery(args: {
  channel: "sms" | "email" | "html_email";
  flowId?: string;
  flowName?: string;
  serviceCode?: string | null;
  promoCode?: string | null;
}): string {
  // Note: NO patient PII in the URL. The `fe` token (appended by the caller)
  // is the per-recipient identifier; the booking page exchanges it for
  // firstName/surname/email/phone via the `/prefill` endpoint server-side.
  // Keeps PII out of email-provider logs, browser history, and Referer
  // headers — and means revoking an execution invalidates the prefill too.
  const params = new URLSearchParams();
  if (args.serviceCode) params.set("service", args.serviceCode);
  if (args.promoCode) params.set("promo", args.promoCode);
  params.set("utm_source", args.channel === "sms" ? "sms_campaign" : "email_campaign");
  params.set("utm_medium", args.channel === "sms" ? "sms" : "email");
  if (args.flowName) params.set("utm_campaign", args.flowName);
  // Stable join key for booking attribution — survives flow renames and
  // same-name collisions.
  if (args.flowId) params.set("utm_content", args.flowId);
  return `?${params.toString()}`;
}

// ─── Test Send ───────────────────────────────────────────────

const testSendSchema = z.object({
  channel: z.enum(["sms", "email", "html_email"]),
  recipient: z.string(),
  messageTemplate: z.string(),
  messageSubject: z.string().optional(),
  promoCode: z.string().nullable().optional(),
  // Optional campaign-treatment ID — same idea as the saved flow's
  // campaignTreatmentId. When set, the test booking link gets ?service=<code>
  // so the preview accurately reflects what real recipients will see.
  campaignTreatmentId: z.string().nullable().optional(),
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

      // Build a realistic booking URL — same shape as the real send so the
      // preview reflects what recipients actually see (preselected treatment,
      // skipped referral question, prefilled identity, attribution UTMs).
      const hospital = await storage.getHospital(hospitalId);
      const bookingToken = hospital?.bookingToken || "";
      const vars = body.testVars || { vorname: "Max", nachname: "Mustermann", behandlung: "Test Treatment" };
      // Resolve a service code for the preview's `?service=` param.
      // Priority mirrors the real send: explicit campaignTreatmentId first,
      // then a name lookup against the test "behandlung".
      let testServiceCode: string | null = null;
      if (body.campaignTreatmentId) {
        const [svc] = await db
          .select({ code: clinicServices.code })
          .from(clinicServices)
          .where(eq(clinicServices.id, body.campaignTreatmentId))
          .limit(1);
        if (svc?.code) testServiceCode = svc.code;
      }
      if (!testServiceCode && vars.behandlung) {
        const [svc] = await db.select({ code: clinicServices.code })
          .from(clinicServices)
          .where(and(
            eq(clinicServices.hospitalId, hospitalId),
            sql`${clinicServices.name} = ${vars.behandlung}`,
          ))
          .limit(1);
        if (svc?.code) testServiceCode = svc.code;
      }
      const baseUrl =
        process.env.PRODUCTION_URL ||
        `${req.protocol}://${req.get("host")}`;
      const bookingQuery = buildBookingQuery({
        channel: body.channel,
        flowId: undefined,
        flowName: "Test Send",
        serviceCode: testServiceCode,
        promoCode: body.promoCode || null,
      });
      // Test sends have no execution row → no `fe` token → server-side prefill
      // can't fire. To keep the demo complete, append the test vars as URL
      // prefill params here. Test-only; real sends never put PII in the URL.
      const testPrefill = new URLSearchParams();
      if (vars.vorname) testPrefill.set("firstName", vars.vorname);
      if (vars.nachname) testPrefill.set("surname", vars.nachname);
      if (body.recipient.includes("@")) testPrefill.set("email", body.recipient);
      else testPrefill.set("phone", body.recipient);
      const bookingUrl = `${baseUrl}/book/${bookingToken}${bookingQuery}&${testPrefill.toString()}`;
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
  prompt: z.string().optional().default(""),
  segmentDescription: z.string().optional(),
  hospitalName: z.string().optional(),
  bookingUrl: z.string().optional(),
  promoCode: z.string().nullable().optional(),
  referenceUrl: z.string().optional(),
  abVariantOf: z.string().optional(),
  abStyleHint: z.string().optional(),
  /** When true with abVariantOf, treat the input as the message to PRESERVE
   *  (same copy, same design) and only weave in the promo code. Used by the
   *  "Mention code in message" action after the user picks a promo. */
  preserveCopy: z.boolean().optional(),
  previousMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional(),
  // ── NEW: single-element scoped edit ──
  selectedSnippet: z.string().optional(),
  brandHead: z.string().optional(),
});

// Fetch screenshot of a website (cached per session; TTL 1h).
// Primary: local Playwright (fast, ~2–5s). Fallback: thum.io → microlink.
const screenshotCache = new Map<string, { base64: string; expiresAt: number }>();
const SCREENSHOT_CACHE_TTL = 60 * 60 * 1000;
const PLAYWRIGHT_TIMEOUT_MS = 8000;

async function renderScreenshotWithPlaywright(url: string): Promise<Buffer | null> {
  let browser: import("playwright").Browser | null = null;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1000, height: 700 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PLAYWRIGHT_TIMEOUT_MS });
    // Short settle for above-the-fold paint without waiting for full networkidle
    await page.waitForTimeout(400);
    const buf = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
    return buf;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[flows] playwright screenshot failed: ${msg}`);
    return null;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

async function fetchWebsiteScreenshot(url: string): Promise<string> {
  const cached = screenshotCache.get(url);
  if (cached && cached.expiresAt > Date.now() && cached.base64.length > 0) {
    logger.info(`[flows] screenshot cache hit: ${url}`);
    return cached.base64;
  }

  // 1) Try local Playwright first (fast path)
  const t0 = Date.now();
  const localBuf = await renderScreenshotWithPlaywright(url);
  if (localBuf && localBuf.byteLength >= 1000) {
    const base64 = localBuf.toString("base64");
    logger.info(`[flows] playwright screenshot success: ${localBuf.byteLength} bytes in ${Date.now() - t0}ms`);
    screenshotCache.set(url, { base64, expiresAt: Date.now() + SCREENSHOT_CACHE_TTL });
    return base64;
  }

  // 2) Fall back to external services
  const services = [
    `https://image.thum.io/get/width/1200/noanimate/${url}`,
    `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false&embed=screenshot.url`,
  ];

  for (const serviceUrl of services) {
    try {
      logger.info(`[flows] fetching screenshot from: ${serviceUrl.slice(0, 80)}`);
      const resp = await fetch(serviceUrl, {
        signal: AbortSignal.timeout(45000),
        redirect: "follow",
      });
      if (!resp.ok) {
        logger.warn(`[flows] screenshot fetch failed: status=${resp.status}`);
        continue;
      }
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        logger.warn(`[flows] screenshot service returned non-image: ${contentType}`);
        continue;
      }
      const buf = await resp.arrayBuffer();
      if (buf.byteLength < 1000) {
        logger.warn(`[flows] screenshot too small: ${buf.byteLength} bytes`);
        continue;
      }
      const base64 = Buffer.from(buf).toString("base64");
      logger.info(`[flows] screenshot success (fallback): ${buf.byteLength} bytes`);
      screenshotCache.set(url, { base64, expiresAt: Date.now() + SCREENSHOT_CACHE_TTL });
      return base64;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[flows] screenshot service error: ${msg}`);
    }
  }

  logger.error(`[flows] all screenshot services failed for: ${url}`);
  return "";
}

// Fetch website and extract brand tokens (cached per session; TTL 10 min)
const brandCache = new Map<string, { tokens: string; expiresAt: number }>();
const BRAND_CACHE_TTL = 10 * 60 * 1000;

async function fetchWebsiteForBrand(url: string): Promise<string> {
  const cached = brandCache.get(url);
  if (cached && cached.expiresAt > Date.now() && cached.tokens.length > 0) {
    logger.info(`[flows] brand cache hit: ${url}`);
    return cached.tokens;
  }
  try {
    const base = new URL(url);
    logger.info(`[flows] fetching website for brand: ${url}`);
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ViaLi-Flows/1.0)" },
    });
    if (!resp.ok) return "";
    const html = await resp.text();
    logger.info(`[flows] brand html fetched: ${html.length} chars`);

    // Extract Google Fonts URLs
    const googleFontsMatches = html.match(/fonts\.googleapis\.com\/css[^"'\s]+/g) || [];
    const fontFamilies = new Set<string>();
    for (const gf of googleFontsMatches) {
      const familyMatches = gf.match(/family=([^&"']+)/g) || [];
      for (const fm of familyMatches) {
        const decoded = decodeURIComponent(fm.replace("family=", "")).split(/[|]/);
        for (const f of decoded) {
          const name = f.split(":")[0].replace(/\+/g, " ").trim();
          if (name && name.length < 50) fontFamilies.add(name);
        }
      }
    }

    // Extract external stylesheets — prioritize theme/main CSS over plugins
    const allCssLinks = (html.match(/<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]*>/gi) || [])
      .map(l => {
        const m = l.match(/href=["']([^"']+)["']/);
        return m ? m[1] : null;
      })
      .filter(Boolean) as string[];

    // Skip known noise plugins, prefer theme/style/main files
    const filteredCss = allCssLinks.filter(href => {
      const lower = href.toLowerCase();
      return !lower.includes("splide") && !lower.includes("cookieyes")
        && !lower.includes("translatepress") && !lower.includes("yoast");
    });
    // Prioritize: theme/main/style files first, then everything else
    const prioritizedCss = [
      ...filteredCss.filter(h => /theme|main|style|global|brand|custom/i.test(h)),
      ...filteredCss.filter(h => !/theme|main|style|global|brand|custom/i.test(h)),
    ].slice(0, 5);

    logger.info(`[flows] brand: fetching ${prioritizedCss.length} CSS files`);

    // Fetch CSS files
    let extractedCss = "";
    for (const cssHref of prioritizedCss) {
      try {
        const cssUrl = cssHref!.startsWith("http") ? cssHref! : new URL(cssHref!, base).toString();
        const cssResp = await fetch(cssUrl, { signal: AbortSignal.timeout(4000) });
        if (cssResp.ok) {
          const cssText = await cssResp.text();
          extractedCss += cssText + "\n";
          if (extractedCss.length > 80000) break;
        }
      } catch { /* ignore */ }
    }
    logger.info(`[flows] brand: total CSS fetched = ${extractedCss.length} chars`);

    // Also extract inline <style> blocks
    const inlineStyles = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [])
      .map(s => s.replace(/<\/?style[^>]*>/gi, ""))
      .join("\n");
    const allCss = extractedCss + "\n" + inlineStyles;

    // Extract color-related declarations
    const colorDecls = [
      ...(allCss.match(/--[a-z-]+:\s*#[0-9a-fA-F]{3,8}[^;]*;/gi) || []),
      ...(allCss.match(/--[a-z-]+:\s*rgba?\([^)]+\)[^;]*;/gi) || []),
      ...(allCss.match(/(?:color|background-color|background):\s*#[0-9a-fA-F]{3,8}[^;]*;/gi) || []).slice(0, 30),
      ...(allCss.match(/linear-gradient\([^)]+\)/gi) || []).slice(0, 10),
    ];
    const uniqueColorDecls = [...new Set(colorDecls)].slice(0, 50);

    // Build brand summary
    const tokens = [
      fontFamilies.size > 0 ? `Fonts used on the website:\n${[...fontFamilies].join(", ")}` : "",
      uniqueColorDecls.length > 0 ? `Brand colors and design tokens from the website CSS:\n${uniqueColorDecls.join("\n")}` : "",
      `Website URL: ${url}`,
      `Tone: match the elegance, warmth, and premium feel of the source website.`,
    ].filter(Boolean).join("\n\n");

    logger.info(`[flows] brand tokens extracted: ${tokens.length} chars, ${fontFamilies.size} fonts, ${uniqueColorDecls.length} color decls`);

    if (tokens.length > 0) {
      brandCache.set(url, { tokens, expiresAt: Date.now() + BRAND_CACHE_TTL });
    }
    return tokens;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[flows] brand fetch error: ${url} — ${msg}`);
    return "";
  }
}

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
      const rawClinicLogo = hospital?.companyLogoUrl || "";
      // Only pass HTTP(S) logo URLs to the LLM. Data URLs (base64 images) would
      // be regurgitated byte-for-byte into the streamed output, producing
      // minutes-long responses and garbage data — see flows AI compose incident.
      const clinicLogo = /^https?:\/\//i.test(rawClinicLogo) ? rawClinicLogo : "";

      // Fetch brand reference — prefer user-provided URL over clinic default
      let effectiveReferenceUrl = (body.referenceUrl || clinicWebsite || "").trim();
      // If user mentions a URL in the chat prompt, that takes priority
      const mentionedUrlMatch = body.prompt.match(/https?:\/\/[^\s)"']+/);
      if (mentionedUrlMatch) {
        effectiveReferenceUrl = mentionedUrlMatch[0];
      }

      let screenshotBase64 = "";
      logger.info(`[flows] compose: hospital=${clinicName}, referenceUrl=${effectiveReferenceUrl || "(none)"}, channel=${body.channel}`);
      if (effectiveReferenceUrl && body.channel === "html_email") {
        screenshotBase64 = await fetchWebsiteScreenshot(effectiveReferenceUrl);
      }
      logger.info(`[flows] compose: screenshot base64 length=${screenshotBase64.length}`);

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
${clinicLogo ? `- Header: include the clinic logo as <img src="${clinicLogo}" alt="${clinicName}" style="max-height:60px;display:block;margin:0 auto;"> at the top of the email` : `- Header: include clinic name "${clinicName}" prominently (no img tags)`}
- Do NOT include OTHER <img> tags besides the logo (no hero images, no photos)
- Footer: clinic name, small muted text

BRAND DESIGN:${clinicWebsite ? `
Match the visual style of the clinic website at ${clinicWebsite} — same colors, fonts, and design language. The website HTML will be provided as reference in the first message.` : `
Use an elegant premium aesthetic: warm neutrals, clean whitespace, sophisticated typography.`}
CTA button: use the primary brand color as background, white text, rounded corners, padding 14px 32px, font-weight 600.
If the user overrides with specific instructions, follow those instead.`,
      };

      // Variant-generation mode uses a simpler system prompt — the standard
      // one forces "raw HTML, start with <!DOCTYPE>" which conflicts with the
      // user prompt's JSON wrapper request, and Claude follows the stronger
      // system instruction.
      const systemPrompt = body.abVariantOf
        ? `You are a marketing copywriter for ${body.hospitalName || "a premium aesthetic clinic"} in Switzerland.
Write in German (Swiss German style, formal "Sie").

Channel: ${body.channel}.
Available template variables (use exactly as shown):
- {{vorname}} — patient first name
- {{nachname}} — patient last name
- {{behandlung}} — treatment name
- {{buchungslink}} — booking page URL (auto-generated)
${body.promoCode ? `- Promo code to mention: ${body.promoCode}` : ""}

Follow the response format the user asks for exactly. When asked for JSON, return only valid JSON.`
        : `You are a marketing copywriter for ${body.hospitalName || "a premium aesthetic clinic"} in Switzerland.
Write in German (Swiss German style, formal "Sie").

${channelInstructions[body.channel]}

Available template variables (use exactly as shown):
- {{vorname}} — patient first name
- {{nachname}} — patient last name
- {{behandlung}} — treatment name
- {{buchungslink}} — booking page URL (auto-generated)
${body.promoCode ? `- Promo code to mention: ${body.promoCode}` : ""}
${body.segmentDescription ? `\nTarget audience: ${body.segmentDescription}` : ""}

Return ONLY the raw message content. NEVER wrap output in markdown code fences (no \`\`\`html, no \`\`\`). NEVER add explanations before or after. For HTML email, start directly with <!DOCTYPE html> or the first HTML element. For plain text, start with "Subject:".`;

      // For A/B variant generation, build a dedicated prompt that emphasizes
      // creating a meaningfully different angle while keeping the same offer
      // AND preserving Variant A's visual design system (colors, fonts,
      // layout, brand identity).
      let userPrompt = body.prompt;
      if (body.abVariantOf) {
        const needsSubject = body.channel === "email" || body.channel === "html_email";

        // For html_email we want two separable pieces:
        //
        // 1. OFFER SUMMARY — short, plain-text description of *what* the
        //    campaign is about. Showing Claude the full Variant A copy makes
        //    it anchor and produce near-copies, so we summarize aggressively.
        //
        // 2. DESIGN REFERENCE — the visual scaffolding (CSS / palette / hero
        //    structure / typography). We want Claude to copy this verbatim
        //    so the brand look stays consistent across A/B/C; only the copy
        //    varies. This means handing it the <head> (containing <style>)
        //    and the first chunk of the body shell.
        let offerSummary = body.abVariantOf;
        let designReference = "";
        if (body.channel === "html_email") {
          const titleMatch = body.abVariantOf.match(/<title[^>]*>([^<]+)<\/title>/i);
          const h1Match = body.abVariantOf.match(/<h1[^>]*>([^<]+)<\/h1>/i);
          const bodyMatch = body.abVariantOf.match(/<body[^>]*>([\s\S]+?)(?:<\/body>|$)/i);
          const bodyText = (bodyMatch?.[1] ?? "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 400);
          offerSummary = [
            titleMatch ? `Title: ${titleMatch[1].trim()}` : "",
            h1Match ? `Headline: ${h1Match[1].trim()}` : "",
            bodyText ? `Sample copy (first 400 chars, plain text): ${bodyText}` : "",
          ]
            .filter(Boolean)
            .join("\n");

          // Pull the <head> verbatim — that's where <style>, brand colors,
          // and font choices live. Trim to a sane upper bound so we don't
          // explode the prompt on huge inline-CSS emails.
          //
          // IMPORTANT: do NOT pass any of <body>. We only want Claude to see
          // the design tokens (CSS, fonts), not the actual copy/layout it
          // could anchor on and regurgitate. The offer summary above is
          // enough context for what to write.
          const headMatch = body.abVariantOf.match(/<head[^>]*>([\s\S]+?)<\/head>/i);
          const headHtml = (headMatch?.[1] ?? "").slice(0, 4000);
          designReference = headHtml ? `<head>\n${headHtml}\n</head>` : "";
        }

        if (body.preserveCopy) {
          // "Mention promo code" path — DON'T diverge. Keep the existing copy
          // and design intact; only weave in the promo code in a natural,
          // prominent spot.
          userPrompt = `You are editing an existing marketing message to weave in a promo code. KEEP the existing copy, tone, structure, and visual design intact — only add a clear, prominent mention of the promo code "${body.promoCode || ""}" in a natural place (typically near the call-to-action). Do NOT rewrite, do NOT change the offer angle, do NOT change colors/fonts/layout.\n\nExisting message to edit:\n"""\n${body.abVariantOf}\n"""`;
          if (needsSubject) {
            userPrompt += `\n\nResponse format — return ONLY a single valid JSON object, no markdown fences, no prose around it:\n{"subject": "<keep the original subject, optionally append the code>", "body": "<the complete edited message in the same channel format and visual design>"}\n\nFor html_email the body must be a complete HTML document starting with <!DOCTYPE html>.`;
          } else {
            userPrompt += `\n\nReturn ONLY the edited message body — no subject, no preamble, no quotes, no JSON.`;
          }
        } else {
          userPrompt = `You are writing variant B of an A/B test for a marketing campaign. The brand's visual design (colors, fonts, layout, hero pattern) MUST stay consistent across variants — only the copy and angle change.\n\nCampaign offer summary (DO NOT copy phrases from this — it's just context for what the campaign is about):\n"""\n${offerSummary}\n"""`;
          if (designReference && body.channel === "html_email") {
            userPrompt += `\n\n========== DESIGN SYSTEM TO PRESERVE ==========\nReuse the EXACT same CSS, color palette, typography, header layout, and overall visual structure shown below. Do NOT invent new colors or fonts. Do NOT switch to a different layout. The user must recognize this as the same brand.\n\n${designReference}\n================================================`;
          }
          if (body.abStyleHint) {
            userPrompt += `\n\n========== MANDATORY COPY STYLE CONSTRAINT ==========\nThis variant MUST satisfy ALL of the following copy / messaging rules — if any are missing, you have failed the task:\n${body.abStyleHint}\n================================================`;
          }
          userPrompt += `\n\nWrite a fresh, original variant B in Swiss German (formal "Sie"). Same offer/discount/audience as variant A, but different opening, different angle, different framing, different subject line. The visual design (CSS, colors, layout) must match variant A exactly.`;
          if (needsSubject) {
            userPrompt += `\n\nResponse format — return ONLY a single valid JSON object, no markdown fences, no prose around it:\n{"subject": "<short subject for variant B>", "body": "<complete message, same channel format AND same visual design as variant A>"}\n\nFor html_email the body must be a complete HTML document starting with <!DOCTYPE html>, reusing the exact same <head>/CSS as the design reference above.`;
          } else {
            userPrompt += `\n\nReturn ONLY the message body — no subject, no preamble, no quotes, no JSON.`;
          }
        }
      }

      // Build user message — include screenshot as image content block if available
      const isFirstMessage = !body.previousMessages || body.previousMessages.length === 0;
      const textContent = `${userPrompt}${(isFirstMessage && screenshotBase64 && !body.abVariantOf) ? `\n\nATTACHED IMAGE: This is the actual screenshot of the clinic's website at ${effectiveReferenceUrl}. You MUST carefully analyze this image and extract:
1. The EXACT primary brand color (what color dominates the buttons, headers, logo accents?)
2. The background color (light/dark/warm/cool?)
3. The font style (serif/sans-serif, elegant/bold/minimal?)
4. The overall mood (luxurious/playful/clinical/warm?)
5. The header layout and visual style

Then use these EXACT extracted properties in your HTML email. Do NOT use generic purple/blue/gray. If the website uses red/coral → use red/coral. If it uses beige/gold → use beige/gold. Match the REAL brand.

CRITICAL: Return ONLY raw HTML. Do NOT wrap in markdown code fences (no \`\`\`html). Start directly with <!DOCTYPE html> or the first HTML element.` : ""}`;

      // Build the current user message content — either plain string or multimodal array.
      // Skip the screenshot for variant generation: it's irrelevant to the
      // copy-rewrite task and can confuse the model into describing the image
      // instead of producing a divergent variant.
      const currentUserContent: string | Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> =
        (isFirstMessage && screenshotBase64 && !body.abVariantOf)
          ? [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: screenshotBase64,
                },
              },
              { type: "text", text: textContent },
            ]
          : textContent;

      const messages = [
        ...(body.previousMessages || []),
        { role: "user" as const, content: currentUserContent as any },
      ];

      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

      let responseText: string;

      if (body.channel === "html_email" && body.selectedSnippet && ANTHROPIC_API_KEY) {
        const userMessage = buildSnippetEditUserMessage(
          body.brandHead || "",
          body.selectedSnippet,
          body.prompt || "",
        );
        logger.info(
          `[flows] compose snippet-edit: snippet=${body.selectedSnippet.length}b, head=${(body.brandHead || "").length}b`
        );
        const resp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            system: SNIPPET_EDIT_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          logger.error(`[flows] snippet-edit Anthropic ${resp.status}: ${errText.slice(0, 500)}`);
          return res.status(502).json({ error: `Anthropic API ${resp.status}` });
        }
        const data = (await resp.json()) as { content: Array<{ type: string; text?: string }> };
        const raw = data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("");
        const replacementSnippet = stripMarkdownFencesServer(raw);
        return res.json({ replacementSnippet });
      }

      if (body.channel === "html_email" && ANTHROPIC_API_KEY && !body.abVariantOf) {
        // Log what we're sending to debug image issues
        const lastMsg = messages[messages.length - 1];
        const lastContent = lastMsg.content;
        if (Array.isArray(lastContent)) {
          logger.info(`[flows] sending multimodal to Claude: ${lastContent.length} blocks (${lastContent.map((b: any) => b.type).join(", ")})`);
          const imgBlock = lastContent.find((b: any) => b.type === "image");
          if (imgBlock) {
            logger.info(`[flows] image block: media_type=${(imgBlock as any).source?.media_type}, data length=${(imgBlock as any).source?.data?.length || 0}`);
          }
        } else {
          logger.info(`[flows] sending text-only to Claude (${typeof lastContent === "string" ? lastContent.length : "?"} chars)`);
        }

        // Stream the Anthropic response to the client via SSE so the preview
        // fills in progressively instead of blocking for ~90s.
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        (res as any).flushHeaders?.();

        const tStream = Date.now();
        const upstream = await fetch("https://api.anthropic.com/v1/messages", {
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
            stream: true,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text();
          logger.error(`[flows] Anthropic API ${upstream.status}: ${errText.slice(0, 500)}`);
          res.write(`data: ${JSON.stringify({ error: `Anthropic API ${upstream.status}` })}\n\n`);
          res.end();
          return;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let firstChunkAt = 0;
        let totalChars = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Anthropic SSE frames are separated by blank lines (\n\n)
            const frames = buffer.split("\n\n");
            buffer = frames.pop() || "";
            for (const frame of frames) {
              for (const line of frame.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const payload = line.slice(6).trim();
                if (!payload || payload === "[DONE]") continue;
                try {
                  const json = JSON.parse(payload);
                  if (
                    json.type === "content_block_delta" &&
                    json.delta?.type === "text_delta" &&
                    typeof json.delta.text === "string"
                  ) {
                    if (!firstChunkAt) firstChunkAt = Date.now();
                    totalChars += json.delta.text.length;
                    res.write(`data: ${JSON.stringify({ text: json.delta.text })}\n\n`);
                  }
                } catch { /* ignore non-JSON keepalive lines */ }
              }
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`[flows] stream error: ${msg}`);
          res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        }

        logger.info(
          `[flows] stream done: first chunk in ${firstChunkAt ? firstChunkAt - tStream : -1}ms, total ${totalChars} chars in ${Date.now() - tStream}ms`
        );
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      } else if (MISTRAL_API_KEY && !(body.channel === "html_email" && body.abVariantOf && ANTHROPIC_API_KEY)) {
        // Skip Mistral for html_email variant generation when Anthropic is
        // available — Mistral-small produces near-duplicates and rarely
        // honors the JSON response format, causing the client-side
        // "result identical to Variant A" alert. Fall through to Anthropic.
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

      // Variant-generation mode: parse the structured JSON the model was
      // asked to return. Multiple fallbacks because the AI may ignore the
      // JSON instruction even with the simpler system prompt.
      if (body.abVariantOf) {
        const needsSubject = body.channel === "email" || body.channel === "html_email";
        let subject: string | undefined;
        let bodyText = responseText;

        if (needsSubject) {
          // 1) Strip markdown fences and try JSON parse first.
          const cleaned = responseText
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "");
          let parsedOk = false;
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === "object") {
              if (typeof parsed.subject === "string" && parsed.subject.trim()) {
                subject = parsed.subject.trim();
              }
              if (typeof parsed.body === "string") {
                bodyText = parsed.body;
                parsedOk = true;
              }
            }
          } catch {
            // ignore — handled by fallbacks below
          }

          // 2) "Subject: X\n\n" prefix regex.
          if (!parsedOk) {
            const m = responseText.match(/^\s*Subject:\s*(.+?)\s*(?:\n|$)/i);
            if (m) {
              subject = m[1].trim();
              bodyText = responseText.slice(m[0].length).trimStart();
              parsedOk = true;
            }
          }

          // 3) For html_email, extract <title> from the HTML head as a
          //    last-resort subject. Most well-formed marketing emails set
          //    a meaningful <title>, and Claude does generate distinct
          //    titles for distinct variants.
          if (!subject && body.channel === "html_email") {
            const titleMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
              subject = titleMatch[1].trim();
            }
          }
        }
        return res.json({ subject, body: bodyText });
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
      if (!flow.channel || !flow.segmentFilters) {
        return res.status(400).json({ message: "Campaign is incomplete" });
      }

      // Load variants for this flow (empty array if no variants configured).
      const variants = await db
        .select()
        .from(flowVariants)
        .where(eq(flowVariants.flowId, flow.id))
        .orderBy(flowVariants.label);

      // A/B is active only when it's enabled AND at least 2 variants are configured.
      const effectiveAbEnabled = flow.abTestEnabled && variants.length >= 2;

      // A campaign with no template and no variants is invalid.
      if (!flow.messageTemplate && variants.length === 0) {
        return res.status(400).json({ message: "Campaign is incomplete — no message template" });
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

      // Phase C: resolve audience from flow_hospitals join table so the send
      // loop targets exactly the hospitals that were selected when the campaign
      // was created (not the X-Active-Scope header).
      let audienceHospitalIds: string[];
      try {
        audienceHospitalIds = await resolveFlowsAudienceScope(req, userId, hospitalId, { flowId });
      } catch (e) {
        if (e instanceof FlowsScopeForbiddenError) {
          return res.status(403).json({ message: e.message, code: e.code });
        }
        throw e;
      }

      // Phase C.1 defence-in-depth: a chain campaign may target hospitals
      // beyond the calling user's active one. The audience was set when a
      // group_admin created the flow via /api/chain/:groupId/flows, but the
      // /send endpoint accepts any user with marketing access on the active
      // hospital. Re-verify chain authority before fanning out across
      // siblings — otherwise a marketer at one location could trigger sends
      // across the chain by hitting the right flow_id.
      const widensBeyondActive =
        audienceHospitalIds.length > 1 ||
        (audienceHospitalIds.length === 1 && audienceHospitalIds[0] !== hospitalId);
      if (widensBeyondActive) {
        const [u] = await db
          .select({ isPlatformAdmin: users.isPlatformAdmin })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const isPlatformAdmin = u?.isPlatformAdmin === true;
        if (!isPlatformAdmin) {
          const isGroupAdmin = await userIsGroupAdminForHospital(userId, hospitalId, req);
          if (!isGroupAdmin) {
            return res.status(403).json({
              message: "Chain campaign send requires group_admin authority",
              code: "GROUP_SCOPE_FORBIDDEN",
            });
          }
        }
      }

      // Query segment patients (inline — matching the same logic as segment-count)
      const segmentFilters = flow.segmentFilters as Array<{
        field: string;
        operator: string;
        value: string;
      }>;

      const hospitalCond = audienceHospitalIds.length === 1
        ? eq(patients.hospitalId, audienceHospitalIds[0])
        : inArray(patients.hospitalId, audienceHospitalIds);

      const conditions: any[] = [
        hospitalCond,
        isNull(patients.deletedAt),
        eq(patients.isArchived, false),
        ...consentConditionsFor(flow.channel),
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

      // Resolve a service code for the booking link's "?service=" preselect.
      // Priority: explicit campaignTreatmentId on the flow > treatment filter
      // in the segment > nothing (treatment picker shown at booking time).
      const filters = flow.segmentFilters as Array<{ field: string; operator: string; value: string }> | null;
      const treatmentFilter = filters?.find(f => f.field === "treatment");
      let serviceCode: string | null = null;
      let treatmentName = "";
      if (flow.campaignTreatmentId) {
        const [svc] = await db
          .select({ code: clinicServices.code, name: clinicServices.name })
          .from(clinicServices)
          .where(eq(clinicServices.id, flow.campaignTreatmentId))
          .limit(1);
        if (svc?.code) {
          serviceCode = svc.code;
          treatmentName = svc.name ?? "";
        }
      }
      if (!serviceCode && treatmentFilter) {
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

      let sentCount = 0;
      let failCount = 0;

      // Prefer the explicitly-configured production URL — request-derived URL
      // would yield http:// without `app.set("trust proxy", ...)` and is also
      // attacker-influenceable via the Host header.
      const baseUrl =
        process.env.PRODUCTION_URL ||
        `${req.protocol}://${req.get("host")}`;

      for (const patient of patientResults) {
        try {
          const assignment = effectiveAbEnabled
            ? assignVariant(patient.id, flow, variants)
            : { variant: variants[0] ?? null, sendNow: true };

          // Hold-out: create a pending execution row (no variant yet) and skip
          // sending. The manual "Pick winner → send to remainder" button will
          // pick these up later.
          if (!assignment.sendNow) {
            await db.insert(flowExecutions).values({
              flowId,
              patientId: patient.id,
              status: "pending",
              variantId: null,
            });
            continue;
          }

          // Variant-aware template + subject. Falls back to flow-level for
          // non-A/B flows that have no variants.
          const chosenTemplate = assignment.variant?.messageTemplate ?? flow.messageTemplate!;
          const chosenSubject = assignment.variant?.messageSubject ?? flow.messageSubject;

          let message = chosenTemplate;

          // Create execution record
          const [execution] = await db
            .insert(flowExecutions)
            .values({
              flowId,
              patientId: patient.id,
              status: "running",
              variantId: assignment.variant?.id ?? null,
            })
            .returning();

          const fe = generateExecutionToken(execution.id, assignment.variant?.id ?? null);
          // Per-patient booking URL: same shape as the test-send preview
          // (treatment preselect, prefilled identity, attribution UTMs) plus
          // the per-execution `fe` token for booking attribution.
          const bookingQuery = buildBookingQuery({
            channel: flow.channel as "sms" | "email" | "html_email",
            flowId: flow.id,
            flowName: flow.name || undefined,
            serviceCode,
            promoCode,
          });
          // The booking page exchanges `fe` for the patient's identity via
          // /api/public/booking/:token/prefill — keeps PII out of the URL.
          const bookingUrl = `${baseBookingUrl}${bookingQuery}&fe=${fe}`;

          message = message.replace(/\{\{vorname\}\}/g, patient.firstName || "");
          message = message.replace(/\{\{nachname\}\}/g, patient.surname || "");
          message = message.replace(/\{\{behandlung\}\}/g, treatmentName);
          message = message.replace(/\{\{buchungslink\}\}/g, bookingUrl);

          let sendSuccess = false;

          if (flow.channel === "sms" && patient.phone) {
            const token = generateUnsubscribeToken(patient.id, hospitalId);
            const smsWithFooter = `${message}\n\nAbmelden: ${baseUrl}/unsubscribe/${token}`;
            const result = await sendSms(patient.phone, smsWithFooter, hospitalId);
            sendSuccess = result.success;
          } else if (
            (flow.channel === "email" || flow.channel === "html_email") &&
            patient.email
          ) {
            try {
              const { client, fromEmail } = await getUncachableResendClient();
              const subject = chosenSubject || "Nachricht von Ihrer Praxis";
              const baseHtml =
                flow.channel === "html_email"
                  ? message
                  : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
              const token = generateUnsubscribeToken(patient.id, hospitalId);
              const htmlWithFooter = appendUnsubscribeFooter(
                baseHtml,
                token,
                baseUrl,
                "de",
              );
              const sendResult = await client.emails.send({
                from: fromEmail,
                to: patient.email,
                subject,
                html: htmlWithFooter,
              });
              if (sendResult.data?.id) {
                await db
                  .update(flowExecutions)
                  .set({ resendEmailId: sendResult.data.id })
                  .where(eq(flowExecutions.id, execution.id));
              }
              sendSuccess = !!sendResult.data?.id;
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

// ─── Metrics ──────────────────────────────────────────────────

router.get(
  "/api/business/:hospitalId/flows/metrics/summary",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId } = req.params;
      const sinceParam = req.query.since as string | undefined;
      const since = sinceParam
        ? new Date(sinceParam)
        : (() => {
            const d = new Date();
            d.setUTCDate(1);
            d.setUTCHours(0, 0, 0, 0);
            return d;
          })();
      if (Number.isNaN(since.getTime())) {
        return res.status(400).json({ message: "Invalid since parameter" });
      }
      const rows = await summarizeFlows(hospitalId, since);
      res.json({ since: since.toISOString(), rows });
    } catch (err) {
      logger.error("[flows] metrics summary error:", err);
      res.status(500).json({ message: "Failed to load summary" });
    }
  },
);

router.get(
  "/api/business/:hospitalId/flows/:flowId/metrics",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    try {
      const { hospitalId, flowId } = req.params;
      // Verify the flow belongs to this hospital before exposing detail
      const [flow] = await db
        .select({ id: flows.id })
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      const detail = await flowDetail(flowId);
      res.json(detail);
    } catch (err) {
      logger.error("[flows] flow detail metrics error:", err);
      res.status(500).json({ message: "Failed to load flow detail" });
    }
  },
);

// ─── A/B: manual pick-winner ──────────────────────────────────

router.post(
  "/api/business/:hospitalId/flows/:flowId/pick-winner",
  isAuthenticated,
  isMarketingAccess,
  async (req: Request, res: Response) => {
    (req as any).setTimeout(300000); // 5 min for remainder sends
    res.setTimeout(300000);
    try {
      const { hospitalId, flowId } = req.params;
      const { variantId } = req.body as { variantId?: string };
      if (!variantId) return res.status(400).json({ message: "variantId required" });

      const [flow] = await db
        .select()
        .from(flows)
        .where(and(eq(flows.id, flowId), eq(flows.hospitalId, hospitalId)));
      if (!flow) return res.status(404).json({ message: "Campaign not found" });
      if (!flow.abTestEnabled) {
        return res.status(400).json({ message: "Campaign is not an A/B test" });
      }
      if (flow.abWinnerVariantId) {
        return res.status(400).json({ message: "Winner already picked" });
      }

      const [variant] = await db
        .select()
        .from(flowVariants)
        .where(and(eq(flowVariants.id, variantId), eq(flowVariants.flowId, flow.id)));
      if (!variant) return res.status(404).json({ message: "Variant not found" });

      // Mark winner immediately so the UI reflects the decision
      await db
        .update(flows)
        .set({
          abWinnerVariantId: variantId,
          abWinnerStatus: "manual",
          abWinnerSentAt: new Date(),
        })
        .where(eq(flows.id, flow.id));

      const result = await sendRemainderForWinner(flow, variant, req);

      res.json({
        winnerVariantId: variantId,
        sentToRemainder: result.sentCount,
        failedInRemainder: result.failedCount,
      });
    } catch (err) {
      logger.error("[flows] pick-winner error:", err);
      res.status(500).json({ message: "Pick-winner failed" });
    }
  }
);

export default router;
