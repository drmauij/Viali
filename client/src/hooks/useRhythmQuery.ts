import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { ClinicalSnapshot, RhythmPointWithId } from '@shared/schema';

// Types for clinical snapshot data
type ClinicalSnapshotData = {
  heartRhythm?: RhythmPointWithId[];
  [key: string]: any;
};

// Hook to add a rhythm point
export function useAddRhythmPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      timestamp: string;
      value: string;
    }) => {
      return await apiRequest(
        'POST',
        '/api/anesthesia/rhythm',
        {
          anesthesiaRecordId,
          timestamp: data.timestamp,
          value: data.value,
        }
      );
    },
    onMutate: async (newPoint) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const currentRhythm = (previousSnapshot.data as ClinicalSnapshotData).heartRhythm || [];
        
        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              heartRhythm: [
                ...currentRhythm,
                {
                  id: `temp-${Date.now()}`, // Temporary ID for optimistic update
                  timestamp: newPoint.timestamp,
                  value: newPoint.value,
                },
              ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
            },
          }
        );
      }

      return { previousSnapshot };
    },
    onError: (err, newPoint, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
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

// Hook to update a rhythm point
export function useUpdateRhythmPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      value?: string;
      timestamp?: string;
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/rhythm/${data.pointId}`,
        { value: data.value, timestamp: data.timestamp }
      );
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const heartRhythm = (previousSnapshot.data as ClinicalSnapshotData).heartRhythm || [];
        const index = heartRhythm.findIndex((p) => p.id === updates.pointId);
        
        if (index !== -1) {
          const updatedPoints = [...heartRhythm];
          updatedPoints[index] = {
            ...updatedPoints[index],
            ...(updates.value !== undefined && { value: updates.value }),
            ...(updates.timestamp !== undefined && { timestamp: updates.timestamp }),
          };
          // Re-sort after update
          updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          queryClient.setQueryData<ClinicalSnapshot>(
            [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
            {
              ...previousSnapshot,
              data: {
                ...previousSnapshot.data,
                heartRhythm: updatedPoints,
              },
            }
          );
        }
      }

      return { previousSnapshot };
    },
    onError: (err, updates, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
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

// Hook to delete a rhythm point
export function useDeleteRhythmPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/rhythm/${pointId}`
      );
    },
    onMutate: async (pointId) => {
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const heartRhythm = (previousSnapshot.data as ClinicalSnapshotData).heartRhythm || [];
        const filteredPoints = heartRhythm.filter((p) => p.id !== pointId);

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              heartRhythm: filteredPoints,
            },
          }
        );
      }

      return { previousSnapshot };
    },
    onError: (err, pointId, context) => {
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
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
