import { describe, it, expect, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db, pool } from "../server/db";
import {
  hospitals,
  users,
  surgeries,
  externalSurgeryRequests,
  surgeonActionRequests,
  userHospitalRoles,
  units,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { applyAcceptedActionToSource } from "../server/storage/praxisMode";

// Pass-through auth and access guards so test requests are not rejected by
// role/unit checks unrelated to the sync-back logic under test.
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

// Import the router AFTER the mocks are registered
import externalSurgeryRouter from "../server/routes/externalSurgery";

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
  return app;
}
const externalSurgeryApp = buildExternalSurgeryApp();

const created: { hospitals: string[]; users: string[] } = { hospitals: [], users: [] };

afterAll(async () => {
  if (created.hospitals.length) {
    await db.delete(surgeonActionRequests).where(inArray(surgeonActionRequests.hospitalId, created.hospitals));
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.hospitalId, created.hospitals));
    await db.delete(surgeries).where(inArray(surgeries.hospitalId, created.hospitals));
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.hospitalId, created.hospitals));
    await db.delete(units).where(inArray(units.hospitalId, created.hospitals));
    await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  }
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

describe("applyAcceptedActionToSource", () => {
  it("cancellation accepted → source surgery archived + referralStatus=cancelled_external", async () => {
    const [surgeon] = await db.insert(users).values({ email: `s-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);
    const [src] = await db.insert(hospitals).values({ name: `Src ${Date.now()}`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `Dest ${Date.now()}` } as any).returning();
    created.hospitals.push(src.id, dest.id);
    const [srcSurgery] = await db.insert(surgeries).values({
      hospitalId: src.id,
      plannedDate: new Date("2027-06-01T08:00:00Z"),
      referralStatus: "confirmed_external",
      surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id,
      sourceHospitalId: src.id,
      sourceSurgeryId: srcSurgery.id,
      surgeonId: surgeon.id,
      surgeonFirstName: "S", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "Test",
      surgeryDurationMinutes: 60,
      wishedDate: "2027-06-01",
      wishedTimeFrom: 480,
      status: "scheduled",
    } as any).returning();
    const [actionReq] = await db.insert(surgeonActionRequests).values({
      hospitalId: dest.id,
      surgeryId: srcSurgery.id,
      surgeonEmail: surgeon.email!,
      type: "cancellation",
      reason: "no longer needed",
      status: "accepted",
    }).returning();

    await applyAcceptedActionToSource(actionReq, extReq);

    const [updated] = await db.select().from(surgeries).where(eq(surgeries.id, srcSurgery.id));
    expect(updated.referralStatus).toBe("cancelled_external");
    expect(updated.isArchived).toBe(true);
    expect(updated.archivedAt).not.toBeNull();
    expect(updated.archivedBy).toBe(surgeon.id);
  });

  it("suspension accepted → source surgery isSuspended=true, referralStatus unchanged", async () => {
    const [surgeon] = await db.insert(users).values({ email: `sus-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);
    const [src] = await db.insert(hospitals).values({ name: `Src ${Date.now()}-sus`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `Dest ${Date.now()}-sus` } as any).returning();
    created.hospitals.push(src.id, dest.id);
    const [srcSurgery] = await db.insert(surgeries).values({
      hospitalId: src.id,
      plannedDate: new Date("2027-06-01T08:00:00Z"),
      referralStatus: "confirmed_external",
      surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: src.id, sourceSurgeryId: srcSurgery.id,
      surgeonId: surgeon.id, surgeonFirstName: "S", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "Test", surgeryDurationMinutes: 60, wishedDate: "2027-06-01", wishedTimeFrom: 480, status: "scheduled",
    } as any).returning();
    const [actionReq] = await db.insert(surgeonActionRequests).values({
      hospitalId: dest.id, surgeryId: srcSurgery.id, surgeonEmail: surgeon.email!,
      type: "suspension", reason: "patient sick", status: "accepted",
    }).returning();

    await applyAcceptedActionToSource(actionReq, extReq);

    const [updated] = await db.select().from(surgeries).where(eq(surgeries.id, srcSurgery.id));
    expect(updated.isSuspended).toBe(true);
    expect(updated.suspendedReason).toBe("patient sick");
    expect(updated.referralStatus).toBe("confirmed_external");
  });

  it("reschedule accepted → source surgery plannedDate moved + history appended", async () => {
    const [surgeon] = await db.insert(users).values({ email: `rs-${Date.now()}@t.local`, firstName: "S", lastName: "S" }).returning();
    created.users.push(surgeon.id);
    const [src] = await db.insert(hospitals).values({ name: `Src ${Date.now()}-rs`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `Dest ${Date.now()}-rs` } as any).returning();
    created.hospitals.push(src.id, dest.id);
    const [srcSurgery] = await db.insert(surgeries).values({
      hospitalId: src.id, plannedDate: new Date("2027-06-01T08:00:00Z"),
      referralStatus: "confirmed_external", surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: src.id, sourceSurgeryId: srcSurgery.id,
      surgeonId: surgeon.id, surgeonFirstName: "S", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "Test", surgeryDurationMinutes: 60, wishedDate: "2027-06-01", wishedTimeFrom: 480, status: "scheduled",
    } as any).returning();
    const [actionReq] = await db.insert(surgeonActionRequests).values({
      hospitalId: dest.id, surgeryId: srcSurgery.id, surgeonEmail: surgeon.email!,
      type: "reschedule", reason: "earlier slot",
      proposedDate: "2027-06-08", proposedTimeFrom: 540, status: "accepted",
    }).returning();

    await applyAcceptedActionToSource(actionReq, extReq);

    const [updated] = await db.select().from(surgeries).where(eq(surgeries.id, srcSurgery.id));
    expect(new Date(updated.plannedDate!).toISOString()).toBe("2027-06-08T09:00:00.000Z");
    expect(updated.lastClinicRescheduleAt).not.toBeNull();
    expect(Array.isArray((updated as any).rescheduleHistory)).toBe(true);
    expect((updated as any).rescheduleHistory.length).toBeGreaterThan(0);
  });

  it("no-op when externalRequest has no sourceSurgeryId (legacy portal)", async () => {
    const legacyExtReq = { id: "fake-id", sourceSurgeryId: null, hospitalId: "fake-hosp" } as any;
    const fakeActionReq = { type: "cancellation", surgeonEmail: "x@y.com", reason: "x" } as any;
    await expect(applyAcceptedActionToSource(fakeActionReq, legacyExtReq)).resolves.toBeUndefined();
  });
});

describe("POST /accept syncs back to source surgery", () => {
  it("accepting a cancellation also archives the source praxis surgery", async () => {
    // Operator on destination = the user accepting the request.
    const [operator] = await db
      .insert(users)
      .values({ email: `op-${Date.now()}@t.local`, firstName: "O", lastName: "P" })
      .returning();
    created.users.push(operator.id);
    // Surgeon who filed the request — their email is recorded on the action_request.
    const [surgeon] = await db
      .insert(users)
      .values({ email: `sg-${Date.now()}@t.local`, firstName: "S", lastName: "G" })
      .returning();
    created.users.push(surgeon.id);

    const [praxis] = await db
      .insert(hospitals)
      .values({ name: `Praxis-acc ${Date.now()}`, tenantType: "praxis" } as any)
      .returning();
    const [dest] = await db
      .insert(hospitals)
      .values({ name: `Dest-acc ${Date.now()}` } as any)
      .returning();
    created.hospitals.push(praxis.id, dest.id);

    // Give operator access to the destination (admin in a clinic-module unit
    // so getUserHospitals returns a row for this hospital).
    const [destUnit] = await db
      .insert(units)
      .values({ hospitalId: dest.id, name: "OR", type: "OR", isClinicModule: true } as any)
      .returning();
    await db.insert(userHospitalRoles).values({
      userId: operator.id,
      hospitalId: dest.id,
      unitId: destUnit.id,
      role: "admin",
      isBookable: true,
      canPlanOps: true,
    } as any);

    // Source praxis surgery in confirmed_external state.
    const [srcSurgery] = await db
      .insert(surgeries)
      .values({
        hospitalId: praxis.id,
        plannedDate: new Date("2027-09-01T08:00:00Z"),
        referralStatus: "confirmed_external",
        surgeonId: surgeon.id,
      } as any)
      .returning();

    // Destination's mirror surgery (what the operator sees on their plan).
    const [destSurgery] = await db
      .insert(surgeries)
      .values({
        hospitalId: dest.id,
        plannedDate: new Date("2027-09-01T08:00:00Z"),
        surgeonId: surgeon.id,
      } as any)
      .returning();

    // External request linking the two sides.
    const [extReq] = await db
      .insert(externalSurgeryRequests)
      .values({
        hospitalId: dest.id,
        sourceHospitalId: praxis.id,
        sourceSurgeryId: srcSurgery.id,
        surgeryId: destSurgery.id,
        surgeonId: surgeon.id,
        surgeonFirstName: "S",
        surgeonLastName: "G",
        surgeonEmail: surgeon.email!,
        surgeonPhone: "",
        surgeryName: "Test",
        surgeryDurationMinutes: 60,
        wishedDate: "2027-09-01",
        wishedTimeFrom: 480,
        status: "scheduled",
      } as any)
      .returning();

    // Stamp the destination surgery so the accept handler can find the external request.
    await db
      .update(surgeries)
      .set({ externalRequestId: extReq.id } as any)
      .where(eq(surgeries.id, destSurgery.id));

    // Pending cancellation request on destination, filed by surgeon, against destination's surgery.
    const [actionReq] = await db
      .insert(surgeonActionRequests)
      .values({
        hospitalId: dest.id,
        surgeryId: destSurgery.id,
        surgeonEmail: surgeon.email!,
        type: "cancellation",
        reason: "no longer needed",
        status: "pending",
      })
      .returning();

    const resp = await request(externalSurgeryApp)
      .post(`/api/hospitals/${dest.id}/surgeon-action-requests/${actionReq.id}/accept`)
      .set("x-test-user-id", operator.id)
      .set("x-test-hospital-id", dest.id)
      .send({});
    expect(resp.status).toBe(200);

    // Destination side: surgery cancelled, action_request accepted.
    const [destUpdated] = await db.select().from(surgeries).where(eq(surgeries.id, destSurgery.id));
    expect(destUpdated.status).toBe("cancelled");
    const [updatedReq] = await db
      .select()
      .from(surgeonActionRequests)
      .where(eq(surgeonActionRequests.id, actionReq.id));
    expect(updatedReq.status).toBe("accepted");

    // Praxis source side: archived + cancelled_external.
    const [srcUpdated] = await db.select().from(surgeries).where(eq(surgeries.id, srcSurgery.id));
    expect(srcUpdated.referralStatus).toBe("cancelled_external");
    expect(srcUpdated.isArchived).toBe(true);
  });
});
