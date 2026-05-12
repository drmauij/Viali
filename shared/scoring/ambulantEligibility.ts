import { AMBULANT_THRESHOLDS as T } from './thresholds';
import type {
  QuickCheckInputs,
  FullAssessmentInputs,
  EligibilityResult,
  EligibilityReason,
  CapriniResult,
  StopBangResult,
  RcriResult,
  ApfelResult,
} from './types';

function decide(hard: EligibilityReason[], yellow: EligibilityReason[]): EligibilityResult['decision'] {
  if (hard.length > 0) return 'red';
  if (yellow.length > 0) return 'yellow';
  return 'green';
}

// German-locale renderer kept here so reasons[] stays populated for audit trail.
function renderDe(r: EligibilityReason): string {
  const p = r.params;
  switch (r.code) {
    case 'durationExceedsLimit':
      return `Geplante OP-Dauer ${p.hours}h überschreitet Limit ${p.limit}h`;
    case 'bmiHardLimit':
      return `BMI ${p.bmi} ≥ ${p.limit}`;
    case 'bmiWithCritical':
      return `BMI ${p.bmi} mit kritischem Eingriffstyp`;
    case 'ageWithComorbidities':
      return `Alter > ${p.age} mit relevanten Komorbiditäten`;
    case 'knownOsasUntreated':
      return 'Bekannte OSAS ohne CPAP';
    case 'bmiWithDuration':
      return `BMI ${p.bmi} kombiniert mit OP-Dauer > 3h`;
    case 'ageWithLargeWound':
      return `Alter ≥ ${p.age} mit grosser Wundfläche`;
    case 'procedureType':
      return `Eingriffstyp: ${p.class}`;
    case 'vteHistory':
      return 'VTE-Anamnese — Caprini-Bewertung empfohlen';
    case 'capriniRed':
      return `Caprini ${p.score} (≥ ${p.threshold})`;
    case 'capriniYellow':
      return `Caprini ${p.score}`;
    case 'stopBangRed':
      return `STOP-BANG ${p.score} (≥ ${p.threshold})`;
    case 'stopBangYellow':
      return `STOP-BANG ${p.score}`;
    case 'rcriRed':
      return `RCRI ${p.score} (≥ ${p.threshold})`;
    case 'rcriYellow':
      return `RCRI ${p.score}`;
    case 'bloodLossRed':
      return `Geschätzter Blutverlust > ${p.ml} ml`;
    case 'noCaregiver':
      return 'Keine 24h-Betreuung verfügbar';
    case 'distanceTooFar':
      return `Anfahrt > ${p.minutes} Min zur Klinik`;
    case 'cannotUnderstandDischarge':
      return 'Patient kann Entlassungsanweisungen nicht verstehen';
  }
}

function build(hard: EligibilityReason[], yellow: EligibilityReason[]): EligibilityResult {
  return {
    decision: decide(hard, yellow),
    reasons: [...hard, ...yellow].map(renderDe),
    hardExclusions: hard.map(renderDe),
    yellowFactors: yellow.map(renderDe),
    reasonCodes: [...hard, ...yellow],
    hardExclusionCodes: hard,
    yellowFactorCodes: yellow,
  };
}

export function calculateQuick(i: QuickCheckInputs): EligibilityResult {
  // Ambulant eligibility is by definition irrelevant for overnight stays —
  // the bed + staffing is already there. Short-circuit to green with no
  // reasons so the badge stays informational/green for any overnight booking.
  if (i.stayType === 'overnight') return build([], []);

  const hard: EligibilityReason[] = [];
  const yellow: EligibilityReason[] = [];
  const isAmbulantContext = true; // retained for readability inside guards below

  if (isAmbulantContext && i.plannedMinutes !== null && i.plannedMinutes > T.MAX_OP_MINUTES) {
    hard.push({
      code: 'durationExceedsLimit',
      params: { hours: (i.plannedMinutes / 60).toFixed(1), limit: T.MAX_OP_MINUTES / 60 },
    });
  }

  if (isAmbulantContext && i.bmi !== null && i.bmi >= T.BMI_HARD_LIMIT) {
    hard.push({ code: 'bmiHardLimit', params: { bmi: i.bmi.toFixed(1), limit: T.BMI_HARD_LIMIT } });
  }

  if (
    isAmbulantContext &&
    i.bmi !== null &&
    i.bmi >= T.YELLOW_BMI_WITH_DURATION.bmi &&
    i.surgeryRiskClass &&
    (T.CRITICAL_SURGERY_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    hard.push({ code: 'bmiWithCritical', params: { bmi: i.bmi.toFixed(1) } });
  }

  if (
    isAmbulantContext &&
    i.ageYears !== null &&
    i.ageYears > T.AGE_HARD_LIMIT_WITH_COMORBIDITIES &&
    (i.activeCancer || i.vteHistory)
  ) {
    hard.push({ code: 'ageWithComorbidities', params: { age: T.AGE_HARD_LIMIT_WITH_COMORBIDITIES } });
  }

  if (isAmbulantContext && i.knownOsasUntreated) {
    hard.push({ code: 'knownOsasUntreated', params: {} });
  }

  if (
    hard.length === 0 &&
    i.bmi !== null &&
    i.bmi >= T.YELLOW_BMI_WITH_DURATION.bmi &&
    i.plannedMinutes !== null &&
    i.plannedMinutes > T.YELLOW_BMI_WITH_DURATION.minutes
  ) {
    yellow.push({ code: 'bmiWithDuration', params: { bmi: i.bmi.toFixed(1) } });
  }

  if (
    i.ageYears !== null &&
    i.ageYears >= T.AGE_YELLOW_WITH_LARGE_WOUND &&
    i.surgeryRiskClass &&
    (T.LARGE_OR_CRITICAL_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    yellow.push({ code: 'ageWithLargeWound', params: { age: T.AGE_YELLOW_WITH_LARGE_WOUND } });
  }

  if (
    hard.length === 0 &&
    i.surgeryRiskClass &&
    (T.LARGE_OR_CRITICAL_CLASSES as readonly string[]).includes(i.surgeryRiskClass)
  ) {
    yellow.push({ code: 'procedureType', params: { class: i.surgeryRiskClass } });
  }

  if (i.vteHistory) yellow.push({ code: 'vteHistory', params: {} });

  return build(hard, yellow);
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
  // Same short-circuit as calculateQuick — overnight stays don't need the
  // ambulant-eligibility gate, even with elevated Caprini/RCRI/etc scores.
  if (i.stayType === 'overnight') return build([], []);

  const quick = calculateQuick(i);
  const hard: EligibilityReason[] = [...quick.hardExclusionCodes];
  const yellow: EligibilityReason[] = [...quick.yellowFactorCodes];

  if (scores.caprini.score >= T.CAPRINI_RED) {
    hard.push({ code: 'capriniRed', params: { score: scores.caprini.score, threshold: T.CAPRINI_RED } });
  } else if (scores.caprini.score >= T.CAPRINI_YELLOW) {
    yellow.push({ code: 'capriniYellow', params: { score: scores.caprini.score } });
  }

  if (scores.stopBang.score >= T.STOPBANG_RED) {
    hard.push({ code: 'stopBangRed', params: { score: scores.stopBang.score, threshold: T.STOPBANG_RED } });
  } else if (scores.stopBang.score >= T.STOPBANG_YELLOW) {
    yellow.push({ code: 'stopBangYellow', params: { score: scores.stopBang.score } });
  }

  if (scores.rcri.score >= T.RCRI_RED) {
    hard.push({ code: 'rcriRed', params: { score: scores.rcri.score, threshold: T.RCRI_RED } });
  } else if (scores.rcri.score >= T.RCRI_YELLOW) {
    yellow.push({ code: 'rcriYellow', params: { score: scores.rcri.score } });
  }

  if (i.expectedBloodLossMl !== null && i.expectedBloodLossMl > T.EXPECTED_BLOOD_LOSS_RED_ML) {
    hard.push({ code: 'bloodLossRed', params: { ml: T.EXPECTED_BLOOD_LOSS_RED_ML } });
  }

  if (!i.hasCaregiver24h) hard.push({ code: 'noCaregiver', params: {} });
  if (
    i.distanceToClinicMinutes !== null &&
    i.distanceToClinicMinutes > T.MAX_DISTANCE_TO_CLINIC_MINUTES
  ) {
    hard.push({ code: 'distanceTooFar', params: { minutes: T.MAX_DISTANCE_TO_CLINIC_MINUTES } });
  }
  if (!i.patientCanUnderstandDischarge) {
    hard.push({ code: 'cannotUnderstandDischarge', params: {} });
  }

  return build(hard, yellow);
}
