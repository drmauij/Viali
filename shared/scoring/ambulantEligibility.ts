import { AMBULANT_THRESHOLDS as T } from './thresholds';
import type {
  QuickCheckInputs,
  FullAssessmentInputs,
  EligibilityResult,
  CapriniResult,
  StopBangResult,
  RcriResult,
  ApfelResult,
} from './types';

function decide(hard: string[], yellow: string[]): EligibilityResult['decision'] {
  if (hard.length > 0) return 'red';
  if (yellow.length > 0) return 'yellow';
  return 'green';
}

export function calculateQuick(i: QuickCheckInputs): EligibilityResult {
  const hard: string[] = [];
  const yellow: string[] = [];

  if (i.plannedMinutes !== null && i.plannedMinutes > T.MAX_OP_MINUTES) {
    const hrs = (i.plannedMinutes / 60).toFixed(1);
    hard.push(`Geplante OP-Dauer ${hrs}h überschreitet Limit ${T.MAX_OP_MINUTES / 60}h`);
  }

  if (i.bmi !== null && i.bmi >= T.BMI_HARD_LIMIT) {
    hard.push(`BMI ${i.bmi.toFixed(1)} ≥ ${T.BMI_HARD_LIMIT}`);
  }

  if (
    i.bmi !== null &&
    i.bmi >= T.YELLOW_BMI_WITH_DURATION.bmi &&
    i.surgeryRiskClass &&
    (T.CRITICAL_SURGERY_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    hard.push(`BMI ${i.bmi.toFixed(1)} mit kritischem Eingriffstyp`);
  }

  if (i.ageYears !== null && i.ageYears > T.AGE_HARD_LIMIT_WITH_COMORBIDITIES) {
    if (i.activeCancer || i.vteHistory) {
      hard.push(`Alter > ${T.AGE_HARD_LIMIT_WITH_COMORBIDITIES} mit relevanten Komorbiditäten`);
    }
  }

  if (i.knownOsasUntreated) {
    hard.push('Bekannte OSAS ohne CPAP');
  }

  if (
    hard.length === 0 &&
    i.bmi !== null &&
    i.bmi >= T.YELLOW_BMI_WITH_DURATION.bmi &&
    i.plannedMinutes !== null &&
    i.plannedMinutes > T.YELLOW_BMI_WITH_DURATION.minutes
  ) {
    yellow.push(`BMI ${i.bmi.toFixed(1)} kombiniert mit OP-Dauer > 3h`);
  }

  if (
    i.ageYears !== null &&
    i.ageYears >= T.AGE_YELLOW_WITH_LARGE_WOUND &&
    i.surgeryRiskClass &&
    (T.LARGE_OR_CRITICAL_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    yellow.push(`Alter ≥ ${T.AGE_YELLOW_WITH_LARGE_WOUND} mit grosser Wundfläche`);
  }

  if (
    hard.length === 0 &&
    i.surgeryRiskClass &&
    (T.LARGE_OR_CRITICAL_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    yellow.push(`Eingriffstyp: ${i.surgeryRiskClass}`);
  }

  if (i.vteHistory) yellow.push('VTE-Anamnese — Caprini-Bewertung empfohlen');

  const decision = decide(hard, yellow);
  return {
    decision,
    reasons: [...hard, ...yellow],
    hardExclusions: hard,
    yellowFactors: yellow,
  };
}

export function calculateFull(
  i: FullAssessmentInputs,
  scores: {
    caprini: CapriniResult;
    stopBang: StopBangResult;
    rcri: RcriResult;
    apfel: ApfelResult;
  }
): EligibilityResult {
  const quick = calculateQuick(i);
  const hard = [...quick.hardExclusions];
  const yellow = [...quick.yellowFactors];

  if (scores.caprini.score >= T.CAPRINI_RED) {
    hard.push(`Caprini ${scores.caprini.score} (≥ ${T.CAPRINI_RED})`);
  } else if (scores.caprini.score >= T.CAPRINI_YELLOW) {
    yellow.push(`Caprini ${scores.caprini.score}`);
  }

  if (scores.stopBang.score >= T.STOPBANG_RED) {
    hard.push(`STOP-BANG ${scores.stopBang.score} (≥ ${T.STOPBANG_RED})`);
  } else if (scores.stopBang.score >= T.STOPBANG_YELLOW) {
    yellow.push(`STOP-BANG ${scores.stopBang.score}`);
  }

  if (scores.rcri.score >= T.RCRI_RED) {
    hard.push(`RCRI ${scores.rcri.score} (≥ ${T.RCRI_RED})`);
  } else if (scores.rcri.score >= T.RCRI_YELLOW) {
    yellow.push(`RCRI ${scores.rcri.score}`);
  }

  if (
    i.expectedBloodLossMl !== null &&
    i.expectedBloodLossMl > T.EXPECTED_BLOOD_LOSS_RED_ML
  ) {
    hard.push(`Geschätzter Blutverlust > ${T.EXPECTED_BLOOD_LOSS_RED_ML} ml`);
  }

  if (!i.hasCaregiver24h) hard.push('Keine 24h-Betreuung verfügbar');
  if (
    i.distanceToClinicMinutes !== null &&
    i.distanceToClinicMinutes > T.MAX_DISTANCE_TO_CLINIC_MINUTES
  ) {
    hard.push(`Anfahrt > ${T.MAX_DISTANCE_TO_CLINIC_MINUTES} Min zur Klinik`);
  }
  if (!i.patientCanUnderstandDischarge) {
    hard.push('Patient kann Entlassungsanweisungen nicht verstehen');
  }

  const decision = decide(hard, yellow);
  return {
    decision,
    reasons: [...hard, ...yellow],
    hardExclusions: hard,
    yellowFactors: yellow,
  };
}
