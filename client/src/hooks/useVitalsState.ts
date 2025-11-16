import { useState, useRef, useEffect, useCallback } from 'react';

export type VitalPoint = [number, number]; // [timestamp, value]

export interface BpDataPoints {
  sys: VitalPoint[];
  dia: VitalPoint[];
}

export interface VitalsState {
  hrDataPoints: VitalPoint[];
  bpDataPoints: BpDataPoints;
  spo2DataPoints: VitalPoint[];
}

export interface VitalsStateRefs {
  hrDataPointsRef: React.MutableRefObject<VitalPoint[]>;
  bpDataPointsRef: React.MutableRefObject<BpDataPoints>;
  spo2DataPointsRef: React.MutableRefObject<VitalPoint[]>;
}

export interface UseVitalsStateReturn {
  hrDataPoints: VitalPoint[];
  bpDataPoints: BpDataPoints;
  spo2DataPoints: VitalPoint[];
  hrDataPointsRef: React.MutableRefObject<VitalPoint[]>;
  bpDataPointsRef: React.MutableRefObject<BpDataPoints>;
  spo2DataPointsRef: React.MutableRefObject<VitalPoint[]>;
  setHrDataPoints: React.Dispatch<React.SetStateAction<VitalPoint[]>>;
  setBpDataPoints: React.Dispatch<React.SetStateAction<BpDataPoints>>;
  setSpo2DataPoints: React.Dispatch<React.SetStateAction<VitalPoint[]>>;
  addHrPoint: (point: VitalPoint) => void;
  addSysPoint: (point: VitalPoint) => void;
  addDiaPoint: (point: VitalPoint) => void;
  addSpo2Point: (point: VitalPoint) => void;
  updateHrPoint: (index: number, point: VitalPoint) => void;
  updateSysPoint: (index: number, point: VitalPoint) => void;
  updateDiaPoint: (index: number, point: VitalPoint) => void;
  updateSpo2Point: (index: number, point: VitalPoint) => void;
  resetVitalsData: (vitals: { hr?: VitalPoint[], sys?: VitalPoint[], dia?: VitalPoint[], spo2?: VitalPoint[] }) => void;
}

export function useVitalsState(initialData?: {
  hr?: VitalPoint[];
  sys?: VitalPoint[];
  dia?: VitalPoint[];
  spo2?: VitalPoint[];
}): UseVitalsStateReturn {
  const [hrDataPoints, setHrDataPoints] = useState<VitalPoint[]>(initialData?.hr || []);
  const [bpDataPoints, setBpDataPoints] = useState<BpDataPoints>({
    sys: initialData?.sys || [],
    dia: initialData?.dia || [],
  });
  const [spo2DataPoints, setSpo2DataPoints] = useState<VitalPoint[]>(initialData?.spo2 || []);

  const hrDataPointsRef = useRef(hrDataPoints);
  const bpDataPointsRef = useRef(bpDataPoints);
  const spo2DataPointsRef = useRef(spo2DataPoints);

  useEffect(() => { hrDataPointsRef.current = hrDataPoints; }, [hrDataPoints]);
  useEffect(() => { bpDataPointsRef.current = bpDataPoints; }, [bpDataPoints]);
  useEffect(() => { spo2DataPointsRef.current = spo2DataPoints; }, [spo2DataPoints]);

  const addHrPoint = useCallback((point: VitalPoint) => {
    setHrDataPoints(prev => [...prev, point]);
  }, []);

  const addSysPoint = useCallback((point: VitalPoint) => {
    setBpDataPoints(prev => ({
      ...prev,
      sys: [...prev.sys, point]
    }));
  }, []);

  const addDiaPoint = useCallback((point: VitalPoint) => {
    setBpDataPoints(prev => ({
      ...prev,
      dia: [...prev.dia, point]
    }));
  }, []);

  const addSpo2Point = useCallback((point: VitalPoint) => {
    setSpo2DataPoints(prev => [...prev, point]);
  }, []);

  const updateHrPoint = useCallback((index: number, point: VitalPoint) => {
    setHrDataPoints(prev => {
      const updated = [...prev];
      updated[index] = point;
      return updated;
    });
  }, []);

  const updateSysPoint = useCallback((index: number, point: VitalPoint) => {
    setBpDataPoints(prev => {
      const updated = [...prev.sys];
      updated[index] = point;
      return { ...prev, sys: updated };
    });
  }, []);

  const updateDiaPoint = useCallback((index: number, point: VitalPoint) => {
    setBpDataPoints(prev => {
      const updated = [...prev.dia];
      updated[index] = point;
      return { ...prev, dia: updated };
    });
  }, []);

  const updateSpo2Point = useCallback((index: number, point: VitalPoint) => {
    setSpo2DataPoints(prev => {
      const updated = [...prev];
      updated[index] = point;
      return updated;
    });
  }, []);

  const resetVitalsData = useCallback((vitals: { 
    hr?: VitalPoint[], 
    sys?: VitalPoint[], 
    dia?: VitalPoint[], 
    spo2?: VitalPoint[] 
  }) => {
    if (vitals.hr !== undefined) setHrDataPoints(vitals.hr);
    if (vitals.sys !== undefined || vitals.dia !== undefined) {
      setBpDataPoints(prev => ({
        sys: vitals.sys !== undefined ? vitals.sys : prev.sys,
        dia: vitals.dia !== undefined ? vitals.dia : prev.dia,
      }));
    }
    if (vitals.spo2 !== undefined) setSpo2DataPoints(vitals.spo2);
  }, []);

  return {
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    hrDataPointsRef,
    bpDataPointsRef,
    spo2DataPointsRef,
    setHrDataPoints,
    setBpDataPoints,
    setSpo2DataPoints,
    addHrPoint,
    addSysPoint,
    addDiaPoint,
    addSpo2Point,
    updateHrPoint,
    updateSysPoint,
    updateDiaPoint,
    updateSpo2Point,
    resetVitalsData,
  };
}
