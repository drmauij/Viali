import type { RcriResult, BreakdownEntry, SurgeryRiskClass } from './types';

export interface RcriInputs {
  surgeryRiskClass: SurgeryRiskClass | null;
  hasCAD: boolean;
  hasCHF: boolean;
  hasCerebrovascularDisease: boolean;
  isInsulinDependentDiabetic: boolean;
  creatinineMgDl: number | null;
}

const MACE_BY_SCORE: Record<number, number> = { 0: 0.4, 1: 1.0, 2: 2.4 };

function macePercent(score: number): number {
  return MACE_BY_SCORE[score] ?? 5.4;
}

function categorize(score: number): RcriResult['category'] {
  if (score >= 2) return 'high';
  if (score >= 1) return 'moderate';
  return 'low';
}

export function calculateRcri(i: RcriInputs): RcriResult {
  const b: BreakdownEntry[] = [];
  const push = (c: string, met: boolean) => b.push({ criterion: c, points: 1, met });

  push('High-risk surgery', i.surgeryRiskClass === 'critical');
  push('CAD history', i.hasCAD);
  push('CHF history', i.hasCHF);
  push('Cerebrovascular history', i.hasCerebrovascularDisease);
  push('Insulin-dependent diabetes', i.isInsulinDependentDiabetic);
  push('Creatinine > 2 mg/dL', (i.creatinineMgDl ?? 0) > 2);

  const score = b.filter((r) => r.met).length;
  return {
    score,
    category: categorize(score),
    breakdown: b,
    macePercent: macePercent(score),
  };
}
