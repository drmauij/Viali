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

    // Batch-fetch all related data to avoid N+1 queries
    const itemIds = Array.from(new Set(runningInfusions.map(inf => inf.itemId).filter(Boolean))) as string[];
    const recordIds = Array.from(new Set(runningInfusions.map(inf => inf.anesthesiaRecordId).filter(Boolean))) as string[];

    const [itemsList, configsList, recordsList] = await Promise.all([
      storage.getItemsByIds(itemIds),
      storage.getMedicationConfigsByItemIds(itemIds),
      storage.getAnesthesiaRecordsByIds(recordIds),
    ]);

    const itemsMap = new Map(itemsList.map((i: any) => [i.id, i]));
    const configsMap = new Map(configsList.map((c: any) => [c.itemId, c]));
    const recordsMap = new Map(recordsList.map((r: any) => [r.id, r]));

    // Batch-fetch pre-op assessments for weight-based dosing
    // Collect surgeryIds from records that might need weight data
    const weightBasedItemIds = new Set(
      configsList
        .filter((c: any) => c.rateUnit && c.rateUnit !== 'free' && isWeightBasedDosing(c.rateUnit))
        .map((c: any) => c.itemId)
    );
    const surgeryIds = Array.from(new Set(
      recordsList
        .filter((r: any) => r.surgeryId)
        .map((r: any) => r.surgeryId as string)
    ));
    // Only fetch pre-op assessments if there are weight-based configs that need them
    const needsWeight = surgeryIds.length > 0 && weightBasedItemIds.size > 0;
    const preOpAssessments = needsWeight
      ? await Promise.all(surgeryIds.map(sid => storage.getPreOpAssessment(sid)))
      : [];
    const preOpMap = new Map(
      surgeryIds.map((sid, i) => [sid, preOpAssessments[i]])
    );

    const updates: Promise<any>[] = [];

    for (const infusion of runningInfusions) {
      try {
        const item = itemsMap.get(infusion.itemId);
        if (!item) continue;

        const config = configsMap.get(infusion.itemId);
        if (!config || !config.rateUnit || config.rateUnit === 'free') continue;

        // Get patient weight if needed for body-weight-based dosing
        let patientWeight: number | undefined = undefined;
        if (isWeightBasedDosing(config.rateUnit)) {
          const record = recordsMap.get(infusion.anesthesiaRecordId);
          if (record?.surgeryId) {
            const preOp = preOpMap.get(record.surgeryId);
            patientWeight = preOp?.weight ? parseFloat(preOp.weight) : undefined;
          }
        }

        // Calculate depletion time in milliseconds
        const depletionTimeMs = calculateDepletionTime(
          infusion.rate,
          config.rateUnit,
          config.ampuleTotalContent,
          patientWeight
        );

        if (!depletionTimeMs) continue;

        const startTime = new Date(infusion.timestamp).getTime();
        const depletionTime = startTime + depletionTimeMs;

        // Check if infusion has depleted (with 5% safety buffer already applied)
        if (now.getTime() >= depletionTime) {
          const stopTime = new Date(depletionTime);
          logger.info(`[AUTO-STOP] Stopping depleted infusion: ${item.name} (ID: ${infusion.id})`);

          updates.push(
            storage.updateAnesthesiaMedication(infusion.id, {
              endTimestamp: stopTime,
              // TODO: Add autoStopped flag to schema in future migration
            }).then(() => {
              logger.info(`[AUTO-STOP] Auto-stopped depleted infusion: ${item.name} at ${stopTime.toISOString()}`);
            })
          );
        }
      } catch (err) {
        logger.error(`[AUTO-STOP] Error processing infusion ${infusion.id}:`, err);
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      logger.info(`[AUTO-STOP] Batch stopped ${updates.length} depleted infusions`);
    }
  } catch (error) {
    logger.error('[AUTO-STOP] Error checking infusions:', error);
  }
}
