// tests/praxis-mode-referral.test.ts
import { describe, it, expect, vi, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  users,
  userHospitalRoles,
  patients,
  surgeries,
  externalSurgeryRequests,
  referralPartnerships,
  surgeryRooms,
  units,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital } from "../server/storage/praxisMode";
import { praxisModeRouter } from "../server/routes/praxisMode";

// Pass-through auth and surgery-plan access guard so test requests are not
// rejected by role/unit checks that aren't relevant to the referral logic.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../server/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/utils")>();
  return {
    ...original,
    requireSurgeryPlanAccess: (_req: any, _res: any, next: any) => next(),
    requireWriteAccess: (_req: any, _res: any, next: any) => next(),
  };
});

// Import the routers AFTER the mocks are registered
import surgeriesRouter from "../server/routes/anesthesia/surgeries";
import externalSurgeryRouter from "../server/routes/externalSurgery";

const created = {
  hospitals: [] as string[],
  users: [] as string[],
  surgeries: [] as string[],
  requests: [] as string[],
  patients: [] as string[],
};

afterAll(async () => {
  if (created.surgeries.length)
    await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length)
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length)
    await db.delete(patients).where(inArray(patients.id, created.patients));
  for (const hId of created.hospitals) {
    await db.delete(surgeries).where(eq(surgeries.hospitalId, hId));
    await db.delete(externalSurgeryRequests).where(eq(externalSurgeryRequests.hospitalId, hId));
    await db.delete(surgeryRooms).where(eq(surgeryRooms.hospitalId, hId));
    await db.delete(patients).where(eq(patients.hospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.sourceHospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.destinationHospitalId, hId));
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hId));
    await db.delete(units).where(eq(units.hospitalId, hId));
  }
  if (created.hospitals.length)
    await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length)
    await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

function buildApp(userId: string, hospitalId: string) {
  const app = express();
  app.use(express.json());
  // Inject authenticated user context — isAuthenticated is mocked to pass-through
  app.use((req: any, _res: any, next: any) => {
    req.user = { id: userId, activeHospitalId: hospitalId };
    next();
  });
  app.use(surgeriesRouter);
  return app;
}

// App that mounts the external surgery router and reads user/hospital from
// x-test-user-id / x-test-hospital-id headers (test-mode bypass).
function buildExternalSurgeryApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const userId = String(req.headers["x-test-user-id"] ?? "");
    const hospitalId = String(req.headers["x-test-hospital-id"] ?? "");
    req.user = { id: userId, activeHospitalId: hospitalId };
    next();
  });
  app.use(externalSurgeryRouter);
  app.use(praxisModeRouter);
  return app;
}
const externalSurgeryApp = buildExternalSurgeryApp();

// Combined app used by reject/cancel/acknowledge tests — needs both
// surgeriesRouter (for POST /api/anesthesia/surgeries) and the external +
// praxisMode routers.
function buildCombinedApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const userId = String(req.headers["x-test-user-id"] ?? "");
    const hospitalId = String(req.headers["x-test-hospital-id"] ?? "");
    req.user = { id: userId, activeHospitalId: hospitalId };
    next();
  });
  app.use(surgeriesRouter);
  app.use(externalSurgeryRouter);
  app.use(praxisModeRouter);
  return app;
}
const combinedApp = buildCombinedApp();

async function setup() {
  const ts = Date.now();
  const [dest] = await db
    .insert(hospitals)
    .values({ name: `Dest ${ts}`, tenantType: "clinic" } as any)
    .returning();
  created.hospitals.push(dest.id);

  const [surgeon] = await db
    .insert(users)
    .values({
      email: `r-${ts}@t.local`,
      firstName: "R",
      lastName: "S",
      phone: "+41 79 000 00 00",
    })
    .returning();
  created.users.push(surgeon.id);

  // Create a default unit for the dest hospital (unit_id is NOT NULL on user_hospital_roles)
  const [destUnit] = await db
    .insert(units)
    .values({ name: "Clinic", hospitalId: dest.id, type: "clinic", isClinicModule: true } as any)
    .returning();

  await db.insert(userHospitalRoles).values({
    userId: surgeon.id,
    hospitalId: dest.id,
    unitId: destUnit.id,
    role: "external_surgeon",
  } as any);

  const { sourceHospitalId } = await provisionSourceHospital({
    surgeonUserId: surgeon.id,
    originatingDestinationId: dest.id,
    sourceName: `Praxis ${ts}`,
  });
  created.hospitals.push(sourceHospitalId);

  // Create the clinic-linked logical room
  const [room] = await db
    .insert(surgeryRooms)
    .values({
      hospitalId: sourceHospitalId,
      name: dest.name,
      type: "OP",
      linkedHospitalId: dest.id,
    } as any)
    .returning();

  const [pt] = await db
    .insert(patients)
    .values({
      hospitalId: sourceHospitalId,
      firstName: "Petra",
      surname: "Hofer",
      patientNumber: `P-${ts}`,
      birthday: "1985-03-12",
      sex: "F",
      email: "p@t.local",
      phone: "+41 79 111 11 11",
      street: "Bahnhofstr. 1",
      postalCode: "8001",
      city: "Zürich",
    } as any)
    .returning();
  created.patients.push(pt.id);

  return { dest, surgeon, sourceHospitalId, room, patient: pt };
}

describe("POST /api/anesthesia/surgeries — clinic-linked room creates cross-tenant referral", () => {
  it("creates source surgery + destination external_surgery_request with snapshot, bidirectionally linked", async () => {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const plannedDate = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

    const app = buildApp(surgeon.id, sourceHospitalId);
    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-active-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate,
        plannedSurgery: "Septoplasty",
        diagnosis: "Chronic nasal obstruction",
        coverageType: "Krankenkasse",
        stayType: "ambulant",
        surgeryRiskClass: "standard",
        consentGiven: true,
      });

    expect(res.status).toBe(201);
    created.surgeries.push(res.body.id);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, res.body.id));
    expect(s.referralStatus).toBe("pending_external");
    expect(s.externalRequestId).toBeTruthy();

    const [r] = await db
      .select()
      .from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, s.externalRequestId!));
    created.requests.push(r.id);

    expect(r.hospitalId).toBe(dest.id);
    expect(r.sourceHospitalId).toBe(sourceHospitalId);
    expect(r.sourceSurgeryId).toBe(s.id);
    expect(r.patientSnapshot).toBeTruthy();
    expect((r.patientSnapshot as any).demographics.firstName).toBe("Petra");
    expect((r.patientSnapshot as any).consents.given).toBe(true);
  });

  it("rejects when destination has no active partnership with source", async () => {
    const { sourceHospitalId, room, patient, surgeon } = await setup();
    await db
      .update(referralPartnerships)
      .set({ status: "revoked" })
      .where(eq(referralPartnerships.sourceHospitalId, sourceHospitalId));

    const app = buildApp(surgeon.id, sourceHospitalId);
    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-active-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        plannedSurgery: "X",
        consentGiven: true,
      });

    expect(res.status).toBe(403);
  });

  it("rejects when consentGiven is false", async () => {
    const { sourceHospitalId, room, patient, surgeon } = await setup();
    const app = buildApp(surgeon.id, sourceHospitalId);
    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-active-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id,
        surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        plannedSurgery: "X",
        consentGiven: false,
      });

    expect(res.status).toBe(400);
  });

  it("creating a surgery in a NON-clinic-linked room behaves like normal (no external_surgery_request created)", async () => {
    const { sourceHospitalId, surgeon, patient } = await setup();

    const [physicalRoom] = await db
      .insert(surgeryRooms)
      .values({ hospitalId: sourceHospitalId, name: "Praxis OP1", type: "OP" } as any)
      .returning();

    const app = buildApp(surgeon.id, sourceHospitalId);
    const res = await request(app)
      .post("/api/anesthesia/surgeries")
      .set("x-active-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id,
        surgeryRoomId: physicalRoom.id,
        plannedDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        plannedSurgery: "Y",
      });

    expect(res.status).toBe(201);
    created.surgeries.push(res.body.id);

    const [s] = await db.select().from(surgeries).where(eq(surgeries.id, res.body.id));
    expect(s.referralStatus).toBe("local");
    expect(s.externalRequestId).toBeNull();
  });
});

describe("destination-side accept of source-sourced request", () => {
  it("creates destination patient from snapshot + pushes source status to confirmed_external", async () => {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const submit = await request(buildApp(surgeon.id, sourceHospitalId))
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id, surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        plannedSurgery: "Septoplasty", consentGiven: true,
      });
    expect(submit.status).toBe(201);
    created.surgeries.push(submit.body.id);
    const [srcSurgBefore] = await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id));
    const externalRequestId = srcSurgBefore.externalRequestId!;
    created.requests.push(externalRequestId);

    // Simulate destination admin
    const [adminUser] = await db.insert(users).values({
      email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A",
    }).returning();
    created.users.push(adminUser.id);
    const [destUnit] = await db.select().from(units).where(eq(units.hospitalId, dest.id));
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: dest.id, unitId: destUnit.id, role: "admin" } as any);

    const confirmedDate = new Date(Date.now() + 10*24*3600*1000);
    const res = await request(externalSurgeryApp)
      .post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", dest.id)
      .send({ confirmedDate: confirmedDate.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body.destinationPatientId).toBeTruthy();
    created.patients.push(res.body.destinationPatientId);

    const [destPt] = await db.select().from(patients).where(eq(patients.id, res.body.destinationPatientId));
    expect(destPt.hospitalId).toBe(dest.id);
    expect(destPt.firstName).toBe("Petra");

    // Source-side surgery confirmed
    const [srcSurg] = await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id));
    expect(srcSurg.referralStatus).toBe("confirmed_external");
    expect(srcSurg.plannedDate).toBeTruthy();
  });
});

describe("destination reject/cancel + acknowledge-reschedule", () => {
  async function submitAndGetIds() {
    const { dest, surgeon, sourceHospitalId, room, patient } = await setup();
    const submit = await request(combinedApp)
      .post("/api/anesthesia/surgeries")
      .set("x-test-user-id", surgeon.id).set("x-test-hospital-id", sourceHospitalId)
      .send({
        hospitalId: sourceHospitalId,
        patientId: patient.id, surgeryRoomId: room.id,
        plannedDate: new Date(Date.now() + 7*24*3600*1000).toISOString(),
        plannedSurgery: "Septo", consentGiven: true,
      });
    created.surgeries.push(submit.body.id);
    const externalRequestId = (await db.select().from(surgeries).where(eq(surgeries.id, submit.body.id)))[0].externalRequestId!;
    created.requests.push(externalRequestId);
    const [adminUser] = await db.insert(users).values({ email: `adm-${Date.now()}@t.local`, firstName: "A", lastName: "A" }).returning();
    created.users.push(adminUser.id);
    const [destUnit] = await db.select().from(units).where(eq(units.hospitalId, dest.id));
    await db.insert(userHospitalRoles).values({ userId: adminUser.id, hospitalId: dest.id, unitId: destUnit.id, role: "admin" } as any);
    return { destId: dest.id, adminUser, externalRequestId, sourceSurgeryId: submit.body.id };
  }

  it("destination reject sets source surgery to rejected_external with reason", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    const res = await request(combinedApp)
      .post(`/api/external-surgery-requests/${externalRequestId}/reject`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId)
      .send({ reason: "Surgery type outside our scope" });
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.referralStatus).toBe("rejected_external");
    expect((src as any).referralNote).toBe("Surgery type outside our scope");
  });

  it("destination cancel-after-accept sets source surgery to cancelled_external", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    await request(combinedApp).post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId).send({});

    const res = await request(combinedApp)
      .post(`/api/external-surgery-requests/${externalRequestId}/cancel`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId)
      .send({ reason: "Equipment failure" });
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.referralStatus).toBe("cancelled_external");
    expect((src as any).referralNote).toBe("Equipment failure");
  });

  it("source acknowledge-reschedule sets reschedule_acknowledged_at", async () => {
    const { destId, adminUser, externalRequestId, sourceSurgeryId } = await submitAndGetIds();
    await request(combinedApp).post(`/api/external-surgery-requests/${externalRequestId}/accept`)
      .set("x-test-user-id", adminUser.id).set("x-test-hospital-id", destId).send({});
    // Manually set a reschedule
    await db.update(surgeries)
      .set({ lastClinicRescheduleAt: new Date(), rescheduleAcknowledgedAt: null } as any)
      .where(eq(surgeries.id, sourceSurgeryId));

    const surgeonHospital = (await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId)))[0].hospitalId;
    const res = await request(combinedApp)
      .post(`/api/surgeries/${sourceSurgeryId}/acknowledge-reschedule`)
      .set("x-test-hospital-id", surgeonHospital)
      .send({});
    expect(res.status).toBe(200);

    const [src] = await db.select().from(surgeries).where(eq(surgeries.id, sourceSurgeryId));
    expect(src.rescheduleAcknowledgedAt).toBeTruthy();
  });
});
