import { describe, it, expect, beforeEach } from "vitest";
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../server/services/marketingUnsubscribeToken";

describe("marketingUnsubscribeToken", () => {
  beforeEach(() => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret-abc123";
  });

  it("round-trips a valid token", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const result = verifyUnsubscribeToken(token);
    expect(result).toEqual({ patientId: "pat_1", hospitalId: "hosp_1" });
  });

  it("rejects a tampered payload", () => {
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload, sig] = token.split(".");
    // flip a character in the payload
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");
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
