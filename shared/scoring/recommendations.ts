import type { CapriniResult, ApfelResult, StopBangResult, EligibilityResult } from './types';

export interface Recommendations {
  vteProphylaxis: string;
  ponvProphylaxis: string;
  monitoring: string;
  transferRequired: boolean;
}

export function deriveRecommendations(
  caprini: CapriniResult,
  apfel: ApfelResult,
  stopBang: StopBangResult,
  eligibility: EligibilityResult
): Recommendations {
  const vteProphylaxis =
    caprini.score >= 5 ? 'LMWH extended 7–30 Tage'
    : caprini.score >= 3 ? 'LMWH perioperativ'
    : caprini.score >= 2 ? 'Mechanische Prophylaxe + LMWH bis Mobilisation'
    : 'Mechanische Prophylaxe';

  const ponvProphylaxis =
    apfel.score >= 3 ? 'Dexamethason + Ondansetron + TIVA'
    : apfel.score >= 2 ? 'Dexamethason + Ondansetron'
    : apfel.score >= 1 ? 'Dexamethason'
    : 'Keine Prophylaxe erforderlich';

  const monitoring =
    eligibility.decision === 'red' ? 'Erweitert; Stephanshorn-Transfer organisieren'
    : eligibility.decision === 'yellow' ? 'Standard + verlängerte PACU-Überwachung'
    : 'Standard';

  return {
    vteProphylaxis,
    ponvProphylaxis,
    monitoring,
    transferRequired: eligibility.decision === 'red',
  };
}
