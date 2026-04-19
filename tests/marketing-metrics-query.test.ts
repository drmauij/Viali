import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture executed SQL for shape assertions.
const capturedSql: string[] = [];

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(async (sqlObj: any) => {
      const serialized = JSON.stringify(sqlObj);
      capturedSql.push(serialized);
      return { rows: [] } as any;
    }),
  },
}));

beforeEach(() => {
  capturedSql.length = 0;
  vi.clearAllMocks();
});

import { summarizeFlows, flowDetail } from "../server/services/marketingMetricsQuery";

describe("summarizeFlows", () => {
  it("queries flow_events with COUNT FILTER for each event type", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    expect(capturedSql.length).toBeGreaterThanOrEqual(1);
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("flow_events");
    expect(allSql).toContain("flow_executions");
    expect(allSql).toContain("'sent'");
    expect(allSql).toContain("'delivered'");
    expect(allSql).toContain("'opened'");
    expect(allSql).toContain("'clicked'");
    expect(allSql).toContain("'bounced'");
    expect(allSql).toContain("'complained'");
  });

  it("uses COUNT DISTINCT for opened and clicked", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    expect(allSql).toMatch(/distinct.*opened/i);
    expect(allSql).toMatch(/distinct.*clicked/i);
  });

  it("queries referral_events for booking counts joined on utm_content", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("referral_events");
    expect(allSql).toContain("utm_content");
  });

  it("scopes by hospital_id and the since timestamp", async () => {
    await summarizeFlows("h1", new Date("2026-04-01T00:00:00Z"));
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("hospital_id");
    expect(allSql.toLowerCase()).toContain("started_at");
  });
});

describe("flowDetail", () => {
  it("queries funnel + bounces + complaints + daily series", async () => {
    await flowDetail("flow_xyz");
    expect(capturedSql.length).toBeGreaterThanOrEqual(4);
    const allSql = capturedSql.join(" ");
    expect(allSql).toContain("flow_xyz"); // flow id appears as a parameter
    expect(allSql).toContain("'bounced'");
    expect(allSql).toContain("'complained'");
    // Time-series uses DATE() grouping
    expect(allSql.toLowerCase()).toMatch(/date\(.*created_at\)/);
  });
});
