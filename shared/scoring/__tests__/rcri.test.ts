import { describe, it, expect } from 'vitest';
import { calculateRcri } from '../rcri';

const base = {
  surgeryRiskClass: 'standard' as const,
  hasCAD: false,
  hasCHF: false,
  hasCerebrovascularDisease: false,
  isInsulinDependentDiabetic: false,
  creatinineMgDl: 1.0,
};

describe('RCRI', () => {
  it('0 points → 0.4% MACE', () => {
    const r = calculateRcri(base);
    expect(r.score).toBe(0);
    expect(r.macePercent).toBeCloseTo(0.4, 1);
    expect(r.category).toBe('low');
  });

  it('1 point → 1.0% MACE', () => {
    const r = calculateRcri({ ...base, hasCAD: true });
    expect(r.score).toBe(1);
    expect(r.macePercent).toBeCloseTo(1.0, 1);
  });

  it('2 points → 2.4% MACE', () => {
    const r = calculateRcri({ ...base, hasCAD: true, hasCHF: true });
    expect(r.score).toBe(2);
    expect(r.macePercent).toBeCloseTo(2.4, 1);
  });

  it('≥3 points → 5.4% MACE', () => {
    const r = calculateRcri({
      ...base,
      hasCAD: true,
      hasCHF: true,
      hasCerebrovascularDisease: true,
    });
    expect(r.score).toBe(3);
    expect(r.macePercent).toBeCloseTo(5.4, 1);
  });

  it('counts critical surgery class and creatinine > 2 as risk points', () => {
    const r = calculateRcri({
      ...base,
      surgeryRiskClass: 'critical',
      creatinineMgDl: 2.5,
    });
    expect(r.score).toBe(2);
  });
});
