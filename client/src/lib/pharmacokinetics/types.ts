// client/src/lib/pharmacokinetics/types.ts

// ── Patient ──────────────────────────────────────────────

export interface PatientCovariates {
  age: number;        // years
  weight: number;     // kg
  height: number;     // cm
  sex: "male" | "female";
}

export interface CovariateValidation {
  valid: boolean;
  missingFields: string[];
}

export interface ParseResult {
  covariates: PatientCovariates | null;
  missingFields: string[];
  sexDefaultApplied: boolean;
}

export function validateCovariates(c: PatientCovariates): CovariateValidation {
  const missing: string[] = [];
  if (c.age === undefined || c.age === null || c.age < 18 || c.age > 120) missing.push("age");
  if (!c.weight || c.weight <= 0 || c.weight > 300) missing.push("weight");
  if (!c.height || c.height <= 0 || c.height > 300) missing.push("height");
  return { valid: missing.length === 0, missingFields: missing };
}

export function parsePatientCovariates(raw: {
  birthday?: string | null;
  sex?: string | null;
  weight?: string | null;
  height?: string | null;
}): ParseResult {
  const missing: string[] = [];
  let sexDefaultApplied = false;

  // Age from birthday
  let age: number | null = null;
  if (raw.birthday) {
    const birth = new Date(raw.birthday);
    const now = new Date();
    age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
  } else {
    missing.push("age");
  }

  // Weight — strip unit suffixes
  let weight: number | null = null;
  if (raw.weight) {
    weight = parseFloat(raw.weight.replace(/[^0-9.]/g, ""));
    if (isNaN(weight) || weight <= 0) { weight = null; missing.push("weight"); }
  } else {
    missing.push("weight");
  }

  // Height — strip unit suffixes
  let height: number | null = null;
  if (raw.height) {
    height = parseFloat(raw.height.replace(/[^0-9.]/g, ""));
    if (isNaN(height) || height <= 0) { height = null; missing.push("height"); }
  } else {
    missing.push("height");
  }

  // Sex — map M/F/O
  let sex: "male" | "female" = "male";
  if (raw.sex === "F") {
    sex = "female";
  } else if (raw.sex === "O" || !raw.sex) {
    sex = "male";
    sexDefaultApplied = true;
  }

  if (missing.length > 0 || age === null || weight === null || height === null) {
    return { covariates: null, missingFields: missing, sexDefaultApplied };
  }

  return {
    covariates: { age, weight, height, sex },
    missingFields: [],
    sexDefaultApplied,
  };
}

// ── PK Model ─────────────────────────────────────────────

export interface PKModelParameters {
  v1: number;   // Central compartment volume (L)
  v2: number;   // Peripheral 1 volume (L)
  v3: number;   // Peripheral 2 volume (L)
  cl1: number;  // Elimination clearance (L/min)
  cl2: number;  // Inter-compartmental clearance 1 (L/min)
  cl3: number;  // Inter-compartmental clearance 2 (L/min)
  ke0: number;  // Effect-site equilibration rate constant (min⁻¹)
  // Derived rate constants
  k10: number;  // cl1/v1
  k12: number;  // cl2/v1
  k21: number;  // cl2/v2
  k13: number;  // cl3/v1
  k31: number;  // cl3/v3
}

export function deriveRateConstants(
  v1: number, v2: number, v3: number,
  cl1: number, cl2: number, cl3: number,
  ke0: number,
): PKModelParameters {
  return {
    v1, v2, v3, cl1, cl2, cl3, ke0,
    k10: cl1 / v1,
    k12: cl2 / v1,
    k21: cl2 / v2,
    k13: cl3 / v1,
    k31: cl3 / v3,
  };
}

// ── Simulation I/O ───────────────────────────────────────

export interface TargetEvent {
  type: "start" | "rate_change" | "stop";
  timestamp: number;           // ms epoch
  targetConcentration: number; // μg/ml (propofol) or ng/ml (remi)
}

export interface PKTimePoint {
  timestamp: number;
  propofolCp: number | null;
  propofolCe: number | null;
  remiCp: number | null;
  remiCe: number | null;
  eBIS: number | null;
}

export const CPT_INTERVAL_S = 10; // 10-second time steps for smooth display
