// Per-language copy for the lead invitation email. Formal register in all
// four languages — Viali is registration-grade clinical software, not
// consumer onboarding. Keep this file the single source of truth: do NOT
// translate strings inside the HTML builder.

export type LeadGreetingLanguage = 'en' | 'de' | 'fr' | 'it';

export const SUPPORTED_INVITATION_LANGUAGES: readonly LeadGreetingLanguage[] = ['en', 'de', 'fr', 'it'];

export type InvitationCopy = {
  subject: (clinicName: string) => string;
  greeting: (firstName: string) => string;
  body: (clinicName: string, operation: string | null) => string;
  timeslotEcho: (timeslot: string) => string;
  cta: string;
  footer: (clinicName: string, phone: string | null) => string;
  altPlain: (firstName: string, clinicName: string, bookingUrl: string) => string;
};

export const LEAD_INVITATION_COPY: Record<LeadGreetingLanguage, InvitationCopy> = {
  de: {
    subject: (clinic) => `${clinic}: Termin online buchen`,
    greeting: (firstName) => `Guten Tag ${firstName},`,
    body: (clinic, operation) =>
      operation
        ? `vielen Dank für Ihre Anfrage zu ${operation} bei ${clinic}. Sie können Ihren Wunschtermin direkt online buchen — wählen Sie einfach Datum und Uhrzeit, die Ihnen passen.`
        : `vielen Dank für Ihre Anfrage bei ${clinic}. Sie können Ihren Wunschtermin direkt online buchen — wählen Sie einfach Datum und Uhrzeit, die Ihnen passen.`,
    timeslotEcho: (ts) => `Sie hatten als bevorzugte Zeit angegeben: „${ts}“.`,
    cta: 'Termin jetzt buchen',
    footer: (clinic, phone) =>
      phone
        ? `Wenn Sie lieber einen Rückruf wünschen, antworten Sie bitte auf diese E-Mail oder rufen Sie uns unter ${phone} an. — ${clinic}`
        : `Wenn Sie lieber einen Rückruf wünschen, antworten Sie bitte auf diese E-Mail. — ${clinic}`,
    altPlain: (firstName, clinic, url) =>
      `Guten Tag ${firstName}, ${clinic} lädt Sie ein, Ihren Termin online zu buchen: ${url}`,
  },
  en: {
    subject: (clinic) => `${clinic}: book your appointment online`,
    greeting: (firstName) => `Dear ${firstName},`,
    body: (clinic, operation) =>
      operation
        ? `thank you for your enquiry about ${operation} at ${clinic}. You can book a slot that works for you directly online — simply choose your preferred date and time.`
        : `thank you for your enquiry at ${clinic}. You can book a slot that works for you directly online — simply choose your preferred date and time.`,
    timeslotEcho: (ts) => `You mentioned a preferred time of: "${ts}".`,
    cta: 'Book your appointment',
    footer: (clinic, phone) =>
      phone
        ? `If you would prefer a call back, simply reply to this email or call us at ${phone}. — ${clinic}`
        : `If you would prefer a call back, simply reply to this email. — ${clinic}`,
    altPlain: (firstName, clinic, url) =>
      `Dear ${firstName}, ${clinic} invites you to book your appointment online: ${url}`,
  },
  fr: {
    subject: (clinic) => `${clinic} : prenez rendez-vous en ligne`,
    greeting: (firstName) => `Bonjour ${firstName},`,
    body: (clinic, operation) =>
      operation
        ? `merci pour votre demande concernant ${operation} auprès de ${clinic}. Vous pouvez réserver directement en ligne le créneau qui vous convient — il vous suffit de choisir la date et l'heure souhaitées.`
        : `merci pour votre demande auprès de ${clinic}. Vous pouvez réserver directement en ligne le créneau qui vous convient — il vous suffit de choisir la date et l'heure souhaitées.`,
    timeslotEcho: (ts) => `Vous aviez indiqué comme moment préféré : « ${ts} ».`,
    cta: 'Prendre rendez-vous',
    footer: (clinic, phone) =>
      phone
        ? `Si vous préférez être rappelé(e), répondez à cet e-mail ou appelez-nous au ${phone}. — ${clinic}`
        : `Si vous préférez être rappelé(e), répondez simplement à cet e-mail. — ${clinic}`,
    altPlain: (firstName, clinic, url) =>
      `Bonjour ${firstName}, ${clinic} vous invite à prendre rendez-vous en ligne : ${url}`,
  },
  it: {
    subject: (clinic) => `${clinic}: prenoti il Suo appuntamento online`,
    greeting: (firstName) => `Buongiorno ${firstName},`,
    body: (clinic, operation) =>
      operation
        ? `La ringraziamo per la Sua richiesta riguardante ${operation} presso ${clinic}. Può prenotare direttamente online l'orario che preferisce — basta scegliere data e ora.`
        : `La ringraziamo per la Sua richiesta presso ${clinic}. Può prenotare direttamente online l'orario che preferisce — basta scegliere data e ora.`,
    timeslotEcho: (ts) => `Lei aveva indicato come orario preferito: «${ts}».`,
    cta: 'Prenota l\'appuntamento',
    footer: (clinic, phone) =>
      phone
        ? `Se preferisce essere richiamato/a, risponda a questa e-mail oppure ci chiami al ${phone}. — ${clinic}`
        : `Se preferisce essere richiamato/a, risponda semplicemente a questa e-mail. — ${clinic}`,
    altPlain: (firstName, clinic, url) =>
      `Buongiorno ${firstName}, ${clinic} La invita a prenotare il Suo appuntamento online: ${url}`,
  },
};

export function pickInvitationLanguage(
  leadLanguage: string | null | undefined,
  hospitalDefaultLanguage: string | null | undefined,
): LeadGreetingLanguage {
  const supported = SUPPORTED_INVITATION_LANGUAGES as readonly string[];

  // Try lead language first
  const leadCandidate = leadLanguage?.toLowerCase();
  if (leadCandidate && supported.includes(leadCandidate)) {
    return leadCandidate as LeadGreetingLanguage;
  }

  // Then hospital default
  const hospitalCandidate = hospitalDefaultLanguage?.toLowerCase();
  if (hospitalCandidate && supported.includes(hospitalCandidate)) {
    return hospitalCandidate as LeadGreetingLanguage;
  }

  // Final fallback
  return 'de';
}

/**
 * HTML-escape user-provided strings before interpolating into the email body.
 * `&` must be first so it doesn't double-escape the entity replacements below.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
