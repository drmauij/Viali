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

export interface EligibilityResult {
  decision: EligibilityDecision;
  reasons: string[];
  hardExclusions: string[];
  yellowFactors: string[];
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
