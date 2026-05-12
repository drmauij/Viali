import { describe, it, expect } from 'vitest';
import { calculateStopBang } from '../stopBang';

const base = {
  snoringLoud: false,
  daytimeTiredness: false,
  observedApnea: false,
  hasHypertension: false,
  bmi: 24,
  ageYears: 40,
  neckCircumferenceCm: 36,
  sex: 'female' as const,
};

describe('STOP-BANG', () => {
  it('returns 0 / low for a clean baseline', () => {
    const r = calculateStopBang(base);
    expect(r.score).toBe(0);
    expect(r.category).toBe('low');
  });

  it('counts each yes as 1pt and lands in intermediate at 3', () => {
    const r = calculateStopBang({
      ...base,
      snoringLoud: true,
      hasHypertension: true,
      bmi: 36,
    });
    expect(r.score).toBe(3);
    expect(r.category).toBe('intermediate');
  });

  it('lands in high at score ≥5', () => {
    const r = calculateStopBang({
      ...base,
      snoringLoud: true,
      daytimeTiredness: true,
      observedApnea: true,
      hasHypertension: true,
      bmi: 36,
    });
    expect(r.score).toBe(5);
    expect(r.category).toBe('high');
  });

  it('triggers Age >50, Neck >40cm, Gender=male when applicable', () => {
    const r = calculateStopBang({
      ...base,
      ageYears: 55,
      neckCircumferenceCm: 42,
      sex: 'male',
    });
    expect(r.score).toBe(3);
  });

  it('handles null neck circumference conservatively', () => {
    const r = calculateStopBang({ ...base, neckCircumferenceCm: null as any });
    expect(r.breakdown.find((b) => b.criterion.includes('Neck'))?.met).toBe(false);
  });
});
