import { calculateDepletionTime, normalizeRateUnit } from './inventoryCalculations';
import type { IStorage } from '../storage';
import logger from "../logger";

let intervalId: NodeJS.Timeout | null = null;

// Helper function to check if a rate unit requires patient weight
// Uses the shared normalization function from inventoryCalculations
function isWeightBasedDosing(rateUnit: string | null | undefined): boolean {
  if (!rateUnit) return false;
  const normalized = normalizeRateUnit(rateUnit);
  
  // Check for all weight-based unit patterns that the calculation functions support
  return (
    // µg/kg/min variants
    normalized.includes('µg/kg/min') || 
    normalized.includes('ug/kg/min') || 
    normalized.includes('mcg/kg/min') ||
    
    // µg/kg/h and µg/kg/hr variants
    normalized.includes('µg/kg/h') || 
    normalized.includes('ug/kg/h') || 
    normalized.includes('mcg/kg/h') || 
    normalized.includes('µg/kg/hr') || 
    normalized.includes('ug/kg/hr') || 
    normalized.includes('mcg/kg/hr') ||
    
    // mg/kg/min variant
    normalized.includes('mg/kg/min') ||
    
    // mg/kg/h and mg/kg/hr variants
    normalized.includes('mg/kg/h') || 
    normalized.includes('mg/kg/hr')
  );
}

export function startAutoStopService(storage: IStorage) {
  if (intervalId) {
    logger.info('[AUTO-STOP] Service already running');
    return;
  }

  logger.info('[AUTO-STOP] Starting auto-stop service (check interval: 60 seconds)');

  // Run check immediately, then every 60 seconds
  checkAndStopDepletedInfusions(storage);
  intervalId = setInterval(() => {
    checkAndStopDepletedInfusions(storage);
  }, 60 * 1000);
}

export function stopAutoStopService() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[AUTO-STOP] Service stopped');
  }
}

async function checkAndStopDepletedInfusions(storage: IStorage) {
  try {
    const now = new Date();
    
    // Get all running rate-controlled infusions
    const runningInfusions = await storage.getRunningRateControlledInfusions();
    
    if (runningInfusions.length === 0) {
      return; // No running infusions
    }

    for (const infusion of runningInfusions) {
      // Get item details
      const item = await storage.getItem(infusion.itemId);
      
      if (!item) {
        continue; // Item not found
      }

      // Get medication config for this item
      const config = await storage.getMedicationConfig(infusion.itemId);
      
      if (!config || !config.rateUnit || config.rateUnit === 'free') {
        continue; // Skip non-rate-controlled items
      }

      // Get patient weight if needed for body-weight-based dosing
      // Note: calculateDepletionTime now handles rate unit normalization internally
      let patientWeight: number | undefined = undefined;
      if (isWeightBasedDosing(config.rateUnit)) {
        const record = await storage.getAnesthesiaRecordById(infusion.anesthesiaRecordId);
        if (record && record.surgeryId) {
          const preOpAssessment = await storage.getPreOpAssessment(record.surgeryId);
          patientWeight = preOpAssessment?.weight ? parseFloat(preOpAssessment.weight) : undefined;
        }
      }

      // Calculate depletion time in milliseconds
      // The rate unit is passed as-is; calculateDepletionTime handles normalization internally
      const depletionTimeMs = calculateDepletionTime(
        infusion.rate,
        config.rateUnit,
        config.ampuleTotalContent,
        patientWeight
      );

      if (!depletionTimeMs) {
        continue; // Can't calculate depletion
      }

      const startTime = new Date(infusion.timestamp).getTime();
      const depletionTime = startTime + depletionTimeMs;

      // Check if infusion has depleted (with 5% safety buffer already applied)
      if (now.getTime() >= depletionTime) {
        logger.info(`[AUTO-STOP] Stopping depleted infusion: ${item.name} (ID: ${infusion.id})`);
        
        // Create stop event with auto-stop marker
        // Pass Date object directly - Drizzle expects timestamp type, not string
        const stopTime = new Date(depletionTime);
        await storage.updateAnesthesiaMedication(infusion.id, {
          endTimestamp: stopTime,
          // TODO: Add autoStopped flag to schema in future migration
        });

        logger.info(`[AUTO-STOP] Auto-stopped depleted infusion: ${item.name} at ${stopTime.toISOString()}`);
      }
    }
  } catch (error) {
    logger.error('[AUTO-STOP] Error checking infusions:', error);
  }
}
