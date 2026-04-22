import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import {
  patients,
  cases,
  surgeries,
  anesthesiaRecords,
  anesthesiaMedications,
  items,
  medicationConfigs,
  administrationGroups,
  inventoryUsage,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { calculateInventoryUsage } from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];
const createdCaseIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdRecordIds: string[] = [];
const createdItemIds: string[] = [];
const createdConfigIds: string[] = [];

async function mkGroup(name: string) {
  const [g] = await db
    .insert(administrationGroups)
    .values({ hospitalId: TEST_HOSPITAL_ID, name: `${name}-${SUFFIX}`, sortOrder: 0 })
    .returning();
  createdGroupIds.push(g.id);
  return g;
}

async function mkItem(name: string) {
  const [existing] = await db
    .select({ unitId: items.unitId })
    .from(items)
    .where(eq(items.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  const [i] = await db
    .insert(items)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: existing.unitId,
      name: `${name}-${SUFFIX}`,
      unit: "Pack",
    })
    .returning();
  createdItemIds.push(i.id);
  return i;
}

async function mkConfig(itemId: string, groupId: string, extra: Partial<typeof medicationConfigs.$inferInsert>) {
  const [cfg] = await db
    .insert(medicationConfigs)
    .values({ itemId, administrationGroup: groupId, ...extra })
    .returning();
  createdConfigIds.push(cfg.id);
  return cfg;
}

async function mkRecord() {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `INV-MC-${SUFFIX}-${nanoid(4)}`,
      surname: "InvMultiConf",
      firstName: "P",
      birthday: "2000-01-01",
      sex: "M",
    })
    .returning();
  createdPatientIds.push(p.id);

  const [c] = await db.insert(cases).values({ hospitalId: TEST_HOSPITAL_ID, patientId: p.id, admissionDate: new Date() }).returning();
  createdCaseIds.push(c.id);

  const [s] = await db
    .insert(surgeries)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: p.id,
      caseId: c.id,
      plannedDate: new Date(),
      plannedSurgery: "Inventory Multi-Config Test",
    })
    .returning();
  createdSurgeryIds.push(s.id);

  const [r] = await db.insert(anesthesiaRecords).values({ surgeryId: s.id }).returning();
  createdRecordIds.push(r.id);

  return r;
}

afterAll(async () => {
  if (createdRecordIds.length) {
    await db.delete(inventoryUsage).where(inArray(inventoryUsage.anesthesiaRecordId, createdRecordIds)).catch(() => {});
    await db.delete(anesthesiaMedications).where(inArray(anesthesiaMedications.anesthesiaRecordId, createdRecordIds)).catch(() => {});
  }
  for (const id of createdRecordIds) await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, id)).catch(() => {});
  for (const id of createdSurgeryIds) await db.delete(surgeries).where(eq(surgeries.id, id)).catch(() => {});
  for (const id of createdCaseIds) await db.delete(cases).where(eq(cases.id, id)).catch(() => {});
  for (const id of createdPatientIds) await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  for (const id of createdConfigIds) await db.delete(medicationConfigs).where(eq(medicationConfigs.id, id)).catch(() => {});
  for (const id of createdItemIds) await db.delete(items).where(eq(items.id, id)).catch(() => {});
  for (const id of createdGroupIds) await db.delete(administrationGroups).where(eq(administrationGroups.id, id)).catch(() => {});
});

describe("calculateInventoryUsage — multi-config per item", () => {
  it("sums ampules per-config, NOT by item-level total-then-ceil (opening new ampule per lane)", async () => {
    const perfGroup = await mkGroup("Perf");
    const bolusGroup = await mkGroup("Bolus");
    const record = await mkRecord();
    const item = await mkItem("Propofol");

    const perfCfg = await mkConfig(item.id, perfGroup.id, {
      rateUnit: "mg/kg/h",
      ampuleTotalContent: "50 mg",
      administrationUnit: "ml",
    });
    const bolusCfg = await mkConfig(item.id, bolusGroup.id, {
      rateUnit: null,
      ampuleTotalContent: "50 mg",
      administrationUnit: "mg",
    });

    // Manual total on the perfusor side: 10 mg (tiny, just to force ceil per-config).
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: perfCfg.id,
      timestamp: new Date(),
      type: "manual_total",
      dose: "10 mg",
    });

    // Bolus on the bolus side: 10 mg.
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: bolusCfg.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "10 mg",
    });

    const usage = await calculateInventoryUsage(record.id);
    const forItem = usage.find(u => u.itemId === item.id);
    expect(forItem).toBeDefined();
    // Per-config ceil: ceil(10/50) + ceil(10/50) = 1 + 1 = 2. NOT ceil((10+10)/50) = 1.
    expect(Number(forItem!.calculatedQty)).toBe(2);
  });

  it("honors manual_total override on the perfusor config (replaces rate×duration calc)", async () => {
    const perfGroup = await mkGroup("Perf2");
    const bolusGroup = await mkGroup("Bolus2");
    const record = await mkRecord();
    const item = await mkItem("Noradrenalin");

    const perfCfg = await mkConfig(item.id, perfGroup.id, {
      rateUnit: "μg/min",
      ampuleTotalContent: "1 mg",
      administrationUnit: "ml",
    });
    const bolusCfg = await mkConfig(item.id, bolusGroup.id, {
      rateUnit: null,
      ampuleTotalContent: "1 mg",
      administrationUnit: "μg",
    });

    // Running infusion for 2 hours at 5 μg/min → would calculate ~0.6 mg rate×duration.
    // But manual override says 5 mg actual consumed.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: perfCfg.id,
      timestamp: twoHoursAgo,
      endTimestamp: new Date(),
      type: "infusion_start",
      rate: "5",
    });

    // Manual override replaces the rate×duration calc.
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: perfCfg.id,
      timestamp: new Date(),
      type: "manual_total",
      dose: "5 mg",
    });

    // Bolus on the bolus side: 0.5 mg (half an ampule).
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: bolusCfg.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "0.5 mg",
    });

    const usage = await calculateInventoryUsage(record.id);
    const forItem = usage.find(u => u.itemId === item.id);
    expect(forItem).toBeDefined();
    // Perfusor: ceil(5 / 1) = 5. Bolus: ceil(0.5 / 1) = 1. Total: 6.
    expect(Number(forItem!.calculatedQty)).toBe(6);
  });

  it("single-config backward compat: bolus-only item still calculates correctly", async () => {
    const bolusGroup = await mkGroup("BolusOnly");
    const record = await mkRecord();
    const item = await mkItem("Atropine");

    const cfg = await mkConfig(item.id, bolusGroup.id, {
      rateUnit: null,
      ampuleTotalContent: "0.5 mg",
      administrationUnit: "mg",
    });

    // Two bolus doses.
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: cfg.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "0.5 mg",
    });
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: cfg.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "0.5 mg",
    });

    const usage = await calculateInventoryUsage(record.id);
    const forItem = usage.find(u => u.itemId === item.id);
    expect(forItem).toBeDefined();
    // Single config, bolus path: sum (0.5 + 0.5) = 1 mg → ceil(1/0.5) = 2.
    expect(Number(forItem!.calculatedQty)).toBe(2);
  });

  it("orphan dose (no medicationConfigId) routes to item's first config", async () => {
    const bolusGroup = await mkGroup("BolusOrphan");
    const record = await mkRecord();
    const item = await mkItem("Rocuronium");

    await mkConfig(item.id, bolusGroup.id, {
      rateUnit: null,
      ampuleTotalContent: "50 mg",
      administrationUnit: "mg",
    });

    // Dose with NO medicationConfigId — should fall back to the item's first config.
    await db.insert(anesthesiaMedications).values({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      medicationConfigId: null,
      timestamp: new Date(),
      type: "bolus",
      dose: "50 mg",
    });

    const usage = await calculateInventoryUsage(record.id);
    const forItem = usage.find(u => u.itemId === item.id);
    expect(forItem).toBeDefined();
    expect(Number(forItem!.calculatedQty)).toBe(1);
  });
});
