import { sql } from "drizzle-orm";
import { db } from "../db";

export interface ConversionBySourceRow {
  source: string;
  total: number;
  converted: number;
  rate: number;
}

export interface BySourceRow {
  source: string;
  count: number;
}

export interface TimeseriesRow {
  month: string;
  count: number;
}

export interface LeadsStats {
  total: number;
  bySource: BySourceRow[];
  conversionOverall: number;
  conversionBySource: ConversionBySourceRow[];
  avgDaysToConversion: number | null;
  timeseries: TimeseriesRow[];
}

export interface GetLeadsStatsOpts {
  from?: string;
  to?: string;
  timezone?: string;
}

export async function getLeadsStats(
  hospitalIdOrIds: string | string[],
  opts: GetLeadsStatsOpts = {},
): Promise<LeadsStats> {
  const fromParam: string | null = opts.from ?? null;
  const toParam: string = opts.to ?? new Date().toISOString();
  const tz: string = opts.timezone ?? "UTC";

  // Task 13: Funnels scope toggle — every query widens to the full group when
  // an array is passed, falls back to `= $1` for the single-hospital path.
  // We build a per-id fragment via `sql.join` rather than `= ANY($1::text[])`
  // because drizzle's `pg` driver binds JS arrays in a way that Postgres'
  // array parser rejects with `22P02` ("Array value must start with {").
  // Using `IN (value, value, ...)` keeps the SQL portable without touching
  // the driver-level array coercion.
  const ids = Array.isArray(hospitalIdOrIds) ? hospitalIdOrIds : [hospitalIdOrIds];
  if (ids.length === 0) {
    throw new Error("getLeadsStats: at least one hospitalId is required");
  }
  const hospitalIdFrag = (col: "hospital_id" | "l.hospital_id") => {
    const column = sql.raw(col);
    if (ids.length === 1) return sql`${column} = ${ids[0]}`;
    const list = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    return sql`${column} IN (${list})`;
  };

  const { rows: totals } = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'converted' OR appointment_id IS NOT NULL
      )::int AS converted
    FROM leads
    WHERE ${hospitalIdFrag("hospital_id")}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
  `);

  const { rows: bySource } = await db.execute(sql`
    SELECT source, COUNT(*)::int AS count
    FROM leads
    WHERE ${hospitalIdFrag("hospital_id")}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY source
    ORDER BY count DESC
  `);

  const { rows: convBySource } = await db.execute(sql`
    SELECT
      source,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (
        WHERE status = 'converted' OR appointment_id IS NOT NULL
      )::int AS converted
    FROM leads
    WHERE ${hospitalIdFrag("hospital_id")}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY source
    ORDER BY total DESC
  `);

  const { rows: avg } = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (ca.created_at - l.created_at)) / 86400.0)::float8 AS avg_days
    FROM leads l
    JOIN clinic_appointments ca ON ca.id = l.appointment_id
    WHERE ${hospitalIdFrag("l.hospital_id")}
      AND ca.created_at IS NOT NULL
      AND (${fromParam}::timestamptz IS NULL OR l.created_at >= ${fromParam}::timestamptz)
      AND l.created_at <= ${toParam}::timestamptz
  `);

  const { rows: timeseries } = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', created_at AT TIME ZONE ${tz}), 'YYYY-MM') AS month,
      COUNT(*)::int AS count
    FROM leads
    WHERE ${hospitalIdFrag("hospital_id")}
      AND (${fromParam}::timestamptz IS NULL OR created_at >= ${fromParam}::timestamptz)
      AND created_at <= ${toParam}::timestamptz
    GROUP BY month
    ORDER BY month
  `);

  const totalCount = Number(totals[0]?.total ?? 0);
  const convertedAll = Number(totals[0]?.converted ?? 0);

  return {
    total: totalCount,
    bySource: bySource.map((r: any) => ({ source: String(r.source), count: Number(r.count) })),
    conversionOverall: totalCount > 0 ? convertedAll / totalCount : 0,
    conversionBySource: convBySource.map((r: any) => {
      const t = Number(r.total);
      const c = Number(r.converted);
      return {
        source: String(r.source),
        total: t,
        converted: c,
        rate: t > 0 ? c / t : 0,
      };
    }),
    avgDaysToConversion: avg[0]?.avg_days == null ? null : Number(avg[0].avg_days),
    timeseries: timeseries.map((r: any) => ({ month: String(r.month), count: Number(r.count) })),
  };
}
