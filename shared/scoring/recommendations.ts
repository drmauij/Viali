import type { CapriniResult, ApfelResult, StopBangResult, EligibilityResult } from './types';

/** Stable codes for every recommendation the helper can emit. UI looks these
 *  up via i18n; legacy `vteProphylaxis`/`ponvProphylaxis`/`monitoring` strings
 *  remain populated (in English now) for any persisted-snapshot consumers. */
export type RecommendationCode =
  // VTE prophylaxis (Caprini-driven)
  | 'vteExtended'
  | 'vtePerioperative'
  | 'vteMechanicalLmwh'
  | 'vteMechanical'
  // PONV prophylaxis (Apfel-driven)
  | 'ponvTriple'
  | 'ponvDual'
  | 'ponvSingle'
  | 'ponvNone'
  // Monitoring (decision-driven)
  | 'monitoringRed'
  | 'monitoringYellow'
  | 'monitoringGreen';

const ENGLISH_LABELS: Record<RecommendationCode, string> = {
  vteExtended: 'LMWH extended 7–30 days',
  vtePerioperative: 'LMWH perioperative',
  vteMechanicalLmwh: 'Mechanical prophylaxis + LMWH until mobilization',
  vteMechanical: 'Mechanical prophylaxis',
  ponvTriple: 'Dexamethasone + Ondansetron + TIVA',
  ponvDual: 'Dexamethasone + Ondansetron',
  ponvSingle: 'Dexamethasone',
  ponvNone: 'No prophylaxis required',
  monitoringRed: 'Extended; consider overnight stay or postop transfer to an external clinic',
  monitoringYellow: 'Standard + extended PACU monitoring',
  monitoringGreen: 'Standard',
};

export interface Recommendations {
  /** Legacy English string — kept for any consumer that displays this raw
   *  (e.g. PDF/audit snapshot). UI prefers `*Code` and i18n. */
  vteProphylaxis: string;
  ponvProphylaxis: string;
  monitoring: string;
  vteProphylaxisCode: RecommendationCode;
  ponvProphylaxisCode: RecommendationCode;
  monitoringCode: RecommendationCode;
  transferRequired: boolean;
}

export function deriveRecommendations(
  caprini: CapriniResult,
  apfel: ApfelResult,
  _stopBang: StopBangResult,
  eligibility: EligibilityResult
): Recommendations {
  const vteCode: RecommendationCode =
    caprini.score >= 5 ? 'vteExtended'
    : caprini.score >= 3 ? 'vtePerioperative'
    : caprini.score >= 2 ? 'vteMechanicalLmwh'
    : 'vteMechanical';

  const ponvCode: RecommendationCode =
    apfel.score >= 3 ? 'ponvTriple'
    : apfel.score >= 2 ? 'ponvDual'
    : apfel.score >= 1 ? 'ponvSingle'
    : 'ponvNone';

  const monitoringCode: RecommendationCode =
    eligibility.decision === 'red' ? 'monitoringRed'
    : eligibility.decision === 'yellow' ? 'monitoringYellow'
    : 'monitoringGreen';

  return {
    vteProphylaxis: ENGLISH_LABELS[vteCode],
    ponvProphylaxis: ENGLISH_LABELS[ponvCode],
    monitoring: ENGLISH_LABELS[monitoringCode],
    vteProphylaxisCode: vteCode,
    ponvProphylaxisCode: ponvCode,
    monitoringCode,
    transferRequired: eligibility.decision === 'red',
  };
}
