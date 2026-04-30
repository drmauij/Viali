import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../server/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "../server/db";
import { buildAggregatedStats, runAnalysis } from "../server/services/marketingAiAnalyzer";

describe("buildAggregatedStats", () => {
  it("aggregates funnel + ad performance + cohort breakdown", async () => {
    const exec = db.execute as any;
    // Build 100 referral rows: 40 with appointment, 30 attended (kept), 12 paid.
    // Cohorts: 50 fresh (5 days old), 30 maturing (45 days old), 20 mature (120 days old).
    // Of the 12 paid: 2 fresh, 4 maturing, 6 mature (matches the lag-aware story).
    // Of the planned-but-unpaid: 5 mature with 8000 each (40000 pipeline mature),
    // 3 maturing with 5000 each (15000 maturing), 0 fresh.
    const now = Date.now();
    const day = 86_400_000;
    const referralAt = (ageDays: number) => new Date(now - ageDays * day).toISOString();
    const paidAt = (refAge: number, daysToPay: number) =>
      new Date(now - (refAge - daysToPay) * day).toISOString();

    type R = {
      referral_id: string;
      referral_date: string;
      has_appointment: boolean;
      appointment_status: string | null;
      surgery_id: string | null;
      surgery_price: string | null;
      payment_date: string | null;
    };
    const rows: R[] = [];
    let counter = 0;
    const push = (r: Omit<R, "referral_id">) =>
      rows.push({ referral_id: `r${++counter}`, ...r });

    // 50 fresh (5 days old): 20 booked, 12 attended (kept), 2 paid (3 days to pay)
    for (let i = 0; i < 2; i++) push({ referral_date: referralAt(5), has_appointment: true, appointment_status: "completed", surgery_id: "s", surgery_price: "5000", payment_date: paidAt(5, 3) });
    for (let i = 0; i < 10; i++) push({ referral_date: referralAt(5), has_appointment: true, appointment_status: "completed", surgery_id: null, surgery_price: null, payment_date: null });
    for (let i = 0; i < 8; i++) push({ referral_date: referralAt(5), has_appointment: true, appointment_status: "scheduled", surgery_id: null, surgery_price: null, payment_date: null });
    for (let i = 0; i < 30; i++) push({ referral_date: referralAt(5), has_appointment: false, appointment_status: null, surgery_id: null, surgery_price: null, payment_date: null });

    // 30 maturing (45 days): 12 booked, 10 attended, 4 paid, 3 pipeline @5000 (15000 total)
    for (let i = 0; i < 4; i++) push({ referral_date: referralAt(45), has_appointment: true, appointment_status: "completed", surgery_id: "s", surgery_price: "6000", payment_date: paidAt(45, 30) });
    for (let i = 0; i < 3; i++) push({ referral_date: referralAt(45), has_appointment: true, appointment_status: "completed", surgery_id: "s", surgery_price: "5000", payment_date: null });
    for (let i = 0; i < 3; i++) push({ referral_date: referralAt(45), has_appointment: true, appointment_status: "completed", surgery_id: null, surgery_price: null, payment_date: null });
    for (let i = 0; i < 2; i++) push({ referral_date: referralAt(45), has_appointment: true, appointment_status: "scheduled", surgery_id: null, surgery_price: null, payment_date: null });
    for (let i = 0; i < 18; i++) push({ referral_date: referralAt(45), has_appointment: false, appointment_status: null, surgery_id: null, surgery_price: null, payment_date: null });

    // 20 mature (120 days): 8 booked, 8 attended, 6 paid, 5 pipeline @8000 (40000 total)
    for (let i = 0; i < 6; i++) push({ referral_date: referralAt(120), has_appointment: true, appointment_status: "completed", surgery_id: "s", surgery_price: "9000", payment_date: paidAt(120, 90) });
    for (let i = 0; i < 5; i++) push({ referral_date: referralAt(120), has_appointment: true, appointment_status: "completed", surgery_id: "s", surgery_price: "8000", payment_date: null });
    for (let i = 0; i < 9; i++) push({ referral_date: referralAt(120), has_appointment: false, appointment_status: null, surgery_id: null, surgery_price: null, payment_date: null });

    expect(rows).toHaveLength(100);

    // First call: per-row funnel + cohort data
    exec.mockResolvedValueOnce({ rows });
    // Second call: ad performance rows
    exec.mockResolvedValueOnce({
      rows: [
        { source: "google_ads", campaign: "2026-03", spend: "500", leads: "50", booked: "20", paid: "8" },
        { source: "meta_ads", campaign: "2026-03", spend: "300", leads: "40", booked: "15", paid: "4" },
      ],
    });

    const stats = await buildAggregatedStats({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(stats.funnel.leads).toBe(100);
    expect(stats.funnel.booked).toBe(43);
    expect(stats.funnel.attended).toBe(33);
    expect(stats.funnel.paid).toBe(12);
    expect(stats.funnel.bookedRate).toBeCloseTo(0.43);
    expect(stats.funnel.attendedRate).toBeCloseTo(33 / 43);
    expect(stats.funnel.paidRate).toBeCloseTo(12 / 33);
    expect(stats.funnel.topDropoffStage).toBe("lead_to_booked");

    // Cohort breakdown — the whole point of this refactor.
    expect(stats.cohortBreakdown.freshUnder30Days.referrals).toBe(50);
    expect(stats.cohortBreakdown.freshUnder30Days.attended).toBe(12);
    expect(stats.cohortBreakdown.freshUnder30Days.paid).toBe(2);
    expect(stats.cohortBreakdown.freshUnder30Days.pendingPipelineChf).toBe(0);

    expect(stats.cohortBreakdown.maturing30To90Days.referrals).toBe(30);
    expect(stats.cohortBreakdown.maturing30To90Days.attended).toBe(10);
    expect(stats.cohortBreakdown.maturing30To90Days.paid).toBe(4);
    expect(stats.cohortBreakdown.maturing30To90Days.pendingPipelineChf).toBe(15000);

    expect(stats.cohortBreakdown.mature90PlusDays.referrals).toBe(20);
    expect(stats.cohortBreakdown.mature90PlusDays.attended).toBe(11);
    expect(stats.cohortBreakdown.mature90PlusDays.paid).toBe(6);
    expect(stats.cohortBreakdown.mature90PlusDays.pendingPipelineChf).toBe(40000);

    expect(stats.cohortBreakdown.totalPendingPipelineChf).toBe(55000);
    expect(stats.cohortBreakdown.avgDaysReferralToPaid).toBeGreaterThan(0);

    expect(stats.adPerformance).toHaveLength(2);
    expect(stats.adPerformance[0].source).toBe("google_ads");
    expect(stats.adPerformance[0].cpl).toBeCloseTo(10);
    expect(stats.adPerformance[0].cpa).toBeCloseTo(62.5);

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
    expect(stats.cohortBreakdown.freshUnder30Days.referrals).toBe(0);
    expect(stats.cohortBreakdown.totalPendingPipelineChf).toBe(0);
    expect(stats.cohortBreakdown.avgDaysReferralToPaid).toBeNull();
    expect(stats.adPerformance).toEqual([]);
    expect(stats.totals.adSpend).toBe(0);
  });
});

const emptyCohort = { referrals: 0, attended: 0, surgeryPlanned: 0, paid: 0, pendingPipelineChf: 0 };

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
  cohortBreakdown: {
    freshUnder30Days: { ...emptyCohort },
    maturing30To90Days: { ...emptyCohort },
    mature90PlusDays: { ...emptyCohort },
    avgDaysReferralToPaid: null,
    totalPendingPipelineChf: 0,
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

  it("includes operator notes in the user message when provided", async () => {
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

    await runAnalysis(sampleStats, "en", "Klaviyo paused April 14");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    const userMsg = body.messages[0].content as string;
    expect(userMsg).toContain("Operator notes:");
    expect(userMsg).toContain("Klaviyo paused April 14");
  });

  it("omits operator-notes section when notes are absent or whitespace", async () => {
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

    await runAnalysis(sampleStats, "en", "   ");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    const userMsg = body.messages[0].content as string;
    expect(userMsg).not.toContain("Operator notes:");
  });
});
