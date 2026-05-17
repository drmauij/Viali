import { describe, it, expect, afterAll, vi } from "vitest";
import { evaluateCrossTenantGate, GATED_FIELDS, type GateIntent } from "../server/storage/praxisCrossTenantGate";

// Auth + access-guard pass-through so integration tests can exercise the
// PATCH handler without role/unit checks rejecting the request before the
// cross-tenant gate has a chance to run. Hoisted by vitest above all imports.
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

const baseSurgery = (over: Record<string, unknown> = {}) => ({
  id: "surg-1",
  hospitalId: "hosp-praxis",
  plannedDate: new Date("2027-06-01T08:00:00Z"),
  actualEndTime: new Date("2027-06-01T09:30:00Z"),
  status: "planned",
  isArchived: false,
  isSuspended: false,
  referralStatus: "confirmed_external",
  externalRequestId: "ext-1",
  ...over,
});

describe("evaluateCrossTenantGate", () => {
  it("passes through for local surgeries", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery({ referralStatus: "local", externalRequestId: null }),
      { intent: "patch", payload: { notes: "anything" }, reason: null, actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("pass");
  });

  it("passes through for pending_external (legacy cancelPendingReferral flow handles cancel)", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery({ referralStatus: "pending_external" }),
      { intent: "patch", payload: { plannedDate: "2027-06-02T08:00:00Z" }, reason: null, actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("pass");
  });

  it("rejects with 409 SURGERY_NOT_MUTABLE when planned date is in the past", () => {
    const past = baseSurgery({ plannedDate: new Date("2020-01-01T08:00:00Z") });
    const result = evaluateCrossTenantGate(
      past,
      { intent: "patch", payload: { plannedDate: "2020-01-02T08:00:00Z" }, reason: "x", actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("reject");
    if (result.kind === "reject") {
      expect(result.status).toBe(409);
      expect(result.body.code).toBe("SURGERY_NOT_MUTABLE");
    }
  });

  it("rejects with 409 SOURCE_SURGERY_PENDING_REQUEST when a pending action_request already exists", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      { intent: "patch", payload: { plannedDate: "2027-06-02T08:00:00Z" }, reason: "x", actorId: "u1" },
      { hasPendingActionRequest: true },
    );
    expect(result.kind).toBe("reject");
    if (result.kind === "reject") {
      expect(result.body.code).toBe("SOURCE_SURGERY_PENDING_REQUEST");
    }
  });

  it("auto-files reschedule when plannedDate changes", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      {
        intent: "patch",
        payload: { plannedDate: "2027-06-08T09:00:00Z", actualEndTime: "2027-06-08T10:30:00Z" },
        reason: "earlier slot available",
        actorId: "u1",
      },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("auto_file");
    if (result.kind === "auto_file") {
      expect(result.actionType).toBe("reschedule");
      expect(result.proposedDate).toBe("2027-06-08");
      expect(result.proposedTimeFrom).toBe(540); // 09:00 = 9*60
      expect(result.proposedTimeTo).toBe(630);   // 10:30
      expect(result.reason).toBe("earlier slot available");
    }
  });

  it("auto-files reschedule when only actualEndTime (duration) changes", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      {
        intent: "patch",
        payload: { actualEndTime: "2027-06-01T10:00:00Z" },
        reason: "expected longer case",
        actorId: "u1",
      },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("auto_file");
    if (result.kind === "auto_file") {
      expect(result.actionType).toBe("reschedule");
      expect(result.proposedDate).toBe("2027-06-01");
      expect(result.proposedTimeFrom).toBe(480); // 08:00 stays
      expect(result.proposedTimeTo).toBe(600);   // 10:00 new
    }
  });

  it("auto-files suspension when isSuspended toggles to true", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      {
        intent: "patch",
        payload: { isSuspended: true, suspendedReason: "patient unwell" },
        reason: "patient unwell",
        actorId: "u1",
      },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("auto_file");
    if (result.kind === "auto_file") {
      expect(result.actionType).toBe("suspension");
    }
  });

  it("auto-files cancellation when intent='archive'", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      { intent: "archive", payload: {}, reason: "no longer needed", actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("auto_file");
    if (result.kind === "auto_file") {
      expect(result.actionType).toBe("cancellation");
      expect(result.reason).toBe("no longer needed");
    }
  });

  it("rejects non-gated PATCH fields with 409 SOURCE_SURGERY_PARTIAL_LOCKDOWN", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      { intent: "patch", payload: { notes: "new note", surgeonId: "other-surgeon" }, reason: null, actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("reject");
    if (result.kind === "reject") {
      expect(result.body.code).toBe("SOURCE_SURGERY_PARTIAL_LOCKDOWN");
    }
  });

  it("rejects auto_file actions when reason is missing", () => {
    const result = evaluateCrossTenantGate(
      baseSurgery(),
      { intent: "patch", payload: { plannedDate: "2027-06-08T08:00:00Z" }, reason: null, actorId: "u1" },
      { hasPendingActionRequest: false },
    );
    expect(result.kind).toBe("reject");
    if (result.kind === "reject") {
      expect(result.body.code).toBe("REASON_REQUIRED");
    }
  });

  it("GATED_FIELDS lists exactly plannedDate, actualEndTime, isSuspended, suspendedReason", () => {
    expect(new Set(GATED_FIELDS)).toEqual(new Set(["plannedDate", "actualEndTime", "isSuspended", "suspendedReason"]));
  });
});

// ---------------------------------------------------------------------------
// Integration: PATCH /api/anesthesia/surgeries/:id wires the gate into the
// real Express handler. Requires DB connectivity and uses supertest.
// ---------------------------------------------------------------------------
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

describe("PATCH /api/anesthesia/surgeries/:id — cross-tenant gate", () => {
  it("date change → 202 AUTO_FILED and a new pending reschedule action_request", async () => {
    const [surgeon] = await db.insert(users).values({ email: `gate-${Date.now()}@t.local`, firstName: "G", lastName: "S" }).returning();
    cleanup.users.push(surgeon.id);
    const [praxis] = await db.insert(hospitals).values({ name: `Praxis ${Date.now()}`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `Dest ${Date.now()}` } as any).returning();
    cleanup.hospitals.push(praxis.id, dest.id);
    const [orUnit] = await db.insert(units).values({ hospitalId: praxis.id, name: "OR", type: "OR" } as any).returning();
    await db.insert(userHospitalRoles).values({
      userId: surgeon.id, hospitalId: praxis.id, unitId: orUnit.id, role: "admin", isBookable: true,
    } as any);
    const [src] = await db.insert(surgeries).values({
      hospitalId: praxis.id,
      plannedDate: new Date("2027-06-01T08:00:00Z"),
      actualEndTime: new Date("2027-06-01T09:30:00Z"),
      referralStatus: "confirmed_external",
      status: "planned",
      surgeonId: surgeon.id,
      plannedSurgery: "Test",
    } as any).returning();
    const [destSurg] = await db.insert(surgeries).values({
      hospitalId: dest.id, plannedDate: new Date("2027-06-01T08:00:00Z"), surgeonId: surgeon.id,
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: praxis.id, sourceSurgeryId: src.id, surgeryId: destSurg.id,
      surgeonId: surgeon.id, surgeonFirstName: "G", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "Test", wishedDate: "2027-06-01", wishedTimeFrom: 480, status: "scheduled",
      surgeryDurationMinutes: 60,
    } as any).returning();
    await db.update(surgeries).set({ externalRequestId: extReq.id } as any).where(eq(surgeries.id, src.id));

    const resp = await request(integrationApp)
      .patch(`/api/anesthesia/surgeries/${src.id}`)
      .set("x-test-user-id", surgeon.id)
      .send({
        plannedDate: "2027-06-08T09:00:00.000Z",
        actualEndTime: "2027-06-08T10:30:00.000Z",
        crossTenantReason: "earlier slot available",
      });
    expect(resp.status).toBe(202);
    expect(resp.body.code).toBe("AUTO_FILED");
    expect(resp.body.actionRequestId).toBeDefined();
    expect(resp.body.actionType).toBe("reschedule");

    const [unchanged] = await db.select().from(surgeries).where(eq(surgeries.id, src.id));
    expect(new Date(unchanged.plannedDate!).toISOString()).toBe("2027-06-01T08:00:00.000Z");

    const [pending] = await db.select().from(surgeonActionRequests).where(eq(surgeonActionRequests.id, resp.body.actionRequestId));
    expect(pending.type).toBe("reschedule");
    expect(pending.status).toBe("pending");
    expect(pending.hospitalId).toBe(dest.id);
    expect(pending.proposedDate).toBe("2027-06-08");
    expect(pending.proposedTimeFrom).toBe(540);
    expect(pending.proposedTimeTo).toBe(630);
    expect(pending.reason).toBe("earlier slot available");
  });

  it("non-gated field on confirmed_external → 409 SOURCE_SURGERY_PARTIAL_LOCKDOWN", async () => {
    const [surgeon] = await db.insert(users).values({ email: `lock-${Date.now()}@t.local`, firstName: "L", lastName: "S" }).returning();
    cleanup.users.push(surgeon.id);
    const [praxis] = await db.insert(hospitals).values({ name: `Praxis-lock ${Date.now()}`, tenantType: "praxis" } as any).returning();
    const [dest] = await db.insert(hospitals).values({ name: `Dest-lock ${Date.now()}` } as any).returning();
    cleanup.hospitals.push(praxis.id, dest.id);
    const [orUnit] = await db.insert(units).values({ hospitalId: praxis.id, name: "OR", type: "OR" } as any).returning();
    await db.insert(userHospitalRoles).values({ userId: surgeon.id, hospitalId: praxis.id, unitId: orUnit.id, role: "admin", isBookable: true } as any);
    const [src] = await db.insert(surgeries).values({
      hospitalId: praxis.id, plannedDate: new Date("2027-06-01T08:00:00Z"),
      referralStatus: "confirmed_external", status: "planned", surgeonId: surgeon.id, plannedSurgery: "T",
    } as any).returning();
    const [extReq] = await db.insert(externalSurgeryRequests).values({
      hospitalId: dest.id, sourceHospitalId: praxis.id, sourceSurgeryId: src.id,
      surgeonId: surgeon.id, surgeonFirstName: "L", surgeonLastName: "S", surgeonEmail: surgeon.email!, surgeonPhone: "",
      surgeryName: "T", wishedDate: "2027-06-01", wishedTimeFrom: 480, status: "scheduled", surgeryDurationMinutes: 60,
    } as any).returning();
    await db.update(surgeries).set({ externalRequestId: extReq.id } as any).where(eq(surgeries.id, src.id));

    const resp = await request(integrationApp)
      .patch(`/api/anesthesia/surgeries/${src.id}`)
      .set("x-test-user-id", surgeon.id)
      .send({ notes: "trying to update notes" });
    expect(resp.status).toBe(409);
    expect(resp.body.code).toBe("SOURCE_SURGERY_PARTIAL_LOCKDOWN");
  });
});
