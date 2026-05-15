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

  it("stub assessment (organ-system maps populated with all-false keys) does NOT count as data", () => {
    // Form rendering pre-populates every checkbox as `{itemId: false}` — this
    // is identical in shape to a real assessment, so presence of keys alone
    // can't be the signal. Only positive values count.
    const stubAssessment = {
      heartIllnesses: { cad: false, htn: false },
      lungIllnesses: { copd: false },
      weight: "70",
    };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, stubAssessment, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
    expect(r.partial).toBe(true);
  });

  it("real assessment (at least one true comorbidity) counts as assessment data", () => {
    const realAssessment = { heartIllnesses: { cad: true, htn: false } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, realAssessment, null, ILLNESS_LISTS);
    expect(r.inputSource).toBe("assessment");
    expect(r.inputs.concepts.CAD).toBe(true);
  });

  it("questionnaire with only smokingStatus='never' falls through to default", () => {
    // "never" is the default smoking option and indistinguishable from an
    // auto-stub; it should not be treated as a positive signal.
    const stubQuestionnaire = { smokingStatus: "never", conditions: {} };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, stubQuestionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
  });

  it("questionnaire with smokingStatus='current' counts as questionnaire data", () => {
    const realQuestionnaire = { smokingStatus: "current", conditions: {} };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, realQuestionnaire, ILLNESS_LISTS);
    expect(r.inputSource).toBe("questionnaire");
  });

  it("stub questionnaire (all conditions present but checked=false) falls through to default", () => {
    const stubQ = {
      conditions: {
        cad: { checked: false },
        copd: { checked: false },
      },
    };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, null, stubQ, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
  });

  it("assessment stub + questionnaire stub → both ignored, inputSource is default", () => {
    const stubA = { heartIllnesses: { cad: false }, weight: "70" };
    const stubQ = { smokingStatus: "never", conditions: { cad: { checked: false } } };
    const r = deriveRiskInputsFromRecords(PATIENT, SURGERY, stubA, stubQ, ILLNESS_LISTS);
    expect(r.inputSource).toBe("default");
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
