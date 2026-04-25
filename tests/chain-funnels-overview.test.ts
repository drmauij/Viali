import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  hospitalGroups,
  units,
  users,
  userHospitalRoles,
  leads,
  referralEvents,
  patients,
} from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import { chainRouter } from "../server/routes/chain";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string, hosp1: string, hosp2: string;
let unit1: string, unit2: string;
let chainAdminId: string;
let patient1: string, patient2: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `OG-${uniq()}` } as any).returning();
  groupId = g.id;
  const [h1] = await db.insert(hospitals).values({ name: `H1`, groupId, currency: "CHF" } as any).returning();
  hosp1 = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2`, groupId, currency: "CHF" } as any).returning();
  hosp2 = h2.id;
  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2, name: "Clinic", type: "clinic" } as any).returning();
  unit2 = u2.id;
  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({
    userId: chainAdminId,
    hospitalId: hosp1,
    unitId: unit1,
    role: "group_admin",
  } as any);

  // Seed patients for referral_events (patient_id is NOT NULL)
  const [p1] = await db.insert(patients).values({
    hospitalId: hosp1,
    patientNumber: `P-${uniq()}`,
    surname: "Test",
    firstName: "Alice",
    birthday: "1990-01-01",
    sex: "F",
  } as any).returning();
  patient1 = p1.id;

  const [p2] = await db.insert(patients).values({
    hospitalId: hosp2,
    patientNumber: `P-${uniq()}`,
    surname: "Test",
    firstName: "Bob",
    birthday: "1985-06-15",
    sex: "M",
  } as any).returning();
  patient2 = p2.id;

  const now = new Date();
  // 3 leads at hosp1 with source "instagram"
  for (let i = 0; i < 3; i++) {
    await db.insert(leads).values({
      hospitalId: hosp1,
      source: "instagram",
      firstName: "T",
      lastName: "T",
      status: "new",
      createdAt: now,
    } as any);
  }
  // 2 leads at hosp1 with source "google"
  for (let i = 0; i < 2; i++) {
    await db.insert(leads).values({
      hospitalId: hosp1,
      source: "google",
      firstName: "T",
      lastName: "T",
      status: "new",
      createdAt: now,
    } as any);
  }
  // 2 leads at hosp2 with source "instagram"
  for (let i = 0; i < 2; i++) {
    await db.insert(leads).values({
      hospitalId: hosp2,
      source: "instagram",
      firstName: "T",
      lastName: "T",
      status: "new",
      createdAt: now,
    } as any);
  }
  // 2 referral events (one per clinic) with source "google"
  await db.insert(referralEvents).values([
    { hospitalId: hosp1, patientId: patient1, source: "google", utmSource: "google", captureMethod: "utm", createdAt: now } as any,
    { hospitalId: hosp2, patientId: patient2, source: "google", utmSource: "google", captureMethod: "utm", createdAt: now } as any,
  ]);
});

afterAll(async () => {
  await db.delete(leads).where(inArray(leads.hospitalId, [hosp1, hosp2]));
  await db.delete(referralEvents).where(inArray(referralEvents.hospitalId, [hosp1, hosp2]));
  await db.delete(patients).where(inArray(patients.id, [patient1, patient2]));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, chainAdminId));
  await db.delete(users).where(eq(users.id, chainAdminId));
  await db.delete(units).where(inArray(units.id, [unit1, unit2]));
  await db.update(hospitals).set({ groupId: null } as any).where(inArray(hospitals.id, [hosp1, hosp2]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1, hosp2]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    if (userId) req.user = { id: userId };
    next();
  });
  app.use(chainRouter);
  return app;
}

describe("GET /api/chain/:groupId/funnels-overview", () => {
  it("returns aggregated KPIs and per-clinic leaderboard", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${hosp2}&range=30d`);
    expect(res.status).toBe(200);
    // Total leads = 3 + 2 + 2 = 7
    expect(res.body.kpis.leads.current).toBe(7);
    // Total referrals = 2
    expect(res.body.kpis.referrals.current).toBe(2);
    // Leaderboard has one row per hospital
    expect(res.body.leaderboard).toHaveLength(2);
    const h1Row = res.body.leaderboard.find((r: any) => r.hospitalId === hosp1);
    expect(h1Row).toBeDefined();
    expect(h1Row.leads).toBe(5);
    // Heatmap sources include both seeds
    expect(res.body.heatmap.sources).toContain("instagram");
    expect(res.body.heatmap.sources).toContain("google");
    // SourceMix has at least one entry
    expect(res.body.sourceMix.leads.length).toBeGreaterThan(0);
    // Currency matches since both hospitals use CHF
    expect(res.body.currency).toBe("CHF");
  });

  it("returns null currency and null paidRevenue.current when scope spans currencies", async () => {
    await db.update(hospitals).set({ currency: "EUR" } as any).where(eq(hospitals.id, hosp2));
    try {
      const res = await request(buildApp(chainAdminId))
        .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${hosp2}&range=30d`);
      expect(res.status).toBe(200);
      expect(res.body.currency).toBeNull();
      expect(res.body.kpis.paidRevenue.current).toBeNull();
      expect(res.body.kpis.paidRevenue.prev).toBeNull();
      expect(res.body.kpis.paidRevenue.deltaPct).toBe(0);
    } finally {
      await db.update(hospitals).set({ currency: "CHF" } as any).where(eq(hospitals.id, hosp2));
    }
  });

  it("rejects 403 when scope contains a hospital outside the group", async () => {
    const [otherG] = await db.insert(hospitalGroups).values({ name: `OG2-${uniq()}` } as any).returning();
    const [otherH] = await db.insert(hospitals).values({ name: `OG2-H`, groupId: otherG.id } as any).returning();
    try {
      const res = await request(buildApp(chainAdminId))
        .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${otherH.id}&range=30d`);
      expect(res.status).toBe(403);
    } finally {
      await db.update(hospitals).set({ groupId: null } as any).where(eq(hospitals.id, otherH.id));
      await db.delete(hospitals).where(eq(hospitals.id, otherH.id));
      await db.delete(hospitalGroups).where(eq(hospitalGroups.id, otherG.id));
    }
  });

  it("returns valid shape for a single hospital", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1}&range=30d`);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    expect(res.body.kpis.leads.current).toBe(5);
    expect(res.body.leaderboard).toHaveLength(1);
    expect(res.body.heatmap.locations).toHaveLength(1);
  });

  it("rejects invalid range value with 400", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1}&range=7d`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/range/);
  });

  it("returns correct heatmap cells with source-level breakdowns", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${hosp2}&range=30d`);
    expect(res.status).toBe(200);
    const { cells } = res.body.heatmap;
    expect(Array.isArray(cells)).toBe(true);
    // hosp1 should have cells for instagram (3 leads) and google (2 leads)
    const h1Instagram = cells.find((c: any) => c.hospitalId === hosp1 && c.source === "instagram");
    expect(h1Instagram).toBeDefined();
    expect(h1Instagram.leads).toBe(3);
  });

  it("returns sourceMix pct that sums to ~100 when there are leads", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${hosp2}&range=30d`);
    expect(res.status).toBe(200);
    const { leads: leadsMix } = res.body.sourceMix;
    const total = leadsMix.reduce((s: number, r: any) => s + r.pct, 0);
    // Due to rounding, allow small epsilon
    expect(total).toBeGreaterThanOrEqual(99);
    expect(total).toBeLessThanOrEqual(101);
  });

  it("returns movers shape with up and down arrays", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/funnels-overview?hospitalIds=${hosp1},${hosp2}&range=30d`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.movers.up)).toBe(true);
    expect(Array.isArray(res.body.movers.down)).toBe(true);
  });
});
