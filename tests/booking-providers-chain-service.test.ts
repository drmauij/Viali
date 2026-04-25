import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals, hospitalGroups, units, users, userHospitalRoles,
  clinicServices, clinicServiceProviders,
} from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import clinicRouter from "../server/routes/clinic";

const uniq = () => randomUUID().slice(0, 8);

let groupId: string;
let hospA: string, hospB: string;
let unitA: string, unitB: string;
let providerAId: string, providerBId: string;
let chainServiceId: string;
let bookingTokenA: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `G-${uniq()}` } as any).returning();
  groupId = g.id;

  bookingTokenA = `tok-${uniq()}`;
  const [hA] = await db.insert(hospitals).values({
    name: `HA-${uniq()}`,
    groupId,
    bookingToken: bookingTokenA,
  } as any).returning();
  hospA = hA.id;

  const [hB] = await db.insert(hospitals).values({
    name: `HB-${uniq()}`,
    groupId,
    bookingToken: `tok-${uniq()}`,
  } as any).returning();
  hospB = hB.id;

  const [uA] = await db.insert(units).values({ hospitalId: hospA, name: "Clinic", type: "clinic" } as any).returning();
  unitA = uA.id;
  const [uB] = await db.insert(units).values({ hospitalId: hospB, name: "Clinic", type: "clinic" } as any).returning();
  unitB = uB.id;

  // Provider A: only at hospital A, publicly bookable there
  const [pA] = await db.insert(users).values({
    email: `pa-${uniq()}@test.test`,
    firstName: "ProvA",
    lastName: "Test",
  } as any).returning();
  providerAId = pA.id;
  await db.insert(userHospitalRoles).values({
    userId: providerAId,
    hospitalId: hospA,
    unitId: unitA,
    role: "doctor",
    isBookable: true,
    publicCalendarEnabled: true,
  } as any);

  // Provider B: only at hospital B (NOT bookable at A)
  const [pB] = await db.insert(users).values({
    email: `pb-${uniq()}@test.test`,
    firstName: "ProvB",
    lastName: "Test",
  } as any).returning();
  providerBId = pB.id;
  await db.insert(userHospitalRoles).values({
    userId: providerBId,
    hospitalId: hospB,
    unitId: unitB,
    role: "doctor",
    isBookable: true,
    publicCalendarEnabled: true,
  } as any);

  // Chain service with both providers globally linked in clinic_service_providers
  const [svc] = await db.insert(clinicServices).values({
    name: `BotoxChain-${uniq()}`,
    groupId,
    hospitalId: null,
    price: "200.00",
    durationMinutes: 30,
  } as any).returning();
  chainServiceId = svc.id;
  await db.insert(clinicServiceProviders).values([
    { serviceId: chainServiceId, providerId: providerAId },
    { serviceId: chainServiceId, providerId: providerBId },
  ]);
});

afterAll(async () => {
  await db.delete(clinicServiceProviders).where(eq(clinicServiceProviders.serviceId, chainServiceId));
  await db.delete(clinicServices).where(eq(clinicServices.id, chainServiceId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [providerAId, providerBId]));
  await db.delete(users).where(inArray(users.id, [providerAId, providerBId]));
  await db.delete(units).where(inArray(units.id, [unitA, unitB]));
  await db.update(hospitals).set({ groupId: null }).where(inArray(hospitals.id, [hospA, hospB]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hospA, hospB]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(clinicRouter);
  return app;
}

describe("public booking endpoint — chain service providers", () => {
  it("filters providers to only those enrolled (and bookable) at the booking clinic", async () => {
    // GET /api/public/booking/:token/services returns { services: [...] }
    // Each service has a `providerIds: string[]` field.
    const res = await request(buildApp()).get(`/api/public/booking/${bookingTokenA}/services`);
    expect(res.status).toBe(200);

    const services: any[] = Array.isArray(res.body) ? res.body : res.body.services;
    expect(Array.isArray(services)).toBe(true);

    const chainSvc = services.find((s: any) => s.id === chainServiceId);
    expect(chainSvc).toBeDefined();

    // providerIds is the field name returned by getPublicBookableServicesByHospital
    const providerIds: string[] = chainSvc.providerIds ?? [];

    // Provider A is at hospital A — must appear
    expect(providerIds).toContain(providerAId);
    // Provider B is only at hospital B — must NOT appear on clinic A's booking page
    expect(providerIds).not.toContain(providerBId);
  });

  it("co-existing per-clinic services are unaffected by the chain-service intersection", async () => {
    // Regression sentinel: when chain services ship in the same response as
    // per-clinic services, the per-clinic ones must keep their own provider
    // list. We seed a hospital-A-local service linking only providerA, then
    // assert it appears on A's booking page with providerA listed.
    const [perClinicSvc] = await db.insert(clinicServices).values({
      name: `LocalSvc-${uniq()}`,
      hospitalId: hospA,
      unitId: unitA,
      groupId: null,
      price: "100.00",
      durationMinutes: 30,
    } as any).returning();
    await db.insert(clinicServiceProviders).values({
      serviceId: perClinicSvc.id,
      providerId: providerAId,
    });
    try {
      const res = await request(buildApp()).get(`/api/public/booking/${bookingTokenA}/services`);
      expect(res.status).toBe(200);
      const services: any[] = Array.isArray(res.body) ? res.body : res.body.services;
      const local = services.find((s: any) => s.id === perClinicSvc.id);
      expect(local).toBeDefined();
      expect(local.providerIds).toContain(providerAId);
      expect(local.providerIds).not.toContain(providerBId);
    } finally {
      await db.delete(clinicServiceProviders).where(eq(clinicServiceProviders.serviceId, perClinicSvc.id));
      await db.delete(clinicServices).where(eq(clinicServices.id, perClinicSvc.id));
    }
  });
});
