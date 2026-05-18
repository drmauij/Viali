import { describe, it, expect } from 'vitest';
import { computeVerifyConfidence } from '../server/services/recoveryCases';

describe('computeVerifyConfidence', () => {
  it('returns high when service and provider both match', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: 'svc-1', providerId: 'prov-1' },
        { serviceId: 'svc-1', providerId: 'prov-1' },
      ),
    ).toBe('high');
  });

  it('returns medium when only service matches', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: 'svc-1', providerId: 'prov-1' },
        { serviceId: 'svc-1', providerId: 'prov-2' },
      ),
    ).toBe('medium');
  });

  it('returns medium when only provider matches', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: 'svc-1', providerId: 'prov-1' },
        { serviceId: 'svc-2', providerId: 'prov-1' },
      ),
    ).toBe('medium');
  });

  it('returns low when neither matches', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: 'svc-1', providerId: 'prov-1' },
        { serviceId: 'svc-2', providerId: 'prov-2' },
      ),
    ).toBe('low');
  });

  it('treats null serviceId on both sides as a non-match (general appointments)', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: null, providerId: 'prov-1' },
        { serviceId: null, providerId: 'prov-1' },
      ),
    ).toBe('medium');
  });

  it('treats null serviceId on one side as a non-match', () => {
    expect(
      computeVerifyConfidence(
        { serviceId: 'svc-1', providerId: 'prov-1' },
        { serviceId: null, providerId: 'prov-1' },
      ),
    ).toBe('medium');
  });
});
