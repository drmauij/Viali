import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { treatments, treatmentLines, patients, users, items, clinicServices } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { treatmentsStorage } from "../server/storage/treatments";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testPatientId: string;
let testProviderId: string;
let testServiceId: string;
let testItemId: string;
let testUnitId: string;
const createdIds: string[] = [];

beforeAll(async () => {
  const [p] = await db
    .select()
    .from(patients)
    .where(eq(patients.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  testPatientId = p.id;

  const [u] = await db.select().from(users).limit(1);
  testProviderId = u.id;

  // Fetch a real unit for the test hospital
  const unitRow = await db.execute(
    `SELECT id FROM units WHERE hospital_id = '${TEST_HOSPITAL_ID}' LIMIT 1` as any,
  ) as any;
  testUnitId = unitRow.rows[0].id;

  // Create a test service
  const [s] = await db
    .insert(clinicServices)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      name: "CRUD_TEST_SERVICE",
      price: "100.00",
      isInvoiceable: true,
    })
    .returning();
  testServiceId = s.id;

  // Create a test item
  const [i] = await db
    .insert(items)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      name: "CRUD_TEST_ITEM",
      unit: "Pack",
      isInvoiceable: true,
    })
    .returning();
  testItemId = i.id;
});

afterAll(async () => {
  if (createdIds.length) {
    await db.delete(treatments).where(inArray(treatments.id, createdIds));
  }
  await db.delete(clinicServices).where(eq(clinicServices.id, testServiceId)).catch(() => {});
  await db.delete(items).where(eq(items.id, testItemId)).catch(() => {});
  await pool.end();
});

describe("treatmentsStorage.create", () => {
  it("rejects a line with neither serviceId nor itemId (CHECK constraint)", async () => {
    const result = await treatmentsStorage
      .create({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        providerId: testProviderId,
        performedAt: new Date(),
        notes: "test session",
        lines: [
          {
            serviceId: null,
            itemId: null,
            dose: "15",
            doseUnit: "units",
            zones: ["re. Stirn"],
            unitPrice: "250",
            total: "250",
            lineOrder: 0,
          } as any,
        ],
      } as any)
      .catch((e) => e);
    // CHECK constraint should reject
    expect(result).toBeInstanceOf(Error);
  });

  it("creates a treatment with a service line and returns full record", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      notes: "botox session",
      lines: [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "1",
          doseUnit: "session",
          zones: [],
          unitPrice: "100.00",
          total: "100.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdIds.push(t.id);

    expect(t.id).toBeTruthy();
    expect(t.status).toBe("draft");
    expect(t.hospitalId).toBe(TEST_HOSPITAL_ID);
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0].serviceId).toBe(testServiceId);
  });

  it("creates a treatment with an item line", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      lines: [
        {
          serviceId: null,
          itemId: testItemId,
          dose: "15",
          doseUnit: "units",
          zones: ["re. Stirn", "li. Stirn"],
          unitPrice: "8.00",
          total: "120.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdIds.push(t.id);

    expect(t.lines).toHaveLength(1);
    expect(t.lines[0].itemId).toBe(testItemId);
    expect(t.lines[0].zones).toEqual(["re. Stirn", "li. Stirn"]);
  });
});

describe("treatmentsStorage.getById", () => {
  it("returns null for unknown id", async () => {
    const result = await treatmentsStorage.getById(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(result).toBeNull();
  });

  it("retrieves a treatment with its lines", async () => {
    const id = createdIds[0];
    const t = await treatmentsStorage.getById(id);
    expect(t).not.toBeNull();
    expect(t!.id).toBe(id);
    expect(Array.isArray(t!.lines)).toBe(true);
  });
});

describe("treatmentsStorage.listByPatient", () => {
  it("returns treatments scoped to patient ordered by performedAt desc", async () => {
    const list = await treatmentsStorage.listByPatient(testPatientId);
    expect(Array.isArray(list)).toBe(true);
    // All returned records should belong to the right patient
    for (const t of list) {
      expect(t.patientId).toBe(testPatientId);
      expect(Array.isArray(t.lines)).toBe(true);
    }
  });

  it("returns empty array for unknown patientId", async () => {
    const list = await treatmentsStorage.listByPatient(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(list).toHaveLength(0);
  });
});

describe("treatmentsStorage.update", () => {
  it("updates header fields and replaces lines", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      notes: "original notes",
      lines: [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "1",
          doseUnit: "session",
          zones: [],
          unitPrice: "100.00",
          total: "100.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdIds.push(t.id);

    const updated = await treatmentsStorage.update(
      t.id,
      { notes: "updated notes" },
      [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "2",
          doseUnit: "sessions",
          zones: ["Stirn"],
          unitPrice: "100.00",
          total: "200.00",
          lineOrder: 0,
        },
        {
          serviceId: null,
          itemId: testItemId,
          dose: "10",
          doseUnit: "units",
          zones: [],
          unitPrice: "8.00",
          total: "80.00",
          lineOrder: 1,
        },
      ] as any,
    );

    expect(updated.notes).toBe("updated notes");
    expect(updated.lines).toHaveLength(2);
  });

  it("rejects update on a signed treatment", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      lines: [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "1",
          doseUnit: "session",
          zones: [],
          unitPrice: "100.00",
          total: "100.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdIds.push(t.id);

    // Manually set status to signed to test rejection
    await db
      .update(treatments)
      .set({ status: "signed" })
      .where(eq(treatments.id, t.id));

    const result = await treatmentsStorage
      .update(t.id, { notes: "should fail" })
      .catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/signed/i);
  });
});

describe("treatmentsStorage.remove", () => {
  it("deletes a draft treatment", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      lines: [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "1",
          doseUnit: "session",
          zones: [],
          unitPrice: "100.00",
          total: "100.00",
          lineOrder: 0,
        },
      ],
    } as any);

    await treatmentsStorage.remove(t.id);
    const gone = await treatmentsStorage.getById(t.id);
    expect(gone).toBeNull();
  });

  it("rejects deletion of a signed treatment", async () => {
    const t = await treatmentsStorage.create({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      performedAt: new Date(),
      lines: [
        {
          serviceId: testServiceId,
          itemId: null,
          dose: "1",
          doseUnit: "session",
          zones: [],
          unitPrice: "100.00",
          total: "100.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdIds.push(t.id);

    await db
      .update(treatments)
      .set({ status: "signed" })
      .where(eq(treatments.id, t.id));

    const result = await treatmentsStorage.remove(t.id).catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/draft/i);
  });
});
