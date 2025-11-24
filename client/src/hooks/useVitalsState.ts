import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// Normalized records with IDs (source of truth)
export interface VitalPointRecord {
  id: string;
  timestamp: number;
  value: number;
}

export interface BPPointRecord {
  id: string;
  timestamp: number;
  sys: number;
  dia: number;
}

// Legacy tuple format for backward compatibility with charts
export type VitalPoint = [number, number]; // [timestamp, value]

export interface BpDataPoints {
  sys: VitalPoint[];
  dia: VitalPoint[];
}

// State structure now uses records
export interface VitalsState {
  hrRecords: VitalPointRecord[];
  bpRecords: BPPointRecord[];
  spo2Records: VitalPointRecord[];
}

export interface VitalsStateRefs {
  hrRecordsRef: React.MutableRefObject<VitalPointRecord[]>;
  bpRecordsRef: React.MutableRefObject<BPPointRecord[]>;
  spo2RecordsRef: React.MutableRefObject<VitalPointRecord[]>;
}

export interface UseVitalsStateReturn {
  // Raw records (with IDs)
  hrRecords: VitalPointRecord[];
  bpRecords: BPPointRecord[];
  spo2Records: VitalPointRecord[];
  
  // Memoized tuple selectors for chart rendering
  hrDataPoints: VitalPoint[];
  bpDataPoints: BpDataPoints;
  spo2DataPoints: VitalPoint[];
  
  // Refs
  hrRecordsRef: React.MutableRefObject<VitalPointRecord[]>;
  bpRecordsRef: React.MutableRefObject<BPPointRecord[]>;
  spo2RecordsRef: React.MutableRefObject<VitalPointRecord[]>;
  
  // Setters for raw records
  setHrRecords: React.Dispatch<React.SetStateAction<VitalPointRecord[]>>;
  setBpRecords: React.Dispatch<React.SetStateAction<BPPointRecord[]>>;
  setSpo2Records: React.Dispatch<React.SetStateAction<VitalPointRecord[]>>;
  
  // Add functions
  addHrPoint: (record: VitalPointRecord) => void;
  addBPPoint: (record: BPPointRecord) => void;
  addSpo2Point: (record: VitalPointRecord) => void;
  
  // Update functions (by ID)
  updateHrPoint: (id: string, updates: Partial<VitalPointRecord>) => void;
  updateBPPoint: (id: string, updates: Partial<BPPointRecord>) => void;
  updateSpo2Point: (id: string, updates: Partial<VitalPointRecord>) => void;
  
  // Reset function
  resetVitalsData: (vitals: { 
    hr?: VitalPointRecord[], 
    bp?: BPPointRecord[], 
    spo2?: VitalPointRecord[] 
  }) => void;
}

export function useVitalsState(initialData?: {
  hr?: VitalPointRecord[];
  bp?: BPPointRecord[];
  spo2?: VitalPointRecord[];
}): UseVitalsStateReturn {
  const [hrRecords, setHrRecords] = useState<VitalPointRecord[]>(initialData?.hr || []);
  const [bpRecords, setBpRecords] = useState<BPPointRecord[]>(initialData?.bp || []);
  const [spo2Records, setSpo2Records] = useState<VitalPointRecord[]>(initialData?.spo2 || []);

  const hrRecordsRef = useRef(hrRecords);
  const bpRecordsRef = useRef(bpRecords);
  const spo2RecordsRef = useRef(spo2Records);

  useEffect(() => { hrRecordsRef.current = hrRecords; }, [hrRecords]);
  useEffect(() => { bpRecordsRef.current = bpRecords; }, [bpRecords]);
  useEffect(() => { spo2RecordsRef.current = spo2Records; }, [spo2Records]);

  // Memoized tuple selectors for chart rendering
  const hrDataPoints = useMemo<VitalPoint[]>(() => {
    return hrRecords.map(r => [r.timestamp, r.value]);
  }, [hrRecords]);

  const bpDataPoints = useMemo<BpDataPoints>(() => {
    return {
      sys: bpRecords.map(r => [r.timestamp, r.sys]),
      // Filter out diastolic points for temporary BP records (those with dia: 0)
      dia: bpRecords
        .filter(r => r.dia > 0) // Only include records with actual diastolic values
        .map(r => [r.timestamp, r.dia]),
    };
  }, [bpRecords]);

  const spo2DataPoints = useMemo<VitalPoint[]>(() => {
    return spo2Records.map(r => [r.timestamp, r.value]);
  }, [spo2Records]);

  // Add functions
  const addHrPoint = useCallback((record: VitalPointRecord) => {
    setHrRecords(prev => [...prev, record].sort((a, b) => a.timestamp - b.timestamp));
  }, []);

  const addBPPoint = useCallback((record: BPPointRecord) => {
    setBpRecords(prev => [...prev, record].sort((a, b) => a.timestamp - b.timestamp));
  }, []);

  const addSpo2Point = useCallback((record: VitalPointRecord) => {
    setSpo2Records(prev => [...prev, record].sort((a, b) => a.timestamp - b.timestamp));
  }, []);

  // Update functions (by ID)
  const updateHrPoint = useCallback((id: string, updates: Partial<VitalPointRecord>) => {
    setHrRecords(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      return updated.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const updateBPPoint = useCallback((id: string, updates: Partial<BPPointRecord>) => {
    setBpRecords(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      return updated.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const updateSpo2Point = useCallback((id: string, updates: Partial<VitalPointRecord>) => {
    setSpo2Records(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, ...updates } : r);
      return updated.sort((a, b) => a.timestamp - b.timestamp);
    });
  }, []);

  const resetVitalsData = useCallback((vitals: { 
    hr?: VitalPointRecord[], 
    bp?: BPPointRecord[], 
    spo2?: VitalPointRecord[] 
  }) => {
    if (vitals.hr !== undefined) setHrRecords(vitals.hr);
    if (vitals.bp !== undefined) setBpRecords(vitals.bp);
    if (vitals.spo2 !== undefined) setSpo2Records(vitals.spo2);
  }, []);

  return {
    // Raw records
    hrRecords,
    bpRecords,
    spo2Records,
    
    // Memoized tuples for charts
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    
    // Refs
    hrRecordsRef,
    bpRecordsRef,
    spo2RecordsRef,
    
    // Setters
    setHrRecords,
    setBpRecords,
    setSpo2Records,
    
    // Add functions
    addHrPoint,
    addBPPoint,
    addSpo2Point,
    
    // Update functions
    updateHrPoint,
    updateBPPoint,
    updateSpo2Point,
    
    // Reset
    resetVitalsData,
  };
}
