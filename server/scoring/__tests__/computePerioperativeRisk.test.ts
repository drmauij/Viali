import { describe, it, expect } from "vitest";
import { deriveRiskInputsFromRecords, computeRiskSnapshot } from "../computePerioperativeRisk";

const ILLNESS_LISTS = {
  cardiovascular: [
    { id: "cad", label: "CAD", scoringConcept: "CAD" },
    { id: "htn", label: "Hypertension", scoringConcept: "HYPERTENSION" },
  ],
  pulmonary: [
    { id: "copd", label: "COPD", scoringConcept: "COPD" },
  ],
  coagulation: [
    { id: "vte_h", label: "VTE history", scoringConcept: "VTE_HISTORY" },
  ],
};

const PATIENT = { birthday: "1943-12-13", sex: "F" };
const SURGERY = { surgeryRiskClass: "minor", plannedDate: null, actualEndTime: null };

describe("deriveRiskInputsFromRecords", () => {
  it("inputSource is 'default' when nothing is filled", () => {
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
    expect(r.partial).toBe(true);
    expect(r.inputs.concepts.CAD).toBe(false);
  });

  it("inputSource is 'questionnaire' when questionnaire conditions are present", () => {
    const questionnaire = {
      conditions: { cad: { checked: true } },
    };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("questionnaire");
    expect(r.partial).toBe(true);
    expect(r.inputs.concepts.CAD).toBe(true);
  });

  it("inputSource is 'assessment' when assessment has organ-system data", () => {
    const assessment = { heartIllnesses: { cad: true } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("assessment");
    expect(r.partial).toBe(false);
    expect(r.inputs.concepts.CAD).toBe(true);
  });

  it("empty assessment row falls through to questionnaire", () => {
    const assessment = { heartIllnesses: {}, lungIllnesses: {} };
    const questionnaire = { conditions: { copd: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("questionnaire");
    expect(r.inputs.concepts.COPD).toBe(true);
  });

  it("per-key fall-through: half-filled assessment keeps questionnaire lung data", () => {
    const assessment = { heartIllnesses: { cad: true } }; // no lungIllnesses
    const questionnaire = { conditions: { copd: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("assessment"); // assessment has data
    expect(r.inputs.concepts.CAD).toBe(true);
    expect(r.inputs.concepts.COPD).toBe(true); // from questionnaire fall-through
  });

  it("assessment override wins over questionnaire for the same key", () => {
    const assessment = { heartIllnesses: { cad: false } };
    const questionnaire = { conditions: { cad: { checked: true } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, assessment, questionnaire, ILLNESS_LISTS);
    expect(r.inputs.concepts.CAD).toBe(false);
  });

  it("BMI: assessment wins, questionnaire fills gap", () => {
    const aOnly = { weight: 80, height: 175 };
    const qOnly = { height: 160, weight: 60 };
    const both  = { ...aOnly };
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, aOnly, null, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(80 / 1.75 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, null, qOnly, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(60 / 1.6 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, both, qOnly, ILLNESS_LISTS).inputs.bmi).toBeCloseTo(80 / 1.75 ** 2, 1);
    expect(deriveRiskInputsFromRecords(PATIENT, SURGERY, null, null, ILLNESS_LISTS).inputs.bmi).toBeNull();
  });

  it("surgeryRiskClass=null defaults to 'minor' (suppresses age bump on a 75+ patient)", () => {
    const surgeryWithNullClass = { surgeryRiskClass: null, plannedDate: null, actualEndTime: null };
    const r = deriveRiskInputsFromRecords(PATIENT, surgeryWithNullClass, null, null, ILLNESS_LISTS);
    expect(r.inputs.surgeryRiskClass).toBe("minor");
    const snap = computeRiskSnapshot(PATIENT, surgeryWithNullClass, null, null, ILLNESS_LISTS);
    expect(snap.ageEligible).toBe(true);
    expect(snap.ageModifierSuppressed).toBe(true);
    expect(snap.ageModifier).toBe(0);
  });
});

describe("computeRiskSnapshot Eva regression", () => {
  it("82F smoker, no comorbidities, minor surgery, questionnaire only → ORANGE · VTE · Preliminary", () => {
    const questionnaire = { smokingStatus: "current", conditions: {} };
    const snap = computeRiskSnapshot(PATIENT, SURGERY, null, questionnaire, ILLNESS_LISTS);
    expect(snap.grade).toBe("orange");
    expect(snap.worstDomain).toBe("vte");
    expect(snap.ageModifierSuppressed).toBe(true);
    expect(snap.ageEligible).toBe(true);
    expect(snap.inputSource).toBe("questionnaire");
    expect(snap.partial).toBe(true);
  });
});
