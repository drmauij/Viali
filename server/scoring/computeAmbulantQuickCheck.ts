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

  const ageYears = patient?.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 3600 * 1000),
      )
    : null;

  const w = patient?.weight ? Number(patient.weight) : null;
  const h = patient?.height ? Number(patient.height) : null;
  let bmi: number | null = null;
  if (w && h) {
    const meters = h > 3 ? h / 100 : h;
    bmi = w / (meters * meters);
  }

  const rawSex = (patient?.sex ?? patient?.gender ?? "").toString().toLowerCase();
  const sex: "male" | "female" | null = rawSex.startsWith("m")
    ? "male"
    : rawSex.startsWith("f") || rawSex.startsWith("w")
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
