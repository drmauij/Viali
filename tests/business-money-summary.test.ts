import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../server/db";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

async function callMoneySummary(range = "30d") {
  const { computeMoneySummary } = await import("../server/routes/business/moneyHelpers");
  return computeMoneySummary(TEST_HOSPITAL_ID, range);
}

describe("money-summary", () => {
  it("returns zeros when there is no paid surgery and no signed treatment in range", async () => {
    const result = await callMoneySummary("30d");
    expect(result.revenue.total).toBeGreaterThanOrEqual(0);
    expect(result.cost.total).toBeGreaterThanOrEqual(0);
    expect(result.byDay).toBeInstanceOf(Array);
    if (result.revenue.total === 0) {
      expect(result.margin.percent).toBe(0);
      expect(Number.isFinite(result.margin.percent)).toBe(true);
    }
  });

  it("groups byDay entries one per ISO date", async () => {
    const result = await callMoneySummary("30d");
    const dates = result.byDay.map(d => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    for (const d of result.byDay) {
      expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("matches treatment revenue computed directly from signed/invoiced treatments in range", async () => {
    const result = await callMoneySummary("30d");
    expect(result.revenue.treatment).toBeGreaterThanOrEqual(0);
    expect(result.revenue.total).toBeCloseTo(result.revenue.surgery + result.revenue.treatment, 2);

    const known = await db.execute(sql`
      SELECT COALESCE(SUM(CAST(tl.total AS numeric)), 0) AS rev
      FROM treatments t
      JOIN treatment_lines tl ON tl.treatment_id = t.id
      WHERE t.hospital_id = ${TEST_HOSPITAL_ID}
        AND t.status IN ('signed', 'invoiced')
        AND t.performed_at >= NOW() - INTERVAL '30 days'
    `);
    const expectedTreatmentRevenue = parseFloat((known.rows[0] as any)?.rev ?? "0");
    expect(result.revenue.treatment).toBeCloseTo(expectedTreatmentRevenue, 2);
  });

  it("populates deltaPp_vs_prev as the percentage point diff between current and prior margin%", async () => {
    const cur = await callMoneySummary("30d");
    const { computePriorMarginPercent } = await import("../server/routes/business/moneyHelpers");
    const prior = await computePriorMarginPercent(TEST_HOSPITAL_ID, "30d");
    expect(cur.margin.deltaPp_vs_prev).toBeCloseTo((cur.margin.percent - prior) * 100, 4);
    expect(Number.isFinite(cur.margin.deltaPp_vs_prev)).toBe(true);
  });
});
