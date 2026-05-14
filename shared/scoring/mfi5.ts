import type { DomainBand } from "./perioperativeRisk";

export interface Mfi5Inputs {
  hasDiabetes: boolean;
  hasCopd: boolean;
  hasChf: boolean;
  hasHypertensionRequiringMeds: boolean;
  functionallyDependent: boolean | null;
}

export interface Mfi5Result {
  band: DomainBand;
  score: number;
  partial: boolean;
  source: "mFI-5";
}

export function calculateMfi5(i: Mfi5Inputs): Mfi5Result {
  const flags = [
    i.hasDiabetes,
    i.hasCopd,
    i.hasChf,
    i.hasHypertensionRequiringMeds,
    i.functionallyDependent === true,
  ];
  const score = flags.filter(Boolean).length;
  const band: DomainBand = score >= 3 ? "high" : score >= 1 ? "med" : "low";
  return {
    band,
    score,
    partial: false,
    source: "mFI-5",
  };
}
