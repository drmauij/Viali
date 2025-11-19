import { useQuery } from '@tanstack/react-query';
import type { AnesthesiaMedication } from '@shared/schema';

/**
 * Hook to fetch all medications for an anesthesia record
 * Returns raw medication data - transformations happen in MedicationTimelineProvider
 */
export function useMedicationsQuery(recordId: string | undefined) {
  return useQuery<AnesthesiaMedication[]>({
    queryKey: [`/api/anesthesia/medications/${recordId}`],
    enabled: !!recordId,
    staleTime: 30_000, // 30 seconds
  });
}
