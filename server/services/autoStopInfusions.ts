import { calculateDepletionTime } from './inventoryCalculations';
import type { IStorage } from '../storage';

let intervalId: NodeJS.Timeout | null = null;

export function startAutoStopService(storage: IStorage) {
  if (intervalId) {
    console.log('[AUTO-STOP] Service already running');
    return;
  }

  console.log('[AUTO-STOP] Starting auto-stop service (check interval: 60 seconds)');

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
    console.log('[AUTO-STOP] Service stopped');
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

    console.log(`[AUTO-STOP] Checking ${runningInfusions.length} running infusions`);

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

      // Calculate depletion time in milliseconds
      const depletionTimeMs = calculateDepletionTime(
        infusion.rate,
        config.rateUnit,
        config.ampuleTotalContent,
        infusion.patientWeight
      );

      if (!depletionTimeMs) {
        continue; // Can't calculate depletion
      }

      const startTime = new Date(infusion.timestamp).getTime();
      const depletionTime = startTime + depletionTimeMs;

      // Check if infusion has depleted (with 5% safety buffer already applied)
      if (now.getTime() >= depletionTime) {
        console.log(`[AUTO-STOP] Stopping depleted infusion: ${item.name} (ID: ${infusion.id})`);
        
        // Create stop event with auto-stop marker
        const stopTime = new Date(depletionTime);
        await storage.updateAnesthesiaMedication(infusion.id, {
          endTimestamp: stopTime.toISOString() as any,
          // TODO: Add autoStopped flag to schema in future migration
        });

        console.log(`[AUTO-STOP] Auto-stopped depleted infusion: ${item.name} at ${stopTime.toISOString()}`);
      }
    }
  } catch (error) {
    console.error('[AUTO-STOP] Error checking infusions:', error);
  }
}
