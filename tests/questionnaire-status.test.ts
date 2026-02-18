import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "../server/db";
import { patients, surgeries, patientQuestionnaireLinks } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { getQuestionnaireStatusBySurgeryIds } from "../server/storage/questionnaires";
import { nanoid } from "nanoid";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

// Track created IDs for cleanup
const createdPatientIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdLinkIds: string[] = [];

async function createTestPatient() {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `TEST-${nanoid(8)}`,
      surname: "TestSurname",
      firstName: "TestFirst",
      birthday: "2000-01-01",
      sex: "M",
    })
    .returning();
  createdPatientIds.push(p.id);
  return p;
}

async function createTestSurgery(patientId: string) {
  const [s] = await db
    .insert(surgeries)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId,
      plannedDate: new Date(),
      plannedSurgery: "Test Surgery",
    })
    .returning();
  createdSurgeryIds.push(s.id);
  return s;
}

async function createTestLink(overrides: Partial<typeof patientQuestionnaireLinks.$inferInsert>) {
  const [link] = await db
    .insert(patientQuestionnaireLinks)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      token: nanoid(32),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ...overrides,
    })
    .returning();
  createdLinkIds.push(link.id);
  return link;
}

afterAll(async () => {
  // Clean up in reverse FK order: links → surgeries → patients
  if (createdLinkIds.length > 0) {
    await db.delete(patientQuestionnaireLinks)
      .where(inArray(patientQuestionnaireLinks.id, createdLinkIds))
      .catch(() => {});
  }
  if (createdSurgeryIds.length > 0) {
    await db.delete(surgeries)
      .where(inArray(surgeries.id, createdSurgeryIds))
      .catch(() => {});
  }
  if (createdPatientIds.length > 0) {
    await db.delete(patients)
      .where(inArray(patients.id, createdPatientIds))
      .catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("getQuestionnaireStatusBySurgeryIds", () => {
  it("returns empty map for empty input", async () => {
    const result = await getQuestionnaireStatusBySurgeryIds([]);
    expect(result.size).toBe(0);
  });

  it("finds link by direct surgeryId match", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);
    await createTestLink({ surgeryId: surgery.id, patientId: patient.id, status: "submitted" });

    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id]);
    expect(result.get(surgery.id)).toBe("submitted");
  });

  it("picks highest-priority status when multiple links exist", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);

    await createTestLink({ surgeryId: surgery.id, patientId: patient.id, status: "pending" });
    await createTestLink({ surgeryId: surgery.id, patientId: patient.id, status: "submitted" });
    await createTestLink({ surgeryId: surgery.id, patientId: patient.id, status: "started" });

    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id]);
    expect(result.get(surgery.id)).toBe("submitted");
  });

  it("falls back to patientId when surgeryId is NULL and patient has single surgery", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);

    // Link with no surgeryId
    await createTestLink({ surgeryId: null, patientId: patient.id, status: "submitted" });

    const surgeryPatientMap = new Map([[surgery.id, patient.id]]);
    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id], surgeryPatientMap);
    expect(result.get(surgery.id)).toBe("submitted");
  });

  it("does NOT fall back when patient has multiple surgeries in the batch", async () => {
    const patient = await createTestPatient();
    const surgery1 = await createTestSurgery(patient.id);
    const surgery2 = await createTestSurgery(patient.id);

    // Link with no surgeryId
    await createTestLink({ surgeryId: null, patientId: patient.id, status: "submitted" });

    // Both surgeries belong to the same patient
    const surgeryPatientMap = new Map([
      [surgery1.id, patient.id],
      [surgery2.id, patient.id],
    ]);
    const result = await getQuestionnaireStatusBySurgeryIds(
      [surgery1.id, surgery2.id],
      surgeryPatientMap,
    );
    // Neither should get the fallback
    expect(result.has(surgery1.id)).toBe(false);
    expect(result.has(surgery2.id)).toBe(false);
  });

  it("direct match beats patientId fallback", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);

    // Direct match with surgeryId
    await createTestLink({ surgeryId: surgery.id, patientId: patient.id, status: "pending" });
    // Fallback candidate with higher status but no surgeryId
    await createTestLink({ surgeryId: null, patientId: patient.id, status: "reviewed" });

    const surgeryPatientMap = new Map([[surgery.id, patient.id]]);
    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id], surgeryPatientMap);
    // Direct match found → no fallback attempted → result is "pending"
    expect(result.get(surgery.id)).toBe("pending");
  });

  it("ignores expired links in patientId fallback", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);

    // Expired link with no surgeryId — should be ignored
    await createTestLink({ surgeryId: null, patientId: patient.id, status: "expired" });

    const surgeryPatientMap = new Map([[surgery.id, patient.id]]);
    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id], surgeryPatientMap);
    expect(result.has(surgery.id)).toBe(false);
  });

  it("returns no fallback when surgeryPatientMap is not provided", async () => {
    const patient = await createTestPatient();
    const surgery = await createTestSurgery(patient.id);

    await createTestLink({ surgeryId: null, patientId: patient.id, status: "submitted" });

    // Without the map, fallback doesn't happen
    const result = await getQuestionnaireStatusBySurgeryIds([surgery.id]);
    expect(result.has(surgery.id)).toBe(false);
  });
});
