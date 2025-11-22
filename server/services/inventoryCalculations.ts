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
  if (rateValue === 0 || !endTime) return 0;
  
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const durationHours = (end - start) / (1000 * 60 * 60);
  
  if (durationHours <= 0) return 0;
  
  let totalVolume = 0;
  const rateUnitLower = (rateUnit || '').toLowerCase();
  
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    totalVolume = rateValue * durationHours;
  } else if (rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min')) {
    const durationMinutes = durationHours * 60;
    const totalMicrograms = rateValue * (patientWeight || 70) * durationMinutes;
    const totalMilligrams = totalMicrograms / 1000;
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
  
  const rateUnitLower = (rateUnit || '').toLowerCase();
  let hoursToDepletion = 0;
  
  // Calculate hours to deplete based on rate unit
  if (rateUnitLower.includes('ml/h') || rateUnitLower.includes('ml/hr')) {
    // Direct volume per hour
    hoursToDepletion = ampuleValue / rateValue;
  } else if (rateUnitLower.includes('µg/kg/min') || rateUnitLower.includes('ug/kg/min')) {
    // Convert µg/kg/min to total volume
    const weight = patientWeight || 70;
    const minutesToDepletion = (ampuleValue * 1000) / (rateValue * weight);
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
