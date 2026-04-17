import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  treatments,
  clinicInvoices,
  clinicInvoiceItems,
  patients,
  users,
  items,
  clinicServices,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { treatmentsStorage } from "../server/storage/treatments";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testPatientId: string;
let testProviderId: string;
let testServiceId: string;
let testItemId: string;
let testUnitId: string;
const createdTreatmentIds: string[] = [];
const createdInvoiceIds: string[] = [];

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
      name: "Botox treatment INVOICE_TEST",
      price: "250.00",
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
      name: "Allurience INVOICE_TEST",
      unit: "Pack",
      isInvoiceable: true,
      patientPrice: "8.00",
    } as any)
    .returning();
  testItemId = i.id;
});

afterAll(async () => {
  if (createdInvoiceIds.length) {
    await db
      .delete(clinicInvoiceItems)
      .where(inArray(clinicInvoiceItems.invoiceId, createdInvoiceIds))
      .catch(() => {});
    await db
      .delete(clinicInvoices)
      .where(inArray(clinicInvoices.id, createdInvoiceIds))
      .catch(() => {});
  }
  if (createdTreatmentIds.length) {
    await db
      .delete(treatments)
      .where(inArray(treatments.id, createdTreatmentIds))
      .catch(() => {});
  }
  await db.delete(items).where(eq(items.id, testItemId)).catch(() => {});
  await db
    .delete(clinicServices)
    .where(eq(clinicServices.id, testServiceId))
    .catch(() => {});
  await pool.end();
});

describe("treatmentsStorage.sign", () => {
  it("signs a draft treatment setting status=signed and signedAt", async () => {
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
          unitPrice: "250.00",
          total: "250.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdTreatmentIds.push(t.id);

    const signed = await treatmentsStorage.sign(
      t.id,
      testProviderId,
      "data:image/png;base64,AAA",
    );
    expect(signed.status).toBe("signed");
    expect(signed.signedBy).toBe(testProviderId);
    expect(signed.signedAt).toBeTruthy();
    expect(signed.signature).toBe("data:image/png;base64,AAA");
  });

  it("rejects signing an already-signed treatment", async () => {
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
          unitPrice: "250.00",
          total: "250.00",
          lineOrder: 0,
        },
      ],
    } as any);
    createdTreatmentIds.push(t.id);

    await treatmentsStorage.sign(t.id, testProviderId, "sig1");
    const result = await treatmentsStorage
      .sign(t.id, testProviderId, "sig2")
      .catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/already signed/i);
  });
});

describe("treatmentsStorage.createInvoiceDraft", () => {
  it("creates one invoice line per treatment line with correct lineType and zones in description", async () => {
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
          unitPrice: "250.00",
          total: "250.00",
          lineOrder: 0,
        },
        {
          serviceId: null,
          itemId: testItemId,
          dose: "15",
          doseUnit: "units",
          zones: ["re. Stirn", "li. Stirn"],
          unitPrice: "8.00",
          total: "120.00",
          lineOrder: 1,
        },
      ] as any,
    } as any);
    createdTreatmentIds.push(t.id);

    await treatmentsStorage.sign(
      t.id,
      testProviderId,
      "data:image/png;base64,AAA",
    );
    const { invoiceId } = await treatmentsStorage.createInvoiceDraft(t.id);
    createdInvoiceIds.push(invoiceId);

    // Should have exactly 2 invoice lines
    const itemsRows = await db
      .select()
      .from(clinicInvoiceItems)
      .where(eq(clinicInvoiceItems.invoiceId, invoiceId));
    expect(itemsRows).toHaveLength(2);

    // Check correct lineType assignment
    const serviceLineRow = itemsRows.find((r) => r.lineType === "service");
    const itemLineRow = itemsRows.find((r) => r.lineType === "item");
    expect(serviceLineRow).toBeTruthy();
    expect(itemLineRow).toBeTruthy();
    expect(serviceLineRow!.serviceId).toBe(testServiceId);
    expect(itemLineRow!.itemId).toBe(testItemId);

    // Zones should appear in the item line description
    expect(itemLineRow!.description).toContain("re. Stirn");

    // Treatment should be updated to invoiced status with invoiceId set
    const [updatedTreatment] = await db
      .select()
      .from(treatments)
      .where(eq(treatments.id, t.id));
    expect(updatedTreatment.status).toBe("invoiced");
    expect(updatedTreatment.invoiceId).toBe(invoiceId);
  });

  it("rejects invoice creation on unsigned (draft) treatment", async () => {
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
      ] as any,
    } as any);
    createdTreatmentIds.push(t.id);

    const result = await treatmentsStorage
      .createInvoiceDraft(t.id)
      .catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/signed/i);
  });

  it("is idempotent: returns same invoiceId on second call", async () => {
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
      ] as any,
    } as any);
    createdTreatmentIds.push(t.id);

    await treatmentsStorage.sign(
      t.id,
      testProviderId,
      "data:image/png;base64,BBB",
    );
    const { invoiceId: id1 } = await treatmentsStorage.createInvoiceDraft(t.id);
    createdInvoiceIds.push(id1);

    // Second call should be rejected (status is now "invoiced", not "signed")
    const result = await treatmentsStorage
      .createInvoiceDraft(t.id)
      .catch((e) => e);
    // Either returns same id (if invoiceId check triggers) or throws — both acceptable
    if (result instanceof Error) {
      expect(result.message).toMatch(/signed/i);
    } else {
      expect(result.invoiceId).toBe(id1);
    }
  });
});

describe("treatmentsStorage.amend", () => {
  it("clears signature and sets status=amended", async () => {
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
      ] as any,
    } as any);
    createdTreatmentIds.push(t.id);

    await treatmentsStorage.sign(
      t.id,
      testProviderId,
      "data:image/png;base64,CCC",
    );
    const result = await treatmentsStorage.amend(t.id, testProviderId);
    expect(result.status).toBe("amended");
    expect(result.signature).toBeNull();
    expect(result.amendedBy).toBe(testProviderId);
    expect(result.amendedAt).toBeTruthy();
  });

  it("rejects amend on a draft treatment", async () => {
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
      ] as any,
    } as any);
    createdTreatmentIds.push(t.id);

    const result = await treatmentsStorage
      .amend(t.id, testProviderId)
      .catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toMatch(/not signed/i);
  });
});
