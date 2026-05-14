import {
  calculatePerioperativeRisk,
  type PerioperativeRiskInputs,
  type PerioperativeRiskResult,
  type SurgeryRiskClass,
} from "@shared/scoring/perioperativeRisk";
import type { ScoringConcept } from "@shared/scoring/concepts";
import { findConcept } from "@shared/scoring/findConcept";

type AnyRec = Record<string, any>;
type ItemList = Array<{ id: string; scoringConcept?: string | null }>;
type IllnessLists = Record<string, ItemList>;

function ageFromPatient(patient: AnyRec | null | undefined): number {
  if (!patient?.birthday) return 0;
  const dob = new Date(patient.birthday);
  if (isNaN(dob.getTime())) return 0;
  return Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function sexFromPatient(patient: AnyRec | null | undefined): "m" | "f" {
  const raw = (patient?.sex ?? "").toString().toUpperCase();
  if (raw === "M") return "m";
  return "f";
}

function bmiFromAssessment(assessment: AnyRec | null | undefined): number | null {
  if (!assessment) return null;
  const wRaw = assessment.weight;
  const hRaw = assessment.height;
  const w = wRaw ? Number(wRaw) : null;
  const h = hRaw ? Number(hRaw) : null;
  if (!w || !h) return null;
  const meters = h > 3 ? h / 100 : h;
  if (!meters) return null;
  return w / (meters * meters);
}

function plannedMinutesFromSurgery(surgery: AnyRec): number {
  const plannedDate = surgery.plannedDate ?? null;
  const endTime = surgery.actualEndTime ?? null;
  if (!plannedDate || !endTime) return 60;
  const startMs = new Date(plannedDate).getTime();
  const endMs = new Date(endTime).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 60;
  return Math.round((endMs - startMs) / 60000);
}

function isCurrentSmokerFromSources(
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
): boolean {
  if (questionnaire?.smokingStatus === "current") return true;
  if (questionnaire?.smokingStatus === "never" || questionnaire?.smokingStatus === "former") return false;
  const noxen = (assessment?.noxen ?? {}) as Record<string, unknown>;
  return noxen.nicotine === true || noxen.smoking === true;
}

export interface RiskInputBundle {
  inputs: PerioperativeRiskInputs;
  partial: boolean;
}

export function deriveRiskInputsFromRecords(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): RiskInputBundle {
  const lists = (illnessLists ?? {}) as IllnessLists;
  const cardio = lists.cardiovascular ?? [];
  const pulm = lists.pulmonary ?? [];
  const coag = lists.coagulation ?? [];
  const neuro = lists.neurological ?? [];
  const metab = lists.metabolic ?? [];
  const infect = lists.infectious ?? [];
  const woman = lists.woman ?? [];
  const ponv = lists.ponvTransfusion ?? [];

  const heart = (assessment?.heartIllnesses ?? {}) as Record<string, boolean>;
  const lung = (assessment?.lungIllnesses ?? {}) as Record<string, boolean>;
  const coagD = (assessment?.coagulationIllnesses ?? {}) as Record<string, boolean>;
  const neuroD = (assessment?.neuroIllnesses ?? {}) as Record<string, boolean>;
  const metabD = (assessment?.metabolicIllnesses ?? {}) as Record<string, boolean>;
  const infectD = (assessment?.infectiousIllnesses ?? {}) as Record<string, boolean>;
  const womanD = (assessment?.womanIssues ?? {}) as Record<string, boolean>;
  const ponvD = (assessment?.ponvTransfusionIssues ?? {}) as Record<string, boolean>;

  const find = (
    data: Record<string, boolean>,
    list: ItemList,
    concept: ScoringConcept,
  ): boolean => findConcept(data, list, concept);

  const inputs: PerioperativeRiskInputs = {
    age: ageFromPatient(patient),
    sex: sexFromPatient(patient),
    bmi: bmiFromAssessment(assessment),
    surgeryRiskClass: (surgery.surgeryRiskClass ?? "minor") as SurgeryRiskClass,
    plannedDurationMinutes: plannedMinutesFromSurgery(surgery),
    isCurrentSmoker: isCurrentSmokerFromSources(assessment, questionnaire),
    functionallyDependent: typeof questionnaire?.functionallyDependent === "boolean"
      ? questionnaire.functionallyDependent
      : null,
    concepts: {
      CAD: find(heart, cardio, "CAD"),
      CHF: find(heart, cardio, "CHF"),
      STROKE_HISTORY: find(neuroD, neuro, "STROKE_HISTORY"),
      INSULIN_DIABETES: find(metabD, metab, "INSULIN_DIABETES"),
      CKD_OR_DIALYSIS: find(metabD, metab, "CKD_OR_DIALYSIS"),
      COPD: find(lung, pulm, "COPD"),
      HYPERTENSION: find(heart, cardio, "HYPERTENSION"),
      ACTIVE_CANCER: find(infectD, infect, "ACTIVE_CANCER"),
      VTE_HISTORY: find(coagD, coag, "VTE_HISTORY"),
      VARICOSE_VEINS: find(coagD, coag, "VARICOSE_VEINS"),
      LEG_SWELLING: find(coagD, coag, "LEG_SWELLING"),
      FAMILY_THROMBOPHILIA: find(coagD, coag, "FAMILY_THROMBOPHILIA"),
      OC_OR_HRT: find(womanD, woman, "OC_OR_HRT"),
      PREGNANCY_OR_POSTPARTUM: find(womanD, woman, "PREGNANCY_OR_POSTPARTUM"),
      RECENT_STROKE_30D: find(neuroD, neuro, "RECENT_STROKE_30D"),
      SPINAL_CORD_INJURY: find(neuroD, neuro, "SPINAL_CORD_INJURY"),
      KNOWN_UNTREATED_OSAS: find(lung, pulm, "KNOWN_UNTREATED_OSAS"),
      PONV_HISTORY: find(ponvD, ponv, "PONV_HISTORY"),
    },
  };

  return { inputs, partial: !assessment };
}

export function computeRiskSnapshot(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): PerioperativeRiskResult {
  const { inputs, partial } = deriveRiskInputsFromRecords(
    patient,
    surgery,
    assessment,
    questionnaire,
    illnessLists,
  );
  const result = calculatePerioperativeRisk(inputs);
  if (partial) {
    return { ...result, partial: true };
  }
  return result;
}
