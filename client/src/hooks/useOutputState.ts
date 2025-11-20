import { useState } from 'react';

export type OutputPoint = { id: string; timestamp: number; value: number };

export interface OutputData {
  urine: OutputPoint[];
  blood: OutputPoint[];
  gastricTube: OutputPoint[];
  drainage: OutputPoint[];
  vomit: OutputPoint[];
}

export interface UseOutputStateReturn {
  outputData: OutputData;
  setOutputData: React.Dispatch<React.SetStateAction<OutputData>>;
  resetOutputData: () => void;
}

const INITIAL_OUTPUT_DATA: OutputData = {
  urine: [],
  blood: [],
  gastricTube: [],
  drainage: [],
  vomit: [],
};

/**
 * Custom hook for managing output parameter state in UnifiedTimeline
 * 
 * Output parameters (urine, blood, gastricTube, drainage, vomit) are not
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
      urine: [],
      blood: [],
      gastricTube: [],
      drainage: [],
      vomit: [],
    });
  };

  return {
    outputData,
    setOutputData,
    resetOutputData,
  };
}
