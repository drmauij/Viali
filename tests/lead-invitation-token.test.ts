import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getLeadAttributionSecret,
  signLeadAttribution,
  verifyLeadAttribution,
} from '../server/services/leadInvitation';

const SECRET = 'test-secret-do-not-use-in-prod';
const LEAD_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('Lead attribution token', () => {
  it('roundtrips: signed token verifies back to the same leadId', () => {
    const token = signLeadAttribution(LEAD_ID, SECRET);
    expect(verifyLeadAttribution(token, SECRET)).toBe(LEAD_ID);
  });

  it('rejects a tampered signature', () => {
    const token = signLeadAttribution(LEAD_ID, SECRET);
    const [payload, sig] = token.split('.');
    const tampered = `${payload}.${sig.slice(0, -1)}X`;
    expect(verifyLeadAttribution(tampered, SECRET)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const token = signLeadAttribution(LEAD_ID, SECRET);
    const [, sig] = token.split('.');
    const otherId = '660e8400-e29b-41d4-a716-446655440001';
    const fakePayload = Buffer.from(otherId, 'utf8').toString('base64url');
    expect(verifyLeadAttribution(`${fakePayload}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signLeadAttribution(LEAD_ID, 'other-secret');
    expect(verifyLeadAttribution(token, SECRET)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyLeadAttribution('', SECRET)).toBeNull();
    expect(verifyLeadAttribution('no-dot-here', SECRET)).toBeNull();
    expect(verifyLeadAttribution('.', SECRET)).toBeNull();
    expect(verifyLeadAttribution('only-payload.', SECRET)).toBeNull();
    expect(verifyLeadAttribution('.only-sig', SECRET)).toBeNull();
  });

  it('produces a fixed-length 71-char token for UUID leadIds', () => {
    // 36-char UUID → 48 base64url chars + "." + 22 sig chars = 71. Pinning
    // the exact length catches accidental encoding changes (e.g. padding).
    const token = signLeadAttribution(LEAD_ID, SECRET);
    expect(token.length).toBe(71);
  });

  it('produces a stable signature for the same input', () => {
    const a = signLeadAttribution(LEAD_ID, SECRET);
    const b = signLeadAttribution(LEAD_ID, SECRET);
    expect(a).toBe(b);
  });
});

describe('getLeadAttributionSecret', () => {
  let savedLead: string | undefined;
  let savedMkt: string | undefined;

  beforeEach(() => {
    savedLead = process.env.LEAD_ATTRIBUTION_SECRET;
    savedMkt = process.env.MARKETING_UNSUBSCRIBE_SECRET;
    delete process.env.LEAD_ATTRIBUTION_SECRET;
    delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
  });

  afterEach(() => {
    if (savedLead === undefined) delete process.env.LEAD_ATTRIBUTION_SECRET;
    else process.env.LEAD_ATTRIBUTION_SECRET = savedLead;
    if (savedMkt === undefined) delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
    else process.env.MARKETING_UNSUBSCRIBE_SECRET = savedMkt;
  });

  it('prefers the per-hospital override', () => {
    process.env.LEAD_ATTRIBUTION_SECRET = 'from-env';
    process.env.MARKETING_UNSUBSCRIBE_SECRET = 'from-marketing';
    const secret = getLeadAttributionSecret({ leadAttributionSecret: 'from-hospital' });
    expect(secret).toBe('from-hospital');
  });

  it('falls back to LEAD_ATTRIBUTION_SECRET when no hospital override', () => {
    process.env.LEAD_ATTRIBUTION_SECRET = 'from-env';
    process.env.MARKETING_UNSUBSCRIBE_SECRET = 'from-marketing';
    const secret = getLeadAttributionSecret({ leadAttributionSecret: null });
    expect(secret).toBe('from-env');
  });

  it('falls back to MARKETING_UNSUBSCRIBE_SECRET when no other source', () => {
    process.env.MARKETING_UNSUBSCRIBE_SECRET = 'from-marketing';
    const secret = getLeadAttributionSecret({ leadAttributionSecret: null });
    expect(secret).toBe('from-marketing');
  });

  it('throws when no source is configured', () => {
    expect(() => getLeadAttributionSecret({ leadAttributionSecret: null })).toThrow(
      /lead_attribution_secret|LEAD_ATTRIBUTION_SECRET|MARKETING_UNSUBSCRIBE_SECRET/i
    );
  });
});
