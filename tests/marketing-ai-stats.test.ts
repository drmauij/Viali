import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "../server/db";
import { buildAggregatedStats } from "../server/services/marketingAiAnalyzer";

describe("buildAggregatedStats", () => {
  it("aggregates funnel + ad performance into compact shape", async () => {
    const exec = db.execute as any;
    // First call: funnel rows
    exec.mockResolvedValueOnce({
      rows: [
        { stage: "leads", count: "100" },
        { stage: "booked", count: "40" },
        { stage: "attended", count: "30" },
        { stage: "paid", count: "12" },
      ],
    });
    // Second call: ad performance rows
    // Row shape matches the SQL output: funnel aliased as source, month as campaign,
    // amount_chf summed as spend, leads/booked/paid as counts
    exec.mockResolvedValueOnce({
      rows: [
        {
          source: "google_ads",
          campaign: "2026-03",
          spend: "500",
          leads: "50",
          booked: "20",
          paid: "8",
        },
        {
          source: "meta_ads",
          campaign: "2026-03",
          spend: "300",
          leads: "40",
          booked: "15",
          paid: "4",
        },
      ],
    });

    const stats = await buildAggregatedStats({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(stats.funnel.leads).toBe(100);
    expect(stats.funnel.booked).toBe(40);
    expect(stats.funnel.attended).toBe(30);
    expect(stats.funnel.paid).toBe(12);
    expect(stats.funnel.bookedRate).toBeCloseTo(0.4);
    expect(stats.funnel.attendedRate).toBeCloseTo(0.75);
    expect(stats.funnel.paidRate).toBeCloseTo(0.4);
    // drop-off stage: lead→booked loses 60, booked→attended loses 10, attended→paid loses 18
    // top drop-off = lead_to_booked (60 lost, highest absolute)
    expect(stats.funnel.topDropoffStage).toBe("lead_to_booked");

    expect(stats.adPerformance).toHaveLength(2);
    expect(stats.adPerformance[0].source).toBe("google_ads");
    expect(stats.adPerformance[0].cpl).toBeCloseTo(10);
    expect(stats.adPerformance[0].cpa).toBeCloseTo(62.5); // 500/8

    expect(stats.totals.adSpend).toBe(800);
    expect(stats.totals.totalLeads).toBe(90);
    expect(stats.dateRange.days).toBe(31);
  });

  it("returns empty-shape stats when no data", async () => {
    const exec = db.execute as any;
    exec.mockResolvedValueOnce({ rows: [] });
    exec.mockResolvedValueOnce({ rows: [] });
    const stats = await buildAggregatedStats({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(stats.funnel.leads).toBe(0);
    expect(stats.adPerformance).toEqual([]);
    expect(stats.totals.adSpend).toBe(0);
  });
});
