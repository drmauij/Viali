// client/src/lib/pharmacokinetics/forward-simulation.ts
//
// Forward simulation: given known infusion rates (from a TIVA pump),
// compute Cp/Ce over time. This skips the TCI controller entirely —
// the rates are already known; we just run the 3-compartment model forward.

import type { PKModelParameters } from "./types";
import { CPT_INTERVAL_S } from "./types";
import {
  initSolverState,
  advanceState,
  computeCp,
  computeCe,
  INITIAL_EIGEN_STATE,
} from "./engine";
import type { TCIRatePoint } from "./tci-controller";

/**
 * A segment of constant infusion rate (already in engine units: mg/min or μg/min).
 */
export interface RateSegment {
  /** Start time in ms epoch */
  startTime: number;
  /** End time in ms epoch (exclusive) */
  endTime: number;
  /** Infusion rate in mass/min (mg/min for propofol, μg/min for remi) */
  rateMassPerMin: number;
}

/**
 * Forward-simulate known infusion rates through the 3-compartment model.
 *
 * Produces the same TCIRatePoint[] output shape as computeTCIRates()
 * so the downstream merge in simulate/simulateForward is seamless.
 *
 * @param model - PK model parameters (Eleveld propofol or Minto remi)
 * @param segments - Known rate segments (must be in engine mass/min units)
 * @param timeRange - Simulation time window
 * @param intervalMs - Simulation step size (default: CPT_INTERVAL_S * 1000)
 */
export function computeForwardRates(
  model: PKModelParameters,
  segments: RateSegment[],
  timeRange: { start: number; end: number },
  intervalMs: number = CPT_INTERVAL_S * 1000,
): TCIRatePoint[] {
  const solver = initSolverState(model);
  const dtSeconds = intervalMs / 1000;
  const results: TCIRatePoint[] = [];

  // Sort segments by start time for efficient lookup
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  let state = { ...INITIAL_EIGEN_STATE };
  let segIdx = 0;

  for (let t = timeRange.start; t <= timeRange.end; t += intervalMs) {
    // Advance segment index to find the active segment at time t
    while (segIdx < sorted.length - 1 && sorted[segIdx + 1].startTime <= t) {
      segIdx++;
    }

    // Determine rate at this timestep
    let rate = 0;
    if (sorted.length > 0) {
      const seg = sorted[segIdx];
      if (t >= seg.startTime && t < seg.endTime) {
        rate = seg.rateMassPerMin;
      } else {
        // Check if any segment covers this time (handles gaps)
        for (let i = 0; i < sorted.length; i++) {
          if (t >= sorted[i].startTime && t < sorted[i].endTime) {
            rate = sorted[i].rateMassPerMin;
            break;
          }
        }
      }
    }

    state = advanceState(solver, state, rate, dtSeconds);
    results.push({
      timestamp: t,
      rate,
      achievedCp: computeCp(state),
      achievedCe: computeCe(state),
    });
  }

  return results;
}
