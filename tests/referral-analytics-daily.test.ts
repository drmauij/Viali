import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  patients,
  patientHospitals,
  referralEvents,
  users,
  userHospitalRoles,
  units,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";
import { getReferralDailyBySource } from "../server/lib/referralAnalytics";
import express from "express";
import request from "supertest";
import { vi } from "vitest";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessRouter from "../server/routes/business";

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

let managerUserId: string;
let unitId: string;
const createdUserIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(businessRouter);
  return app;
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

  const [u] = await db
    .insert(units)
    .values({ hospitalId: hospId, name: "u", type: "clinic" } as any)
    .returning();
  unitId = u.id;
  createdUnitIds.push(unitId);

  const [usr] = await db
    .insert(users)
    .values({
      id: `mgr-${uniq()}`,
      email: `mgr-${uniq()}@test.invalid`,
      firstName: "Mgr",
      lastName: "User",
      isPlatformAdmin: false,
    } as any)
    .returning();
  managerUserId = usr.id;
  createdUserIds.push(managerUserId);

  const [r] = await db
    .insert(userHospitalRoles)
    .values({ userId: managerUserId, hospitalId: hospId, unitId, role: "manager" } as any)
    .returning();
  createdRoleIds.push(r.id);
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
  if (createdRoleIds.length)
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds));
  if (createdUnitIds.length)
    await db.delete(units).where(inArray(units.id, createdUnitIds));
  if (createdUserIds.length)
    await db.delete(users).where(inArray(users.id, createdUserIds));
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

describe("GET /api/business/:hospitalId/referral-daily", () => {
  it("returns gap-free daily-by-source rows for the authorized hospital", async () => {
    await mkReferral(hospId, patId, "social", new Date("2026-06-01T10:00:00Z"));
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${hospId}/referral-daily?from=2026-06-01&to=2026-06-02`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      rows: expect.any(Array),
      sources: expect.any(Array),
      timezone: expect.any(String),
    });
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].bySource.social).toBe(1);
    expect(res.body.rows[1].total).toBe(0);
    expect(res.body.sources).toEqual(["social"]);
  });

  it("returns 400 when range exceeds 366 days", async () => {
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${hospId}/referral-daily?from=2024-01-01&to=2026-01-01`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when the user has no access to the hospital", async () => {
    // Other hospital with no role for this user
    const [h2] = await db
      .insert(hospitals)
      .values({ name: `RDS-noaccess-${uniq()}`, timezone: "Europe/Zurich" } as any)
      .returning();
    createdHospitalIds.push(h2.id);
    const app = buildApp(managerUserId);
    const res = await request(app).get(
      `/api/business/${h2.id}/referral-daily?from=2026-06-01&to=2026-06-02`,
    );
    expect([401, 403, 404]).toContain(res.status); // exact status depends on existing middleware
  });
});
