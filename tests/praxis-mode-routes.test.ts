// tests/praxis-mode-routes.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, referralPartnerships, surgeryRooms, units } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

// Mock auth so the test can drive context via headers
vi.mock("../server/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => next(),
  requireWriteAccess: (req: any, _res: any, next: any) => next(),
}));

import { praxisModeRouter } from "../server/routes/praxisMode";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const userId = req.headers["x-test-user-id"];
    const hospitalId = req.headers["x-test-hospital-id"];
    if (userId && hospitalId) {
      req.user = { id: String(userId), activeHospitalId: String(hospitalId) };
      req.surgeonPortalSession = { userId: String(userId), hospitalId: String(hospitalId) };
    }
    next();
  });
  app.use(praxisModeRouter);
  return app;
}

const app = buildApp();
const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  for (const hId of created.hospitals) {
    await db.delete(surgeryRooms).where(eq(surgeryRooms.hospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.sourceHospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.destinationHospitalId, hId));
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hId));
    await db.delete(units).where(eq(units.hospitalId, hId));
  }
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

describe("POST /api/surgeon-portal/praxis/activate", () => {
  it("provisions source hospital + auto-pairs + creates logical room + returns new hospital id", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}`, tenantType: "clinic" } as any).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `act-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);

    const res = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id)
      .set("x-test-hospital-id", dest.id)
      .send({ sourceName: "Praxis Mueller", password: "Test1234!" });
    expect(res.status).toBe(200);
    expect(res.body.sourceHospitalId).toBeTruthy();
    created.hospitals.push(res.body.sourceHospitalId);

    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, res.body.sourceHospitalId));
    expect(src.tenantType).toBe("praxis");

    const pairs = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, res.body.sourceHospitalId));
    expect(pairs.length).toBeGreaterThanOrEqual(1);

    const rooms = await db.select().from(surgeryRooms)
      .where(eq(surgeryRooms.hospitalId, res.body.sourceHospitalId));
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    expect(rooms.every(r => r.linkedHospitalId)).toBe(true);
  });

  it("returns 409 if surgeon already owns a source hospital", async () => {
    const [dest] = await db.insert(hospitals).values({ name: `D ${Date.now()}-b`, tenantType: "clinic" } as any).returning();
    created.hospitals.push(dest.id);
    const [surgeon] = await db.insert(users).values({ email: `dup-${Date.now()}@t.local`, firstName: "D", lastName: "D" }).returning();
    created.users.push(surgeon.id);

    const first = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", dest.id)
      .send({ sourceName: "First", password: "Test1234!" });
    expect(first.status).toBe(200);
    created.hospitals.push(first.body.sourceHospitalId);

    const second = await request(app)
      .post("/api/surgeon-portal/praxis/activate")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", dest.id)
      .send({ sourceName: "Second", password: "Test1234!" });
    expect(second.status).toBe(409);
  });
});
