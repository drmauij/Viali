import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db } from "../server/db";
import {
  patients,
  cases,
  surgeries,
  anesthesiaRecords,
  clinicalSnapshots,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  addVitalPoint,
  addBPPoint,
  addBulkVitals,
  getClinicalSnapshot,
} from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

let testRecordId: string;
const createdPatientIds: string[] = [];
const createdCaseIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdRecordIds: string[] = [];

beforeAll(async () => {
  const [patient] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `VITALS-TEST-${SUFFIX}`,
      surname: "VitalsTest",
      firstName: "Patient",
      birthday: "2000-01-01",
      sex: "M",
    })
    .returning();
  createdPatientIds.push(patient.id);

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
      plannedSurgery: `Vitals Test Surgery ${SUFFIX}`,
    })
    .returning();
  createdSurgeryIds.push(surgery.id);

  const [record] = await db
    .insert(anesthesiaRecords)
    .values({ surgeryId: surgery.id })
    .returning();
  createdRecordIds.push(record.id);
  testRecordId = record.id;
});

beforeEach(async () => {
  // Reset snapshot to empty before each test
  await db
    .delete(clinicalSnapshots)
    .where(eq(clinicalSnapshots.anesthesiaRecordId, testRecordId));
});

afterAll(async () => {
  for (const id of createdRecordIds) {
    await db
      .delete(clinicalSnapshots)
      .where(eq(clinicalSnapshots.anesthesiaRecordId, id))
      .catch(() => {});
    await db
      .delete(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, id))
      .catch(() => {});
  }
  for (const id of createdSurgeryIds) {
    await db.delete(surgeries).where(eq(surgeries.id, id)).catch(() => {});
  }
  for (const id of createdCaseIds) {
    await db.delete(cases).where(eq(cases.id, id)).catch(() => {});
  }
  for (const id of createdPatientIds) {
    await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("Concurrent vital writes do not lose data", () => {
  it("preserves all points when HR, SpO2 and BP are written concurrently", async () => {
    const baseTime = new Date("2026-04-16T10:00:00.000Z").getTime();

    // Five rounds of three concurrent writes (HR + SpO2 + BP at the same instant).
    // Without row-level locking, the last writer of each round overwrites the
    // others because all three read the snapshot before any has written it back.
    const ROUNDS = 5;
    for (let i = 0; i < ROUNDS; i++) {
      const ts = new Date(baseTime + i * 60_000).toISOString();
      await Promise.all([
        addVitalPoint(testRecordId, "hr", ts, 70 + i),
        addVitalPoint(testRecordId, "spo2", ts, 95 + (i % 5)),
        addBPPoint(testRecordId, ts, 120 + i, 80 + i),
      ]);
    }

    const snapshot = await getClinicalSnapshot(testRecordId);
    const data = snapshot.data as any;

    expect(data.hr ?? []).toHaveLength(ROUNDS);
    expect(data.spo2 ?? []).toHaveLength(ROUNDS);
    expect(data.bp ?? []).toHaveLength(ROUNDS);
  });
});

describe("addBulkVitals", () => {
  it("persists hr, spo2 and bp in a single call", async () => {
    const ts = new Date("2026-04-16T11:00:00.000Z").toISOString();

    const snapshot = await addBulkVitals(testRecordId, ts, {
      hr: 72,
      spo2: 98,
      bp: { sys: 120, dia: 80 },
    });

    const data = snapshot.data as any;
    expect(data.hr).toHaveLength(1);
    expect(data.hr[0].value).toBe(72);
    expect(data.spo2).toHaveLength(1);
    expect(data.spo2[0].value).toBe(98);
    expect(data.bp).toHaveLength(1);
    expect(data.bp[0].sys).toBe(120);
    expect(data.bp[0].dia).toBe(80);
    // All three points share the same timestamp
    expect(data.hr[0].timestamp).toBe(ts);
    expect(data.spo2[0].timestamp).toBe(ts);
    expect(data.bp[0].timestamp).toBe(ts);
  });

  it("ignores keys that are not present in the payload", async () => {
    const ts = new Date("2026-04-16T11:05:00.000Z").toISOString();

    const snapshot = await addBulkVitals(testRecordId, ts, { hr: 80 });

    const data = snapshot.data as any;
    expect(data.hr).toHaveLength(1);
    expect(data.spo2 ?? []).toHaveLength(0);
    expect(data.bp ?? []).toHaveLength(0);
  });

  it("appends to existing points instead of replacing them", async () => {
    const ts1 = new Date("2026-04-16T11:10:00.000Z").toISOString();
    const ts2 = new Date("2026-04-16T11:11:00.000Z").toISOString();

    await addBulkVitals(testRecordId, ts1, { hr: 60, spo2: 90 });
    const snapshot = await addBulkVitals(testRecordId, ts2, {
      hr: 65,
      bp: { sys: 110, dia: 70 },
    });

    const data = snapshot.data as any;
    expect(data.hr).toHaveLength(2);
    expect(data.spo2).toHaveLength(1);
    expect(data.bp).toHaveLength(1);
  });

  it("preserves all points when called concurrently", async () => {
    const baseTime = new Date("2026-04-16T11:20:00.000Z").getTime();
    const ROUNDS = 5;

    await Promise.all(
      Array.from({ length: ROUNDS }, (_, i) =>
        addBulkVitals(
          testRecordId,
          new Date(baseTime + i * 60_000).toISOString(),
          {
            hr: 70 + i,
            spo2: 95 + (i % 5),
            bp: { sys: 120 + i, dia: 80 + i },
          },
        ),
      ),
    );

    const snapshot = await getClinicalSnapshot(testRecordId);
    const data = snapshot.data as any;
    expect(data.hr ?? []).toHaveLength(ROUNDS);
    expect(data.spo2 ?? []).toHaveLength(ROUNDS);
    expect(data.bp ?? []).toHaveLength(ROUNDS);
  });
});

describe("BP sys/dia inversion guard", () => {
  const ts = new Date("2026-04-16T12:00:00.000Z").toISOString();

  it("addBPPoint rejects sys < dia", async () => {
    await expect(
      addBPPoint(testRecordId, ts, 80, 120),
    ).rejects.toThrow(/systolic.*diastolic/i);

    const snapshot = await getClinicalSnapshot(testRecordId);
    expect((snapshot.data as any).bp ?? []).toHaveLength(0);
  });

  it("addBPPoint accepts sys === dia", async () => {
    await addBPPoint(testRecordId, ts, 100, 100);
    const snapshot = await getClinicalSnapshot(testRecordId);
    expect((snapshot.data as any).bp).toHaveLength(1);
  });

  it("addBulkVitals rejects sys < dia", async () => {
    await expect(
      addBulkVitals(testRecordId, ts, {
        hr: 72,
        bp: { sys: 70, dia: 110 },
      }),
    ).rejects.toThrow(/systolic.*diastolic/i);

    // Whole call must abort: HR must NOT be persisted either, since the
    // bulk write should be all-or-nothing.
    const snapshot = await getClinicalSnapshot(testRecordId);
    const data = snapshot.data as any;
    expect(data.bp ?? []).toHaveLength(0);
    expect(data.hr ?? []).toHaveLength(0);
  });
});
