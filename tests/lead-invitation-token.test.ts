import { describe, it, expect } from 'vitest';
import {
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

  it('keeps the token under 80 characters for UUID leadIds', () => {
    const token = signLeadAttribution(LEAD_ID, SECRET);
    expect(token.length).toBeLessThan(80);
  });

  it('produces a stable signature for the same input', () => {
    const a = signLeadAttribution(LEAD_ID, SECRET);
    const b = signLeadAttribution(LEAD_ID, SECRET);
    expect(a).toBe(b);
  });
});
