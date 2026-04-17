import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../server/services/marketingUnsubscribeToken";

describe("marketingUnsubscribeToken", () => {
  beforeEach(() => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret-abc123";
  });

  afterEach(() => {
    delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
  });

  it("round-trips a valid token", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ patientId: "pat_1", hospitalId: "hosp_1" });
  });

  it("rejects a tampered payload", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload, sig] = token.split(".");
    // Flip a middle character — safer than touching the trailing char where
    // some bits may be masked off during base64url decoding.
    const mid = Math.floor(payload.length / 2);
    const original = payload[mid];
    const replacement = original === "A" ? "B" : "A";
    const tamperedPayload = payload.slice(0, mid) + replacement + payload.slice(mid + 1);
    expect(() => verifyUnsubscribeToken(`${tamperedPayload}.${sig}`)).toThrow(/invalid/i);
  });

  it("rejects a tampered signature", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload] = token.split(".");
    expect(() => verifyUnsubscribeToken(`${payload}.deadbeef`)).toThrow(/invalid/i);
  });

  it("rejects a malformed token (no dot)", () => {
    expect(() => verifyUnsubscribeToken("notatoken")).toThrow(/malformed/i);
  });

  it("produces different signatures for different secrets", () => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "secret-A";
    const tokenA = generateUnsubscribeToken("pat_1", "hosp_1");
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "secret-B";
    expect(() => verifyUnsubscribeToken(tokenA)).toThrow(/invalid/i);
  });
});
