import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AnesthesiaPosition, InsertAnesthesiaPosition } from '@shared/schema';

// Hook to create a position entry
export function useCreatePosition(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertAnesthesiaPosition) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/positions',
        data
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/positions/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to update a position entry
export function useUpdatePosition(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      timestamp?: Date;
      position?: string;
    }) => {
      const { id, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/positions/${id}`,
        updates
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/positions/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to delete a position entry
export function useDeletePosition(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (positionId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/positions/${positionId}`
      );
    },
    onMutate: async (positionId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/positions/${anesthesiaRecordId}`],
      });

      const previousPositions = queryClient.getQueryData<AnesthesiaPosition[]>([
        `/api/anesthesia/positions/${anesthesiaRecordId}`,
      ]);

      if (previousPositions) {
        // Optimistic delete is safe - just filter out the ID
        const filteredPositions = previousPositions.filter(
          (pos) => pos.id !== positionId
        );

        queryClient.setQueryData<AnesthesiaPosition[]>(
          [`/api/anesthesia/positions/${anesthesiaRecordId}`],
          filteredPositions
        );
      }

      return { previousPositions };
    },
    onError: (err, positionId, context) => {
      if (context?.previousPositions) {
        queryClient.setQueryData(
          [`/api/anesthesia/positions/${anesthesiaRecordId}`],
          context.previousPositions
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/positions/${anesthesiaRecordId}`],
      });
    },
  });
}
