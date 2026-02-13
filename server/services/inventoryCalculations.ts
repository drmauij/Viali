import logger from "../logger";
interface MedicationRecord {
  type: string;
  dose?: string | null;
  rate?: string | null;
  timestamp: Date | string;
  endTimestamp?: Date | string | null;
  itemId: string;
  initialBolus?: string | null;
}

interface MedicationItem {
  id: string;
  rateUnit?: string | null;
  ampuleTotalContent?: string | null;
  administrationUnit?: string | null;
}

function parseNumericValue(value: string | null | undefined): number {
  if (!value) return 0;
  const match = value.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function parseUnit(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/[a-zA-Zμ°]+/g);
  return match ? match.join('') : '';
}

// Centralized normalization for rate units
// Handles localized formats (English/German), spacing variations, and "per"/"pro" synonyms
// Extracts and normalizes recognized rate unit patterns while preserving or ignoring other text
export function normalizeRateUnit(rateUnit: string | null | undefined): string {
  if (!rateUnit) return '';
  
  // Normalize to lowercase for pattern matching
  let working = rateUnit.toLowerCase().trim();
  
  // CRITICAL FIX: Normalize both Unicode variants of micro symbol
  // μ (U+03BC Greek mu) and µ (U+00B5 micro sign) → both to 'μ' for consistency
  working = working.replace(/\u00B5/g, '\u03BC'); // Convert µ → μ
  
  // Step 1: Replace time unit words with standard abbreviations
  // German: Minute(n) → min, Stunde(n) → h
  working = working.replace(/\bminute(n)?\b/gi, 'min');
  working = working.replace(/\bstunde(n)?\b/gi, 'h');
  // English: hour(s) → h
  working = working.replace(/\bhour(s)?\b/gi, 'h');
  
  // Step 2: Replace "per"/"pro" with "/" when between unit tokens
  // Unit tokens: ml, µg, ug, mcg, mg, g, kg, min, h, hr
  // Examples:
  //   "µg/kg per min" → "µg/kg/min"
  //   "µg/kg pro min" → "µg/kg/min" (after Minute→min)
  //   "mg / kg PRO h" → "mg/kg/h" (after Stunde→h)
  const perProPattern = /\b(ml|µg|ug|mcg|mg|g|kg|min|h|hr)\s+(per|pro)\s+(ml|µg|ug|mcg|mg|g|kg|min|h|hr)\b/gi;
  working = working.replace(perProPattern, '$1/$3');
  
  // Step 3: Clean up whitespace around slashes and within the unit pattern
  working = working.replace(/\s*\/\s*/g, '/');
  
  // Step 4: Extract the recognized rate unit pattern
  // This handles common patterns and strips any extra descriptive text
  // Patterns:
  //   - Simple volume rates: ml/h, ml/hr, ml/min
  //   - Weight-based rates: µg/kg/min, µg/kg/h, mg/kg/min, mg/kg/h, etc.
  //   - With or without whitespace (already normalized to no spaces)
  
  // Try to match weight-based patterns first (more specific)
  // Now includes both μ and µ for safety
  const weightBasedPattern = /(μg|µg|ug|mcg|mg)\/kg\/(min|h|hr)/;
  const weightMatch = working.match(weightBasedPattern);
  if (weightMatch) {
    return weightMatch[0]; // Return the normalized weight-based unit
  }
  
  // Try to match absolute dosing patterns (without /kg)
  const absolutePattern = /(μg|µg|ug|mcg|mg)\/(min|h|hr)/;
  const absoluteMatch = working.match(absolutePattern);
  if (absoluteMatch) {
    return absoluteMatch[0]; // Return the normalized absolute dosing unit
  }
  
  // Try to match simple volume rate patterns
  const volumePattern = /ml\/(h|hr|min)/;
  const volumeMatch = working.match(volumePattern);
  if (volumeMatch) {
    return volumeMatch[0]; // Return the normalized volume unit
  }
  
  // If no recognized pattern, return the cleaned working string
  // Remove all remaining whitespace as a fallback
  return working.replace(/\s+/g, '');
}

export function calculateBolusAmpules(
  dose: string | null | undefined,
  ampuleTotalContent: string | null | undefined
): number {
  const doseValue = parseNumericValue(dose);
  const ampuleValue = parseNumericValue(ampuleTotalContent);
  
  if (doseValue === 0 || ampuleValue === 0) return 0;
  
  return Math.ceil(doseValue / ampuleValue);
}

export function calculateFreeFlowAmpules(): number {
  return 1;
}

// Calculate raw volume in mg for a rate-controlled segment (without rounding)
// This should be used when summing multiple segments before applying Math.ceil
export function calculateRateControlledVolume(
  rate: string | null | undefined,
  rateUnit: string | null | undefined,
  startTime: Date | string,
  endTime: Date | string | null | undefined,
  patientWeight?: number
): number {
  const rateValue = parseNumericValue(rate);
  if (rateValue === 0) return 0;
  
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const durationHours = (end - start) / (1000 * 60 * 60);
  
  if (durationHours <= 0) return 0;
  
  const rateUnitLower = normalizeRateUnit(rateUnit);
  
  let totalVolume = 0;
  
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    totalVolume = rateValue * durationHours;
  } else if (rateUnitLower.includes('μg/kg/min') || rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min') || rateUnitLower.includes('mcg/kg/min')) {
    const durationMinutes = durationHours * 60;
    const weight = patientWeight || 70;
    const totalMicrograms = rateValue * weight * durationMinutes;
    totalVolume = totalMicrograms / 1000;
  } else if (rateUnitLower.includes('μg/kg/h') || rateUnitLower.includes('μg/kg/hr') || rateUnitLower.includes('µg/kg/h') || rateUnitLower.includes('ug/kg/h') || rateUnitLower.includes('mcg/kg/h') || rateUnitLower.includes('µg/kg/hr') || rateUnitLower.includes('ug/kg/hr') || rateUnitLower.includes('mcg/kg/hr')) {
    const totalMicrograms = rateValue * (patientWeight || 70) * durationHours;
    totalVolume = totalMicrograms / 1000;
  } else if (rateUnitLower.includes('mg/kg/min')) {
    const durationMinutes = durationHours * 60;
    totalVolume = rateValue * (patientWeight || 70) * durationMinutes;
  } else if (rateUnitLower.includes('mg/kg/h') || rateUnitLower.includes('mg/kg/hr')) {
    totalVolume = rateValue * (patientWeight || 70) * durationHours;
  } else if (rateUnitLower.includes('μg/min') || rateUnitLower.includes('µg/min') || rateUnitLower.includes('ug/min') || rateUnitLower.includes('mcg/min')) {
    const durationMinutes = durationHours * 60;
    const totalMicrograms = rateValue * durationMinutes;
    totalVolume = totalMicrograms / 1000;
  } else if (rateUnitLower.includes('mg/min')) {
    const durationMinutes = durationHours * 60;
    totalVolume = rateValue * durationMinutes;
  } else if (rateUnitLower.includes('mg/h') || rateUnitLower.includes('mg/hr')) {
    totalVolume = rateValue * durationHours;
  } else {
    totalVolume = rateValue * durationHours;
  }
  
  return totalVolume;
}

// Convert raw volume to ampules (apply Math.ceil at the end)
export function volumeToAmpules(
  totalVolume: number,
  ampuleTotalContent: string | null | undefined
): number {
  const ampuleValue = parseNumericValue(ampuleTotalContent);
  if (ampuleValue === 0 || totalVolume === 0) return 0;
  return Math.ceil(totalVolume / ampuleValue);
}

export function calculateRateControlledAmpules(
  rate: string | null | undefined,
  rateUnit: string | null | undefined,
  startTime: Date | string,
  endTime: Date | string | null | undefined,
  ampuleTotalContent: string | null | undefined,
  patientWeight?: number,
  initialBolus?: string | null
): number {
  const rateValue = parseNumericValue(rate);
  if (rateValue === 0) return 0;
  
  const start = new Date(startTime).getTime();
  // If no endTime (running infusion), use current time for estimated usage
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const durationHours = (end - start) / (1000 * 60 * 60);
  
  if (durationHours <= 0) return 0;
  
  // Normalize rate unit to handle localized formats (e.g., "µg/kg per minute" → "µg/kg/min")
  const rateUnitLower = normalizeRateUnit(rateUnit);
  
  // Parse initial bolus if provided (assumed to be in the same unit as ampuleTotalContent)
  const initialBolusValue = parseNumericValue(initialBolus);
  
  logger.info('[CALC-DEBUG] Input values:', {
    rateValue,
    rateUnit,
    rateUnitLower,
    durationHours,
    ampuleTotalContent,
    patientWeight,
    initialBolus: initialBolusValue
  });
  
  let totalVolume = 0;
  
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    totalVolume = rateValue * durationHours;
  } else if (rateUnitLower.includes('μg/kg/min') || rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min') || rateUnitLower.includes('mcg/kg/min')) {
    const durationMinutes = durationHours * 60;
    const weight = patientWeight || 70;
    const totalMicrograms = rateValue * weight * durationMinutes;
    const totalMilligrams = totalMicrograms / 1000;
    totalVolume = totalMilligrams;
    logger.info('[CALC-DEBUG] μg/kg/min calculation:', {
      durationMinutes,
      weight,
      totalMicrograms,
      totalMilligrams
    });
  } else if (rateUnitLower.includes('μg/kg/h') || rateUnitLower.includes('μg/kg/hr') || rateUnitLower.includes('µg/kg/h') || rateUnitLower.includes('ug/kg/h') || rateUnitLower.includes('mcg/kg/h') || rateUnitLower.includes('µg/kg/hr') || rateUnitLower.includes('ug/kg/hr') || rateUnitLower.includes('mcg/kg/hr')) {
    const totalMicrograms = rateValue * (patientWeight || 70) * durationHours;
    const totalMilligrams = totalMicrograms / 1000;
    totalVolume = totalMilligrams;
  } else if (rateUnitLower.includes('mg/kg/min')) {
    const durationMinutes = durationHours * 60;
    const totalMilligrams = rateValue * (patientWeight || 70) * durationMinutes;
    totalVolume = totalMilligrams;
  } else if (rateUnitLower.includes('mg/kg/h') || rateUnitLower.includes('mg/kg/hr')) {
    const totalMilligrams = rateValue * (patientWeight || 70) * durationHours;
    totalVolume = totalMilligrams;
  } else if (rateUnitLower.includes('μg/min') || rateUnitLower.includes('µg/min') || rateUnitLower.includes('ug/min') || rateUnitLower.includes('mcg/min')) {
    // Absolute dosing: micrograms per minute (not weight-based)
    const durationMinutes = durationHours * 60;
    const totalMicrograms = rateValue * durationMinutes;
    const totalMilligrams = totalMicrograms / 1000;
    totalVolume = totalMilligrams;
    logger.info('[CALC-DEBUG] μg/min (absolute) calculation:', {
      durationMinutes,
      totalMicrograms,
      totalMilligrams
    });
  } else if (rateUnitLower.includes('mg/min')) {
    // Absolute dosing: milligrams per minute (not weight-based)
    const durationMinutes = durationHours * 60;
    const totalMilligrams = rateValue * durationMinutes;
    totalVolume = totalMilligrams;
    logger.info('[CALC-DEBUG] mg/min (absolute) calculation:', {
      durationMinutes,
      totalMilligrams
    });
  } else if (rateUnitLower.includes('mg/h') || rateUnitLower.includes('mg/hr')) {
    totalVolume = rateValue * durationHours;
  } else {
    totalVolume = rateValue * durationHours;
    logger.info('[CALC-DEBUG] Default calculation (unrecognized unit)');
  }
  
  // Add initial bolus to total volume (initial bolus is in same unit as ampuleTotalContent)
  const totalWithBolus = totalVolume + initialBolusValue;
  
  const ampuleValue = parseNumericValue(ampuleTotalContent);
  if (ampuleValue === 0) return 0;
  
  const result = Math.ceil(totalWithBolus / ampuleValue);
  logger.info('[CALC-DEBUG] Final calculation:', {
    totalVolume,
    initialBolusValue,
    totalWithBolus,
    ampuleValue,
    result
  });
  
  return result;
}

export function calculateDepletionTime(
  rate: string | null | undefined,
  rateUnit: string | null | undefined,
  ampuleTotalContent: string | null | undefined,
  patientWeight?: number,
  safetyBufferPercent: number = 5
): number | null {
  const rateValue = parseNumericValue(rate);
  const ampuleValue = parseNumericValue(ampuleTotalContent);
  
  if (rateValue === 0 || ampuleValue === 0) return null;
  
  // Normalize rate unit to handle localized formats (e.g., "µg/kg per minute" → "µg/kg/min")
  const rateUnitLower = normalizeRateUnit(rateUnit);
  
  let hoursToDepletion = 0;
  
  // Calculate hours to deplete based on rate unit
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    // Direct volume per hour
    hoursToDepletion = ampuleValue / rateValue;
  } else if (rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min') || rateUnitLower.includes('mcg/kg/min')) {
    // Convert µg/kg/min to total volume
    const weight = patientWeight || 70;
    const minutesToDepletion = (ampuleValue * 1000) / (rateValue * weight);
    hoursToDepletion = minutesToDepletion / 60;
  } else if (rateUnitLower.includes('µg/kg/h') || rateUnitLower.includes('ug/kg/h') || rateUnitLower.includes('mcg/kg/h') || rateUnitLower.includes('µg/kg/hr') || rateUnitLower.includes('ug/kg/hr') || rateUnitLower.includes('mcg/kg/hr')) {
    // Convert µg/kg/h to total volume
    const weight = patientWeight || 70;
    hoursToDepletion = (ampuleValue * 1000) / (rateValue * weight);
  } else if (rateUnitLower.includes('mg/kg/min')) {
    // Convert mg/kg/min to total volume
    const weight = patientWeight || 70;
    const minutesToDepletion = ampuleValue / (rateValue * weight);
    hoursToDepletion = minutesToDepletion / 60;
  } else if (rateUnitLower.includes('mg/kg/h') || rateUnitLower.includes('mg/kg/hr')) {
    // Convert mg/kg/h to total volume
    const weight = patientWeight || 70;
    hoursToDepletion = ampuleValue / (rateValue * weight);
  } else if (rateUnitLower.includes('μg/min') || rateUnitLower.includes('µg/min') || rateUnitLower.includes('ug/min') || rateUnitLower.includes('mcg/min')) {
    // Absolute dosing: micrograms per minute (not weight-based)
    const minutesToDepletion = (ampuleValue * 1000) / rateValue;
    hoursToDepletion = minutesToDepletion / 60;
  } else if (rateUnitLower.includes('mg/min')) {
    // Absolute dosing: milligrams per minute (not weight-based)
    const minutesToDepletion = ampuleValue / rateValue;
    hoursToDepletion = minutesToDepletion / 60;
  } else if (rateUnitLower.includes('mg/h') || rateUnitLower.includes('mg/hr')) {
    // Direct mg per hour
    hoursToDepletion = ampuleValue / rateValue;
  } else {
    // Default: assume rate is in same unit as ampule content
    hoursToDepletion = ampuleValue / rateValue;
  }
  
  if (hoursToDepletion <= 0) return null;
  
  // Apply safety buffer (stop at 95% depleted by default)
  const adjustedHours = hoursToDepletion * (1 - safetyBufferPercent / 100);
  
  // Return milliseconds
  return adjustedHours * 60 * 60 * 1000;
}

export function calculateInventoryForMedication(
  medication: MedicationRecord,
  item: MedicationItem,
  patientWeight?: number
): number {
  const isBolusItem = !item.rateUnit || item.rateUnit === null;
  const isFreeFlowItem = item.rateUnit === 'free';
  const isRateControlledItem = item.rateUnit && item.rateUnit !== 'free';
  
  if (medication.type === 'bolus' && isBolusItem) {
    return calculateBolusAmpules(medication.dose, item.ampuleTotalContent);
  }
  
  if (medication.type === 'infusion_start' && isFreeFlowItem) {
    return calculateFreeFlowAmpules();
  }
  
  if (medication.type === 'infusion_start' && isRateControlledItem) {
    return calculateRateControlledAmpules(
      medication.rate,
      item.rateUnit,
      medication.timestamp,
      medication.endTimestamp,
      item.ampuleTotalContent,
      patientWeight,
      medication.initialBolus
    );
  }
  
  return 0;
}
