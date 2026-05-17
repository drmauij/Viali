// tests/business-top-procedures.test.ts
import { describe, it, expect } from "vitest";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

describe("top-procedures-by-margin", () => {
  it("returns at most `limit` rows sorted by margin desc", async () => {
    const { computeTopProceduresByMargin } = await import("../server/routes/business/topProcedures");
    const rows = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "all", 5);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].margin).toBeGreaterThanOrEqual(rows[i].margin);
    }
    for (const r of rows) {
      expect(typeof r.procedure).toBe("string");
      expect(r.procedure.length).toBeGreaterThan(0);
      expect(Number.isFinite(r.marginPercent)).toBe(true);
      // Zero-cost rows are excluded by HAVING in the SQL — every returned
      // row must have a positive cost so margin reflects a real economic
      // picture instead of free revenue.
      expect(r.cost).toBeGreaterThan(0);
    }
  });

  it("normalises case/whitespace when grouping (no duplicate fragmented rows)", async () => {
    const { computeTopProceduresByMargin } = await import("../server/routes/business/topProcedures");
    const rows = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "all", 50);
    const lower = rows.map(r => r.procedure.toLowerCase().trim());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("returns the same all-time picture regardless of the range argument", async () => {
    // Top procedures is intentionally not scoped to the dashboard range —
    // verify that switching range values doesn't change the result set.
    const { computeTopProceduresByMargin } = await import("../server/routes/business/topProcedures");
    const a = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "all", 10);
    const b = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "2024", 10);
    const c = await computeTopProceduresByMargin(TEST_HOSPITAL_ID, "30d", 10);
    const keyOf = (rows: typeof a) => rows.map(r => `${r.procedure}|${r.count}|${r.revenue}|${r.cost}`).join("¦");
    expect(keyOf(a)).toBe(keyOf(b));
    expect(keyOf(a)).toBe(keyOf(c));
  });
});
