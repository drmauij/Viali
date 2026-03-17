// client/src/lib/pharmacokinetics/simulate.ts
import type { PatientCovariates, TargetEvent, PKTimePoint } from "./types";
import { CPT_INTERVAL_S } from "./types";
import { calculateEleveldPropofol, calculateEBIS } from "./models/eleveld-propofol";
import { calculateMintoRemifentanil } from "./models/minto-remifentanil";
import { computeTCIRates } from "./tci-controller";

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

  const points: PKTimePoint[] = [];
  const numSteps = Math.floor((timeRange.end - timeRange.start) / intervalMs) + 1;

  for (let i = 0; i < numSteps; i++) {
    const timestamp = timeRange.start + i * intervalMs;
    const propPt = hasPropofol && i < propofolRates.length ? propofolRates[i] : null;
    const remiPt = hasRemi && i < remiRates.length ? remiRates[i] : null;
    const propofolCe = propPt?.achievedCe ?? null;
    const eBIS = propofolCe !== null ? calculateEBIS(propofolCe) : null;

    points.push({
      timestamp,
      propofolCp: propPt?.achievedCp ?? null,
      propofolCe,
      remiCp: remiPt?.achievedCp ?? null,
      remiCe: remiPt?.achievedCe ?? null,
      eBIS,
    });
  }

  return points;
}
