import { describe, it, expect } from "vitest";
import {
  type RiskGrade,
  type DomainBand,
  type DomainKey,
  type PerioperativeRiskResult,
  type PerioperativeRiskInputs,
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
  it("standard → low", () => expect(surgeryBandFromRiskClass("standard")).toBe("low"));
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
    metAbove4: true,
    concepts: { CAD: false, CHF: false, STROKE_HISTORY: false, INSULIN_DIABETES: false, CKD_OR_DIALYSIS: false, COPD: false, HYPERTENSION: false, ACTIVE_CANCER: false, VTE_HISTORY: false, VARICOSE_VEINS: false, LEG_SWELLING: false, FAMILY_THROMBOPHILIA: false, OC_OR_HRT: false, PREGNANCY_OR_POSTPARTUM: false, RECENT_STROKE_30D: false, SPINAL_CORD_INJURY: false, KNOWN_UNTREATED_OSAS: false, PONV_HISTORY: false },
  };

  it("all-low → green", () => {
    const r = calculatePerioperativeRisk(baseInputs);
    expect(r.grade).toBe("green");
    expect(r.worstDomain).toBe("cardiac"); // ties resolve to cardiac
  });

  it("any-med-no-high → orange", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, surgeryRiskClass: "large" });
    expect(r.grade).toBe("orange");
    // large surgery bumps both surgery and Caprini ('higher' = med) to med; vte
    // wins the tiebreaker (cardiac > vte > pulmonary > frailty > surgery).
    expect(r.worstDomain).toBe("vte");
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

  it("age >= 75 bumps green to orange (large surgery)", () => {
    // For a large surgery the age bump is NOT suppressed. At age 75 the Caprini
    // sub-score alone reaches 'higher' (3 pts) => VTE med => baseline orange,
    // then the age modifier bumps it to red. The behaviour under test is
    // "age >= 75 still applies the ageModifier on large/critical and never bumps down".
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 75, surgeryRiskClass: "large" });
    expect(r.grade).toBe("red");
    expect(r.ageModifier).toBe(1);
  });

  it("age >= 75 bumps orange to red", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, age: 80, surgeryRiskClass: "large" });
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

  it("does NOT flag partial when functionallyDependent is null — only assessment-missing should mark partial upstream", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, functionallyDependent: null as any });
    expect(r.partial).toBe(false);
  });

  it("MET<4 bumps cardiac low -> med", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, metAbove4: false });
    expect(r.domains.cardiac.band).toBe("med");
    expect(r.domains.cardiac.source).toMatch(/MET<4/);
  });

  it("MET<4 bumps cardiac med -> high (one RCRI risk factor)", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      metAbove4: false,
      concepts: { ...baseInputs.concepts, CAD: true },
    });
    expect(r.domains.cardiac.band).toBe("high");
    expect(r.domains.cardiac.source).toMatch(/MET<4/);
  });

  it("MET<4 leaves cardiac high as high (no bump above high)", () => {
    const r = calculatePerioperativeRisk({
      ...baseInputs,
      metAbove4: false,
      concepts: { ...baseInputs.concepts, CAD: true, CHF: true, STROKE_HISTORY: true },
    });
    expect(r.domains.cardiac.band).toBe("high");
    expect(r.domains.cardiac.source).not.toMatch(/MET<4/);
  });

  it("MET=true does not bump cardiac band", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, metAbove4: true });
    expect(r.domains.cardiac.band).toBe("low");
    expect(r.domains.cardiac.source).not.toMatch(/MET<4/);
  });

  it("metAbove4 === null does NOT produce partial=true — MET<4 is a refining bump, not a load-bearing input", () => {
    const r = calculatePerioperativeRisk({ ...baseInputs, metAbove4: null });
    expect(r.partial).toBe(false);
  });
});

const ZERO_CONCEPTS: PerioperativeRiskInputs["concepts"] = {
  CAD: false, CHF: false, STROKE_HISTORY: false, INSULIN_DIABETES: false,
  CKD_OR_DIALYSIS: false, COPD: false, HYPERTENSION: false, ACTIVE_CANCER: false,
  VTE_HISTORY: false, VARICOSE_VEINS: false, LEG_SWELLING: false,
  FAMILY_THROMBOPHILIA: false, OC_OR_HRT: false, PREGNANCY_OR_POSTPARTUM: false,
  RECENT_STROKE_30D: false, SPINAL_CORD_INJURY: false, KNOWN_UNTREATED_OSAS: false,
  PONV_HISTORY: false,
};

function baseInputs(overrides: Partial<PerioperativeRiskInputs> = {}): PerioperativeRiskInputs {
  return {
    age: 82,
    sex: "f",
    bmi: 25,
    surgeryRiskClass: "minor",
    plannedDurationMinutes: 60,
    isCurrentSmoker: true, // produces Pulmonary MED for age ≥ 70
    functionallyDependent: null,
    metAbove4: null,
    concepts: ZERO_CONCEPTS,
    ...overrides,
  };
}

describe("age modifier × surgery class attenuation", () => {
  it("applies the bump on a large surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "large" }));
    expect(r.ageEligible).toBe(true);
    expect(r.ageModifier).toBe(1);
    expect(r.ageModifierSuppressed).toBe(false);
    expect(r.grade).toBe("red");
  });

  it("applies the bump on a critical surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "critical" }));
    expect(r.ageModifier).toBe(1);
    expect(r.ageModifierSuppressed).toBe(false);
    expect(r.grade).toBe("red");
  });

  it("suppresses the bump on a minor surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "minor" }));
    expect(r.ageEligible).toBe(true);
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(true);
    expect(r.grade).toBe("orange");
  });

  it("suppresses the bump on a standard surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({ surgeryRiskClass: "standard" }));
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(true);
    expect(r.grade).toBe("orange");
  });

  it("below threshold age — no suppression flag, no bump", () => {
    const r = calculatePerioperativeRisk(baseInputs({ age: 70, surgeryRiskClass: "minor" }));
    expect(r.ageEligible).toBe(false);
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(false);
  });

  it("does not mask a high-domain patient on a minor surgery", () => {
    const r = calculatePerioperativeRisk(baseInputs({
      age: 70,
      surgeryRiskClass: "minor",
      concepts: { ...ZERO_CONCEPTS, CAD: true, CHF: true, CKD_OR_DIALYSIS: true },
    }));
    expect(r.grade).toBe("red");
    expect(r.worstDomain).toBe("cardiac");
  });

  it("below threshold age + large surgery + HIGH worst domain → RED, no bump", () => {
    const r = calculatePerioperativeRisk(baseInputs({
      age: 70,
      surgeryRiskClass: "large",
      concepts: { ...ZERO_CONCEPTS, CAD: true, CHF: true, CKD_OR_DIALYSIS: true },
    }));
    expect(r.grade).toBe("red");
    expect(r.ageEligible).toBe(false);
    expect(r.ageModifier).toBe(0);
    expect(r.ageModifierSuppressed).toBe(false);
  });

  it("Eva regression: 82 + smoker + minor → ORANGE · VTE", () => {
    const r = calculatePerioperativeRisk(baseInputs({}));
    expect(r.worstDomain).toBe("vte");
    expect(r.grade).toBe("orange");
    expect(r.ageModifierSuppressed).toBe(true);
  });

  it("ageEligible is true whenever age ≥ 75, regardless of suppression", () => {
    const minorR = calculatePerioperativeRisk(baseInputs({ age: 80, surgeryRiskClass: "minor" }));
    const largeR = calculatePerioperativeRisk(baseInputs({ age: 80, surgeryRiskClass: "large" }));
    expect(minorR.ageEligible).toBe(true);
    expect(largeR.ageEligible).toBe(true);
  });

  it("ageModifier === 1 and ageModifierSuppressed are mutually exclusive", () => {
    for (const sc of ["minor", "standard", "large", "critical"] as const) {
      for (const age of [50, 75, 90]) {
        const r = calculatePerioperativeRisk(baseInputs({ age, surgeryRiskClass: sc }));
        expect(r.ageModifier === 1 && r.ageModifierSuppressed).toBe(false);
      }
    }
  });
});

import { isPreliminary } from "../perioperativeRisk";

describe("isPreliminary helper", () => {
  it("returns false when inputSource is 'assessment'", () => {
    expect(isPreliminary({ inputSource: "assessment", partial: false } as any)).toBe(false);
  });

  it("returns true when inputSource is 'questionnaire'", () => {
    expect(isPreliminary({ inputSource: "questionnaire", partial: true } as any)).toBe(true);
  });

  it("returns true when inputSource is 'default'", () => {
    expect(isPreliminary({ inputSource: "default", partial: true } as any)).toBe(true);
  });

  it("backwards-compat: falls back to partial when inputSource is missing", () => {
    expect(isPreliminary({ partial: true } as any)).toBe(true);
    expect(isPreliminary({ partial: false } as any)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isPreliminary(null)).toBe(false);
    expect(isPreliminary(undefined)).toBe(false);
  });
});
