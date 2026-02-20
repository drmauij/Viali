import { useQuery } from '@tanstack/react-query';
import type { VitalPointWithId, BPPointWithId } from './useVitalsQuery';

export interface PacuVitalsEntry {
  anesthesiaRecordId: string;
  hr: VitalPointWithId[];
  bp: BPPointWithId[];
  spo2: VitalPointWithId[];
}

export function usePacuVitals(hospitalId: string | undefined, enabled: boolean) {
  return useQuery<PacuVitalsEntry[]>({
    queryKey: [`/api/anesthesia/pacu/${hospitalId}/vitals`],
    enabled: !!hospitalId && enabled,
    refetchInterval: 30_000,
  });
}
