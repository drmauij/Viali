import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateExecutionToken,
  verifyExecutionToken,
} from "../server/services/marketingExecutionToken";

describe("marketingExecutionToken", () => {
  beforeEach(() => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret-abc123";
  });
  afterEach(() => {
    delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
  });

  it("round-trips a valid token with variant", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    expect(verifyExecutionToken(token)).toEqual({
      executionId: "exec_1",
      variantId: "var_A",
    });
  });

  it("round-trips a valid token without variant (null)", () => {
    const token = generateExecutionToken("exec_1", null);
    expect(verifyExecutionToken(token)).toEqual({
      executionId: "exec_1",
      variantId: null,
    });
  });

  it("rejects a tampered payload", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    const [payload, sig] = token.split(".");
    const mid = Math.floor(payload.length / 2);
    const orig = payload[mid];
    const replacement = orig === "A" ? "B" : "A";
    const tampered = payload.slice(0, mid) + replacement + payload.slice(mid + 1);
    expect(() => verifyExecutionToken(`${tampered}.${sig}`)).toThrow(/invalid/i);
  });

  it("rejects a tampered signature", () => {
    const token = generateExecutionToken("exec_1", "var_A");
    const [payload] = token.split(".");
    expect(() => verifyExecutionToken(`${payload}.deadbeef`)).toThrow(/invalid/i);
  });

  it("rejects a malformed token (no dot)", () => {
    expect(() => verifyExecutionToken("notatoken")).toThrow(/malformed/i);
  });

  it("rejects an unsubscribe token (v:1) when the verifier expects v:2", () => {
    const { createHmac } = require("node:crypto");
    const payloadObj = { pid: "pat_1", hid: "hosp_1", v: 1 };
    const payloadB64 = Buffer.from(JSON.stringify(payloadObj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const sig = createHmac("sha256", "test-secret-abc123")
      .update(payloadB64)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(() => verifyExecutionToken(`${payloadB64}.${sig}`)).toThrow(/payload/i);
  });
});
