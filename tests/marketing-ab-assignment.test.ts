import { describe, it, expect } from "vitest";
import { assignVariant } from "../server/services/marketingAbAssignment";

const variantA = { id: "var_A", label: "A", messageTemplate: "A text", flowId: "f1" } as any;
const variantB = { id: "var_B", label: "B", messageTemplate: "B text", flowId: "f1" } as any;
const variantC = { id: "var_C", label: "C", messageTemplate: "C text", flowId: "f1" } as any;

describe("assignVariant", () => {
  it("returns first variant and sendNow=true when abTestEnabled is false", () => {
    const flow = { id: "f1", abTestEnabled: false, abHoldoutPctPerArm: 10 } as any;
    const res = assignVariant("pat_1", flow, [variantA]);
    expect(res).toEqual({ variant: variantA, sendNow: true });
  });

  it("distributes a sample of 100 patients roughly per split (2 arms, 10% each)", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    let countA = 0, countB = 0, countHoldout = 0;
    for (let i = 0; i < 100; i++) {
      const res = assignVariant(`pat_${i}`, flow, [variantA, variantB]);
      if (!res.sendNow) countHoldout++;
      else if (res.variant?.id === "var_A") countA++;
      else countB++;
    }
    expect(countA).toBeGreaterThanOrEqual(6);
    expect(countA).toBeLessThanOrEqual(14);
    expect(countB).toBeGreaterThanOrEqual(6);
    expect(countB).toBeLessThanOrEqual(14);
    expect(countHoldout).toBeGreaterThanOrEqual(76);
    expect(countHoldout).toBeLessThanOrEqual(86);
  });

  it("is deterministic: same patient + flow always assigned to same variant", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    const first = assignVariant("pat_99", flow, [variantA, variantB]);
    const second = assignVariant("pat_99", flow, [variantA, variantB]);
    expect(second).toEqual(first);
  });

  it("supports 3 variants (A/B/C) at 10% each, 70% holdout", () => {
    const flow = { id: "f1", abTestEnabled: true, abHoldoutPctPerArm: 10 } as any;
    let counts: Record<string, number> = { A: 0, B: 0, C: 0, hold: 0 };
    for (let i = 0; i < 100; i++) {
      const res = assignVariant(`pat_${i}`, flow, [variantA, variantB, variantC]);
      if (!res.sendNow) counts.hold++;
      else counts[res.variant!.label]++;
    }
    expect(counts.A + counts.B + counts.C + counts.hold).toBe(100);
    expect(counts.hold).toBeGreaterThan(60);
  });
});
