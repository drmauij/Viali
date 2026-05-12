import { describe, it, expect } from 'vitest';
import { calculateQuick, calculateFull } from '../ambulantEligibility';
import { calculateCaprini } from '../caprini';
import { calculateStopBang } from '../stopBang';
import { calculateRcri } from '../rcri';
import { calculateApfel } from '../apfel';
import type { QuickCheckInputs, FullAssessmentInputs } from '../types';

const cleanQuick: QuickCheckInputs = {
  ageYears: 40,
  bmi: 24,
  sex: 'female',
  plannedMinutes: 90,
  surgeryRiskClass: 'standard',
  stayType: 'ambulant',
  knownOsasUntreated: false,
  vteHistory: false,
  activeCancer: false,
};

describe('calculateQuick', () => {
  it('green for clean baseline', () => {
    expect(calculateQuick(cleanQuick).decision).toBe('green');
  });

  it('red when planned duration exceeds MAX_OP_MINUTES', () => {
    const r = calculateQuick({ ...cleanQuick, plannedMinutes: 260 });
    expect(r.decision).toBe('red');
    expect(r.hardExclusions.some((s) => s.includes('OP-Dauer'))).toBe(true);
  });

  it('red on BMI ≥ 35', () => {
    const r = calculateQuick({ ...cleanQuick, bmi: 36 });
    expect(r.decision).toBe('red');
  });

  it('yellow on BMI ≥30 + duration > 180 (no other red)', () => {
    const r = calculateQuick({ ...cleanQuick, bmi: 31, plannedMinutes: 200 });
    expect(r.decision).toBe('yellow');
  });

  it('red on age >70 with active cancer (proxy for comorbidities)', () => {
    const r = calculateQuick({ ...cleanQuick, ageYears: 75, activeCancer: true });
    expect(r.decision).toBe('red');
  });

  it('red on known untreated OSAS', () => {
    expect(calculateQuick({ ...cleanQuick, knownOsasUntreated: true }).decision).toBe('red');
  });

  it('red when stayType is overnight should still report red factors (informational)', () => {
    const r = calculateQuick({ ...cleanQuick, plannedMinutes: 260, stayType: 'overnight' });
    expect(r.decision).toBe('red');
  });
});

describe('PKK 4-case fixture', () => {
  it('Friday case → 🔴 with duration + BMI/critical-class reasons', () => {
    const r = calculateQuick({
      ageYears: 58,
      bmi: 32.9,
      sex: 'male',
      plannedMinutes: 300,
      surgeryRiskClass: 'critical',
      stayType: 'ambulant',
      knownOsasUntreated: false,
      vteHistory: false,
      activeCancer: false,
    });
    expect(r.decision).toBe('red');
    expect(r.hardExclusions.length).toBeGreaterThanOrEqual(1);
  });

  it('16.05. case → 🔴 on duration (260 > 240)', () => {
    const r = calculateQuick({
      ageYears: 44,
      bmi: 22,
      sex: 'female',
      plannedMinutes: 260,
      surgeryRiskClass: 'standard',
      stayType: 'ambulant',
      knownOsasUntreated: false,
      vteHistory: false,
      activeCancer: false,
    });
    expect(r.decision).toBe('red');
    expect(r.hardExclusions.some((s) => s.includes('OP-Dauer'))).toBe(true);
  });

  it('8.05. case → 🟡 at the duration boundary', () => {
    const r = calculateQuick({
      ageYears: 22,
      bmi: 24,
      sex: 'female',
      plannedMinutes: 240,
      surgeryRiskClass: 'large',
      stayType: 'ambulant',
      knownOsasUntreated: false,
      vteHistory: false,
      activeCancer: false,
    });
    expect(['yellow', 'green']).toContain(r.decision);
  });

  it('23.04. case as-planned → not red on inputs available at booking', () => {
    const r = calculateQuick({
      ageYears: 40,
      bmi: 22,
      sex: 'female',
      plannedMinutes: 240,
      surgeryRiskClass: 'large',
      stayType: 'ambulant',
      knownOsasUntreated: false,
      vteHistory: false,
      activeCancer: false,
    });
    expect(r.decision).not.toBe('red');
  });
});

const cleanFull: FullAssessmentInputs = {
  ...cleanQuick,
  hasLegSwelling: false,
  hasVaricoseVeins: false,
  isPregnantOrPostpartum: false,
  onOcOrHrt: false,
  expectedBedrestOver72h: false,
  familyThrombophilia: false,
  strokeWithin30Days: false,
  hipOrLegFracture: false,
  spinalCordInjury: false,
  snoringLoud: false,
  daytimeTiredness: false,
  observedApnea: false,
  hasHypertension: false,
  neckCircumferenceCm: 36,
  hasCAD: false,
  hasCHF: false,
  hasCerebrovascularDisease: false,
  isInsulinDependentDiabetic: false,
  creatinineMgDl: 1.0,
  isNonSmoker: true,
  hasPostopNauseaHistory: false,
  postopOpioidsPlanned: false,
  expectedBloodLossMl: 100,
  hasCaregiver24h: true,
  distanceToClinicMinutes: 20,
  patientCanUnderstandDischarge: true,
};

describe('calculateFull', () => {
  it('green for fully clean inputs', () => {
    const scores = {
      caprini: calculateCaprini(cleanFull),
      stopBang: calculateStopBang(cleanFull),
      rcri: calculateRcri(cleanFull),
      apfel: calculateApfel(cleanFull),
    };
    expect(calculateFull(cleanFull, scores).decision).toBe('green');
  });

  it('red when Caprini ≥ 5', () => {
    const inputs = { ...cleanFull, strokeWithin30Days: true };
    const scores = {
      caprini: calculateCaprini(inputs),
      stopBang: calculateStopBang(inputs),
      rcri: calculateRcri(inputs),
      apfel: calculateApfel(inputs),
    };
    expect(calculateFull(inputs, scores).decision).toBe('red');
  });

  it('red when no 24h caregiver', () => {
    const inputs = { ...cleanFull, hasCaregiver24h: false };
    const scores = {
      caprini: calculateCaprini(inputs),
      stopBang: calculateStopBang(inputs),
      rcri: calculateRcri(inputs),
      apfel: calculateApfel(inputs),
    };
    expect(calculateFull(inputs, scores).decision).toBe('red');
  });

  it('red when expected blood loss > 500 ml', () => {
    const inputs = { ...cleanFull, expectedBloodLossMl: 800 };
    const scores = {
      caprini: calculateCaprini(inputs),
      stopBang: calculateStopBang(inputs),
      rcri: calculateRcri(inputs),
      apfel: calculateApfel(inputs),
    };
    expect(calculateFull(inputs, scores).decision).toBe('red');
  });
});
