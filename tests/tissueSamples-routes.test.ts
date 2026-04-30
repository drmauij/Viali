import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  tissueSamples,
  tissueSampleStatusHistory,
  hospitals,
  patients,
  users,
  surgeries,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

// Bypass Google auth — tests inject req.user via the harness app.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

// Bypass write/access checks; the storage layer is responsible for
// invariants we care about here. Group-aware access is exercised in
// tests/access-control-groups.test.ts and tests/patient-detail-audit.test.ts.
// `mockHasAccess` defaults to true; flip per-call with .mockResolvedValueOnce(false)
// to exercise the cross-hospital denial path.
const mockHasAccess = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../server/utils", () => ({
  requireWriteAccess: (_req: any, _res: any, next: any) => next(),
  requireStrictHospitalAccess: (_req: any, _res: any, next: any) => next(),
  requireResourceAdmin: () => (_req: any, _res: any, next: any) => next(),
  userHasGroupAwareHospitalAccess: mockHasAccess,
}));

// Import the router AFTER the mocks so it picks up the bypassed middleware.
import tissueSamplesRouter from "../server/routes/anesthesia/tissueSamples";
import adminRouter from "../server/routes/admin";
import { storage } from "../server/storage";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
let testPatientId: string;
let testUserId: string;
let testSurgeryId: string;
let originalPrefix: string | null = null;
const createdSampleIds: string[] = [];
// Tracked separately from createdSampleIds so cleanup deletes them in the
// right order (samples → surgeries → patients) without violating FKs.
const otherSurgeryIds: string[] = [];
const otherPatientIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: testUserId ?? "test-user-id" };
    next();
  });
  app.use(tissueSamplesRouter);
  return app;
}

beforeAll(async () => {
  // Capture the existing prefix so afterAll can restore it. Tests below
  // mutate this column; we don't want to leak "TST" into the dev database.
  const [original] = await db
    .select({ p: hospitals.sampleCodePrefix })
    .from(hospitals)
    .where(eq(hospitals.id, TEST_HOSPITAL_ID));
  originalPrefix = original?.p ?? null;

  // Ensure the test hospital has a sample_code_prefix for the happy path.
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

  // Find a surgery that already belongs to `testPatientId` so the PATCH
  // mismatch guard accepts it. Fall back to creating one inline (and tracking
  // it for cleanup) if the seed DB doesn't have one.
  const [existing] = await db
    .select()
    .from(surgeries)
    .where(eq(surgeries.patientId, testPatientId))
    .limit(1);
  if (existing) {
    testSurgeryId = existing.id;
  } else {
    const [created] = await db
      .insert(surgeries)
      .values({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: testPatientId,
        plannedDate: new Date(),
      } as any)
      .returning();
    testSurgeryId = created.id;
    otherSurgeryIds.push(created.id);
  }
});

afterAll(async () => {
  if (createdSampleIds.length) {
    // History rows cascade via FK; explicit delete is defensive.
    await db
      .delete(tissueSampleStatusHistory)
      .where(inArray(tissueSampleStatusHistory.sampleId, createdSampleIds))
      .catch(() => {});
    await db
      .delete(tissueSamples)
      .where(inArray(tissueSamples.id, createdSampleIds));
  }
  // Tear down inline-created surgeries and patients in FK order.
  if (otherSurgeryIds.length) {
    await db
      .delete(surgeries)
      .where(inArray(surgeries.id, otherSurgeryIds))
      .catch(() => {});
  }
  if (otherPatientIds.length) {
    await db
      .delete(patients)
      .where(inArray(patients.id, otherPatientIds))
      .catch(() => {});
  }
  // Restore prefix unconditionally (covers both "was null" and "had a value").
  await db
    .update(hospitals)
    .set({ sampleCodePrefix: originalPrefix })
    .where(eq(hospitals.id, TEST_HOSPITAL_ID));
  await pool.end();
});

describe("POST /api/patients/:patientId/tissue-samples", () => {
  it("creates a sample, mints a code matching ^TST-FAT-\\d{8}-\\d{3}$, returns 201", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({
        sampleType: "fat",
        notes: "test extraction",
        extractionSurgeryId: testSurgeryId,
      });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^TST-FAT-\d{8}-\d{3}$/);
    expect(res.body.status).toBe("Probe entnommen");
    createdSampleIds.push(res.body.id);
  });

  it("returns 422 MISSING_SAMPLE_CODE_PREFIX when hospital has no prefix", async () => {
    await db
      .update(hospitals)
      .set({ sampleCodePrefix: null })
      .where(eq(hospitals.id, TEST_HOSPITAL_ID));
    try {
      const app = buildApp();
      const res = await request(app)
        .post(`/api/patients/${testPatientId}/tissue-samples`)
        .send({ sampleType: "fat", notes: null });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("MISSING_SAMPLE_CODE_PREFIX");
    } finally {
      // Restore for subsequent tests
      await db
        .update(hospitals)
        .set({ sampleCodePrefix: "TST" })
        .where(eq(hospitals.id, TEST_HOSPITAL_ID));
    }
  });

  it("returns 422 UNKNOWN_SAMPLE_TYPE for an unknown sample_type", async () => {
    const app = buildApp();
    const res = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "no_such_type", notes: null });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("UNKNOWN_SAMPLE_TYPE");
  });

  // Phase A enabled all 14 types, so the TYPE_NOT_ENABLED branch can no
  // longer be exercised through the public type list. The route still
  // returns the same error code if a type ever flips enabledInUI=false
  // again; this test is parked rather than deleted to make that intent
  // explicit.
  it.skip("returns 422 TYPE_NOT_ENABLED for a type with enabledInUI=false", async () => {
    // Intentionally skipped — see comment above.
  });
});

describe("POST /api/tissue-samples/:id/status", () => {
  it("transitions to a valid status and writes a history row", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app)
      .post(`/api/tissue-samples/${create.body.id}/status`)
      .send({ toStatus: "Versendet", note: "courier" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Versendet");

    const history = await db
      .select()
      .from(tissueSampleStatusHistory)
      .where(eq(tissueSampleStatusHistory.sampleId, create.body.id));
    expect(history.length).toBe(2); // initial + transition
  });

  it("returns 422 INVALID_STATUS for an invalid status for the type", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app)
      .post(`/api/tissue-samples/${create.body.id}/status`)
      .send({ toStatus: "Not a real status" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("INVALID_STATUS");
  });
});

describe("GET /api/patients/:patientId/tissue-samples", () => {
  it("returns an array of samples for the patient", async () => {
    const app = buildApp();
    const res = await request(app).get(
      `/api/patients/${testPatientId}/tissue-samples`,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/tissue-samples/:id", () => {
  it("returns { sample, history } with at least one history row", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app).get(`/api/tissue-samples/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.sample.id).toBe(create.body.id);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/surgeries/:surgeryId/tissue-samples", () => {
  it("returns samples linked via extraction_surgery_id", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({
        sampleType: "fat",
        notes: null,
        extractionSurgeryId: testSurgeryId,
      });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app).get(
      `/api/surgeries/${testSurgeryId}/tissue-samples`,
    );
    expect(res.status).toBe(200);
    expect(res.body.some((s: any) => s.id === create.body.id)).toBe(true);
  });
});

describe("PATCH /api/tissue-samples/:id", () => {
  it("updates notes", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: "before" });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app)
      .patch(`/api/tissue-samples/${create.body.id}`)
      .send({ notes: "after" });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("after");
  });

  it("links extractionSurgeryId when surgery belongs to the same patient", async () => {
    const app = buildApp();
    // Pre-create a sample with NO extraction surgery (the OR-nurse pre-create
    // workflow), then PATCH to link it.
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);
    expect(create.body.extractionSurgeryId).toBeNull();

    const res = await request(app)
      .patch(`/api/tissue-samples/${create.body.id}`)
      .send({ extractionSurgeryId: testSurgeryId });
    expect(res.status).toBe(200);
    expect(res.body.extractionSurgeryId).toBe(testSurgeryId);
  });

  it("unlinks extractionSurgeryId when set to null", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({
        sampleType: "fat",
        notes: null,
        extractionSurgeryId: testSurgeryId,
      });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);
    expect(create.body.extractionSurgeryId).toBe(testSurgeryId);

    const res = await request(app)
      .patch(`/api/tissue-samples/${create.body.id}`)
      .send({ extractionSurgeryId: null });
    expect(res.status).toBe(200);
    expect(res.body.extractionSurgeryId).toBeNull();
  });

  it("returns 422 EXTRACTION_SURGERY_PATIENT_MISMATCH when target surgery is for a different patient", async () => {
    // We need a second patient + a surgery for them. Create both inline so
    // the test is hermetic regardless of seed-DB shape, then clean up in
    // afterAll via the local id-tracking arrays.
    const [otherPatient] = await db
      .insert(patients)
      .values({
        hospitalId: TEST_HOSPITAL_ID,
        patientNumber: `MISMATCH-${Date.now()}`,
        surname: "Mismatch",
        firstName: "Test",
        birthday: "1990-01-01",
        sex: "O",
      } as any)
      .returning();
    otherPatientIds.push(otherPatient.id);

    // Surgery for the OTHER patient — using the same hospital; the route's
    // mismatch guard compares patientId, not hospitalId.
    const [otherSurgery] = await db
      .insert(surgeries)
      .values({
        hospitalId: TEST_HOSPITAL_ID,
        patientId: otherPatient.id,
        plannedDate: new Date(),
      } as any)
      .returning();
    otherSurgeryIds.push(otherSurgery.id);

    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app)
      .patch(`/api/tissue-samples/${create.body.id}`)
      .send({ extractionSurgeryId: otherSurgery.id });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("EXTRACTION_SURGERY_PATIENT_MISMATCH");
  });

  it("returns 404 EXTRACTION_SURGERY_NOT_FOUND when target surgery does not exist", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    const res = await request(app)
      .patch(`/api/tissue-samples/${create.body.id}`)
      .send({ extractionSurgeryId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("EXTRACTION_SURGERY_NOT_FOUND");
  });
});

describe("PATCH hospital sample_code_prefix lock", () => {
  function buildAdminApp() {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      req.user = { id: testUserId ?? "test-user-id" };
      next();
    });
    app.use(adminRouter);
    return app;
  }

  it("returns 422 PREFIX_LOCKED when changing prefix after a sample exists", async () => {
    // Stub admin role check so the PATCH route's isAdmin middleware passes.
    const spy = vi
      .spyOn(storage, "getUserHospitals")
      .mockResolvedValue([
        { id: TEST_HOSPITAL_ID, role: "admin" } as any,
      ]);

    try {
      // Ensure prefix is set to a known value (also covered by beforeAll).
      await db
        .update(hospitals)
        .set({ sampleCodePrefix: "TST" })
        .where(eq(hospitals.id, TEST_HOSPITAL_ID));

      const tissueApp = buildApp();
      const create = await request(tissueApp)
        .post(`/api/patients/${testPatientId}/tissue-samples`)
        .send({ sampleType: "fat", notes: null });
      expect(create.status).toBe(201);
      createdSampleIds.push(create.body.id);

      // Then attempt to change the prefix on the admin route.
      const adminApp = buildAdminApp();
      const res = await request(adminApp)
        .patch(`/api/admin/${TEST_HOSPITAL_ID}`)
        .send({ sampleCodePrefix: "XXX" });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("PREFIX_LOCKED");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("cross-hospital access denial", () => {
  it("returns 403 RESOURCE_ACCESS_DENIED when user has no access to the sample's hospital", async () => {
    const app = buildApp();
    const create = await request(app)
      .post(`/api/patients/${testPatientId}/tissue-samples`)
      .send({ sampleType: "fat", notes: null });
    expect(create.status).toBe(201);
    createdSampleIds.push(create.body.id);

    // Flip the hospital-access mock to false for the next call only.
    mockHasAccess.mockResolvedValueOnce(false);
    const res = await request(app).get(`/api/tissue-samples/${create.body.id}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("RESOURCE_ACCESS_DENIED");
  });
});
