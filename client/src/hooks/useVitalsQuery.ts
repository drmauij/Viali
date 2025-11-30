import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { VitalPointRecord, BPPointRecord } from './useVitalsState';

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

export interface TOFPointWithId {
  id: string;
  timestamp: string;
  value: string; // Fraction value (e.g., "0/4", "1/4", "2/4", "3/4", "4/4")
  percentage?: number; // Optional T4/T1 ratio percentage
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
  bis?: VitalPointWithId[];
  tof?: TOFPointWithId[];
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
        `/api/anesthesia/vitals/points`,
        { anesthesiaRecordId, ...data }
      );
    },
    onMutate: async (newPoint) => {
      // NOTE: Removed cancelQueries to prevent race conditions between 
      // different vital type mutations (HR, BP, SpO2).
      // Optimistic updates will still work, and any in-flight refetches
      // will be merged with server state on completion.

      // Snapshot previous value for rollback
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
        `/api/anesthesia/vitals/bp`,
        { anesthesiaRecordId, ...data }
      );
    },
    onMutate: async (newPoint) => {
      // NOTE: Removed cancelQueries to prevent race conditions between 
      // different vital type mutations (HR, BP, SpO2).

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
      // NOTE: Removed cancelQueries to prevent race conditions

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
              // Only spread value and timestamp, not pointId
              const { pointId, ...updateFields } = updates;
              updatedPoints[index] = {
                ...updatedPoints[index],
                ...updateFields,
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
      // NOTE: Removed cancelQueries to prevent race conditions

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const bpPoints = updatedData.bp || [];
        const index = bpPoints.findIndex((p: any) => p.id === updates.pointId);
        
        if (index !== -1) {
          const updatedPoints = [...bpPoints];
          // Only spread sys, dia, mean, timestamp - not pointId
          const { pointId, ...updateFields } = updates;
          updatedPoints[index] = {
            ...updatedPoints[index],
            ...updateFields,
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
      // NOTE: Removed cancelQueries to prevent race conditions

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

// Hook to add a TOF point
export function useAddTOFPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      timestamp: string;
      value: string;
      percentage?: number;
    }) => {
      return await apiRequest(
        'POST',
        `/api/anesthesia/tof`,
        { anesthesiaRecordId, ...data }
      );
    },
    onMutate: async (newPoint) => {
      // NOTE: Removed cancelQueries to prevent race conditions

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const optimisticId = `temp-${Date.now()}-${Math.random()}`;
        const newTOFPoint: TOFPointWithId = {
          id: optimisticId,
          timestamp: newPoint.timestamp,
          value: newPoint.value,
          percentage: newPoint.percentage,
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              tof: [
                ...(previousSnapshot.data.tof || []),
                newTOFPoint,
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

// Hook to update a TOF point
export function useUpdateTOFPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      value?: string;
      percentage?: number;
      timestamp?: string;
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/tof/${data.pointId}`,
        { value: data.value, percentage: data.percentage, timestamp: data.timestamp }
      );
    },
    onMutate: async (updates) => {
      // NOTE: Removed cancelQueries to prevent race conditions

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const tofPoints = updatedData.tof || [];
        const index = tofPoints.findIndex((p: any) => p.id === updates.pointId);
        
        if (index !== -1) {
          const updatedPoints = [...tofPoints];
          updatedPoints[index] = {
            ...updatedPoints[index],
            ...updates,
          };
          // Re-sort after update
          updatedPoints.sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));
          updatedData.tof = updatedPoints;
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

// Hook to delete a TOF point
export function useDeleteTOFPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/tof/${pointId}`
      );
    },
    onMutate: async (pointId) => {
      // NOTE: Removed cancelQueries to prevent race conditions

      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const tofPoints = updatedData.tof || [];
        const filtered = tofPoints.filter((p: any) => p.id !== pointId);
        if (filtered.length < tofPoints.length) {
          updatedData.tof = filtered;
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

// Helper to convert snapshot to normalized records with IDs
export function convertToRecordsFormat(snapshot: ClinicalSnapshot | undefined): {
  hr: VitalPointRecord[];
  bp: BPPointRecord[];
  spo2: VitalPointRecord[];
} {
  if (!snapshot?.data) {
    return { hr: [], bp: [], spo2: [] };
  }

  const hr = (snapshot.data.hr || []).map(p => ({
    id: p.id,
    timestamp: parseTimestamp(p.timestamp),
    value: p.value,
  }));

  const spo2 = (snapshot.data.spo2 || []).map(p => ({
    id: p.id,
    timestamp: parseTimestamp(p.timestamp),
    value: p.value,
  }));

  const bp = (snapshot.data.bp || []).map(p => ({
    id: p.id,
    timestamp: parseTimestamp(p.timestamp),
    sys: p.sys,
    dia: p.dia,
  }));

  return { hr, bp, spo2 };
}

// Legacy tuple format for backward compatibility (DEPRECATED - use convertToRecordsFormat)
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
