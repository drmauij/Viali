import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  units,
  userHospitalRoles,
  users,
  leads,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * VIALI-QQ fix: bulk leads-count endpoint replaces the N+1 useQueries fan-out
 * on the sidebar. Per-hospital access is enforced inside the handler (the
 * batch can mix accessible and inaccessible IDs); inaccessible IDs are
 * silently dropped so the sidebar keeps rendering instead of erroring.
 */

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import leadsRouter from "../server/routes/leads";

const uniq = () => randomUUID().slice(0, 8);

let hospA: string;
let hospB: string;
let hospForbidden: string;
let unitA: string;
let unitB: string;
let unitForbidden: string;
let managerUser: string;

const createdUserIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];
const createdRoleIds: string[] = [];
const createdLeadIds: string[] = [];

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(leadsRouter);
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

async function mkLead(hospitalId: string, status: string) {
  const [l] = await db
    .insert(leads)
    .values({
      hospitalId,
      firstName: `First-${uniq()}`,
      lastName: `Last-${uniq()}`,
      email: `${uniq()}@test.invalid`,
      source: "ig",
      status,
    } as any)
    .returning();
  createdLeadIds.push(l.id);
  return l.id;
}

beforeAll(async () => {
  hospA = await mkHospital(`LCB_A_${uniq()}`);
  hospB = await mkHospital(`LCB_B_${uniq()}`);
  hospForbidden = await mkHospital(`LCB_F_${uniq()}`);

  unitA = await mkUnit(hospA, "Clinic A");
  unitB = await mkUnit(hospB, "Clinic B");
  unitForbidden = await mkUnit(hospForbidden, "Clinic F");

  managerUser = await mkUser("lcb-mgr");
  // Access at A + B (manager/marketing), no access at hospForbidden.
  await mkRole(managerUser, hospA, unitA, "manager");
  await mkRole(managerUser, hospB, unitB, "marketing");

  // 2 new leads at A, 0 new at B (just one closed), 5 new at hospForbidden
  // (which should never leak into the response).
  await mkLead(hospA, "new");
  await mkLead(hospA, "new");
  await mkLead(hospB, "closed");
  for (let i = 0; i < 5; i++) await mkLead(hospForbidden, "new");
});

afterAll(async () => {
  if (createdLeadIds.length) {
    await db.delete(leads).where(inArray(leads.id, createdLeadIds)).catch(() => {});
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

describe("GET /api/leads-counts — bulk badge counts", () => {
  it("returns per-hospital counts keyed by hospitalId, zero-filling accessible-but-empty IDs", async () => {
    const app = buildApp(managerUser);
    const res = await request(app).get(`/api/leads-counts?hospitalIds=${hospA},${hospB}`);
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(2);
    expect(res.body.counts[hospB]).toBe(0);
  });

  it("silently drops hospitalIds the caller has no role in", async () => {
    const app = buildApp(managerUser);
    const res = await request(app).get(
      `/api/leads-counts?hospitalIds=${hospA},${hospForbidden}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(2);
    expect(res.body.counts[hospForbidden]).toBeUndefined();
  });

  it("returns an empty counts object when no hospitalIds are provided", async () => {
    const app = buildApp(managerUser);
    const res = await request(app).get(`/api/leads-counts`);
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({});
  });

  it("dedups duplicated hospitalIds in the query string", async () => {
    const app = buildApp(managerUser);
    const res = await request(app).get(
      `/api/leads-counts?hospitalIds=${hospA},${hospA},${hospA}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.counts[hospA]).toBe(2);
  });
});
