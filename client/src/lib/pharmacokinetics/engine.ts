// client/src/lib/pharmacokinetics/engine.ts
//
// Three-compartment analytical solver using eigenvalue decomposition.
// This is the standard STANPUMP approach: the 3-compartment system is
// decomposed into independent eigenvalue components that each evolve
// via a simple exponential decay + constant-rate infusion formula.

import type { PKModelParameters } from "./types";

// ── Types ────────────────────────────────────────────────

/** State tracked per-eigenvalue component (NOT per-compartment) */
export interface EigenState {
  /** Plasma eigenvalue components (3 roots of cubic) */
  p: [number, number, number];
  /** Effect-site eigenvalue components (3 plasma + ke0) */
  e: [number, number, number, number];
}

/** Precomputed solver coefficients derived from model parameters */
export interface SolverState {
  model: PKModelParameters;
  /** Eigenvalues of the compartment transition matrix (all positive) */
  lambdas: [number, number, number];
  /** Plasma coefficients A_i: weight of each eigenvalue in Cp */
  pCoeffs: [number, number, number];
  /** Effect-site coefficients B_j */
  eCoeffs: [number, number, number, number];
  /** Effect-site lambdas [λ1, λ2, λ3, ke0] */
  eLambdas: [number, number, number, number];
}

/** Zero initial state */
export const INITIAL_EIGEN_STATE: EigenState = {
  p: [0, 0, 0],
  e: [0, 0, 0, 0],
};

// ── Cubic solver ─────────────────────────────────────────

/**
 * Solve the cubic characteristic polynomial for eigenvalues.
 *
 * The characteristic polynomial of the 3-compartment system is:
 *   λ³ - a·λ² + b·λ - c = 0
 *
 * where:
 *   a = k10 + k12 + k21 + k13 + k31
 *   b = k10·k21 + k10·k31 + k12·k31 + k21·k13 + k21·k31
 *   c = k10·k21·k31
 *
 * All three roots are real and positive for valid PK parameters.
 * Uses the trigonometric method for three real roots.
 *
 * Returns eigenvalues sorted in descending order (λ1 > λ2 > λ3).
 */
function solveCubicRoots(
  k10: number,
  k12: number,
  k21: number,
  k13: number,
  k31: number,
): [number, number, number] {
  const a = k10 + k12 + k21 + k13 + k31;
  const b = k10 * k21 + k10 * k31 + k12 * k31 + k21 * k13 + k21 * k31;
  const c = k10 * k21 * k31;

  // Convert to depressed cubic: t³ + Pt + Q = 0, where λ = t + a/3
  // From λ³ - aλ² + bλ - c = 0, substituting λ = t + a/3:
  //   P = b - a²/3
  //   Q = -2a³/27 + ab/3 - c
  const a3 = a / 3;
  const P = b - (a * a) / 3;
  const Q = -2 * a * a * a / 27 + a * b / 3 - c;

  // Discriminant for three real roots: Q²/4 + P³/27 ≤ 0
  const disc = Q * Q / 4 + P * P * P / 27;

  if (disc > 1e-14) {
    // Should not happen for valid PK parameters, but handle gracefully.
    throw new Error(
      "Cubic discriminant positive — invalid PK model parameters (expected 3 real roots)",
    );
  }

  // Trigonometric solution for three real roots
  // t_k = 2√(-P/3) · cos(1/3 · arccos(3Q/(2P) · √(-3/P)) - 2πk/3)
  const m = 2 * Math.sqrt(-P / 3);
  const cosArg = Math.max(-1, Math.min(1, (3 * Q) / (2 * P) * Math.sqrt(-3 / P)));
  const theta = Math.acos(cosArg);

  const r1 = m * Math.cos(theta / 3) + a3;
  const r2 = m * Math.cos((theta - 2 * Math.PI) / 3) + a3;
  const r3 = m * Math.cos((theta - 4 * Math.PI) / 3) + a3;

  // Sort descending (λ1 > λ2 > λ3)
  const roots = [r1, r2, r3].sort((x, y) => y - x) as [number, number, number];

  return roots;
}

// ── Coefficient computation ──────────────────────────────

/**
 * Plasma coefficients: A_i = (k21 - λ_i)(k31 - λ_i) / Π_{j≠i}(λ_j - λ_i)
 *
 * These coefficients define the weight of each eigenvalue component in Cp.
 * They sum to 1 (unit impulse normalization).
 */
function computePlasmaCoeffs(
  lambdas: [number, number, number],
  k21: number,
  k31: number,
): [number, number, number] {
  const [l1, l2, l3] = lambdas;

  const a1 = ((k21 - l1) * (k31 - l1)) / ((l2 - l1) * (l3 - l1));
  const a2 = ((k21 - l2) * (k31 - l2)) / ((l1 - l2) * (l3 - l2));
  const a3 = ((k21 - l3) * (k31 - l3)) / ((l1 - l3) * (l2 - l3));

  return [a1, a2, a3];
}

/**
 * Effect-site coefficients.
 *
 * B_i = ke0 * A_i / (ke0 - λ_i)   for i = 1,2,3
 * B_4 = -(B_1 + B_2 + B_3)         ensures Ce(0) = 0
 * λ_4 = ke0
 */
function computeEffectCoeffs(
  lambdas: [number, number, number],
  pCoeffs: [number, number, number],
  ke0: number,
): { eCoeffs: [number, number, number, number]; eLambdas: [number, number, number, number] } {
  const b1 = (ke0 * pCoeffs[0]) / (ke0 - lambdas[0]);
  const b2 = (ke0 * pCoeffs[1]) / (ke0 - lambdas[1]);
  const b3 = (ke0 * pCoeffs[2]) / (ke0 - lambdas[2]);
  const b4 = -(b1 + b2 + b3);

  return {
    eCoeffs: [b1, b2, b3, b4],
    eLambdas: [lambdas[0], lambdas[1], lambdas[2], ke0],
  };
}

// ── Public API ───────────────────────────────────────────

/**
 * Precompute eigenvalues and coefficients from model parameters.
 * Call once per drug model; reuse the SolverState for all time steps.
 */
export function initSolverState(model: PKModelParameters): SolverState {
  const lambdas = solveCubicRoots(model.k10, model.k12, model.k21, model.k13, model.k31);
  const pCoeffs = computePlasmaCoeffs(lambdas, model.k21, model.k31);
  const { eCoeffs, eLambdas } = computeEffectCoeffs(lambdas, pCoeffs, model.ke0);

  return { model, lambdas, pCoeffs, eCoeffs, eLambdas };
}

/**
 * Advance the eigenvalue state by one time step.
 *
 * Each component evolves independently via the analytical formula:
 *   p_i(t+dt) = p_i(t) * exp(-λ_i * dt) + (rate/V1) * A_i * (1 - exp(-λ_i * dt)) / λ_i
 *
 * @param solver  - Precomputed solver state
 * @param state   - Current eigenvalue state
 * @param rate    - Infusion rate (mg/min for propofol, μg/min for remi — units consistent with model)
 * @param dtSeconds - Time step in seconds
 * @returns New eigenvalue state
 */
export function advanceState(
  solver: SolverState,
  state: EigenState,
  rate: number,
  dtSeconds: number,
): EigenState {
  const dt = dtSeconds / 60; // Convert seconds to minutes (rate constants are in min⁻¹)
  const rateOverV1 = rate / solver.model.v1;

  // Advance plasma eigenvalue components
  const newP: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const lambda = solver.lambdas[i];
    const decay = Math.exp(-lambda * dt);
    newP[i] =
      state.p[i] * decay +
      rateOverV1 * solver.pCoeffs[i] * (1 - decay) / lambda;
  }

  // Advance effect-site eigenvalue components
  const newE: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const lambda = solver.eLambdas[i];
    const decay = Math.exp(-lambda * dt);
    newE[i] =
      state.e[i] * decay +
      rateOverV1 * solver.eCoeffs[i] * (1 - decay) / lambda;
  }

  return { p: newP, e: newE };
}

/**
 * Compute plasma concentration from eigenvalue state.
 * Cp = Σ p_i, clamped to ≥ 0.
 */
export function computeCp(state: EigenState): number {
  return Math.max(0, state.p[0] + state.p[1] + state.p[2]);
}

/**
 * Compute effect-site concentration from eigenvalue state.
 * Ce = Σ e_j, clamped to ≥ 0.
 */
export function computeCe(state: EigenState): number {
  return Math.max(0, state.e[0] + state.e[1] + state.e[2] + state.e[3]);
}
