// tests/pharmacokinetics/tci-controller.test.ts
import { describe, it, expect } from "vitest";
import { computeTCIRates } from "../../client/src/lib/pharmacokinetics/tci-controller";
import { calculateEleveldPropofol } from "../../client/src/lib/pharmacokinetics/models/eleveld-propofol";
import type { TargetEvent } from "../../client/src/lib/pharmacokinetics/types";
import { CPT_INTERVAL_S } from "../../client/src/lib/pharmacokinetics/types";

describe("TCI Controller", () => {
  const model = calculateEleveldPropofol({ age: 40, weight: 70, height: 170, sex: "male" });
  const t0 = 0;

  it("produces high initial rate (bolus) to reach target", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 5 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    expect(rates[0].rate).toBeGreaterThan(rates[rates.length - 1].rate);
  });

  it("reaches target concentration within 2 minutes", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 5 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    const lastRate = rates[rates.length - 1];
    expect(lastRate.achievedCp).toBeGreaterThan(3.5);
    expect(lastRate.achievedCp).toBeLessThan(4.5);
  });

  it("reduces rate when target is lowered", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "rate_change", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 2.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    const afterChange = rates.find(r => r.timestamp > t0 + 5 * 60 * 1000);
    expect(afterChange!.rate).toBe(0);
  });

  it("stops infusion completely on stop event", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 4.0 },
      { type: "stop", timestamp: t0 + 5 * 60 * 1000, targetConcentration: 0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    const afterStop = rates.filter(r => r.timestamp > t0 + 5 * 60 * 1000);
    afterStop.forEach(r => expect(r.rate).toBe(0));
  });

  it("never produces negative infusion rates", () => {
    const targets: TargetEvent[] = [
      { type: "start", timestamp: t0, targetConcentration: 6.0 },
      { type: "rate_change", timestamp: t0 + 2 * 60 * 1000, targetConcentration: 1.0 },
    ];
    const rates = computeTCIRates(model, targets, { start: t0, end: t0 + 10 * 60 * 1000 }, CPT_INTERVAL_S * 1000);
    rates.forEach(r => expect(r.rate).toBeGreaterThanOrEqual(0));
  });
});
