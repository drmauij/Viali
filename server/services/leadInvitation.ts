import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hospital } from '@shared/schema';
import {
  LEAD_INVITATION_COPY,
  pickInvitationLanguage,
  escapeHtml,
  type LeadGreetingLanguage,
} from '@shared/leadInvitationTemplate';
import { db } from '../db';
import { leads, hospitals, referralEvents } from '@shared/schema';
import { eq, and, isNull, desc, inArray, sql } from 'drizzle-orm';
import { getUncachableResendClient, getAppBaseUrl } from '../email';
import logger from '../logger';

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

type LeadForInvitation = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  language: string | null;
  timeslot: string | null;
  operation: string | null;
};

type HospitalForInvitation = {
  id: string;
  name: string;
  bookingToken: string | null;
  companyLogoUrl: string | null;
  bookingTheme: { primaryColor?: string | null; bgColor?: string | null } | null;
  defaultLanguage: string | null;
  phone: string | null;
};

const DEFAULT_PRIMARY = '#2563eb';
const DEFAULT_BG = '#f8fafc';

// Only accept simple hex colors; admins set this in /admin, but a defense-in-
// depth regex prevents CSS injection if a malformed value slips in.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const safeHexOrDefault = (value: string | null | undefined, fallback: string): string =>
  value && HEX_COLOR_RE.test(value) ? value : fallback;

export function buildLeadInvitationHtml(args: {
  lead: LeadForInvitation;
  hospital: HospitalForInvitation;
  baseUrl: string;
  signedLid: string;
}): { subject: string; html: string; text: string } {
  const { lead, hospital, baseUrl, signedLid } = args;
  const lang: LeadGreetingLanguage = pickInvitationLanguage(lead.language, hospital.defaultLanguage);
  const copy = LEAD_INVITATION_COPY[lang];

  const clinic = escapeHtml(hospital.name);
  const firstName = escapeHtml(lead.firstName || '');
  const operation = lead.operation ? escapeHtml(lead.operation) : null;
  const timeslot = lead.timeslot ? escapeHtml(lead.timeslot) : null;
  const phone = hospital.phone ? escapeHtml(hospital.phone) : null;

  const bookingUrl = `${baseUrl}/book/${hospital.bookingToken}?lid=${encodeURIComponent(signedLid)}`;
  const primary = safeHexOrDefault(hospital.bookingTheme?.primaryColor, DEFAULT_PRIMARY);
  const bg = safeHexOrDefault(hospital.bookingTheme?.bgColor, DEFAULT_BG);

  const logoHtml = hospital.companyLogoUrl
    ? `<img src="${escapeHtml(hospital.companyLogoUrl)}" alt="${clinic}" style="max-height:48px;display:block;margin-bottom:24px"/>`
    : '';
  const timeslotHtml = timeslot
    ? `<p style="margin:0 0 12px;color:#475569">${copy.timeslotEcho(timeslot)}</p>`
    : '';

  const subject = copy.subject(hospital.name);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${bg};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;max-width:600px;width:100%">
        <tr><td style="padding:32px">
          ${logoHtml}
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#0f172a">${copy.greeting(firstName)}</h1>
          <p style="margin:0 0 16px;line-height:1.5;color:#334155">${copy.body(clinic, operation)}</p>
          ${timeslotHtml}
          <p style="margin:24px 0">
            <a href="${bookingUrl}" style="display:inline-block;background:${primary};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500">${escapeHtml(copy.cta)}</a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5">${copy.footer(clinic, phone)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = copy.altPlain(lead.firstName || '', hospital.name, bookingUrl);

  return { subject, html, text };
}

export async function sendLeadInvitationEmail(args: {
  leadId: string;
  hospitalId: string;
}): Promise<void> {
  try {
    const [lead] = await db.select().from(leads).where(eq(leads.id, args.leadId)).limit(1);
    if (!lead || !lead.email) return;
    if (lead.invitationEmailSentAt) return;

    const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, args.hospitalId)).limit(1);
    if (!hospital || !hospital.autoSendLeadInvitationEmail) return;

    let secret: string;
    try {
      secret = getLeadAttributionSecret(hospital);
    } catch (err: any) {
      await db.update(leads)
        .set({ invitationEmailError: `secret missing: ${err.message}`.slice(0, 500) })
        .where(eq(leads.id, lead.id));
      logger.warn({ leadId: lead.id }, 'Lead invitation skipped: attribution secret not configured');
      return;
    }

    const signedLid = signLeadAttribution(lead.id, secret);
    const baseUrl = getAppBaseUrl();
    const { subject, html, text } = buildLeadInvitationHtml({
      lead,
      hospital: {
        id: hospital.id,
        name: hospital.name,
        bookingToken: hospital.bookingToken,
        companyLogoUrl: hospital.companyLogoUrl,
        bookingTheme: hospital.bookingTheme as { primaryColor?: string | null; bgColor?: string | null } | null,
        defaultLanguage: hospital.defaultLanguage,
        phone: hospital.companyPhone ?? null,
      },
      baseUrl,
      signedLid,
    });

    try {
      const { client, fromEmail } = await getUncachableResendClient();
      const response = await client.emails.send({ from: fromEmail, to: lead.email, subject, html, text });
      // Resend SDK returns { data, error } rather than throwing on API errors.
      // Match the pattern used in server/resend.ts: convert returned error → throw
      // so the catch below records it.
      if (response.error) {
        const msg = response.error.message ?? JSON.stringify(response.error);
        throw new Error(`Resend API error: ${msg}`);
      }
      await db.update(leads)
        .set({ invitationEmailSentAt: new Date(), invitationEmailError: null })
        .where(and(eq(leads.id, lead.id), isNull(leads.invitationEmailSentAt)));
      logger.info({ leadId: lead.id, hospitalId: hospital.id }, 'Lead invitation email sent');
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      await db.update(leads)
        .set({ invitationEmailError: errMsg.slice(0, 500) })
        .where(eq(leads.id, lead.id));
      logger.error({ err, leadId: lead.id, hospitalId: hospital.id }, 'Lead invitation email failed');
    }
  } catch (outerErr) {
    // Defense-in-depth: never let this propagate to the webhook handler.
    logger.error({ err: outerErr, leadId: args.leadId }, 'sendLeadInvitationEmail outer error');
  }
}

/**
 * Attribute a freshly-created booking back to the originating lead, if any.
 *
 * Resolution order:
 *   1. Signed `lid` token (trusted — survives email forwards & address typos).
 *   2. Exact-email fallback — only when EXACTLY ONE open lead matches the
 *      booking email (case-insensitive). Two or more matches are ambiguous,
 *      so we silently skip and let the operator convert manually.
 *
 * The lead UPDATE is race-safe: the WHERE clause keeps `status IN ('new',
 * 'in_progress')`, so concurrent bookings can't double-convert and the
 * patient/appointment IDs on a lead already converted by a previous booking
 * are never clobbered.
 *
 * The matching `referralEvents` row (inserted by the booking POST handler
 * just before this call) gets its `leadId` column tagged. When no referral
 * row exists yet, the caller is responsible for inserting a minimal one.
 *
 * Never throws — booking flow must succeed even if attribution does not.
 */
export async function attachLeadToBooking(args: {
  hospital: { id: string; leadAttributionSecret: string | null };
  bookingEmail: string | null;
  signedLid: string | undefined;
  patientId: string;
  appointmentId: string;
}): Promise<{ leadId: string | null; attributionSource: 'lid' | 'email-fallback' | null }> {
  let leadId: string | null = null;
  let attributionSource: 'lid' | 'email-fallback' | null = null;

  // 1. Trust signed lid first.
  if (args.signedLid) {
    try {
      const secret = getLeadAttributionSecret(args.hospital);
      const decoded = verifyLeadAttribution(args.signedLid, secret);
      if (decoded) {
        leadId = decoded;
        attributionSource = 'lid';
      }
    } catch {
      // secret missing → silently fall through to email fallback
    }
  }

  // 2. Exact-email fallback (only when no valid signed token).
  if (!leadId && args.bookingEmail) {
    const candidates = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(
        eq(leads.hospitalId, args.hospital.id),
        sql`lower(${leads.email}) = lower(${args.bookingEmail})`,
        inArray(leads.status, ['new', 'in_progress']),
      ))
      .orderBy(desc(leads.createdAt))
      .limit(2);

    if (candidates.length === 1) {
      leadId = candidates[0].id;
      attributionSource = 'email-fallback';
    }
    // 2+ matches → silent skip (ambiguous, operator handles manually)
  }

  if (!leadId) return { leadId: null, attributionSource: null };

  // 3. Conditional UPDATE — race-safe via status filter.
  const updated = await db
    .update(leads)
    .set({
      status: 'converted',
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(leads.id, leadId),
      inArray(leads.status, ['new', 'in_progress']),
    ))
    .returning({ id: leads.id });

  if (updated.length === 0) {
    // Race: someone else already converted this lead, or it was closed.
    return { leadId: null, attributionSource: null };
  }

  // 4. Tag the referral_events row.
  await db
    .update(referralEvents)
    .set({ leadId })
    .where(eq(referralEvents.appointmentId, args.appointmentId))
    .returning({ id: referralEvents.id });

  logger.info(
    { leadId, appointmentId: args.appointmentId, attributionSource },
    'Lead auto-converted via booking',
  );

  return { leadId, attributionSource };
}
