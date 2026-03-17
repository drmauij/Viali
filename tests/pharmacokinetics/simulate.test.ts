// tests/pharmacokinetics/simulate.test.ts
import { describe, it, expect } from "vitest";
import { simulate } from "../../client/src/lib/pharmacokinetics/simulate";
import type { PatientCovariates, TargetEvent } from "../../client/src/lib/pharmacokinetics/types";

describe("simulate", () => {
  const patient: PatientCovariates = { age: 40, weight: 70, height: 170, sex: "male" };
  const t0 = 0;

  it("produces time points with propofol predictions only", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 5 * 60 * 1000 });
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last.propofolCp).not.toBeNull();
    expect(last.propofolCe).not.toBeNull();
    expect(last.eBIS).not.toBeNull();
    expect(last.eBIS!).toBeGreaterThan(0);
    expect(last.eBIS!).toBeLessThanOrEqual(100);
    expect(last.remiCp).toBeNull();
    expect(last.remiCe).toBeNull();
  });

  it("produces time points with both propofol and remi", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const remiTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, remiTargets, { start: t0, end: t0 + 5 * 60 * 1000 });
    const last = result[result.length - 1];
    expect(last.propofolCp).not.toBeNull();
    expect(last.remiCp).not.toBeNull();
    expect(last.eBIS).not.toBeNull();
  });

  it("propofol Cp reaches near target after 5 minutes", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 5 * 60 * 1000 });
    const last = result[result.length - 1];
    expect(last.propofolCp!).toBeGreaterThan(3.2);
    expect(last.propofolCp!).toBeLessThan(4.8);
  });

  it("handles target change mid-case", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "rate_change", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 3.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 15 * 60 * 1000 });
    const last = result[result.length - 1];
    expect(last.propofolCp!).toBeGreaterThan(2.4);
    expect(last.propofolCp!).toBeLessThan(3.6);
  });

  it("returns time points with all nulls when no targets", () => {
    const result = simulate(patient, [], [], { start: t0, end: t0 + 5 * 60 * 1000 });
    result.forEach(pt => {
      expect(pt.propofolCp).toBeNull();
      expect(pt.remiCp).toBeNull();
      expect(pt.eBIS).toBeNull();
    });
  });

  it("eBIS decreases as propofol Ce increases", () => {
    const propofolTargets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 5.0 },
    ];
    const result = simulate(patient, propofolTargets, [], { start: t0, end: t0 + 10 * 60 * 1000 });
    const early = result[2];
    const late = result[result.length - 1];
    expect(early.eBIS!).toBeGreaterThan(late.eBIS!);
  });
});
