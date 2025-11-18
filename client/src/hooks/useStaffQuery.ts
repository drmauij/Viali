import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AnesthesiaStaff, InsertAnesthesiaStaff } from '@shared/schema';

// Hook to create a staff entry
export function useCreateStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertAnesthesiaStaff) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/staff',
        data
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to update a staff entry
export function useUpdateStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      timestamp?: Date;
      role?: 'doctor' | 'nurse' | 'assistant';
      name?: string;
    }) => {
      const { id, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/staff/${id}`,
        updates
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to delete a staff entry
export function useDeleteStaff(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (staffId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/staff/${staffId}`
      );
    },
    onMutate: async (staffId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });

      const previousStaff = queryClient.getQueryData<AnesthesiaStaff[]>([
        `/api/anesthesia/staff/${anesthesiaRecordId}`,
      ]);

      if (previousStaff) {
        // Optimistic delete is safe - just filter out the ID
        const filteredStaff = previousStaff.filter(
          (s) => s.id !== staffId
        );

        queryClient.setQueryData<AnesthesiaStaff[]>(
          [`/api/anesthesia/staff/${anesthesiaRecordId}`],
          filteredStaff
        );
      }

      return { previousStaff };
    },
    onError: (err, staffId, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(
          [`/api/anesthesia/staff/${anesthesiaRecordId}`],
          context.previousStaff
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
      });
    },
  });
}
