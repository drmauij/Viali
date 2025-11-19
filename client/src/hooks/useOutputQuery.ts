import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ClinicalSnapshot } from '@shared/schema';

// Valid output parameter keys
export type OutputParamKey = 'gastricTube' | 'drainage' | 'vomit' | 'urine' | 'urine677' | 'blood' | 'bloodIrrigation';

// Hook to create an output point
export function useCreateOutput(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      anesthesiaRecordId: string;
      paramKey: OutputParamKey;
      timestamp: string;
      value: number;
    }) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/output',
        data
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to update an output point
export function useUpdateOutput(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      paramKey: OutputParamKey;
      value?: number;
      timestamp?: string;
    }) => {
      const { pointId, ...updates } = data;
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/output/${pointId}`,
        {
          ...updates,
          anesthesiaRecordId,
        }
      );
    },
    // No optimistic update - rely on cache invalidation for type safety
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to delete an output point
export function useDeleteOutput(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { pointId: string; paramKey: OutputParamKey }) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/output/${data.pointId}`,
        {
          anesthesiaRecordId,
          paramKey: data.paramKey,
        }
      );
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/snapshots/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        // Optimistic delete is safe - just filter out the point ID
        const snapshotData = previousSnapshot.data as any;
        const points = snapshotData[data.paramKey] || [];
        const filteredPoints = points.filter((p: any) => p.id !== data.pointId);

        const updatedSnapshot: ClinicalSnapshot = {
          ...previousSnapshot,
          data: {
            ...snapshotData,
            [data.paramKey]: filteredPoints,
          },
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
          updatedSnapshot
        );
      }

      return { previousSnapshot };
    },
    onError: (err, data, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/snapshots/${anesthesiaRecordId}`],
          context.previousSnapshot
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });
    },
  });
}
