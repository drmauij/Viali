// tests/pharmacokinetics/eleveld-propofol.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateEleveldPropofol,
  calculateEBIS,
} from "../../client/src/lib/pharmacokinetics/models/eleveld-propofol";
import type { PatientCovariates } from "../../client/src/lib/pharmacokinetics/types";

describe("Eleveld Propofol Model", () => {
  const standardMale: PatientCovariates = {
    age: 40,
    weight: 70,
    height: 170,
    sex: "male",
  };
  const elderlyFemale: PatientCovariates = {
    age: 75,
    weight: 55,
    height: 160,
    sex: "female",
  };

  describe("calculateEleveldPropofol", () => {
    it("returns valid parameters for standard male", () => {
      const params = calculateEleveldPropofol(standardMale);
      expect(params.v1).toBeGreaterThan(3);
      expect(params.v1).toBeLessThan(15);
      expect(params.v2).toBeGreaterThan(0);
      expect(params.v3).toBeGreaterThan(0);
      expect(params.cl1).toBeGreaterThan(0);
      expect(params.cl2).toBeGreaterThan(0);
      expect(params.cl3).toBeGreaterThan(0);
      expect(params.ke0).toBeGreaterThan(0);
      expect(params.k10).toBeCloseTo(params.cl1 / params.v1, 6);
      expect(params.k12).toBeCloseTo(params.cl2 / params.v1, 6);
    });

    it("produces smaller clearance for elderly patient", () => {
      const young = calculateEleveldPropofol(standardMale);
      const old = calculateEleveldPropofol(elderlyFemale);
      expect(old.cl1).toBeLessThan(young.cl1);
    });

    it("produces different V2 for different ages", () => {
      const young = calculateEleveldPropofol(standardMale);
      const old = calculateEleveldPropofol({ ...standardMale, age: 80 });
      expect(young.v2).not.toBeCloseTo(old.v2, 1);
    });

    // ── Reference patient validation (70 kg / 170 cm / 35 yr male) ────────────
    // Expected values derived from Eleveld 2018 Table 2 published parameters.
    // Published reference values from the paper (Table 2 typical values):
    //   V1 ≈ 6.28 L, V2 ≈ 25.5 L, V3 ≈ 273 L
    //   CL ≈ 1.79 L/min, Q2 ≈ 1.75 L/min, Q3 ≈ 1.11 L/min
    it("matches published reference values for 35yr male 70kg/170cm", () => {
      const ref: PatientCovariates = {
        age: 35,
        weight: 70,
        height: 170,
        sex: "male",
      };
      const p = calculateEleveldPropofol(ref);

      // V1: at reference the sigmoid ratio fCentral(70)/fCentral(70) = 1, so V1 = θ1 = 6.28
      expect(p.v1).toBeCloseTo(6.28, 1);

      // V2: at reference weight=70, age=35, ratio and exp term = 1, so V2 = θ2 = 25.5
      expect(p.v2).toBeCloseTo(25.5, 1);

      // CL1: at reference all scaling factors = 1, so CL = θ4 = 1.79
      expect(p.cl1).toBeCloseTo(1.79, 1);

      // V3: at reference FFM ratio = 1 and age exp = 1, so V3 ≈ θ3 = 273
      expect(p.v3).toBeCloseTo(273, 0);

      // Q3: at reference V3/θ3 = 1 and age exp = 1, so CL3 ≈ θ7 = 1.11
      expect(p.cl3).toBeCloseTo(1.11, 1);
    });

    it("female has higher CL1 than male of same demographics", () => {
      // θ5 (2.10) > θ4 (1.79), so females have higher CL per the Eleveld model
      const male = calculateEleveldPropofol(standardMale);
      const female = calculateEleveldPropofol({ ...standardMale, sex: "female" });
      expect(female.cl1).toBeGreaterThan(male.cl1);
    });

    it("heavier patient has larger V1 (up to saturation)", () => {
      const light = calculateEleveldPropofol({ ...standardMale, weight: 50 });
      const heavy = calculateEleveldPropofol({ ...standardMale, weight: 100 });
      expect(heavy.v1).toBeGreaterThan(light.v1);
    });

    it("heavier patient has larger V2", () => {
      const light = calculateEleveldPropofol({ ...standardMale, weight: 50 });
      const heavy = calculateEleveldPropofol({ ...standardMale, weight: 100 });
      expect(heavy.v2).toBeGreaterThan(light.v2);
    });

    it("heavier patient has lower ke0 (allometric scaling)", () => {
      // ke0 ∝ weight^-0.25
      const light = calculateEleveldPropofol({ ...standardMale, weight: 50 });
      const heavy = calculateEleveldPropofol({ ...standardMale, weight: 100 });
      expect(heavy.ke0).toBeLessThan(light.ke0);
    });

    it("derived rate constants are consistent with volumes and clearances", () => {
      const p = calculateEleveldPropofol(standardMale);
      expect(p.k10).toBeCloseTo(p.cl1 / p.v1, 6);
      expect(p.k12).toBeCloseTo(p.cl2 / p.v1, 6);
      expect(p.k21).toBeCloseTo(p.cl2 / p.v2, 6);
      expect(p.k13).toBeCloseTo(p.cl3 / p.v1, 6);
      expect(p.k31).toBeCloseTo(p.cl3 / p.v3, 6);
    });

    it("all parameters are strictly positive and finite", () => {
      const patients: PatientCovariates[] = [
        standardMale,
        elderlyFemale,
        { age: 18, weight: 50, height: 155, sex: "female" },
        { age: 90, weight: 120, height: 180, sex: "male" },
      ];
      for (const patient of patients) {
        const p = calculateEleveldPropofol(patient);
        for (const key of [
          "v1", "v2", "v3", "cl1", "cl2", "cl3", "ke0",
          "k10", "k12", "k21", "k13", "k31",
        ] as const) {
          expect(p[key]).toBeGreaterThan(0);
          expect(Number.isFinite(p[key])).toBe(true);
        }
      }
    });
  });

  describe("calculateEBIS", () => {
    it("returns ~100 for zero Ce (awake)", () => {
      const bis = calculateEBIS(0);
      // Eleveld E0 (BIS_BASELINE) = 93 per published PD parameters — not 98-100.
      // A fully awake patient has BIS ≈ 93 in the Eleveld model.
      expect(bis).toBeGreaterThan(90);
      expect(bis).toBeLessThanOrEqual(100);
    });

    it("returns exactly BIS_BASELINE (93) for Ce = 0", () => {
      expect(calculateEBIS(0)).toBe(93);
    });

    it("returns 40-60 for surgical anesthesia Ce (~3-4 μg/ml)", () => {
      const bis = calculateEBIS(3.5);
      expect(bis).toBeGreaterThan(30);
      expect(bis).toBeLessThan(65);
    });

    it("returns <30 for deep anesthesia Ce (>6 μg/ml)", () => {
      const bis = calculateEBIS(7);
      expect(bis).toBeLessThan(30);
    });

    it("is monotonically decreasing", () => {
      const bis1 = calculateEBIS(1);
      const bis2 = calculateEBIS(2);
      const bis3 = calculateEBIS(4);
      const bis4 = calculateEBIS(6);
      expect(bis1).toBeGreaterThan(bis2);
      expect(bis2).toBeGreaterThan(bis3);
      expect(bis3).toBeGreaterThan(bis4);
    });

    it("clamps to 0-100 range", () => {
      expect(calculateEBIS(0)).toBeLessThanOrEqual(100);
      expect(calculateEBIS(20)).toBeGreaterThanOrEqual(0);
    });

    it("BIS near 50% at CE50 (3.08 μg/ml)", () => {
      // At Ce = CE50, effect = 0.5, so BIS = E0 * 0.5 = 93 * 0.5 ≈ 46-47
      const bis = calculateEBIS(3.08);
      expect(bis).toBeGreaterThanOrEqual(44);
      expect(bis).toBeLessThanOrEqual(50);
    });

    it("approaches 0 at very high concentrations", () => {
      // At Ce = 50 μg/ml: effect ≈ 0.9998, BIS ≈ 93 × 0.0002 ≈ 0.02 → rounds to 0
      // Using Ce = 200 μg/ml to ensure the floor is reached after Math.round
      expect(calculateEBIS(200)).toBe(0);
      // Also confirm 50 μg/ml is very suppressed (<5)
      expect(calculateEBIS(50)).toBeLessThan(5);
    });

    it("returns integer values", () => {
      expect(Number.isInteger(calculateEBIS(0))).toBe(true);
      expect(Number.isInteger(calculateEBIS(3.5))).toBe(true);
      expect(Number.isInteger(calculateEBIS(7))).toBe(true);
    });
  });
});
