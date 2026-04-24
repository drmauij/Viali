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
  patients,
  treatments,
  treatmentLines,
  surgeries,
  leads,
  clinicAppointments,
  clinicServices,
} from "@shared/schema";
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

let groupId: string;
let hosp1Id: string;
let hosp2Id: string;
let unit1Id: string;
let unit2Id: string;
let chainAdminId: string;
let plainAdminId: string;
let platformAdminId: string;
let providerId: string;
let patientId: string;
const createdTreatmentIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdLeadIds: string[] = [];
const createdApptIds: string[] = [];
let serviceBotoxId: string;

beforeAll(async () => {
  const [grp] = await db.insert(hospitalGroups).values({ name: `Test-Group-${uniq()}` } as any).returning();
  groupId = grp.id;

  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId, clinicKind: "aesthetic" } as any).returning();
  hosp1Id = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId, clinicKind: "aesthetic" } as any).returning();
  hosp2Id = h2.id;

  const [u1] = await db.insert(units).values({ hospitalId: hosp1Id, name: "Clinic", type: "clinic" } as any).returning();
  unit1Id = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2Id, name: "Clinic", type: "clinic" } as any).returning();
  unit2Id = u2.id;

  const [ca] = await db.insert(users).values({ email: `chain-admin-${uniq()}@test.test`, firstName: "Chain", lastName: "Admin" } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: chainAdminId, hospitalId: hosp1Id, unitId: unit1Id, role: "group_admin" } as any);

  const [pa] = await db.insert(users).values({ email: `plain-admin-${uniq()}@test.test`, firstName: "Plain", lastName: "Admin" } as any).returning();
  plainAdminId = pa.id;
  await db.insert(userHospitalRoles).values({ userId: plainAdminId, hospitalId: hosp1Id, unitId: unit1Id, role: "admin" } as any);

  const [plat] = await db.insert(users).values({ email: `plat-${uniq()}@test.test`, firstName: "Plat", isPlatformAdmin: true } as any).returning();
  platformAdminId = plat.id;

  const [prov] = await db.insert(users).values({ email: `prov-${uniq()}@test.test`, firstName: "Provider" } as any).returning();
  providerId = prov.id;

  const [p] = await db.insert(patients).values({
    hospitalId: hosp1Id, firstName: "Pat", surname: "Test",
    patientNumber: `CO-${uniq()}`, birthday: "1990-01-01", sex: "F",
  } as any).returning();
  patientId = p.id;

  const [svc] = await db.insert(clinicServices).values({
    hospitalId: hosp1Id, unitId: unit1Id, name: "Botox",
  } as any).returning();
  serviceBotoxId = svc.id;

  // Seed: hosp1 has 2 treatments at 200 each + 1 appt lead flow
  for (const amt of ["200.00", "200.00"]) {
    const [tr] = await db.insert(treatments).values({
      hospitalId: hosp1Id, patientId, providerId,
      performedAt: new Date(), status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);
    await db.insert(treatmentLines).values({
      treatmentId: tr.id, serviceId: serviceBotoxId,
      unitPrice: amt, total: amt,
    } as any);
  }

  // hosp2: 1 treatment at 100
  const [tr2] = await db.insert(treatments).values({
    hospitalId: hosp2Id, patientId, providerId,
    performedAt: new Date(), status: "signed",
  } as any).returning();
  createdTreatmentIds.push(tr2.id);
  await db.insert(treatmentLines).values({
    treatmentId: tr2.id, serviceId: serviceBotoxId,
    unitPrice: "100.00", total: "100.00",
  } as any);
});

afterAll(async () => {
  if (createdSurgeryIds.length) await db.delete(surgeries).where(inArray(surgeries.id, createdSurgeryIds));
  if (createdTreatmentIds.length) await db.delete(treatments).where(inArray(treatments.id, createdTreatmentIds));
  if (createdLeadIds.length) await db.delete(leads).where(inArray(leads.id, createdLeadIds));
  if (createdApptIds.length) await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
  await db.delete(clinicServices).where(eq(clinicServices.id, serviceBotoxId));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [chainAdminId, plainAdminId]));
  await db.delete(users).where(inArray(users.id, [chainAdminId, plainAdminId, platformAdminId, providerId]));
  await db.delete(units).where(inArray(units.id, [unit1Id, unit2Id]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1Id, hosp2Id]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

describe("GET /api/chain/:groupId/overview", () => {
  it("returns totals, per-location, and topItems for chain admin", async () => {
    const res = await request(buildApp(chainAdminId))
      .get(`/api/chain/${groupId}/overview?range=30d`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toBeDefined();
    expect(res.body.totals.revenue).toBe(500); // 200+200+100
    expect(res.body.totals.treatments).toBe(3);
    expect(res.body.totals.surgeries).toBe(0);
    expect(res.body.perLocation).toHaveLength(2);
    expect(res.body.perLocation[0].revenue).toBeGreaterThanOrEqual(res.body.perLocation[1].revenue);
    expect(res.body.perLocation[0].clinicKind).toBe("aesthetic");
    expect(res.body.topItems).toBeDefined();
    expect(res.body.topItems.treatments).toBeDefined();
  });

  it("rejects plain admin (not group_admin) with 403", async () => {
    const res = await request(buildApp(plainAdminId))
      .get(`/api/chain/${groupId}/overview?range=30d`);
    expect(res.status).toBe(403);
  });

  it("allows platform admin (bypass)", async () => {
    const res = await request(buildApp(platformAdminId))
      .get(`/api/chain/${groupId}/overview?range=30d`);
    expect(res.status).toBe(200);
  });
});
