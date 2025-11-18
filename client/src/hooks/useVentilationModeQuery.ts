import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ClinicalSnapshot } from '@shared/schema';

// Hook to create a ventilation mode point
export function useCreateVentilationMode(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      anesthesiaRecordId: string;
      timestamp: string;
      value: string;
    }) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/ventilation-modes',
        data
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to update a ventilation mode point
export function useUpdateVentilationMode(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      value?: string;
      timestamp?: string;
    }) => {
      const { pointId, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/ventilation-modes/${pointId}`,
        {
          ...updates,
          anesthesiaRecordId,
        }
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to delete a ventilation mode point
export function useDeleteVentilationMode(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/ventilation-modes/${pointId}`,
        {
          anesthesiaRecordId,
        }
      );
    },
    onMutate: async (pointId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
      });

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/snapshots/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        // Optimistic delete is safe - just filter out the point ID
        const data = previousSnapshot.data as any;
        const ventilationModes = data.ventilationModes || [];
        const filteredModes = ventilationModes.filter((p: any) => p.id !== pointId);

        const updatedSnapshot: ClinicalSnapshot = {
          ...previousSnapshot,
          data: {
            ...data,
            ventilationModes: filteredModes,
          },
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
          updatedSnapshot
        );
      }

      return { previousSnapshot };
    },
    onError: (err, pointId, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
          context.previousSnapshot
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
      });
    },
  });
}
