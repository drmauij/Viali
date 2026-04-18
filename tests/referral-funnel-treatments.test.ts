// tests/referral-funnel-treatments.test.ts
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
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
  // Clean up between tests so null-FK treatments from one test don't leak into the next
  afterEach(async () => {
    if (createdTreatmentIds.length) {
      await db.delete(treatments).where(inArray(treatments.id, createdTreatmentIds));
      createdTreatmentIds.length = 0;
    }
    if (createdReferralIds.length) {
      await db.delete(referralEvents).where(inArray(referralEvents.id, createdReferralIds));
      createdReferralIds.length = 0;
    }
    if (createdApptIds.length) {
      await db.delete(clinicAppointments).where(inArray(clinicAppointments.id, createdApptIds));
      createdApptIds.length = 0;
    }
  });

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

  it("does NOT weak-match a treatment whose appointment_id points to a different appointment", async () => {
    const marker = markerSource();
    const today = new Date();

    // Referral's appointment
    const [apptA] = await db.insert(clinicAppointments).values({
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
    createdApptIds.push(apptA.id);

    // A different appointment on the same day
    const [apptB] = await db.insert(clinicAppointments).values({
      hospitalId: TEST_HOSPITAL_ID,
      unitId: testUnitId,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentDate: today,
      startTime: "11:00",
      endTime: "11:30",
      durationMinutes: 30,
      status: "completed",
    } as any).returning();
    createdApptIds.push(apptB.id);

    const [ref] = await db.insert(referralEvents).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      appointmentId: apptA.id,
      source: marker,
      captureMethod: "manual",
    } as any).returning();
    createdReferralIds.push(ref.id);

    // Treatment explicitly linked to apptB, not apptA → must NOT attach to this referral
    const [tr] = await db.insert(treatments).values({
      hospitalId: TEST_HOSPITAL_ID,
      patientId: testPatientId,
      providerId: testProviderId,
      appointmentId: apptB.id,
      performedAt: today,
      status: "signed",
    } as any).returning();
    createdTreatmentIds.push(tr.id);

    await db.insert(treatmentLines).values({
      treatmentId: tr.id,
      serviceId: testServiceId,
      unitPrice: "999.00",
      total: "999.00",
    } as any);

    const res = await request(buildApp())
      .get(`/api/business/${TEST_HOSPITAL_ID}/referral-funnel`)
      .expect(200);

    const row = res.body.find((r: any) => r.source === marker);
    expect(row.treatment_id).toBeNull();
  });

  it("ignores draft (unsigned) treatments", async () => {
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
      status: "draft",         // NOT signed
    } as any).returning();
    createdTreatmentIds.push(tr.id);

    const res = await request(buildApp())
      .get(`/api/business/${TEST_HOSPITAL_ID}/referral-funnel`)
      .expect(200);

    const row = res.body.find((r: any) => r.source === marker);
    expect(row.treatment_id).toBeNull();
  });

  it("returns null treatment fields when referral has no treatment", async () => {
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
      status: "scheduled",
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

    const res = await request(buildApp())
      .get(`/api/business/${TEST_HOSPITAL_ID}/referral-funnel`)
      .expect(200);

    const row = res.body.find((r: any) => r.source === marker);
    expect(row.treatment_id).toBeNull();
    expect(row.treatment_status).toBeNull();
    expect(row.treatment_total).toBeNull();
  });
});
