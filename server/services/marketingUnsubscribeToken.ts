import { createHmac, timingSafeEqual } from "node:crypto";

interface UnsubscribePayload {
  pid: string; // patient id
  hid: string; // hospital id
  v: 1;        // schema version
}

function getSecret(): string {
  const s =
    process.env.MARKETING_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET;
  if (!s) {
    throw new Error(
      "MARKETING_UNSUBSCRIBE_SECRET (or SESSION_SECRET fallback) must be set",
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string, secret: string): string {
  return b64urlEncode(createHmac("sha256", secret).update(payload).digest());
}

export function generateUnsubscribeToken(
  patientId: string,
  hospitalId: string,
): string {
  const payload: UnsubscribePayload = { pid: patientId, hid: hospitalId, v: 1 };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = sign(payloadB64, getSecret());
  return `${payloadB64}.${signature}`;
}

export function verifyUnsubscribeToken(token: string): {
  patientId: string;
  hospitalId: string;
} {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Malformed unsubscribe token");
  }
  const [payloadB64, signature] = parts;
  const expected = sign(payloadB64, getSecret());

  const sigBuf = b64urlDecode(signature);
  const expBuf = b64urlDecode(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid unsubscribe token signature");
  }

  let parsed: UnsubscribePayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    throw new Error("Malformed unsubscribe token payload");
  }

  if (parsed.v !== 1 || !parsed.pid || !parsed.hid) {
    throw new Error("Invalid unsubscribe token payload");
  }
  return { patientId: parsed.pid, hospitalId: parsed.hid };
}
