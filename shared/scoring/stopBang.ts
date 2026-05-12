import type { StopBangResult, BreakdownEntry } from './types';

export interface StopBangInputs {
  snoringLoud: boolean;
  daytimeTiredness: boolean;
  observedApnea: boolean;
  hasHypertension: boolean;
  bmi: number | null;
  ageYears: number | null;
  neckCircumferenceCm: number | null;
  sex: 'male' | 'female' | null;
}

function categorize(score: number): StopBangResult['category'] {
  if (score >= 5) return 'high';
  if (score >= 3) return 'intermediate';
  return 'low';
}

export function calculateStopBang(i: StopBangInputs): StopBangResult {
  const b: BreakdownEntry[] = [];
  const push = (c: string, met: boolean) => b.push({ criterion: c, points: 1, met });

  push('Snoring (loud)', i.snoringLoud);
  push('Tiredness (daytime)', i.daytimeTiredness);
  push('Observed apnea', i.observedApnea);
  push('Pressure (hypertension)', i.hasHypertension);
  push('BMI > 35', (i.bmi ?? 0) > 35);
  push('Age > 50', (i.ageYears ?? 0) > 50);
  push('Neck > 40 cm', (i.neckCircumferenceCm ?? 0) > 40);
  push('Gender male', i.sex === 'male');

  const score = b.filter((r) => r.met).length;
  return { score, category: categorize(score), breakdown: b };
}
