import {
  calculatePerioperativeRisk,
  type PerioperativeRiskInputs,
  type PerioperativeRiskResult,
  type SurgeryRiskClass,
} from "@shared/scoring/perioperativeRisk";
import type { ScoringConcept } from "@shared/scoring/concepts";
import { findConcept } from "@shared/scoring/findConcept";
import { projectQuestionnaireConditionsToOrganMaps } from "./projectQuestionnaireConditionsToOrganMaps";

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

function bmiFromQuestionnaire(questionnaire: AnyRec | null | undefined): number | null {
  if (!questionnaire) return null;
  const wRaw = questionnaire.weight;
  const hRaw = questionnaire.height;
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
  inputSource: "assessment" | "questionnaire" | "default";
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

  // Assessment organ-system maps (existing).
  const a = {
    cardiovascular: (assessment?.heartIllnesses ?? {}) as Record<string, boolean>,
    pulmonary:      (assessment?.lungIllnesses ?? {}) as Record<string, boolean>,
    coagulation:    (assessment?.coagulationIllnesses ?? {}) as Record<string, boolean>,
    neurological:   (assessment?.neuroIllnesses ?? {}) as Record<string, boolean>,
    metabolic:      (assessment?.metabolicIllnesses ?? {}) as Record<string, boolean>,
    infectious:     (assessment?.infectiousIllnesses ?? {}) as Record<string, boolean>,
    woman:          (assessment?.womanIssues ?? {}) as Record<string, boolean>,
    ponvTransfusion: (assessment?.ponvTransfusionIssues ?? {}) as Record<string, boolean>,
  };

  // NEW: questionnaire conditions → per-organ shape.
  const q = projectQuestionnaireConditionsToOrganMaps(
    questionnaire?.conditions as Record<string, { checked?: boolean }> | undefined,
    lists as Record<string, Array<{ id: string }>>,
  );

  // Per-key fall-through: assessment overrides, questionnaire fills gaps.
  function merged(category: keyof typeof a): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    const fromQ = q[category] ?? {};
    for (const [k, v] of Object.entries(fromQ)) result[k] = v;
    for (const [k, v] of Object.entries(a[category])) result[k] = v; // assessment overrides
    return result;
  }

  const heart   = merged("cardiovascular");
  const lung    = merged("pulmonary");
  const coagD   = merged("coagulation");
  const neuroD  = merged("neurological");
  const metabD  = merged("metabolic");
  const infectD = merged("infectious");
  const womanD  = merged("woman");
  const ponvD   = merged("ponvTransfusion");

  // inputSource resolution.
  //
  // Rendering the preop / questionnaire form pre-populates every organ-system
  // checkbox as `{itemId: false}`, so "form opened once" looks identical to
  // "anesthesiologist filled out the assessment". The presence of keys alone
  // isn't a real signal — only positive values are. We also accept
  // information-bearing lifestyle scalars from the questionnaire (current /
  // former smoker is a positive signal; "never" is the default and is not).
  //
  // BUT a healthy ASA-I patient with zero positive comorbidities is still a
  // *completed* assessment — the clinician reviewed and confirmed there's
  // nothing to flag. We use the form-completion markers as definitive
  // "filled" signals on top of positive-condition checks, so that healthy
  // patients render with a real grade rather than gray NOT DEFINED.
  const hasPositive = (m: Record<string, boolean>): boolean =>
    Object.values(m).some((v) => v === true);

  // Assessment is "filled" when the doctor has reached any conclusion on it:
  //   - finalised (status='completed')
  //   - made a surgical-approval decision ('approved' | 'not-approved')
  //   - put it on stand-by (waiting for signature / consent / exams / other)
  // OR when they recorded objective findings (ASA, weight, height, planned
  // anesthesia technique) OR any positive illness checkbox.
  // The conclusion markers are the strongest signal: a healthy patient
  // legitimately has zero positive boxes but the doctor still signed off,
  // and that "no illnesses confirmed" is exactly what we want to count.
  const assessmentConcluded =
    assessment?.status === "completed" ||
    !!assessment?.surgicalApproval ||
    assessment?.standBy === true;
  const assessmentHasObjectiveData =
    !!assessment?.asa ||
    (!!assessment?.weight && Number(assessment.weight) > 0) ||
    (!!assessment?.height && Number(assessment.height) > 0) ||
    !!assessment?.anesthesiaTechniques;
  const anyAssessmentData =
    assessmentConcluded ||
    assessmentHasObjectiveData ||
    Object.values(a).some(hasPositive);

  // Questionnaire is "filled" when EITHER the patient submitted it
  // (submittedAt set) OR they reported any information-bearing scalar.
  const questionnaireSubmitted = !!questionnaire?.submittedAt;
  const anyQuestionnaireData =
    !!questionnaire &&
    (questionnaireSubmitted ||
      Object.values(q).some(hasPositive) ||
      questionnaire.smokingStatus === "current" ||
      questionnaire.smokingStatus === "former" ||
      questionnaire.functionallyDependent === true ||
      questionnaire.metAbove4 === false);

  const inputSource: "assessment" | "questionnaire" | "default" = anyAssessmentData
    ? "assessment"
    : anyQuestionnaireData
      ? "questionnaire"
      : "default";

  const find = (
    data: Record<string, boolean>,
    list: ItemList,
    concept: ScoringConcept,
  ): boolean => findConcept(data, list, concept);

  const inputs: PerioperativeRiskInputs = {
    age: ageFromPatient(patient),
    sex: sexFromPatient(patient),
    bmi: bmiFromAssessment(assessment) ?? bmiFromQuestionnaire(questionnaire),
    surgeryRiskClass: (surgery.surgeryRiskClass ?? "minor") as SurgeryRiskClass,
    plannedDurationMinutes: plannedMinutesFromSurgery(surgery),
    isCurrentSmoker: isCurrentSmokerFromSources(assessment, questionnaire),
    functionallyDependent: typeof assessment?.functionallyDependent === "boolean"
      ? assessment.functionallyDependent
      : typeof questionnaire?.functionallyDependent === "boolean"
        ? questionnaire.functionallyDependent
        : null,
    metAbove4: typeof assessment?.metAbove4 === "boolean"
      ? assessment.metAbove4
      : typeof questionnaire?.metAbove4 === "boolean"
        ? questionnaire.metAbove4
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

  return { inputs, partial: inputSource !== "assessment", inputSource };
}

export function computeRiskSnapshot(
  patient: AnyRec | null | undefined,
  surgery: AnyRec,
  assessment: AnyRec | null | undefined,
  questionnaire: AnyRec | null | undefined,
  illnessLists: IllnessLists | null | undefined,
): PerioperativeRiskResult {
  const { inputs, partial, inputSource } = deriveRiskInputsFromRecords(
    patient,
    surgery,
    assessment,
    questionnaire,
    illnessLists,
  );
  const result = calculatePerioperativeRisk(inputs);
  return { ...result, partial, inputSource };
}

export async function recomputeRiskForSurgery(surgeryId: string): Promise<void> {
  const { db } = await import("../db");
  const { surgeries } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const { storage } = await import("../storage");
  const { getHospitalAnesthesiaSettings } = await import("../storage/anesthesia");
  const logger = (await import("../logger")).default;

  try {
    const [surgery] = await db.select().from(surgeries).where(eq(surgeries.id, surgeryId)).limit(1);
    if (!surgery) return;
    if (!surgery.surgeryRiskClass || !surgery.patientId) return;
    const patient = await storage.getPatient(surgery.patientId);
    if (!patient) return;
    const settings = await getHospitalAnesthesiaSettings(surgery.hospitalId);
    const illnessLists = (settings?.illnessLists ?? {}) as IllnessLists;
    // Both anesthesia (`preop_assessments`) and surgery (`surgery_preop_assessments`) forms
    // share the same surgeryId; anesthesia is the comprehensive form. Merge so risk
    // inputs prefer the more complete row when both exist.
    const surgeryAssessment = await storage.getSurgeryPreOpAssessment(surgeryId).catch(() => null);
    const anesthesiaAssessment = await storage.getPreOpAssessment(surgeryId).catch(() => null);
    const assessment = anesthesiaAssessment || surgeryAssessment
      ? { ...(surgeryAssessment ?? {}), ...(anesthesiaAssessment ?? {}) }
      : null;
    const questionnaire = await storage.getLatestQuestionnaireResponseForPatient(surgery.patientId).catch(() => null);
    const snapshot = computeRiskSnapshot(patient, surgery, assessment ?? null, questionnaire ?? null, illnessLists);
    await db
      .update(surgeries)
      .set({ riskGrade: snapshot.grade, perioperativeRisk: snapshot as any })
      .where(eq(surgeries.id, surgeryId));
  } catch (err) {
    logger.error(`recomputeRiskForSurgery(${surgeryId}) failed:`, err);
  }
}

export async function recomputeRiskForPatientFutureSurgeries(patientId: string): Promise<void> {
  const { db } = await import("../db");
  const { surgeries } = await import("@shared/schema");
  const { and, eq, gte, ne } = await import("drizzle-orm");
  const logger = (await import("../logger")).default;

  try {
    const rows = await db
      .select()
      .from(surgeries)
      .where(and(
        eq(surgeries.patientId, patientId),
        gte(surgeries.plannedDate, new Date()),
        ne(surgeries.status, "cancelled"),
      ));
    for (const surgery of rows) {
      await recomputeRiskForSurgery(surgery.id);
    }
  } catch (err) {
    logger.error(`recomputeRiskForPatientFutureSurgeries(${patientId}) failed:`, err);
  }
}
