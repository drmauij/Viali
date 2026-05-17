import { describe, it, expect } from "vitest";
import { evaluateCrossTenantGate, GATED_FIELDS, type GateIntent } from "../server/storage/praxisCrossTenantGate";

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
