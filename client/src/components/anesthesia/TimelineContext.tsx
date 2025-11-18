import { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatTime as formatTimeUtil } from '@/lib/dateUtils';
import {
  snapToInterval,
  calculateSnapInterval,
  estimateSnapIntervalFromRange,
  ZOOM_LEVELS,
} from '@/utils/timelineUtils';
import { useVitalsState, type UseVitalsStateReturn } from '@/hooks/useVitalsState';
import { useMedicationState, type UseMedicationStateReturn } from '@/hooks/useMedicationState';
import { useVentilationState, type UseVentilationStateReturn } from '@/hooks/useVentilationState';
import { useEventState, type UseEventStateReturn } from '@/hooks/useEventState';
import { useOutputState, type UseOutputStateReturn } from '@/hooks/useOutputState';
import {
  useClinicalSnapshot,
  useAddVitalPoint,
  useAddBPPoint,
  useUpdateVitalPoint,
  useUpdateBPPoint,
  useDeleteVitalPoint,
} from '@/hooks/useVitalsQuery';
import {
  useCreateMedication,
  useUpdateMedication,
  useDeleteMedication,
} from '@/hooks/useMedicationQuery';
import {
  useCreateVentilationMode,
  useUpdateVentilationMode,
  useDeleteVentilationMode,
} from '@/hooks/useVentilationModeQuery';
import {
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from '@/hooks/useEventsQuery';
import {
  useCreateOutput,
  useUpdateOutput,
  useDeleteOutput,
} from '@/hooks/useOutputQuery';

/**
 * Swimlane configuration type
 */
export type SwimlaneConfig = {
  id: string;
  label: string;
  height: number;
  colorLight: string;
  colorDark: string;
  rateUnit?: string | null;
  defaultDose?: string | null;
  itemId?: string;
  hierarchyLevel?: 'parent' | 'group' | 'item';
};

/**
 * Anesthesia item type
 */
export type AnesthesiaItem = {
  id: string;
  name: string;
  administrationUnit?: string;
  administrationRoute?: string;
  ampuleConcentration?: string;
  ampuleTotalContent?: string;
  medicationGroup?: string;
  rateUnit?: string | null;
  administrationGroup?: string;
  defaultDose?: string | null;
};

/**
 * Administration group type
 */
export type AdministrationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

/**
 * Timeline data type
 */
export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: {
    hr?: [number, number][];
    sysBP?: [number, number][];
    diaBP?: [number, number][];
    spo2?: [number, number][];
  };
  events: any[];
  medications?: any[];
  apiEvents?: any[];
};

/**
 * Vitals tool mode for timeline interaction
 */
export type VitalsToolMode = 'hr' | 'bp' | 'spo2' | 'blend' | 'edit' | null;

/**
 * Timeline Context Type
 * 
 * Consolidates all shared state and utilities for UnifiedTimeline and its children
 */
export interface TimelineContextValue {
  vitalsState: UseVitalsStateReturn;
  medicationState: UseMedicationStateReturn;
  ventilationState: UseVentilationStateReturn;
  eventState: UseEventStateReturn;
  outputState: UseOutputStateReturn;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  chartInitTime: number;
  setChartInitTime: (time: number) => void;
  currentZoomStart: number;
  setCurrentZoomStart: (start: number) => void;
  currentZoomEnd: number;
  setCurrentZoomEnd: (end: number) => void;
  currentVitalsSnapInterval: number;
  setCurrentVitalsSnapInterval: (interval: number) => void;
  currentDrugSnapInterval: number;
  setCurrentDrugSnapInterval: (interval: number) => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  collapsedSwimlanes: Set<string>;
  setCollapsedSwimlanes: (swimlanes: Set<string>) => void;
  toggleSwimlane: (swimlaneId: string) => void;
  activeToolMode: VitalsToolMode;
  setActiveToolMode: (mode: VitalsToolMode) => void;
  formatTime: (date: string | Date | null | undefined) => string;
  snapToInterval: (timestamp: number, interval: number) => number;
  calculateSnapInterval: (intervalMinutes: number) => number;
  estimateSnapIntervalFromRange: (visibleRangeMs: number) => number;
  addVitalPointMutation: ReturnType<typeof useAddVitalPoint>;
  updateVitalPointMutation: ReturnType<typeof useUpdateVitalPoint>;
  deleteVitalPointMutation: ReturnType<typeof useDeleteVitalPoint>;
  addBPPointMutation: ReturnType<typeof useAddBPPoint>;
  updateBPPointMutation: ReturnType<typeof useUpdateBPPoint>;
  createMedicationMutation: ReturnType<typeof useCreateMedication>;
  updateMedicationMutation: ReturnType<typeof useUpdateMedication>;
  deleteMedicationMutation: ReturnType<typeof useDeleteMedication>;
  createVentilationModeMutation: ReturnType<typeof useCreateVentilationMode>;
  updateVentilationModeMutation: ReturnType<typeof useUpdateVentilationMode>;
  deleteVentilationModeMutation: ReturnType<typeof useDeleteVentilationMode>;
  createEventMutation: ReturnType<typeof useCreateEvent>;
  updateEventMutation: ReturnType<typeof useUpdateEvent>;
  deleteEventMutation: ReturnType<typeof useDeleteEvent>;
  createOutputMutation: ReturnType<typeof useCreateOutput>;
  updateOutputMutation: ReturnType<typeof useUpdateOutput>;
  deleteOutputMutation: ReturnType<typeof useDeleteOutput>;
  anesthesiaRecordId?: string;
  patientWeight?: number;
  data: UnifiedTimelineData;
  swimlanes: SwimlaneConfig[];
  anesthesiaItems: AnesthesiaItem[];
  administrationGroups: AdministrationGroup[];
}

const TimelineContext = createContext<TimelineContextValue | undefined>(undefined);

/**
 * TimelineContextProvider Props
 */
export interface TimelineContextProviderProps {
  children: ReactNode;
  anesthesiaRecordId?: string;
  patientWeight?: number;
  data: UnifiedTimelineData;
  swimlanes?: SwimlaneConfig[];
  now?: number;
  hospitalId?: string;
}

/**
 * TimelineContextProvider Component
 * 
 * Provides centralized state management for the UnifiedTimeline component and its children.
 * Consolidates all timeline state, mutations, and utilities into a single context for easy consumption.
 * 
 * @example
 * ```tsx
 * <TimelineContextProvider
 *   anesthesiaRecordId={recordId}
 *   patientWeight={70}
 *   data={timelineData}
 *   swimlanes={swimlaneConfig}
 *   now={Date.now()}
 *   hospitalId={hospital.id}
 * >
 *   <UnifiedTimeline />
 * </TimelineContextProvider>
 * ```
 */
export function TimelineContextProvider({
  children,
  anesthesiaRecordId,
  patientWeight,
  data,
  swimlanes = [],
  now = Date.now(),
  hospitalId,
}: TimelineContextProviderProps) {
  const vitalsState = useVitalsState({
    hr: data.vitals.hr,
    sys: data.vitals.sysBP,
    dia: data.vitals.diaBP,
    spo2: data.vitals.spo2,
  });

  const medicationState = useMedicationState();
  const ventilationState = useVentilationState();
  const eventState = useEventState();
  const outputState = useOutputState();

  const [currentTime, setCurrentTime] = useState<number>(now);
  const [chartInitTime] = useState<number>(now);
  const [currentZoomStart, setCurrentZoomStart] = useState<number>(0);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number>(100);
  const [currentVitalsSnapInterval, setCurrentVitalsSnapInterval] = useState<number>(5 * 60 * 1000);
  const [currentDrugSnapInterval, setCurrentDrugSnapInterval] = useState<number>(60 * 1000);
  const [isDark, setIsDark] = useState<boolean>(() => 
    document.documentElement.getAttribute("data-theme") === "dark"
  );
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set());
  const [activeToolMode, setActiveToolMode] = useState<VitalsToolMode>(null);

  const { data: anesthesiaItems = [] } = useQuery<AnesthesiaItem[]>({
    queryKey: [`/api/anesthesia/items/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const { data: administrationGroups = [] } = useQuery<AdministrationGroup[]>({
    queryKey: [`/api/administration-groups/${hospitalId}`],
    enabled: !!hospitalId,
  });

  const toggleSwimlane = (swimlaneId: string) => {
    setCollapsedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(swimlaneId)) {
        next.delete(swimlaneId);
      } else {
        next.add(swimlaneId);
      }
      return next;
    });
  };

  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId);
  const updateVitalPointMutation = useUpdateVitalPoint(anesthesiaRecordId);
  const deleteVitalPointMutation = useDeleteVitalPoint(anesthesiaRecordId);
  const addBPPointMutation = useAddBPPoint(anesthesiaRecordId);
  const updateBPPointMutation = useUpdateBPPoint(anesthesiaRecordId);

  const createMedicationMutation = useCreateMedication(anesthesiaRecordId);
  const updateMedicationMutation = useUpdateMedication(anesthesiaRecordId);
  const deleteMedicationMutation = useDeleteMedication(anesthesiaRecordId);

  const createVentilationModeMutation = useCreateVentilationMode(anesthesiaRecordId);
  const updateVentilationModeMutation = useUpdateVentilationMode(anesthesiaRecordId);
  const deleteVentilationModeMutation = useDeleteVentilationMode(anesthesiaRecordId);

  const createEventMutation = useCreateEvent(anesthesiaRecordId || '');
  const updateEventMutation = useUpdateEvent(anesthesiaRecordId || '');
  const deleteEventMutation = useDeleteEvent(anesthesiaRecordId || '');

  const createOutputMutation = useCreateOutput(anesthesiaRecordId);
  const updateOutputMutation = useUpdateOutput(anesthesiaRecordId);
  const deleteOutputMutation = useDeleteOutput(anesthesiaRecordId);

  const value = useMemo<TimelineContextValue>(
    () => ({
      vitalsState,
      medicationState,
      ventilationState,
      eventState,
      outputState,
      currentTime,
      setCurrentTime,
      chartInitTime,
      setChartInitTime: () => {},
      currentZoomStart,
      setCurrentZoomStart,
      currentZoomEnd,
      setCurrentZoomEnd,
      currentVitalsSnapInterval,
      setCurrentVitalsSnapInterval,
      currentDrugSnapInterval,
      setCurrentDrugSnapInterval,
      isDark,
      setIsDark,
      collapsedSwimlanes,
      setCollapsedSwimlanes,
      toggleSwimlane,
      activeToolMode,
      setActiveToolMode,
      formatTime: formatTimeUtil,
      snapToInterval,
      calculateSnapInterval,
      estimateSnapIntervalFromRange,
      addVitalPointMutation,
      updateVitalPointMutation,
      deleteVitalPointMutation,
      addBPPointMutation,
      updateBPPointMutation,
      createMedicationMutation,
      updateMedicationMutation,
      deleteMedicationMutation,
      createVentilationModeMutation,
      updateVentilationModeMutation,
      deleteVentilationModeMutation,
      createEventMutation,
      updateEventMutation,
      deleteEventMutation,
      createOutputMutation,
      updateOutputMutation,
      deleteOutputMutation,
      anesthesiaRecordId,
      patientWeight,
      data,
      swimlanes,
      anesthesiaItems,
      administrationGroups,
    }),
    [
      vitalsState,
      medicationState,
      ventilationState,
      eventState,
      outputState,
      currentTime,
      chartInitTime,
      currentZoomStart,
      currentZoomEnd,
      currentVitalsSnapInterval,
      currentDrugSnapInterval,
      isDark,
      collapsedSwimlanes,
      activeToolMode,
      addVitalPointMutation,
      updateVitalPointMutation,
      deleteVitalPointMutation,
      addBPPointMutation,
      updateBPPointMutation,
      createMedicationMutation,
      updateMedicationMutation,
      deleteMedicationMutation,
      createVentilationModeMutation,
      updateVentilationModeMutation,
      deleteVentilationModeMutation,
      createEventMutation,
      updateEventMutation,
      deleteEventMutation,
      createOutputMutation,
      updateOutputMutation,
      deleteOutputMutation,
      anesthesiaRecordId,
      patientWeight,
      data,
      swimlanes,
      anesthesiaItems,
      administrationGroups,
    ]
  );

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

/**
 * useTimelineContext Hook
 * 
 * Hook for consuming the TimelineContext. Must be used within a TimelineContextProvider.
 * Provides access to all timeline state, mutations, and utilities.
 * 
 * @throws {Error} If used outside of TimelineContextProvider
 * 
 * @example
 * ```tsx
 * function MyTimelineComponent() {
 *   const {
 *     vitalsState,
 *     currentTime,
 *     addVitalPointMutation,
 *     formatTime,
 *   } = useTimelineContext();
 *   
 *   // Use the context...
 * }
 * ```
 */
export function useTimelineContext(): TimelineContextValue {
  const context = useContext(TimelineContext);
  
  if (context === undefined) {
    throw new Error(
      'useTimelineContext must be used within a TimelineContextProvider. ' +
      'Make sure your component is wrapped with <TimelineContextProvider>.'
    );
  }
  
  return context;
}
