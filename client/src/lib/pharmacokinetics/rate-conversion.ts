// client/src/lib/pharmacokinetics/rate-conversion.ts
//
// Converts rate-based infusion units (mg/kg/h, μg/kg/min, ml/h, etc.)
// to mass-per-minute for the PK engine.
//
// Propofol engine expects: mg/min
// Remifentanil engine expects: μg/min

export type SupportedRateUnit =
  | "mg/kg/h"
  | "mg/kg/min"
  | "mg/h"
  | "mg/min"
  | "μg/kg/min"
  | "μg/kg/h"
  | "μg/min"
  | "μg/h"
  | "ml/h"
  | "ml/min";

/**
 * Parse drug content string like "200 mg", "200mg", "1 g", "5000 μg" etc.
 * Returns value in mg.
 */
export function parseDrugContent(content: string): number | null {
  const match = content.trim().match(/^([\d.,]+)\s*(mg|g|μg|mcg|ug)$/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(",", "."));
  if (isNaN(value) || value <= 0) return null;

  const unit = match[2].toLowerCase();
  if (unit === "g") return value * 1000;
  if (unit === "μg" || unit === "mcg" || unit === "ug") return value / 1000;
  return value; // mg
}

/**
 * Parse ampule total content + syringe volume → concentration in mg/ml.
 * Example: "200 mg" + 20ml syringe → 10 mg/ml
 */
export function parseDrugConcentration(
  ampuleTotalContent: string | null | undefined,
  syringeVolumeMl: number,
): number | null {
  if (!ampuleTotalContent || syringeVolumeMl <= 0) return null;
  const contentMg = parseDrugContent(ampuleTotalContent);
  if (contentMg === null) return null;
  return contentMg / syringeVolumeMl;
}

/**
 * Convert an infusion rate to mass/min for the PK engine.
 *
 * @param rate - Numeric rate value (from the infusion segment)
 * @param rateUnit - Unit string (e.g. "mg/kg/h", "μg/kg/min", "ml/h")
 * @param drug - "propofol" or "remifentanil" (determines output unit)
 * @param weightKg - Patient weight in kg (required for /kg units)
 * @param concentrationMgPerMl - Drug concentration in mg/ml (required for ml/h, ml/min)
 * @returns rate in mg/min (propofol) or μg/min (remifentanil), or null if conversion fails
 */
export function convertToMassPerMin(
  rate: number,
  rateUnit: string,
  drug: "propofol" | "remifentanil",
  weightKg: number,
  concentrationMgPerMl: number | null,
): number | null {
  if (rate <= 0 || weightKg <= 0) return null;

  // Normalize unicode μ variations
  const unit = rateUnit
    .replace(/µ/g, "μ")
    .replace(/ug/gi, "μg")
    .replace(/mcg/gi, "μg")
    .trim();

  // Step 1: Convert to mg/min regardless of drug
  let mgPerMin: number | null = null;

  switch (unit) {
    case "mg/kg/h":
      mgPerMin = (rate * weightKg) / 60;
      break;
    case "mg/kg/min":
      mgPerMin = rate * weightKg;
      break;
    case "mg/h":
      mgPerMin = rate / 60;
      break;
    case "mg/min":
      mgPerMin = rate;
      break;
    case "μg/kg/min":
      mgPerMin = (rate * weightKg) / 1000;
      break;
    case "μg/kg/h":
      mgPerMin = (rate * weightKg) / 1000 / 60;
      break;
    case "μg/min":
      mgPerMin = rate / 1000;
      break;
    case "μg/h":
      mgPerMin = rate / 1000 / 60;
      break;
    case "ml/h":
      if (concentrationMgPerMl === null) return null;
      mgPerMin = (rate * concentrationMgPerMl) / 60;
      break;
    case "ml/min":
      if (concentrationMgPerMl === null) return null;
      mgPerMin = rate * concentrationMgPerMl;
      break;
    default:
      return null;
  }

  if (mgPerMin === null || mgPerMin <= 0) return null;

  // Step 2: Convert to engine unit
  if (drug === "propofol") {
    // Engine expects mg/min
    return mgPerMin;
  } else {
    // Engine expects μg/min
    return mgPerMin * 1000;
  }
}

// ── Bolus helpers ────────────────────────────────────────

/**
 * Derive the bolus unit from the rate unit's mass component.
 * mg/kg/h → mg, μg/kg/min → μg, ml/h → ml
 */
export function deriveBolusUnit(rateUnit: string | null | undefined, fallback?: string | null): string {
  if (!rateUnit) return fallback || "ml";
  const normalized = rateUnit
    .replace(/µ/g, "μ")
    .replace(/ug/gi, "μg")
    .replace(/mcg/gi, "μg");
  const match = normalized.match(/^(mg|μg|g|ml)/i);
  if (match) return match[1];
  return fallback || "ml";
}

/** Duration to model a bolus push (aligns with CPT_INTERVAL_S = 10s) */
const BOLUS_DURATION_MS = 10_000;

export { BOLUS_DURATION_MS };

/**
 * Convert a bolus dose to an equivalent short high-rate infusion segment.
 * A bolus of X mg over 10 seconds = X * 6 mg/min for 10 seconds.
 */
export function convertBolusToSegment(
  bolusValue: number,
  bolusUnit: string,
  drug: "propofol" | "remifentanil",
  concentrationMgPerMl: number | null,
  timestamp: number,
): { startTime: number; endTime: number; rateMassPerMin: number } | null {
  if (bolusValue <= 0) return null;

  // Convert bolus to mg
  const unit = bolusUnit
    .replace(/µ/g, "μ")
    .replace(/ug/gi, "μg")
    .replace(/mcg/gi, "μg")
    .toLowerCase();

  let bolusMg: number;
  if (unit === "mg") bolusMg = bolusValue;
  else if (unit === "μg") bolusMg = bolusValue / 1000;
  else if (unit === "g") bolusMg = bolusValue * 1000;
  else if (unit === "ml") {
    if (!concentrationMgPerMl) return null;
    bolusMg = bolusValue * concentrationMgPerMl;
  } else return null;

  const durationMin = BOLUS_DURATION_MS / 60_000;
  const mgPerMin = bolusMg / durationMin;

  // Convert to engine unit
  const engineRate = drug === "propofol" ? mgPerMin : mgPerMin * 1000;

  return {
    startTime: timestamp,
    endTime: timestamp + BOLUS_DURATION_MS,
    rateMassPerMin: engineRate,
  };
}
