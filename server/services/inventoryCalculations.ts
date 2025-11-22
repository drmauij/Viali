interface MedicationRecord {
  type: string;
  dose?: string | null;
  rate?: string | null;
  timestamp: Date | string;
  endTimestamp?: Date | string | null;
  itemId: string;
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
  const weightBasedPattern = /(µg|ug|mcg|mg)\/kg\/(min|h|hr)/;
  const weightMatch = working.match(weightBasedPattern);
  if (weightMatch) {
    return weightMatch[0]; // Return the normalized weight-based unit
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

export function calculateRateControlledAmpules(
  rate: string | null | undefined,
  rateUnit: string | null | undefined,
  startTime: Date | string,
  endTime: Date | string | null | undefined,
  ampuleTotalContent: string | null | undefined,
  patientWeight?: number
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
  
  let totalVolume = 0;
  
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    totalVolume = rateValue * durationHours;
  } else if (rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min') || rateUnitLower.includes('mcg/kg/min')) {
    const durationMinutes = durationHours * 60;
    const totalMicrograms = rateValue * (patientWeight || 70) * durationMinutes;
    const totalMilligrams = totalMicrograms / 1000;
    totalVolume = totalMilligrams;
  } else if (rateUnitLower.includes('µg/kg/h') || rateUnitLower.includes('ug/kg/h') || rateUnitLower.includes('mcg/kg/h') || rateUnitLower.includes('µg/kg/hr') || rateUnitLower.includes('ug/kg/hr') || rateUnitLower.includes('mcg/kg/hr')) {
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
  } else if (rateUnitLower.includes('mg/h') || rateUnitLower.includes('mg/hr')) {
    totalVolume = rateValue * durationHours;
  } else {
    totalVolume = rateValue * durationHours;
  }
  
  const ampuleValue = parseNumericValue(ampuleTotalContent);
  if (ampuleValue === 0) return 0;
  
  return Math.ceil(totalVolume / ampuleValue);
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
      patientWeight
    );
  }
  
  return 0;
}
