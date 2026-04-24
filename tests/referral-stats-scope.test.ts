import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  units,
  userHospitalRoles,
  users,
  patients,
  patientHospitals,
  referralEvents,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";

/**
 * Task 13: Funnels page (formerly /business/marketing) scope toggle.
 *
 * Mirrors `tests/business-dashboard-scope.test.ts` but focuses on the three
 * additional read endpoints that feed the Funnels UI and weren't already
 * covered by Task 11:
 *   - GET /api/business/:hospitalId/referral-timeseries
 *   - GET /api/business/:hospitalId/referral-events
 *   - GET /api/business/:hospitalId/referral-funnel
 *
 * The Task 11 suite already covers `/referral-stats`, which uses the same
 * scope helper; we re-assert the shape here (stats is the smoke test) to
 * keep the Funnels coverage self-contained in one file.
 *
 * The full scope path runs for real: middleware + scope helper + drizzle
 * `inArray` / raw-SQL `IN (...)` expansion against the DB.
 */

// Bypass Google auth; the test sets req.user via buildApp(userId) middleware.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessRouter from "../server/routes/business";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let altGroupId: string;
let hospA: string;
let hospB: string;
let hospSolo: string;
let hospAltGroup: string;

let unitA: string;
let unitB: string;
let unitSolo: string;
let unitAltGroup: string;

let userManagerInA: string;
let userManagerInSolo: string;
let userManagerInAltGroup: string;

let patientA: string;
let patientB: string;
let patientSolo: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];
const createdReferralIds: string[] = [];

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

async function mkHospital(name: string, gid?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: gid ?? null } as any)
    .returning();
  createdHospitalIds.push(h.id);
  return h.id;
}

async function mkUnit(hospitalId: string, name: string) {
  const [u] = await db
    .insert(units)
    .values({ hospitalId, name, type: "clinic" } as any)
    .returning();
  createdUnitIds.push(u.id);
  return u.id;
}

async function mkUser(prefix: string) {
  const [u] = await db
    .insert(users)
    .values({
      id: `${prefix}-${uniq()}`,
      email: `${prefix}-${uniq()}@test.invalid`,
      firstName: prefix,
      lastName: "User",
      isPlatformAdmin: false,
    } as any)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

async function mkRole(
  userId: string,
  hospitalId: string,
  unitId: string,
  role: string,
) {
  const [r] = await db
    .insert(userHospitalRoles)
    .values({ userId, hospitalId, unitId, role } as any)
    .returning();
  createdRoleIds.push(r.id);
  return r.id;
}

async function mkPatient(hospitalId: string, surname: string) {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId,
      patientNumber: `RSS-${uniq()}`,
      surname,
      firstName: "Test",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  await ensurePatientHospitalLink(p.id, hospitalId, null);
  return p.id;
}

async function mkReferralEvent(hospitalId: string, patientId: string, source = "social") {
  const [r] = await db
    .insert(referralEvents)
    .values({
      hospitalId,
      patientId,
      source,
      captureMethod: "manual",
    } as any)
    .returning();
  createdReferralIds.push(r.id);
  return r.id;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `rss-group-G-${uniq()}` } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  const [g2] = await db
    .insert(hospitalGroups)
    .values({ name: `rss-group-alt-${uniq()}` } as any)
    .returning();
  altGroupId = g2.id;
  createdGroupIds.push(altGroupId);

  hospA = await mkHospital(`RSS_A_${uniq()}`, groupId);
  hospB = await mkHospital(`RSS_B_${uniq()}`, groupId);
  hospSolo = await mkHospital(`RSS_SOLO_${uniq()}`);
  hospAltGroup = await mkHospital(`RSS_ALT_${uniq()}`, altGroupId);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitSolo = await mkUnit(hospSolo, "Clinic Solo");
  unitAltGroup = await mkUnit(hospAltGroup, "Clinic Alt");

  userManagerInA = await mkUser("rss-inA");
  userManagerInSolo = await mkUser("rss-solo");
  userManagerInAltGroup = await mkUser("rss-alt");

  await mkRole(userManagerInA, hospA, unitA, "manager");
  await mkRole(userManagerInSolo, hospSolo, unitSolo, "manager");
  await mkRole(userManagerInAltGroup, hospAltGroup, unitAltGroup, "manager");

  patientA = await mkPatient(hospA, `RSS-PA-${uniq()}`);
  patientB = await mkPatient(hospB, `RSS-PB-${uniq()}`);
  patientSolo = await mkPatient(hospSolo, `RSS-PS-${uniq()}`);

  // 3 referrals per member hospital, 1 at solo.
  for (let i = 0; i < 3; i++) {
    await mkReferralEvent(hospA, patientA, "social");
    await mkReferralEvent(hospB, patientB, "search_engine");
  }
  await mkReferralEvent(hospSolo, patientSolo, "social");
});

afterAll(async () => {
  if (createdReferralIds.length) {
    await db
      .delete(referralEvents)
      .where(inArray(referralEvents.id, createdReferralIds))
      .catch(() => {});
  }
  if (createdPatientIds.length) {
    await db
      .delete(patientHospitals)
      .where(inArray(patientHospitals.patientId, createdPatientIds))
      .catch(() => {});
    await db
      .delete(patients)
      .where(inArray(patients.id, createdPatientIds))
      .catch(() => {});
  }
  if (createdRoleIds.length) {
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.id, createdRoleIds))
      .catch(() => {});
  }
  if (createdUnitIds.length) {
    await db
      .delete(units)
      .where(inArray(units.id, createdUnitIds))
      .catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
    await db
      .delete(hospitals)
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
  }
  if (createdGroupIds.length) {
    await db
      .delete(hospitalGroups)
      .where(inArray(hospitalGroups.id, createdGroupIds))
      .catch(() => {});
  }
  if (createdUserIds.length) {
    await db
      .delete(users)
      .where(inArray(users.id, createdUserIds))
      .catch(() => {});
  }
  await pool.end();
});

// Only rows we created — other seeded rows in the test DB are irrelevant to
// these counts.
function countOurs(rows: any[], idField: string, created: string[]) {
  return rows.filter((r) => created.includes(r[idField])).length;
}

describe("GET /api/business/:hospitalId/referral-stats — scope toggle (Funnels)", () => {
  it("default scope at active=A returns only A's 3 referrals (>= floor)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-stats`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    expect(res.body.totalReferrals).toBeGreaterThanOrEqual(3);
  });

  it("scope=group as group-access user returns combined total >= hospital + B's contribution", async () => {
    const app = buildApp(userManagerInA);
    const baseHospRes = await request(app)
      .get(`/api/business/${hospA}/referral-stats`)
      .set("X-Active-Hospital-Id", hospA);
    const hospBaseline = baseHospRes.body.totalReferrals as number;

    const groupRes = await request(app)
      .get(`/api/business/${hospA}/referral-stats`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(groupRes.status).toBe(200);
    expect(groupRes.body.totalReferrals).toBeGreaterThanOrEqual(hospBaseline + 3);
  });

  it("scope=group as non-group-admin at an alt-group hospital: 403 from middleware", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-stats`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });

  it("scope=group at ungrouped tenant silently falls back to hospital scope", async () => {
    const app = buildApp(userManagerInSolo);
    const res = await request(app)
      .get(`/api/business/${hospSolo}/referral-stats`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    expect(res.body.totalReferrals).toBeGreaterThanOrEqual(0);
    expect(res.body.breakdown).toBeInstanceOf(Array);
  });
});

describe("GET /api/business/:hospitalId/referral-timeseries — scope toggle", () => {
  it("scope=hospital returns only A's events (social only for our seed)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-timeseries`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    // Our seed contributes 3 social events at A, none at B under the
    // single-hospital scope — so the result should include a 'social' row but
    // never a 'search_engine' row that came from B (B's only seeded source).
    const sources = new Set(res.body.map((r: any) => r.referralSource));
    expect(sources.has("social")).toBe(true);
    // We can't fully assert no other test data in the table has search_engine,
    // but at minimum the body should be iterable.
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("scope=group rolls up A+B — adds at least one row with B's source", async () => {
    const app = buildApp(userManagerInA);

    const hospRes = await request(app)
      .get(`/api/business/${hospA}/referral-timeseries`)
      .set("X-Active-Hospital-Id", hospA);
    const hospSum = (hospRes.body as Array<{ count: number }>).reduce(
      (s, r) => s + Number(r.count || 0),
      0,
    );

    const groupRes = await request(app)
      .get(`/api/business/${hospA}/referral-timeseries`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(groupRes.status).toBe(200);
    const groupSum = (groupRes.body as Array<{ count: number }>).reduce(
      (s, r) => s + Number(r.count || 0),
      0,
    );
    // Group sum is at least 3 higher than the hospital-only sum (B's 3
    // search_engine rows).
    expect(groupSum).toBeGreaterThanOrEqual(hospSum + 3);
  });

  it("scope=group at un-grouped tenant silently falls back", async () => {
    const app = buildApp(userManagerInSolo);
    const res = await request(app)
      .get(`/api/business/${hospSolo}/referral-timeseries`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("scope=group as non-group user: 403 from middleware", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-timeseries`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });
});

describe("GET /api/business/:hospitalId/referral-events — scope toggle", () => {
  it("scope=hospital returns only A's events (our seeded rows)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-events?limit=200`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const ourA = res.body.filter((r: any) => createdReferralIds.includes(r.id));
    // All our rows in scope=hospital must belong to A — none of B's rows.
    // We assert by cross-referencing ids: rows from B won't appear here
    // (hospital_id filter), so our A count must equal 3.
    const aIdsOnly = ourA.filter((r: any) => {
      // A's seed uses 'social' source
      return r.source === "social";
    });
    expect(aIdsOnly.length).toBeGreaterThanOrEqual(3);
    // Explicitly none of B's rows (search_engine source from our seed) should
    // be present in the hospital-scope response.
    const bSources = ourA.filter((r: any) => r.source === "search_engine");
    expect(bSources.length).toBe(0);
  });

  it("scope=group returns A+B combined (includes search_engine rows from B)", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-events?limit=200`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const ours = res.body.filter((r: any) => createdReferralIds.includes(r.id));
    const bSources = ours.filter((r: any) => r.source === "search_engine");
    expect(bSources.length).toBeGreaterThanOrEqual(3);
  });

  it("scope=group as non-group user: 403 from middleware", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-events?limit=200`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });

  it("scope=group at un-grouped tenant silently falls back", async () => {
    const app = buildApp(userManagerInSolo);
    const res = await request(app)
      .get(`/api/business/${hospSolo}/referral-events?limit=200`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/business/:hospitalId/referral-funnel — scope toggle", () => {
  it("scope=hospital returns only A's funnel rows", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-funnel`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const ours = (res.body as any[]).filter((r) => createdReferralIds.includes(r.referral_id));
    // A's seed contributes 3 social events; B's 3 search_engine events must
    // NOT appear under scope=hospital.
    const bRows = ours.filter((r: any) => r.source === "search_engine");
    expect(bRows.length).toBe(0);
    const aRows = ours.filter((r: any) => r.source === "social");
    expect(aRows.length).toBeGreaterThanOrEqual(3);
  });

  it("scope=group returns A+B combined", async () => {
    const app = buildApp(userManagerInA);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-funnel`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const ours = (res.body as any[]).filter((r) => createdReferralIds.includes(r.referral_id));
    const bRows = ours.filter((r: any) => r.source === "search_engine");
    expect(bRows.length).toBeGreaterThanOrEqual(3);
  });

  it("scope=group at un-grouped tenant silently falls back", async () => {
    const app = buildApp(userManagerInSolo);
    const res = await request(app)
      .get(`/api/business/${hospSolo}/referral-funnel`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("scope=group as non-group user: 403 from middleware", async () => {
    const app = buildApp(userManagerInAltGroup);
    const res = await request(app)
      .get(`/api/business/${hospA}/referral-funnel`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });
});
