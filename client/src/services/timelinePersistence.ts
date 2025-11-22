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
    urine?: number;
    blood?: number;
    gastricTube?: number;
    drainage?: number;
    vomit?: number;
  };
}

/**
 * Save vitals snapshot to database
 * 
 * Backend automatically handles upsert logic via INSERT ON CONFLICT:
 * - If a snapshot exists at (anesthesiaRecordId, timestamp), it merges the new data
 * - Otherwise, it creates a new snapshot
 * 
 * This simplifies frontend logic - just POST and let the backend handle everything.
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

  // Build request payload matching schema
  const requestPayload: InsertClinicalSnapshot = {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    timestamp: payload.timestamp,
    data: payload.data,
  };

  console.log('[PERSISTENCE] Sending POST /api/anesthesia/vitals (backend handles upsert):', JSON.stringify(requestPayload, null, 2));

  try {
    const response = await apiRequest('POST', '/api/anesthesia/vitals', requestPayload);
    const result = await response.json();
    
    console.log('[PERSISTENCE] saveVitals success:', result);
    return result;
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
  infusionSessionId?: string;
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
  
  console.log('[TIMESTAMP-DEBUG] Persistence layer timestamp:', {
    timestampRaw: payload.timestamp,
    timestampType: typeof payload.timestamp,
    timestampISO: payload.timestamp.toISOString(),
    timestampEpoch: payload.timestamp.getTime(),
    timestampLocal: payload.timestamp.toLocaleString(),
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
    infusionSessionId: payload.infusionSessionId,
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

// ===== TIME MARKERS PERSISTENCE =====

export interface TimeMarker {
  id: string;
  code: string;
  label: string;
  time: number | null; // timestamp in milliseconds, null if not set
}

export interface SaveTimeMarkersPayload {
  anesthesiaRecordId: string;
  timeMarkers: TimeMarker[];
}

/**
 * Save time markers to database
 */
export async function saveTimeMarkers(payload: SaveTimeMarkersPayload): Promise<any> {
  console.log('[PERSISTENCE] saveTimeMarkers called with:', {
    anesthesiaRecordId: payload.anesthesiaRecordId,
    timeMarkersCount: payload.timeMarkers.length,
  });

  if (!payload.anesthesiaRecordId) {
    throw new Error('anesthesiaRecordId is required');
  }
  if (!Array.isArray(payload.timeMarkers)) {
    throw new Error('timeMarkers must be an array');
  }

  const requestPayload = {
    timeMarkers: payload.timeMarkers,
  };

  console.log('[PERSISTENCE] Sending PATCH /api/anesthesia/records/:id/time-markers:', JSON.stringify(requestPayload, null, 2));

  try {
    const response = await apiRequest('PATCH', `/api/anesthesia/records/${payload.anesthesiaRecordId}/time-markers`, requestPayload);
    const result = await response.json();
    
    console.log('[PERSISTENCE] saveTimeMarkers success:', result);
    return result;
  } catch (error) {
    console.error('[PERSISTENCE] saveTimeMarkers failed:', error);
    throw error;
  }
}
