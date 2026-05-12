// Scoring concepts — fixed clinical taxonomy used by Caprini / STOP-BANG / RCRI / Apfel.
//
// Each illness item in a clinic's customizable illness lists (jsonb) can carry an
// optional `scoringConcept` tag linking it to one of these concepts. Scoring code
// reads items by concept, never by id/label, so clinics can rename/translate items
// without breaking the calculators.

export const SCORING_CONCEPTS = [
  // Cardiovascular
  "HYPERTENSION",
  "CAD",
  "CHF",
  // Cerebrovascular / neuro
  "STROKE_HISTORY",
  "RECENT_STROKE_30D",
  "SPINAL_CORD_INJURY",
  // Metabolic / endocrine
  "INSULIN_DIABETES",
  // Renal
  "CKD_OR_DIALYSIS",
  // Oncology
  "ACTIVE_CANCER",
  // Coagulation
  "VTE_HISTORY",
  "FAMILY_THROMBOPHILIA",
  // Caprini risk modifiers
  "LEG_SWELLING",
  "VARICOSE_VEINS",
  "PREGNANCY_OR_POSTPARTUM",
  "OC_OR_HRT",
  // Pulmonary
  "COPD",
  "KNOWN_UNTREATED_OSAS",
  // PONV
  "PONV_HISTORY",
] as const;

export type ScoringConcept = (typeof SCORING_CONCEPTS)[number];

export const SCORING_CONCEPT_SET: ReadonlySet<string> = new Set(SCORING_CONCEPTS);

export function isScoringConcept(value: unknown): value is ScoringConcept {
  return typeof value === "string" && SCORING_CONCEPT_SET.has(value);
}

// Human-readable label fallback (English). Translations live in the i18n bundle
// under `ambulantEligibility.concepts.*` — these are the dev/log labels only.
export const SCORING_CONCEPT_LABELS: Record<ScoringConcept, string> = {
  HYPERTENSION: "Hypertension",
  CAD: "Coronary Artery Disease",
  CHF: "Congestive Heart Failure",
  STROKE_HISTORY: "Stroke (history)",
  RECENT_STROKE_30D: "Recent stroke (≤30 days)",
  SPINAL_CORD_INJURY: "Spinal cord injury",
  INSULIN_DIABETES: "Insulin-dependent diabetes",
  CKD_OR_DIALYSIS: "Chronic kidney disease / dialysis",
  ACTIVE_CANCER: "Active cancer",
  VTE_HISTORY: "Venous thromboembolism (history)",
  FAMILY_THROMBOPHILIA: "Family thrombophilia",
  LEG_SWELLING: "Leg swelling",
  VARICOSE_VEINS: "Varicose veins",
  PREGNANCY_OR_POSTPARTUM: "Pregnancy or postpartum",
  OC_OR_HRT: "Oral contraceptives / HRT",
  COPD: "COPD",
  KNOWN_UNTREATED_OSAS: "Known untreated OSAS",
  PONV_HISTORY: "PONV history",
};
