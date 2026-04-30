import { sql } from "drizzle-orm";
import { db } from "../db";
import { marketingAiAnalysisPayloadSchema, type MarketingAiAnalysisPayload } from "@shared/schema";
import logger from "../logger";

export interface CohortStageCounts {
  referrals: number;
  attended: number;
  surgeryPlanned: number;
  paid: number;
  /** Sum of surgery prices for rows where surgery is planned but not yet paid. */
  pendingPipelineChf: number;
}

export interface AggregatedStats {
  dateRange: { start: string; end: string; days: number };
  funnel: {
    leads: number;
    booked: number;
    attended: number;
    paid: number;
    bookedRate: number;
    attendedRate: number;
    paidRate: number;
    topDropoffStage: "lead_to_booked" | "booked_to_attended" | "attended_to_paid";
  };
  /**
   * Conversion-pipeline-aware breakdown by referral age. The aesthetic-clinic
   * pipeline (referral → attended → surgery planned → financed → executed →
   * paid) routinely takes 60–180 days, so paid/planned rates over recent
   * cohorts under-state real performance. The AI uses these buckets to
   * distinguish "low conversion" from "too fresh to score".
   */
  cohortBreakdown: {
    freshUnder30Days: CohortStageCounts;
    maturing30To90Days: CohortStageCounts;
    mature90PlusDays: CohortStageCounts;
    /** Average days from referral_date to payment_date, computed from paid rows only. */
    avgDaysReferralToPaid: number | null;
    /** Sum of `pendingPipelineChf` across all cohorts. */
    totalPendingPipelineChf: number;
  };
  adPerformance: Array<{
    source: string;
    campaign: string | null;
    spend: number;
    leads: number;
    cpl: number;
    cpa: number | null;
    bookedAttributed: number;
    paidAttributed: number;
  }>;
  totals: {
    adSpend: number;
    totalLeads: number;
    avgCpl: number;
    avgCpa: number | null;
  };
}

export interface StatsArgs {
  hospitalId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

function daysBetween(start: string, end: string): number {
  const ms =
    new Date(end + "T00:00:00Z").getTime() -
    new Date(start + "T00:00:00Z").getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1;
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return numerator / denominator;
}

export async function buildAggregatedStats(
  args: StatsArgs,
): Promise<AggregatedStats> {
  const { hospitalId, startDate, endDate } = args;

  // Per-referral pipeline data — same JOIN shape as GET /referral-funnel,
  // but emitted row-by-row so we can compute both stage totals AND the
  // age-bucketed cohort breakdown in JS without re-running the query.
  const funnelResult = await db.execute(sql`
    SELECT
      re.id AS referral_id,
      re.created_at AS referral_date,
      (re.appointment_id IS NOT NULL) AS has_appointment,
      ca.status AS appointment_status,
      s.id AS surgery_id,
      s.price AS surgery_price,
      s.payment_date AS payment_date
    FROM referral_events re
    LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
    LEFT JOIN LATERAL (
      SELECT s2.id, s2.price, s2.payment_date
      FROM surgeries s2
      WHERE s2.patient_id = re.patient_id
        AND s2.hospital_id = re.hospital_id
        AND s2.planned_date >= re.created_at
        AND s2.is_archived = false
        AND COALESCE(s2.is_suspended, false) = false
      ORDER BY s2.planned_date ASC
      LIMIT 1
    ) s ON true
    WHERE re.hospital_id = ${hospitalId}
      AND re.created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
  `);

  const ATTENDED_STATUSES = new Set(["arrived", "in_progress", "completed"]);
  type Row = {
    referral_id: string;
    referral_date: string;
    has_appointment: boolean;
    appointment_status: string | null;
    surgery_id: string | null;
    surgery_price: string | null;
    payment_date: string | null;
  };
  const rows = (funnelResult as any).rows as Row[];

  let leads = 0;
  let booked = 0;
  let attended = 0;
  let paid = 0;

  const emptyCohort = (): CohortStageCounts => ({
    referrals: 0,
    attended: 0,
    surgeryPlanned: 0,
    paid: 0,
    pendingPipelineChf: 0,
  });
  const fresh = emptyCohort();
  const maturing = emptyCohort();
  const mature = emptyCohort();
  const daysToPaid: number[] = [];

  const now = Date.now();
  for (const r of rows) {
    leads++;
    if (r.has_appointment) booked++;
    const isAttended =
      r.appointment_status != null && ATTENDED_STATUSES.has(r.appointment_status);
    if (isAttended) attended++;
    const isPaid = r.payment_date != null;
    if (isPaid) paid++;

    const refTime = new Date(r.referral_date).getTime();
    const ageDays = (now - refTime) / 86_400_000;
    const bucket = ageDays >= 90 ? mature : ageDays >= 30 ? maturing : fresh;

    bucket.referrals++;
    if (isAttended) bucket.attended++;
    if (r.surgery_id) bucket.surgeryPlanned++;
    if (isPaid) bucket.paid++;
    if (r.surgery_id && !isPaid) {
      bucket.pendingPipelineChf += parseFloat(r.surgery_price ?? "0") || 0;
    }

    if (isPaid && r.payment_date) {
      const paidDays = (new Date(r.payment_date).getTime() - refTime) / 86_400_000;
      if (paidDays >= 0) daysToPaid.push(paidDays);
    }
  }

  const drops = {
    lead_to_booked: leads - booked,
    booked_to_attended: booked - attended,
    attended_to_paid: attended - paid,
  } as const;
  let topDropoffStage: keyof typeof drops = "lead_to_booked";
  let topDropAmount = drops.lead_to_booked;
  for (const k of ["booked_to_attended", "attended_to_paid"] as const) {
    if (drops[k] > topDropAmount) {
      topDropAmount = drops[k];
      topDropoffStage = k;
    }
  }

  const avgDaysReferralToPaid =
    daysToPaid.length > 0
      ? Math.round(daysToPaid.reduce((a, b) => a + b, 0) / daysToPaid.length)
      : null;
  const totalPendingPipelineChf = Math.round(
    fresh.pendingPipelineChf + maturing.pendingPipelineChf + mature.pendingPipelineChf,
  );
  for (const c of [fresh, maturing, mature]) {
    c.pendingPipelineChf = Math.round(c.pendingPipelineChf);
  }

  // Ad performance — mirrors GET /ad-performance aggregation.
  // Funnels are classified by click IDs (google_ads/meta_ads/meta_forms).
  // Budget spend is summed from ad_budgets by hospital + funnel + month.
  // "paid" = payment_date IS NOT NULL (same as funnel query above).
  // Output columns aliased to: source (funnel), campaign (month), spend, leads, booked, paid.
  const adResult = await db.execute(sql`
    WITH classified AS (
      SELECT
        re.id AS referral_id,
        TO_CHAR(re.created_at, 'YYYY-MM') AS month,
        CASE
          WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL
            THEN 'google_ads'
          WHEN (re.fbclid IS NOT NULL OR re.igshid IS NOT NULL) AND re.capture_method != 'staff'
            THEN 'meta_ads'
          WHEN re.source = 'social' AND re.capture_method = 'staff'
            AND re.fbclid IS NULL AND re.igshid IS NULL
            THEN 'meta_forms'
          ELSE NULL
        END AS funnel,
        ca.status AS appointment_status,
        s.payment_date
      FROM referral_events re
      LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
      LEFT JOIN LATERAL (
        SELECT s2.payment_date
        FROM surgeries s2
        WHERE s2.patient_id = re.patient_id
          AND s2.hospital_id = re.hospital_id
          AND s2.planned_date >= re.created_at
          AND s2.is_archived = false
          AND COALESCE(s2.is_suspended, false) = false
        ORDER BY s2.planned_date ASC
        LIMIT 1
      ) s ON true
      WHERE re.hospital_id = ${hospitalId}
        AND re.created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
    )
    SELECT
      c.funnel AS source,
      c.month  AS campaign,
      COALESCE(SUM(ab.amount_chf), 0)::text AS spend,
      COUNT(DISTINCT c.referral_id)::text AS leads,
      COUNT(DISTINCT c.referral_id) FILTER (
        WHERE c.appointment_status IN ('scheduled', 'confirmed', 'arrived', 'in_progress', 'completed')
      )::text AS booked,
      COUNT(DISTINCT c.referral_id) FILTER (
        WHERE c.payment_date IS NOT NULL
      )::text AS paid
    FROM classified c
    LEFT JOIN ad_budgets ab
      ON ab.hospital_id = ${hospitalId}
      AND ab.funnel::text = c.funnel
      AND ab.month = c.month
    WHERE c.funnel IS NOT NULL
    GROUP BY c.funnel, c.month
    ORDER BY spend DESC
    LIMIT 20
  `);

  const adRows = ((adResult as any).rows ?? []) as Array<{
    source: string;
    campaign: string | null;
    spend: string;
    leads: string;
    booked: string;
    paid: string;
  }>;

  const adPerformance = adRows.map((r) => {
    const spend = Number(r.spend);
    const leadsN = Number(r.leads);
    const bookedN = Number(r.booked);
    const paidN = Number(r.paid);
    return {
      source: r.source,
      campaign: r.campaign,
      spend,
      leads: leadsN,
      cpl: leadsN ? spend / leadsN : 0,
      cpa: paidN ? spend / paidN : null,
      bookedAttributed: bookedN,
      paidAttributed: paidN,
    };
  });

  const adSpend = adPerformance.reduce((s, r) => s + r.spend, 0);
  const totalLeads = adPerformance.reduce((s, r) => s + r.leads, 0);
  const totalPaid = adPerformance.reduce((s, r) => s + r.paidAttributed, 0);

  return {
    dateRange: {
      start: startDate,
      end: endDate,
      days: daysBetween(startDate, endDate),
    },
    funnel: {
      leads,
      booked,
      attended,
      paid,
      bookedRate: safeRate(booked, leads),
      attendedRate: safeRate(attended, booked),
      paidRate: safeRate(paid, attended),
      topDropoffStage,
    },
    cohortBreakdown: {
      freshUnder30Days: fresh,
      maturing30To90Days: maturing,
      mature90PlusDays: mature,
      avgDaysReferralToPaid,
      totalPendingPipelineChf,
    },
    adPerformance,
    totals: {
      adSpend,
      totalLeads,
      avgCpl: totalLeads ? adSpend / totalLeads : 0,
      avgCpa: totalPaid ? adSpend / totalPaid : null,
    },
  };
}

// ─── Claude caller + validator ────────────────────────────────────────────────

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a marketing analyst for an aesthetic clinic. You receive compact JSON with funnel counts (leads → booked → attended → paid), a cohort-age breakdown of those referrals, and ad-performance per source/campaign for a selected date range.

CRITICAL — pipeline lag in this business:

The conversion pipeline at an aesthetic surgery clinic is long. From referral to attended consultation is typically 2–6 weeks. From attended consultation to a planned surgery is another 2–8 weeks. From planned surgery to payment is 4–16 weeks because patients usually need to secure third-party financing (e.g. PLIM in Switzerland) and wait for an available surgery slot. End-to-end from a fresh referral to a paid surgery routinely takes 60–180 days.

This means a low paidRate or low conversion-to-surgery rate over recent referrals is NOT a bad signal by itself — those cohorts have not had time to mature. Use \`cohortBreakdown\` to interpret correctly:

- \`freshUnder30Days\`: too early to score on paid or surgery-planned rate. Evaluate primarily on attendance (did they show up to the consult).
- \`maturing30To90Days\`: surgery-planned rate is meaningful here; paid rate is still in formation.
- \`mature90PlusDays\`: paid rate is meaningful; this is the cohort to draw ROI conclusions from.
- \`totalPendingPipelineChf\`: surgery prices for planned but not-yet-paid surgeries. Treat this as committed forward revenue when discussing ROI — explicitly mention it rather than judging on paid revenue alone.
- \`avgDaysReferralToPaid\`: indicates the typical pipeline length for this clinic; reference it when explaining why fresh cohorts cannot be judged on paid rate.

When weighing channel performance, prefer the mature cohort numbers. When the mature cohort is very small (e.g. <5 referrals), say so and remain cautious in conclusions.

Produce a concise analysis with this exact JSON shape — no markdown, no prose outside JSON:

{
  "summary": string[],          // 1-3 short plain-text bullets; overall picture
  "trends": string[],           // 0-3 directional observations
  "insights": string[],         // 0-3 non-obvious patterns or outliers
  "suggestedActions": string[]  // 0-3 concrete next steps
}

Rules:
1. Each string max 300 chars, no markdown, no bullet characters.
2. Be specific and quantitative when numbers allow.
3. If the sample is very small (e.g. leads < 10), say so in "summary" and keep other arrays short or empty.
4. Do NOT invent data not present in the input.
5. Avoid generic advice — ground every action in a concrete signal from the data.
6. NEVER call out a low paid/conversion rate as a problem on a cohort that is mostly fresh (<30 days) — frame it as "still in pipeline" instead.
7. If the user message includes "Operator notes:", treat them as operational context the data cannot capture (campaign changes, staffing changes, seasonal events). Use them to inform interpretation but never override what the numbers show.
8. Respond in the language code specified by the user message ("en" or "de").
9. Output ONLY the JSON object.`;

async function callClaude(
  stats: AggregatedStats,
  language: "en" | "de",
  strict: boolean,
  operatorNotes?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const messageParts: string[] = [
    `Language: "${language}"`,
    "",
    "Stats:",
    JSON.stringify(stats),
  ];
  if (operatorNotes && operatorNotes.trim().length > 0) {
    messageParts.push("", "Operator notes:", operatorNotes.trim());
  }
  if (strict) {
    messageParts.push(
      "",
      "Return ONLY a valid JSON object matching the shape. No prose.",
    );
  }
  const userMessage = messageParts.join("\n");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "anthropic api error");
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = (await res.json()) as any;
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Anthropic API error: empty response");
  return text;
}

function tryParse(text: string): MarketingAiAnalysisPayload | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const result = marketingAiAnalysisPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function runAnalysis(
  stats: AggregatedStats,
  language: "en" | "de",
  operatorNotes?: string,
): Promise<MarketingAiAnalysisPayload> {
  const first = await callClaude(stats, language, false, operatorNotes);
  const parsed = tryParse(first);
  if (parsed) return parsed;

  logger.warn("AI analysis first attempt invalid, retrying strict");
  const second = await callClaude(stats, language, true, operatorNotes);
  const parsedRetry = tryParse(second);
  if (parsedRetry) return parsedRetry;

  throw new Error("Invalid AI response after retry");
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";
import {
  getCachedAnalysis,
  upsertAnalysis,
  isFresh,
  type CacheLookup,
} from "../storage/marketingAiAnalyses";
import type { MarketingAiAnalysis } from "@shared/schema";

export interface GetOrCreateArgs extends CacheLookup {
  userId: string;
  force: boolean;
  /**
   * Optional operator-provided context (campaign changes, staffing events,
   * etc.) to weight against the data. When non-empty the result is generated
   * fresh and NOT persisted to cache — notes are ephemeral and would
   * otherwise collide with the per-period unique key.
   */
  operatorNotes?: string;
}

export interface AnalysisResult {
  payload: MarketingAiAnalysisPayload;
  generatedAt: Date;
  generatedBy: string;
  cached: boolean;
  stale: boolean;
}

export function hashStats(stats: AggregatedStats): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stats))
    .digest("hex");
}

export function emptyPayload(language: "en" | "de"): MarketingAiAnalysisPayload {
  const msg =
    language === "de"
      ? "Keine Daten im ausgewählten Zeitraum."
      : "No data in selected range.";
  return { summary: [msg], trends: [], insights: [], suggestedActions: [] };
}

export async function getOrCreateAnalysis(
  args: GetOrCreateArgs,
): Promise<AnalysisResult> {
  const hasNotes = !!(args.operatorNotes && args.operatorNotes.trim().length > 0);

  // When operator notes are present, skip the cache entirely — same-period
  // analyses with different notes would collide on the unique key, and notes
  // are intentionally ephemeral (operator-driven what-ifs, not the canonical
  // baseline view).
  if (!hasNotes) {
    const cached = await getCachedAnalysis(args);
    if (cached && !args.force && isFresh(cached)) {
      return {
        payload: cached.payload,
        generatedAt: new Date(cached.generatedAt),
        generatedBy: cached.generatedBy,
        cached: true,
        stale: false,
      };
    }
  }

  // Dynamic self-import so Vitest's module mock can intercept buildAggregatedStats
  // and runAnalysis when running under test (vi.mock partial mock pattern).
  // In production this resolves the same module from the registry (no extra cost).
  const self = await import("./marketingAiAnalyzer");

  const stats = await self.buildAggregatedStats(args);

  let payload: MarketingAiAnalysisPayload;
  if (stats.funnel.leads === 0 && stats.totals.adSpend === 0) {
    payload = emptyPayload(args.language);
  } else {
    payload = await self.runAnalysis(stats, args.language, args.operatorNotes);
  }

  // Notes-bearing analyses are returned but not persisted (see comment above).
  if (hasNotes) {
    return {
      payload,
      generatedAt: new Date(),
      generatedBy: args.userId,
      cached: false,
      stale: false,
    };
  }

  const row = await upsertAnalysis({
    hospitalId: args.hospitalId,
    startDate: args.startDate,
    endDate: args.endDate,
    language: args.language,
    payload,
    inputHash: hashStats(stats),
    generatedBy: args.userId,
  });

  return {
    payload: row.payload,
    generatedAt: new Date(row.generatedAt),
    generatedBy: row.generatedBy,
    cached: false,
    stale: false,
  };
}
