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

async function aggregateSurgeries(hospitalId: string, startIso: string): Promise<SurgeryAgg> {
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

export async function computeMoneySummary(hospitalId: string, range: string): Promise<MoneySummary> {
  const days = rangeToDays(range);
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();

  const surgery = await aggregateSurgeries(hospitalId, startIso);

  // Treatment side wired in Task 2.
  const treatmentRevenue = 0;
  const treatmentStaffCost = 0;
  const treatmentMaterialsCost = 0;

  const totalRevenue = surgery.revenue + treatmentRevenue;
  const totalStaff = surgery.staffCost + treatmentStaffCost;
  const totalMaterials = surgery.materialsCost + treatmentMaterialsCost;
  const totalCost = totalStaff + totalMaterials;
  const marginValue = totalRevenue - totalCost;
  const marginPercent = totalRevenue > 0 ? marginValue / totalRevenue : 0;

  const byDay = Array.from(surgery.byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, staffCost: v.staffCost, materialsCost: v.materialsCost }));

  return {
    revenue: { surgery: surgery.revenue, treatment: treatmentRevenue, total: totalRevenue },
    cost:    { staff: totalStaff, materials: totalMaterials, total: totalCost },
    margin:  { value: marginValue, percent: marginPercent, deltaPp_vs_prev: 0 }, // wired in Task 3
    byDay,
  };
}
