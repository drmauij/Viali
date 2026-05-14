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
