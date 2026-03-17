// tests/pharmacokinetics/minto-remifentanil.test.ts
import { describe, it, expect } from "vitest";
import { calculateMintoRemifentanil } from "../../client/src/lib/pharmacokinetics/models/minto-remifentanil";
import type { PatientCovariates } from "../../client/src/lib/pharmacokinetics/types";

describe("Minto Remifentanil Model", () => {
  const standardMale: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };

  it("returns valid parameters for standard male", () => {
    const params = calculateMintoRemifentanil(standardMale);
    expect(params.v1).toBeGreaterThan(3);
    expect(params.v1).toBeLessThan(10);
    expect(params.v2).toBeGreaterThan(0);
    expect(params.v3).toBeGreaterThan(0);
    expect(params.cl1).toBeGreaterThan(0);
    expect(params.ke0).toBeGreaterThan(0);
    expect(params.k10).toBeCloseTo(params.cl1 / params.v1, 6);
  });

  it("reflects age-dependent changes", () => {
    const young = calculateMintoRemifentanil(standardMale);
    const old = calculateMintoRemifentanil({ ...standardMale, age: 80 });
    expect(old.v1).toBeLessThan(young.v1);
  });

  it("reflects sex-dependent LBM differences", () => {
    const male = calculateMintoRemifentanil(standardMale);
    const female = calculateMintoRemifentanil({ ...standardMale, sex: "female" });
    expect(male.v1).not.toBeCloseTo(female.v1, 1);
  });

  it("ke0 is higher than propofol (faster equilibration)", () => {
    const params = calculateMintoRemifentanil(standardMale);
    expect(params.ke0).toBeGreaterThan(0.3);
  });
});
