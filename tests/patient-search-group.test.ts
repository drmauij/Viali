import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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
} from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { randomUUID } from "crypto";

import { ensurePatientHospitalLink } from "../server/utils/patientHospitalLink";

/**
 * Task 6: group-wide patient search.
 *
 * Search is always group-wide when the active hospital belongs to a group,
 * independent of the patient-list scope toggle. Every returned row carries
 * two derived fields the UI uses to mark cross-location matches:
 *
 *   - `seenAtCurrentLocation` — does the active hospital already have a
 *     `patient_hospitals` roster row for this patient?
 *   - `originHospitalName` — the name of `patients.hospitalId` (the home
 *     hospital). Used as the chip label.
 *
 * We spin up the real search router with auth mocked, so the middleware,
 * group-lookup, and de-dup behaviour all run against the DB.
 */

// Bypass Google auth; the test sets req.user via buildApp(userId) middleware.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import searchRouter from "../server/routes/search";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let hospAId: string;
let hospBId: string;
let hospOutsideId: string; // ungrouped
let hospAName: string;
let hospBName: string;

let unitA: string;
let unitB: string;
let unitOutside: string;

// Users
let userInB: string; // role at hospB (member of groupId)
let userOutside: string; // role at hospOutside (ungrouped)

// Patients — surname prefix shared so the single search term matches all of
// them. We add a random suffix to avoid cross-run collisions.
const surnamePrefix = `ZZTaskSix${uniq()}`;
let patientP: string; // home = A, roster = {A only}
let patientQ: string; // home = B, roster = {B only}
let patientR: string; // home = A, roster = {A, B} (dup-risk)
let patientSolo: string; // home = outside (ungrouped), roster = {outside}

// Phone-search patient (unique phone number prefix)
const phonePrefix = `+41999${Date.now().toString().slice(-6)}`;
let patientPhoneAtA: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdGroupIds: string[] = [];
const createdPatientIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(searchRouter);
  return app;
}

async function mkHospital(name: string, groupId?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: groupId ?? null } as any)
    .returning();
  createdHospitalIds.push(h.id);
  return { id: h.id, name: h.name };
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

async function mkPatient(
  hospitalId: string,
  opts: { surname?: string; phone?: string | null } = {},
) {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId,
      patientNumber: `PSG-${uniq()}`,
      surname: opts.surname ?? `${surnamePrefix}-${uniq()}`,
      firstName: "Search",
      birthday: "1990-01-01",
      sex: "F",
      phone: opts.phone ?? null,
      isArchived: false,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  await ensurePatientHospitalLink(p.id, hospitalId, null);
  return p.id;
}

beforeAll(async () => {
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `psg-G-${uniq()}` } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  const hospA = await mkHospital(`PSG_A_${uniq()}`, groupId);
  const hospB = await mkHospital(`PSG_B_${uniq()}`, groupId);
  const hospOutside = await mkHospital(`PSG_SOLO_${uniq()}`);
  hospAId = hospA.id;
  hospAName = hospA.name;
  hospBId = hospB.id;
  hospBName = hospB.name;
  hospOutsideId = hospOutside.id;

  unitA = await mkUnit(hospAId, "Clinic A");
  unitB = await mkUnit(hospBId, "Clinic B");
  unitOutside = await mkUnit(hospOutsideId, "Clinic Solo");

  userInB = await mkUser("psg-inB");
  userOutside = await mkUser("psg-solo");

  await mkRole(userInB, hospBId, unitB, "admin");
  await mkRole(userOutside, hospOutsideId, unitOutside, "admin");

  // Patients with shared surname prefix so one query finds all three.
  patientP = await mkPatient(hospAId, { surname: `${surnamePrefix}-P` });
  patientQ = await mkPatient(hospBId, { surname: `${surnamePrefix}-Q` });
  patientR = await mkPatient(hospAId, { surname: `${surnamePrefix}-R` });
  // R was also seen at B — add a second roster row.
  await ensurePatientHospitalLink(patientR, hospBId, null);

  patientSolo = await mkPatient(hospOutsideId, {
    surname: `${surnamePrefix}-Solo`,
  });

  // Phone-search case: patient whose phone matches the prefix, home = A.
  patientPhoneAtA = await mkPatient(hospAId, {
    surname: `${surnamePrefix}-Phone`,
    phone: phonePrefix,
  });
});

beforeEach(async () => {
  // Keep the roster in a known shape between tests: P at A, Q at B, R at
  // both, Solo at outside, PhoneAtA at A. Wipe any stray rows and re-seed.
  await db
    .delete(patientHospitals)
    .where(
      inArray(patientHospitals.patientId, [
        patientP,
        patientQ,
        patientR,
        patientSolo,
        patientPhoneAtA,
      ]),
    )
    .catch(() => {});
  await ensurePatientHospitalLink(patientP, hospAId, null);
  await ensurePatientHospitalLink(patientQ, hospBId, null);
  await ensurePatientHospitalLink(patientR, hospAId, null);
  await ensurePatientHospitalLink(patientR, hospBId, null);
  await ensurePatientHospitalLink(patientSolo, hospOutsideId, null);
  await ensurePatientHospitalLink(patientPhoneAtA, hospAId, null);
});

afterAll(async () => {
  if (createdPatientIds.length) {
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

describe("GET /api/search/:hospitalId — group-wide patient search", () => {
  it("surname search at active=B returns P (home A, not seen at B) with the correct flags", async () => {
    const app = buildApp(userInB);
    const res = await request(app)
      .get(
        `/api/search/${hospBId}?q=${encodeURIComponent(surnamePrefix)}&limit=20`,
      )
      .set("X-Active-Hospital-Id", hospBId);
    expect(res.status).toBe(200);

    const p = res.body.patients.find((x: any) => x.id === patientP);
    expect(p).toBeDefined();
    expect(p.seenAtCurrentLocation).toBe(false);
    expect(p.originHospitalName).toBe(hospAName);
  });

  it("surname search at active=B returns Q (home B, seen at B) with seenAtCurrentLocation=true", async () => {
    const app = buildApp(userInB);
    const res = await request(app)
      .get(
        `/api/search/${hospBId}?q=${encodeURIComponent(surnamePrefix)}&limit=20`,
      )
      .set("X-Active-Hospital-Id", hospBId);
    expect(res.status).toBe(200);

    const q = res.body.patients.find((x: any) => x.id === patientQ);
    expect(q).toBeDefined();
    expect(q.seenAtCurrentLocation).toBe(true);
    expect(q.originHospitalName).toBe(hospBName);
  });

  it("R (home A, rostered at both) appears exactly ONCE with seenAtCurrentLocation=true", async () => {
    const app = buildApp(userInB);
    const res = await request(app)
      .get(
        `/api/search/${hospBId}?q=${encodeURIComponent(surnamePrefix)}&limit=20`,
      )
      .set("X-Active-Hospital-Id", hospBId);
    expect(res.status).toBe(200);

    const rHits = res.body.patients.filter((x: any) => x.id === patientR);
    expect(rHits.length).toBe(1);
    expect(rHits[0].seenAtCurrentLocation).toBe(true);
    // R's home hospital is A, so originHospitalName is A's name regardless of
    // the extra roster row at B.
    expect(rHits[0].originHospitalName).toBe(hospAName);
  });

  it("ungrouped tenant search returns only patients at the active hospital — no group expansion", async () => {
    // hospOutside has no group. Even though P/Q/R/PhoneAtA share a surname
    // prefix and all live in the other (grouped) tenants, the ungrouped
    // search path must NOT leak them.
    const app = buildApp(userOutside);
    const res = await request(app)
      .get(
        `/api/search/${hospOutsideId}?q=${encodeURIComponent(surnamePrefix)}&limit=20`,
      )
      .set("X-Active-Hospital-Id", hospOutsideId);
    expect(res.status).toBe(200);

    const ids = res.body.patients.map((x: any) => x.id);
    expect(ids).toContain(patientSolo);
    expect(ids).not.toContain(patientP);
    expect(ids).not.toContain(patientQ);
    expect(ids).not.toContain(patientR);
    expect(ids).not.toContain(patientPhoneAtA);
  });

  it("phone search widens group-wide the same way as surname search", async () => {
    const app = buildApp(userInB);
    const res = await request(app)
      .get(
        `/api/search/${hospBId}?q=${encodeURIComponent(phonePrefix)}&limit=20`,
      )
      .set("X-Active-Hospital-Id", hospBId);
    expect(res.status).toBe(200);

    // PhoneAtA's home is A; active=B is in the same group; the phone match
    // must come back with the cross-location flags set.
    const match = res.body.patients.find((x: any) => x.id === patientPhoneAtA);
    expect(match).toBeDefined();
    expect(match.seenAtCurrentLocation).toBe(false);
    expect(match.originHospitalName).toBe(hospAName);
  });

  it("empty / short query returns empty arrays — no change from legacy behaviour", async () => {
    const app = buildApp(userInB);

    const empty = await request(app)
      .get(`/api/search/${hospBId}?q=`)
      .set("X-Active-Hospital-Id", hospBId);
    expect(empty.status).toBe(200);
    expect(empty.body.patients).toEqual([]);

    const short = await request(app)
      .get(`/api/search/${hospBId}?q=a`)
      .set("X-Active-Hospital-Id", hospBId);
    expect(short.status).toBe(200);
    expect(short.body.patients).toEqual([]);
  });
});
