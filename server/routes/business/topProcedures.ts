import { db } from "../../db";
import { sql } from "drizzle-orm";

export interface TopProcedureRow {
  procedure: string;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

export async function computeTopProceduresByMargin(
  hospitalId: string,
  range: string,
  limit: number,
): Promise<TopProcedureRow[]> {
  const days = parseInt(range.replace("d", ""), 10) || 30;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();

  const rows = await db.execute<{
    procedure: string;
    count: string;
    revenue: string;
    staff_cost: string;
    materials_cost: string;
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
    ),
    base_rows AS (
      SELECT
        LOWER(TRIM(s.planned_surgery)) AS procedure_key,
        s.planned_surgery,
        COALESCE(CAST(s.price AS numeric), 0) AS revenue,
        COALESCE(staff.staff_cost, 0) AS staff_cost,
        COALESCE(materials.materials_cost, 0) AS materials_cost
      FROM surgeries s
      LEFT JOIN staff ON staff.surgery_id = s.id
      LEFT JOIN materials ON materials.surgery_id = s.id
      WHERE s.hospital_id = ${hospitalId}
        AND s.is_archived = false
        AND s.payment_date IS NOT NULL
        AND s.payment_date >= ${startIso}::date
        AND s.planned_surgery IS NOT NULL
        AND TRIM(s.planned_surgery) <> ''
    ),
    chosen_label AS (
      SELECT
        procedure_key,
        MODE() WITHIN GROUP (ORDER BY planned_surgery) AS procedure
      FROM base_rows
      GROUP BY procedure_key
    )
    SELECT
      cl.procedure,
      COUNT(*)::text AS count,
      SUM(br.revenue)::text AS revenue,
      SUM(br.staff_cost + br.materials_cost)::text AS staff_cost,
      '0'::text AS materials_cost
    FROM base_rows br
    JOIN chosen_label cl ON cl.procedure_key = br.procedure_key
    GROUP BY br.procedure_key, cl.procedure
    ORDER BY (SUM(br.revenue) - SUM(br.staff_cost + br.materials_cost)) DESC
    LIMIT ${limit}
  `);

  return (rows.rows as any[]).map((r) => {
    const revenue = parseFloat(r.revenue ?? "0");
    const cost = parseFloat(r.staff_cost ?? "0");
    const margin = revenue - cost;
    const marginPercent = revenue > 0 ? margin / revenue : 0;
    return {
      procedure: r.procedure as string,
      count: parseInt(r.count ?? "0", 10),
      revenue,
      cost,
      margin,
      marginPercent,
    };
  });
}
