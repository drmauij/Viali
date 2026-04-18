// tests/referral-funnel-treatments.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  patients,
  units,
  clinicAppointments,
  clinicServices,
  referralEvents,
  treatments,
  treatmentLines,
  userHospitalRoles,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

// Pass-through auth
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

import businessRouter from "../server/routes/business";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

let testPatientId: string;
let testProviderId: string;
let testUnitId: string;
let testServiceId: string;

const createdReferralIds: string[] = [];
const createdApptIds: string[] = [];
const createdTreatmentIds: string[] = [];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: testProviderId };
    next();
  });
  app.use(businessRouter);
  return app;
}

beforeAll(async () => {
  const [p] = await db.select().from(patients)
    .where(eq(patients.hospitalId, TEST_HOSPITAL_ID)).limit(1);
  testPatientId = p.id;

  // This file differs from treatments-routes/storage tests: the /referral-funnel route
  // is gated by isMarketingOrManager, so the injected req.user must have one of those roles.
  const managerRows = await db.select({ userId: userHospitalRoles.userId, role: userHospitalRoles.role })
    .from(userHospitalRoles)
    .where(eq(userHospitalRoles.hospitalId, TEST_HOSPITAL_ID));
  const manager = managerRows.find(r => r.userId && ['admin', 'manager', 'marketing'].includes(r.role));
  if (!manager) throw new Error("No user with admin/manager/marketing role on test hospital — seed required");
  testProviderId = manager.userId!;

  const [unit] = await db.select().from(units)
    .where(eq(units.hospitalId, TEST_HOSPITAL_ID)).limit(1);
  testUnitId = unit.id;

  const [svc] = await db.insert(clinicServices).values({
    hospitalId: TEST_HOSPITAL_ID,
    unitId: testUnitId,
    name: "FUNNEL_TEST_SVC_" + Date.now(),
    price: "250.00",
    isInvoiceable: true,
  } as any).returning();
  testServiceId = svc.id;
});

afterAll(async () => {
  if (createdTreatmentIds.length)
    await db.delete(treatments).where(inArray(treatments.id, createdTreatmentIds));
  if (createdApptIds.length)
    await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
  if (createdReferralIds.length)
    await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
  await db.delete(clinicServices).where(eq(clinicServices.id, testServiceId)).catch(() => {});
  await pool.end();
});

// Small helper — all test referrals use a unique marker so asserts can find them
// without relying on date filters.
function markerSource() {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

describe("/referral-funnel — treatment strong link", () => {
  it("attaches a treatment when treatments.appointment_id = referral's appointment_id", async () => {
    const marker = markerSource();

    const [appt] = await db.insert(clinicAppointments).values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentDate: new Date(),
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "completed",
    } as any).returning();
    createdApptIds.push(appt.id);

    const [ref] = await db.insert(referralEvents).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      appointmentId: appt.id,
      source: marker,
      captureMethod: "manual",
    } as any).returning();
    createdReferralIds.push(ref.id);

    const [tr] = await db.insert(treatments).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentId: appt.id,
      performedAt: new Date(),
      status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);

    // No explicit cleanup: treatment_lines cascades on treatments delete (shared/schema.ts).
    await db.insert(treatmentLines).values({
      treatmentId: tr.id,
      serviceId: testServiceId,
      unitPrice: "250.00",
      total: "250.00",
    } as any);

    const res = await request(buildApp())
      .get(`/api/business/${TEST_HOSPITAL_ID}/referral-funnel`)
      .expect(200);

    const row = res.body.find((r: any) => r.source === marker);
    expect(row).toBeDefined();
    expect(row.treatment_id).toBe(tr.id);
    expect(row.treatment_status).toBe("signed");
    expect(Number(row.treatment_total)).toBe(250);
    expect(row.surgery_id).toBeNull();
  });

  it("attaches a same-day treatment when treatments.appointment_id is null (weak fallback)", async () => {
    const marker = markerSource();
    const today = new Date();

    const [appt] = await db.insert(clinicAppointments).values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentDate: today,
      startTime: "10:00",
      endTime: "10:30",
      durationMinutes: 30,
      status: "completed",
    } as any).returning();
    createdApptIds.push(appt.id);

    const [ref] = await db.insert(referralEvents).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      appointmentId: appt.id,
      source: marker,
      captureMethod: "manual",
    } as any).returning();
    createdReferralIds.push(ref.id);

    const [tr] = await db.insert(treatments).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentId: null,             // no FK — weak fallback path
      performedAt: today,
      status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);

    // No explicit cleanup: treatment_lines cascades on treatments delete (shared/schema.ts).
    await db.insert(treatmentLines).values({
      treatmentId: tr.id,
      serviceId: testServiceId,
      unitPrice: "150.00",
      total: "150.00",
    } as any);

    const res = await request(buildApp())
      .get(`/api/business/${TEST_HOSPITAL_ID}/referral-funnel`)
      .expect(200);

    const row = res.body.find((r: any) => r.source === marker);
    expect(row.treatment_id).toBe(tr.id);
    expect(Number(row.treatment_total)).toBe(150);
  });
});
