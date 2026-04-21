import { describe, it, expect, vi, beforeEach } from "vitest";

const capturedSql: string[] = [];

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(async (sqlObj: any) => {
      capturedSql.push(JSON.stringify(sqlObj));
      return { rows: [] } as any;
    }),
  },
}));

beforeEach(() => {
  capturedSql.length = 0;
  vi.clearAllMocks();
});

import { getLeadsStats } from "../server/services/leadsMetrics";

describe("getLeadsStats", () => {
  const H = "hospital-1";

  it("scopes every query to the hospital id", async () => {
    await getLeadsStats(H, {});
    // 5 queries: total, bySource, convBySource, avgDays, timeseries
    expect(capturedSql).toHaveLength(5);
    for (const q of capturedSql) {
      expect(q).toContain("hospital_id");
      expect(q).toContain(H);
    }
  });

  it("uses 'converted' status OR appointment_id for the conversion filter", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toMatch(/status\s*=\s*'converted'/i);
    expect(all).toMatch(/appointment_id\s+is\s+not\s+null/i);
  });

  it("groups the by-source query by source", async () => {
    await getLeadsStats(H, {});
    const hasGroupBySource = capturedSql.some(q => /group\s+by\s+source/i.test(q));
    expect(hasGroupBySource).toBe(true);
  });

  it("computes avg days from clinic_appointments.created_at minus leads.created_at and skips null appointment timestamps", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toContain("clinic_appointments");
    expect(all).toMatch(/ca\.created_at\s*-\s*l\.created_at/);
    expect(all).toMatch(/ca\.created_at\s+is\s+not\s+null/i);
    expect(all).toContain("86400"); // epoch → days
  });

  it("groups timeseries by month using hospital timezone", async () => {
    await getLeadsStats(H, { timezone: "Europe/Zurich" });
    const all = capturedSql.join(" ");
    expect(all).toMatch(/date_trunc\('month'/i);
    expect(all).toContain("Europe/Zurich");
  });

  it("applies the from lower bound when provided", async () => {
    await getLeadsStats(H, { from: "2026-01-01T00:00:00Z" });
    const all = capturedSql.join(" ");
    expect(all).toContain("2026-01-01T00:00:00Z");
    expect(all).toMatch(/created_at\s*>=/);
  });

  it("always applies an upper bound on created_at (defaults to now when omitted)", async () => {
    await getLeadsStats(H, {});
    const all = capturedSql.join(" ");
    expect(all).toMatch(/created_at\s*<=/);
  });

  it("returns zeroed/empty result when every query returns no rows", async () => {
    const stats = await getLeadsStats(H, {});
    expect(stats).toEqual({
      total: 0,
      bySource: [],
      conversionOverall: 0,
      conversionBySource: [],
      avgDaysToConversion: null,
      timeseries: [],
    });
  });
});
