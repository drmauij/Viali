import { createContext, useContext, useMemo, ReactNode } from 'react';
import { formatTime as formatTimeUtil } from '@/lib/dateUtils';
import {
  snapToInterval,
  calculateSnapInterval,
  estimateSnapIntervalFromRange,
} from '@/utils/timelineUtils';
import type { UseVitalsStateReturn } from '@/hooks/useVitalsState';
import type { UseMedicationStateReturn } from '@/hooks/useMedicationState';
import type { UseVentilationStateReturn } from '@/hooks/useVentilationState';
import type { UseEventStateReturn } from '@/hooks/useEventState';
import type { UseOutputStateReturn } from '@/hooks/useOutputState';
import type { UseInventoryCommitStateReturn } from '@/hooks/useInventoryCommitState';
import {
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
  administrationUnit?: string | null;
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
  medicationSortOrder?: number | null;
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
  inventoryCommitState: UseInventoryCommitStateReturn;
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
  blendSequenceStep: 'sys' | 'dia' | 'hr' | 'spo2';
  setBlendSequenceStep: (step: 'sys' | 'dia' | 'hr' | 'spo2') => void;
  bpEntryMode: 'sys' | 'dia';
  setBpEntryMode: (mode: 'sys' | 'dia') => void;
  pendingSysValue: { time: number; value: number } | null;
  setPendingSysValue: (value: { time: number; value: number } | null) => void;
  isProcessingClick: boolean;
  setIsProcessingClick: (processing: boolean) => void;
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
  saveTimeMarkersMutation?: any;
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
  vitalsState: UseVitalsStateReturn;
  medicationState: UseMedicationStateReturn;
  ventilationState: UseVentilationStateReturn;
  eventState: UseEventStateReturn;
  outputState: UseOutputStateReturn;
  inventoryCommitState: UseInventoryCommitStateReturn;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  chartInitTime: number;
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
  blendSequenceStep: 'sys' | 'dia' | 'hr' | 'spo2';
  setBlendSequenceStep: (step: 'sys' | 'dia' | 'hr' | 'spo2') => void;
  bpEntryMode: 'sys' | 'dia';
  setBpEntryMode: (mode: 'sys' | 'dia') => void;
  pendingSysValue: { time: number; value: number } | null;
  setPendingSysValue: (value: { time: number; value: number } | null) => void;
  isProcessingClick: boolean;
  setIsProcessingClick: (processing: boolean) => void;
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
  saveTimeMarkersMutation?: any;
  anesthesiaItems: AnesthesiaItem[];
  administrationGroups: AdministrationGroup[];
  anesthesiaRecordId?: string;
  patientWeight?: number;
  data: UnifiedTimelineData;
  swimlanes: SwimlaneConfig[];
}

/**
 * TimelineContextProvider Component
 * 
 * Provides context wrapping for the UnifiedTimeline component and its children.
 * Accepts all state from UnifiedTimeline as props and makes it available through context.
 * This eliminates prop drilling while keeping UnifiedTimeline as the single source of truth.
 * 
 * @example
 * ```tsx
 * <TimelineContextProvider
 *   vitalsState={vitalsState}
 *   medicationState={medicationState}
 *   // ... all other state props
 * >
 *   Timeline swimlanes and components
 * </TimelineContextProvider>
 * ```
 */
export function TimelineContextProvider({
  children,
  vitalsState,
  medicationState,
  ventilationState,
  eventState,
  outputState,
  inventoryCommitState,
  currentTime,
  setCurrentTime,
  chartInitTime,
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
  blendSequenceStep,
  setBlendSequenceStep,
  bpEntryMode,
  setBpEntryMode,
  pendingSysValue,
  setPendingSysValue,
  isProcessingClick,
  setIsProcessingClick,
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
  saveTimeMarkersMutation,
  anesthesiaItems,
  administrationGroups,
  anesthesiaRecordId,
  patientWeight,
  data,
  swimlanes,
}: TimelineContextProviderProps) {
  const value = useMemo<TimelineContextValue>(
    () => ({
      vitalsState,
      medicationState,
      ventilationState,
      eventState,
      outputState,
      inventoryCommitState,
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
      blendSequenceStep,
      setBlendSequenceStep,
      bpEntryMode,
      setBpEntryMode,
      pendingSysValue,
      setPendingSysValue,
      isProcessingClick,
      setIsProcessingClick,
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
      saveTimeMarkersMutation,
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
      setCurrentTime,
      chartInitTime,
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
      blendSequenceStep,
      setBlendSequenceStep,
      bpEntryMode,
      setBpEntryMode,
      pendingSysValue,
      setPendingSysValue,
      isProcessingClick,
      setIsProcessingClick,
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
      saveTimeMarkersMutation,
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
