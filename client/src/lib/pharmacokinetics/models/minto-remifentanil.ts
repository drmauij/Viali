// client/src/lib/pharmacokinetics/models/minto-remifentanil.ts
// Minto CF et al. Anesthesiology 1997;86:10-23 — Table 3

import type { PatientCovariates, PKModelParameters } from "../types";
import { deriveRateConstants } from "../types";

function calculateLBM(weight: number, height: number, sex: "male" | "female"): number {
  if (sex === "male") {
    return 1.1 * weight - 128 * (weight / height) ** 2;
  } else {
    return 1.07 * weight - 148 * (weight / height) ** 2;
  }
}

export function calculateMintoRemifentanil(patient: PatientCovariates): PKModelParameters {
  const { age, weight, height, sex } = patient;
  const lbm = calculateLBM(weight, height, sex);

  const v1 = 5.1 - 0.0201 * (age - 40) + 0.072 * (lbm - 55);
  const v2 = 9.82 - 0.0811 * (age - 40) + 0.108 * (lbm - 55);
  const v3 = 5.42;
  const cl1 = 2.6 - 0.0162 * (age - 40) + 0.0191 * (lbm - 55);
  const cl2 = 2.05 - 0.0301 * (age - 40);
  const cl3 = 0.076 - 0.00113 * (age - 40);
  const ke0 = 0.595 - 0.007 * (age - 40);

  return deriveRateConstants(
    Math.max(v1, 0.1), Math.max(v2, 0.1), Math.max(v3, 0.1),
    Math.max(cl1, 0.01), Math.max(cl2, 0.01), Math.max(cl3, 0.001),
    Math.max(ke0, 0.01)
  );
}
