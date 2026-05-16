import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  patients,
  patientHospitals,
  referralEvents,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import { getReferralDailyBySource } from "../server/lib/referralAnalytics";

const uniq = () => randomUUID().slice(0, 8);

let hospId: string;
let patId: string;

const createdHospitalIds: string[] = [];
const createdPatientIds: string[] = [];
const createdReferralIds: string[] = [];

async function mkReferral(hospitalId: string, patientId: string, source: string, createdAt: Date) {
  const [r] = await db
    .insert(referralEvents)
    .values({
      hospitalId,
      patientId,
      source: source as any,
      captureMethod: "manual",
      createdAt,
    } as any)
    .returning();
  createdReferralIds.push(r.id);
  return r.id;
}

beforeAll(async () => {
  const [h] = await db
    .insert(hospitals)
    .values({ name: `RDS-${uniq()}`, timezone: "Europe/Zurich" } as any)
    .returning();
  hospId = h.id;
  createdHospitalIds.push(hospId);

  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: hospId,
      patientNumber: `RDS-${uniq()}`,
      surname: "Test",
      firstName: "Patient",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
    } as any)
    .returning();
  patId = p.id;
  createdPatientIds.push(patId);
  await ensurePatientHospitalLink(patId, hospId, null);
});

beforeEach(async () => {
  // Wipe any referrals between tests so each test starts clean
  if (createdReferralIds.length) {
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
    createdReferralIds.length = 0;
  }
});

afterAll(async () => {
  if (createdReferralIds.length)
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
  await db.delete(patientHospitals).where(inArray(patientHospitals.patientId, createdPatientIds));
  await db.delete(patients).where(inArray(patients.id, createdPatientIds));
  await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds));
  await pool.end();
});

describe("getReferralDailyBySource", () => {
  it("returns a gap-free row for every calendar day in [from, to], padding empty days with total=0", async () => {
    // Insert events on day 1 and day 3 of a 5-day window; day 2, 4, 5 should be zero rows.
    await mkReferral(hospId, patId, "social", new Date("2026-05-01T10:00:00Z"));
    await mkReferral(hospId, patId, "search_engine", new Date("2026-05-03T10:00:00Z"));

    const result = await getReferralDailyBySource([hospId], {
      from: "2026-05-01",
      to: "2026-05-05",
    });

    expect(result.rows).toHaveLength(5);
    expect(result.rows.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
    ]);
    expect(result.rows[0]!.total).toBe(1);
    expect(result.rows[0]!.bySource.social).toBe(1);
    expect(result.rows[1]!.total).toBe(0);
    expect(result.rows[1]!.bySource).toEqual({});
    expect(result.rows[2]!.bySource.search_engine).toBe(1);
    expect(result.rows[4]!.total).toBe(0);
  });
});
