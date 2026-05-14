import type { DomainBand } from "./perioperativeRisk";

export interface PulmonaryInputs {
  hasCopd: boolean;
  isCurrentSmoker: boolean;
  age: number;
  plannedDurationMinutes: number;
}

export interface PulmonaryResult {
  band: DomainBand;
  source: "Viali pulmonary v1";
}

export function calculateVialiPulmonaryV1(i: PulmonaryInputs): PulmonaryResult {
  if (i.hasCopd) return { band: "high", source: "Viali pulmonary v1" };
  if (i.isCurrentSmoker && (i.age >= 70 || i.plannedDurationMinutes > 180)) {
    return { band: "med", source: "Viali pulmonary v1" };
  }
  return { band: "low", source: "Viali pulmonary v1" };
}
