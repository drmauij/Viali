import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  units,
  users,
  userHospitalRoles,
  patients,
  treatments,
  treatmentLines,
  clinicServices,
} from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessRouter from "../server/routes/business";

function buildApp(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { id: userId }; next(); });
  app.use(businessRouter);
  return app;
}

const uniq = () => randomUUID().slice(0, 8);

let hospitalId: string;
let unitId: string;
let adminUserId: string;
let staffUserId: string;
let patientId: string;
let serviceBotoxId: string;
let serviceFillerId: string;
const createdTreatmentIds: string[] = [];

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `Test-${uniq()}` } as any).returning();
  hospitalId = h.id;

  const [u] = await db.insert(units).values({ hospitalId, name: "Clinic Unit", type: "clinic" } as any).returning();
  unitId = u.id;

  const [admin] = await db.insert(users).values({ email: `admin-${uniq()}@test.test`, firstName: "Admin" } as any).returning();
  adminUserId = admin.id;
  await db.insert(userHospitalRoles).values({ userId: adminUserId, hospitalId, unitId, role: "admin" } as any);

  const [staff] = await db.insert(users).values({ email: `staff-${uniq()}@test.test`, firstName: "Staff" } as any).returning();
  staffUserId = staff.id;
  await db.insert(userHospitalRoles).values({ userId: staffUserId, hospitalId, unitId, role: "staff" } as any);

  const [p] = await db.insert(patients).values({ hospitalId, patientNumber: `BTS-${uniq()}`, firstName: "Pat", surname: "Test", birthday: "1990-01-01", sex: "F" } as any).returning();
  patientId = p.id;

  const [svcB] = await db.insert(clinicServices).values({
    hospitalId, unitId, name: "Botox",
  } as any).returning();
  serviceBotoxId = svcB.id;

  const [svcF] = await db.insert(clinicServices).values({
    hospitalId, unitId, name: "Lip Filler",
  } as any).returning();
  serviceFillerId = svcF.id;

  // Seed 3 treatments: 2 Botox (revenue 200 + 300 = 500), 1 Lip Filler (400).
  // All signed, all within the last 30 days.
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const [svc, total, when] of [
    [serviceBotoxId, "200.00", now],
    [serviceBotoxId, "300.00", yesterday],
    [serviceFillerId, "400.00", now],
  ] as const) {
    const [tr] = await db.insert(treatments).values({
      hospitalId, patientId, providerId: adminUserId,
      performedAt: when, status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);
    await db.insert(treatmentLines).values({
      treatmentId: tr.id, serviceId: svc,
      unitPrice: total, total,
    } as any);
  }
});

afterAll(async () => {
  if (createdTreatmentIds.length) {
    await db.delete(treatments).where(inArray(treatments.id, createdTreatmentIds));
  }
  await db.delete(clinicServices).where(inArray(clinicServices.id, [serviceBotoxId, serviceFillerId]));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [adminUserId, staffUserId]));
  await db.delete(users).where(inArray(users.id, [adminUserId, staffUserId]));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/business/:hospitalId/treatments-summary", () => {
  it("returns top treatments ranked by revenue and byDay aggregation for admin user", async () => {
    const res = await request(buildApp(adminUserId))
      .get(`/api/business/${hospitalId}/treatments-summary?range=30d`);
    expect(res.status).toBe(200);
    expect(res.body.topTreatments).toBeDefined();
    expect(res.body.byDay).toBeDefined();
    // Botox outranks Lip Filler (500 vs 400)
    const names = res.body.topTreatments.map((t: any) => t.name);
    expect(names[0]).toBe("Botox");
    expect(names[1]).toBe("Lip Filler");
    const botox = res.body.topTreatments.find((t: any) => t.name === "Botox");
    expect(botox.revenue).toBe(500);
    expect(botox.count).toBe(2);
    // byDay has entries
    expect(res.body.byDay.length).toBeGreaterThan(0);
    expect(res.body.byDay[0].revenue).toBeGreaterThan(0);
  });

  it("rejects non-business-manager users with 403", async () => {
    const res = await request(buildApp(staffUserId))
      .get(`/api/business/${hospitalId}/treatments-summary?range=30d`);
    expect(res.status).toBe(403);
  });
});
