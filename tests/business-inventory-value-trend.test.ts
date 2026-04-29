// tests/business-inventory-value-trend.test.ts
import { describe, it, expect } from "vitest";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

describe("inventory-value-trend", () => {
  it("returns one entry per day with date YYYY-MM-DD and finite value", async () => {
    const { db } = await import("../server/db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql`
      SELECT snapshot_date::text AS date,
             COALESCE(SUM(CAST(total_value AS numeric)), 0) AS value
      FROM inventory_snapshots
      WHERE hospital_id = ${TEST_HOSPITAL_ID}
        AND snapshot_date >= CURRENT_DATE - 30
      GROUP BY snapshot_date
      ORDER BY snapshot_date
    `);
    expect(Array.isArray(rows.rows)).toBe(true);
    for (const r of rows.rows as any[]) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isFinite(parseFloat(r.value))).toBe(true);
    }
  });
});
