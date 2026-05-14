import { describe, it, expect } from "vitest";
import {
  deriveRiskInputsFromRecords,
  computeRiskSnapshot,
} from "../server/scoring/computePerioperativeRisk";

const ILLNESS_LISTS = {
  cardiovascular: [
    { id: "cad_item", scoringConcept: "CAD" },
    { id: "chf_item", scoringConcept: "CHF" },
    { id: "htn_item", scoringConcept: "HYPERTENSION" },
  ],
  pulmonary: [
    { id: "copd_item", scoringConcept: "COPD" },
    { id: "osas_item", scoringConcept: "KNOWN_UNTREATED_OSAS" },
  ],
  coagulation: [
    { id: "vte_item", scoringConcept: "VTE_HISTORY" },
    { id: "varicose_item", scoringConcept: "VARICOSE_VEINS" },
  ],
  neurological: [
    { id: "stroke_item", scoringConcept: "STROKE_HISTORY" },
    { id: "recent_stroke_item", scoringConcept: "RECENT_STROKE_30D" },
  ],
  metabolic: [
    { id: "insulin_item", scoringConcept: "INSULIN_DIABETES" },
    { id: "ckd_item", scoringConcept: "CKD_OR_DIALYSIS" },
  ],
  infectious: [{ id: "cancer_item", scoringConcept: "ACTIVE_CANCER" }],
  woman: [
    { id: "oc_item", scoringConcept: "OC_OR_HRT" },
    { id: "preg_item", scoringConcept: "PREGNANCY_OR_POSTPARTUM" },
  ],
  ponvTransfusion: [{ id: "ponv_item", scoringConcept: "PONV_HISTORY" }],
};

function fortyYearsAgoIso(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 40);
  return d.toISOString().slice(0, 10);
}

describe("deriveRiskInputsFromRecords", () => {
  it("maps a clean patient + minor surgery + no assessment to all-low inputs and partial=true", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "F" };
    const surgery = { surgeryRiskClass: "minor", plannedDate: null, actualEndTime: null };
    const { inputs, partial } = deriveRiskInputsFromRecords(patient, surgery, null, null, ILLNESS_LISTS);
    expect(inputs.isCurrentSmoker).toBe(false);
    expect(inputs.functionallyDependent).toBeNull();
    expect(inputs.concepts.COPD).toBe(false);
    expect(inputs.concepts.CAD).toBe(false);
    expect(inputs.plannedDurationMinutes).toBe(60);
    expect(inputs.surgeryRiskClass).toBe("minor");
    expect(inputs.sex).toBe("f");
    expect(partial).toBe(true);
  });

  it("treats questionnaire smokingStatus 'current' as isCurrentSmoker=true even if noxen says no", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "M" };
    const surgery = { surgeryRiskClass: "minor" };
    const assessment = { noxen: { nicotine: false, smoking: false } };
    const questionnaire = { smokingStatus: "current" };
    const { inputs } = deriveRiskInputsFromRecords(patient, surgery, assessment, questionnaire, ILLNESS_LISTS);
    expect(inputs.isCurrentSmoker).toBe(true);
  });

  it("uses noxen.nicotine when questionnaire smokingStatus is missing", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "M" };
    const surgery = { surgeryRiskClass: "minor" };
    const assessment = { noxen: { nicotine: true } };
    const { inputs } = deriveRiskInputsFromRecords(patient, surgery, assessment, null, ILLNESS_LISTS);
    expect(inputs.isCurrentSmoker).toBe(true);
  });

  it("leaves functionallyDependent null when no questionnaire row", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "F" };
    const { inputs } = deriveRiskInputsFromRecords(patient, { surgeryRiskClass: "minor" }, null, null, ILLNESS_LISTS);
    expect(inputs.functionallyDependent).toBeNull();
  });

  it("resolves concept booleans through findConcept on the configured illness lists", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "M" };
    const assessment = {
      heartIllnesses: { cad_item: true, htn_item: true },
      lungIllnesses: { copd_item: true },
      coagulationIllnesses: { vte_item: true },
    };
    const { inputs, partial } = deriveRiskInputsFromRecords(patient, { surgeryRiskClass: "standard" }, assessment, null, ILLNESS_LISTS);
    expect(inputs.concepts.CAD).toBe(true);
    expect(inputs.concepts.HYPERTENSION).toBe(true);
    expect(inputs.concepts.COPD).toBe(true);
    expect(inputs.concepts.VTE_HISTORY).toBe(true);
    expect(inputs.concepts.CHF).toBe(false);
    expect(partial).toBe(false);
  });

  it("computes plannedDurationMinutes from plannedDate to actualEndTime", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "F" };
    const surgery = {
      surgeryRiskClass: "standard",
      plannedDate: new Date("2026-06-01T08:00:00Z"),
      actualEndTime: new Date("2026-06-01T11:30:00Z"),
    };
    const { inputs } = deriveRiskInputsFromRecords(patient, surgery, null, null, ILLNESS_LISTS);
    expect(inputs.plannedDurationMinutes).toBe(210);
  });

  it("computes BMI from assessment weight + height (cm)", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "F" };
    const assessment = { weight: "70", height: "170" };
    const { inputs } = deriveRiskInputsFromRecords(patient, { surgeryRiskClass: "minor" }, assessment, null, ILLNESS_LISTS);
    expect(inputs.bmi).toBeGreaterThan(24);
    expect(inputs.bmi).toBeLessThan(25);
  });

  it("maps patient.sex 'O' to 'f' (safer default for Caprini female-specific factors)", () => {
    const { inputs } = deriveRiskInputsFromRecords({ birthday: fortyYearsAgoIso(), sex: "O" }, { surgeryRiskClass: "minor" }, null, null, ILLNESS_LISTS);
    expect(inputs.sex).toBe("f");
  });
});

describe("computeRiskSnapshot", () => {
  it("returns a snapshot with grade, worstDomain, drivers, partial=true when assessment is missing", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "F" };
    const snap = computeRiskSnapshot(patient, { surgeryRiskClass: "minor" }, null, null, ILLNESS_LISTS);
    expect(snap.grade).toBe("green");
    expect(snap.partial).toBe(true);
    expect(snap.worstDomain).toBeDefined();
    expect(Array.isArray(snap.drivers)).toBe(true);
  });

  it("escalates grade when a critical surgery is paired with CAD", () => {
    const patient = { birthday: fortyYearsAgoIso(), sex: "M" };
    const assessment = { heartIllnesses: { cad_item: true } };
    const questionnaire = { functionallyDependent: false };
    const snap = computeRiskSnapshot(patient, { surgeryRiskClass: "critical" }, assessment, questionnaire, ILLNESS_LISTS);
    expect(["orange", "red"]).toContain(snap.grade);
  });
});
