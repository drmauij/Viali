import { describe, it, expect, beforeEach } from 'vitest';

describe('Meta Leads Webhook Validation', () => {
  const validPayload = {
    lead_id: 'lead_123',
    form_id: 'form_456',
    first_name: 'Maria',
    last_name: 'Müller',
    email: 'maria@example.com',
    phone: '+41791234567',
    operation: 'Brustvergrößerung',
    source: 'ig',
  };

  let validateMetaLeadPayload: (body: unknown) => { success: boolean; data?: any; error?: string };

  beforeEach(async () => {
    const mod = await import('../server/routes/metaLeads');
    validateMetaLeadPayload = mod.validateMetaLeadPayload;
  });

  it('accepts a valid full payload', () => {
    const result = validateMetaLeadPayload(validPayload);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      metaLeadId: 'lead_123',
      metaFormId: 'form_456',
      firstName: 'Maria',
      lastName: 'Müller',
    });
  });

  it('accepts payload without email (phone only)', () => {
    const { email, ...noEmail } = validPayload;
    const result = validateMetaLeadPayload(noEmail);
    expect(result.success).toBe(true);
  });

  it('accepts payload without phone (email only)', () => {
    const { phone, ...noPhone } = validPayload;
    const result = validateMetaLeadPayload(noPhone);
    expect(result.success).toBe(true);
  });

  it('rejects payload missing lead_id', () => {
    const { lead_id, ...missing } = validPayload;
    const result = validateMetaLeadPayload(missing);
    expect(result.success).toBe(false);
  });

  it('rejects payload missing first_name', () => {
    const { first_name, ...missing } = validPayload;
    const result = validateMetaLeadPayload(missing);
    expect(result.success).toBe(false);
  });

  it('rejects payload with invalid source', () => {
    const result = validateMetaLeadPayload({ ...validPayload, source: 'tiktok' });
    expect(result.success).toBe(false);
  });

  it('rejects empty body', () => {
    const result = validateMetaLeadPayload({});
    expect(result.success).toBe(false);
  });

  it('rejects null body', () => {
    const result = validateMetaLeadPayload(null);
    expect(result.success).toBe(false);
  });
});
