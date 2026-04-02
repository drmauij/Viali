import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub heavy server modules that require env vars (DATABASE_URL, ENCRYPTION_SECRET, etc.)
vi.mock('../server/db', () => ({ db: {}, pool: {} }));
vi.mock('../server/storage', () => ({ storage: {} }));
vi.mock('../server/auth/google', () => ({ isAuthenticated: vi.fn() }));
vi.mock('../server/logger', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('../server/services/patientDeduplication', () => ({ calculateNameSimilarity: vi.fn() }));

describe('Leads Webhook Validation', () => {
  let validateLeadPayload: (body: unknown) => { success: boolean; data?: any; error?: string };

  beforeEach(async () => {
    const mod = await import('../server/routes/leads');
    validateLeadPayload = mod.validateLeadPayload;
  });

  // ── Meta lead payloads (backward compatibility) ──

  const validMetaPayload = {
    lead_id: 'lead_123',
    form_id: 'form_456',
    first_name: 'Maria',
    last_name: 'Müller',
    email: 'maria@example.com',
    phone: '+41791234567',
    operation: 'Brustvergrößerung',
    source: 'ig',
  };

  it('accepts a valid Meta lead payload', () => {
    const result = validateLeadPayload(validMetaPayload);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      metaLeadId: 'lead_123',
      metaFormId: 'form_456',
      firstName: 'Maria',
      lastName: 'Müller',
      source: 'ig',
    });
  });

  it('accepts Meta payload without email (phone only)', () => {
    const { email, ...noEmail } = validMetaPayload;
    const result = validateLeadPayload(noEmail);
    expect(result.success).toBe(true);
  });

  it('accepts Meta payload without phone (email only)', () => {
    const { phone, ...noPhone } = validMetaPayload;
    const result = validateLeadPayload(noPhone);
    expect(result.success).toBe(true);
  });

  it('rejects Meta payload missing lead_id', () => {
    const { lead_id, ...missing } = validMetaPayload;
    const result = validateLeadPayload(missing);
    expect(result.success).toBe(false);
    expect(result.error).toContain('lead_id');
  });

  it('rejects Meta payload missing operation', () => {
    const { operation, ...missing } = validMetaPayload;
    const result = validateLeadPayload(missing);
    expect(result.success).toBe(false);
    expect(result.error).toContain('operation');
  });

  it('rejects payload missing first_name', () => {
    const { first_name, ...missing } = validMetaPayload;
    const result = validateLeadPayload(missing);
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = validateLeadPayload({});
    expect(result.success).toBe(false);
  });

  it('rejects null body', () => {
    const result = validateLeadPayload(null);
    expect(result.success).toBe(false);
  });

  // ── Website lead payloads ──

  const validWebsitePayload = {
    source: 'website',
    first_name: 'Hans',
    last_name: 'Weber',
    email: 'hans@example.com',
    phone: '+41791234567',
    message: 'Ich interessiere mich für eine Brustvergrösserung',
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'fruehjahr-2026',
    utm_term: 'brustvergrösserung kreuzlingen',
    gclid: 'abc123def456',
  };

  it('accepts a valid website lead payload', () => {
    const result = validateLeadPayload(validWebsitePayload);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      firstName: 'Hans',
      lastName: 'Weber',
      source: 'website',
      message: 'Ich interessiere mich für eine Brustvergrösserung',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'fruehjahr-2026',
      utmTerm: 'brustvergrösserung kreuzlingen',
      gclid: 'abc123def456',
      metaLeadId: null,
      metaFormId: null,
    });
  });

  it('accepts website payload without lead_id/form_id/operation', () => {
    const result = validateLeadPayload(validWebsitePayload);
    expect(result.success).toBe(true);
    expect(result.data!.metaLeadId).toBeNull();
    expect(result.data!.metaFormId).toBeNull();
    expect(result.data!.operation).toBeNull();
  });

  it('accepts website payload with email only (no phone)', () => {
    const { phone, ...noPhone } = validWebsitePayload;
    const result = validateLeadPayload(noPhone);
    expect(result.success).toBe(true);
  });

  it('rejects website payload without email and phone', () => {
    const { email, phone, ...noContact } = validWebsitePayload;
    const result = validateLeadPayload(noContact);
    expect(result.success).toBe(false);
    expect(result.error).toContain('email or phone');
  });

  it('rejects payload missing source', () => {
    const { source, ...noSource } = validWebsitePayload;
    const result = validateLeadPayload(noSource);
    expect(result.success).toBe(false);
    expect(result.error).toContain('source');
  });

  it('accepts any source string (not restricted to fb/ig)', () => {
    const result = validateLeadPayload({ ...validWebsitePayload, source: 'custom-crm' });
    expect(result.success).toBe(true);
    expect(result.data!.source).toBe('custom-crm');
  });

  it('accepts website payload with all UTM and click ID fields', () => {
    const full = {
      ...validWebsitePayload,
      utm_content: 'banner-v2',
      gbraid: 'gb123',
      wbraid: 'wb123',
      fbclid: 'fb123',
      ttclid: 'tt123',
      msclkid: 'ms123',
      igshid: 'ig123',
      li_fat_id: 'li123',
      twclid: 'tw123',
    };
    const result = validateLeadPayload(full);
    expect(result.success).toBe(true);
    expect(result.data!.gbraid).toBe('gb123');
    expect(result.data!.twclid).toBe('tw123');
  });

  it('sets missing optional fields to null', () => {
    const minimal = {
      source: 'website',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
    };
    const result = validateLeadPayload(minimal);
    expect(result.success).toBe(true);
    expect(result.data!.message).toBeNull();
    expect(result.data!.utmSource).toBeNull();
    expect(result.data!.gclid).toBeNull();
    expect(result.data!.operation).toBeNull();
  });
});
