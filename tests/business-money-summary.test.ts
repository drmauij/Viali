import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../server/db";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

async function callMoneySummary(range = "all") {
  const { computeMoneySummary } = await import("../server/routes/business/moneyHelpers");
  return computeMoneySummary(TEST_HOSPITAL_ID, range);
}

describe("money-summary", () => {
  it("returns zeros when there is no paid surgery and no signed treatment in range", async () => {
    const result = await callMoneySummary("all");
    expect(result.revenue.total).toBeGreaterThanOrEqual(0);
    expect(result.cost.total).toBeGreaterThanOrEqual(0);
    expect(result.byMonth).toBeInstanceOf(Array);
    if (result.revenue.total === 0) {
      expect(result.margin.percent).toBe(0);
      expect(Number.isFinite(result.margin.percent)).toBe(true);
    }
  });

  it("groups byMonth entries one per YYYY-MM bucket", async () => {
    const result = await callMoneySummary("all");
    const months = result.byMonth.map(m => m.month);
    expect(new Set(months).size).toBe(months.length);
    for (const m of result.byMonth) {
      expect(m.month).toMatch(/^\d{4}-\d{2}$/);
      // Each point must carry the derived cost + margin so the chart can
      // render the three lines without further client-side math.
      expect(m.cost).toBeCloseTo(m.staffCost + m.materialsCost, 4);
      expect(m.margin).toBeCloseTo(m.revenue - m.cost, 4);
    }
  });

  it("matches treatment revenue computed directly from signed/invoiced treatments in range", async () => {
    const year = new Date().getFullYear();
    const result = await callMoneySummary(String(year));
    expect(result.revenue.treatment).toBeGreaterThanOrEqual(0);
    expect(result.revenue.total).toBeCloseTo(result.revenue.surgery + result.revenue.treatment, 2);

    const startIso = new Date(Date.UTC(year, 0, 1)).toISOString();
    const endIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
    const known = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS rev
      FROM treatments t
      JOIN treatment_lines tl ON tl.treatment_id = t.id
      WHERE t.hospital_id = ${TEST_HOSPITAL_ID}
        AND t.status IN ('signed', 'invoiced')
        AND t.performed_at >= ${startIso}
        AND t.performed_at < ${endIso}
    `);
    const expectedTreatmentRevenue = parseFloat((known.rows[0] as any)?.rev ?? "0");
    expect(result.revenue.treatment).toBeCloseTo(expectedTreatmentRevenue, 2);
  });

  it("populates deltaPp_vs_prev as the percentage point diff between current and prior margin% for a year range", async () => {
    const year = new Date().getFullYear();
    const cur = await callMoneySummary(String(year));
    const { computePriorMarginPercent } = await import("../server/routes/business/moneyHelpers");
    const prior = await computePriorMarginPercent(TEST_HOSPITAL_ID, String(year));
    expect(cur.margin.deltaPp_vs_prev).toBeCloseTo((cur.margin.percent - prior) * 100, 4);
    expect(Number.isFinite(cur.margin.deltaPp_vs_prev)).toBe(true);
  });

  it("returns deltaPp_vs_prev = 0 for the all-time range (no meaningful prior period)", async () => {
    const result = await callMoneySummary("all");
    expect(result.margin.deltaPp_vs_prev).toBe(0);
  });
});
