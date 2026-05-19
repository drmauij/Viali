import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  units,
  userHospitalRoles,
  users,
  externalSurgeryRequests,
  surgeonActionRequests,
  surgeries,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * VIALI-QQ follow-up: bulk counts for external-surgery-requests and
 * surgeon-action-requests, mirroring the leads-counts pattern. The sidebar
 * previously fan-outed one HTTP call per hospital for each of these counts;
 * the bulk endpoint collapses them into one query.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import externalSurgeryRouter from "../server/routes/externalSurgery";

const uniq = () => randomUUID().slice(0, 8);

let hospA: string;
let hospB: string;
let hospForbidden: string;
let unitA: string;
let unitB: string;
let unitForbidden: string;
let memberUser: string;
let surgeonRefId: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdRequestIds: string[] = [];
const createdActionIds: string[] = [];
const createdSurgeryIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(externalSurgeryRouter);
  return app;
}

async function mkHospital(name: string) {
  const [h] = await db.insert(hospitals).values({ name } as any).returning();
  createdHospitalIds.push(h.id);
  return h.id;
}

async function mkUnit(hospitalId: string, name: string) {
  const [u] = await db
    .insert(units)
    .values({ hospitalId, name, type: "anesthesia" } as any)
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

async function mkRole(userId: string, hospitalId: string, unitId: string, role: string) {
  const [r] = await db
    .insert(userHospitalRoles)
    .values({ userId, hospitalId, unitId, role } as any)
    .returning();
  createdRoleIds.push(r.id);
  return r.id;
}

async function mkExternalRequest(hospitalId: string, status: string) {
  const [r] = await db
    .insert(externalSurgeryRequests)
    .values({
      hospitalId,
      surgeonFirstName: "T",
      surgeonLastName: "Surgeon",
      surgeonEmail: `${uniq()}@test.invalid`,
      surgeonPhone: "+41",
      patientFirstName: "P",
      patientLastName: "atient",
      surgeryDurationMinutes: 60,
      status,
      wishedDate: new Date().toISOString().split("T")[0],
    } as any)
    .returning();
  createdRequestIds.push(r.id);
  return r.id;
}

async function mkSurgery(hospitalId: string) {
  const [s] = await db
    .insert(surgeries)
    .values({ hospitalId, plannedDate: new Date() } as any)
    .returning();
  createdSurgeryIds.push(s.id);
  return s.id;
}

async function mkSurgeonAction(hospitalId: string, surgeryId: string, status: string) {
  const [a] = await db
    .insert(surgeonActionRequests)
    .values({
      hospitalId,
      surgeryId,
      surgeonEmail: `${uniq()}@test.invalid`,
      type: "cancellation",
      reason: "test",
      status,
    } as any)
    .returning();
  createdActionIds.push(a.id);
  return a.id;
}

beforeAll(async () => {
  hospA = await mkHospital(`ESC_A_${uniq()}`);
  hospB = await mkHospital(`ESC_B_${uniq()}`);
  hospForbidden = await mkHospital(`ESC_F_${uniq()}`);

  unitA = await mkUnit(hospA, "Anesthesia A");
  unitB = await mkUnit(hospB, "Anesthesia B");
  unitForbidden = await mkUnit(hospForbidden, "Anesthesia F");

  memberUser = await mkUser("esc-member");
  await mkRole(memberUser, hospA, unitA, "manager");
  await mkRole(memberUser, hospB, unitB, "admin");
  // hospForbidden: no role for memberUser — must not leak

  // External requests: 3 pending at A, 1 scheduled at B (excluded), 4 pending at hospForbidden (must not leak)
  for (let i = 0; i < 3; i++) await mkExternalRequest(hospA, "pending");
  await mkExternalRequest(hospB, "scheduled");
  for (let i = 0; i < 4; i++) await mkExternalRequest(hospForbidden, "pending");

  // Surgeon action requests: 2 pending at A, 0 at B, 5 pending at hospForbidden
  const sA1 = await mkSurgery(hospA);
  const sA2 = await mkSurgery(hospA);
  surgeonRefId = sA1;
  await mkSurgeonAction(hospA, sA1, "pending");
  await mkSurgeonAction(hospA, sA2, "pending");
  for (let i = 0; i < 5; i++) {
    const sF = await mkSurgery(hospForbidden);
    await mkSurgeonAction(hospForbidden, sF, "pending");
  }
});

afterAll(async () => {
  if (createdActionIds.length) {
    await db.delete(surgeonActionRequests).where(inArray(surgeonActionRequests.id, createdActionIds)).catch(() => {});
  }
  if (createdSurgeryIds.length) {
    await db.delete(surgeries).where(inArray(surgeries.id, createdSurgeryIds)).catch(() => {});
  }
  if (createdRequestIds.length) {
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, createdRequestIds)).catch(() => {});
  }
  if (createdRoleIds.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds)).catch(() => {});
  }
  if (createdUnitIds.length) {
    await db.delete(units).where(inArray(units.id, createdUnitIds)).catch(() => {});
  }
  if (createdHospitalIds.length) {
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds)).catch(() => {});
  }
  if (createdUserIds.length) {
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
  await pool.end();
});

describe("GET /api/external-surgery-requests-counts", () => {
  it("returns per-hospital pending counts, zero-filling accessible-but-empty IDs", async () => {
    const app = buildApp(memberUser);
    const res = await request(app).get(
      `/api/external-surgery-requests-counts?hospitalIds=${hospA},${hospB}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(3);
    expect(res.body.counts[hospB]).toBe(0);
  });

  it("silently drops hospitalIds the caller has no role in", async () => {
    const app = buildApp(memberUser);
    const res = await request(app).get(
      `/api/external-surgery-requests-counts?hospitalIds=${hospA},${hospForbidden}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(3);
    expect(res.body.counts[hospForbidden]).toBeUndefined();
  });

  it("returns empty counts when no hospitalIds provided", async () => {
    const app = buildApp(memberUser);
    const res = await request(app).get(`/api/external-surgery-requests-counts`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({});
  });
});

describe("GET /api/surgeon-action-requests-counts", () => {
  it("returns per-hospital pending counts", async () => {
    const app = buildApp(memberUser);
    const res = await request(app).get(
      `/api/surgeon-action-requests-counts?hospitalIds=${hospA},${hospB}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(2);
    expect(res.body.counts[hospB]).toBe(0);
  });

  it("silently drops inaccessible hospitalIds", async () => {
    const app = buildApp(memberUser);
    const res = await request(app).get(
      `/api/surgeon-action-requests-counts?hospitalIds=${hospA},${hospForbidden}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(2);
    expect(res.body.counts[hospForbidden]).toBeUndefined();
  });
});
