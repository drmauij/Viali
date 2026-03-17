// client/src/lib/pharmacokinetics/models/eleveld-propofol.ts
//
// Eleveld DJ et al. "An Allometric Model of Remifentanil Pharmacokinetics and
// Pharmacodynamics." BJA 2018;120(5):942–959.
// doi:10.1016/j.bja.2018.01.018
//
// Three-compartment PK model with effect-site and PD (eBIS via Hill equation).
// Parameters are taken directly from published Table 2 (population estimates).
// Constants are NOT derived from third-party code — only from the publication.

import type { PatientCovariates, PKModelParameters } from "../types";
import { deriveRateConstants } from "../types";

// ── Fat-Free Mass (Al-Sallami 2015) ──────────────────────────────────────────
//
// Used for V3 and CL3 scaling (replaces lean body weight in older models).
// Al-Sallami HS et al. Clin Pharmacokinet 2015;54(10):1051–1068.

function calculateFFM(
  weight: number,
  height: number,
  age: number,
  sex: "male" | "female",
): number {
  const bmi = weight / (height / 100) ** 2;
  if (sex === "male") {
    // Al-Sallami male formula
    return (
      (0.88 + (1 - 0.88) / (1 + (age / 13.4) ** -12.7)) *
      ((9270 * weight) / (6680 + 216 * bmi))
    );
  } else {
    // Al-Sallami female formula
    return (
      (1.11 + (1 - 1.11) / (1 + (age / 7.1) ** -1.1)) *
      ((9270 * weight) / (8780 + 244 * bmi))
    );
  }
}

// ── Sigmoid helper ────────────────────────────────────────────────────────────
function sigmoid(x: number, E50: number, gamma: number): number {
  const xg = x ** gamma;
  return xg / (xg + E50 ** gamma);
}

// ── Reference individual: 35-year-old male, 70 kg, 170 cm ────────────────────
const REF_AGE = 35;
const REF_WEIGHT = 70;
const REF_HEIGHT = 170;
const REF_SEX: "male" = "male";

// Pre-compute reference FFM once
const FFM_REF = calculateFFM(REF_WEIGHT, REF_HEIGHT, REF_AGE, REF_SEX);

// Reference post-menstrual age in weeks (adults: PMA = age_years × 52 + 40)
// The 40-week offset accounts for gestation; for adults this term is negligible
// but kept for consistency with the published implementation.
const PMA_REF = (REF_AGE + 40 / 52) * 52; // weeks

// ── Table 2 parameters (population estimates) ─────────────────────────────────
//
// Notation: θN matches the parameter index in Eleveld 2018 Table 2.

// PK parameters
const THETA1 = 6.28;   // θ1  — V1 reference (L)
const THETA2 = 25.5;   // θ2  — V2 reference (L)
const THETA3 = 273;    // θ3  — V3 reference (L)
const THETA4 = 1.79;   // θ4  — CL reference, male (L/min)
const THETA5 = 2.10;   // θ5  — CL reference, female (L/min) [sex covariate]
const THETA6 = 1.75;   // θ6  — Q2 reference (L/min)
const THETA7 = 1.11;   // θ7  — Q3 reference (L/min)
const THETA8 = 42.3;   // θ8  — CL maturation E50: PMA at half-maximal maturation (weeks)
const THETA9 = 9.06;   // θ9  — CL maturation Hill coefficient (unitless)
const THETA10 = 33.6;  // θ10 — V1 central saturation weight: weight at half-max V1 (kg)
const THETA11 = -0.0156;  // θ11 — V2 age slope (per year relative to reference)
const THETA12 = -0.00286; // θ12 — CL age slope (per year relative to reference)
const THETA13 = -0.0138;  // θ13 — V3 age slope (per year relative to reference)
const THETA14 = 1.3;      // θ14 — Q2 maturation scaling factor
const THETA15 = -0.0260;  // θ15 — Q3 age slope (per year relative to reference)
const THETA16 = 0.146;    // θ16 — ke0 reference (min⁻¹)
// θ17 and θ18 are residual-error terms (not needed for deterministic prediction)

// PD parameters (eBIS, Table 3 in paper)
const CE50_BIS = 3.08;   // Effect-site concentration at 50% BIS reduction (μg/ml)
const GAMMA_BIS = 1.47;  // Hill coefficient for BIS sigmoid
const BIS_BASELINE = 93; // E0: awake BIS (units)
// Emax = 1 (full suppression), so BIS at saturation → 0

// ── Maturation function (CL only) ────────────────────────────────────────────
function clMaturation(pmaWeeks: number): number {
  return sigmoid(pmaWeeks, THETA8, THETA9);
}

// ── V1 central weight function ────────────────────────────────────────────────
function fCentral(weight: number): number {
  return sigmoid(weight, THETA10, 1);
}

// ── Main model calculation ────────────────────────────────────────────────────

/**
 * Calculate Eleveld 2018 propofol PK/PD parameters for a given patient.
 *
 * All volumes in litres, clearances in L/min, ke0 in min⁻¹.
 *
 * @param patient — age (years), weight (kg), height (cm), sex
 * @returns PKModelParameters including derived rate constants
 */
export function calculateEleveldPropofol(
  patient: PatientCovariates,
): PKModelParameters {
  const { age, weight, height, sex } = patient;

  const ffm = calculateFFM(weight, height, age, sex);
  const pma = (age + 40 / 52) * 52; // post-menstrual age in weeks
  const isMale = sex === "male";

  // ── Compartment volumes ───────────────────────────────────────────────────

  // V1: allometric on weight via central saturation sigmoid (θ1, θ10)
  const v1 = THETA1 * (fCentral(weight) / fCentral(REF_WEIGHT));

  // V2: allometric on weight + age effect (θ2, θ11)
  const v2 = THETA2 * (weight / REF_WEIGHT) * Math.exp(THETA11 * (age - REF_AGE));

  // V3: allometric on FFM + age effect (θ3, θ13)
  const v3 = THETA3 * (ffm / FFM_REF) * Math.exp(THETA13 * (age - REF_AGE));

  // ── Clearances ────────────────────────────────────────────────────────────

  // CL1: sex-specific reference, allometric on weight^0.75,
  //      maturation function, age effect (θ4/θ5, θ8, θ9, θ12)
  const clRef = isMale ? THETA4 : THETA5;
  const maturationFactor = clMaturation(pma) / clMaturation(PMA_REF);
  const cl1 =
    clRef *
    (weight / REF_WEIGHT) ** 0.75 *
    maturationFactor *
    Math.exp(THETA12 * (age - REF_AGE));

  // Q2: allometric on V2 ratio, with maturation scaling (θ6, θ14, θ8, θ9)
  // The (1 + θ14 × (1 - maturation)) term increases Q2 in immature patients
  // (not relevant for adults, included for completeness)
  const q2Mat = clMaturation(pma);
  const cl2 = THETA6 * (v2 / THETA2) ** 0.75 * (1 + THETA14 * (1 - q2Mat));

  // Q3: allometric on V3 ratio + age effect (θ7, θ15)
  const cl3 = THETA7 * (v3 / THETA3) ** 0.75 * Math.exp(THETA15 * (age - REF_AGE));

  // ── Effect-site ke0 ───────────────────────────────────────────────────────
  // ke0: allometric on weight^-0.25 (θ16)
  const ke0 = THETA16 * (weight / REF_WEIGHT) ** -0.25;

  return deriveRateConstants(v1, v2, v3, cl1, cl2, cl3, ke0);
}

// ── eBIS: Hill equation PD model ──────────────────────────────────────────────

/**
 * Predicted BIS from effect-site propofol concentration.
 *
 * BIS(Ce) = E0 × (1 − Ce^γ / (Ce^γ + CE50^γ))
 *
 * Returns integer in range [0, 100].
 *
 * @param ce — effect-site propofol concentration (μg/ml)
 */
export function calculateEBIS(ce: number): number {
  if (ce <= 0) return BIS_BASELINE;
  const effect = sigmoid(ce, CE50_BIS, GAMMA_BIS);
  const bis = BIS_BASELINE * (1 - effect);
  return Math.max(0, Math.min(100, Math.round(bis)));
}
