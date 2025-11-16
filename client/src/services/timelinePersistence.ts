import { apiRequest } from '@/lib/queryClient';
import type { InsertClinicalSnapshot, InsertAnesthesiaMedication } from '@shared/schema';

/**
 * Timeline Persistence Service
 * 
 * Centralized service for saving timeline data (vitals, medications, events)
 * to the backend. Provides explicit request builders with validation and logging.
 */

// ===== VITALS PERSISTENCE =====

export interface SaveVitalsPayload {
  anesthesiaRecordId: string;
  timestamp: Date;
  data: {
    hr?: number;
    sysBP?: number;
    diaBP?: number;
    meanBP?: number;
    spo2?: number;
    temp?: number;
    etco2?: number;
    pip?: number;
    peep?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    minuteVolume?: number;
    fio2?: number;
    gastricTube?: number;
    drainage?: number;
    vomit?: number;
    urine?: number;
    urine677?: number;
    blood?: number;
    bloodIrrigation?: number;
  };
}

/**
 * Save vitals snapshot to database with upsert logic
 * - Fetches existing snapshots at the same timestamp
 * - If a snapshot with overlapping vital types exists, UPDATE it (merge data)
 * - Otherwise, CREATE a new snapshot
 */
export async function saveVitals(payload: SaveVitalsPayload): Promise<any> {
  console.log('[PERSISTENCE] saveVitals called with:', {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    timestamp: payload.timestamp,
    data: payload.data,
  });

  // Validate payload structure
  if (!payload.anesthesiaRecordId) {
    throw new Error('anesthesiaRecordId is required');
  }
  if (!payload.timestamp) {
    throw new Error('timestamp is required');
  }
  if (!payload.data || Object.keys(payload.data).length === 0) {
    throw new Error('data object must contain at least one vital sign');
  }

  try {
    // Step 1: Fetch all existing snapshots at this timestamp
    const getResponse = await apiRequest('GET', `/api/anesthesia/vitals/${payload.anesthesiaRecordId}`);
    const allSnapshots = await getResponse.json();
    
    // Filter to snapshots matching the exact timestamp
    const timestampMs = new Date(payload.timestamp).getTime();
    const snapshotsAtTimestamp = allSnapshots.filter((snapshot: any) => {
      const snapshotMs = new Date(snapshot.timestamp).getTime();
      return snapshotMs === timestampMs;
    });
    
    console.log('[PERSISTENCE] Found existing snapshots at timestamp:', snapshotsAtTimestamp.length);
    
    // Step 2: Check if any existing snapshot has overlapping vital types
    const newVitalKeys = Object.keys(payload.data);
    let matchingSnapshot = null;
    
    for (const snapshot of snapshotsAtTimestamp) {
      const existingKeys = Object.keys(snapshot.data || {});
      const hasOverlap = newVitalKeys.some(key => existingKeys.includes(key));
      
      if (hasOverlap) {
        matchingSnapshot = snapshot;
        console.log('[PERSISTENCE] Found overlapping snapshot, will UPDATE:', snapshot.id);
        break;
      }
    }
    
    // Step 3: UPDATE or CREATE
    if (matchingSnapshot) {
      // PATCH: Merge new data with existing data
      const mergedData = { ...matchingSnapshot.data, ...payload.data };
      const updatePayload = {
        anesthesiaRecordId: payload.anesthesiaRecordId,
        timestamp: payload.timestamp,
        data: mergedData,
      };
      
      console.log('[PERSISTENCE] Sending PATCH /api/anesthesia/vitals:', matchingSnapshot.id, JSON.stringify(updatePayload, null, 2));
      
      const response = await apiRequest('PATCH', `/api/anesthesia/vitals/${matchingSnapshot.id}`, updatePayload);
      const result = await response.json();
      
      console.log('[PERSISTENCE] saveVitals UPDATE success:', result);
      return result;
    } else {
      // POST: Create new snapshot
      const requestPayload: InsertClinicalSnapshot = {
        anesthesiaRecordId: payload.anesthesiaRecordId,
        timestamp: payload.timestamp,
        data: payload.data,
      };
      
      console.log('[PERSISTENCE] Sending POST /api/anesthesia/vitals:', JSON.stringify(requestPayload, null, 2));
      
      const response = await apiRequest('POST', '/api/anesthesia/vitals', requestPayload);
      const result = await response.json();
      
      console.log('[PERSISTENCE] saveVitals CREATE success:', result);
      return result;
    }
  } catch (error) {
    console.error('[PERSISTENCE] saveVitals failed:', {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: typeof error,
      errorKeys: error && typeof error === 'object' ? Object.keys(error) : []
    });
    throw error;
  }
}

// ===== MEDICATION PERSISTENCE =====

export interface SaveMedicationPayload {
  anesthesiaRecordId: string;
  itemId: string;
  timestamp: Date;
  type: 'bolus' | 'infusion_start' | 'infusion_stop' | 'rate_change';
  dose?: string;
  unit?: string;
  route?: string;
  rate?: string;
  endTimestamp?: Date;
}

/**
 * Save medication dose/infusion to database
 */
export async function saveMedication(payload: SaveMedicationPayload): Promise<any> {
  console.log('[PERSISTENCE] saveMedication called with:', {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    itemId: payload.itemId,
    timestamp: payload.timestamp,
    type: payload.type,
    dose: payload.dose,
  });

  // Validate payload structure
  if (!payload.anesthesiaRecordId) {
    throw new Error('anesthesiaRecordId is required');
  }
  if (!payload.itemId) {
    throw new Error('itemId is required');
  }
  if (!payload.timestamp) {
    throw new Error('timestamp is required');
  }
  if (!payload.type) {
    throw new Error('type is required');
  }

  // Build request payload matching schema
  const requestPayload: InsertAnesthesiaMedication = {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    itemId: payload.itemId,
    timestamp: payload.timestamp,
    type: payload.type,
    dose: payload.dose,
    unit: payload.unit,
    route: payload.route,
    rate: payload.rate,
    endTimestamp: payload.endTimestamp,
  };

  console.log('[PERSISTENCE] Sending POST /api/anesthesia/medications:', JSON.stringify(requestPayload, null, 2));

  try {
    const response = await apiRequest('POST', '/api/anesthesia/medications', requestPayload);
    const result = await response.json();
    
    console.log('[PERSISTENCE] saveMedication success:', result);
    return result;
  } catch (error) {
    console.error('[PERSISTENCE] saveMedication failed:', error);
    throw error;
  }
}

// ===== EVENT PERSISTENCE =====

export interface SaveEventPayload {
  anesthesiaRecordId: string;
  timestamp: Date;
  eventType?: string;
  description: string;
}

/**
 * Save event marker to database
 */
export async function saveEvent(payload: SaveEventPayload): Promise<any> {
  console.log('[PERSISTENCE] saveEvent called with:', payload);

  if (!payload.anesthesiaRecordId) {
    throw new Error('anesthesiaRecordId is required');
  }
  if (!payload.timestamp) {
    throw new Error('timestamp is required');
  }
  if (!payload.description) {
    throw new Error('description is required');
  }

  const requestPayload = {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    timestamp: payload.timestamp,
    eventType: payload.eventType,
    description: payload.description,
  };

  console.log('[PERSISTENCE] Sending POST /api/anesthesia/events:', JSON.stringify(requestPayload, null, 2));

  try {
    const response = await apiRequest('POST', '/api/anesthesia/events', requestPayload);
    const result = await response.json();
    
    console.log('[PERSISTENCE] saveEvent success:', result);
    return result;
  } catch (error) {
    console.error('[PERSISTENCE] saveEvent failed:', error);
    throw error;
  }
}
