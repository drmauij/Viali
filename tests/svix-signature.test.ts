import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifySvixSignature } from "../server/services/svixSignature";

const SECRET = "test-svix-secret";

function computeSignature(secret: string, msgId: string, ts: string, body: string) {
  // Svix standard — raw secret (no "whsec_" prefix in the test)
  return "v1," + createHmac("sha256", secret).update(`${msgId}.${ts}.${body}`).digest("base64");
}

describe("verifySvixSignature", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  const body = '{"type":"email.opened","data":{"email_id":"abc"}}';
  const nowSec = Math.floor(Date.now() / 1000).toString();
  const msgId = "msg_test_1";

  it("accepts a valid signature", () => {
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body,
    })).not.toThrow();
  });

  it("rejects a tampered body", () => {
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body + "X",
    })).toThrow(/invalid/i);
  });

  it("rejects a bad signature", () => {
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: "v1,deadbeef",
      rawBody: body,
    })).toThrow(/invalid/i);
  });

  it("rejects a stale timestamp (older than 5 minutes)", () => {
    const stale = (Math.floor(Date.now() / 1000) - 6 * 60).toString();
    const sig = computeSignature(SECRET, msgId, stale, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: stale,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/timestamp/i);
  });

  it("rejects a future timestamp (more than 5 minutes ahead)", () => {
    const future = (Math.floor(Date.now() / 1000) + 6 * 60).toString();
    const sig = computeSignature(SECRET, msgId, future, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: future,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/timestamp/i);
  });

  it("accepts a multi-signature header (rotation) when one matches", () => {
    const validSig = computeSignature(SECRET, msgId, nowSec, body);
    const multi = `v1,deadbeef ${validSig}`; // space-separated per Svix spec
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: multi,
      rawBody: body,
    })).not.toThrow();
  });

  it("rejects when secret env var is unset", () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const sig = computeSignature(SECRET, msgId, nowSec, body);
    expect(() => verifySvixSignature({
      svixId: msgId,
      svixTimestamp: nowSec,
      svixSignature: sig,
      rawBody: body,
    })).toThrow(/secret/i);
  });
});
