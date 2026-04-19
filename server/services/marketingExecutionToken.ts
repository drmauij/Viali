import { createHmac, timingSafeEqual } from "node:crypto";

interface ExecutionPayload {
  eid: string;              // flow_execution_id
  vid: string | null;       // variant_id (null when holdout remainder, pre-winner)
  v: 2;
}

// Reuses Phase 1's secret — intentional. Rotation invalidates outstanding
// booking-link tokens, same as unsubscribe tokens. See replit.md for ops notes.
function getSecret(): string {
  const s = process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "MARKETING_UNSUBSCRIBE_SECRET (or SESSION_SECRET fallback) must be set",
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function generateExecutionToken(
  executionId: string,
  variantId: string | null,
): string {
  const payload: ExecutionPayload = { eid: executionId, vid: variantId, v: 2 };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = sign(payloadB64, getSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyExecutionToken(token: string): {
  executionId: string;
  variantId: string | null;
} {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Malformed execution token");
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, getSecret());

  const sigBuf = b64urlDecode(signature);
  const expBuf = b64urlDecode(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid execution token signature");
  }

  let parsed: ExecutionPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("Malformed execution token payload");
  }
  if (parsed.v !== 2 || !parsed.eid) {
    throw new Error("Invalid execution token payload");
  }
  return {
    executionId: parsed.eid,
    variantId: parsed.vid ?? null,
  };
}
