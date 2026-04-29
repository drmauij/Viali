// tests/business-top-procedures.test.ts
import { describe, it, expect } from "vitest";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

describe("top-procedures-by-margin", () => {
  it("returns at most `limit` rows sorted by margin desc", async () => {
    const { computeTopProceduresByMargin } = await import("../server/routes/business/topProcedures");
    const rows = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "30d", 5);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].margin).toBeGreaterThanOrEqual(rows[i].margin);
    }
    for (const r of rows) {
      expect(typeof r.procedure).toBe("string");
      expect(r.procedure.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.marginPercent)).toBe(true);
    }
  });

  it("normalises case/whitespace when grouping (no duplicate fragmented rows)", async () => {
    const { computeTopProceduresByMargin } = await import("../server/routes/business/topProcedures");
    const rows = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "365d", 50);
    const lower = rows.map(r => r.procedure.toLowerCase().trim());
    expect(new Set(lower).size).toBe(lower.length);
  });
});
