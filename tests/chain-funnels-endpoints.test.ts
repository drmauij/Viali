import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, hospitalGroups, units, users, userHospitalRoles, leads } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import { chainRouter } from "../server/routes/chain";

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { if (userId) req.user = { id: userId }; next(); });
  app.use(chainRouter);
  return app;
}

const uniq = () => randomUUID().slice(0, 8);

let groupId: string, otherGroupId: string;
let hosp1: string, hosp2: string, hospOther: string;
let unit1: string, unit2: string, unitOther: string;
let chainAdminId: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `G-${uniq()}` } as any).returning();
  groupId = g.id;
  const [og] = await db.insert(hospitalGroups).values({ name: `OG-${uniq()}` } as any).returning();
  otherGroupId = og.id;

  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId } as any).returning();
  hosp1 = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId } as any).returning();
  hosp2 = h2.id;
  const [hO] = await db.insert(hospitals).values({ name: `HO-${uniq()}`, groupId: otherGroupId } as any).returning();
  hospOther = hO.id;

  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2, name: "Clinic", type: "clinic" } as any).returning();
  unit2 = u2.id;
  const [uO] = await db.insert(units).values({ hospitalId: hospOther, name: "Clinic", type: "clinic" } as any).returning();
  unitOther = uO.id;

  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: chainAdminId, hospitalId: hosp1, unitId: unit1, role: "group_admin" } as any);
});

afterAll(async () => {
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, chainAdminId));
  await db.delete(users).where(eq(users.id, chainAdminId));
  await db.delete(units).where(inArray(units.id, [unit1, unit2, unitOther]));
  await db.update(hospitals).set({ groupId: null }).where(inArray(hospitals.id, [hosp1, hosp2, hospOther]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1, hosp2, hospOther]));
  await db.delete(hospitalGroups).where(inArray(hospitalGroups.id, [groupId, otherGroupId]));
  await pool.end();
});

describe("chain endpoints — hospitalIds validation", () => {
  it("rejects a hospitalId from another group", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/leads?hospitalIds=${hospOther}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/chain/:groupId/leads", () => {
  beforeAll(async () => {
    const now = new Date();
    await db.insert(leads).values([
      { hospitalId: hosp1, source: "instagram", firstName: "T", lastName: "T", status: "new", createdAt: now } as any,
      { hospitalId: hosp1, source: "google", firstName: "T", lastName: "T", status: "new", createdAt: now } as any,
      { hospitalId: hosp2, source: "instagram", firstName: "T", lastName: "T", status: "new", createdAt: now } as any,
    ]);
  });
  afterAll(async () => {
    await db.delete(leads).where(inArray(leads.hospitalId, [hosp1, hosp2]));
  });

  it("returns leads aggregated across all selected clinics", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/leads?hospitalIds=${hosp1},${hosp2}&limit=100`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
  });

  it("filters when only one hospitalId is requested", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/leads?hospitalIds=${hosp1}&limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("defaults to all clinics in group when hospitalIds is empty", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/leads?limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });
});

describe("GET /api/chain/:groupId/leads-stats", () => {
  it("returns 200 with stats shape", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/leads-stats?hospitalIds=${hosp1},${hosp2}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("total");
  });
});
