import { describe, it, expect } from 'vitest';
import { buildLeadInvitationHtml } from '../server/services/leadInvitation';

const baseLead = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  firstName: 'Maria',
  lastName: 'Müller',
  email: 'maria@example.com',
  phone: '+41791234567',
  language: 'de' as const,
  timeslot: null as string | null,
  operation: null as string | null,
};

const baseHospital = {
  id: 'hosp-1',
  name: 'Klinik Beispiel',
  bookingToken: 'book-token-abc',
  companyLogoUrl: 'https://cdn.example.com/logo.png',
  bookingTheme: { primaryColor: '#0f766e', bgColor: '#f0fdfa' } as any,
  defaultLanguage: 'de',
  phone: '+41 44 123 45 67' as string | null,
};

const SIGNED_LID = 'TEST_SIGNED_LID';
const BASE_URL = 'https://use.viali.app';

describe('buildLeadInvitationHtml', () => {
  it('renders a German email with branding, CTA and signed lid', () => {
    const out = buildLeadInvitationHtml({ lead: baseLead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.subject).toContain('Klinik Beispiel');
    expect(out.html).toContain('Guten Tag Maria');
    expect(out.html).toContain(`href="${BASE_URL}/book/book-token-abc?lid=${SIGNED_LID}"`);
    expect(out.html).toContain('Termin jetzt buchen');
    expect(out.html).toContain('background:#0f766e'); // primary color applied to CTA
    expect(out.html).toContain('https://cdn.example.com/logo.png'); // logo img src
    expect(out.html).toContain('+41 44 123 45 67'); // phone in footer
  });

  it('falls back to default primary color when bookingTheme has no primaryColor', () => {
    const noTheme = { ...baseHospital, bookingTheme: null };
    const out = buildLeadInvitationHtml({ lead: baseLead, hospital: noTheme, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('background:#2563eb');
  });

  it('omits the logo image when companyLogoUrl is null', () => {
    const noLogo = { ...baseHospital, companyLogoUrl: null };
    const out = buildLeadInvitationHtml({ lead: baseLead, hospital: noLogo, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).not.toContain('<img');
  });

  it('echoes the timeslot when present', () => {
    const lead = { ...baseLead, timeslot: 'Wochenende vormittags' };
    const out = buildLeadInvitationHtml({ lead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Wochenende vormittags');
  });

  it('interpolates the operation into the body when present', () => {
    const lead = { ...baseLead, operation: 'Nasenkorrektur' };
    const out = buildLeadInvitationHtml({ lead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Nasenkorrektur');
  });

  it('renders English when lead.language is "en"', () => {
    const lead = { ...baseLead, language: 'en' as const };
    const out = buildLeadInvitationHtml({ lead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Hello Maria');
    expect(out.html).toContain('Book your appointment');
  });

  it('renders French when lead.language is "fr"', () => {
    const lead = { ...baseLead, language: 'fr' as const };
    const out = buildLeadInvitationHtml({ lead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Bonjour Maria');
    expect(out.html).toContain('Prendre rendez-vous');
  });

  it('renders Italian when lead.language is "it"', () => {
    const lead = { ...baseLead, language: 'it' as const };
    const out = buildLeadInvitationHtml({ lead, hospital: baseHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Buongiorno Maria');
    expect(out.html).toContain('Prenota');
  });

  it('falls back to hospital default language when lead.language is null', () => {
    const lead = { ...baseLead, language: null as any };
    const englishHospital = { ...baseHospital, defaultLanguage: 'en' };
    const out = buildLeadInvitationHtml({ lead, hospital: englishHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).toContain('Hello Maria');
  });

  it('escapes HTML in clinic name and first name to prevent injection', () => {
    const lead = { ...baseLead, firstName: '<script>alert(1)</script>' };
    const evilHospital = { ...baseHospital, name: 'Klinik "&" <Beispiel>' };
    const out = buildLeadInvitationHtml({ lead, hospital: evilHospital, baseUrl: BASE_URL, signedLid: SIGNED_LID });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('&amp;');
  });
});
