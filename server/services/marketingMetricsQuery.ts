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
