/**
 * Shared referral analytics query helpers.
 *
 * Used by both:
 *  - server/routes/business.ts  (/api/business/:hospitalId/referral-*)
 *  - server/routes/chain.ts     (/api/chain/:groupId/referral-*)
 *
 * Each function takes a validated `hospitalIds` array (never empty) and returns
 * the response payload directly. The callers are responsible for the empty-array
 * guard and for sending the HTTP response.
 */

import { db } from "../db";
import {
  hospitals,
  referralEvents,
  patients,
  clinicAppointments,
  clinicServices,
  leads,
} from "@shared/schema";
import { and, eq, gte, inArray, lte, sql, desc } from "drizzle-orm";

/**
 * Build a single-column scope predicate. When `hospitalIds` has one entry we
 * use `eq` (avoids a trivial IN list); otherwise `inArray`.
 */
function hospitalScopeClause(column: any, hospitalIds: string[]) {
  return hospitalIds.length === 1
    ? eq(column, hospitalIds[0])
    : inArray(column, hospitalIds);
}

// ---------------------------------------------------------------------------
// referral-stats
// ---------------------------------------------------------------------------

export interface ReferralStatsResult {
  breakdown: Array<{
    referralSource: string | null;
    referralSourceDetail: string;
    isPaid: boolean;
    count: number;
  }>;
  totalReferrals: number;
}

export async function getReferralStats(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {}
): Promise<ReferralStatsResult> {
  const { from, to } = opts;

  const filters: any[] = [hospitalScopeClause(referralEvents.hospitalId, hospitalIds)];
  if (from) filters.push(gte(referralEvents.createdAt, new Date(from)));
  if (to) filters.push(lte(referralEvents.createdAt, new Date(to)));

  const isPaidExpr = sql`CASE WHEN ${referralEvents.utmMedium} IN ('cpc', 'paid', 'ppc', 'paidsocial', 'paid_social') OR ${referralEvents.gclid} IS NOT NULL OR ${referralEvents.gbraid} IS NOT NULL OR ${referralEvents.wbraid} IS NOT NULL OR ${referralEvents.fbclid} IS NOT NULL OR ${referralEvents.ttclid} IS NOT NULL OR ${referralEvents.msclkid} IS NOT NULL OR ${referralEvents.metaLeadId} IS NOT NULL THEN true ELSE false END`;

  const breakdown = await db
    .select({
      referralSource: referralEvents.source,
      referralSourceDetail: sql<string>`INITCAP(${referralEvents.sourceDetail})`,
      isPaid: sql<boolean>`${isPaidExpr}`,
      count: sql<number>`count(*)::int`,
    })
    .from(referralEvents)
    .where(and(...filters))
    .groupBy(referralEvents.source, sql`INITCAP(${referralEvents.sourceDetail})`, isPaidExpr);

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referralEvents)
    .where(and(...filters));

  return {
    breakdown,
    totalReferrals: totalResult?.count || 0,
  };
}

// ---------------------------------------------------------------------------
// referral-timeseries
// ---------------------------------------------------------------------------

export interface ReferralTimeseriesRow {
  month: string;
  referralSource: string | null;
  count: number;
}

export async function getReferralTimeseries(
  hospitalIds: string[]
): Promise<ReferralTimeseriesRow[]> {
  return db
    .select({
      month: sql<string>`to_char(${referralEvents.createdAt}, 'YYYY-MM')`,
      referralSource: referralEvents.source,
      count: sql<number>`count(*)::int`,
    })
    .from(referralEvents)
    .where(hospitalScopeClause(referralEvents.hospitalId, hospitalIds))
    .groupBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`, referralEvents.source)
    .orderBy(sql`to_char(${referralEvents.createdAt}, 'YYYY-MM')`);
}

// ---------------------------------------------------------------------------
// referral-daily — daily-by-source counts with gap-free padding
// ---------------------------------------------------------------------------

export interface ReferralDailyRow {
  date: string;                     // 'YYYY-MM-DD' in the bucketing timezone
  total: number;
  bySource: Record<string, number>;
}

export interface ReferralDailyResult {
  rows: ReferralDailyRow[];
  sources: string[];
  timezone: string;
}

export class ReferralDailyRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferralDailyRangeError";
  }
}

const MAX_DAILY_RANGE_DAYS = 366;

export async function getReferralDailyBySource(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {},
): Promise<ReferralDailyResult> {
  // 1. Resolve the bucketing timezone. All hospitals in scope share one tz =>
  //    use it; mixed tz => UTC.
  const tzRows = await db
    .select({ tz: hospitals.timezone })
    .from(hospitals)
    .where(hospitalScopeClause(hospitals.id, hospitalIds));
  const distinctTz = new Set(tzRows.map((r) => r.tz || "UTC"));
  const timezone = distinctTz.size === 1 ? [...distinctTz][0]! : "UTC";

  // 2. Resolve [from, to] with defaults: to = now, from = to - 90d.
  const toDate = opts.to ? new Date(opts.to) : new Date();
  const fromDate = opts.from
    ? new Date(opts.from)
    : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    throw new ReferralDailyRangeError("invalid from/to");
  }
  const rangeDays = Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
  if (rangeDays > MAX_DAILY_RANGE_DAYS) {
    throw new ReferralDailyRangeError(`range exceeds ${MAX_DAILY_RANGE_DAYS} days`);
  }
  if (rangeDays < 0) {
    throw new ReferralDailyRangeError("from is after to");
  }

  // 3. One query: generate_series LEFT JOIN grouped events.
  //    The bucketing is `to_char(re.created_at AT TIME ZONE $tz, 'YYYY-MM-DD')`.
  //    Filter events by the bucketed day vs the [from, to] day strings so the
  //    upper bound is inclusive of the entire local day in `timezone`.
  const fromDay = fromDate.toISOString().slice(0, 10);
  const toDay = toDate.toISOString().slice(0, 10);
  const result = await db.execute(sql`
    WITH days AS (
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day
      FROM generate_series(
        ${fromDay}::date,
        ${toDay}::date,
        '1 day'
      ) AS d
    ),
    events AS (
      SELECT
        to_char(re.created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day,
        re.source AS source,
        count(*)::int AS count
      FROM referral_events re
      WHERE ${hospitalIds.length === 1
        ? sql`re.hospital_id = ${hospitalIds[0]}`
        : sql`re.hospital_id IN (${sql.join(hospitalIds.map((id) => sql`${id}`), sql`, `)})`}
        AND to_char(re.created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') >= ${fromDay}
        AND to_char(re.created_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') <= ${toDay}
      GROUP BY 1, 2
    )
    SELECT
      d.day AS date,
      e.source AS source,
      COALESCE(e.count, 0) AS count
    FROM days d
    LEFT JOIN events e ON e.day = d.day
    ORDER BY d.day ASC, e.source ASC NULLS LAST
  `);

  // 4. Fold flat rows into one row per day.
  const rowMap = new Map<string, ReferralDailyRow>();
  const totals: Record<string, number> = {};
  for (const r of result.rows as Array<{ date: string; source: string | null; count: number }>) {
    let row = rowMap.get(r.date);
    if (!row) {
      row = { date: r.date, total: 0, bySource: {} };
      rowMap.set(r.date, row);
    }
    if (r.source && r.count > 0) {
      row.bySource[r.source] = (row.bySource[r.source] ?? 0) + r.count;
      row.total += r.count;
      totals[r.source] = (totals[r.source] ?? 0) + r.count;
    }
  }
  const rows = [...rowMap.values()];
  const sources = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  return { rows, sources, timezone };
}

// ---------------------------------------------------------------------------
// referral-events (list)
// ---------------------------------------------------------------------------

const NO_CAMPAIGN_SENTINEL = "__none__";

export interface ReferralEventsListResult {
  rows: any[];
  total: number;
  campaigns: string[];
}

export async function listReferralEvents(
  hospitalIds: string[],
  opts: {
    limit?: number;
    before?: Date;
    from?: string;
    to?: string;
    campaign?: string;
  } = {},
): Promise<ReferralEventsListResult> {
  const { limit = 50, before, from, to, campaign } = opts;

  // Filter predicates shared by rows + total. campaigns list reuses scope+date only.
  const scopeAndDateFilters: any[] = [hospitalScopeClause(referralEvents.hospitalId, hospitalIds)];
  if (from) scopeAndDateFilters.push(gte(referralEvents.createdAt, new Date(from)));
  if (to) scopeAndDateFilters.push(lte(referralEvents.createdAt, new Date(to)));

  const rowsAndTotalFilters: any[] = [...scopeAndDateFilters];
  if (campaign === NO_CAMPAIGN_SENTINEL) {
    rowsAndTotalFilters.push(
      sql`(COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign}) IS NULL OR COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign}) = '')`,
    );
  } else if (campaign && campaign.length > 0) {
    rowsAndTotalFilters.push(
      sql`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign}) = ${campaign}`,
    );
  }

  const pageFilters = [...rowsAndTotalFilters];
  if (before) pageFilters.push(sql`${referralEvents.createdAt} < ${before}`);

  const rows = await db
    .select({
      id: referralEvents.id,
      hospitalId: referralEvents.hospitalId,
      source: referralEvents.source,
      sourceDetail: referralEvents.sourceDetail,
      utmSource: referralEvents.utmSource,
      utmMedium: referralEvents.utmMedium,
      utmCampaign: referralEvents.utmCampaign,
      utmTerm: referralEvents.utmTerm,
      utmContent: referralEvents.utmContent,
      gclid: referralEvents.gclid,
      gbraid: referralEvents.gbraid,
      wbraid: referralEvents.wbraid,
      fbclid: referralEvents.fbclid,
      ttclid: referralEvents.ttclid,
      msclkid: referralEvents.msclkid,
      igshid: referralEvents.igshid,
      li_fat_id: referralEvents.li_fat_id,
      twclid: referralEvents.twclid,
      metaLeadId: referralEvents.metaLeadId,
      metaFormId: referralEvents.metaFormId,
      campaignId: referralEvents.campaignId,
      campaignName: referralEvents.campaignName,
      adsetId: referralEvents.adsetId,
      adId: referralEvents.adId,
      campaign: sql<string | null>`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign})`.as("campaign"),
      captureMethod: referralEvents.captureMethod,
      createdAt: referralEvents.createdAt,
      patientFirstName: patients.firstName,
      patientLastName: patients.surname,
      email: sql<string | null>`COALESCE(${patients.email}, ${leads.email})`.as("email"),
      treatmentName: clinicServices.name,
    })
    .from(referralEvents)
    .innerJoin(patients, eq(referralEvents.patientId, patients.id))
    .leftJoin(leads, eq(referralEvents.leadId, leads.id))
    .leftJoin(clinicAppointments, eq(referralEvents.appointmentId, clinicAppointments.id))
    .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
    .where(and(...pageFilters))
    .orderBy(desc(referralEvents.createdAt))
    .limit(limit);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(referralEvents)
    .where(and(...rowsAndTotalFilters));

  const distinctRows = await db
    .select({
      c: sql<string | null>`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign})`.as("c"),
    })
    .from(referralEvents)
    .where(and(...scopeAndDateFilters))
    .groupBy(sql`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign})`)
    .orderBy(sql`COALESCE(${referralEvents.campaignName}, ${referralEvents.utmCampaign}) ASC NULLS FIRST`)
    .limit(200);

  let hasNone = false;
  const labeled: string[] = [];
  for (const r of distinctRows) {
    if (r.c === null || r.c === "") {
      hasNone = true;
    } else {
      labeled.push(r.c);
    }
  }
  const campaigns = hasNone ? [NO_CAMPAIGN_SENTINEL, ...labeled] : labeled;

  return { rows, total: totalRow?.count ?? 0, campaigns };
}

// ---------------------------------------------------------------------------
// referral-funnel
// ---------------------------------------------------------------------------

export async function getReferralFunnel(
  hospitalIds: string[],
  opts: { from?: string; to?: string } = {}
) {
  const { from, to } = opts;

  const conditions =
    hospitalIds.length === 1
      ? [sql`re.hospital_id = ${hospitalIds[0]}`]
      : [sql`re.hospital_id IN (${sql.join(hospitalIds.map((id) => sql`${id}`), sql`, `)})`];
  if (from) conditions.push(sql`re.created_at >= ${from}::timestamp`);
  if (to) conditions.push(sql`re.created_at <= ${to}::timestamp`);

  const whereClause = sql.join(conditions, sql` AND `);

  const result = await db.execute(sql`
  SELECT
    re.id AS referral_id,
    re.source,
    re.source_detail,
    re.created_at AS referral_date,
    re.patient_id,
    re.capture_method,
    CASE WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL OR re.fbclid IS NOT NULL OR re.igshid IS NOT NULL OR re.ttclid IS NOT NULL OR re.msclkid IS NOT NULL OR re.li_fat_id IS NOT NULL OR re.twclid IS NOT NULL OR re.meta_lead_id IS NOT NULL OR re.meta_form_id IS NOT NULL THEN true ELSE false END AS has_click_id,
    EXISTS (
      SELECT 1 FROM leads l
      WHERE l.appointment_id = re.appointment_id
        AND l.hospital_id = re.hospital_id
    ) AS from_lead,
    re.gclid,
    re.gbraid,
    re.wbraid,
    re.fbclid,
    re.igshid,
    re.meta_lead_id,
    re.meta_form_id,
    re.utm_source,
    re.utm_campaign,
    COALESCE(re.campaign_name, re.utm_campaign) AS campaign,
    re.campaign_id,
    re.campaign_name,
    ca.id AS appointment_id,
    ca.status AS appointment_status,
    ca.provider_id,
    ca.appointment_date,
    u.first_name AS provider_first_name,
    u.last_name AS provider_last_name,
    s.id AS surgery_id,
    s.status AS surgery_status,
    s.payment_status,
    s.price,
    s.payment_date,
    s.planned_date AS surgery_planned_date,
    s.surgeon_id,
    tr.id AS treatment_id,
    tr.status AS treatment_status,
    tr.performed_at AS treatment_performed_at,
    tr.total AS treatment_total
  FROM referral_events re
  LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
  LEFT JOIN users u ON u.id = ca.provider_id
  LEFT JOIN LATERAL (
    SELECT s2.id, s2.status, s2.payment_status, s2.price, s2.payment_date, s2.planned_date, s2.surgeon_id
    FROM surgeries s2
    WHERE s2.patient_id = re.patient_id
      AND s2.hospital_id = re.hospital_id
      AND s2.planned_date >= re.created_at
      AND s2.is_archived = false
      AND COALESCE(s2.is_suspended, false) = false
    ORDER BY s2.planned_date ASC
    LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT
      t.id,
      t.status,
      t.performed_at,
      (SELECT COALESCE(SUM(tl.total), 0)
       FROM treatment_lines tl
       WHERE tl.treatment_id = t.id) AS total
    FROM treatments t
    WHERE t.hospital_id = re.hospital_id
      AND t.status = 'signed'
      AND (
        t.appointment_id = re.appointment_id
        OR (
          t.appointment_id IS NULL
          AND t.patient_id = re.patient_id
          AND ca.appointment_date IS NOT NULL
          AND (t.performed_at AT TIME ZONE 'UTC')::date = ca.appointment_date
        )
      )
    ORDER BY t.performed_at ASC
    LIMIT 1
  ) tr ON true
  WHERE ${whereClause}
  ORDER BY re.created_at DESC
`);

  return result.rows;
}
