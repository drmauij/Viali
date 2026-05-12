// Hardcoded SGAR/SAMBA/DGAI defaults for v1. Per-hospital overrides are a
// future story — every consumer reads through this constant, so the swap is
// localized.

export const AMBULANT_THRESHOLDS = {
  MAX_OP_MINUTES: 240,
  YELLOW_BMI_WITH_DURATION: { bmi: 30, minutes: 180 },

  BMI_HARD_LIMIT: 35,

  AGE_HARD_LIMIT_WITH_COMORBIDITIES: 70,
  AGE_YELLOW_WITH_LARGE_WOUND: 60,

  CAPRINI_RED: 5,
  CAPRINI_YELLOW: 3,
  STOPBANG_RED: 5,
  STOPBANG_YELLOW: 3,
  RCRI_RED: 2,
  RCRI_YELLOW: 1,

  EXPECTED_BLOOD_LOSS_RED_ML: 500,
  MAX_DISTANCE_TO_CLINIC_MINUTES: 60,
  OVERRIDE_REASON_MIN_CHARS: 30,

  CRITICAL_SURGERY_CLASSES: ['critical'] as const,
  LARGE_OR_CRITICAL_CLASSES: ['large', 'critical'] as const,
} as const;
