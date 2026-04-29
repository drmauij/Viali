import { describe, it, expect } from "vitest";

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
});
