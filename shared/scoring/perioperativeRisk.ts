export type RiskGrade = "green" | "orange" | "red";
export type DomainBand = "low" | "med" | "high";
export type DomainKey = "cardiac" | "vte" | "pulmonary" | "frailty" | "surgery";

export interface DomainResult {
  band: DomainBand;
  score?: number;
  source: string;
  partial?: boolean;
}

export interface PerioperativeRiskResult {
  domains: Record<DomainKey, DomainResult>;
  worstDomain: DomainKey;
  ageModifier: 0 | 1;
  grade: RiskGrade;
  drivers: string[];
  partial: boolean;
  calculatedAt: string;
}

import type { RcriResult, CapriniResult, SurgeryRiskClass } from "./types";

export type { SurgeryRiskClass } from "./types";

export function cardiacBandFromRcri(category: RcriResult["category"]): DomainBand {
  if (category === "high") return "high";
  if (category === "moderate") return "med";
  return "low";
}

export function vteBandFromCaprini(category: CapriniResult["category"]): DomainBand {
  if (category === "high" || category === "veryHigh") return "high";
  if (category === "higher") return "med";
  return "low";
}

export function surgeryBandFromRiskClass(rc: SurgeryRiskClass): DomainBand {
  if (rc === "critical") return "high";
  if (rc === "standard" || rc === "large") return "med";
  return "low";
}
