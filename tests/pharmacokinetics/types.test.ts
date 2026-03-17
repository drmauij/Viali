// tests/pharmacokinetics/types.test.ts
import { describe, it, expect } from "vitest";
import { validateCovariates, parsePatientCovariates } from "../../client/src/lib/pharmacokinetics/types";

describe("PatientCovariates", () => {
  describe("validateCovariates", () => {
    it("returns valid for complete covariates", () => {
      const result = validateCovariates({ age: 40, weight: 70, height: 170, sex: "male" });
      expect(result.valid).toBe(true);
      expect(result.missingFields).toEqual([]);
    });

    it("rejects zero weight", () => {
      const result = validateCovariates({ age: 40, weight: 0, height: 170, sex: "male" });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("weight");
    });

    it("rejects negative age", () => {
      const result = validateCovariates({ age: -1, weight: 70, height: 170, sex: "male" });
      expect(result.valid).toBe(false);
      expect(result.missingFields).toContain("age");
    });
  });

  describe("parsePatientCovariates", () => {
    it("parses valid raw data", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "M",
        weight: "70",
        height: "170",
      });
      expect(result.covariates).not.toBeNull();
      const expectedAge = new Date().getFullYear() - 1986 - (new Date() < new Date(new Date().getFullYear() + '-03-17') ? 1 : 0);
      expect(result.covariates!.age).toBe(expectedAge);
      expect(result.covariates!.sex).toBe("male");
      expect(result.covariates!.weight).toBe(70);
      expect(result.covariates!.height).toBe(170);
      expect(result.missingFields).toEqual([]);
    });

    it("strips unit suffixes from weight/height", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "F",
        weight: "85 kg",
        height: "165cm",
      });
      expect(result.covariates!.weight).toBe(85);
      expect(result.covariates!.height).toBe(165);
      expect(result.covariates!.sex).toBe("female");
    });

    it("defaults sex O to male with note", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "O",
        weight: "70",
        height: "170",
      });
      expect(result.covariates!.sex).toBe("male");
      expect(result.sexDefaultApplied).toBe(true);
    });

    it("reports missing fields when data incomplete", () => {
      const result = parsePatientCovariates({
        birthday: "1986-03-17",
        sex: "M",
        weight: null,
        height: "170",
      });
      expect(result.covariates).toBeNull();
      expect(result.missingFields).toContain("weight");
    });

    it("reports missing birthday", () => {
      const result = parsePatientCovariates({
        birthday: null,
        sex: "M",
        weight: "70",
        height: "170",
      });
      expect(result.covariates).toBeNull();
      expect(result.missingFields).toContain("age");
    });
  });
});
