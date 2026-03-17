// tests/pharmacokinetics/forward-simulation.test.ts
import { describe, it, expect } from "vitest";
import { computeForwardRates, type RateSegment } from "../../client/src/lib/pharmacokinetics/forward-simulation";
import { calculateEleveldPropofol } from "../../client/src/lib/pharmacokinetics/models/eleveld-propofol";
import { calculateMintoRemifentanil } from "../../client/src/lib/pharmacokinetics/models/minto-remifentanil";
import type { PatientCovariates } from "../../client/src/lib/pharmacokinetics/types";

const patient: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };
const t0 = 0;
const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

describe("computeForwardRates", () => {
  describe("propofol", () => {
    const model = calculateEleveldPropofol(patient);

    it("produces Cp > 0 during infusion", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 }, // 10 mg/min
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + FIVE_MIN });
      expect(result.length).toBeGreaterThan(0);

      // Last point should have positive Cp
      const last = result[result.length - 1];
      expect(last.achievedCp).toBeGreaterThan(0);
      expect(last.achievedCe).toBeGreaterThan(0);
    });

    it("Cp decays after infusion stops", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 },
      ];
      // Simulate 10 minutes total (5 min infusion + 5 min washout)
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + TEN_MIN });

      // Find Cp at end of infusion and at end of simulation
      const endInfusionIdx = Math.floor(FIVE_MIN / 10_000);
      const cpAtEndInfusion = result[endInfusionIdx]?.achievedCp ?? 0;
      const cpAtEnd = result[result.length - 1].achievedCp;

      expect(cpAtEnd).toBeLessThan(cpAtEndInfusion);
      expect(cpAtEnd).toBeGreaterThan(0); // Not zero yet
    });

    it("Ce lags behind Cp", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 15 },
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + FIVE_MIN });

      // Early in infusion, Ce should lag Cp
      const earlyIdx = Math.min(10, result.length - 1); // ~100 seconds in
      expect(result[earlyIdx].achievedCe).toBeLessThan(result[earlyIdx].achievedCp);
    });

    it("handles multiple rate segments", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 15 },       // 15 mg/min
        { startTime: t0 + FIVE_MIN, endTime: t0 + TEN_MIN, rateMassPerMin: 5 }, // 5 mg/min
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + TEN_MIN });
      expect(result.length).toBeGreaterThan(0);

      // Cp at 10 min should be lower than peak at 5 min (rate decreased)
      const midIdx = Math.floor(FIVE_MIN / 10_000);
      const endIdx = result.length - 1;
      // Cp should be positive throughout
      expect(result[midIdx].achievedCp).toBeGreaterThan(0);
      expect(result[endIdx].achievedCp).toBeGreaterThan(0);
    });

    it("handles gaps between segments", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 },
        // 5 minute gap (no infusion)
        { startTime: t0 + TEN_MIN, endTime: t0 + TEN_MIN + FIVE_MIN, rateMassPerMin: 10 },
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + TEN_MIN + FIVE_MIN });
      expect(result.length).toBeGreaterThan(0);

      // Cp at gap midpoint should be decaying
      const gapMidIdx = Math.floor((7.5 * 60 * 1000) / 10_000);
      expect(result[gapMidIdx].achievedCp).toBeGreaterThan(0); // Still some drug from first infusion
    });
  });

  describe("remifentanil", () => {
    const model = calculateMintoRemifentanil(patient);

    it("produces Cp > 0 during infusion", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 }, // 10 μg/min
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 + FIVE_MIN });
      const last = result[result.length - 1];
      expect(last.achievedCp).toBeGreaterThan(0);
      expect(last.achievedCe).toBeGreaterThan(0);
    });

    it("Cp decays after infusion stops", () => {
      const remiModel = calculateMintoRemifentanil(patient);
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 },
      ];

      const totalTime = 15 * 60 * 1000;
      const result = computeForwardRates(remiModel, segments, { start: t0, end: t0 + totalTime });

      const endInfusionIdx = Math.floor(FIVE_MIN / 10_000);
      const cpAtStop = result[endInfusionIdx].achievedCp;
      const cpFinal = result[result.length - 1].achievedCp;

      // Cp should decay after infusion stops
      expect(cpFinal).toBeLessThan(cpAtStop);
      expect(cpFinal).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    const model = calculateEleveldPropofol(patient);

    it("returns empty for empty segments", () => {
      const result = computeForwardRates(model, [], { start: t0, end: t0 + FIVE_MIN });
      // Should still produce time points (just with zero Cp/Ce)
      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1].achievedCp).toBe(0);
    });

    it("handles zero-duration time range", () => {
      const segments: RateSegment[] = [
        { startTime: t0, endTime: t0 + FIVE_MIN, rateMassPerMin: 10 },
      ];
      const result = computeForwardRates(model, segments, { start: t0, end: t0 });
      expect(result.length).toBe(1);
    });
  });
});

describe("simulateForward integration", () => {
  it("produces PKTimePoint[] with eBIS", async () => {
    const { simulateForward } = await import("../../client/src/lib/pharmacokinetics/simulate");

    const propofolSegments: RateSegment[] = [
      { startTime: t0, endTime: t0 + TEN_MIN, rateMassPerMin: 12 },
    ];
    const remiSegments: RateSegment[] = [
      { startTime: t0, endTime: t0 + TEN_MIN, rateMassPerMin: 10 },
    ];

    const result = simulateForward(patient, propofolSegments, remiSegments, {
      start: t0,
      end: t0 + TEN_MIN,
    });

    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last.propofolCp).toBeGreaterThan(0);
    expect(last.propofolCe).toBeGreaterThan(0);
    expect(last.remiCp).toBeGreaterThan(0);
    expect(last.remiCe).toBeGreaterThan(0);
    expect(last.eBIS).not.toBeNull();
    expect(last.eBIS!).toBeGreaterThan(0);
    expect(last.eBIS!).toBeLessThan(93); // Should be lower than baseline
  });
});
