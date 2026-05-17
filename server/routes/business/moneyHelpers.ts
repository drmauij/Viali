import { db } from "../../db";
import { sql } from "drizzle-orm";
import { resolveRange } from "./rangeUtils";

export interface MoneyMonthlyPoint {
  month: string;          // YYYY-MM
  revenue: number;
  revenueSurgery: number; // mix component — surgery revenue only
  revenueTreatment: number; // mix component — treatment revenue only
  staffCost: number;
  materialsCost: number;
  cost: number;           // staffCost + materialsCost
  margin: number;         // revenue - cost
}

// Prior-year overlay points are keyed by month-of-year ("01" .. "12") so the
// chart can overlay them on the current year's months regardless of the prior
// year's actual months present.
export interface MoneyPriorPoint {
  monthOfYear: string;    // 01..12
  monthLabel: string;     // YYYY-MM of the prior data point (for tooltip)
  revenue: number;
  cost: number;
  margin: number;
}

export interface MoneySummary {
  revenue: { surgery: number; treatment: number; total: number };
  cost:    { staff: number; materials: number; total: number };
  margin:  { value: number; percent: number; deltaPp_vs_prev: number };
  byMonth: MoneyMonthlyPoint[];
  byMonthPrev?: MoneyPriorPoint[];   // Only populated when range is a year — used for YoY overlay
}

interface SurgeryAgg {
  revenue: number;
  staffCost: number;
  materialsCost: number;
  byMonth: Map<string, { revenue: number; staffCost: number; materialsCost: number }>;
}

function monthKey(dateLike: string | Date): string {
  if (typeof dateLike === "string") return dateLike.slice(0, 7);
  return dateLike.toISOString().slice(0, 7);
}

async function aggregateSurgeries(hospitalId: string, startIso: string, endIso: string): Promise<SurgeryAgg> {
  const rows = await db.execute<{
    payment_date: string;
    price: string | null;
    staff_cost: string | null;
    materials_cost: string | null;
  }>(sql`
    WITH staff AS (
      SELECT
        ar.surgery_id,
        SUM(
          GREATEST(
            (
              COALESCE(
                (SELECT (m->>'time')::bigint FROM jsonb_array_elements(ar.time_markers) m WHERE m->>'code' = 'A2' LIMIT 1),
                0
              )
              -
              COALESCE(
                (SELECT (m->>'time')::bigint FROM jsonb_array_elements(ar.time_markers) m WHERE m->>'code' = 'X1' LIMIT 1),
                0
              )
            )::numeric / 1000.0,
            3600.0
          ) / 3600.0
          * COALESCE(CAST(u.hourly_rate AS numeric), 0)
        ) AS staff_cost
      FROM anesthesia_records ar
      JOIN surgery_staff_entries sse ON sse.anesthesia_record_id = ar.id
      JOIN users u ON u.id = sse.user_id
      GROUP BY ar.surgery_id
    ),
    materials AS (
      SELECT
        ar.surgery_id,
        SUM(
          (commit_item->>'quantity')::numeric
          * COALESCE((
            SELECT CAST(sc.basispreis AS numeric)
            FROM supplier_codes sc
            WHERE sc.item_id = (commit_item->>'itemId')
            ORDER BY sc.is_preferred DESC, sc.basispreis ASC NULLS LAST
            LIMIT 1
          ), 0)
          / GREATEST(COALESCE(i.pack_size, 1), 1)
        ) AS materials_cost
      FROM anesthesia_records ar
      JOIN inventory_commits ic ON ic.anesthesia_record_id = ar.id AND ic.rolled_back_at IS NULL
      CROSS JOIN LATERAL jsonb_array_elements(ic.items) AS commit_item
      JOIN items i ON i.id = (commit_item->>'itemId')
      GROUP BY ar.surgery_id
    )
    SELECT
      s.payment_date,
      s.price,
      COALESCE(staff.staff_cost, 0) AS staff_cost,
      COALESCE(materials.materials_cost, 0) AS materials_cost
    FROM surgeries s
    LEFT JOIN staff ON staff.surgery_id = s.id
    LEFT JOIN materials ON materials.surgery_id = s.id
    WHERE s.hospital_id = ${hospitalId}
      AND s.is_archived = false
      AND s.payment_date IS NOT NULL
      AND s.payment_date >= ${startIso}::date
      AND s.payment_date < ${endIso}::date
  `);

  const agg: SurgeryAgg = { revenue: 0, staffCost: 0, materialsCost: 0, byMonth: new Map() };
  for (const r of rows.rows as any[]) {
    const monthBucket = monthKey(r.payment_date);
    const revenue = parseFloat(r.price ?? "0");
    const staffCost = parseFloat(r.staff_cost ?? "0");
    const materialsCost = parseFloat(r.materials_cost ?? "0");
    agg.revenue += revenue;
    agg.staffCost += staffCost;
    agg.materialsCost += materialsCost;
    const cur = agg.byMonth.get(monthBucket) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    cur.revenue += revenue;
    cur.staffCost += staffCost;
    cur.materialsCost += materialsCost;
    agg.byMonth.set(monthBucket, cur);
  }
  return agg;
}

interface TreatmentAgg {
  revenue: number;
  staffCost: number;
  materialsCost: number;
  byMonth: Map<string, { revenue: number; staffCost: number; materialsCost: number }>;
}

async function aggregateTreatments(hospitalId: string, startIso: string, endIso: string): Promise<TreatmentAgg> {
  const rows = await db.execute<{
    performed_at: string;
    treatment_revenue: string;
    staff_cost: string;
    materials_cost: string;
  }>(sql`
    WITH t_revenue AS (
      SELECT
        t.id,
        t.performed_at,
        t.provider_id,
        t.appointment_id,
        COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS revenue
      FROM treatments t
      LEFT JOIN treatment_lines tl ON tl.treatment_id = t.id
      WHERE t.hospital_id = ${hospitalId}
        AND t.status IN ('signed', 'invoiced')
        AND t.performed_at >= ${startIso}
        AND t.performed_at < ${endIso}
      GROUP BY t.id
    ),
    t_materials AS (
      SELECT
        tl.treatment_id,
        COALESCE(SUM(
          CASE
            WHEN i.patient_price IS NOT NULL
              AND CAST(i.patient_price AS numeric) > 0
              AND COALESCE((
                SELECT CAST(sc.basispreis AS numeric)
                FROM supplier_codes sc
                WHERE sc.item_id = tl.item_id
                ORDER BY sc.is_preferred DESC, sc.basispreis ASC NULLS LAST
                LIMIT 1
              ), 0) > 0
            THEN
              CAST(tl.total AS numeric)
              * (
                COALESCE((
                  SELECT CAST(sc.basispreis AS numeric)
                  FROM supplier_codes sc
                  WHERE sc.item_id = tl.item_id
                  ORDER BY sc.is_preferred DESC, sc.basispreis ASC NULLS LAST
                  LIMIT 1
                ), 0)
                / CAST(i.patient_price AS numeric)
              )
            ELSE 0
          END
        ), 0) AS materials_cost
      FROM treatment_lines tl
      JOIN items i ON i.id = tl.item_id
      WHERE tl.item_id IS NOT NULL
      GROUP BY tl.treatment_id
    )
    SELECT
      tr.performed_at,
      tr.revenue AS treatment_revenue,
      (
        COALESCE(CAST(u.hourly_rate AS numeric), 0)
        * (COALESCE(ca.duration_minutes, 30) / 60.0)
      ) AS staff_cost,
      COALESCE(tm.materials_cost, 0) AS materials_cost
    FROM t_revenue tr
    LEFT JOIN users u ON u.id = tr.provider_id
    LEFT JOIN clinic_appointments ca ON ca.id = tr.appointment_id
    LEFT JOIN t_materials tm ON tm.treatment_id = tr.id
  `);

  const agg: TreatmentAgg = { revenue: 0, staffCost: 0, materialsCost: 0, byMonth: new Map() };
  for (const r of rows.rows as any[]) {
    const monthBucket = monthKey(new Date(r.performed_at));
    const revenue = parseFloat(r.treatment_revenue ?? "0");
    const staffCost = parseFloat(r.staff_cost ?? "0");
    const materialsCost = parseFloat(r.materials_cost ?? "0");
    agg.revenue += revenue;
    agg.staffCost += staffCost;
    agg.materialsCost += materialsCost;
    const cur = agg.byMonth.get(monthBucket) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    cur.revenue += revenue;
    cur.staffCost += staffCost;
    cur.materialsCost += materialsCost;
    agg.byMonth.set(monthBucket, cur);
  }
  return agg;
}

async function aggregateForWindow(
  hospitalId: string,
  startIso: string,
  endIso: string,
): Promise<{ revenue: number; cost: number }> {
  const s = await aggregateSurgeries(hospitalId, startIso, endIso);
  const t = await aggregateTreatments(hospitalId, startIso, endIso);
  return {
    revenue: s.revenue + t.revenue,
    cost: s.staffCost + s.materialsCost + t.staffCost + t.materialsCost,
  };
}

// Prior-period margin %. For year mode, this is the previous calendar year.
// For legacy "Nd" mode, it's the N days immediately before the current window.
// For "all" there is no meaningful prior — returns 0.
export async function computePriorMarginPercent(
  hospitalId: string,
  range: string,
): Promise<number> {
  const bounds = resolveRange(range);
  if (!bounds.priorStartIso || !bounds.priorEndIso) return 0;
  const { revenue, cost } = await aggregateForWindow(
    hospitalId,
    bounds.priorStartIso,
    bounds.priorEndIso,
  );
  if (revenue <= 0) return 0;
  return (revenue - cost) / revenue;
}

async function buildPriorYearOverlay(hospitalId: string, year: number): Promise<MoneyPriorPoint[]> {
  const startIso = new Date(Date.UTC(year - 1, 0, 1)).toISOString();
  const endIso = new Date(Date.UTC(year, 0, 1)).toISOString();
  const [surgery, treatment] = await Promise.all([
    aggregateSurgeries(hospitalId, startIso, endIso),
    aggregateTreatments(hospitalId, startIso, endIso),
  ]);
  const merged = new Map<string, { revenue: number; staffCost: number; materialsCost: number }>();
  for (const [m, v] of surgery.byMonth) merged.set(m, { ...v });
  for (const [m, v] of treatment.byMonth) {
    const cur = merged.get(m) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    merged.set(m, {
      revenue: cur.revenue + v.revenue,
      staffCost: cur.staffCost + v.staffCost,
      materialsCost: cur.materialsCost + v.materialsCost,
    });
  }
  return Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthLabel, v]) => {
      const cost = v.staffCost + v.materialsCost;
      return {
        monthOfYear: monthLabel.slice(5, 7),
        monthLabel,
        revenue: v.revenue,
        cost,
        margin: v.revenue - cost,
      };
    });
}

export async function computeMoneySummary(hospitalId: string, range: string): Promise<MoneySummary> {
  const bounds = resolveRange(range);

  const [surgery, treatment, priorMarginPercent, byMonthPrev] = await Promise.all([
    aggregateSurgeries(hospitalId, bounds.startIso, bounds.endIso),
    aggregateTreatments(hospitalId, bounds.startIso, bounds.endIso),
    computePriorMarginPercent(hospitalId, range),
    bounds.isYear && bounds.year ? buildPriorYearOverlay(hospitalId, bounds.year) : Promise.resolve(undefined),
  ]);

  const totalRevenue = surgery.revenue + treatment.revenue;
  const totalStaff = surgery.staffCost + treatment.staffCost;
  const totalMaterials = surgery.materialsCost + treatment.materialsCost;
  const totalCost = totalStaff + totalMaterials;
  const marginValue = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? marginValue / totalRevenue : 0;
  const deltaPp_vs_prev = bounds.isAll ? 0 : (marginPercent - priorMarginPercent) * 100;

  // Merge surgery + treatment byMonth maps, preserving the mix split so the
  // revenue-mix card can render surgery vs treatment without another query.
  const merged = new Map<string, { revenue: number; revenueSurgery: number; revenueTreatment: number; staffCost: number; materialsCost: number }>();
  for (const [m, v] of surgery.byMonth) {
    merged.set(m, {
      revenue: v.revenue,
      revenueSurgery: v.revenue,
      revenueTreatment: 0,
      staffCost: v.staffCost,
      materialsCost: v.materialsCost,
    });
  }
  for (const [m, v] of treatment.byMonth) {
    const cur = merged.get(m) ?? { revenue: 0, revenueSurgery: 0, revenueTreatment: 0, staffCost: 0, materialsCost: 0 };
    merged.set(m, {
      revenue: cur.revenue + v.revenue,
      revenueSurgery: cur.revenueSurgery,
      revenueTreatment: cur.revenueTreatment + v.revenue,
      staffCost: cur.staffCost + v.staffCost,
      materialsCost: cur.materialsCost + v.materialsCost,
    });
  }

  const byMonth: MoneyMonthlyPoint[] = Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => {
      const cost = v.staffCost + v.materialsCost;
      return {
        month,
        revenue: v.revenue,
        revenueSurgery: v.revenueSurgery,
        revenueTreatment: v.revenueTreatment,
        staffCost: v.staffCost,
        materialsCost: v.materialsCost,
        cost,
        margin: v.revenue - cost,
      };
    });

  return {
    revenue: { surgery: surgery.revenue, treatment: treatment.revenue, total: totalRevenue },
    cost:    { staff: totalStaff, materials: totalMaterials, total: totalCost },
    margin:  { value: marginValue, percent: marginPercent, deltaPp_vs_prev },
    byMonth,
    byMonthPrev,
  };
}
