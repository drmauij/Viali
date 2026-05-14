import { describe, it, expect } from "vitest";
import { calculateMfi5 } from "../mfi5";

describe("mFI-5", () => {
  it("0 factors → low", () => {
    const r = calculateMfi5({ hasDiabetes: false, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("low");
    expect(r.score).toBe(0);
    expect(r.partial).toBe(false);
  });

  it("1 factor → med", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("med");
    expect(r.score).toBe(1);
  });

  it("3+ factors → high", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: true, hasChf: true, hasHypertensionRequiringMeds: false, functionallyDependent: false });
    expect(r.band).toBe("high");
    expect(r.score).toBe(3);
  });

  it("does NOT flag partial when functionallyDependent is null (treated as not-dependent)", () => {
    const r = calculateMfi5({ hasDiabetes: false, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: null });
    expect(r.partial).toBe(false);
    expect(r.band).toBe("low");
  });

  it("partial=false when functionallyDependent is provided", () => {
    const r = calculateMfi5({ hasDiabetes: true, hasCopd: false, hasChf: false, hasHypertensionRequiringMeds: false, functionallyDependent: true });
    expect(r.partial).toBe(false);
    expect(r.score).toBe(2);
  });
});
