// client/src/lib/pharmacokinetics/simulate.ts
import type { PatientCovariates, TargetEvent, PKTimePoint } from "./types";
import { CPT_INTERVAL_S } from "./types";
import { calculateEleveldPropofol, calculateEBIS } from "./models/eleveld-propofol";
import { calculateMintoRemifentanil } from "./models/minto-remifentanil";
import { computeTCIRates } from "./tci-controller";
import { computeForwardRates, type RateSegment } from "./forward-simulation";
import type { TCIRatePoint } from "./tci-controller";

/**
 * TCI simulation: target concentrations → infusion rates → Cp/Ce/eBIS.
 * Used when rateUnit === "TCI" (pump controls rates via target).
 */
export function simulate(
  patient: PatientCovariates,
  propofolTargets: TargetEvent[],
  remiTargets: TargetEvent[],
  timeRange: { start: number; end: number },
): PKTimePoint[] {
  const intervalMs = CPT_INTERVAL_S * 1000;
  const hasPropofol = propofolTargets.length > 0;
  const hasRemi = remiTargets.length > 0;

  let propofolRates: ReturnType<typeof computeTCIRates> = [];
  let remiRates: ReturnType<typeof computeTCIRates> = [];

  if (hasPropofol) {
    const propofolModel = calculateEleveldPropofol(patient);
    propofolRates = computeTCIRates(propofolModel, propofolTargets, timeRange, intervalMs);
  }
  if (hasRemi) {
    const remiModel = calculateMintoRemifentanil(patient);
    remiRates = computeTCIRates(remiModel, remiTargets, timeRange, intervalMs);
  }

  return mergeRatesToTimeSeries(propofolRates, remiRates, hasPropofol, hasRemi, timeRange, intervalMs);
}

/**
 * Forward (TIVA) simulation: known infusion rates → Cp/Ce/eBIS.
 * Used when rateUnit is mg/kg/h, μg/kg/min, etc. (user sets rates, not targets).
 */
export function simulateForward(
  patient: PatientCovariates,
  propofolSegments: RateSegment[],
  remiSegments: RateSegment[],
  timeRange: { start: number; end: number },
): PKTimePoint[] {
  const intervalMs = CPT_INTERVAL_S * 1000;
  const hasPropofol = propofolSegments.length > 0;
  const hasRemi = remiSegments.length > 0;

  let propofolRates: TCIRatePoint[] = [];
  let remiRates: TCIRatePoint[] = [];

  if (hasPropofol) {
    const propofolModel = calculateEleveldPropofol(patient);
    propofolRates = computeForwardRates(propofolModel, propofolSegments, timeRange, intervalMs);
  }
  if (hasRemi) {
    const remiModel = calculateMintoRemifentanil(patient);
    remiRates = computeForwardRates(remiModel, remiSegments, timeRange, intervalMs);
  }

  return mergeRatesToTimeSeries(propofolRates, remiRates, hasPropofol, hasRemi, timeRange, intervalMs);
}

/** Threshold below which concentration is treated as "no drug yet" → null */
const CP_THRESHOLD = 0.001;

/** Merge propofol + remi rate arrays into PKTimePoint[] with eBIS. */
function mergeRatesToTimeSeries(
  propofolRates: TCIRatePoint[],
  remiRates: TCIRatePoint[],
  hasPropofol: boolean,
  hasRemi: boolean,
  timeRange: { start: number; end: number },
  intervalMs: number,
): PKTimePoint[] {
  const points: PKTimePoint[] = [];
  const numSteps = Math.floor((timeRange.end - timeRange.start) / intervalMs) + 1;

  for (let i = 0; i < numSteps; i++) {
    const timestamp = timeRange.start + i * intervalMs;
    const propPt = hasPropofol && i < propofolRates.length ? propofolRates[i] : null;
    const remiPt = hasRemi && i < remiRates.length ? remiRates[i] : null;

    // Treat near-zero Cp as null (drug hasn't reached the patient yet)
    const propCp = propPt && propPt.achievedCp > CP_THRESHOLD ? propPt.achievedCp : null;
    const propCe = propPt && propPt.achievedCe > CP_THRESHOLD ? propPt.achievedCe : null;
    const remiCp = remiPt && remiPt.achievedCp > CP_THRESHOLD ? remiPt.achievedCp : null;
    const remiCe = remiPt && remiPt.achievedCe > CP_THRESHOLD ? remiPt.achievedCe : null;

    const eBIS = propCe !== null ? calculateEBIS(propCe) : null;

    points.push({
      timestamp,
      propofolCp: propCp,
      propofolCe: propCe,
      remiCp,
      remiCe,
      eBIS,
    });
  }

  return points;
}
