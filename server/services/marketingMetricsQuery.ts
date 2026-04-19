import { sql } from "drizzle-orm";
import { db } from "../db";

export interface FlowSummaryRow {
  flowId: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  bookings: number;
  revenue: number;
}

export async function summarizeFlows(
  hospitalId: string,
  since: Date,
): Promise<FlowSummaryRow[]> {
  const eventCountsResult = await db.execute(sql`
    SELECT
      fe.flow_id AS "flowId",
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')      AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered') AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked') AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')   AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained') AS complained
    FROM flow_executions fe
    JOIN flow_events ev ON ev.execution_id = fe.id
    JOIN flows f ON f.id = fe.flow_id
    WHERE f.hospital_id = ${hospitalId}
      AND fe.started_at >= ${since.toISOString()}
    GROUP BY fe.flow_id
  `);

  const eventRows: any[] = (eventCountsResult as any).rows ?? [];

  const bookingCountsResult = await db.execute(sql`
    SELECT
      re.utm_content AS "flowId",
      COUNT(*) FILTER (WHERE re.appointment_id IS NOT NULL) AS bookings
    FROM referral_events re
    WHERE re.hospital_id = ${hospitalId}
      AND re.utm_content IS NOT NULL
      AND re.created_at >= ${since.toISOString()}
    GROUP BY re.utm_content
  `);

  const bookingRows: any[] = (bookingCountsResult as any).rows ?? [];
  const bookingsByFlow: Record<string, number> = {};
  for (const r of bookingRows) {
    bookingsByFlow[r.flowId] = Number(r.bookings) || 0;
  }

  const revenueResult = await db.execute(sql`
    SELECT
      re.utm_content AS "flowId",
      COALESCE(SUM(cs.price), 0) AS revenue
    FROM referral_events re
    JOIN clinic_appointments ca ON ca.id = re.appointment_id
    LEFT JOIN clinic_services cs ON cs.id = ca.service_id
    WHERE re.hospital_id = ${hospitalId}
      AND re.utm_content IS NOT NULL
      AND re.created_at >= ${since.toISOString()}
      AND ca.status NOT IN ('cancelled', 'no_show')
    GROUP BY re.utm_content
  `);

  const revenueRows: any[] = (revenueResult as any).rows ?? [];
  const revenueByFlow: Record<string, number> = {};
  for (const r of revenueRows) {
    revenueByFlow[r.flowId] = Number(r.revenue) || 0;
  }

  return eventRows.map((r): FlowSummaryRow => ({
    flowId: r.flowId,
    sent: Number(r.sent) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    bounced: Number(r.bounced) || 0,
    complained: Number(r.complained) || 0,
    bookings: bookingsByFlow[r.flowId] ?? 0,
    revenue: revenueByFlow[r.flowId] ?? 0,
  }));
}

export interface FlowDetailResult {
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
    revenue: number;
  };
  perVariant?: Array<{
    variantId: string;
    label: string;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
    revenue: number;
  }>;
  bounces: Array<{ email: string; bounceType: string | null; createdAt: Date }>;
  complaints: Array<{ email: string; createdAt: Date }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}

export async function flowDetail(flowId: string): Promise<FlowDetailResult> {
  const funnelResult = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')      AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered') AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked') AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')   AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained') AS complained
    FROM flow_executions fe
    JOIN flow_events ev ON ev.execution_id = fe.id
    WHERE fe.flow_id = ${flowId}
  `);
  const funnelRow: any = (funnelResult as any).rows?.[0] ?? {};

  const bookingResult = await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE re.appointment_id IS NOT NULL) AS bookings
    FROM referral_events re
    WHERE re.utm_content = ${flowId}
  `);
  const bookings = Number((bookingResult as any).rows?.[0]?.bookings) || 0;

  const revenueResult = await db.execute(sql`
    SELECT COALESCE(SUM(cs.price), 0) AS revenue
    FROM referral_events re
    JOIN clinic_appointments ca ON ca.id = re.appointment_id
    LEFT JOIN clinic_services cs ON cs.id = ca.service_id
    WHERE re.utm_content = ${flowId}
      AND ca.status NOT IN ('cancelled', 'no_show')
  `);
  const revenue = Number((revenueResult as any).rows?.[0]?.revenue) || 0;

  const bouncesResult = await db.execute(sql`
    SELECT
      p.email AS email,
      ev.metadata->>'subType' AS "bounceType",
      ev.created_at AS "createdAt"
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    JOIN patients p ON p.id = fe.patient_id
    WHERE ev.event_type = 'bounced'
      AND fe.flow_id = ${flowId}
    ORDER BY ev.created_at DESC
    LIMIT 100
  `);

  const complaintsResult = await db.execute(sql`
    SELECT
      p.email AS email,
      ev.created_at AS "createdAt"
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    JOIN patients p ON p.id = fe.patient_id
    WHERE ev.event_type = 'complained'
      AND fe.flow_id = ${flowId}
    ORDER BY ev.created_at DESC
    LIMIT 100
  `);

  const seriesResult = await db.execute(sql`
    SELECT
      DATE(ev.created_at) AS day,
      COUNT(*) FILTER (WHERE ev.event_type = 'opened')  AS opened,
      COUNT(*) FILTER (WHERE ev.event_type = 'clicked') AS clicked
    FROM flow_events ev
    JOIN flow_executions fe ON fe.id = ev.execution_id
    WHERE fe.flow_id = ${flowId}
    GROUP BY DATE(ev.created_at)
    ORDER BY day
  `);

  // Per-variant event counts. Returns empty array when flow has no variants.
  const perVariantEventsResult = await db.execute(sql`
    SELECT
      v.id AS "variantId",
      v.label AS "label",
      COUNT(*) FILTER (WHERE ev.event_type = 'sent')                   AS sent,
      COUNT(*) FILTER (WHERE ev.event_type = 'delivered')              AS delivered,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'opened')    AS opened,
      COUNT(DISTINCT fe.id) FILTER (WHERE ev.event_type = 'clicked')   AS clicked,
      COUNT(*) FILTER (WHERE ev.event_type = 'bounced')                AS bounced,
      COUNT(*) FILTER (WHERE ev.event_type = 'complained')             AS complained
    FROM flow_variants v
    LEFT JOIN flow_executions fe ON fe.variant_id = v.id
    LEFT JOIN flow_events ev ON ev.execution_id = fe.id
    WHERE v.flow_id = ${flowId}
    GROUP BY v.id, v.label
    ORDER BY v.label
  `);

  // Per-variant bookings + revenue via flow_executions.booked_appointment_id
  // (Phase 3's per-execution attribution) — falls back to 0 if no bookings yet.
  const perVariantBookingsResult = await db.execute(sql`
    SELECT
      fe.variant_id AS "variantId",
      COUNT(*) FILTER (WHERE fe.booked_appointment_id IS NOT NULL) AS bookings,
      COALESCE(SUM(cs.price), 0) AS revenue
    FROM flow_executions fe
    LEFT JOIN clinic_appointments ca ON ca.id = fe.booked_appointment_id
    LEFT JOIN clinic_services cs ON cs.id = ca.service_id
    WHERE fe.flow_id = ${flowId}
      AND fe.variant_id IS NOT NULL
      AND (ca.status IS NULL OR ca.status NOT IN ('cancelled', 'no_show'))
    GROUP BY fe.variant_id
  `);

  const bookingsByVariant: Record<string, { bookings: number; revenue: number }> = {};
  for (const r of ((perVariantBookingsResult as any).rows ?? [])) {
    bookingsByVariant[r.variantId] = {
      bookings: Number(r.bookings) || 0,
      revenue: Number(r.revenue) || 0,
    };
  }

  const perVariantRows = ((perVariantEventsResult as any).rows ?? []).map((r: any) => ({
    variantId: r.variantId,
    label: r.label,
    sent: Number(r.sent) || 0,
    delivered: Number(r.delivered) || 0,
    opened: Number(r.opened) || 0,
    clicked: Number(r.clicked) || 0,
    bounced: Number(r.bounced) || 0,
    complained: Number(r.complained) || 0,
    bookings: bookingsByVariant[r.variantId]?.bookings ?? 0,
    revenue: bookingsByVariant[r.variantId]?.revenue ?? 0,
  }));

  return {
    funnel: {
      sent: Number(funnelRow.sent) || 0,
      delivered: Number(funnelRow.delivered) || 0,
      opened: Number(funnelRow.opened) || 0,
      clicked: Number(funnelRow.clicked) || 0,
      bounced: Number(funnelRow.bounced) || 0,
      complained: Number(funnelRow.complained) || 0,
      bookings,
      revenue,
    },
    ...(perVariantRows.length > 0 && { perVariant: perVariantRows }),
    bounces: ((bouncesResult as any).rows ?? []).map((r: any) => ({
      email: r.email,
      bounceType: r.bounceType,
      createdAt: new Date(r.createdAt),
    })),
    complaints: ((complaintsResult as any).rows ?? []).map((r: any) => ({
      email: r.email,
      createdAt: new Date(r.createdAt),
    })),
    series: ((seriesResult as any).rows ?? []).map((r: any) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      opened: Number(r.opened) || 0,
      clicked: Number(r.clicked) || 0,
    })),
  };
}
