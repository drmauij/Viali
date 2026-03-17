// client/src/lib/pharmacokinetics/tci-controller.ts
import type { PKModelParameters, TargetEvent } from "./types";
import { CPT_INTERVAL_S } from "./types";
import { initSolverState, advanceState, computeCp, computeCe, INITIAL_EIGEN_STATE, type EigenState } from "./engine";

export interface TCIRatePoint {
  timestamp: number;
  rate: number;        // mass/min
  achievedCp: number;
  achievedCe: number;
}

export function computeTCIRates(
  model: PKModelParameters,
  targets: TargetEvent[],
  timeRange: { start: number; end: number },
  intervalMs: number = CPT_INTERVAL_S * 1000,
): TCIRatePoint[] {
  const solver = initSolverState(model);
  const dtSeconds = intervalMs / 1000;
  const results: TCIRatePoint[] = [];
  const sortedTargets = [...targets].sort((a, b) => a.timestamp - b.timestamp);

  let state: EigenState = { p: [0, 0, 0], e: [0, 0, 0, 0] };
  let currentTarget = 0;
  let targetIdx = 0;
  let isStopped = true;

  for (let t = timeRange.start; t <= timeRange.end; t += intervalMs) {
    while (targetIdx < sortedTargets.length && sortedTargets[targetIdx].timestamp <= t) {
      const event = sortedTargets[targetIdx];
      if (event.type === "stop") {
        currentTarget = 0;
        isStopped = true;
      } else {
        currentTarget = event.targetConcentration;
        isStopped = false;
      }
      targetIdx++;
    }

    let rate = 0;
    if (!isStopped && currentTarget > 0) {
      const currentCp = computeCp(state);
      if (currentCp < currentTarget) {
        // UDF approach: predict Cp with unit rate vs zero rate, scale linearly
        const testState = advanceState(solver, state, 1.0, dtSeconds);
        const testCp = computeCp(testState);
        const zeroState = advanceState(solver, state, 0, dtSeconds);
        const zeroCp = computeCp(zeroState);
        const deltaPerUnit = testCp - zeroCp;
        if (deltaPerUnit > 0) {
          rate = Math.max(0, (currentTarget - zeroCp) / deltaPerUnit);
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
