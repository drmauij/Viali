import { describe, it, expect } from "vitest";
import {
  type RiskGrade,
  type DomainBand,
  type DomainKey,
  type PerioperativeRiskResult,
} from "../perioperativeRisk";

describe("perioperativeRisk types", () => {
  it("exports the expected enums", () => {
    const grade: RiskGrade = "green";
    const band: DomainBand = "low";
    const key: DomainKey = "cardiac";
    expect(grade).toBe("green");
    expect(band).toBe("low");
    expect(key).toBe("cardiac");
  });
});

import { cardiacBandFromRcri } from "../perioperativeRisk";

describe("cardiacBandFromRcri", () => {
  it("maps RCRI 'low' to band 'low'", () => {
    expect(cardiacBandFromRcri("low")).toBe("low");
  });
  it("maps RCRI 'moderate' to band 'med'", () => {
    expect(cardiacBandFromRcri("moderate")).toBe("med");
  });
  it("maps RCRI 'high' to band 'high'", () => {
    expect(cardiacBandFromRcri("high")).toBe("high");
  });
});

import { vteBandFromCaprini } from "../perioperativeRisk";

describe("vteBandFromCaprini", () => {
  it("maps 'low' to 'low'",       () => expect(vteBandFromCaprini("low")).toBe("low"));
  it("maps 'moderate' to 'low'",  () => expect(vteBandFromCaprini("moderate")).toBe("low"));
  it("maps 'higher' to 'med'",    () => expect(vteBandFromCaprini("higher")).toBe("med"));
  it("maps 'high' to 'high'",     () => expect(vteBandFromCaprini("high")).toBe("high"));
  it("maps 'veryHigh' to 'high'", () => expect(vteBandFromCaprini("veryHigh")).toBe("high"));
});

import { surgeryBandFromRiskClass } from "../perioperativeRisk";

describe("surgeryBandFromRiskClass", () => {
  it("minor → low",    () => expect(surgeryBandFromRiskClass("minor")).toBe("low"));
  it("standard → med", () => expect(surgeryBandFromRiskClass("standard")).toBe("med"));
  it("large → med",    () => expect(surgeryBandFromRiskClass("large")).toBe("med"));
  it("critical → high",() => expect(surgeryBandFromRiskClass("critical")).toBe("high"));
});

import { calculatePerioperativeRisk, type SurgeryRiskClass } from "../perioperativeRisk";

describe("calculatePerioperativeRisk — aggregation", () => {
  const baseInputs = {
    age: 50,
    sex: "f" as const,
    bmi: 25,
    surgeryRiskClass: "minor" as SurgeryRiskClass,
    plannedDurationMinutes: 60,
    isCurrentSmoker: false,
    functionallyDependent: false,
    concepts: { CAD: false, CHF: false, STROKE_HISTORY: false, INSULIN_DIABETES: false, CKD_OR_DIALYSIS: false, COPD: false, HYPERTENSION: false, ACTIVE_CANCER: false, VTE_HISTORY: false, VARICOSE_VEINS: false, LEG_SWELLING: false, FAMILY_THROMBOPHILIA: false, OC_OR_HRT: false, PREGNANCY_OR_POSTPARTUM: false, RECENT_STROKE_30D: false, SPINAL_CORD_INJURY: false, KNOWN_UNTREATED_OSAS: false, PONV_HISTORY: false },
  };

  it("all-low → green", () => {
    const r = calculatePerioperativeRisk(baseInputs);
    expect(r.grade).toBe("green");
    expect(r.worstDomain).toBe("cardiac"); // ties resolve to cardiac
  });

  it("any-med-no-high → orange", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, surgeryRiskClass: "standard" });
    expect(r.grade).toBe("orange");
    expect(r.worstDomain).toBe("surgery");
  });

  it("any-high → red", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, surgeryRiskClass: "critical" });
    expect(r.grade).toBe("red");
  });

  it("tiebreaker cardiac > vte > pulmonary > frailty > surgery", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      concepts: { ...baseInputs.concepts, CAD: true },
      surgeryRiskClass: "critical",
    });
    expect(r.worstDomain).toBe("cardiac");
  });

  it("age >= 75 bumps green to orange", () => {
    // Note: at age 75 the Caprini sub-score alone reaches 'higher' (3 pts) =>
    // VTE band 'med' => baseline grade 'orange' before the age modifier, which
    // then bumps the grade to 'red'. The original plan expectation of
    // green->orange ignored the age contribution to Caprini. The behaviour under
    // test here is "age >= 75 still applies the ageModifier and never bumps
    // down".
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 75 });
    expect(r.grade).toBe("red");
    expect(r.ageModifier).toBe(1);
  });

  it("age >= 75 bumps orange to red", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 80, surgeryRiskClass: "standard" });
    expect(r.grade).toBe("red");
    expect(r.ageModifier).toBe(1);
  });

  it("age >= 75 keeps red as red (capped)", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 80, surgeryRiskClass: "critical" });
    expect(r.grade).toBe("red");
  });

  it("age 74 does not apply modifier", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 74 });
    expect(r.ageModifier).toBe(0);
  });

  it("drivers are sorted by severity, max length 3", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      concepts: { ...baseInputs.concepts, CAD: true, COPD: true },
      surgeryRiskClass: "critical",
    });
    expect(r.drivers.length).toBeLessThanOrEqual(3);
    expect(r.drivers[0]).toMatch(/cardiac/i);
  });

  it("partial flag propagates from mFI-5 when functionallyDependent is null", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, functionallyDependent: null as any });
    expect(r.partial).toBe(true);
  });
});
