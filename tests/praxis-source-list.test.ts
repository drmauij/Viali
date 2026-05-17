import { describe, it, expect, afterAll, vi } from "vitest";

// Auth + access-guard pass-through so integration tests can exercise the
// surgeries handlers without role/unit checks rejecting the request before
// the cross-tenant enrichment runs. Hoisted by vitest above all imports.
vi.mock("../server/auth/google", () => ({
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../server/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../server/utils")>();
  return {
    ...original,
    requireSurgeryPlanAccess: (_req: any, _res: any, next: any) => next(),
    requireWriteAccess: (_req: any, _res: any, next: any) => next(),
    requireStrictHospitalAccess: (_req: any, _res: any, next: any) => next(),
  };
});

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
import surgeriesRouter from "../server/routes/anesthesia/surgeries";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    const userId = String(req.headers["x-test-user-id"] ?? "");
    const hospitalId = String(req.headers["x-test-hospital-id"] ?? "");
    req.user = { id: userId, activeHospitalId: hospitalId };
    next();
  });
  app.use(surgeriesRouter);
  return app;
}
const integrationApp = buildApp();

const cleanup = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  if (cleanup.hospitals.length) {
    await db.delete(surgeonActionRequests).where(inArray(surgeonActionRequests.hospitalId, cleanup.hospitals));
    await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.hospitalId, cleanup.hospitals));
    await db.delete(surgeries).where(inArray(surgeries.hospitalId, cleanup.hospitals));
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.hospitalId, cleanup.hospitals));
    await db.delete(units).where(inArray(units.hospitalId, cleanup.hospitals));
    await db.delete(hospitals).where(inArray(hospitals.id, cleanup.hospitals));
  }
  if (cleanup.users.length) await db.delete(users).where(inArray(users.id, cleanup.users));
  await pool.end();
});

describe("surgeries endpoint — cross-tenant fields", () => {
  it("GET /:id includes pendingActionRequest + destinationPortalToken when present", async () => {
    const tok = `tok-${Date.now()}`;
    const [surgeon] = await db.insert(users).values({ email: `list-${Date.now()}@t.local`, firstName: "L", lastName: "S" }).returning();
    cleanup.users.push(surgeon.id);
    const [praxis] = await db.insert(hospitals).values({ name: `P-list ${Date.now()}`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `D-list ${Date.now()}`, externalSurgeryToken: tok } as any).returning();
    cleanup.hospitals.push(praxis.id, dest.id);
    const [orUnit] = await db.insert(units).values({ hospitalId: praxis.id, name: "OR", type: "OR" } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxis.id, unitId: orUnit.id, role: "admin", isBookable: true } as any);
    const [src] = await db.insert(surgeries).values({
      hospitalId: praxis.id,
      plannedDate: new Date("2027-08-01T08:00:00Z"),
      referralStatus: "confirmed_external",
      status: "planned",
      surgeonId: surgeon.id,
      plannedSurgery: "Test",
    } as any).returning();
    const [destSurg] = await db.insert(surgeries).values({
      hospitalId: dest.id, plannedDate: new Date("2027-08-01T08:00:00Z"), surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: praxis.id, sourceSurgeryId: src.id, surgeryId: destSurg.id,
      surgeonId: surgeon.id, surgeonFirstName: "L", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "Test", wishedDate: "2027-08-01", wishedTimeFrom: 480, status: "scheduled", surgeryDurationMinutes: 60,
    } as any).returning();
    await db.update(surgeries).set({ externalRequestId: extReq.id } as any).where(eq(surgeries.id, src.id));
    const [actionReq] = await db.insert(surgeonActionRequests).values({
      hospitalId: dest.id, surgeryId: destSurg.id, surgeonEmail: surgeon.email!,
      type: "reschedule", reason: "earlier",
      proposedDate: "2027-08-08", proposedTimeFrom: 540, proposedTimeTo: 630,
      status: "pending",
    }).returning();

    const resp = await request(integrationApp)
      .get(`/api/anesthesia/surgeries/${src.id}`)
      .set("x-test-user-id", surgeon.id);
    expect(resp.status).toBe(200);
    expect(resp.body.pendingActionRequest).toMatchObject({
      id: actionReq.id, type: "reschedule", reason: "earlier",
      proposedDate: "2027-08-08", proposedTimeFrom: 540, proposedTimeTo: 630,
    });
    expect(resp.body.destinationPortalToken).toBe(tok);
  });

  it("GET /:id has null cross-tenant fields when no pending and not cross-tenant", async () => {
    const [surgeon] = await db.insert(users).values({ email: `np-${Date.now()}@t.local`, firstName: "N", lastName: "S" }).returning();
    cleanup.users.push(surgeon.id);
    const [praxis] = await db.insert(hospitals).values({ name: `P-np ${Date.now()}`, tenantType: "praxis" } as any).returning();
    cleanup.hospitals.push(praxis.id);
    const [orUnit] = await db.insert(units).values({ hospitalId: praxis.id, name: "OR", type: "OR" } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxis.id, unitId: orUnit.id, role: "admin", isBookable: true } as any);
    const [src] = await db.insert(surgeries).values({
      hospitalId: praxis.id, plannedDate: new Date("2027-08-01T08:00:00Z"),
      referralStatus: "local", status: "planned", surgeonId: surgeon.id, plannedSurgery: "T",
    } as any).returning();

    const resp = await request(integrationApp)
      .get(`/api/anesthesia/surgeries/${src.id}`)
      .set("x-test-user-id", surgeon.id);
    expect(resp.status).toBe(200);
    expect(resp.body.pendingActionRequest).toBeNull();
    expect(resp.body.destinationPortalToken).toBeNull();
  });

  it("GET list — items include pendingActionRequest + destinationPortalToken for cross-tenant rows", async () => {
    const tok = `lst-tok-${Date.now()}`;
    const [surgeon] = await db.insert(users).values({ email: `lst-${Date.now()}@t.local`, firstName: "L", lastName: "S" }).returning();
    cleanup.users.push(surgeon.id);
    const [praxis] = await db.insert(hospitals).values({ name: `P-lst ${Date.now()}`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `D-lst ${Date.now()}`, externalSurgeryToken: tok } as any).returning();
    cleanup.hospitals.push(praxis.id, dest.id);
    const [orUnit] = await db.insert(units).values({ hospitalId: praxis.id, name: "OR", type: "OR" } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxis.id, unitId: orUnit.id, role: "admin", isBookable: true } as any);
    const [src] = await db.insert(surgeries).values({
      hospitalId: praxis.id, plannedDate: new Date("2027-08-15T08:00:00Z"),
      referralStatus: "confirmed_external", status: "planned", surgeonId: surgeon.id, plannedSurgery: "T",
    } as any).returning();
    const [destSurg] = await db.insert(surgeries).values({
      hospitalId: dest.id, plannedDate: new Date("2027-08-15T08:00:00Z"), surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: praxis.id, sourceSurgeryId: src.id, surgeryId: destSurg.id,
      surgeonId: surgeon.id, surgeonFirstName: "L", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "T", wishedDate: "2027-08-15", wishedTimeFrom: 480, status: "scheduled", surgeryDurationMinutes: 60,
    } as any).returning();
    await db.update(surgeries).set({ externalRequestId: extReq.id } as any).where(eq(surgeries.id, src.id));

    const resp = await request(integrationApp)
      .get(`/api/anesthesia/surgeries?hospitalId=${praxis.id}`)
      .set("x-test-user-id", surgeon.id);
    expect(resp.status).toBe(200);
    const row = resp.body.find((r: any) => r.id === src.id);
    expect(row).toBeDefined();
    expect(row.destinationPortalToken).toBe(tok);
    expect(row.pendingActionRequest).toBeNull();
  });
});
