/**
 * Ad performance query helper.
 *
 * Used by both:
 *  - server/routes/business.ts  (/api/business/:hospitalId/ad-performance)
 *  - server/routes/chain.ts     (/api/chain/:groupId/ad-performance)
 *
 * Takes a validated `hospitalIds` array (never empty) and returns
 * the response payload directly. The callers are responsible for the empty-array
 * guard and for sending the HTTP response.
 */

import { db } from "../db";
import { adBudgets } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

export interface AdPerformanceFunnel {
  funnel: string;
  budget: number;
  leads: number;
  appointmentsConfirmed: number;
  appointmentsKept: number;
  paidConversions: number;
  revenue: number;
}

export interface AdPerformanceMonth {
  month: string;
  totalBudget: number;
  totalLeads: number;
  totalConfirmed: number;
  totalKept: number;
  totalPaid: number;
  totalRevenue: number;
  totalCpl: number | null;
  totalCpk: number | null;
  totalCpa: number | null;
  totalRoi: number | null;
  funnels: AdPerformanceFunnel[];
}

export async function getAdPerformance(hospitalIds: string[]): Promise<AdPerformanceMonth[]> {
  // Get all months that have budgets across the given hospitals
  const allBudgets = await db
    .select()
    .from(adBudgets)
    .where(hospitalIds.length === 1 ? eq(adBudgets.hospitalId, hospitalIds[0]) : inArray(adBudgets.hospitalId, hospitalIds))
    .orderBy(adBudgets.month);

  // Get distinct months
  const months = [...new Set(allBudgets.map(b => b.month))].sort();
  if (months.length === 0) {
    return [];
  }

  // Build the IN-list for use in the raw SQL query
  const idList = sql.join(hospitalIds.map(id => sql`${id}`), sql`, `);

  // Classify referrals into funnels, grouped by month
  const result = await db.execute(sql`
    WITH classified AS (
      SELECT
        TO_CHAR(re.created_at, 'YYYY-MM') AS month,
        CASE
          WHEN re.gclid IS NOT NULL OR re.gbraid IS NOT NULL OR re.wbraid IS NOT NULL THEN 'google_ads'
          WHEN (re.fbclid IS NOT NULL OR re.igshid IS NOT NULL) AND re.capture_method != 'staff' THEN 'meta_ads'
          WHEN re.source = 'social' AND re.capture_method = 'staff' AND re.fbclid IS NULL AND re.igshid IS NULL THEN 'meta_forms'
          ELSE NULL
        END AS funnel,
        ca.status AS appointment_status,
        s.payment_status,
        s.payment_date,
        COALESCE(s.price, 0) AS price,
        tr.id AS treatment_id,
        tr.status AS treatment_status,
        COALESCE(tr.total, 0) AS treatment_total
      FROM referral_events re
      LEFT JOIN clinic_appointments ca ON ca.id = re.appointment_id
      LEFT JOIN LATERAL (
        SELECT s2.id, s2.status, s2.payment_status, s2.payment_date, s2.price
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
      WHERE re.hospital_id IN (${idList})
    )
    SELECT
      month,
      funnel,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE appointment_status IN ('scheduled', 'confirmed')) AS appointments_confirmed,
      COUNT(*) FILTER (WHERE appointment_status IN ('arrived', 'in_progress', 'completed')) AS appointments_kept,
      COUNT(*) FILTER (WHERE payment_date IS NOT NULL OR treatment_status = 'signed') AS paid_conversions,
      COALESCE(SUM(price + treatment_total) FILTER (WHERE payment_date IS NOT NULL OR treatment_status = 'signed'), 0) AS revenue
    FROM classified
    WHERE funnel IS NOT NULL
    GROUP BY month, funnel
    ORDER BY month, funnel
  `);

  // Build budget lookup: month -> funnel -> amount
  const budgetMap: Record<string, Record<string, number>> = {};
  for (const b of allBudgets) {
    if (!budgetMap[b.month]) budgetMap[b.month] = {};
    budgetMap[b.month][b.funnel] = b.amountChf;
  }

  // Build metrics lookup: month -> funnel -> metrics
  const metricsMap: Record<string, Record<string, any>> = {};
  for (const row of result.rows as any[]) {
    if (!metricsMap[row.month]) metricsMap[row.month] = {};
    metricsMap[row.month][row.funnel] = row;
  }

  // Build per-month response
  const allFunnels = ['google_ads', 'meta_ads', 'meta_forms'];
  return months.map(month => {
    let totalBudget = 0;
    let totalLeads = 0;
    let totalConfirmed = 0;
    let totalKept = 0;
    let totalPaid = 0;
    let totalRevenue = 0;

    const funnels: AdPerformanceFunnel[] = allFunnels.map(funnel => {
      const m = metricsMap[month]?.[funnel];
      const budget = budgetMap[month]?.[funnel] || 0;
      const leads = Number(m?.leads || 0);
      const appointmentsConfirmed = Number(m?.appointments_confirmed || 0);
      const appointmentsKept = Number(m?.appointments_kept || 0);
      const paidConversions = Number(m?.paid_conversions || 0);
      const revenue = Number(m?.revenue || 0);

      totalBudget += budget;
      totalLeads += leads;
      totalConfirmed += appointmentsConfirmed;
      totalKept += appointmentsKept;
      totalPaid += paidConversions;
      totalRevenue += revenue;

      return {
        funnel,
        budget,
        leads,
        appointmentsConfirmed,
        appointmentsKept,
        paidConversions,
        revenue,
      };
    });

    return {
      month,
      totalBudget,
      totalLeads,
      totalConfirmed,
      totalKept,
      totalPaid,
      totalRevenue,
      totalCpl: totalLeads > 0 ? Math.round(totalBudget / totalLeads) : null,
      totalCpk: totalKept > 0 ? Math.round(totalBudget / totalKept) : null,
      totalCpa: totalPaid > 0 ? Math.round(totalBudget / totalPaid) : null,
      totalRoi: totalBudget > 0 && totalPaid > 0 ? Math.round(((totalRevenue - totalBudget) / totalBudget) * 100) / 100 : null,
      funnels,
    };
  });
}
