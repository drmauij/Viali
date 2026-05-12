export type SurgeryRiskClass = 'minor' | 'standard' | 'large' | 'critical';

export type RiskCategory =
  | 'low'
  | 'moderate'
  | 'higher'
  | 'high'
  | 'veryHigh'
  | 'intermediate';

export interface BreakdownEntry {
  criterion: string;
  points: number;
  met: boolean;
}

export interface ScoreResult {
  score: number;
  category: RiskCategory;
  breakdown: BreakdownEntry[];
}

export interface CapriniResult extends ScoreResult {}
export interface StopBangResult extends ScoreResult {}
export interface RcriResult extends ScoreResult {
  macePercent: number;
}
export interface ApfelResult extends ScoreResult {
  ponvPercent: number;
}

export type EligibilityDecision = 'green' | 'yellow' | 'red';

/** Stable codes for every reason the orchestrator can emit. UI looks these up
 *  via i18n; strings (`reasons` etc.) remain available in German for legal
 *  reproducibility on persisted snapshots. */
export type ReasonCode =
  | 'durationExceedsLimit'
  | 'bmiHardLimit'
  | 'bmiWithCritical'
  | 'ageWithComorbidities'
  | 'knownOsasUntreated'
  | 'bmiWithDuration'
  | 'ageWithLargeWound'
  | 'procedureType'
  | 'vteHistory'
  | 'capriniRed'
  | 'capriniYellow'
  | 'stopBangRed'
  | 'stopBangYellow'
  | 'rcriRed'
  | 'rcriYellow'
  | 'bloodLossRed'
  | 'noCaregiver'
  | 'distanceTooFar'
  | 'cannotUnderstandDischarge';

export interface EligibilityReason {
  code: ReasonCode;
  params: Record<string, string | number>;
}

export interface EligibilityResult {
  decision: EligibilityDecision;
  /** German strings, kept for audit-trail backward compatibility */
  reasons: string[];
  hardExclusions: string[];
  yellowFactors: string[];
  /** Structured for UI translation. Same order as reasons. */
  reasonCodes: EligibilityReason[];
  hardExclusionCodes: EligibilityReason[];
  yellowFactorCodes: EligibilityReason[];
}

export interface QuickCheckInputs {
  ageYears: number | null;
  bmi: number | null;
  sex: 'male' | 'female' | null;
  plannedMinutes: number | null;
  surgeryRiskClass: SurgeryRiskClass | null;
  stayType: 'ambulant' | 'overnight' | null;
  knownOsasUntreated: boolean;
  vteHistory: boolean;
  activeCancer: boolean;
}

export interface FullAssessmentInputs extends QuickCheckInputs {
  hasLegSwelling: boolean;
  hasVaricoseVeins: boolean;
  isPregnantOrPostpartum: boolean;
  onOcOrHrt: boolean;
  expectedBedrestOver72h: boolean;
  familyThrombophilia: boolean;
  strokeWithin30Days: boolean;
  hipOrLegFracture: boolean;
  spinalCordInjury: boolean;
  snoringLoud: boolean;
  daytimeTiredness: boolean;
  observedApnea: boolean;
  hasHypertension: boolean;
  neckCircumferenceCm: number | null;
  hasCAD: boolean;
  hasCHF: boolean;
  hasCerebrovascularDisease: boolean;
  isInsulinDependentDiabetic: boolean;
  creatinineMgDl: number | null;
  isNonSmoker: boolean;
  hasPostopNauseaHistory: boolean;
  postopOpioidsPlanned: boolean;
  expectedBloodLossMl: number | null;
  hasCaregiver24h: boolean;
  distanceToClinicMinutes: number | null;
  patientCanUnderstandDischarge: boolean;
}
