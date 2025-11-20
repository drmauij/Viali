import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

// Types matching the new backend structure
export interface VitalPointWithId {
  id: string;
  timestamp: string;
  value: number;
}

export interface BPPointWithId {
  id: string;
  timestamp: string;
  sys: number;
  dia: number;
  mean?: number;
}

export interface ClinicalSnapshotData {
  hr?: VitalPointWithId[];
  bp?: BPPointWithId[];
  spo2?: VitalPointWithId[];
  temp?: VitalPointWithId[];
  etco2?: VitalPointWithId[];
  pip?: VitalPointWithId[];
  peep?: VitalPointWithId[];
  tidalVolume?: VitalPointWithId[];
  respiratoryRate?: VitalPointWithId[];
  minuteVolume?: VitalPointWithId[];
  fio2?: VitalPointWithId[];
  urine?: VitalPointWithId[];
  blood?: VitalPointWithId[];
  gastricTube?: VitalPointWithId[];
  drainage?: VitalPointWithId[];
  vomit?: VitalPointWithId[];
}

export interface ClinicalSnapshot {
  id: string;
  anesthesiaRecordId: string;
  data: ClinicalSnapshotData;
  createdAt: string;
  updatedAt: string;
}

// Hook to get the clinical snapshot for a record
export function useClinicalSnapshot(anesthesiaRecordId: string | undefined) {
  return useQuery<ClinicalSnapshot>({
    queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });
}

// Hook to add a vital point (HR, SpO2, temp, etc.)
export function useAddVitalPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      vitalType: string;
      timestamp: string;
      value: number;
    }) => {
      return await apiRequest(
        'POST',
        `/api/anesthesia/vitals/${anesthesiaRecordId}/point`,
        data
      );
    },
    onMutate: async (newPoint) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });

      // Snapshot previous value
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      // Optimistically update
      if (previousSnapshot) {
        const optimisticId = `temp-${Date.now()}-${Math.random()}`;
        const newPointWithId: VitalPointWithId = {
          id: optimisticId,
          timestamp: newPoint.timestamp,
          value: newPoint.value,
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              [newPoint.vitalType]: [
                ...(previousSnapshot.data[newPoint.vitalType as keyof ClinicalSnapshotData] || []),
                newPointWithId,
              ].sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp)),
            },
          }
        );
      }

      return { previousSnapshot };
    },
    onError: (err, newPoint, context) => {
      // Rollback on error
      if (context?.previousSnapshot) {
        queryClient.setQueryData(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          context.previousSnapshot
        );
      }
    },
    onSettled: () => {
      // Refetch to get server state
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
      });
    },
  });
}

// Hook to add a BP point
export function useAddBPPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      timestamp: string;
      sys: number;
      dia: number;
      mean?: number;
    }) => {
      return await apiRequest(
        'POST',
        `/api/anesthesia/vitals/${anesthesiaRecordId}/bp`,
        data
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
        const optimisticId = `temp-${Date.now()}-${Math.random()}`;
        const newBPPoint: BPPointWithId = {
          id: optimisticId,
          timestamp: newPoint.timestamp,
          sys: newPoint.sys,
          dia: newPoint.dia,
          mean: newPoint.mean,
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              bp: [
                ...(previousSnapshot.data.bp || []),
                newBPPoint,
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

// Hook to update a vital point
export function useUpdateVitalPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      value?: number;
      timestamp?: string;
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/vitals/points/${data.pointId}`,
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
        const updatedData = { ...previousSnapshot.data };
        
        // Find and update the point in any vital type
        for (const vitalType of Object.keys(updatedData) as Array<keyof ClinicalSnapshotData>) {
          const points = updatedData[vitalType];
          if (Array.isArray(points)) {
            const index = points.findIndex((p: any) => p.id === updates.pointId);
            if (index !== -1) {
              const updatedPoints = [...points];
              updatedPoints[index] = {
                ...updatedPoints[index],
                ...updates,
              };
              // Re-sort after update
              updatedPoints.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
              (updatedData as any)[vitalType] = updatedPoints;
              break;
            }
          }
        }

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: updatedData,
          }
        );
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

// Hook to update a BP point (special handling for sys/dia/mean)
export function useUpdateBPPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      sys?: number;
      dia?: number;
      mean?: number;
      timestamp?: string;
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/vitals/bp/${data.pointId}`,
        { sys: data.sys, dia: data.dia, mean: data.mean, timestamp: data.timestamp }
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
        const updatedData = { ...previousSnapshot.data };
        const bpPoints = updatedData.bp || [];
        const index = bpPoints.findIndex((p: any) => p.id === updates.pointId);
        
        if (index !== -1) {
          const updatedPoints = [...bpPoints];
          updatedPoints[index] = {
            ...updatedPoints[index],
            ...updates,
          };
          // Re-sort after update
          updatedPoints.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
          updatedData.bp = updatedPoints;
        }

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: updatedData,
          }
        );
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

// Hook to delete a vital point
export function useDeleteVitalPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/vitals/points/${pointId}`
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
        const updatedData = { ...previousSnapshot.data };
        
        // Find and remove the point from any vital type
        for (const vitalType of Object.keys(updatedData) as Array<keyof ClinicalSnapshotData>) {
          const points = updatedData[vitalType];
          if (Array.isArray(points)) {
            const filtered = points.filter((p: any) => p.id !== pointId);
            if (filtered.length < points.length) {
              (updatedData as any)[vitalType] = filtered;
              break;
            }
          }
        }

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: updatedData,
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

// Helper function to convert timestamp to milliseconds for ECharts
export function parseTimestamp(timestamp: string): number {
  return new Date(timestamp).getTime();
}

// Helper to convert new format to old format for backward compatibility
export function convertToLegacyFormat(snapshot: ClinicalSnapshot | undefined): {
  hr: [number, number][];
  sys: [number, number][];
  dia: [number, number][];
  spo2: [number, number][];
} {
  if (!snapshot?.data) {
    return { hr: [], sys: [], dia: [], spo2: [] };
  }

  const hr = (snapshot.data.hr || []).map(p => [parseTimestamp(p.timestamp), p.value] as [number, number]);
  const spo2 = (snapshot.data.spo2 || []).map(p => [parseTimestamp(p.timestamp), p.value] as [number, number]);
  const sys = (snapshot.data.bp || []).map(p => [parseTimestamp(p.timestamp), p.sys] as [number, number]);
  const dia = (snapshot.data.bp || []).map(p => [parseTimestamp(p.timestamp), p.dia] as [number, number]);

  return { hr, sys, dia, spo2 };
}
