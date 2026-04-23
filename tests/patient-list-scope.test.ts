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
 * Task 5: patient list scope toggle ("This clinic" / "All locations").
 *
 * We spin up the real patients router with auth mocked to a configurable user
 * id. Scope resolution, group look-up, and the patient_hospitals-joined query
 * all run for real against the DB, so this is an integration test of the full
 * list path: route + scope header + storage query.
 */

// Bypass Google auth; the test sets req.user via buildApp(userId) middleware.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import patientsRouter from "../server/routes/anesthesia/patients";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let hospA: string;
let hospB: string;
let hospOutside: string; // ungrouped, for solo-fallback test
let hospAltGroup: string; // in a DIFFERENT group

let unitA: string;
let unitB: string;
let unitOutside: string;
let unitAltGroup: string;

let altGroupId: string;

// Users
let userInA: string; // role at hospA (member of groupId)
let userOutside: string; // role at hospOutside (ungrouped)
let userInAltGroup: string; // role at hospAltGroup only

// Patients
let patientP: string; // home hospital = hospA, only at hospA
let patientQ: string; // home hospital = hospB, only at hospB
let patientOutsideSolo: string; // at hospOutside only (ungrouped tenant)

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
  app.use(patientsRouter);
  return app;
}

async function mkHospital(name: string, groupId?: string | null) {
  const [h] = await db
    .insert(hospitals)
    .values({ name, groupId: groupId ?? null } as any)
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
      patientNumber: `PLS-${uniq()}`,
      surname,
      firstName: "Test",
      birthday: "1990-01-01",
      sex: "F",
      isArchived: false,
    } as any)
    .returning();
  createdPatientIds.push(p.id);
  // Home-hospital roster row — mirrors what createPatient in the real storage
  // layer does via ensurePatientHospitalLink.
  await ensurePatientHospitalLink(p.id, hospitalId, null);
  return p.id;
}

beforeAll(async () => {
  // Primary group G with hospitals A and B.
  const [g] = await db
    .insert(hospitalGroups)
    .values({ name: `pls-group-G-${uniq()}` } as any)
    .returning();
  groupId = g.id;
  createdGroupIds.push(groupId);

  // A secondary group for the "stranger-user-cannot-scope-group" test.
  const [g2] = await db
    .insert(hospitalGroups)
    .values({ name: `pls-group-alt-${uniq()}` } as any)
    .returning();
  altGroupId = g2.id;
  createdGroupIds.push(altGroupId);

  hospA = await mkHospital(`PLS_A_${uniq()}`, groupId);
  hospB = await mkHospital(`PLS_B_${uniq()}`, groupId);
  hospOutside = await mkHospital(`PLS_SOLO_${uniq()}`); // ungrouped
  hospAltGroup = await mkHospital(`PLS_ALT_${uniq()}`, altGroupId);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitOutside = await mkUnit(hospOutside, "Clinic Solo");
  unitAltGroup = await mkUnit(hospAltGroup, "Clinic Alt");

  userInA = await mkUser("pls-inA");
  userOutside = await mkUser("pls-solo");
  userInAltGroup = await mkUser("pls-alt");

  await mkRole(userInA, hospA, unitA, "admin");
  await mkRole(userOutside, hospOutside, unitOutside, "admin");
  await mkRole(userInAltGroup, hospAltGroup, unitAltGroup, "admin");

  // Patients — P at A, Q at B, and one in the ungrouped world.
  patientP = await mkPatient(hospA, `PLS-P-${uniq()}`);
  patientQ = await mkPatient(hospB, `PLS-Q-${uniq()}`);
  patientOutsideSolo = await mkPatient(hospOutside, `PLS-SOLO-${uniq()}`);
});

beforeEach(async () => {
  // Clear stray cross-hospital roster rows that earlier tests may have added
  // (the "touched at A" test deliberately writes one). We wipe every row
  // except the home-hospital roster row for each test-owned patient.
  await db
    .delete(patientHospitals)
    .where(
      and(
        inArray(patientHospitals.patientId, [
          patientP,
          patientQ,
          patientOutsideSolo,
        ]),
      ),
    )
    .catch(() => {});
  // Re-seed home-hospital links so the roster join still finds each patient.
  await ensurePatientHospitalLink(patientP, hospA, null);
  await ensurePatientHospitalLink(patientQ, hospB, null);
  await ensurePatientHospitalLink(patientOutsideSolo, hospOutside, null);
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

describe("GET /api/patients — scope toggle", () => {
  it("default scope (no header) at active=A returns only patients rostered at A", async () => {
    const app = buildApp(userInA);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("explicit scope=hospital at active=A returns only patients rostered at A", async () => {
    const app = buildApp(userInA);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "hospital");
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("scope=group at active=A returns BOTH P (home A) and Q (home B)", async () => {
    const app = buildApp(userInA);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(patientP);
    expect(ids).toContain(patientQ);
  });

  it("after ensurePatientHospitalLink(Q, A), scope=hospital at active=A includes Q", async () => {
    // Simulate Q being touched at A (an appointment, questionnaire, treatment).
    await ensurePatientHospitalLink(patientQ, hospA, null);

    const app = buildApp(userInA);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA);
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(patientP);
    expect(ids).toContain(patientQ);
  });

  it("scope=group does NOT double-list a patient rostered at multiple group hospitals", async () => {
    // Q is at B by default; also touch A so it has two roster rows in the group.
    await ensurePatientHospitalLink(patientQ, hospA, null);

    const app = buildApp(userInA);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const qCount = res.body.filter((p: any) => p.id === patientQ).length;
    expect(qCount).toBe(1);
  });

  it("un-grouped tenant sending scope=group silently falls back to hospital scope", async () => {
    // hospOutside has no group — we shouldn't error, just ignore the header.
    // patientOutsideSolo is rostered at hospOutside only, so we should still
    // see it back.
    const app = buildApp(userOutside);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospOutside}`)
      .set("X-Active-Hospital-Id", hospOutside)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(200);
    const ids = res.body.map((p: any) => p.id);
    expect(ids).toContain(patientOutsideSolo);
    // Must NOT leak patients from a different (unrelated) group.
    expect(ids).not.toContain(patientP);
    expect(ids).not.toContain(patientQ);
  });

  it("user whose active-hospital header is not backed by a real role: blocked by middleware", async () => {
    // userOutside has no role at hospA. Even if they forge the header trying
    // to get group-scope access at A, the requireStrictHospitalAccess
    // middleware should 403 before the scope logic runs.
    const app = buildApp(userOutside);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    expect(res.status).toBe(403);
  });

  it("user in a different group entirely cannot scope=group into group G", async () => {
    // userInAltGroup has a role at hospAltGroup (altGroupId), nowhere near
    // group G. Forging headers pointing at hospA must not cross group G.
    const app = buildApp(userInAltGroup);
    const res = await request(app)
      .get(`/api/patients?hospitalId=${hospA}`)
      .set("X-Active-Hospital-Id", hospA)
      .set("X-Active-Scope", "group");
    // Upstream middleware already rejects since there's no role at hospA.
    expect(res.status).toBe(403);
  });
});
