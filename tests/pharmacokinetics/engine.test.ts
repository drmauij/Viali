// tests/pharmacokinetics/engine.test.ts
import { describe, it, expect } from "vitest";
import {
  initSolverState,
  advanceState,
  computeCp,
  computeCe,
  INITIAL_EIGEN_STATE,
} from "../../client/src/lib/pharmacokinetics/engine";
import type { PKModelParameters } from "../../client/src/lib/pharmacokinetics/types";

const testModel: PKModelParameters = {
  v1: 5, v2: 20, v3: 200,
  cl1: 1, cl2: 1.5, cl3: 0.5,
  ke0: 0.5,
  k10: 0.2, k12: 0.3, k21: 0.075, k13: 0.1, k31: 0.0025,
};

describe("Three-Compartment Solver", () => {
  describe("initSolverState", () => {
    it("precomputes eigenvalues and coefficients from model parameters", () => {
      const solver = initSolverState(testModel);
      expect(solver.lambdas).toHaveLength(3);
      solver.lambdas.forEach(l => expect(l).toBeGreaterThan(0));
      // Plasma coefficients should sum to 1 (unit impulse normalization)
      const coeffSum = solver.pCoeffs[0] + solver.pCoeffs[1] + solver.pCoeffs[2];
      expect(coeffSum).toBeCloseTo(1, 4);
    });
  });

  describe("advanceState", () => {
    it("maintains zero state with zero infusion rate", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 0, 10);
      expect(computeCp(state)).toBeCloseTo(0, 8);
      expect(computeCe(state)).toBeCloseTo(0, 8);
    });

    it("increases plasma concentration with positive infusion", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 100, 10);
      expect(computeCp(state)).toBeGreaterThan(0);
    });

    it("concentration decays after infusion stops", () => {
      const solver = initSolverState(testModel);
      const during = advanceState(solver, INITIAL_EIGEN_STATE, 100, 60);
      const after = advanceState(solver, during, 0, 60);
      expect(computeCp(after)).toBeLessThan(computeCp(during));
    });

    it("effect-site concentration lags behind plasma", () => {
      const solver = initSolverState(testModel);
      const state = advanceState(solver, INITIAL_EIGEN_STATE, 100, 10);
      expect(computeCp(state)).toBeGreaterThan(computeCe(state));
    });

    it("effect-site eventually approaches plasma at steady state", () => {
      const solver = initSolverState(testModel);
      let state = INITIAL_EIGEN_STATE;
      for (let i = 0; i < 100; i++) {
        state = advanceState(solver, state, 100, 60);
      }
      const cp = computeCp(state);
      const ce = computeCe(state);
      expect(Math.abs(cp - ce) / cp).toBeLessThan(0.1);
    });

    it("is numerically stable over long simulations (8+ hours)", () => {
      const solver = initSolverState(testModel);
      let state = INITIAL_EIGEN_STATE;
      for (let i = 0; i < 2880; i++) {
        state = advanceState(solver, state, 50, 10);
      }
      const cp = computeCp(state);
      expect(cp).toBeGreaterThan(0);
      expect(Number.isFinite(cp)).toBe(true);
    });
  });
});
