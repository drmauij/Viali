import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "../server/db";
import { patients, cases, surgeries } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { backfillRiskGrade } from "../scripts/backfill-risk-grade";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const SUFFIX = nanoid(8);

const createdPatientIds: string[] = [];
const createdCaseIds: string[] = [];
const createdSurgeryIds: string[] = [];

async function createTestSurgery(): Promise<string> {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `RISK-BACKFILL-${SUFFIX}-${nanoid(4)}`,
      surname: "RiskBackfillTest",
      firstName: "Patient",
      birthday: "1980-01-01",
      sex: "F",
    })
    .returning();
  createdPatientIds.push(p.id);

  const [c] = await db
    .insert(cases)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: p.id,
      admissionDate: new Date(),
    })
    .returning();
  createdCaseIds.push(c.id);

  const future = new Date();
  future.setDate(future.getDate() + 7);

  const [s] = await db
    .insert(surgeries)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: p.id,
      caseId: c.id,
      plannedDate: future,
      plannedSurgery: "Risk backfill test",
      surgeryRiskClass: "standard",
      stayType: "overnight",
    })
    .returning();
  createdSurgeryIds.push(s.id);
  return s.id;
}

let createdSurgeryId: string;

beforeAll(async () => {
  createdSurgeryId = await createTestSurgery();
});

afterAll(async () => {
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

describe("backfillRiskGrade", () => {
  it("is idempotent — second run reports zero updates for the same data", async () => {
    const stats1 = await backfillRiskGrade();
    expect(stats1.scanned).toBeGreaterThan(0);

    // First run should have populated our newly-created surgery
    const [s1] = await db.select().from(surgeries).where(eq(surgeries.id, createdSurgeryId));
    expect(s1.riskGrade).toBeTruthy();
    expect(s1.perioperativeRisk).toBeTruthy();

    const stats2 = await backfillRiskGrade();
    expect(stats2.scanned).toBe(stats1.scanned);
    expect(stats2.updated).toBe(0);
  });
});
