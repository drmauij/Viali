import type { CapriniResult, BreakdownEntry, SurgeryRiskClass } from './types';

export interface CapriniInputs {
  ageYears: number | null;
  bmi: number | null;
  sex: 'male' | 'female' | null;
  hasLegSwelling: boolean;
  hasVaricoseVeins: boolean;
  isPregnantOrPostpartum: boolean;
  onOcOrHrt: boolean;
  plannedMinutes: number | null;
  surgeryRiskClass: SurgeryRiskClass | null;
  expectedBedrestOver72h: boolean;
  vteHistory: boolean;
  familyThrombophilia: boolean;
  strokeWithin30Days: boolean;
  hipOrLegFracture: boolean;
  spinalCordInjury: boolean;
  activeCancer: boolean;
}

function categorize(score: number): CapriniResult['category'] {
  if (score >= 7) return 'veryHigh';
  if (score >= 5) return 'high';
  if (score >= 3) return 'higher';
  if (score >= 2) return 'moderate';
  return 'low';
}

export function calculateCaprini(i: CapriniInputs): CapriniResult {
  const b: BreakdownEntry[] = [];
  const push = (criterion: string, points: number, met: boolean) =>
    b.push({ criterion, points, met });

  const age = i.ageYears ?? 0;
  push('Age 41–60', 1, age >= 41 && age <= 60);
  push('Age 61–74', 2, age >= 61 && age <= 74);
  push('Age ≥75', 3, age >= 75);

  const bmi = i.bmi ?? 0;
  push('BMI > 25', 1, bmi > 25);

  push('Leg swelling', 1, i.hasLegSwelling);
  push('Varicose veins', 1, i.hasVaricoseVeins);

  push('Pregnancy / postpartum', 1, i.sex === 'female' && i.isPregnantOrPostpartum);
  push('Oral contraceptives or HRT', 1, i.sex === 'female' && i.onOcOrHrt);

  const minutes = i.plannedMinutes ?? 0;
  const isMajor = i.surgeryRiskClass === 'large' || i.surgeryRiskClass === 'critical';
  push('Minor surgery > 45 min', 1, i.surgeryRiskClass === 'minor' && minutes > 45);
  push('Major surgery > 45 min', 2, isMajor && minutes > 45);

  push('Bed rest > 72h', 2, i.expectedBedrestOver72h);

  push('Personal VTE history', 3, i.vteHistory);
  push('Family thrombophilia', 3, i.familyThrombophilia);
  push('Stroke within 30 days', 5, i.strokeWithin30Days);
  push('Hip / leg fracture', 5, i.hipOrLegFracture);
  push('Spinal cord injury', 5, i.spinalCordInjury);

  push('Active cancer', 2, i.activeCancer);

  const score = b.filter((r) => r.met).reduce((sum, r) => sum + r.points, 0);

  return { score, category: categorize(score), breakdown: b };
}
