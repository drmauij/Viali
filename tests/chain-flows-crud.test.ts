import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, hospitalGroups, units, users, userHospitalRoles, flows, flowHospitals } from "@shared/schema";
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

let groupId: string, hosp1: string, hosp2: string, hospOutside: string;
let unit1: string, unit2: string, unitOutside: string;
let chainAdminId: string;
let flowA: string, flowB: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `Test-${uniq()}` } as any).returning();
  groupId = g.id;
  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId } as any).returning();
  hosp1 = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId } as any).returning();
  hosp2 = h2.id;
  const [ho] = await db.insert(hospitals).values({ name: `HOutside-${uniq()}` } as any).returning();
  hospOutside = ho.id;
  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2, name: "Clinic", type: "clinic" } as any).returning();
  unit2 = u2.id;
  const [uo] = await db.insert(units).values({ hospitalId: hospOutside, name: "Clinic", type: "clinic" } as any).returning();
  unitOutside = uo.id;

  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: chainAdminId, hospitalId: hosp1, unitId: unit1, role: "group_admin" } as any);

  const [fa] = await db.insert(flows).values({
    hospitalId: hosp1, name: `Flow-A-${uniq()}`, status: "draft", createdBy: chainAdminId,
  } as any).returning();
  flowA = fa.id;
  await db.insert(flowHospitals).values({ flowId: flowA, hospitalId: hosp1 } as any);

  const [fb] = await db.insert(flows).values({
    hospitalId: hosp2, name: `Flow-B-${uniq()}`, status: "draft", createdBy: chainAdminId,
  } as any).returning();
  flowB = fb.id;
  await db.insert(flowHospitals).values({ flowId: flowB, hospitalId: hosp2 } as any);
});

afterAll(async () => {
  await db.delete(flowHospitals).where(inArray(flowHospitals.flowId, [flowA, flowB]));
  await db.delete(flows).where(inArray(flows.id, [flowA, flowB]));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, chainAdminId));
  await db.delete(users).where(eq(users.id, chainAdminId));
  await db.delete(units).where(inArray(units.id, [unit1, unit2, unitOutside]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1, hosp2, hospOutside]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

describe("Chain flows CRUD", () => {
  it("GET returns chain flows with audienceHospitals arrays", async () => {
    const res = await request(buildApp(chainAdminId)).get(`/api/chain/${groupId}/flows`);
    expect(res.status).toBe(200);
    expect(res.body.flows).toBeDefined();
    expect(res.body.flows.length).toBeGreaterThanOrEqual(2);
    const flow = res.body.flows.find((f: any) => f.id === flowA);
    expect(flow).toBeDefined();
    expect(flow.audienceHospitals).toEqual(
      expect.arrayContaining([{ hospitalId: hosp1, hospitalName: expect.any(String) }])
    );
  });

  it("POST creates a chain flow with multi-location audience", async () => {
    const res = await request(buildApp(chainAdminId))
      .post(`/api/chain/${groupId}/flows`)
      .send({
        hospitalId: hosp1,
        name: `MultiFlow-${uniq()}`,
        status: "draft",
        channel: "email",
        audienceHospitalIds: [hosp1, hosp2],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    const rows = await db.select().from(flowHospitals).where(eq(flowHospitals.flowId, res.body.id));
    expect(rows.length).toBe(2);
    await db.delete(flowHospitals).where(eq(flowHospitals.flowId, res.body.id));
    await db.delete(flows).where(eq(flows.id, res.body.id));
  });

  it("POST rejects audience including hospital outside the group", async () => {
    const res = await request(buildApp(chainAdminId))
      .post(`/api/chain/${groupId}/flows`)
      .send({
        hospitalId: hosp1,
        name: `EvilFlow-${uniq()}`,
        status: "draft",
        audienceHospitalIds: [hosp1, hospOutside],
      });
    expect([400, 403]).toContain(res.status);
  });

  it("PATCH replaces audience", async () => {
    const res = await request(buildApp(chainAdminId))
      .patch(`/api/chain/${groupId}/flows/${flowA}`)
      .send({ audienceHospitalIds: [hosp1, hosp2] });
    expect(res.status).toBe(200);
    const rows = await db.select().from(flowHospitals).where(eq(flowHospitals.flowId, flowA));
    expect(rows.length).toBe(2);
    // Revert
    await db.delete(flowHospitals).where(eq(flowHospitals.flowId, flowA));
    await db.insert(flowHospitals).values({ flowId: flowA, hospitalId: hosp1 } as any);
  });

  it("rejects non-chain-admin with 403", async () => {
    const [plain] = await db.insert(users).values({ email: `plain-${uniq()}@test.test` } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: plain.id, hospitalId: hosp1, unitId: unit1, role: "admin" } as any);
    const res = await request(buildApp(plain.id)).get(`/api/chain/${groupId}/flows`);
    expect(res.status).toBe(403);
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, plain.id));
    await db.delete(users).where(eq(users.id, plain.id));
  });
});
