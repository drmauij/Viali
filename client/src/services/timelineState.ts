/**
 * Timeline State Management
 * 
 * Normalized data models and state management for timeline entities.
 * Provides consistent interfaces for vitals, medications, and events.
 */

// ===== CORE TYPES =====

/**
 * Base timeline entry - all entries have a timestamp
 */
export interface TimelineEntry {
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Vital sign data point [timestamp, value]
 */
export type VitalPoint = [number, number];

/**
 * Medication dose entry [timestamp, dose string]
 */
export type MedicationDosePoint = [number, string];

// ===== VITALS STATE =====

/**
 * Normalized vitals state
 */
export interface VitalsState {
  hr: VitalPoint[];
  bp: {
    sys: VitalPoint[];
    dia: VitalPoint[];
  };
  spo2: VitalPoint[];
  temp: VitalPoint[];
  etco2: VitalPoint[];
  pip: VitalPoint[];
  peep: VitalPoint[];
  tidalVolume: VitalPoint[];
  respiratoryRate: VitalPoint[];
  fio2: VitalPoint[];
}

/**
 * Create empty vitals state
 */
export function createEmptyVitalsState(): VitalsState {
  return {
    hr: [],
    bp: { sys: [], dia: [] },
    spo2: [],
    temp: [],
    etco2: [],
    pip: [],
    peep: [],
    tidalVolume: [],
    respiratoryRate: [],
    fio2: [],
  };
}

/**
 * Add a vital sign data point to state
 */
export function addVitalPoint(
  state: VitalsState,
  vitalType: keyof Omit<VitalsState, 'bp'>,
  point: VitalPoint
): VitalsState {
  return {
    ...state,
    [vitalType]: [...state[vitalType], point].sort((a, b) => a[0] - b[0]),
  };
}

/**
 * Add a BP data point (must add both sys and dia)
 */
export function addBPPoint(
  state: VitalsState,
  sys: VitalPoint,
  dia: VitalPoint
): VitalsState {
  return {
    ...state,
    bp: {
      sys: [...state.bp.sys, sys].sort((a, b) => a[0] - b[0]),
      dia: [...state.bp.dia, dia].sort((a, b) => a[0] - b[0]),
    },
  };
}

// ===== MEDICATION STATE =====

/**
 * Medication dose data - organized by swimlane ID
 */
export interface MedicationState {
  [swimlaneId: string]: MedicationDosePoint[];
}

/**
 * Create empty medication state
 */
export function createEmptyMedicationState(): MedicationState {
  return {};
}

/**
 * Add a medication dose to state
 */
export function addMedicationDose(
  state: MedicationState,
  swimlaneId: string,
  point: MedicationDosePoint
): MedicationState {
  const existing = state[swimlaneId] || [];
  return {
    ...state,
    [swimlaneId]: [...existing, point].sort((a, b) => a[0] - b[0]),
  };
}

// ===== EVENT STATE =====

/**
 * Event marker on timeline
 */
export interface EventMarker extends TimelineEntry {
  id: string;
  text: string;
  time: number; // Same as timestamp, kept for compatibility
}

/**
 * Event state - array of markers
 */
export type EventState = EventMarker[];

/**
 * Create empty event state
 */
export function createEmptyEventState(): EventState {
  return [];
}

/**
 * Add an event marker to state
 */
export function addEvent(
  state: EventState,
  event: EventMarker
): EventState {
  return [...state, event].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Update an event marker
 */
export function updateEvent(
  state: EventState,
  eventId: string,
  updates: Partial<Omit<EventMarker, 'id'>>
): EventState {
  return state.map(event => 
    event.id === eventId 
      ? { ...event, ...updates } 
      : event
  );
}

/**
 * Remove an event marker
 */
export function removeEvent(
  state: EventState,
  eventId: string
): EventState {
  return state.filter(event => event.id !== eventId);
}

// ===== COMBINED TIMELINE STATE =====

/**
 * Complete timeline state
 */
export interface TimelineState {
  vitals: VitalsState;
  medications: MedicationState;
  events: EventState;
}

/**
 * Create empty timeline state
 */
export function createEmptyTimelineState(): TimelineState {
  return {
    vitals: createEmptyVitalsState(),
    medications: createEmptyMedicationState(),
    events: createEmptyEventState(),
  };
}

// ===== DATA CONVERSION UTILITIES =====

/**
 * Convert API response to vitals state
 * API returns: { timestamp: Date, data: { hr?, sysBP?, diaBP?, ... } }[]
 */
export function apiVitalsToState(apiData: any[]): VitalsState {
  const state = createEmptyVitalsState();
  
  apiData.forEach(snapshot => {
    const timestamp = new Date(snapshot.timestamp).getTime();
    const data = snapshot.data;
    
    if (data.hr !== undefined) {
      state.hr.push([timestamp, data.hr]);
    }
    if (data.sysBP !== undefined && data.diaBP !== undefined) {
      state.bp.sys.push([timestamp, data.sysBP]);
      state.bp.dia.push([timestamp, data.diaBP]);
    }
    if (data.spo2 !== undefined) {
      state.spo2.push([timestamp, data.spo2]);
    }
    if (data.temp !== undefined) {
      state.temp.push([timestamp, data.temp]);
    }
    if (data.etco2 !== undefined) {
      state.etco2.push([timestamp, data.etco2]);
    }
    if (data.pip !== undefined) {
      state.pip.push([timestamp, data.pip]);
    }
    if (data.peep !== undefined) {
      state.peep.push([timestamp, data.peep]);
    }
    if (data.tidalVolume !== undefined) {
      state.tidalVolume.push([timestamp, data.tidalVolume]);
    }
    if (data.respiratoryRate !== undefined) {
      state.respiratoryRate.push([timestamp, data.respiratoryRate]);
    }
    if (data.fio2 !== undefined) {
      state.fio2.push([timestamp, data.fio2]);
    }
  });
  
  return state;
}

/**
 * Convert API medications to state
 * API returns: { timestamp: Date, itemId: string, dose: string, ... }[]
 */
export function apiMedicationsToState(
  apiData: any[],
  itemIdToSwimlaneId: (itemId: string) => string
): MedicationState {
  const state = createEmptyMedicationState();
  
  apiData.forEach(med => {
    const timestamp = new Date(med.timestamp).getTime();
    const swimlaneId = itemIdToSwimlaneId(med.itemId);
    const dose = med.dose || '';
    
    state[swimlaneId] = state[swimlaneId] || [];
    state[swimlaneId].push([timestamp, dose]);
  });
  
  // Sort each swimlane
  Object.keys(state).forEach(swimlaneId => {
    state[swimlaneId].sort((a, b) => a[0] - b[0]);
  });
  
  return state;
}

/**
 * Convert API events to state
 */
export function apiEventsToState(apiData: any[]): EventState {
  return apiData.map(event => ({
    id: event.id,
    timestamp: new Date(event.timestamp).getTime(),
    time: new Date(event.timestamp).getTime(),
    text: event.description || event.eventType || '',
  }));
}
