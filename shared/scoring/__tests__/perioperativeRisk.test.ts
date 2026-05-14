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
