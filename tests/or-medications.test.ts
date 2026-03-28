import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import {
  patients,
  cases,
  surgeries,
  anesthesiaRecords,
  items,
  medicationConfigs,
  administrationGroups,
  orMedications,
  inventoryUsage,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getAdministrationGroups,
  createAdministrationGroup,
} from "../server/storage/inventory";
import {
  getOrMedications,
  upsertOrMedication,
  deleteOrMedication,
  calculateOrInventoryUsage,
} from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

// Track IDs for cleanup
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];
const createdCaseIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdAnesthesiaRecordIds: string[] = [];
const createdItemIds: string[] = [];
const createdMedicationConfigIds: string[] = [];

async function createTestPatient() {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `OR-TEST-${SUFFIX}-${nanoid(4)}`,
      surname: "OrMedTest",
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
      plannedSurgery: "OR Med Test Surgery",
    })
    .returning();
  createdSurgeryIds.push(surgery.id);

  const [record] = await db
    .insert(anesthesiaRecords)
    .values({ surgeryId: surgery.id })
    .returning();
  createdAnesthesiaRecordIds.push(record.id);

  return record;
}

async function createTestItem(name: string, ampuleTotalContent?: string) {
  // We need a unit ID — look up the first unit for this hospital from an existing item
  const [existingItem] = await db
    .select({ unitId: items.unitId })
    .from(items)
    .where(eq(items.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);

  const [item] = await db
    .insert(items)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: existingItem.unitId,
      name: `${name}-${SUFFIX}`,
      unit: "Single unit",
      status: "active",
    })
    .returning();
  createdItemIds.push(item.id);

  if (ampuleTotalContent) {
    const [config] = await db
      .insert(medicationConfigs)
      .values({ itemId: item.id, ampuleTotalContent })
      .returning();
    createdMedicationConfigIds.push(config.id);
  }

  return item;
}

afterAll(async () => {
  // Clean up in reverse dependency order
  for (const id of createdAnesthesiaRecordIds) {
    await db.delete(orMedications).where(eq(orMedications.anesthesiaRecordId, id)).catch(() => {});
    await db.delete(inventoryUsage).where(eq(inventoryUsage.anesthesiaRecordId, id)).catch(() => {});
    await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, id)).catch(() => {});
  }
  for (const id of createdSurgeryIds) {
    await db.delete(surgeries).where(eq(surgeries.id, id)).catch(() => {});
  }
  for (const id of createdCaseIds) {
    await db.delete(cases).where(eq(cases.id, id)).catch(() => {});
  }
  for (const id of createdMedicationConfigIds) {
    await db.delete(medicationConfigs).where(eq(medicationConfigs.id, id)).catch(() => {});
  }
  for (const id of createdItemIds) {
    await db.delete(items).where(eq(items.id, id)).catch(() => {});
  }
  for (const id of createdGroupIds) {
    await db.delete(administrationGroups).where(eq(administrationGroups.id, id)).catch(() => {});
  }
  for (const id of createdPatientIds) {
    await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("Administration Groups with unitType", () => {
  let orGroupId: string;

  it("GET filters by unitType - returns only anesthesia groups by default", async () => {
    const orGroup = await createAdministrationGroup({
      hospitalId: TEST_HOSPITAL_ID,
      name: `OR Group ${SUFFIX}`,
      unitType: "or",
    });
    orGroupId = orGroup.id;
    createdGroupIds.push(orGroup.id);

    // Default (no unitType) should return only anesthesia groups
    const defaultGroups = await getAdministrationGroups(TEST_HOSPITAL_ID);
    const foundInDefault = defaultGroups.find((g) => g.id === orGroupId);
    expect(foundInDefault).toBeUndefined();

    // Explicit 'anesthesia' should not return OR group
    const anesthesiaGroups = await getAdministrationGroups(TEST_HOSPITAL_ID, "anesthesia");
    const foundInAnesthesia = anesthesiaGroups.find((g) => g.id === orGroupId);
    expect(foundInAnesthesia).toBeUndefined();
  });

  it("GET with unitType=or returns only OR groups", async () => {
    const orGroups = await getAdministrationGroups(TEST_HOSPITAL_ID, "or");
    const found = orGroups.find((g) => g.id === orGroupId);
    expect(found).toBeDefined();
    expect(found!.unitType).toBe("or");
    expect(found!.name).toBe(`OR Group ${SUFFIX}`);
  });

  it("POST creates group with unitType=or", async () => {
    const group = await createAdministrationGroup({
      hospitalId: TEST_HOSPITAL_ID,
      name: `Created OR Group ${SUFFIX}`,
      unitType: "or",
    });
    createdGroupIds.push(group.id);

    expect(group.unitType).toBe("or");
    expect(group.name).toBe(`Created OR Group ${SUFFIX}`);
    expect(group.id).toBeTruthy();
  });
});

describe("OR Medications CRUD", () => {
  let record: { id: string };
  let testItem: { id: string; name: string };
  let testGroup: { id: string };

  it("upsertOrMedication creates new entry", async () => {
    record = await createTestAnesthesiaRecord();
    testItem = await createTestItem("OR-CRUD-Item", "1000");
    testGroup = await createAdministrationGroup({
      hospitalId: TEST_HOSPITAL_ID,
      name: `CRUD Group ${SUFFIX}`,
      unitType: "or",
    });
    createdGroupIds.push(testGroup.id);

    const [created] = await upsertOrMedication({
      anesthesiaRecordId: record.id,
      itemId: testItem.id,
      groupId: testGroup.id,
      quantity: "500",
      unit: "ml",
    });

    expect(created).toBeDefined();
    expect(created.anesthesiaRecordId).toBe(record.id);
    expect(created.itemId).toBe(testItem.id);
    expect(created.groupId).toBe(testGroup.id);
    expect(created.quantity).toBe("500");
    expect(created.unit).toBe("ml");
  });

  it("upsertOrMedication updates existing entry", async () => {
    const [updated] = await upsertOrMedication({
      anesthesiaRecordId: record.id,
      itemId: testItem.id,
      groupId: testGroup.id,
      quantity: "1000",
      unit: "ml",
    });

    expect(updated.quantity).toBe("1000");

    // Verify no duplicate — only one row for this combo
    const rows = await db
      .select()
      .from(orMedications)
      .where(
        and(
          eq(orMedications.anesthesiaRecordId, record.id),
          eq(orMedications.itemId, testItem.id),
          eq(orMedications.groupId, testGroup.id),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("getOrMedications returns enriched data", async () => {
    const meds = await getOrMedications(record.id);
    expect(meds.length).toBeGreaterThanOrEqual(1);

    const med = meds.find((m) => m.itemId === testItem.id);
    expect(med).toBeDefined();
    expect(med!.itemName).toBe(testItem.name);
    expect(med!.groupName).toBe(`CRUD Group ${SUFFIX}`);
    expect(med!.ampuleTotalContent).toBe("1000");
  });

  it("deleteOrMedication removes entry", async () => {
    await deleteOrMedication(record.id, testItem.id, testGroup.id);

    const meds = await getOrMedications(record.id);
    const found = meds.find((m) => m.itemId === testItem.id);
    expect(found).toBeUndefined();
  });
});

describe("OR Inventory Calculation", () => {
  let record: { id: string };
  let calcItem: { id: string };
  let calcGroup: { id: string };

  it("calculates correct units from quantity and ampuleTotalContent", async () => {
    record = await createTestAnesthesiaRecord();
    calcItem = await createTestItem("OR-Calc-Item", "1000");
    calcGroup = await createAdministrationGroup({
      hospitalId: TEST_HOSPITAL_ID,
      name: `Calc Group ${SUFFIX}`,
      unitType: "or",
    });
    createdGroupIds.push(calcGroup.id);

    await upsertOrMedication({
      anesthesiaRecordId: record.id,
      itemId: calcItem.id,
      groupId: calcGroup.id,
      quantity: "2000",
      unit: "ml",
    });

    await calculateOrInventoryUsage(record.id);

    const usage = await db
      .select()
      .from(inventoryUsage)
      .where(
        and(
          eq(inventoryUsage.anesthesiaRecordId, record.id),
          eq(inventoryUsage.itemId, calcItem.id),
        ),
      );
    expect(usage).toHaveLength(1);
    expect(usage[0].calculatedQty).toBe("2.00");
  });

  it("ceil rounds up partial units", async () => {
    const partialItem = await createTestItem("OR-Partial-Item", "20");
    const partialGroup = await createAdministrationGroup({
      hospitalId: TEST_HOSPITAL_ID,
      name: `Partial Group ${SUFFIX}`,
      unitType: "or",
    });
    createdGroupIds.push(partialGroup.id);

    const partialRecord = await createTestAnesthesiaRecord();

    await upsertOrMedication({
      anesthesiaRecordId: partialRecord.id,
      itemId: partialItem.id,
      groupId: partialGroup.id,
      quantity: "15",
      unit: "ml",
    });

    await calculateOrInventoryUsage(partialRecord.id);

    const usage = await db
      .select()
      .from(inventoryUsage)
      .where(
        and(
          eq(inventoryUsage.anesthesiaRecordId, partialRecord.id),
          eq(inventoryUsage.itemId, partialItem.id),
        ),
      );
    expect(usage).toHaveLength(1);
    // 15 / 20 = 0.75, ceil = 1
    expect(usage[0].calculatedQty).toBe("1.00");
  });

  it("zero quantity removes inventoryUsage row", async () => {
    // Delete all OR medications for the record (from the first calc test)
    await db
      .delete(orMedications)
      .where(eq(orMedications.anesthesiaRecordId, record.id));

    await calculateOrInventoryUsage(record.id);

    const usage = await db
      .select()
      .from(inventoryUsage)
      .where(
        and(
          eq(inventoryUsage.anesthesiaRecordId, record.id),
          eq(inventoryUsage.itemId, calcItem.id),
        ),
      );
    expect(usage).toHaveLength(0);
  });
});
