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

import { calculateRcri } from "./rcri";
import { calculateCaprini } from "./caprini";
import { calculateVialiPulmonaryV1 } from "./pulmonary";
import { calculateMfi5 } from "./mfi5";

// Tiebreaker for worstDomain when multiple domains share the top band.
const DOMAIN_PRIORITY: DomainKey[] = ["cardiac", "vte", "pulmonary", "frailty", "surgery"];
const BAND_RANK: Record<DomainBand, number> = { low: 0, med: 1, high: 2 };

export interface PerioperativeRiskInputs {
  age: number;
  sex: "m" | "f";
  bmi: number | null;
  surgeryRiskClass: SurgeryRiskClass;
  plannedDurationMinutes: number;
  isCurrentSmoker: boolean;
  functionallyDependent: boolean | null;
  metAbove4: boolean | null;
  concepts: {
    CAD: boolean; CHF: boolean; STROKE_HISTORY: boolean; INSULIN_DIABETES: boolean;
    CKD_OR_DIALYSIS: boolean; COPD: boolean; HYPERTENSION: boolean; ACTIVE_CANCER: boolean;
    VTE_HISTORY: boolean; VARICOSE_VEINS: boolean; LEG_SWELLING: boolean;
    FAMILY_THROMBOPHILIA: boolean; OC_OR_HRT: boolean; PREGNANCY_OR_POSTPARTUM: boolean;
    RECENT_STROKE_30D: boolean; SPINAL_CORD_INJURY: boolean; KNOWN_UNTREATED_OSAS: boolean;
    PONV_HISTORY: boolean;
  };
}

export function calculatePerioperativeRisk(i: PerioperativeRiskInputs): PerioperativeRiskResult {
  const rcri = calculateRcri({
    surgeryRiskClass: i.surgeryRiskClass,
    hasCAD: i.concepts.CAD,
    hasCHF: i.concepts.CHF,
    hasCerebrovascularDisease: i.concepts.STROKE_HISTORY,
    isInsulinDependentDiabetic: i.concepts.INSULIN_DIABETES,
    creatinineMgDl: i.concepts.CKD_OR_DIALYSIS ? 2.5 : 1.0,
  });

  const caprini = calculateCaprini({
    ageYears: i.age,
    sex: i.sex === "m" ? "male" : "female",
    bmi: i.bmi ?? 25,
    surgeryRiskClass: i.surgeryRiskClass,
    plannedMinutes: i.plannedDurationMinutes,
    hasLegSwelling: i.concepts.LEG_SWELLING,
    hasVaricoseVeins: i.concepts.VARICOSE_VEINS,
    isPregnantOrPostpartum: i.concepts.PREGNANCY_OR_POSTPARTUM,
    onOcOrHrt: i.concepts.OC_OR_HRT,
    expectedBedrestOver72h: false,
    vteHistory: i.concepts.VTE_HISTORY,
    familyThrombophilia: i.concepts.FAMILY_THROMBOPHILIA,
    strokeWithin30Days: i.concepts.RECENT_STROKE_30D,
    hipOrLegFracture: false,
    spinalCordInjury: i.concepts.SPINAL_CORD_INJURY,
    activeCancer: i.concepts.ACTIVE_CANCER,
  });

  const pulm = calculateVialiPulmonaryV1({
    hasCopd: i.concepts.COPD,
    isCurrentSmoker: i.isCurrentSmoker,
    age: i.age,
    plannedDurationMinutes: i.plannedDurationMinutes,
  });

  const mfi = calculateMfi5({
    hasDiabetes: i.concepts.INSULIN_DIABETES,
    hasCopd: i.concepts.COPD,
    hasChf: i.concepts.CHF,
    hasHypertensionRequiringMeds: i.concepts.HYPERTENSION,
    functionallyDependent: i.functionallyDependent,
  });

  const cardiacBaseBand = cardiacBandFromRcri(rcri.category);
  const cardiacBumped = i.metAbove4 === false && cardiacBaseBand !== "high";
  const cardiacBand: DomainBand = cardiacBumped
    ? (cardiacBaseBand === "low" ? "med" : "high")
    : cardiacBaseBand;
  const cardiacSource = `RCRI ${rcri.score} pt${cardiacBumped ? " + MET<4" : ""}`;

  const domains: Record<DomainKey, DomainResult> = {
    cardiac:   { band: cardiacBand, score: rcri.score, source: cardiacSource },
    vte:       { band: vteBandFromCaprini(caprini.category), score: caprini.score, source: "Caprini" },
    pulmonary: { band: pulm.band, source: pulm.source },
    frailty:   { band: mfi.band, score: mfi.score, source: mfi.source, partial: mfi.partial },
    surgery:   { band: surgeryBandFromRiskClass(i.surgeryRiskClass), source: `surgeryRiskClass:${i.surgeryRiskClass}` },
  };

  // Worst-domain with tiebreaker.
  const topRank = Math.max(...Object.values(domains).map((d) => BAND_RANK[d.band]));
  const worstDomain = DOMAIN_PRIORITY.find((k) => BAND_RANK[domains[k].band] === topRank)!;

  // Aggregate grade.
  let grade: RiskGrade = topRank === 2 ? "red" : topRank === 1 ? "orange" : "green";

  // Age modifier — never bumps down, caps at red.
  const ageModifier: 0 | 1 = i.age >= 75 ? 1 : 0;
  if (ageModifier === 1) {
    if (grade === "green") grade = "orange";
    else if (grade === "orange") grade = "red";
  }

  // Drivers — sorted by band severity, max 3.
  const drivers = DOMAIN_PRIORITY
    .map((k) => ({ key: k, d: domains[k] }))
    .filter(({ d }) => d.band !== "low")
    .sort((a, b) => BAND_RANK[b.d.band] - BAND_RANK[a.d.band])
    .slice(0, 3)
    .map(({ key, d }) => driverLabel(key, d));

  return {
    domains,
    worstDomain,
    ageModifier,
    grade,
    drivers,
    partial: Object.values(domains).some((d) => d.partial === true) || i.metAbove4 === null,
    calculatedAt: new Date().toISOString(),
  };
}

function driverLabel(key: DomainKey, d: DomainResult): string {
  if (key === "cardiac")   return `Cardiac (RCRI ${d.score ?? "?"} pts, ${d.band})`;
  if (key === "vte")       return `VTE (Caprini ${d.score ?? "?"}, ${d.band})`;
  if (key === "pulmonary") return `Pulmonary (${d.band})`;
  if (key === "frailty")   return `mFI-5 = ${d.score ?? "?"}`;
  return `Surgery (${d.source.replace("surgeryRiskClass:", "")})`;
}
