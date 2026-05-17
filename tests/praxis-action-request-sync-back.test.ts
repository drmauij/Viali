import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, surgeries, externalSurgeryRequests, surgeonActionRequests } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { applyAcceptedActionToSource } from "../server/storage/praxisMode";

const created: { hospitals: string[]; users: string[] } = { hospitals: [], users: [] };

afterAll(async () => {
  if (created.hospitals.length) {
    await db.delete(surgeonActionRequests).where(inArray(surgeonActionRequests.hospitalId, created.hospitals));
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.hospitalId, created.hospitals));
    await db.delete(surgeries).where(inArray(surgeries.hospitalId, created.hospitals));
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
