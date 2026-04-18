import { createHmac, timingSafeEqual } from "node:crypto";

interface VerifyArgs {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  rawBody: string;
}

const TOLERANCE_SECONDS = 5 * 60;

function getSecret(): string {
  // Resend prefixes their secret with "whsec_". The Svix verification scheme
  // signs with the raw bytes after the prefix, but we accept the secret as-is
  // and let the operator set it however Resend gave it (with or without prefix).
  const raw = process.env.RESEND_WEBHOOK_SECRET;
  if (!raw) throw new Error("RESEND_WEBHOOK_SECRET must be set");
  return raw.startsWith("whsec_") ? raw.slice("whsec_".length) : raw;
}

function computeExpected(secret: string, msgId: string, ts: string, body: string): Buffer {
  return createHmac("sha256", secret)
    .update(`${msgId}.${ts}.${body}`)
    .digest();
}

export function verifySvixSignature(args: VerifyArgs): void {
  const { svixId, svixTimestamp, svixSignature, rawBody } = args;
  const secret = getSecret();

  // Replay protection
  const tsNum = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(tsNum)) {
    throw new Error("Invalid svix timestamp");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsNum) > TOLERANCE_SECONDS) {
    throw new Error("Svix timestamp outside tolerance window");
  }

  // Signature header may contain multiple space-separated `v1,<base64>` entries
  // (during secret rotation Svix sends both old and new signatures).
  const candidates = svixSignature.split(" ").filter(Boolean);
  const expected = computeExpected(secret, svixId, svixTimestamp, rawBody);

  let matched = false;
  for (const candidate of candidates) {
    const [version, b64] = candidate.split(",");
    if (version !== "v1" || !b64) continue;
    let actual: Buffer;
    try {
      actual = Buffer.from(b64, "base64");
    } catch {
      continue;
    }
    if (actual.length !== expected.length) continue;
    if (timingSafeEqual(actual, expected)) {
      matched = true;
      break;
    }
  }
  if (!matched) {
    throw new Error("Invalid svix signature");
  }
}
