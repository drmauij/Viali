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
  surgeries,
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
let providerAId: string;  // has treatments
let providerBId: string;  // has surgeries
let staffUserId: string;
let patientId: string;
let serviceId: string;
const createdTreatmentIds: string[] = [];
const createdSurgeryIds: string[] = [];

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `Test-${uniq()}` } as any).returning();
  hospitalId = h.id;
  const [u] = await db.insert(units).values({ hospitalId, name: "Clinic Unit", type: "clinic" } as any).returning();
  unitId = u.id;

  const [admin] = await db.insert(users).values({ email: `admin-${uniq()}@test.test`, firstName: "Admin", lastName: "User" } as any).returning();
  adminUserId = admin.id;
  await db.insert(userHospitalRoles).values({ userId: adminUserId, hospitalId, unitId, role: "admin" } as any);

  const [staff] = await db.insert(users).values({ email: `staff-${uniq()}@test.test`, firstName: "Staff", lastName: "User" } as any).returning();
  staffUserId = staff.id;
  await db.insert(userHospitalRoles).values({ userId: staffUserId, hospitalId, unitId, role: "staff" } as any);

  // Provider A — only treatments
  const [provA] = await db.insert(users).values({ email: `provA-${uniq()}@test.test`, firstName: "Meier" } as any).returning();
  providerAId = provA.id;

  // Provider B — only surgeries
  const [provB] = await db.insert(users).values({ email: `provB-${uniq()}@test.test`, firstName: "Schmid" } as any).returning();
  providerBId = provB.id;

  // Seed a clinic service for treatment lines (check constraint requires serviceId or itemId)
  const [svc] = await db.insert(clinicServices).values({ hospitalId, unitId, name: "Test Service" } as any).returning();
  serviceId = svc.id;

  const [p] = await db.insert(patients).values({
    hospitalId,
    firstName: "Pat",
    surname: "Test",
    patientNumber: `PRP-${uniq()}`,
    birthday: "1990-01-01",
    sex: "F",
  } as any).returning();
  patientId = p.id;

  // Provider A: 2 treatments, 200 + 300 revenue
  for (const total of ["200.00", "300.00"]) {
    const [tr] = await db.insert(treatments).values({
      hospitalId, patientId, providerId: providerAId,
      performedAt: new Date(), status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);
    await db.insert(treatmentLines).values({
      treatmentId: tr.id, serviceId, unitPrice: total, total,
    } as any);
  }

  // Provider B: 1 surgery (today) — plannedDate is a timestamp column
  const [sr] = await db.insert(surgeries).values({
    hospitalId,
    patientId,
    surgeonId: providerBId,
    plannedDate: new Date(),
    isArchived: false,
  } as any).returning();
  createdSurgeryIds.push(sr.id);
});

afterAll(async () => {
  if (createdSurgeryIds.length) {
    await db.delete(surgeries).where(inArray(surgeries.id, createdSurgeryIds));
  }
  if (createdTreatmentIds.length) {
    await db.delete(treatments).where(inArray(treatments.id, createdTreatmentIds));
  }
  await db.delete(clinicServices).where(eq(clinicServices.id, serviceId));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [adminUserId, staffUserId]));
  await db.delete(users).where(inArray(users.id, [adminUserId, staffUserId, providerAId, providerBId]));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/business/:hospitalId/providers-performance", () => {
  it("returns per-provider counts, revenue, and nullable utilization for admin", async () => {
    const res = await request(buildApp(adminUserId))
      .get(`/api/business/${hospitalId}/providers-performance?range=30d`);
    expect(res.status).toBe(200);
    expect(res.body.providers).toBeDefined();
    expect(Array.isArray(res.body.providers)).toBe(true);

    const provA = res.body.providers.find((p: any) => p.providerId === providerAId);
    const provB = res.body.providers.find((p: any) => p.providerId === providerBId);
    expect(provA).toBeDefined();
    expect(provB).toBeDefined();

    expect(provA.treatmentsCount).toBe(2);
    expect(provA.surgeriesCount).toBe(0);
    expect(provA.revenue).toBe(500);
    expect(provA.utilizationPct).toBeNull();

    expect(provB.treatmentsCount).toBe(0);
    expect(provB.surgeriesCount).toBe(1);
    expect(provB.utilizationPct).toBeNull();

    // Sort: highest revenue first (provA at 500, provB at 0)
    expect(res.body.providers[0].providerId).toBe(providerAId);
  });

  it("rejects non-business-manager users with 403", async () => {
    const res = await request(buildApp(staffUserId))
      .get(`/api/business/${hospitalId}/providers-performance?range=30d`);
    expect(res.status).toBe(403);
  });
});
