import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import { hospitals, hospitalGroups, units, users, userHospitalRoles, patients, leads, clinicAppointments } from "@shared/schema";
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

let groupId: string, hosp1: string, hosp2: string, unit1: string, unit2: string;
let chainAdminId: string, providerId: string;
const createdLeadIds: string[] = [];
const createdApptIds: string[] = [];
let patientId: string;

beforeAll(async () => {
  const [g] = await db.insert(hospitalGroups).values({ name: `Test-${uniq()}` } as any).returning();
  groupId = g.id;
  const [h1] = await db.insert(hospitals).values({ name: `H1-${uniq()}`, groupId } as any).returning();
  hosp1 = h1.id;
  const [h2] = await db.insert(hospitals).values({ name: `H2-${uniq()}`, groupId } as any).returning();
  hosp2 = h2.id;
  const [u1] = await db.insert(units).values({ hospitalId: hosp1, name: "Clinic", type: "clinic" } as any).returning();
  unit1 = u1.id;
  const [u2] = await db.insert(units).values({ hospitalId: hosp2, name: "Clinic", type: "clinic" } as any).returning();
  unit2 = u2.id;
  const [ca] = await db.insert(users).values({ email: `ca-${uniq()}@test.test` } as any).returning();
  chainAdminId = ca.id;
  await db.insert(userHospitalRoles).values({ userId: chainAdminId, hospitalId: hosp1, unitId: unit1, role: "group_admin" } as any);
  const [prov] = await db.insert(users).values({ email: `prov-${uniq()}@test.test` } as any).returning();
  providerId = prov.id;
  const [p] = await db.insert(patients).values({
    hospitalId: hosp1, firstName: "Pat", surname: "T",
    patientNumber: `M-${uniq()}`, birthday: "1990-01-01", sex: "F",
  } as any).returning();
  patientId = p.id;

  const makeLead = async (hosp: string, src: string, converted: boolean) => {
    let appointmentId: string | null = null;
    if (converted) {
      const [a] = await db.insert(clinicAppointments).values({
        hospitalId: hosp, unitId: hosp === hosp1 ? unit1 : unit2, patientId, providerId,
        appointmentDate: new Date().toISOString().slice(0, 10),
        startTime: "10:00", endTime: "10:30", durationMinutes: 30, status: "completed",
      } as any).returning();
      appointmentId = a.id;
      createdApptIds.push(a.id);
    }
    const [l] = await db.insert(leads).values({
      hospitalId: hosp, firstName: `L-${uniq()}`, lastName: "T",
      source: src,
      appointmentId,
    } as any).returning();
    createdLeadIds.push(l.id);
  };

  // Seed: H1 has 3 Meta leads (1 converted) + 1 Google lead
  // H2 has 2 Meta leads + 1 Google lead
  await makeLead(hosp1, "meta", true);
  await makeLead(hosp1, "meta", false);
  await makeLead(hosp1, "meta", false);
  await makeLead(hosp1, "google", false);
  await makeLead(hosp2, "meta", false);
  await makeLead(hosp2, "meta", false);
  await makeLead(hosp2, "google", false);
});

afterAll(async () => {
  if (createdLeadIds.length) await db.delete(leads).where(inArray(leads.id, createdLeadIds));
  if (createdApptIds.length) await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, chainAdminId));
  await db.delete(users).where(inArray(users.id, [chainAdminId, providerId]));
  await db.delete(units).where(inArray(units.id, [unit1, unit2]));
  await db.delete(hospitals).where(inArray(hospitals.id, [hosp1, hosp2]));
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
  await pool.end();
});

describe("GET /api/chain/:groupId/marketing", () => {
  it("returns source × location matrix + source totals for chain admin", async () => {
    const res = await request(buildApp(chainAdminId)).get(`/api/chain/${groupId}/marketing?range=30d`);
    expect(res.status).toBe(200);

    expect(res.body.sources).toBeDefined();
    expect(res.body.locations).toBeDefined();
    expect(res.body.locations.length).toBe(2);

    const meta = res.body.sources.find((s: any) => s.name === "meta");
    expect(meta).toBeDefined();
    expect(meta.totals.leads).toBe(5); // 3 H1 + 2 H2
    expect(meta.byLocation.length).toBe(2);
    const metaH1 = meta.byLocation.find((l: any) => l.hospitalId === hosp1);
    const metaH2 = meta.byLocation.find((l: any) => l.hospitalId === hosp2);
    expect(metaH1.leads).toBe(3);
    expect(metaH2.leads).toBe(2);
    // 1 of 5 meta leads converted → 20.0%
    expect(meta.totals.conversionPct).toBeCloseTo(20.0, 1);

    const google = res.body.sources.find((s: any) => s.name === "google");
    expect(google.totals.leads).toBe(2);
  });

  it("rejects non-chain-admin with 403", async () => {
    const [plain] = await db.insert(users).values({ email: `plain-${uniq()}@test.test` } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: plain.id, hospitalId: hosp1, unitId: unit1, role: "admin" } as any);
    const res = await request(buildApp(plain.id)).get(`/api/chain/${groupId}/marketing?range=30d`);
    expect(res.status).toBe(403);
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.userId, plain.id));
    await db.delete(users).where(eq(users.id, plain.id));
  });
});
