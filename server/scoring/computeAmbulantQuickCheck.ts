// Centralizes how the server reads quick-check inputs from a surgery payload
// plus the patient/preop state, then returns the deterministic result snapshot
// to persist alongside the row. The same shape is stored in
// surgeries.ambulant_quick_check (jsonb) for legal reproducibility.

import { calculateQuick } from "@shared/scoring/ambulantEligibility";
import type {
  EligibilityResult,
  QuickCheckInputs,
  SurgeryRiskClass,
} from "@shared/scoring/types";

export interface QuickCheckInputBundle {
  ageYears: number | null;
  bmi: number | null;
  sex: "male" | "female" | null;
  plannedMinutes: number | null;
  surgeryRiskClass: SurgeryRiskClass | null;
  stayType: "ambulant" | "overnight" | null;
  knownOsasUntreated: boolean;
  vteHistory: boolean;
  activeCancer: boolean;
}

export interface QuickCheckSnapshot {
  decision: EligibilityResult["decision"];
  reasons: string[];
  hardExclusions: string[];
  yellowFactors: string[];
  inputs: QuickCheckInputBundle;
  calculatedAt: string;
  calculatedBy: string;
}

export function computeQuickCheckSnapshot(
  inputs: QuickCheckInputBundle,
  userId: string,
): QuickCheckSnapshot {
  const result = calculateQuick(inputs as QuickCheckInputs);
  return {
    decision: result.decision,
    reasons: result.reasons,
    hardExclusions: result.hardExclusions,
    yellowFactors: result.yellowFactors,
    inputs,
    calculatedAt: new Date().toISOString(),
    calculatedBy: userId,
  };
}

export function deriveQuickCheckInputsFromBody(
  body: any,
  patient: any | null,
  surgery: any | null,
): QuickCheckInputBundle {
  const plannedDate = body.plannedDate ?? surgery?.plannedDate ?? null;
  const endTime = body.actualEndTime ?? surgery?.actualEndTime ?? null;
  const plannedMinutes =
    plannedDate && endTime
      ? Math.round(
          (new Date(endTime).getTime() - new Date(plannedDate).getTime()) /
            60000,
        )
      : null;

  const ageYears = patient?.birthday
    ? Math.floor(
        (Date.now() - new Date(patient.birthday).getTime()) /
          (365.25 * 24 * 3600 * 1000),
      )
    : null;

  // Patient row has weight but no height; height comes from preop_assessment.
  // At booking time we don't have height — BMI is null and the badge degrades
  // gracefully (gates that need BMI just won't fire).
  const w = patient?.weight ? Number(patient.weight) : null;
  const bmi: number | null = null;
  void w; // BMI requires height; left intentionally undefined at booking time.

  const rawSex = (patient?.sex ?? "").toString().toUpperCase();
  const sex: "male" | "female" | null = rawSex === "M"
    ? "male"
    : rawSex === "F"
      ? "female"
      : null;

  return {
    ageYears,
    bmi,
    sex,
    plannedMinutes,
    surgeryRiskClass: (body.surgeryRiskClass ?? surgery?.surgeryRiskClass ?? null) as SurgeryRiskClass | null,
    stayType: (body.stayType ?? surgery?.stayType ?? null) as "ambulant" | "overnight" | null,
    knownOsasUntreated: Boolean(body.knownOsasUntreated),
    vteHistory: Boolean(body.vteHistory),
    activeCancer: Boolean(body.activeCancer),
  };
}
