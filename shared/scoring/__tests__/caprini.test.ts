import { describe, it, expect } from 'vitest';
import { calculateCaprini } from '../caprini';

const baseInputs = {
  ageYears: 40,
  bmi: 24,
  sex: 'female' as const,
  hasLegSwelling: false,
  hasVaricoseVeins: false,
  isPregnantOrPostpartum: false,
  onOcOrHrt: false,
  plannedMinutes: 60,
  surgeryRiskClass: 'standard' as const,
  expectedBedrestOver72h: false,
  vteHistory: false,
  familyThrombophilia: false,
  strokeWithin30Days: false,
  hipOrLegFracture: false,
  spinalCordInjury: false,
  activeCancer: false,
};

describe('Caprini', () => {
  it('returns 0 / low for a healthy 40yo with minor surgery', () => {
    const r = calculateCaprini(baseInputs);
    expect(r.score).toBe(0);
    expect(r.category).toBe('low');
  });

  it('adds 1pt for age 41-60, 1pt for BMI >25, 2pt for major surgery >45min', () => {
    const r = calculateCaprini({
      ...baseInputs,
      ageYears: 50,
      bmi: 27,
      plannedMinutes: 120,
      surgeryRiskClass: 'large',
    });
    expect(r.score).toBe(4);
    expect(r.category).toBe('higher');
  });

  it('classifies high when stroke <30 days', () => {
    const r = calculateCaprini({ ...baseInputs, strokeWithin30Days: true });
    expect(r.score).toBeGreaterThanOrEqual(5);
    expect(r.category).toBe('high');
  });

  it('clamps into veryHigh at 7+ points', () => {
    const r = calculateCaprini({
      ...baseInputs,
      ageYears: 76,
      strokeWithin30Days: true,
    });
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(r.category).toBe('veryHigh');
  });

  it('emits a breakdown row for every criterion, met or not', () => {
    const r = calculateCaprini(baseInputs);
    expect(r.breakdown.length).toBeGreaterThanOrEqual(15);
    expect(r.breakdown.every((b) => typeof b.met === 'boolean')).toBe(true);
  });

  it('treats null age conservatively (no age points)', () => {
    const r = calculateCaprini({ ...baseInputs, ageYears: null as any });
    expect(r.breakdown.find((b) => b.criterion.startsWith('Age'))?.met).toBe(false);
  });
});
