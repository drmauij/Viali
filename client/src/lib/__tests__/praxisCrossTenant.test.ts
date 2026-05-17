import { describe, it, expect } from "vitest";
import {
  isCrossTenantSource,
  hasPendingCrossTenantAction,
  latestRefusal,
  buildDestinationSummaryUrl,
} from "../praxisCrossTenant";

describe("isCrossTenantSource", () => {
  it("true for confirmed_external", () => {
    expect(isCrossTenantSource({ referralStatus: "confirmed_external" })).toBe(true);
  });
  it("false for local / pending_external / cancelled / rejected / null / undefined input", () => {
    expect(isCrossTenantSource({ referralStatus: "local" })).toBe(false);
    expect(isCrossTenantSource({ referralStatus: "pending_external" })).toBe(false);
    expect(isCrossTenantSource({ referralStatus: "cancelled_external" })).toBe(false);
    expect(isCrossTenantSource({ referralStatus: "rejected_external" })).toBe(false);
    expect(isCrossTenantSource({ referralStatus: null })).toBe(false);
    expect(isCrossTenantSource(null)).toBe(false);
    expect(isCrossTenantSource(undefined)).toBe(false);
  });
});

describe("hasPendingCrossTenantAction", () => {
  it("true when pendingActionRequest is set", () => {
    expect(
      hasPendingCrossTenantAction({
        pendingActionRequest: { id: "x", type: "cancellation", reason: null },
      } as any),
    ).toBe(true);
  });
  it("false when null/undefined", () => {
    expect(hasPendingCrossTenantAction({ pendingActionRequest: null })).toBe(false);
    expect(hasPendingCrossTenantAction(null)).toBe(false);
    expect(hasPendingCrossTenantAction(undefined)).toBe(false);
  });
});

describe("latestRefusal", () => {
  it("returns the most recent request_refused entry", () => {
    const r = latestRefusal({
      rescheduleHistory: [
        { type: "request_refused", request_type: "cancellation", reason: "first", at: "2026-05-01T00:00:00Z" },
        { type: "request_refused", request_type: "reschedule", reason: "second", at: "2026-05-10T00:00:00Z" },
        { type: "other_thing", reason: "ignored" } as any,
      ],
    });
    expect(r?.request_type).toBe("reschedule");
    expect(r?.reason).toBe("second");
  });
  it("returns null when no request_refused entries", () => {
    expect(latestRefusal({ rescheduleHistory: [{ type: "scheduled" } as any] })).toBeNull();
    expect(latestRefusal({ rescheduleHistory: [] })).toBeNull();
    expect(latestRefusal(null)).toBeNull();
    expect(latestRefusal(undefined)).toBeNull();
  });
});

describe("buildDestinationSummaryUrl", () => {
  it("URL-encodes token and surgery id", () => {
    expect(buildDestinationSummaryUrl("tok 1", "surg/1")).toBe("/surgeon-portal/tok%201/?surgery=surg%2F1");
  });
  it("simple alphanumeric values pass through unchanged", () => {
    expect(buildDestinationSummaryUrl("abc123", "surg-xyz")).toBe("/surgeon-portal/abc123/?surgery=surg-xyz");
  });
});
