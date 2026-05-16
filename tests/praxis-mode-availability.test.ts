// tests/praxis-mode-availability.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, surgeries, surgeryRooms, referralPartnerships, units } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital } from "../server/storage/praxisMode";

// Mock auth so tests can drive context via headers
vi.mock("../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => next(),
  requireWriteAccess: (req: any, _res: any, next: any) => next(),
}));

import { referralPartnershipsRouter } from "../server/routes/referralPartnerships";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const userId = req.headers["x-test-user-id"];
    const hospitalId = req.headers["x-test-hospital-id"];
    if (userId && hospitalId) {
      req.user = { id: String(userId), activeHospitalId: String(hospitalId) };
    }
    next();
  });
  app.use(referralPartnershipsRouter);
  return app;
}

const app = buildApp();

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[] };
afterAll(async () => {
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  for (const hId of created.hospitals) {
    await db.delete(surgeries).where(eq(surgeries.hospitalId, hId));
    await db.delete(surgeryRooms).where(eq(surgeryRooms.hospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.sourceHospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.destinationHospitalId, hId));
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hId));
    await db.delete(units).where(eq(units.hospitalId, hId));
  }
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  await pool.end();
});

describe("GET /api/referral-partnerships/:id/availability", () => {
  it("returns anonymized busy windows for paired destination", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [room] = await db.insert(surgeryRooms).values({
      hospitalId: dest.id, name: "OP1", type: "OP",
    }).returning();
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const [destSurgery] = await db.insert(surgeries).values({
      hospitalId: dest.id, surgeryRoomId: room.id, plannedDate: future,
      plannedSurgery: "X", status: "planned", planningStatus: "pre-registered",
    } as any).returning();
    created.surgeries.push(destSurgery.id);

    const [surgeon] = await db.insert(users).values({ email: `av-${Date.now()}@t.local`, firstName: "A", lastName: "B" }).returning();
    created.users.push(surgeon.id);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const from = new Date(Date.now()).toISOString();
    const to = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await request(app)
      .get(`/api/referral-partnerships/${dest.id}/availability?from=${from}&to=${to}`)
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.busyWindows)).toBe(true);
    expect(res.body.busyWindows.length).toBeGreaterThanOrEqual(1);
    expect(res.body.busyWindows[0]).not.toHaveProperty("patientName");
    expect(res.body.busyWindows[0]).toHaveProperty("start");
    expect(res.body.busyWindows[0]).toHaveProperty("end");
    expect(res.body.busyWindows[0]).toHaveProperty("reason");
  });

  it("returns 403 when no active partnership exists", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D2 ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `av-${Date.now()}-b@t.local`, firstName: "A", lastName: "B" }).returning();
    created.users.push(surgeon.id);
    const [orig] = await db.insert(hospitals).values({ name: `Orig ${Date.now()}`, tenantType: "clinic" }).returning();
    created.hospitals.push(orig.id);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: orig.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const res = await request(app)
      .get(`/api/referral-partnerships/${dest.id}/availability?from=${new Date().toISOString()}&to=${new Date(Date.now()+3600000).toISOString()}`)
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId);
    expect(res.status).toBe(403);
  });
});
