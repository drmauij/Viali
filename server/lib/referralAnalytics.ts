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
  referralEvents,
  patients,
  clinicAppointments,
  clinicServices,
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
// referral-events (list)
// ---------------------------------------------------------------------------

export async function listReferralEvents(
  hospitalIds: string[],
  opts: { limit?: number; before?: Date } = {}
) {
  const { limit = 50, before } = opts;

  return db
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
      treatmentName: clinicServices.name,
    })
    .from(referralEvents)
    .innerJoin(patients, eq(referralEvents.patientId, patients.id))
    .leftJoin(clinicAppointments, eq(referralEvents.appointmentId, clinicAppointments.id))
    .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
    .where(
      and(
        hospitalScopeClause(referralEvents.hospitalId, hospitalIds),
        before ? sql`${referralEvents.createdAt} < ${before}` : sql`1=1`
      )
    )
    .orderBy(desc(referralEvents.createdAt))
    .limit(limit);
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
