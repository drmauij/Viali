import { useState, useCallback } from 'react';

export type VentilationPoint = [number, number]; // [timestamp, value]
export type VentilationModePoint = [number, string]; // [timestamp, mode]

export interface VentilationData {
  etCO2: VentilationPoint[];
  pip: VentilationPoint[];
  peep: VentilationPoint[];
  tidalVolume: VentilationPoint[];
  respiratoryRate: VentilationPoint[];
  minuteVolume: VentilationPoint[];
  fiO2: VentilationPoint[];
}

export interface UseVentilationStateReturn {
  ventilationData: VentilationData;
  ventilationModeData: VentilationModePoint[];
  setVentilationData: React.Dispatch<React.SetStateAction<VentilationData>>;
  setVentilationModeData: React.Dispatch<React.SetStateAction<VentilationModePoint[]>>;
  addVentilationPoint: (param: keyof VentilationData, point: VentilationPoint) => void;
  addVentilationMode: (point: VentilationModePoint) => void;
  resetVentilationData: (data: {
    ventilation?: Partial<VentilationData>;
    modes?: VentilationModePoint[];
  }) => void;
}

export function useVentilationState(initialData?: {
  ventilation?: Partial<VentilationData>;
  modes?: VentilationModePoint[];
}): UseVentilationStateReturn {
  const [ventilationData, setVentilationData] = useState<VentilationData>({
    etCO2: initialData?.ventilation?.etCO2 || [],
    pip: initialData?.ventilation?.pip || [],
    peep: initialData?.ventilation?.peep || [],
    tidalVolume: initialData?.ventilation?.tidalVolume || [],
    respiratoryRate: initialData?.ventilation?.respiratoryRate || [],
    minuteVolume: initialData?.ventilation?.minuteVolume || [],
    fiO2: initialData?.ventilation?.fiO2 || [],
  });

  const [ventilationModeData, setVentilationModeData] = useState<VentilationModePoint[]>(
    initialData?.modes || []
  );

  const addVentilationPoint = useCallback((param: keyof VentilationData, point: VentilationPoint) => {
    setVentilationData(prev => ({
      ...prev,
      [param]: [...prev[param], point]
    }));
  }, []);

  const addVentilationMode = useCallback((point: VentilationModePoint) => {
    setVentilationModeData(prev => [...prev, point]);
  }, []);

  const resetVentilationData = useCallback((data: {
    ventilation?: Partial<VentilationData>;
    modes?: VentilationModePoint[];
  }) => {
    if (data.ventilation !== undefined) {
      // Replace with new data, filling in defaults for missing keys
      setVentilationData({
        etCO2: data.ventilation.etCO2 || [],
        pip: data.ventilation.pip || [],
        peep: data.ventilation.peep || [],
        tidalVolume: data.ventilation.tidalVolume || [],
        respiratoryRate: data.ventilation.respiratoryRate || [],
        minuteVolume: data.ventilation.minuteVolume || [],
        fiO2: data.ventilation.fiO2 || [],
      });
    }
    if (data.modes !== undefined) {
      setVentilationModeData(data.modes);
    }
  }, []);

  return {
    ventilationData,
    ventilationModeData,
    setVentilationData,
    setVentilationModeData,
    addVentilationPoint,
    addVentilationMode,
    resetVentilationData,
  };
}
