import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hospital } from '@shared/schema';

const SIG_LENGTH = 22; // ~128 bits of entropy, keeps URLs short

/**
 * Resolve the HMAC secret used to sign / verify lead attribution tokens.
 * Priority:
 *   1. Per-hospital override on `hospitals.lead_attribution_secret`
 *   2. `LEAD_ATTRIBUTION_SECRET` env var
 *   3. `MARKETING_UNSUBSCRIBE_SECRET` env var (already configured on prod for Flows)
 * Throws if none configured — caller is expected to catch and log.
 */
export function getLeadAttributionSecret(hospital: Pick<Hospital, 'leadAttributionSecret'>): string {
  const secret =
    hospital.leadAttributionSecret ||
    process.env.LEAD_ATTRIBUTION_SECRET ||
    process.env.MARKETING_UNSUBSCRIBE_SECRET;
  if (!secret) {
    throw new Error('No lead attribution secret configured (set hospitals.lead_attribution_secret, LEAD_ATTRIBUTION_SECRET, or MARKETING_UNSUBSCRIBE_SECRET)');
  }
  return secret;
}

/**
 * Sign a leadId for inclusion in a booking-link `?lid=<token>` query parameter.
 *
 * Token shape: `<base64url(leadId)>.<22-char base64url HMAC-SHA256 prefix>`.
 * The HMAC is intentionally truncated to 22 base64url chars (~132 bits of
 * entropy) so the URL stays short. No expiry is encoded — patients may book
 * weeks after receiving the invitation.
 */
export function signLeadAttribution(leadId: string, secret: string): string {
  const payload = Buffer.from(leadId, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url').slice(0, SIG_LENGTH);
  return `${payload}.${sig}`;
}

/**
 * Verify a `lid` token. Returns the original leadId on success, `null` on
 * ANY failure (malformed string, missing dot, tampered payload, tampered
 * signature, wrong secret, invalid base64url). Never throws. Constant-time
 * comparison via `timingSafeEqual`.
 */
export function verifyLeadAttribution(token: string, secret: string): string | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url').slice(0, SIG_LENGTH);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  // Defense-in-depth: the HMAC check above already guarantees payload integrity,
  // but `Buffer.from(_, 'base64url')` will silently decode garbage if given
  // unexpected input. The HMAC won't have matched in that case so we're already
  // returning early, but keep the try/catch belt-and-suspenders.
  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}
