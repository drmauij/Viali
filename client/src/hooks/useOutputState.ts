import { useState } from 'react';

export type OutputPoint = { id: string; timestamp: number; value: number };

export interface OutputData {
  gastricTube: OutputPoint[];
  drainage: OutputPoint[];
  vomit: OutputPoint[];
  urine: OutputPoint[];
  urine677: OutputPoint[];
  blood: OutputPoint[];
  bloodIrrigation: OutputPoint[];
}

export interface UseOutputStateReturn {
  outputData: OutputData;
  setOutputData: React.Dispatch<React.SetStateAction<OutputData>>;
  resetOutputData: () => void;
}

const INITIAL_OUTPUT_DATA: OutputData = {
  gastricTube: [],
  drainage: [],
  vomit: [],
  urine: [],
  urine677: [],
  blood: [],
  bloodIrrigation: [],
};

/**
 * Custom hook for managing output parameter state in UnifiedTimeline
 * 
 * Output parameters (gastricTube, drainage, vomit, urine, blood, etc.) are not
 * loaded from API data - they are only populated through user interactions via dialogs.
 * 
 * This hook provides:
 * - State for all output parameters
 * - Setter function for updating output data
 * - Reset function to clear all output data
 */
export function useOutputState(): UseOutputStateReturn {
  const [outputData, setOutputData] = useState<OutputData>(INITIAL_OUTPUT_DATA);

  const resetOutputData = () => {
    // Create fresh object to ensure React detects the change (avoid stale data)
    setOutputData({
      gastricTube: [],
      drainage: [],
      vomit: [],
      urine: [],
      urine677: [],
      blood: [],
      bloodIrrigation: [],
    });
  };

  return {
    outputData,
    setOutputData,
    resetOutputData,
  };
}
