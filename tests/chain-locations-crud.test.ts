import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, hospitalGroups, units, users, userHospitalRoles } from "@shared/schema";
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

let groupId: string, hosp1: string, hosp2: string, unit1: string;
let chainAdminId: string, plainAdminId: string;
const createdHospitalIds: string[] = [];

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({
    name: `Test-${uniq()}`,
    defaultLicenseType: "test",
    defaultPricePerRecord: "5.00",
  } as any).returning();
  groupId = g.id;
  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId } as any).returning();
  hosp1 = h1.id;
  createdHospitalIds.push(hosp1);
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId } as any).returning();
  hosp2 = h2.id;
  createdHospitalIds.push(hosp2);
  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;

  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({
    userId: chainAdminId, hospitalId: hosp1, unitId: unit1, role: "group_admin",
  } as any);
  const [pa] = await db.insert(users).values({ email: `pa-${uniq()}@test.test` } as any).returning();
  plainAdminId = pa.id;
  await db.insert(userHospitalRoles).values({
    userId: plainAdminId, hospitalId: hosp1, unitId: unit1, role: "admin",
  } as any);
});

afterAll(async () => {
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [chainAdminId, plainAdminId]));
  await db.delete(users).where(inArray(users.id, [chainAdminId, plainAdminId]));
  await db.delete(units).where(eq(units.id, unit1));
  await db.update(hospitals).set({ groupId: null }).where(inArray(hospitals.id, createdHospitalIds));
  await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

describe("Chain locations CRUD + billing", () => {
  it("GET /locations returns group hospitals with plan + group defaults", async () => {
    const res = await request(buildApp(chainAdminId)).get(`/api/chain/${groupId}/locations`);
    expect(res.status).toBe(200);
    expect(res.body.locations).toBeDefined();
    expect(res.body.locations.length).toBe(2);
    expect(res.body.locations[0]).toHaveProperty("hospitalId");
    expect(res.body.locations[0]).toHaveProperty("hospitalName");
    expect(res.body.locations[0]).toHaveProperty("licenseType");
    expect(res.body.groupDefaults).toBeDefined();
    expect(res.body.groupDefaults.defaultLicenseType).toBe("test");
  });

  it("POST /locations creates a new clinic in the group", async () => {
    const res = await request(buildApp(chainAdminId))
      .post(`/api/chain/${groupId}/locations`)
      .send({ name: `NewClinic-${uniq()}`, timezone: "Europe/Zurich", currency: "CHF" });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdHospitalIds.push(res.body.id);

    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, res.body.id));
    expect(h.groupId).toBe(groupId);
    expect(h.timezone).toBe("Europe/Zurich");
  });

  it("PATCH /locations/:hospitalId updates name + clinicKind", async () => {
    const res = await request(buildApp(chainAdminId))
      .patch(`/api/chain/${groupId}/locations/${hosp1}`)
      .send({ name: "Renamed-H1", clinicKind: "aesthetic" });
    expect(res.status).toBe(200);

    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hosp1));
    expect(h.name).toBe("Renamed-H1");
    expect(h.clinicKind).toBe("aesthetic");
  });

  it("DELETE /locations/:hospitalId archives by detaching from group", async () => {
    const res = await request(buildApp(chainAdminId))
      .delete(`/api/chain/${groupId}/locations/${hosp2}`);
    expect(res.status).toBe(204);

    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hosp2));
    expect(h.groupId).toBeNull();
    // Re-attach so afterAll catches it via createdHospitalIds
    await db.update(hospitals).set({ groupId }).where(eq(hospitals.id, hosp2));
  });

  it("PATCH /billing updates group defaults; cascade=true also writes to members", async () => {
    const res = await request(buildApp(chainAdminId))
      .patch(`/api/chain/${groupId}/billing`)
      .send({ defaultLicenseType: "basic", defaultPricePerRecord: "12.50", cascade: true });
    expect(res.status).toBe(200);

    const [g] = await db.select().from(hospitalGroups).where(eq(hospitalGroups.id, groupId));
    expect(g.defaultLicenseType).toBe("basic");

    const members = await db.select().from(hospitals).where(eq(hospitals.groupId, groupId));
    for (const h of members) {
      expect(h.licenseType).toBe("basic");
      expect(h.pricePerRecord).toBe("12.50");
    }
  });

  it("rejects plain admin (not group_admin) with 403", async () => {
    const res = await request(buildApp(plainAdminId)).get(`/api/chain/${groupId}/locations`);
    expect(res.status).toBe(403);
  });

  it("POST /locations: server uses URL groupId, not body.groupId (defence-in-depth)", async () => {
    const res = await request(buildApp(chainAdminId))
      .post(`/api/chain/${groupId}/locations`)
      .send({ name: `EvilClinic-${uniq()}`, groupId: "00000000-0000-0000-0000-000000000000" });
    if (res.status === 201) {
      const [h] = await db.select().from(hospitals).where(eq(hospitals.id, res.body.id));
      expect(h.groupId).toBe(groupId);
      createdHospitalIds.push(res.body.id);
    } else {
      expect([400, 403]).toContain(res.status);
    }
  });
});
