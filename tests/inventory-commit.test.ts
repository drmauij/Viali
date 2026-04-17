import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { items, lots, stockLevels, units } from "@shared/schema";
import { eq } from "drizzle-orm";
import { commitUsage } from "../server/storage/inventoryCommit";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testItemId: string;
let testLotId: string;
let testUnitId: string;

beforeAll(async () => {
  const [unit] = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  testUnitId = unit.id;
  const [item] = await db.insert(items).values({
    hospitalId: TEST_HOSPITAL_ID,
    unitId: testUnitId,
    name: "TEST_BOTOX_INVCOMMIT",
    unit: "Single unit",
    isInvoiceable: true,
  }).returning();
  testItemId = item.id;
  const [lot] = await db.insert(lots).values({
    itemId: testItemId,
    unitId: testUnitId,
    lotNumber: "TEST-LOT-001",
    qty: 100,
  }).returning();
  testLotId = lot.id;
  await db.insert(stockLevels).values({
    itemId: testItemId,
    unitId: testUnitId,
    qtyOnHand: 100,
  });
});

afterAll(async () => {
  await db.delete(lots).where(eq(lots.id, testLotId));
  await db.delete(stockLevels).where(eq(stockLevels.itemId, testItemId));
  await db.delete(items).where(eq(items.id, testItemId));
  await pool.end();
});

describe("commitUsage", () => {
  it("decrements lot and stockLevels when lotId is set", async () => {
    await commitUsage({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      entries: [{ itemId: testItemId, lotId: testLotId, quantity: 5 }],
    });
    const [lot] = await db.select().from(lots).where(eq(lots.id, testLotId));
    expect(lot.qty).toBe(95);
    const [stock] = await db.select().from(stockLevels).where(eq(stockLevels.itemId, testItemId));
    expect(stock.qtyOnHand).toBe(95);
  });

  it("decrements only stockLevels when lotId is null", async () => {
    await commitUsage({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      entries: [{ itemId: testItemId, lotId: null, quantity: 3 }],
    });
    const [stock] = await db.select().from(stockLevels).where(eq(stockLevels.itemId, testItemId));
    expect(stock.qtyOnHand).toBe(92);
  });

  it("clamps to zero on over-decrement", async () => {
    await commitUsage({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      entries: [{ itemId: testItemId, lotId: testLotId, quantity: 1000 }],
    });
    const [lot] = await db.select().from(lots).where(eq(lots.id, testLotId));
    expect(lot.qty).toBe(0);
    const [stock] = await db.select().from(stockLevels).where(eq(stockLevels.itemId, testItemId));
    expect(stock.qtyOnHand).toBe(0);
  });

  it("throws when lotId references a missing lot", async () => {
    await expect(commitUsage({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      entries: [{ itemId: testItemId, lotId: "00000000-0000-0000-0000-000000000000", quantity: 1 }],
    })).rejects.toThrow(/not found/);
  });
});
