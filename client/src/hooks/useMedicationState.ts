import { useState, useCallback } from 'react';

export type MedicationDosePoint = [number, string, string, string | null]; // [timestamp, dose, id, note]

export interface RateInfusionSegment {
  startTime: number;
  rate: string;
  rateUnit: string;
}

export interface RateInfusionSession {
  id: string; // Medication record ID for editing/deleting
  swimlaneId: string;
  label: string;
  syringeQuantity: string;
  startDose: string; // Added for unified infusion rendering
  startNote?: string | null; // Optional note for the start dose
  initialBolus?: string | null; // Initial bolus given at infusion start
  segments: RateInfusionSegment[];
  state: 'running' | 'paused' | 'stopped';
  startTime?: number;
  endTime?: number | null;
  // TCI: Actual amount used (from infusion_stop record) for display and inventory
  actualAmountUsed?: string | null;
  stopRecordId?: string | null; // For editing the infusion_stop record
}

export interface FreeFlowSession {
  id: string; // Medication record ID for editing/deleting
  swimlaneId: string;
  startTime: number;
  dose: string;
  note?: string | null; // Optional note for the dose
  label: string;
  endTime?: number | null; // Added for stopped infusions
}

export interface MedicationDoseData {
  [swimlaneId: string]: MedicationDosePoint[];
}

export interface InfusionData {
  [swimlaneId: string]: Array<[number, string]>; // [timestamp, rate]
}

export interface RateInfusionSessions {
  [swimlaneId: string]: RateInfusionSession[];
}

export interface FreeFlowSessions {
  [swimlaneId: string]: FreeFlowSession[];
}

export interface UseMedicationStateReturn {
  medicationDoseData: MedicationDoseData;
  infusionData: InfusionData;
  rateInfusionSessions: RateInfusionSessions;
  freeFlowSessions: FreeFlowSessions;
  setMedicationDoseData: React.Dispatch<React.SetStateAction<MedicationDoseData>>;
  setInfusionData: React.Dispatch<React.SetStateAction<InfusionData>>;
  setRateInfusionSessions: React.Dispatch<React.SetStateAction<RateInfusionSessions>>;
  setFreeFlowSessions: React.Dispatch<React.SetStateAction<FreeFlowSessions>>;
  addMedicationDose: (swimlaneId: string, dose: MedicationDosePoint) => void;
  addInfusionPoint: (swimlaneId: string, point: [number, string]) => void;
  getActiveRateSession: (swimlaneId: string) => RateInfusionSession | null;
  getActiveFreeFlowSession: (swimlaneId: string) => FreeFlowSession | null;
  resetMedicationData: (data: {
    doses?: MedicationDoseData;
    infusions?: InfusionData;
    rateSessions?: RateInfusionSessions;
    freeFlowSessions?: FreeFlowSessions;
  }) => void;
}

export function useMedicationState(initialData?: {
  doses?: MedicationDoseData;
  infusions?: InfusionData;
  rateSessions?: RateInfusionSessions;
  freeFlowSessions?: FreeFlowSessions;
}): UseMedicationStateReturn {
  const [medicationDoseData, setMedicationDoseData] = useState<MedicationDoseData>(
    initialData?.doses || {}
  );
  const [infusionData, setInfusionData] = useState<InfusionData>(
    initialData?.infusions || {}
  );
  const [rateInfusionSessions, setRateInfusionSessions] = useState<RateInfusionSessions>(
    initialData?.rateSessions || {}
  );
  const [freeFlowSessions, setFreeFlowSessions] = useState<FreeFlowSessions>(
    initialData?.freeFlowSessions || {}
  );

  const addMedicationDose = useCallback((swimlaneId: string, dose: MedicationDosePoint) => {
    setMedicationDoseData(prev => ({
      ...prev,
      [swimlaneId]: [...(prev[swimlaneId] || []), dose]
    }));
  }, []);

  const addInfusionPoint = useCallback((swimlaneId: string, point: [number, string]) => {
    setInfusionData(prev => ({
      ...prev,
      [swimlaneId]: [...(prev[swimlaneId] || []), point]
    }));
  }, []);

  const getActiveRateSession = useCallback((swimlaneId: string): RateInfusionSession | null => {
    const sessions = rateInfusionSessions[swimlaneId];
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return null;
    
    // Prefer running session, otherwise most recent
    const runningSession = sessions.find(s => s.state === 'running');
    return runningSession || sessions[sessions.length - 1];
  }, [rateInfusionSessions]);

  const getActiveFreeFlowSession = useCallback((swimlaneId: string): FreeFlowSession | null => {
    const sessions = freeFlowSessions[swimlaneId];
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return null;
    
    // Return most recent session
    return sessions[sessions.length - 1];
  }, [freeFlowSessions]);

  const resetMedicationData = useCallback((data: {
    doses?: MedicationDoseData;
    infusions?: InfusionData;
    rateSessions?: RateInfusionSessions;
    freeFlowSessions?: FreeFlowSessions;
  }) => {
    console.log('[MED-STATE] resetMedicationData called with:', {
      dosesUndefined: data.doses === undefined,
      infusionsUndefined: data.infusions === undefined,
      rateSessionsUndefined: data.rateSessions === undefined,
      freeFlowSessionsUndefined: data.freeFlowSessions === undefined,
      freeFlowSessionsData: data.freeFlowSessions
    });
    if (data.doses !== undefined) setMedicationDoseData(data.doses);
    if (data.infusions !== undefined) setInfusionData(data.infusions);
    if (data.rateSessions !== undefined) setRateInfusionSessions(data.rateSessions);
    if (data.freeFlowSessions !== undefined) {
      console.log('[MED-STATE] Setting freeFlowSessions to:', data.freeFlowSessions);
      setFreeFlowSessions(data.freeFlowSessions);
    }
  }, []);

  return {
    medicationDoseData,
    infusionData,
    rateInfusionSessions,
    freeFlowSessions,
    setMedicationDoseData,
    setInfusionData,
    setRateInfusionSessions,
    setFreeFlowSessions,
    addMedicationDose,
    addInfusionPoint,
    getActiveRateSession,
    getActiveFreeFlowSession,
    resetMedicationData,
  };
}
