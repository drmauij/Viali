import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  tissueSamples,
  tissueSampleStatusHistory,
  patients,
  users,
  hospitals,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  createTissueSample,
  updateTissueSample,
  transitionTissueSampleStatus,
  getTissueSamplesByPatient,
  getTissueSampleWithHistory,
} from "../server/storage/tissueSamples";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testPatientId: string;
let testUserId: string;
let originalPrefix: string | null = null;
const createdSampleIds: string[] = [];

beforeAll(async () => {
  // Capture the existing prefix so afterAll can restore it. We don't want
  // tests to leak "TST" into the dev database.
  const [original] = await db
    .select({ p: hospitals.sampleCodePrefix })
    .from(hospitals)
    .where(eq(hospitals.id, TEST_HOSPITAL_ID));
  originalPrefix = original?.p ?? null;

  // Ensure the test hospital has a sample_code_prefix.
  await db
    .update(hospitals)
    .set({ sampleCodePrefix: "TST" })
    .where(eq(hospitals.id, TEST_HOSPITAL_ID));

  const [p] = await db
    .select()
    .from(patients)
    .where(eq(patients.hospitalId, TEST_HOSPITAL_ID))
    .limit(1);
  testPatientId = p.id;

  const [u] = await db.select().from(users).limit(1);
  testUserId = u.id;
});

afterAll(async () => {
  if (createdSampleIds.length) {
    // History rows cascade via FK; explicit delete is defensive for the
    // synthetic histology row that doesn't go through createTissueSample.
    await db
      .delete(tissueSampleStatusHistory)
      .where(inArray(tissueSampleStatusHistory.sampleId, createdSampleIds))
      .catch(() => {});
    await db
      .delete(tissueSamples)
      .where(inArray(tissueSamples.id, createdSampleIds));
  }
  // Restore prefix unconditionally (covers both "was null" and "had a value").
  await db
    .update(hospitals)
    .set({ sampleCodePrefix: originalPrefix })
    .where(eq(hospitals.id, TEST_HOSPITAL_ID));
  await pool.end();
});

describe("createTissueSample", () => {
  it("mints a code, sets initialStatus from config, and writes initial history row", async () => {
    const sample = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: "test extraction",
      createdBy: testUserId,
    });
    createdSampleIds.push(sample.id);

    expect(sample.code).toMatch(/^TST-FAT-\d{8}-\d{3}$/);
    expect(sample.status).toBe("Probe entnommen");
    expect(sample.statusDate).toBeInstanceOf(Date);

    const history = await db
      .select()
      .from(tissueSampleStatusHistory)
      .where(eq(tissueSampleStatusHistory.sampleId, sample.id));
    expect(history).toHaveLength(1);
    expect(history[0].fromStatus).toBeNull();
    expect(history[0].toStatus).toBe("Probe entnommen");
    expect(history[0].changedBy).toBe(testUserId);
  });

  it("throws on unknown sample_type", async () => {
    await expect(
      createTissueSample({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        sampleType: "no_such_type",
        notes: null,
        createdBy: testUserId,
      }),
    ).rejects.toThrow(/Unknown tissue sample type/);
  });
});

describe("transitionTissueSampleStatus", () => {
  it("updates status + status_date AND writes a history row, atomically", async () => {
    const sample = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: null,
      createdBy: testUserId,
    });
    createdSampleIds.push(sample.id);
    const beforeDate = sample.statusDate;

    // Tick the clock at least 1ms forward
    await new Promise((r) => setTimeout(r, 5));

    const updated = await transitionTissueSampleStatus({
      sampleId: sample.id,
      toStatus: "Versendet an SSCB",
      changedBy: testUserId,
      note: "to courier",
    });

    expect(updated.status).toBe("Versendet an SSCB");
    expect(updated.statusDate.getTime()).toBeGreaterThan(beforeDate.getTime());

    const history = await db
      .select()
      .from(tissueSampleStatusHistory)
      .where(eq(tissueSampleStatusHistory.sampleId, sample.id))
      .orderBy(tissueSampleStatusHistory.changedAt);
    expect(history).toHaveLength(2);
    expect(history[1].fromStatus).toBe("Probe entnommen");
    expect(history[1].toStatus).toBe("Versendet an SSCB");
    expect(history[1].note).toBe("to courier");
  });

  it("rejects an invalid status for the sample's type", async () => {
    const sample = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: null,
      createdBy: testUserId,
    });
    createdSampleIds.push(sample.id);
    await expect(
      transitionTissueSampleStatus({
        sampleId: sample.id,
        toStatus: "Not a real status",
        changedBy: testUserId,
      }),
    ).rejects.toThrow(/invalid status/i);
  });
});

describe("updateTissueSample", () => {
  it("rejects setting reimplant_surgery_id on a type that does not support reimplant", async () => {
    // We can't create a histology sample through createTissueSample (the
    // public API blocks enabledInUI=false earlier in the route, and even at
    // storage layer histology has no initialStatus). Insert directly to
    // exercise the supportsReimplant=false branch in updateTissueSample.
    const code = `TST-HIST-99999999-${Math.floor(Math.random() * 900 + 100)}`;
    const [row] = await db
      .insert(tissueSamples)
      .values({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        sampleType: "histology",
        code,
        status: "Probe entnommen",
        statusDate: new Date(),
        notes: null,
        createdBy: testUserId,
      })
      .returning();
    createdSampleIds.push(row.id);

    // The supportsReimplant guard throws BEFORE the UPDATE runs, so the FK
    // for reimplantSurgeryId is never enforced here — any UUID works.
    await expect(
      updateTissueSample(row.id, {
        reimplantSurgeryId: "00000000-0000-0000-0000-000000000000",
      }),
    ).rejects.toMatchObject({ code: "REIMPLANT_NOT_SUPPORTED" });
  });

  it("updates notes for a fat sample (positive case)", async () => {
    const sample = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: null,
      createdBy: testUserId,
    });
    createdSampleIds.push(sample.id);
    const updated = await updateTissueSample(sample.id, { notes: "edited" });
    expect(updated.notes).toBe("edited");
  });
});

describe("getTissueSamplesByPatient", () => {
  it("returns samples for the patient ordered by createdAt desc", async () => {
    const a = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: "first",
      createdBy: testUserId,
    });
    const b = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: "second",
      createdBy: testUserId,
    });
    createdSampleIds.push(a.id, b.id);

    const list = await getTissueSamplesByPatient(testPatientId);
    expect(list.length).toBeGreaterThanOrEqual(2);
    const ids = list.map((s) => s.id);
    const idxA = ids.indexOf(a.id);
    const idxB = ids.indexOf(b.id);
    expect(idxB).toBeLessThan(idxA); // b was created after a → newer first
  });
});

describe("getTissueSampleWithHistory", () => {
  it("returns the sample and its history rows in chronological order", async () => {
    const sample = await createTissueSample({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      sampleType: "fat",
      notes: null,
      createdBy: testUserId,
    });
    createdSampleIds.push(sample.id);
    await transitionTissueSampleStatus({
      sampleId: sample.id,
      toStatus: "Versendet an SSCB",
      changedBy: testUserId,
    });
    const result = await getTissueSampleWithHistory(sample.id);
    expect(result).not.toBeNull();
    expect(result!.sample.status).toBe("Versendet an SSCB");
    expect(result!.history).toHaveLength(2);
    expect(result!.history[0].toStatus).toBe("Probe entnommen");
    expect(result!.history[1].toStatus).toBe("Versendet an SSCB");
  });
});
