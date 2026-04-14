import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "../server/db";
import { buildAggregatedStats, runAnalysis } from "../server/services/marketingAiAnalyzer";

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

const sampleStats = {
  dateRange: { start: "2026-03-01", end: "2026-03-31", days: 31 },
  funnel: {
    leads: 100,
    booked: 40,
    attended: 30,
    paid: 12,
    bookedRate: 0.4,
    attendedRate: 0.75,
    paidRate: 0.4,
    topDropoffStage: "lead_to_booked" as const,
  },
  adPerformance: [],
  totals: { adSpend: 0, totalLeads: 0, avgCpl: 0, avgCpa: null },
};

describe("runAnalysis", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  it("returns validated payload on good Claude output", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: ["100 leads, 12 paid this month"],
              trends: ["Lead→booked drop-off is the largest gap"],
              insights: ["40% booking rate is typical for this source mix"],
              suggestedActions: ["Tighten follow-up on leads who don't book within 24h"],
            }),
          },
        ],
      }),
    }) as any;

    const payload = await runAnalysis(sampleStats, "en");
    expect(payload.summary[0]).toContain("100 leads");
    expect(payload.suggestedActions).toHaveLength(1);
  });

  it("retries once on malformed JSON then throws", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "not-json" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "still-not-json" }],
        }),
      });
    globalThis.fetch = fetchMock as any;

    await expect(runAnalysis(sampleStats, "en")).rejects.toThrow(
      /invalid ai response/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on Anthropic API error (non-ok)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server error",
    }) as any;

    await expect(runAnalysis(sampleStats, "en")).rejects.toThrow(
      /anthropic api error/i,
    );
  });

  it("passes language directive to Claude", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: ["ok"],
              trends: [],
              insights: [],
              suggestedActions: [],
            }),
          },
        ],
      }),
    });
    globalThis.fetch = fetchMock as any;

    await runAnalysis(sampleStats, "de");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('"de"');
  });
});
