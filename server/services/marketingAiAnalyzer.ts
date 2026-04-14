import { sql } from "drizzle-orm";
import { db } from "../db";
import { marketingAiAnalysisPayloadSchema, type MarketingAiAnalysisPayload } from "@shared/schema";
import logger from "../logger";

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

  // Funnel counts — mirrors the query used by GET /referral-funnel.
  // Appointments are linked via re.appointment_id (FK to clinic_appointments).
  // "attended" = appointment status in (arrived, in_progress, completed).
  // Surgery is found via LATERAL join on patient_id; "paid" = payment_date IS NOT NULL.
  const funnelResult = await db.execute(sql`
    WITH base AS (
      SELECT
        re.id AS referral_id,
        re.appointment_id,
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
    SELECT 'leads'   AS stage, COUNT(DISTINCT referral_id)::text AS count FROM base
    UNION ALL
    SELECT 'booked',  COUNT(DISTINCT referral_id)::text FROM base WHERE appointment_id IS NOT NULL
    UNION ALL
    SELECT 'attended', COUNT(DISTINCT referral_id)::text FROM base
      WHERE appointment_status IN ('arrived', 'in_progress', 'completed')
    UNION ALL
    SELECT 'paid',    COUNT(DISTINCT referral_id)::text FROM base WHERE payment_date IS NOT NULL
  `);

  const funnelRows = (funnelResult as any).rows as Array<{
    stage: string;
    count: string;
  }>;
  const byStage = new Map(funnelRows.map((r) => [r.stage, Number(r.count)]));
  const leads = byStage.get("leads") ?? 0;
  const booked = byStage.get("booked") ?? 0;
  const attended = byStage.get("attended") ?? 0;
  const paid = byStage.get("paid") ?? 0;

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
      AND ab.funnel = c.funnel
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

const SYSTEM_PROMPT = `You are a marketing analyst for an aesthetic clinic. You receive compact JSON with funnel counts (leads → booked → attended → paid) and ad-performance per source/campaign for a selected date range.

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
6. Respond in the language code specified by the user message ("en" or "de").
7. Output ONLY the JSON object.`;

async function callClaude(
  stats: AggregatedStats,
  language: "en" | "de",
  strict: boolean,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const userMessage = `Language: "${language}"\n\nStats:\n${JSON.stringify(stats)}${
    strict
      ? '\n\nReturn ONLY a valid JSON object matching the shape. No prose.'
      : ""
  }`;

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
): Promise<MarketingAiAnalysisPayload> {
  const first = await callClaude(stats, language, false);
  const parsed = tryParse(first);
  if (parsed) return parsed;

  logger.warn("AI analysis first attempt invalid, retrying strict");
  const second = await callClaude(stats, language, true);
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

  // Dynamic self-import so Vitest's module mock can intercept buildAggregatedStats
  // and runAnalysis when running under test (vi.mock partial mock pattern).
  // In production this resolves the same module from the registry (no extra cost).
  const self = await import("./marketingAiAnalyzer");

  const stats = await self.buildAggregatedStats(args);

  let payload: MarketingAiAnalysisPayload;
  if (stats.funnel.leads === 0 && stats.totals.adSpend === 0) {
    payload = emptyPayload(args.language);
  } else {
    payload = await self.runAnalysis(stats, args.language);
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
