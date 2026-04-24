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
  leads,
  leadContacts,
  clinicAppointments,
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
let providerUserId: string;
let patientId: string;
const createdLeadIds: string[] = [];
const createdApptIds: string[] = [];

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

  const [prov] = await db.insert(users).values({ email: `prov-${uniq()}@test.test`, firstName: "Provider" } as any).returning();
  providerUserId = prov.id;

  const [p] = await db.insert(patients).values({
    hospitalId,
    firstName: "Pat",
    surname: "Test",
    patientNumber: `FSN-${uniq()}`,
    birthday: "1990-01-01",
    sex: "F",
  } as any).returning();
  patientId = p.id;

  // Seed a funnel:
  //   Lead 1: no contacts, no appointment  -> counts as "leads" only
  //   Lead 2: 1 contact, no appointment    -> leads + contacted
  //   Lead 3: 2 contacts, appointment (completed) -> leads + contacted + booked + firstVisit
  //   Lead 4: 1 contact, appointment (scheduled, not completed) -> leads + contacted + booked (not firstVisit)

  const makeLead = async (): Promise<string> => {
    const [l] = await db.insert(leads).values({
      hospitalId,
      firstName: `Lead-${uniq()}`,
      lastName: "Test",
      source: "website",
    } as any).returning();
    createdLeadIds.push(l.id);
    return l.id;
  };

  const makeAppt = async (status: "scheduled" | "completed"): Promise<string> => {
    const [a] = await db.insert(clinicAppointments).values({
      hospitalId,
      unitId,
      patientId,
      providerId: providerUserId,
      appointmentDate: new Date().toISOString().slice(0, 10),
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status,
    } as any).returning();
    createdApptIds.push(a.id);
    return a.id;
  };

  const lead1 = await makeLead();
  const lead2 = await makeLead();
  const lead3 = await makeLead();
  const lead4 = await makeLead();

  await db.insert(leadContacts).values({ leadId: lead2, outcome: "no_answer", createdBy: staffUserId } as any);

  await db.insert(leadContacts).values([
    { leadId: lead3, outcome: "no_answer", createdBy: staffUserId },
    { leadId: lead3, outcome: "reached", createdBy: staffUserId },
  ] as any);
  const appt3 = await makeAppt("completed");
  await db.update(leads).set({ appointmentId: appt3 }).where(eq(leads.id, lead3));

  await db.insert(leadContacts).values({ leadId: lead4, outcome: "reached", createdBy: staffUserId } as any);
  const appt4 = await makeAppt("scheduled");
  await db.update(leads).set({ appointmentId: appt4 }).where(eq(leads.id, lead4));

  // suppress unused-variable warning
  void lead1;
});

afterAll(async () => {
  if (createdLeadIds.length) {
    await db.delete(leadContacts).where(inArray(leadContacts.leadId, createdLeadIds));
    await db.delete(leads).where(inArray(leads.id, createdLeadIds));
  }
  if (createdApptIds.length) {
    await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
  }
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.userId, [adminUserId, staffUserId]));
  await db.delete(users).where(inArray(users.id, [adminUserId, staffUserId, providerUserId]));
  await db.delete(units).where(eq(units.id, unitId));
  await db.delete(hospitals).where(eq(hospitals.id, hospitalId));
  await pool.end();
});

describe("GET /api/business/:hospitalId/funnel-snapshot", () => {
  it("returns leads + contacted + booked + firstVisit counts and conversion percentage", async () => {
    const res = await request(buildApp(adminUserId))
      .get(`/api/business/${hospitalId}/funnel-snapshot?range=30d`);
    expect(res.status).toBe(200);
    expect(res.body.leads).toBe(4);
    expect(res.body.contacted).toBe(3);
    expect(res.body.booked).toBe(2);
    expect(res.body.firstVisit).toBe(1);
    // Conversion = firstVisit / leads = 1/4 = 25.0
    expect(res.body.conversionPct).toBeCloseTo(25.0, 1);
  });

  it("rejects non-business-manager users with 403", async () => {
    const res = await request(buildApp(staffUserId))
      .get(`/api/business/${hospitalId}/funnel-snapshot?range=30d`);
    expect(res.status).toBe(403);
  });
});
