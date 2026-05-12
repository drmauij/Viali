import { describe, it, expect } from 'vitest';
import { calculateApfel } from '../apfel';

const base = {
  sex: 'male' as const,
  isNonSmoker: false,
  hasPostopNauseaHistory: false,
  postopOpioidsPlanned: false,
};

describe('Apfel', () => {
  it('returns 0/10% PONV baseline', () => {
    const r = calculateApfel(base);
    expect(r.score).toBe(0);
    expect(r.ponvPercent).toBe(10);
  });

  it('counts female sex as a risk', () => {
    const r = calculateApfel({ ...base, sex: 'female' });
    expect(r.score).toBe(1);
    expect(r.ponvPercent).toBe(20);
  });

  it('lands at 4 points = 80% with all risks', () => {
    const r = calculateApfel({
      sex: 'female',
      isNonSmoker: true,
      hasPostopNauseaHistory: true,
      postopOpioidsPlanned: true,
    });
    expect(r.score).toBe(4);
    expect(r.ponvPercent).toBe(80);
  });
});
