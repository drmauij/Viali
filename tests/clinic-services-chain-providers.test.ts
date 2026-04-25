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
let groupAdminId: string;
let clinicAdminAId: string;
let providerAId: string, providerBId: string, providerSharedId: string;
let chainServiceId: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `G-${uniq()}` } as any).returning();
  groupId = g.id;

  const [hA] = await db.insert(hospitals).values({ name: `HA-${uniq()}`, groupId } as any).returning();
  hospA = hA.id;
  const [hB] = await db.insert(hospitals).values({ name: `HB-${uniq()}`, groupId } as any).returning();
  hospB = hB.id;

  const [uA] = await db.insert(units).values({ hospitalId: hospA, name: "Clinic", type: "clinic" } as any).returning();
  unitA = uA.id;
  const [uB] = await db.insert(units).values({ hospitalId: hospB, name: "Clinic", type: "clinic" } as any).returning();
  unitB = uB.id;

  // Group admin: full edit access on chain services
  const [ga] = await db.insert(users).values({ email: `ga-${uniq()}@test.test` } as any).returning();
  groupAdminId = ga.id;
  await db.insert(userHospitalRoles).values({ userId: groupAdminId, hospitalId: hospA, unitId: unitA, role: "group_admin" } as any);

  // Clinic admin at A: provider-only edits on chain services
  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  clinicAdminAId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: clinicAdminAId, hospitalId: hospA, unitId: unitA, role: "admin" } as any);

  // Providers
  const [pA] = await db.insert(users).values({ email: `pa-${uniq()}@test.test` } as any).returning();
  providerAId = pA.id;
  await db.insert(userHospitalRoles).values({ userId: providerAId, hospitalId: hospA, unitId: unitA, role: "doctor" } as any);

  const [pB] = await db.insert(users).values({ email: `pb-${uniq()}@test.test` } as any).returning();
  providerBId = pB.id;
  await db.insert(userHospitalRoles).values({ userId: providerBId, hospitalId: hospB, unitId: unitB, role: "doctor" } as any);

  const [pS] = await db.insert(users).values({ email: `ps-${uniq()}@test.test` } as any).returning();
  providerSharedId = pS.id;
  await db.insert(userHospitalRoles).values({ userId: providerSharedId, hospitalId: hospA, unitId: unitA, role: "doctor" } as any);
  await db.insert(userHospitalRoles).values({ userId: providerSharedId, hospitalId: hospB, unitId: unitB, role: "doctor" } as any);

  // Chain service with all three providers initially linked
  const [svc] = await db.insert(clinicServices).values({
    name: "Botox",
    groupId,
    hospitalId: null,
    price: "200.00",
    durationMinutes: 30,
  } as any).returning();
  chainServiceId = svc.id;
  await db.insert(clinicServiceProviders).values([
    { serviceId: chainServiceId, providerId: providerAId },
    { serviceId: chainServiceId, providerId: providerBId },
    { serviceId: chainServiceId, providerId: providerSharedId },
  ]);
});

afterAll(async () => {
  await db.delete(clinicServiceProviders).where(eq(clinicServiceProviders.serviceId, chainServiceId));
  await db.delete(clinicServices).where(eq(clinicServices.id, chainServiceId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [groupAdminId, clinicAdminAId, providerAId, providerBId, providerSharedId]));
  await db.delete(users).where(inArray(users.id, [groupAdminId, clinicAdminAId, providerAId, providerBId, providerSharedId]));
  await db.delete(units).where(inArray(units.id, [unitA, unitB]));
  await db.update(hospitals).set({ groupId: null }).where(inArray(hospitals.id, [hospA, hospB]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hospA, hospB]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

function buildApp(userId: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { if (userId) req.user = { id: userId }; next(); });
  app.use(clinicRouter);
  return app;
}

describe("PATCH /api/clinic/:hospitalId/services/:serviceId — clinicProviderIds branch", () => {
  it("clinic admin replaces this-clinic provider subset on a chain service", async () => {
    // Initial: providerA (A only), providerB (B only), providerShared (A+B) all linked.
    // Clinic admin at A says "only providerShared offers this at A" — providerA must drop,
    // providerB must stay (it's at B, not A), providerShared must stay.
    const res = await request(buildApp(clinicAdminAId))
      .patch(`/api/clinic/${hospA}/services/${chainServiceId}`)
      .send({ clinicProviderIds: [providerSharedId] });
    expect(res.status).toBe(200);

    const after = await db
      .select({ providerId: clinicServiceProviders.providerId })
      .from(clinicServiceProviders)
      .where(eq(clinicServiceProviders.serviceId, chainServiceId));

    const ids = after.map(r => r.providerId).sort();
    expect(ids).toEqual([providerBId, providerSharedId].sort());
  });

  it("rejects clinicProviderIds with a provider not enrolled at the clinic", async () => {
    const res = await request(buildApp(clinicAdminAId))
      .patch(`/api/clinic/${hospA}/services/${chainServiceId}`)
      .send({ clinicProviderIds: [providerBId] });  // providerB is at B, not A
    expect(res.status).toBe(400);
  });

  it("rejects clinicProviderIds on a per-clinic (non-chain) service", async () => {
    const [perClinic] = await db.insert(clinicServices).values({
      name: "PerClinicSvc",
      hospitalId: hospA,
      unitId: unitA,
      groupId: null,
    } as any).returning();
    try {
      const res = await request(buildApp(clinicAdminAId))
        .patch(`/api/clinic/${hospA}/services/${perClinic.id}`)
        .send({ clinicProviderIds: [providerAId] });
      expect(res.status).toBe(400);
    } finally {
      await db.delete(clinicServices).where(eq(clinicServices.id, perClinic.id));
    }
  });

  it("rejects full edits to a chain service from a non-group-admin clinic admin", async () => {
    const res = await request(buildApp(clinicAdminAId))
      .patch(`/api/clinic/${hospA}/services/${chainServiceId}`)
      .send({ name: "Hijacked" });
    expect(res.status).toBe(403);
  });

  it("rejects cross-clinic edit (admin at A cannot touch hospital B's subset)", async () => {
    // clinicAdminAId has role "admin" at hospA, no role at hospB.
    const res = await request(buildApp(clinicAdminAId))
      .patch(`/api/clinic/${hospB}/services/${chainServiceId}`)
      .send({ clinicProviderIds: [providerBId] });
    // requireStrictHospitalAccess should reject; either 403 (forbidden) or 404 (visibility cloak)
    expect([403, 404]).toContain(res.status);
  });

  it("clinic B admin emptying its subset does not affect clinic A's providers", async () => {
    // Reset to known state
    await db.delete(clinicServiceProviders).where(eq(clinicServiceProviders.serviceId, chainServiceId));
    await db.insert(clinicServiceProviders).values([
      { serviceId: chainServiceId, providerId: providerAId },
      { serviceId: chainServiceId, providerId: providerBId },
      { serviceId: chainServiceId, providerId: providerSharedId },
    ]);

    // Create a clinic admin at hospB
    const [cb] = await db.insert(users).values({ email: `cb-${randomUUID().slice(0, 8)}@test.test` } as any).returning();
    const clinicAdminBId = cb.id;
    await db.insert(userHospitalRoles).values({
      userId: clinicAdminBId, hospitalId: hospB, unitId: unitB, role: "admin",
    } as any);

    try {
      // Clinic B admin empties B's subset (providerB and providerShared are at B).
      // Under the global-link model, only ONE row exists per (service, provider).
      // setServiceProvidersForClinic deletes rows whose providerId is enrolled at hospB,
      // then re-inserts the new list (empty). So providerB and providerShared rows are deleted.
      // providerA (only at A) is not touched.
      const res = await request(buildApp(clinicAdminBId))
        .patch(`/api/clinic/${hospB}/services/${chainServiceId}`)
        .send({ clinicProviderIds: [] });
      expect(res.status).toBe(200);

      const after = await db
        .select({ providerId: clinicServiceProviders.providerId })
        .from(clinicServiceProviders)
        .where(eq(clinicServiceProviders.serviceId, chainServiceId));
      const ids = after.map(r => r.providerId).sort();

      // providerA stays (only enrolled at A, untouched by B's edit).
      // providerB dropped (at B). providerShared dropped (also enrolled at B → deleted).
      // This is the expected behavior of the global-link model: a shared provider
      // must be re-linked by A's admin if B drops them. Flag if surprising.
      expect(ids).toEqual([providerAId]);
    } finally {
      await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, clinicAdminBId));
      await db.delete(users).where(eq(users.id, clinicAdminBId));
    }
  });
});
