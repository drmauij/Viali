import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { items, medicationConfigs, administrationGroups } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { upsertMedicationConfig } from "../server/storage/inventory";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

const createdItemIds: string[] = [];
const createdGroupIds: string[] = [];
const createdConfigIds: string[] = [];

async function mkGroup(name: string) {
  const [g] = await db
    .insert(administrationGroups)
    .values({ hospitalId: TEST_HOSPITAL_ID, name: `${name}-${SUFFIX}`, sortOrder: 0 })
    .returning();
  createdGroupIds.push(g.id);
  return g;
}

async function mkItem(name: string, unitId: string) {
  const [i] = await db
    .insert(items)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId,
      name: `${name}-${SUFFIX}`,
      unit: "Pack",
    })
    .returning();
  createdItemIds.push(i.id);
  return i;
}

async function someUnitId(): Promise<string> {
  const [existingItem] = await db
    .select({ unitId: items.unitId })
    .from(items)
    .where(eq(items.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  return existingItem.unitId;
}

afterAll(async () => {
  for (const id of createdConfigIds)
    await db.delete(medicationConfigs).where(eq(medicationConfigs.id, id));
  for (const id of createdItemIds)
    await db.delete(items).where(eq(items.id, id));
  for (const id of createdGroupIds)
    await db.delete(administrationGroups).where(eq(administrationGroups.id, id));
});

describe("upsertMedicationConfig supports N configs per item", () => {
  it("creates two distinct configs for one item (different admin groups)", async () => {
    const uid = await someUnitId();
    const perfGroup = await mkGroup("Perfusor");
    const bolusGroup = await mkGroup("Bolus");
    const item = await mkItem("Noradrenalin", uid);

    const c1 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/min",
      defaultDose: "0.05",
      administrationUnit: "ml",
    });
    createdConfigIds.push(c1.id);

    const c2 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: bolusGroup.id,
      rateUnit: null,
      defaultDose: "10",
      administrationUnit: "μg",
    });
    createdConfigIds.push(c2.id);

    expect(c1.id).not.toBe(c2.id);

    const rows = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.itemId, item.id));
    expect(rows).toHaveLength(2);
    const byGroup = Object.fromEntries(rows.map(r => [r.administrationGroup, r]));
    expect(byGroup[perfGroup.id].rateUnit).toBe("μg/min");
    expect(byGroup[bolusGroup.id].rateUnit).toBeNull();
    expect(byGroup[bolusGroup.id].defaultDose).toBe("10");
  });

  it("upsert on same (item, group) updates in place — no duplicate", async () => {
    const uid = await someUnitId();
    const perfGroup = await mkGroup("Perfusor2");
    const item = await mkItem("Fentanyl", uid);

    const c1 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/kg/h",
      defaultDose: "2",
    });
    createdConfigIds.push(c1.id);

    const c2 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/kg/h",
      defaultDose: "3", // changed
    });
    // Same id — upserted in place.
    expect(c2.id).toBe(c1.id);

    const rows = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.itemId, item.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].defaultDose).toBe("3");
  });
});

describe("upsertMedicationConfig regression: preserves user-set fields", () => {
  it("preserves sortOrder when the caller omits it (regression guard)", async () => {
    const uid = await someUnitId();
    const perfGroup = await mkGroup("Perfusor-preserve");
    const item = await mkItem("Propofol-preserve", uid);

    // First upsert establishes a sortOrder explicitly.
    const c1 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "mg/kg/h",
      defaultDose: "5",
      sortOrder: 42,
    });
    createdConfigIds.push(c1.id);

    // Second upsert omits sortOrder — it MUST preserve 42, not reset to 0.
    await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "mg/kg/h",
      defaultDose: "5",
      // sortOrder deliberately omitted
    });

    const [row] = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.id, c1.id));
    expect(row.sortOrder).toBe(42);
  });

  it("preserves onDemandOnly when the caller omits it (regression guard)", async () => {
    const uid = await someUnitId();
    const perfGroup = await mkGroup("Perfusor-preserve2");
    const item = await mkItem("Fentanyl-preserve", uid);

    const c1 = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/kg/h",
      onDemandOnly: true,
    });
    createdConfigIds.push(c1.id);

    await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/kg/h",
      // onDemandOnly deliberately omitted
    });

    const [row] = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.id, c1.id));
    expect(row.onDemandOnly).toBe(true);
  });
});
