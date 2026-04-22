import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import {
  items,
  medicationConfigs,
  administrationGroups,
  anesthesiaMedications,
  anesthesiaRecords,
  surgeries,
  cases,
  patients,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { upsertMedicationConfig } from "../server/storage/inventory";
import { createAnesthesiaMedication } from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

const createdPatientIds: string[] = [];
const createdCaseIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdRecordIds: string[] = [];
const createdItemIds: string[] = [];
const createdConfigIds: string[] = [];
const createdGroupIds: string[] = [];

// Helpers copied from tests/or-medications.test.ts
async function createTestPatient() {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `DOSE-TEST-${SUFFIX}-${nanoid(4)}`,
      surname: "DoseTest",
      firstName: "Patient",
      birthday: "2000-01-01",
      sex: "M",
    })
    .returning();
  createdPatientIds.push(p.id);
  return p;
}

async function createTestAnesthesiaRecord() {
  const patient = await createTestPatient();

  const [c] = await db
    .insert(cases)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: patient.id,
      admissionDate: new Date(),
    })
    .returning();
  createdCaseIds.push(c.id);

  const [surgery] = await db
    .insert(surgeries)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: patient.id,
      caseId: c.id,
      plannedDate: new Date(),
      plannedSurgery: "Dose Multi-Config Test Surgery",
    })
    .returning();
  createdSurgeryIds.push(surgery.id);

  const [record] = await db
    .insert(anesthesiaRecords)
    .values({ surgeryId: surgery.id })
    .returning();
  createdRecordIds.push(record.id);

  return record;
}

async function mkGroup(name: string) {
  const [g] = await db
    .insert(administrationGroups)
    .values({ hospitalId: TEST_HOSPITAL_ID, name: `${name}-${SUFFIX}`, sortOrder: 0 })
    .returning();
  createdGroupIds.push(g.id);
  return g;
}

async function mkItem(name: string) {
  const [existingItem] = await db
    .select({ unitId: items.unitId })
    .from(items)
    .where(eq(items.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  if (!existingItem) throw new Error("No items in test DB to borrow a unitId from");

  const [i] = await db
    .insert(items)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: existingItem.unitId,
      name: `${name}-${SUFFIX}`,
      unit: "Pack",
    })
    .returning();
  createdItemIds.push(i.id);
  return i;
}

afterAll(async () => {
  if (createdRecordIds.length) {
    await db
      .delete(anesthesiaMedications)
      .where(inArray(anesthesiaMedications.anesthesiaRecordId, createdRecordIds))
      .catch(() => {});
  }
  for (const id of createdRecordIds)
    await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, id)).catch(() => {});
  for (const id of createdSurgeryIds)
    await db.delete(surgeries).where(eq(surgeries.id, id)).catch(() => {});
  for (const id of createdCaseIds)
    await db.delete(cases).where(eq(cases.id, id)).catch(() => {});
  for (const id of createdPatientIds)
    await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  for (const id of createdConfigIds)
    await db.delete(medicationConfigs).where(eq(medicationConfigs.id, id)).catch(() => {});
  for (const id of createdItemIds)
    await db.delete(items).where(eq(items.id, id)).catch(() => {});
  for (const id of createdGroupIds)
    await db.delete(administrationGroups).where(eq(administrationGroups.id, id)).catch(() => {});

  const { pool } = await import("../server/db");
  await pool.end();
});

describe("dose write path stamps medicationConfigId", () => {
  it("createAnesthesiaMedication persists medicationConfigId when supplied", async () => {
    const record = await createTestAnesthesiaRecord();

    const perfGroup = await mkGroup("PerfDose");
    const bolusGroup = await mkGroup("BolusDose");
    const item = await mkItem("NoraDose");

    const perfCfg = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: perfGroup.id,
      rateUnit: "μg/min",
      defaultDose: "0.05",
    });
    const bolusCfg = await upsertMedicationConfig({
      itemId: item.id,
      administrationGroup: bolusGroup.id,
      rateUnit: null,
      defaultDose: "10",
    });
    createdConfigIds.push(perfCfg.id, bolusCfg.id);

    // Dose pointing at the BOLUS config
    const med = await createAnesthesiaMedication({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "10 μg",
      medicationConfigId: bolusCfg.id,
    });

    const [row] = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.id, med.id));

    expect(row.medicationConfigId).toBe(bolusCfg.id);
  });

  it("createAnesthesiaMedication without medicationConfigId stores null", async () => {
    const record = await createTestAnesthesiaRecord();
    const item = await mkItem("NullConfigDrug");

    const med = await createAnesthesiaMedication({
      anesthesiaRecordId: record.id,
      itemId: item.id,
      timestamp: new Date(),
      type: "bolus",
      dose: "5 mg",
      // medicationConfigId intentionally omitted
    });

    const [row] = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.id, med.id));

    expect(row.medicationConfigId).toBeNull();
  });
});
