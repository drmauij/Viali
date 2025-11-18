import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AnesthesiaMedication, InsertAnesthesiaMedication } from '@shared/schema';

// Hook to create a medication entry
export function useCreateMedication(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertAnesthesiaMedication) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/medications',
        data
      );
    },
    // No optimistic update - insert type lacks read-only fields from select type
    // Rely on cache invalidation instead
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to update a medication entry
export function useUpdateMedication(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      timestamp?: Date;
      type?: 'bolus' | 'infusion_start' | 'infusion_stop' | 'rate_change';
      dose?: string;
      unit?: string;
      route?: string;
      rate?: string;
      endTimestamp?: Date;
    }) => {
      const { id, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/medications/${id}`,
        updates
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to delete a medication entry
export function useDeleteMedication(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (medicationId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/medications/${medicationId}`
      );
    },
    onMutate: async (medicationId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
      });

      const previousMedications = queryClient.getQueryData<AnesthesiaMedication[]>([
        `/api/anesthesia/medications/${anesthesiaRecordId}`,
      ]);

      if (previousMedications) {
        // Optimistic delete is safe - just filter out the ID
        const filteredMedications = previousMedications.filter(
          (med) => med.id !== medicationId
        );

        queryClient.setQueryData<AnesthesiaMedication[]>(
          [`/api/anesthesia/medications/${anesthesiaRecordId}`],
          filteredMedications
        );
      }

      return { previousMedications };
    },
    onError: (err, medicationId, context) => {
      if (context?.previousMedications) {
        queryClient.setQueryData(
          [`/api/anesthesia/medications/${anesthesiaRecordId}`],
          context.previousMedications
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
      });
    },
  });
}
