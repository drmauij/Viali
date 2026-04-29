import { db } from "../../db";
import { sql } from "drizzle-orm";

export interface MoneySummary {
  revenue: { surgery: number; treatment: number; total: number };
  cost:    { staff: number; materials: number; total: number };
  margin:  { value: number; percent: number; deltaPp_vs_prev: number };
  byDay:   Array<{ date: string; revenue: number; staffCost: number; materialsCost: number }>;
}

function rangeToDays(range: string): number {
  return parseInt(range.replace("d", ""), 10) || 30;
}

interface SurgeryAgg {
  revenue: number;
  staffCost: number;
  materialsCost: number;
  byDay: Map<string, { revenue: number; staffCost: number; materialsCost: number }>;
}

async function aggregateSurgeries(hospitalId: string, startIso: string, endIso?: string): Promise<SurgeryAgg> {
  const upperBound = endIso ? sql`AND s.payment_date < ${endIso}::date` : sql``;
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
      ${upperBound}
  `);

  const agg: SurgeryAgg = { revenue: 0, staffCost: 0, materialsCost: 0, byDay: new Map() };
  for (const r of rows.rows as any[]) {
    const date = typeof r.payment_date === "string"
      ? r.payment_date.slice(0, 10)
      : new Date(r.payment_date).toISOString().slice(0, 10);
    const revenue = parseFloat(r.price ?? "0");
    const staffCost = parseFloat(r.staff_cost ?? "0");
    const materialsCost = parseFloat(r.materials_cost ?? "0");
    agg.revenue += revenue;
    agg.staffCost += staffCost;
    agg.materialsCost += materialsCost;
    const cur = agg.byDay.get(date) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    cur.revenue += revenue;
    cur.staffCost += staffCost;
    cur.materialsCost += materialsCost;
    agg.byDay.set(date, cur);
  }
  return agg;
}

interface TreatmentAgg {
  revenue: number;
  staffCost: number;
  materialsCost: number;
  byDay: Map<string, { revenue: number; staffCost: number; materialsCost: number }>;
}

async function aggregateTreatments(hospitalId: string, startIso: string, endIso?: string): Promise<TreatmentAgg> {
  // Per spec:
  //   - Cost is attributed only when revenue is counted (status IN signed/invoiced).
  //   - Staff cost: users.hourly_rate × duration_minutes/60.
  //     Duration: clinic_appointments.duration_minutes when appointment_id is set,
  //     fallback 30 min flat otherwise.
  //   - Materials cost: SUM over treatment_lines with item_id set of
  //     total × (preferred_supplier_basispreis / item.patient_price), when both are positive.
  //     Items missing either price contribute 0 cost.
  const upperBound = endIso ? sql`AND t.performed_at < ${endIso}` : sql``;
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
        ${upperBound}
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

  const agg: TreatmentAgg = { revenue: 0, staffCost: 0, materialsCost: 0, byDay: new Map() };
  for (const r of rows.rows as any[]) {
    const date = new Date(r.performed_at).toISOString().slice(0, 10);
    const revenue = parseFloat(r.treatment_revenue ?? "0");
    const staffCost = parseFloat(r.staff_cost ?? "0");
    const materialsCost = parseFloat(r.materials_cost ?? "0");
    agg.revenue += revenue;
    agg.staffCost += staffCost;
    agg.materialsCost += materialsCost;
    const cur = agg.byDay.get(date) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    cur.revenue += revenue;
    cur.staffCost += staffCost;
    cur.materialsCost += materialsCost;
    agg.byDay.set(date, cur);
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

export async function computePriorMarginPercent(
  hospitalId: string,
  range: string,
): Promise<number> {
  const days = rangeToDays(range);
  const priorEnd = new Date();
  priorEnd.setDate(priorEnd.getDate() - days);
  const priorStart = new Date(priorEnd);
  priorStart.setDate(priorStart.getDate() - days);
  const { revenue, cost } = await aggregateForWindow(
    hospitalId,
    priorStart.toISOString(),
    priorEnd.toISOString(),
  );
  if (revenue <= 0) return 0;
  return (revenue - cost) / revenue;
}

export async function computeMoneySummary(hospitalId: string, range: string): Promise<MoneySummary> {
  const days = rangeToDays(range);
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();

  const [surgery, treatment, priorMarginPercent] = await Promise.all([
    aggregateSurgeries(hospitalId, startIso),
    aggregateTreatments(hospitalId, startIso),
    computePriorMarginPercent(hospitalId, range),
  ]);

  const totalRevenue = surgery.revenue + treatment.revenue;
  const totalStaff = surgery.staffCost + treatment.staffCost;
  const totalMaterials = surgery.materialsCost + treatment.materialsCost;
  const totalCost = totalStaff + totalMaterials;
  const marginValue = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? marginValue / totalRevenue : 0;
  const deltaPp_vs_prev = (marginPercent - priorMarginPercent) * 100;

  // Merge surgery + treatment byDay maps.
  const merged = new Map<string, { revenue: number; staffCost: number; materialsCost: number }>();
  for (const [date, v] of surgery.byDay) merged.set(date, { ...v });
  for (const [date, v] of treatment.byDay) {
    const cur = merged.get(date) ?? { revenue: 0, staffCost: 0, materialsCost: 0 };
    merged.set(date, {
      revenue: cur.revenue + v.revenue,
      staffCost: cur.staffCost + v.staffCost,
      materialsCost: cur.materialsCost + v.materialsCost,
    });
  }

  const byDay = Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  return {
    revenue: { surgery: surgery.revenue, treatment: treatment.revenue, total: totalRevenue },
    cost:    { staff: totalStaff, materials: totalMaterials, total: totalCost },
    margin:  { value: marginValue, percent: marginPercent, deltaPp_vs_prev },
    byDay,
  };
}
