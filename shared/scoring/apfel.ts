import type { ApfelResult, BreakdownEntry } from './types';

export interface ApfelInputs {
  sex: 'male' | 'female' | null;
  isNonSmoker: boolean;
  hasPostopNauseaHistory: boolean;
  postopOpioidsPlanned: boolean;
}

const PONV_BY_SCORE = [10, 20, 40, 60, 80];

function categorize(score: number): ApfelResult['category'] {
  if (score >= 3) return 'high';
  if (score >= 2) return 'moderate';
  return 'low';
}

export function calculateApfel(i: ApfelInputs): ApfelResult {
  const b: BreakdownEntry[] = [];
  const push = (c: string, met: boolean) => b.push({ criterion: c, points: 1, met });

  push('Female sex', i.sex === 'female');
  push('Non-smoker', i.isNonSmoker);
  push('PONV / motion sickness history', i.hasPostopNauseaHistory);
  push('Postoperative opioids planned', i.postopOpioidsPlanned);

  const score = b.filter((r) => r.met).length;
  return {
    score,
    category: categorize(score),
    breakdown: b,
    ponvPercent: PONV_BY_SCORE[score] ?? 80,
  };
}
