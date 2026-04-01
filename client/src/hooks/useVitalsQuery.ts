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

export interface VASPointWithId {
  id: string;
  timestamp: string;
  value: number; // Pain level 0-10
}

export interface ScorePointWithId {
  id: string;
  timestamp: string;
  scoreType: 'aldrete' | 'parsap';
  totalScore: number;
  aldreteScore?: {
    activity: number;
    respiration: number;
    circulation: number;
    consciousness: number;
    oxygenSaturation: number;
  };
  parsapScore?: {
    vitals: number;
    ambulation: number;
    nauseaVomiting: number;
    pain: number;
    surgicalBleeding: number;
  };
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
  vas?: VASPointWithId[];
  scores?: ScorePointWithId[];
}

export interface ClinicalSnapshot {
  id: string;
  anesthesiaRecordId: string;
  data: ClinicalSnapshotData;
  createdAt: string;
  updatedAt: string;
}

// Physiological min/max ranges for clamping vital values.
// Values outside these ranges are clamped silently to prevent out-of-scale chart points.
const VITAL_RANGES: Record<string, { min: number; max: number }> = {
  hr:              { min: 20,  max: 240 },
  spo2:            { min: 50,  max: 100 },
  temp:            { min: 30,  max: 45  },
  etco2:           { min: 0,   max: 100 },
  pip:             { min: 0,   max: 60  },
  peep:            { min: 0,   max: 30  },
  tidalVolume:     { min: 0,   max: 2000 },
  respiratoryRate: { min: 0,   max: 60  },
  minuteVolume:    { min: 0,   max: 30  },
  fio2:            { min: 21,  max: 100 },
  bis:             { min: 0,   max: 100 },
  sevofluranInsp:  { min: 0,   max: 10  },
  sevofluranExp:   { min: 0,   max: 10  },
  desfluranInsp:   { min: 0,   max: 20  },
  desfluranExp:    { min: 0,   max: 20  },
  mac:             { min: 0,   max: 5   },
};

const BP_RANGES = {
  sys:  { min: 30, max: 250 },
  dia:  { min: 10, max: 180 },
  mean: { min: 15, max: 200 },
};

function clampVital(vitalType: string, value: number): number {
  const range = VITAL_RANGES[vitalType];
  if (!range) return value;
  return Math.max(range.min, Math.min(range.max, value));
}

function clampBP(field: 'sys' | 'dia' | 'mean', value: number): number {
  const range = BP_RANGES[field];
  return Math.max(range.min, Math.min(range.max, value));
}

// Hook to get the clinical snapshot for a record
export function useClinicalSnapshot(anesthesiaRecordId: string | undefined) {
  return useQuery<ClinicalSnapshot>({
    queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
    staleTime: 0,
    refetchOnMount: "always",
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
      const clamped = { ...data, value: clampVital(data.vitalType, data.value) };
      return await apiRequest(
        'POST',
        `/api/anesthesia/vitals/points`,
        { anesthesiaRecordId, ...clamped }
      );
    },
    onMutate: async (newPoint) => {
      // Clamp for optimistic update too
      newPoint = { ...newPoint, value: clampVital(newPoint.vitalType, newPoint.value) };
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
      const clamped = {
        ...data,
        sys: clampBP('sys', data.sys),
        dia: clampBP('dia', data.dia),
        ...(data.mean !== undefined ? { mean: clampBP('mean', data.mean) } : {}),
      };
      return await apiRequest(
        'POST',
        `/api/anesthesia/vitals/bp`,
        { anesthesiaRecordId, ...clamped }
      );
    },
    onMutate: async (newPoint) => {
      // NOTE: Removed cancelQueries to prevent race conditions between
      // different vital type mutations (HR, BP, SpO2).
      // Clamp for optimistic update too
      newPoint = {
        ...newPoint,
        sys: clampBP('sys', newPoint.sys),
        dia: clampBP('dia', newPoint.dia),
        ...(newPoint.mean !== undefined ? { mean: clampBP('mean', newPoint.mean) } : {}),
      };

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
      // Clamp value if we can determine the vital type from the snapshot
      let clampedValue = data.value;
      if (clampedValue !== undefined) {
        const snapshot = queryClient.getQueryData<ClinicalSnapshot>([
          `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
        ]);
        if (snapshot) {
          for (const vt of Object.keys(snapshot.data) as Array<keyof ClinicalSnapshotData>) {
            const pts = snapshot.data[vt];
            if (Array.isArray(pts) && pts.some((p: any) => p.id === data.pointId)) {
              clampedValue = clampVital(vt, clampedValue);
              break;
            }
          }
        }
      }
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/vitals/points/${data.pointId}`,
        { value: clampedValue, timestamp: data.timestamp }
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
              // Clamp value for optimistic update
              if (updateFields.value !== undefined) {
                updateFields.value = clampVital(vitalType, updateFields.value);
              }
              (updatedPoints as any)[index] = {
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
      const clamped = {
        sys: data.sys !== undefined ? clampBP('sys', data.sys) : undefined,
        dia: data.dia !== undefined ? clampBP('dia', data.dia) : undefined,
        mean: data.mean !== undefined ? clampBP('mean', data.mean) : undefined,
        timestamp: data.timestamp,
      };
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/vitals/bp/${data.pointId}`,
        clamped
      );
    },
    onMutate: async (updates) => {
      // NOTE: Removed cancelQueries to prevent race conditions
      // Clamp for optimistic update
      updates = {
        ...updates,
        ...(updates.sys !== undefined ? { sys: clampBP('sys', updates.sys) } : {}),
        ...(updates.dia !== undefined ? { dia: clampBP('dia', updates.dia) } : {}),
        ...(updates.mean !== undefined ? { mean: clampBP('mean', updates.mean) } : {}),
      };

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

// Hook to add a VAS point
export function useAddVASPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      timestamp: string;
      value: number;
    }) => {
      return await apiRequest(
        'POST',
        `/api/anesthesia/vas`,
        { anesthesiaRecordId, ...data }
      );
    },
    onMutate: async (newPoint) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const optimisticId = `temp-${Date.now()}-${Math.random()}`;
        const newVASPoint: VASPointWithId = {
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
              vas: [
                ...(previousSnapshot.data.vas || []),
                newVASPoint,
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

// Hook to update a VAS point
export function useUpdateVASPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      value?: number;
      timestamp?: string;
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/vas/${data.pointId}`,
        { value: data.value, timestamp: data.timestamp }
      );
    },
    onMutate: async (updatedPoint) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const vasPoints = updatedData.vas || [];
        const pointIndex = vasPoints.findIndex((p: any) => p.id === updatedPoint.pointId);
        if (pointIndex !== -1) {
          const updated = [...vasPoints];
          updated[pointIndex] = {
            ...updated[pointIndex],
            ...(updatedPoint.value !== undefined && { value: updatedPoint.value }),
            ...(updatedPoint.timestamp !== undefined && { timestamp: updatedPoint.timestamp }),
          };
          updatedData.vas = updated.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
    onError: (err, updatedPoint, context) => {
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

// Hook to delete a VAS point
export function useDeleteVASPoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/vas/${pointId}`
      );
    },
    onMutate: async (pointId) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const vasPoints = updatedData.vas || [];
        const filtered = vasPoints.filter((p: any) => p.id !== pointId);
        if (filtered.length < vasPoints.length) {
          updatedData.vas = filtered;
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

// Hook to add a Score point (Aldrete or PARSAP)
export function useAddScorePoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      timestamp: string;
      scoreType: 'aldrete' | 'parsap';
      totalScore: number;
      aldreteScore?: {
        activity: number;
        respiration: number;
        circulation: number;
        consciousness: number;
        oxygenSaturation: number;
      };
      parsapScore?: {
        vitals: number;
        ambulation: number;
        nauseaVomiting: number;
        pain: number;
        surgicalBleeding: number;
      };
    }) => {
      return await apiRequest(
        'POST',
        `/api/anesthesia/scores`,
        { anesthesiaRecordId, ...data }
      );
    },
    onMutate: async (newPoint) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const optimisticId = `temp-${Date.now()}-${Math.random()}`;
        const newScorePoint: ScorePointWithId = {
          id: optimisticId,
          timestamp: newPoint.timestamp,
          scoreType: newPoint.scoreType,
          totalScore: newPoint.totalScore,
          aldreteScore: newPoint.aldreteScore,
          parsapScore: newPoint.parsapScore,
        };

        queryClient.setQueryData<ClinicalSnapshot>(
          [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`],
          {
            ...previousSnapshot,
            data: {
              ...previousSnapshot.data,
              scores: [
                ...(previousSnapshot.data.scores || []),
                newScorePoint,
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

// Hook to update a Score point
export function useUpdateScorePoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      pointId: string;
      timestamp?: string;
      scoreType?: 'aldrete' | 'parsap';
      totalScore?: number;
      aldreteScore?: {
        activity: number;
        respiration: number;
        circulation: number;
        consciousness: number;
        oxygenSaturation: number;
      };
      parsapScore?: {
        vitals: number;
        ambulation: number;
        nauseaVomiting: number;
        pain: number;
        surgicalBleeding: number;
      };
    }) => {
      return await apiRequest(
        'PATCH',
        `/api/anesthesia/scores/${data.pointId}`,
        { 
          timestamp: data.timestamp,
          scoreType: data.scoreType,
          totalScore: data.totalScore,
          aldreteScore: data.aldreteScore,
          parsapScore: data.parsapScore,
        }
      );
    },
    onMutate: async (updatedPoint) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const scoresPoints = updatedData.scores || [];
        const pointIndex = scoresPoints.findIndex((p: any) => p.id === updatedPoint.pointId);
        if (pointIndex !== -1) {
          const updated = [...scoresPoints];
          updated[pointIndex] = {
            ...updated[pointIndex],
            ...(updatedPoint.timestamp !== undefined && { timestamp: updatedPoint.timestamp }),
            ...(updatedPoint.scoreType !== undefined && { scoreType: updatedPoint.scoreType }),
            ...(updatedPoint.totalScore !== undefined && { totalScore: updatedPoint.totalScore }),
            ...(updatedPoint.aldreteScore !== undefined && { aldreteScore: updatedPoint.aldreteScore }),
            ...(updatedPoint.parsapScore !== undefined && { parsapScore: updatedPoint.parsapScore }),
          };
          updatedData.scores = updated.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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
    onError: (err, updatedPoint, context) => {
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

// Hook to delete a Score point
export function useDeleteScorePoint(anesthesiaRecordId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pointId: string) => {
      return await apiRequest(
        'DELETE',
        `/api/anesthesia/scores/${pointId}`
      );
    },
    onMutate: async (pointId) => {
      const previousSnapshot = queryClient.getQueryData<ClinicalSnapshot>([
        `/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`,
      ]);

      if (previousSnapshot) {
        const updatedData = { ...previousSnapshot.data };
        const scoresPoints = updatedData.scores || [];
        const filtered = scoresPoints.filter((p: any) => p.id !== pointId);
        if (filtered.length < scoresPoints.length) {
          updatedData.scores = filtered;
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
