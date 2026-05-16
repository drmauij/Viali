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

  it("buckets counts by source within each day", async () => {
    const day = new Date("2026-05-10T10:00:00Z");
    await mkReferral(hospId, patId, "social", day);
    await mkReferral(hospId, patId, "social", day);
    await mkReferral(hospId, patId, "search_engine", day);

    const result = await getReferralDailyBySource([hospId], {
      from: "2026-05-10",
      to: "2026-05-10",
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.total).toBe(3);
    expect(result.rows[0]!.bySource).toEqual({ social: 2, search_engine: 1 });
  });

  it("sorts the sources array by descending total across the range", async () => {
    await mkReferral(hospId, patId, "social", new Date("2026-05-11T10:00:00Z"));
    await mkReferral(hospId, patId, "social", new Date("2026-05-12T10:00:00Z"));
    await mkReferral(hospId, patId, "search_engine", new Date("2026-05-11T10:00:00Z"));
    await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T10:00:00Z"));
    await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T11:00:00Z"));
    await mkReferral(hospId, patId, "marketing", new Date("2026-05-12T12:00:00Z"));

    const result = await getReferralDailyBySource([hospId], {
      from: "2026-05-11",
      to: "2026-05-12",
    });

    // marketing 3 > social 2 > search_engine 1
    expect(result.sources).toEqual(["marketing", "social", "search_engine"]);
  });

  it("excludes events from hospitals not in the scope list", async () => {
    // Insert another hospital + patient + event, confirm it's not counted.
    const [h2] = await db
      .insert(hospitals)
      .values({ name: `RDS-other-${uniq()}`, timezone: "Europe/Zurich" } as any)
      .returning();
    createdHospitalIds.push(h2.id);
    const [p2] = await db
      .insert(patients)
      .values({
        hospitalId: h2.id,
        patientNumber: `RDS-other-${uniq()}`,
        surname: "Other",
        firstName: "Other",
        birthday: "1990-01-01",
        sex: "F",
        isArchived: false,
      } as any)
      .returning();
    createdPatientIds.push(p2.id);
    await ensurePatientHospitalLink(p2.id, h2.id, null);

    await mkReferral(h2.id, p2.id, "social", new Date("2026-05-20T10:00:00Z"));

    const result = await getReferralDailyBySource([hospId], {
      from: "2026-05-20",
      to: "2026-05-20",
    });

    expect(result.rows[0]!.total).toBe(0);
  });

  it("rejects ranges greater than 366 days", async () => {
    await expect(
      getReferralDailyBySource([hospId], {
        from: "2024-01-01",
        to: "2026-01-01",
      }),
    ).rejects.toThrow(/range exceeds/);
  });

  it("defaults to last 90 days when 'from' is omitted", async () => {
    const result = await getReferralDailyBySource([hospId], { to: "2026-05-31" });
    expect(result.rows.length).toBeGreaterThanOrEqual(91);
    expect(result.rows[0]!.date).toBe("2026-03-02");
    expect(result.rows[result.rows.length - 1]!.date).toBe("2026-05-31");
  });
});
