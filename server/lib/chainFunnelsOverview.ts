/**
 * Chain funnels overview — single round-trip payload for the Overview tab.
 *
 * Runs 4 SQL queries (leads-current, leads-prev, referrals-current, referrals-prev)
 * then assembles all 5 panels (KPIs / leaderboard / heatmap / sourceMix / movers)
 * in JS so each panel is independently testable.
 */

import { db } from "../db";
import { hospitals } from "@shared/schema";
import { inArray, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KpiMetric {
  current: number;
  prev: number;
  deltaPct: number;
}

export interface KpiMetricNullable {
  current: number | null;
  prev: number | null;
  deltaPct: number;
}

export interface ChainFunnelsOverviewKpis {
  leads: KpiMetric;
  referrals: KpiMetric;
  bookings: KpiMetric;
  firstVisits: KpiMetric;
  paidRevenue: KpiMetricNullable;
  conversionPct: KpiMetric;
}

export interface LeaderboardRow {
  hospitalId: string;
  hospitalName: string;
  leads: number;
  referrals: number;
  bookingPct: number;
  firstVisitPct: number;
  paidPct: number;
  revenue: number;
  deltaLeadsPct: number;
}

export interface HeatmapCell {
  source: string;
  hospitalId: string;
  leads: number;
  referrals: number;
  bookingPct: number;
  firstVisitPct: number;
  paidPct: number;
}

export interface HeatmapLocation {
  hospitalId: string;
  hospitalName: string;
}

export interface ChainFunnelsOverviewHeatmap {
  sources: string[];
  locations: HeatmapLocation[];
  cells: HeatmapCell[];
}

export interface SourceMixRow {
  source: string;
  count: number;
  pct: number;
}

export interface MoverRow {
  source: string;
  hospitalId: string;
  hospitalName: string;
  current: number;
  prev: number;
  deltaPct: number;
}

export interface ChainFunnelsOverview {
  kpis: ChainFunnelsOverviewKpis;
  leaderboard: LeaderboardRow[];
  heatmap: ChainFunnelsOverviewHeatmap;
  sourceMix: { leads: SourceMixRow[]; referrals: SourceMixRow[] };
  movers: { up: MoverRow[]; down: MoverRow[] };
  currency: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Zero-protected delta percent: if prev === 0 and current > 0 → 100; both 0 → 0 */
function deltaPct(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Number((((current - prev) / prev) * 100).toFixed(1));
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

// ---------------------------------------------------------------------------
// Empty shapes
// ---------------------------------------------------------------------------

export function emptyKpis(): ChainFunnelsOverviewKpis {
  const zero: KpiMetric = { current: 0, prev: 0, deltaPct: 0 };
  return {
    leads: { ...zero },
    referrals: { ...zero },
    bookings: { ...zero },
    firstVisits: { ...zero },
    paidRevenue: { current: null, prev: null, deltaPct: 0 },
    conversionPct: { ...zero },
  };
}

// ---------------------------------------------------------------------------
// Per-(hospital, source) row shapes from the DB queries
// ---------------------------------------------------------------------------

interface LeadFactRow extends Record<string, unknown> {
  hospital_id: string;
  source: string;
  leads: string;
  bookings: string;
  first_visits: string;
  paid_count: string;
  revenue: string;
}

interface ReferralFactRow extends Record<string, unknown> {
  hospital_id: string;
  source: string;
  referrals: string;
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

async function queryLeadFacts(
  idList: ReturnType<typeof sql.join>,
  startIso: string,
  endIso: string,
): Promise<LeadFactRow[]> {
  const result = await db.execute<LeadFactRow>(sql`
    WITH lead_facts AS (
      SELECT
        l.id,
        l.hospital_id,
        COALESCE(l.source, 'unknown') AS source,
        (l.appointment_id IS NOT NULL) AS is_booking,
        (ca.status IN ('confirmed', 'completed')) AS is_first_visit,
        (
          s.payment_date IS NOT NULL
          OR tr.id IS NOT NULL
        ) AS is_paid,
        COALESCE(
          CASE WHEN s.payment_date IS NOT NULL THEN s.price ELSE 0 END, 0
        ) + COALESCE(
          CASE WHEN tr.id IS NOT NULL THEN tr.total ELSE 0 END, 0
        ) AS revenue
      FROM leads l
      LEFT JOIN clinic_appointments ca ON ca.id = l.appointment_id
      LEFT JOIN LATERAL (
        SELECT s2.id, s2.payment_status, s2.payment_date, s2.price
        FROM surgeries s2
        WHERE s2.patient_id = l.patient_id
          AND s2.hospital_id = l.hospital_id
          AND s2.planned_date >= l.created_at
          AND s2.is_archived = false
          AND COALESCE(s2.is_suspended, false) = false
        ORDER BY s2.planned_date ASC
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT
          t.id,
          (SELECT COALESCE(SUM(tl.total), 0)
           FROM treatment_lines tl
           WHERE tl.treatment_id = t.id) AS total
        FROM treatments t
        WHERE t.hospital_id = l.hospital_id
          AND t.status = 'signed'
          AND (
            t.appointment_id = l.appointment_id
            OR (
              t.appointment_id IS NULL
              AND t.patient_id = l.patient_id
              AND ca.appointment_date IS NOT NULL
              AND (t.performed_at AT TIME ZONE 'UTC')::date = ca.appointment_date
            )
          )
        ORDER BY t.performed_at ASC
        LIMIT 1
      ) tr ON true
      WHERE l.hospital_id IN (${idList})
        AND l.created_at >= ${startIso}
        AND l.created_at < ${endIso}
    )
    SELECT
      hospital_id,
      source,
      COUNT(*)::int AS leads,
      COUNT(*) FILTER (WHERE is_booking)::int AS bookings,
      COUNT(*) FILTER (WHERE is_first_visit)::int AS first_visits,
      COUNT(*) FILTER (WHERE is_paid)::int AS paid_count,
      COALESCE(SUM(revenue), 0)::numeric AS revenue
    FROM lead_facts
    GROUP BY hospital_id, source
  `);
  return result.rows as LeadFactRow[];
}

async function queryReferralFacts(
  idList: ReturnType<typeof sql.join>,
  startIso: string,
  endIso: string,
): Promise<ReferralFactRow[]> {
  const result = await db.execute<ReferralFactRow>(sql`
    SELECT
      hospital_id,
      COALESCE(source, 'unknown') AS source,
      COUNT(*)::int AS referrals
    FROM referral_events
    WHERE hospital_id IN (${idList})
      AND created_at >= ${startIso}
      AND created_at < ${endIso}
    GROUP BY hospital_id, source
  `);
  return result.rows as ReferralFactRow[];
}

// ---------------------------------------------------------------------------
// Main exported function
// ---------------------------------------------------------------------------

export async function getChainFunnelsOverview(
  _groupId: string,
  hospitalIds: string[],
  range: "30d" | "90d" | "365d",
): Promise<ChainFunnelsOverview> {
  const days = parseInt(range.replace("d", ""), 10);
  const now = new Date();

  const endDate = now;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevStartDate = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const prevStartIso = prevStartDate.toISOString();

  const idList = sql.join(hospitalIds.map(id => sql`${id}`), sql`, `);

  // 1. Currency check
  const currencyRows = await db
    .selectDistinct({ currency: hospitals.currency })
    .from(hospitals)
    .where(inArray(hospitals.id, hospitalIds));

  const currencies = currencyRows.map(r => r.currency).filter(Boolean) as string[];
  const currency = currencies.length === 1 ? currencies[0] : null;
  const mixedCurrency = currencies.length > 1;

  // 2. Hospital name lookup for leaderboard
  const hospitalRows = await db
    .select({ id: hospitals.id, name: hospitals.name })
    .from(hospitals)
    .where(inArray(hospitals.id, hospitalIds));
  const hospitalNameById = new Map(hospitalRows.map(h => [h.id, h.name]));

  // 3. Four queries in parallel
  const [leadsCurr, leadsPrev, refCurr, refPrev] = await Promise.all([
    queryLeadFacts(idList, startIso, endIso),
    queryLeadFacts(idList, prevStartIso, startIso),
    queryReferralFacts(idList, startIso, endIso),
    queryReferralFacts(idList, prevStartIso, startIso),
  ]);

  // ---------------------------------------------------------------------------
  // 4. Build KPIs
  // ---------------------------------------------------------------------------

  let totalLeadsCurr = 0, totalLeadsPrev = 0;
  let totalBookingsCurr = 0, totalBookingsPrev = 0;
  let totalFirstVisitsCurr = 0, totalFirstVisitsPrev = 0;
  let totalPaidCurr = 0, totalPaidPrev = 0;
  let totalRevenueCurr = 0, totalRevenuePrev = 0;

  for (const r of leadsCurr) {
    totalLeadsCurr += Number(r.leads);
    totalBookingsCurr += Number(r.bookings);
    totalFirstVisitsCurr += Number(r.first_visits);
    totalPaidCurr += Number(r.paid_count);
    totalRevenueCurr += Number(r.revenue);
  }
  for (const r of leadsPrev) {
    totalLeadsPrev += Number(r.leads);
    totalBookingsPrev += Number(r.bookings);
    totalFirstVisitsPrev += Number(r.first_visits);
    totalPaidPrev += Number(r.paid_count);
    totalRevenuePrev += Number(r.revenue);
  }

  let totalRefCurr = 0, totalRefPrev = 0;
  for (const r of refCurr) totalRefCurr += Number(r.referrals);
  for (const r of refPrev) totalRefPrev += Number(r.referrals);

  const convCurr = pct(totalFirstVisitsCurr, totalLeadsCurr);
  const convPrev = pct(totalFirstVisitsPrev, totalLeadsPrev);

  const kpis: ChainFunnelsOverviewKpis = {
    leads: { current: totalLeadsCurr, prev: totalLeadsPrev, deltaPct: deltaPct(totalLeadsCurr, totalLeadsPrev) },
    referrals: { current: totalRefCurr, prev: totalRefPrev, deltaPct: deltaPct(totalRefCurr, totalRefPrev) },
    bookings: { current: totalBookingsCurr, prev: totalBookingsPrev, deltaPct: deltaPct(totalBookingsCurr, totalBookingsPrev) },
    firstVisits: { current: totalFirstVisitsCurr, prev: totalFirstVisitsPrev, deltaPct: deltaPct(totalFirstVisitsCurr, totalFirstVisitsPrev) },
    paidRevenue: mixedCurrency
      ? { current: null, prev: null, deltaPct: 0 }
      : { current: totalRevenueCurr, prev: totalRevenuePrev, deltaPct: deltaPct(totalRevenueCurr, totalRevenuePrev) },
    conversionPct: { current: convCurr, prev: convPrev, deltaPct: deltaPct(convCurr, convPrev) },
  };

  // ---------------------------------------------------------------------------
  // 5. Aggregate per-hospital from current-period leads & referrals
  // ---------------------------------------------------------------------------

  // Map: hospitalId → aggregated metrics
  interface HospAgg {
    leads: number;
    bookings: number;
    firstVisits: number;
    paidCount: number;
    revenue: number;
    referrals: number;
  }
  const hospAggCurr = new Map<string, HospAgg>();
  const hospAggPrev = new Map<string, HospAgg>();
  const hospRefCurr = new Map<string, number>();

  function getOrInitHosp(map: Map<string, HospAgg>, id: string): HospAgg {
    if (!map.has(id)) map.set(id, { leads: 0, bookings: 0, firstVisits: 0, paidCount: 0, revenue: 0, referrals: 0 });
    return map.get(id)!;
  }

  for (const r of leadsCurr) {
    const a = getOrInitHosp(hospAggCurr, r.hospital_id);
    a.leads += Number(r.leads);
    a.bookings += Number(r.bookings);
    a.firstVisits += Number(r.first_visits);
    a.paidCount += Number(r.paid_count);
    a.revenue += Number(r.revenue);
  }
  for (const r of leadsPrev) {
    const a = getOrInitHosp(hospAggPrev, r.hospital_id);
    a.leads += Number(r.leads);
  }
  for (const r of refCurr) {
    hospRefCurr.set(r.hospital_id, (hospRefCurr.get(r.hospital_id) ?? 0) + Number(r.referrals));
  }

  // Populate referrals into hospAggCurr
  for (const [hid, count] of hospRefCurr) {
    getOrInitHosp(hospAggCurr, hid).referrals = count;
  }

  // ---------------------------------------------------------------------------
  // 6. Leaderboard
  // ---------------------------------------------------------------------------

  const leaderboard: LeaderboardRow[] = hospitalIds.map(hid => {
    const agg = hospAggCurr.get(hid) ?? { leads: 0, bookings: 0, firstVisits: 0, paidCount: 0, revenue: 0, referrals: 0 };
    const prevLeads = hospAggPrev.get(hid)?.leads ?? 0;
    return {
      hospitalId: hid,
      hospitalName: hospitalNameById.get(hid) ?? "Unknown",
      leads: agg.leads,
      referrals: agg.referrals,
      bookingPct: pct(agg.bookings, agg.leads),
      firstVisitPct: pct(agg.firstVisits, agg.leads),
      paidPct: pct(agg.paidCount, agg.leads),
      revenue: agg.revenue,
      deltaLeadsPct: deltaPct(agg.leads, prevLeads),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ---------------------------------------------------------------------------
  // 7. Heatmap
  // ---------------------------------------------------------------------------

  // Map: hospitalId → source → {lead metrics + referrals}
  interface CellAgg {
    leads: number;
    bookings: number;
    firstVisits: number;
    paidCount: number;
    referrals: number;
  }
  // key: `${hospitalId}::${source}`
  const cellMap = new Map<string, CellAgg>();

  function getOrInitCell(hospitalId: string, source: string): CellAgg {
    const key = `${hospitalId}::${source}`;
    if (!cellMap.has(key)) cellMap.set(key, { leads: 0, bookings: 0, firstVisits: 0, paidCount: 0, referrals: 0 });
    return cellMap.get(key)!;
  }

  for (const r of leadsCurr) {
    const c = getOrInitCell(r.hospital_id, r.source);
    c.leads += Number(r.leads);
    c.bookings += Number(r.bookings);
    c.firstVisits += Number(r.first_visits);
    c.paidCount += Number(r.paid_count);
  }
  for (const r of refCurr) {
    const c = getOrInitCell(r.hospital_id, r.source);
    c.referrals += Number(r.referrals);
  }

  const sourceSet = new Set<string>();
  for (const key of cellMap.keys()) {
    const source = key.split("::").slice(1).join("::");
    sourceSet.add(source);
  }

  const cells: HeatmapCell[] = [];
  for (const [key, c] of cellMap) {
    const colonIdx = key.indexOf("::");
    const hid = key.slice(0, colonIdx);
    const source = key.slice(colonIdx + 2);
    cells.push({
      source,
      hospitalId: hid,
      leads: c.leads,
      referrals: c.referrals,
      bookingPct: pct(c.bookings, c.leads),
      firstVisitPct: pct(c.firstVisits, c.leads),
      paidPct: pct(c.paidCount, c.leads),
    });
  }

  const heatmap: ChainFunnelsOverviewHeatmap = {
    sources: Array.from(sourceSet).sort(),
    locations: hospitalIds.map(hid => ({ hospitalId: hid, hospitalName: hospitalNameById.get(hid) ?? "Unknown" })),
    cells,
  };

  // ---------------------------------------------------------------------------
  // 8. SourceMix
  // ---------------------------------------------------------------------------

  // Aggregate leads by source across all hospitals
  const leadsBySource = new Map<string, number>();
  for (const r of leadsCurr) {
    leadsBySource.set(r.source, (leadsBySource.get(r.source) ?? 0) + Number(r.leads));
  }
  const refBySource = new Map<string, number>();
  for (const r of refCurr) {
    refBySource.set(r.source, (refBySource.get(r.source) ?? 0) + Number(r.referrals));
  }

  function buildSourceMix(bySource: Map<string, number>): SourceMixRow[] {
    const total = Array.from(bySource.values()).reduce((s, v) => s + v, 0);
    return Array.from(bySource.entries())
      .map(([source, count]) => ({ source, count, pct: pct(count, total) }))
      .sort((a, b) => b.count - a.count);
  }

  const sourceMix = {
    leads: buildSourceMix(leadsBySource),
    referrals: buildSourceMix(refBySource),
  };

  // ---------------------------------------------------------------------------
  // 9. Movers (per source × hospital, leads counts)
  // ---------------------------------------------------------------------------

  // Build map from prev period: `hospitalId::source` → leads count
  const prevLeadsByCell = new Map<string, number>();
  for (const r of leadsPrev) {
    const key = `${r.hospital_id}::${r.source}`;
    prevLeadsByCell.set(key, (prevLeadsByCell.get(key) ?? 0) + Number(r.leads));
  }

  const moversRaw: MoverRow[] = [];
  for (const r of leadsCurr) {
    const key = `${r.hospital_id}::${r.source}`;
    const current = Number(r.leads);
    const prev = prevLeadsByCell.get(key) ?? 0;
    const dp = deltaPct(current, prev);
    if (Math.abs(dp) >= 20) {
      moversRaw.push({
        source: r.source,
        hospitalId: r.hospital_id,
        hospitalName: hospitalNameById.get(r.hospital_id) ?? "Unknown",
        current,
        prev,
        deltaPct: dp,
      });
    }
  }

  const moversUp = moversRaw
    .filter(m => m.deltaPct >= 20)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 5);

  const moversDown = moversRaw
    .filter(m => m.deltaPct <= -20)
    .sort((a, b) => a.deltaPct - b.deltaPct)
    .slice(0, 5);

  return {
    kpis,
    leaderboard,
    heatmap,
    sourceMix,
    movers: { up: moversUp, down: moversDown },
    currency,
  };
}
