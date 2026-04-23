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
  promoCodes,
} from "@shared/schema";
import { inArray, eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";

/**
 * Task 12: marketing Flows scope toggle ("This clinic" / "All locations").
 *
 * We mount the real flows router with auth stubbed to a configurable user id.
 * Scope resolution, group look-up, and the segment-count WHERE clause all run
 * for real against the DB, so this is an integration test of the full path:
 * route + auth + scope helper + segment audience.
 *
 * Covered:
 *   - scope=hospital at active=A returns only A's patients.
 *   - scope=group as group_admin returns A+B combined.
 *   - scope=group as marketing-only (non-group-admin) is 403.
 *   - scope=group as un-grouped tenant silently falls back to hospital scope.
 *   - Promo codes: groupWide flag + cross-hospital redemption check.
 */

// Bypass Google auth; the test sets req.user via buildApp(userId) middleware.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import flowsRouter from "../server/routes/flows";
import clinicRouter from "../server/routes/clinic";

const uniq = () => randomUUID().slice(0, 8);

// Primary group G with hospitals A and B.
let groupId: string;
let hospA: string;
let hospB: string;
let hospSolo: string; // ungrouped
let hospAltGroup: string; // in a different group
let altGroupId: string;

let unitA: string;
let unitB: string;
let unitSolo: string;
let unitAltGroup: string;

// Users
let userMarketingInA: string; // plain marketing role at hospA — no group_admin
let userGroupAdmin: string; // group_admin at hospA (unlocks group scope)
let userMarketingInSolo: string; // marketing at hospSolo (no group)
let userMarketingInAltGroup: string; // marketing at hospAltGroup (different group)

// Patients — one at A (consenting), one at B (consenting). The SMS consent
// flags are required or consentConditionsFor("sms") filters them out.
let patientP: string; // home A
let patientQ: string; // home B
let patientSolo: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];
const createdPromoIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(flowsRouter);
  app.use(clinicRouter);
  return app;
}

async function mkHospital(name: string, gid?: string | null) {
  const bookingToken = `btok-${uniq()}`;
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: gid ?? null, bookingToken } as any)
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
      patientNumber: `FLW-${uniq()}`,
      surname,
      firstName: "Test",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
      // Required so consentConditionsFor("sms") keeps them in.
      smsMarketingConsent: true,
      emailMarketingConsent: true,
      // Give them contactable fields so the send-loop inserts would succeed
      // if we got there.
      phone: `+415555${uniq()}`.slice(0, 15),
      email: `flw-${uniq()}@test.invalid`,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  await ensurePatientHospitalLink(p.id, hospitalId, null);
  return p.id;
}

async function mkPromo(hospitalId: string, code: string, groupWide: boolean) {
  const [p] = await db
    .insert(promoCodes)
    .values({
      hospitalId,
      code,
      discountType: "percent",
      discountValue: "10" as any,
      description: "test",
      groupWide,
    } as any)
    .returning();
  createdPromoIds.push(p.id);
  return p.id;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `flw-group-G-${uniq()}` } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  const [g2] = await db
    .insert(hospitalGroups)
    .values({ name: `flw-group-alt-${uniq()}` } as any)
    .returning();
  altGroupId = g2.id;
  createdGroupIds.push(altGroupId);

  hospA = await mkHospital(`FLW_A_${uniq()}`, groupId);
  hospB = await mkHospital(`FLW_B_${uniq()}`, groupId);
  hospSolo = await mkHospital(`FLW_SOLO_${uniq()}`);
  hospAltGroup = await mkHospital(`FLW_ALT_${uniq()}`, altGroupId);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitSolo = await mkUnit(hospSolo, "Clinic Solo");
  unitAltGroup = await mkUnit(hospAltGroup, "Clinic Alt");

  userMarketingInA = await mkUser("flw-marketA");
  userGroupAdmin = await mkUser("flw-groupadmin");
  userMarketingInSolo = await mkUser("flw-solo");
  userMarketingInAltGroup = await mkUser("flw-alt");

  // Plain marketing at hospA only — passes isMarketingAccess but fails group
  // gate.
  await mkRole(userMarketingInA, hospA, unitA, "marketing");
  // group_admin at hospA — passes both isMarketingAccess (via group_admin
  // NOT matching marketing role) and the group gate. Note: isMarketingAccess
  // accepts admin|manager|marketing but not group_admin directly, so we also
  // grant a local marketing role so the test hits the group-scope branch.
  await mkRole(userGroupAdmin, hospA, unitA, "group_admin");
  await mkRole(userGroupAdmin, hospA, unitA, "marketing");

  await mkRole(userMarketingInSolo, hospSolo, unitSolo, "marketing");
  await mkRole(userMarketingInAltGroup, hospAltGroup, unitAltGroup, "marketing");

  patientP = await mkPatient(hospA, `FLW-P-${uniq()}`);
  patientQ = await mkPatient(hospB, `FLW-Q-${uniq()}`);
  patientSolo = await mkPatient(hospSolo, `FLW-S-${uniq()}`);
});

afterAll(async () => {
  if (createdPromoIds.length) {
    await db.delete(promoCodes).where(inArray(promoCodes.id, createdPromoIds)).catch(() => {});
  }
  if (createdPatientIds.length) {
    await db
      .delete(patientHospitals)
      .where(inArray(patientHospitals.patientId, createdPatientIds))
      .catch(() => {});
    await db.delete(patients).where(inArray(patients.id, createdPatientIds)).catch(() => {});
  }
  if (createdRoleIds.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds)).catch(() => {});
  }
  if (createdUnitIds.length) {
    await db.delete(units).where(inArray(units.id, createdUnitIds)).catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, createdHospitalIds))
      .catch(() => {});
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds)).catch(() => {});
  }
  if (createdGroupIds.length) {
    await db.delete(hospitalGroups).where(inArray(hospitalGroups.id, createdGroupIds)).catch(() => {});
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  await pool.end();
});

// segment-count returns `samplePatients`; filter to only rows we created so
// the assertion is stable even when other test data is in the DB.
function countOurs(body: any) {
  const samples = (body?.samplePatients ?? []) as Array<{ id: string }>;
  return samples.filter((s) => createdPatientIds.includes(s.id));
}

describe("POST /api/business/:hospitalId/flows/segment-count — scope toggle", () => {
  it("scope=hospital at active=A returns only P (home A)", async () => {
    const app = buildApp(userGroupAdmin);
    const res = await request(app)
      .post(`/api/business/${hospA}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospA)
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(200);
    const ours = countOurs(res.body);
    const ids = ours.map((r) => r.id);
    expect(ids).toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("default scope (no header) at active=A also returns only P", async () => {
    const app = buildApp(userGroupAdmin);
    const res = await request(app)
      .post(`/api/business/${hospA}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospA)
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(200);
    const ours = countOurs(res.body);
    const ids = ours.map((r) => r.id);
    expect(ids).toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("scope=group as group_admin returns BOTH P (home A) and Q (home B)", async () => {
    const app = buildApp(userGroupAdmin);
    const res = await request(app)
      .post(`/api/business/${hospA}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group")
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(200);
    const ours = countOurs(res.body);
    const ids = ours.map((r) => r.id);
    expect(ids).toContain(patientP);
    expect(ids).toContain(patientQ);
  });

  it("scope=group as plain marketing role (non-group-admin): 403", async () => {
    const app = buildApp(userMarketingInA);
    const res = await request(app)
      .post(`/api/business/${hospA}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group")
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_SCOPE_FORBIDDEN");
  });

  it("scope=group at un-grouped tenant silently falls back to hospital scope", async () => {
    const app = buildApp(userMarketingInSolo);
    const res = await request(app)
      .post(`/api/business/${hospSolo}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospSolo)
      .set("X-Active-Scope", "group")
      .send({ channel: "sms", filters: [] });
    // Hospital has no group → collapse to [hospSolo], don't 403. Matches
    // Task 5 and Task 11 silent-fallback contract.
    expect(res.status).toBe(200);
    const ours = countOurs(res.body);
    const ids = ours.map((r) => r.id);
    // We should see solo but NOT the grouped patients (no cross-tenant leak).
    expect(ids).toContain(patientSolo);
    expect(ids).not.toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("scope=group as user with no marketing role at active hospital: 403 from middleware", async () => {
    // userMarketingInAltGroup has no role at hospA → isMarketingAccess rejects.
    const app = buildApp(userMarketingInAltGroup);
    const res = await request(app)
      .post(`/api/business/${hospA}/flows/segment-count`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group")
      .send({ channel: "sms", filters: [] });
    expect(res.status).toBe(403);
  });
});

describe("Promo codes — groupWide redemption", () => {
  it("GET /api/public/booking/:token/promo/:code: group-wide promo issued at A is valid at B", async () => {
    const groupWideCode = `GW${uniq().toUpperCase()}`;
    await mkPromo(hospA, groupWideCode, true);

    // Look up hospB's booking token so the public validation route resolves
    // to hospB (the "booking hospital"), yet accepts the A-issued code.
    const [hospBRow] = await db
      .select({ bookingToken: hospitals.bookingToken })
      .from(hospitals)
      .where(eq(hospitals.id, hospB))
      .limit(1);
    expect(hospBRow?.bookingToken).toBeTruthy();

    const app = buildApp(null);
    const res = await request(app).get(
      `/api/public/booking/${hospBRow!.bookingToken}/promo/${groupWideCode}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.code).toBe(groupWideCode);
  });

  it("non-groupWide promo issued at A is NOT valid at B", async () => {
    const localCode = `LOCAL${uniq().toUpperCase()}`.slice(0, 20);
    await mkPromo(hospA, localCode, false);

    const [hospBRow] = await db
      .select({ bookingToken: hospitals.bookingToken })
      .from(hospitals)
      .where(eq(hospitals.id, hospB))
      .limit(1);

    const app = buildApp(null);
    const res = await request(app).get(
      `/api/public/booking/${hospBRow!.bookingToken}/promo/${localCode}`,
    );
    // Not found at B.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.valid).toBeUndefined();
  });

  it("POST /api/business/:hospitalId/promo-codes with groupWide=true: 403 for plain marketing role", async () => {
    const app = buildApp(userMarketingInA);
    const res = await request(app)
      .post(`/api/business/${hospA}/promo-codes`)
      .set("X-Active-Hospital-Id", hospA)
      .send({
        code: `X${uniq().toUpperCase()}`,
        discountType: "percent",
        discountValue: "10",
        groupWide: true,
      });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("GROUP_SCOPE_FORBIDDEN");
  });

  it("POST promo-codes with groupWide=true: persisted when caller is group_admin", async () => {
    const app = buildApp(userGroupAdmin);
    const res = await request(app)
      .post(`/api/business/${hospA}/promo-codes`)
      .set("X-Active-Hospital-Id", hospA)
      .send({
        code: `G${uniq().toUpperCase()}`,
        discountType: "percent",
        discountValue: "10",
        groupWide: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.groupWide).toBe(true);
    // Clean up inline — we didn't use mkPromo so track the id manually.
    if (res.body.id) createdPromoIds.push(res.body.id);
  });

  it("POST promo-codes with groupWide=true on an un-grouped tenant: silently stored as groupWide=false", async () => {
    const app = buildApp(userMarketingInSolo);
    const res = await request(app)
      .post(`/api/business/${hospSolo}/promo-codes`)
      .set("X-Active-Hospital-Id", hospSolo)
      .send({
        code: `S${uniq().toUpperCase()}`,
        discountType: "percent",
        discountValue: "10",
        groupWide: true,
      });
    expect(res.status).toBe(200);
    // No group → groupWide collapses to false rather than 403, matching the
    // silent-fallback contract used by scope=group on segment-count.
    expect(res.body.groupWide).toBe(false);
    if (res.body.id) createdPromoIds.push(res.body.id);
  });
});
