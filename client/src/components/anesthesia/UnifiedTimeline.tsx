import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Heart, CircleDot, Blend, Plus, X, ChevronDown, ChevronRight, Undo2, Clock, Monitor, ChevronsDownUp, MessageSquareText, Trash2, Pencil, StopCircle, PlayCircle, Droplet, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StickyTimelineHeader } from "./StickyTimelineHeader";
import { MedicationConfigDialog } from "./MedicationConfigDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useQuery, useMutation } from "@tanstack/react-query";
import { saveMedication, saveTimeMarkers } from "@/services/timelinePersistence";
import { queryClient } from "@/lib/queryClient";
import { useVitalsState } from "@/hooks/useVitalsState";
import { useMedicationState } from "@/hooks/useMedicationState";
import { useVentilationState } from "@/hooks/useVentilationState";
import { useEventState } from "@/hooks/useEventState";
import { useOutputState } from "@/hooks/useOutputState";
import { 
  useClinicalSnapshot, 
  useAddVitalPoint, 
  useAddBPPoint, 
  useUpdateVitalPoint, 
  useUpdateBPPoint,
  useDeleteVitalPoint,
  convertToLegacyFormat 
} from "@/hooks/useVitalsQuery";
import type { MonitorAnalysisResult } from "@shared/monitorParameters";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";
import { TimeAdjustInput } from "./TimeAdjustInput";
import { formatTime } from "@/lib/dateUtils";
import {
  ONE_MINUTE,
  FIVE_MINUTES,
  TEN_MINUTES,
  THIRTY_MINUTES,
  ZOOM_LEVELS,
  findClosestZoomLevel,
  snapToInterval,
  calculateSnapInterval,
  estimateSnapIntervalFromRange,
  calculateZoomPercentages,
  calculatePanPercentages,
  calculateNowLinePosition,
} from "@/utils/timelineUtils";
import {
  createLucideIconSeries,
  CHART_LAYOUT,
  getChartColors,
} from "@/utils/chartUtils";
import {
  calculateSimilarity,
  extractDrugName,
  isFreeFlowInfusion,
} from "@/utils/stringUtils";
import {
  buildItemToSwimlaneMap,
  transformMedicationDoses,
  transformRateInfusions,
  transformFreeFlowInfusions,
} from "@/services/timelineTransform";

/**
 * UnifiedTimeline - Refactored for robustness and flexibility
 * 
 * Features:
 * - Dynamic swimlanes - easy to add/remove at runtime
 * - Consistent vertical grid lines across all swimlanes
 * - Simplified configuration with centralized swimlane definitions
 * - Dark/light theme support
 */

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export type TimelineVitals = {
  hr?: VitalPoint[];
  sysBP?: VitalPoint[];
  diaBP?: VitalPoint[];
  spo2?: VitalPoint[];
};

export type TimelineEvent = {
  time: number; // ms
  swimlane: string; // Now flexible - any swimlane id
  label: string;
  icon?: string;
  color?: string;
  duration?: number; // ms - for range items like infusions
  row?: number; // for multiple medication rows
};

// EventComment and AnesthesiaTimeMarker types imported from useEventState hook
import type { EventComment, AnesthesiaTimeMarker } from "@/hooks/useEventState";

// Infusion segment - represents a single rate period
export type InfusionSegment = {
  id: string;
  startTime: number; // ms
  rateValue: string; // e.g., "100ml/h", "5µg/kg/min", or "" for free-flow
  rateUnit?: string;
  note?: string;
  setBy?: string; // user who set this rate
  endTime: number | null; // null if ongoing
};

// Infusion session - represents a continuous infusion (start to stop)
export type InfusionSession = {
  id: string;
  swimlaneId: string;
  drugName: string; // e.g., "Propofol 1%"
  startedBy?: string;
  startTime: number; // ms
  isFreeFlow: boolean; // true = dashed line, false = solid line
  segments: InfusionSegment[]; // rate changes over time
  stopTime: number | null; // null if still running
  stoppedBy?: string;
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
  medications?: any[]; // Raw medication records from API
  apiEvents?: any[]; // Raw event records from API (renamed to avoid conflict with timeline events)
};

// Predefined anesthesia time markers in sequence (type imported from useEventState hook)
export const ANESTHESIA_TIME_MARKERS: Omit<AnesthesiaTimeMarker, 'time'>[] = [
  { id: 'A1', code: 'A1', label: 'Anesthesia Presence Start', color: '#FFFFFF', bgColor: '#EF4444' }, // Red
  { id: 'E', code: 'E', label: 'OR Entrance', color: '#FFFFFF', bgColor: '#10B981' }, // Green
  { id: 'X1', code: 'X1', label: 'Anesthesia Start', color: '#FFFFFF', bgColor: '#F97316' }, // Orange
  { id: 'I', code: 'I', label: 'End of Induction', color: '#FFFFFF', bgColor: '#F59E0B' }, // Amber
  { id: 'L', code: 'L', label: 'Patient Positioning', color: '#FFFFFF', bgColor: '#3B82F6' }, // Blue
  { id: 'B1', code: 'B1', label: 'Surgical Measures Start', color: '#000000', bgColor: '#06B6D4' }, // Cyan
  { id: 'O1', code: 'O1', label: 'Surgical Incision', color: '#FFFFFF', bgColor: '#8B5CF6' }, // Purple
  { id: 'O2', code: 'O2', label: 'Surgical Suture', color: '#FFFFFF', bgColor: '#8B5CF6' }, // Purple
  { id: 'B2', code: 'B2', label: 'Surgical Measures End', color: '#000000', bgColor: '#06B6D4' }, // Cyan
  { id: 'X2', code: 'X2', label: 'Anesthesia End', color: '#FFFFFF', bgColor: '#F97316' }, // Orange
  { id: 'X', code: 'X', label: 'OR Exit', color: '#FFFFFF', bgColor: '#10B981' }, // Green
  { id: 'A2', code: 'A2', label: 'Anesthesia Presence End', color: '#FFFFFF', bgColor: '#EF4444' }, // Red
  { id: 'P', code: 'P', label: 'PACU End', color: '#FFFFFF', bgColor: '#EC4899' }, // Pink
];

// InfusionPill Component - Unified horizontal bar for both free-flow and rate-based infusions
type InfusionPillProps = {
  startTime: number;
  endTime: number;
  rate: string;
  isFreeFlow: boolean;
  isBeforeNow: boolean;
  isAfterNow: boolean;
  crossesNow: boolean;
  currentTime: number;
  onLabelClick: () => void;
  onSegmentClick: () => void;
  leftPercent: number;
  widthPercent: number;
  yPosition: number;
  isDark: boolean;
  rateUnit?: string;
  testId: string;
};

const InfusionPill = ({
  startTime,
  endTime,
  rate,
  isFreeFlow,
  isBeforeNow,
  isAfterNow,
  crossesNow,
  currentTime,
  onLabelClick,
  onSegmentClick,
  leftPercent,
  widthPercent,
  yPosition,
  isDark,
  rateUnit,
  testId,
}: InfusionPillProps) => {
  const isStopMarker = rate === "";
  
  // Don't render pills for stop markers
  if (isStopMarker) return null;
  
  // Determine color based on time position - subtle teal for past, gray for future
  const pillColor = isBeforeNow 
    ? (isDark ? '#14b8a6' : '#0d9488')  // Teal (past)
    : (isDark ? '#94a3b8' : '#64748b'); // Slate gray (future)
  
  // Different styles for free-flow vs rate-based - all subtle with thin borders
  const pillStyle: React.CSSProperties = isFreeFlow ? {
    // Free-flow: Subtle diagonal stripes + thin dashed border
    background: `repeating-linear-gradient(
      45deg,
      ${pillColor}0D,
      ${pillColor}0D 6px,
      ${pillColor}1A 6px,
      ${pillColor}1A 12px
    )`,
    border: `1px dashed ${pillColor}`,  // Thin dashed border
    borderRadius: '6px',
  } : {
    // Rate-based: Very subtle solid background + thin border
    background: `${pillColor}1A`,  // 10% opacity
    border: `1px solid ${pillColor}`,  // Thin border
    borderRadius: '6px',
  };
  
  return (
    <div
      className="absolute flex items-center overflow-hidden"
      style={{
        left: `calc(200px + ${leftPercent}%)`,
        width: `calc(${widthPercent}% * (100% - 210px) / 100)`,
        top: `${yPosition}px`,
        height: '32px',
        zIndex: 40,
        ...pillStyle,
      }}
      data-testid={testId}
    >
      {/* Label Click Zone (left ~30% of pill) - Emphasized */}
      <div
        className="flex items-center justify-center cursor-pointer hover:shadow-sm transition-all px-2 h-full shrink-0"
        style={{
          minWidth: '60px',
          maxWidth: '30%',
          borderRight: `1px solid ${pillColor}4D`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onLabelClick();
        }}
        data-testid={`${testId}-label`}
      >
        <span className="text-sm font-semibold truncate" style={{ color: pillColor }}>
          {rate}
          {rateUnit && ` ${rateUnit}`}
        </span>
      </div>
      
      {/* Segment Click Zone (right ~70% of pill) */}
      <div
        className="flex-1 flex items-center justify-center cursor-pointer hover:shadow-sm transition-all px-2 h-full gap-1"
        onClick={(e) => {
          e.stopPropagation();
          onSegmentClick();
        }}
        data-testid={`${testId}-segment`}
      >
        {isFreeFlow ? (
          <Droplet className="w-4 h-4 flex-shrink-0" style={{ color: pillColor, strokeWidth: 2 }} />
        ) : null}
        <span className="text-xs font-medium truncate" style={{ color: pillColor }}>
          {isFreeFlow ? 'Free Flow' : 'Running'}
        </span>
      </div>
    </div>
  );
};

// BolusPill Component - Horizontal bar for bolus medication administration
type BolusPillProps = {
  timestamp: number;
  dose: string;
  isBeforeNow: boolean;
  onClick: () => void;
  leftPercent: number;
  yPosition: number;
  isDark: boolean;
  testId: string;
};

const BolusPill = ({
  timestamp,
  dose,
  isBeforeNow,
  onClick,
  leftPercent,
  yPosition,
  isDark,
  testId,
}: BolusPillProps) => {
  // Determine color based on time position - subtle teal for past, gray for future
  const pillColor = isBeforeNow 
    ? (isDark ? '#14b8a6' : '#0d9488')  // Teal (past)
    : (isDark ? '#94a3b8' : '#64748b'); // Slate gray (future)
  
  // Subtle background with thin border, emphasis on label
  const pillStyle: React.CSSProperties = {
    background: `${pillColor}1A`,  // 10% opacity - very subtle
    border: `1px solid ${pillColor}`,  // Thin border
    borderRadius: '6px',
  };
  
  return (
    <div
      className="absolute flex items-center justify-center overflow-hidden cursor-pointer hover:shadow-md transition-all px-3"
      style={{
        left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100) - 30px)`,
        width: '60px', // Fixed width for bolus pills
        top: `${yPosition}px`,
        height: '32px',
        zIndex: 40,
        ...pillStyle,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      <span className="text-sm font-semibold truncate" style={{ color: pillColor }}>
        {dose}
      </span>
    </div>
  );
};

// Centralized swimlane configuration - easy to add/remove swimlanes
type SwimlaneConfig = {
  id: string;
  label: string;
  height: number;
  colorLight: string;
  colorDark: string;
  // Metadata for anesthesia items
  // rateUnit determines item type: null = bolus, "free" = free-flow infusion, other = rate-controlled pump
  rateUnit?: string | null;
  defaultDose?: string | null; // Default dose value (e.g., "12" or "25-35-50" for ranges)
  itemId?: string; // Reference to the original item
  hierarchyLevel?: 'parent' | 'group' | 'item'; // For three-level hierarchy styling
};

// Type for anesthesia-configured items
type AnesthesiaItem = {
  id: string;
  name: string;
  administrationUnit?: string;
  administrationRoute?: string;
  ampuleConcentration?: string;
  ampuleTotalContent?: string;
  medicationGroup?: string;
  rateUnit?: string | null; // null = bolus, "free" = free-flow infusion, other = rate-controlled pump
  administrationGroup?: string;
  defaultDose?: string | null;
};

// Type for administration groups
type AdministrationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

export function UnifiedTimeline({
  data,
  height,
  swimlanes, // Optional: allow custom swimlane configuration
  now, // Current time for determining editable zones and initial zoom
  patientWeight, // Patient weight in kg for default ventilation calculations
  anesthesiaRecordId, // Anesthesia record ID for auto-saving vitals
  anesthesiaRecord, // Full anesthesia record for loading saved data (time markers, etc.)
}: {
  data: UnifiedTimelineData;
  height?: number;
  swimlanes?: SwimlaneConfig[];
  now?: number;
  patientWeight?: number;
  anesthesiaRecordId?: string;
  anesthesiaRecord?: any;
}) {
  const chartRef = useRef<any>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const { toast } = useToast();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();

  // Fetch configured anesthesia items from inventory
  const { data: allAnesthesiaItems = [] } = useQuery<AnesthesiaItem[]>({
    queryKey: [`/api/anesthesia/items/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch administration groups
  const { data: administrationGroups = [] } = useQuery<AdministrationGroup[]>({
    queryKey: [`/api/administration-groups/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Filter to only show items with an administration group assigned
  const anesthesiaItems = useMemo(() => {
    return allAnesthesiaItems.filter(item => item.administrationGroup);
  }, [allAnesthesiaItems]);
  
  // Mutation for saving medication doses - now using centralized persistence service
  const saveMedicationMutation = useMutation({
    mutationFn: saveMedication,
    onSuccess: (data, variables) => {
      console.log('[MEDICATION] Save successful', { data, variables });
      // Don't invalidate query - we'll manually update local state instead
      // This prevents the 404 response from clearing our data
    },
    onError: (error) => {
      console.error('[MEDICATION] Save failed', error);
      toast({
        title: "Error saving medication",
        description: error instanceof Error ? error.message : "Failed to save medication",
        variant: "destructive",
      });
    },
  });

  // Mutation for saving time markers
  const saveTimeMarkersMutation = useMutation({
    mutationFn: saveTimeMarkers,
    onSuccess: (data) => {
      console.log('[TIME_MARKERS] Save successful', data);
      // Invalidate the anesthesia record query to refetch with updated time markers
      if (anesthesiaRecordId) {
        const surgeryId = data.surgeryId;
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
      }
    },
    onError: (error) => {
      console.error('[TIME_MARKERS] Save failed', error);
      toast({
        title: "Error saving time markers",
        description: error instanceof Error ? error.message : "Failed to save time markers",
        variant: "destructive",
      });
    },
  });
  
  // State for collapsible parent swimlanes
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set());
  
  // Use custom hook for medication state management
  const {
    medicationDoseData,
    infusionData,
    rateInfusionSessions,
    freeFlowSessions,
    setMedicationDoseData,
    setInfusionData,
    setRateInfusionSessions,
    setFreeFlowSessions,
    getActiveRateSession,
    getActiveFreeFlowSession,
    resetMedicationData,
  } = useMedicationState({
    doses: {},
    infusions: {},
    rateSessions: {},
    freeFlowSessions: {},
  });

  // State for current time indicator - updates every minute
  const [currentTime, setCurrentTime] = useState<number>(now || Date.now());
  
  // State for chart initialization time - fixed when chart first starts
  // Used to calculate the fixed past editable boundary
  const [chartInitTime] = useState<number>(now || Date.now());
  
  // State for tracking current zoom/pan range - will be initialized from dataZoom
  const [currentZoomStart, setCurrentZoomStart] = useState<number | undefined>(undefined);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number | undefined>(undefined);
  
  // State for NOW line horizontal position (as percentage string for CSS)
  const [nowLinePosition, setNowLinePosition] = useState<string>('0%');
  
  // Track if this is the first render to skip NOW line animation on initial load
  const isNowLineFirstRenderRef = useRef(true);
  
  // State for tracking snap intervals (in milliseconds)
  // Vitals and ventilation: zoom-dependent (1min, 5min, or 10min based on zoom level)
  // Medications and events: always 1 minute
  const [currentVitalsSnapInterval, setCurrentVitalsSnapInterval] = useState<number>(1 * 60 * 1000);
  const [currentDrugSnapInterval] = useState<number>(1 * 60 * 1000); // Always 1 minute
  
  // State to trigger graphics regeneration on scroll/zoom
  const [graphicsRevision, setGraphicsRevision] = useState<number>(0);

  // State for interactive vital entry
  const [activeToolMode, setActiveToolMode] = useState<'hr' | 'bp' | 'spo2' | 'blend' | 'edit' | null>(null);
  const [blendSequenceStep, setBlendSequenceStep] = useState<'sys' | 'dia' | 'hr' | 'spo2'>('sys');
  
  // State for edit mode - dragging and repositioning existing vitals
  const [selectedPoint, setSelectedPoint] = useState<{
    type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2';
    index: number;
    originalTime: number;
    originalValue: number;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ time: number; value: number } | null>(null);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0); // Track last touch to prevent duplicate mouse events
  
  // NEW: Fetch clinical snapshot with React Query (single source of truth)
  const { data: clinicalSnapshot } = useClinicalSnapshot(anesthesiaRecordId);
  
  // NEW: Get mutation hooks for point-based CRUD
  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId);
  const addBPPointMutation = useAddBPPoint(anesthesiaRecordId);
  const updateVitalPointMutation = useUpdateVitalPoint(anesthesiaRecordId);
  const updateBPPointMutation = useUpdateBPPoint(anesthesiaRecordId);
  const deleteVitalPointMutation = useDeleteVitalPoint(anesthesiaRecordId);
  
  // Convert React Query snapshot to legacy format for ECharts
  const legacyVitals = useMemo(() => {
    return convertToLegacyFormat(clinicalSnapshot);
  }, [clinicalSnapshot]);
  
  // Use custom hook for vitals state management (fed from React Query)
  const {
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    hrDataPointsRef,
    bpDataPointsRef,
    spo2DataPointsRef,
    setHrDataPoints,
    setBpDataPoints,
    setSpo2DataPoints,
    resetVitalsData,
  } = useVitalsState({
    hr: legacyVitals.hr,
    sys: legacyVitals.sys,
    dia: legacyVitals.dia,
    spo2: legacyVitals.spo2,
  });
  
  // Use custom hook for ventilation state management
  const {
    ventilationData,
    ventilationModeData,
    setVentilationData,
    setVentilationModeData,
    resetVentilationData,
  } = useVentilationState({
    ventilation: {},
    modes: [],
  });
  
  // Use custom hook for output parameter state management
  const {
    outputData,
    setOutputData,
    resetOutputData,
  } = useOutputState();
  
  // Refs for edit mode to avoid recreating event listeners
  const selectedPointRef = useRef(selectedPoint);
  const dragPositionRef = useRef(dragPosition);
  
  // Imperative drag preview (bypass React state for performance)
  const dragPreviewRef = useRef<{ time: number; value: number } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  
  // Ref to track pending save timeout and prevent duplicate saves
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDataRef = useRef<string>(''); // Store stringified version of last saved data
  
  // Track first mount to always sync from API on initial load
  const isFirstMountRef = useRef(true);
  
  // Imperative function to update only the preview series without re-rendering React
  const updateDragPreviewImperatively = useCallback((previewPoint: VitalPoint | null, pointType: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2') => {
    const chartInstance = chartRef.current?.getEchartsInstance();
    if (!chartInstance) return;
    
    if (!previewPoint) {
      // Clear preview series
      chartInstance.setOption({
        series: [{
          id: 'hr-icons-preview',
          data: []
        }]
      }, false, true); // notMerge: false, lazyUpdate: true
      return;
    }
    
    // Update only the preview series based on point type
    if (pointType === 'hr') {
      const hrPreviewSeries: any = createLucideIconSeries(
        'HR Preview',
        [previewPoint],
        VITAL_ICON_PATHS.heart.path,
        '#ef4444',
        0,
        16,
        150
      );
      hrPreviewSeries.id = 'hr-icons-preview';
      
      chartInstance.setOption({
        series: [hrPreviewSeries]
      }, false, true); // notMerge: false, replaceMerge on this series only
    }
    // Add other types (bp-sys, bp-dia, spo2) as needed
  }, []);
  
  // Keep refs in sync with state
  useEffect(() => { selectedPointRef.current = selectedPoint; }, [selectedPoint]);
  useEffect(() => { dragPositionRef.current = dragPosition; }, [dragPosition]);
  
  // NEW: Sync React Query snapshot into local state (conversion layer)
  // React Query is the single source of truth - local state is just a view layer for ECharts
  useEffect(() => {
    if (!legacyVitals) return;
    
    console.log('[VITALS-SYNC] Syncing vitals from React Query to local state', { 
      recordId: anesthesiaRecordId,
      hrCount: legacyVitals.hr.length,
      bpCount: legacyVitals.sys.length,
      spo2Count: legacyVitals.spo2.length
    });
    
    // Always sync from React Query - it's the source of truth
    // This ensures optimistic updates from mutations propagate to the UI
    resetVitalsData({ 
      hr: legacyVitals.hr, 
      sys: legacyVitals.sys, 
      dia: legacyVitals.dia, 
      spo2: legacyVitals.spo2 
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyVitals, anesthesiaRecordId]);
  
  // NEW: Auto-save removed - vitals are now saved immediately via point-based mutations
  // Each add/edit/delete operation triggers its own optimistic mutation with React Query
  // This eliminates the O(n²) snapshot aggregation that was blocking UI for 700-900ms

  // Track last synced record ID for medications
  const lastSyncedMedicationRecordRef = useRef<string | undefined>(undefined);
  
  // Auto-load medications from API data ONLY when:
  // 1. First mount (lastSyncedMedicationRecordRef.current === undefined)
  // 2. Switching to a different record (anesthesiaRecordId changed)
  useEffect(() => {
    // Skip if items not loaded yet
    if (!anesthesiaItems || anesthesiaItems.length === 0) return;
    
    // Check if we should sync (first mount OR different record)
    const shouldSync = lastSyncedMedicationRecordRef.current === undefined || lastSyncedMedicationRecordRef.current !== anesthesiaRecordId;
    
    if (!shouldSync) {
      console.log('[MED-SYNC] Skipping sync - already loaded this record', { recordId: anesthesiaRecordId });
      return;
    }
    
    console.log('[MED-SYNC] Syncing medications from API', { 
      hasMedications: !!data.medications,
      medicationCount: data.medications?.length,
      recordId: anesthesiaRecordId,
      isFirstMount: lastSyncedMedicationRecordRef.current === undefined
    });
    
    // Update the ref to track this record as synced
    lastSyncedMedicationRecordRef.current = anesthesiaRecordId;
    
    // Build item-to-swimlane mapping
    const itemToSwimlane = buildItemToSwimlaneMap(anesthesiaItems, administrationGroups);
    
    // Transform and load medication doses (boluses) - will be empty array if no data
    const doses = transformMedicationDoses(data.medications || [], itemToSwimlane);
    
    // Transform and load rate infusion sessions
    const rateSessions = transformRateInfusions(data.medications || [], itemToSwimlane, anesthesiaItems);
    
    // Transform and load free-flow infusion sessions
    const freeFlowSessionsData = transformFreeFlowInfusions(data.medications || [], itemToSwimlane, anesthesiaItems);
    
    // Reset medication data using hook
    resetMedicationData({
      doses,
      rateSessions,
      freeFlowSessions: freeFlowSessionsData,
    });
    
    console.log('[MED-SYNC] Medication state initialized');
    
    // Note: Events are already handled via data.events prop for timeline rendering
    // No need to process data.apiEvents separately for now
  }, [data.medications, anesthesiaItems, administrationGroups, anesthesiaRecordId, resetMedicationData]);

  // Event state management hook (heart rhythm, staff, position, events, time markers)
  const {
    heartRhythmData,
    staffData,
    positionData,
    eventComments,
    timeMarkers,
    setHeartRhythmData,
    setStaffData,
    setPositionData,
    setEventComments,
    setTimeMarkers,
    addHeartRhythm,
    addStaffEntry,
    addPosition,
    addEvent,
    resetEventData,
  } = useEventState({
    timeMarkers: ANESTHESIA_TIME_MARKERS.map(marker => ({ ...marker, time: null }))
  });

  // Load time markers from database when anesthesia record is fetched
  useEffect(() => {
    if (anesthesiaRecord?.timeMarkers && Array.isArray(anesthesiaRecord.timeMarkers)) {
      console.log('[TIME_MARKERS] Loading from database:', anesthesiaRecord.timeMarkers);
      setTimeMarkers(anesthesiaRecord.timeMarkers);
    }
  }, [anesthesiaRecord, setTimeMarkers]);

  // UI state for heart rhythm dialogs and interactions
  const [showHeartRhythmDialog, setShowHeartRhythmDialog] = useState(false);
  const [pendingHeartRhythm, setPendingHeartRhythm] = useState<{ time: number } | null>(null);
  const [editingHeartRhythm, setEditingHeartRhythm] = useState<{ time: number; rhythm: string; index: number } | null>(null);
  const [heartRhythmInput, setHeartRhythmInput] = useState("");
  const [heartRhythmEditTime, setHeartRhythmEditTime] = useState<number>(0);
  const [heartRhythmHoverInfo, setHeartRhythmHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);

  // UI state for staff dialogs and interactions
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [pendingStaff, setPendingStaff] = useState<{ time: number; role: 'doctor' | 'nurse' | 'assistant' } | null>(null);
  const [editingStaff, setEditingStaff] = useState<{ time: number; name: string; role: 'doctor' | 'nurse' | 'assistant'; index: number } | null>(null);
  const [staffInput, setStaffInput] = useState("");
  const [staffEditTime, setStaffEditTime] = useState<number>(Date.now());
  const [staffHoverInfo, setStaffHoverInfo] = useState<{ x: number; y: number; time: number; role: string } | null>(null);

  // UI state for position dialogs and interactions
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ time: number } | null>(null);
  const [editingPosition, setEditingPosition] = useState<{ time: number; position: string; index: number } | null>(null);
  const [positionInput, setPositionInput] = useState("");
  const [positionEditTime, setPositionEditTime] = useState<number>(Date.now());
  const [positionHoverInfo, setPositionHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);

  // UI state for event comment dialogs and interactions
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<{ time: number } | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventComment | null>(null);
  const [eventTextInput, setEventTextInput] = useState("");
  const [eventEditTime, setEventEditTime] = useState<number>(Date.now());
  const [eventHoverInfo, setEventHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: EventComment; x: number; y: number } | null>(null);

  // State for medication dose edit dialog
  const [showMedicationEditDialog, setShowMedicationEditDialog] = useState(false);
  const [editingMedicationDose, setEditingMedicationDose] = useState<{ swimlaneId: string; time: number; dose: string; index: number } | null>(null);
  const [medicationEditInput, setMedicationEditInput] = useState("");
  const [medicationEditTime, setMedicationEditTime] = useState<number>(Date.now());

  // State for ventilation value edit dialog
  const [showVentilationEditDialog, setShowVentilationEditDialog] = useState(false);
  const [editingVentilationValue, setEditingVentilationValue] = useState<{ paramKey: keyof typeof ventilationData; time: number; value: string; index: number; label: string } | null>(null);
  const [ventilationEditInput, setVentilationEditInput] = useState("");
  const [ventilationEditTime, setVentilationEditTime] = useState<number>(0);

  // State for ventilation mode edit dialog
  const [showVentilationModeEditDialog, setShowVentilationModeEditDialog] = useState(false);
  const [editingVentilationMode, setEditingVentilationMode] = useState<{ time: number; mode: string; index: number } | null>(null);
  const [ventilationModeEditInput, setVentilationModeEditInput] = useState("");
  const [ventilationModeEditTime, setVentilationModeEditTime] = useState<number>(0);

  // State for ventilation bulk entry dialog
  const [showVentilationBulkDialog, setShowVentilationBulkDialog] = useState(false);
  const [pendingVentilationBulk, setPendingVentilationBulk] = useState<{ time: number } | null>(null);
  const [ventilationMode, setVentilationMode] = useState("PCV - druckkontrolliert");
  const [bulkVentilationParams, setBulkVentilationParams] = useState({
    peep: "5",
    fiO2: "40",
    tidalVolume: "",
    respiratoryRate: "12",
    etCO2: "35",
    pip: "",
    minuteVolume: "",
  });
  const [ventilationBulkHoverInfo, setVentilationBulkHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  
  // State for output bulk entry dialog
  const [showOutputBulkDialog, setShowOutputBulkDialog] = useState(false);
  const [pendingOutputBulk, setPendingOutputBulk] = useState<{ time: number } | null>(null);
  const [bulkOutputParams, setBulkOutputParams] = useState({
    gastricTube: "",
    drainage: "",
    vomit: "",
    urine: "",
    urine677: "",
    blood: "",
    bloodIrrigation: "",
  });
  const [outputBulkHoverInfo, setOutputBulkHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  
  // State for output value add dialog (single value)
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [pendingOutputValue, setPendingOutputValue] = useState<{ paramKey: keyof typeof outputData; time: number; label: string } | null>(null);
  const [outputValueInput, setOutputValueInput] = useState("");
  const [outputHoverInfo, setOutputHoverInfo] = useState<{ x: number; y: number; time: number; paramKey: keyof typeof outputData; label: string } | null>(null);
  
  // State for output value edit dialog
  const [showOutputEditDialog, setShowOutputEditDialog] = useState(false);
  const [editingOutputValue, setEditingOutputValue] = useState<{ paramKey: keyof typeof outputData; time: number; value: string; index: number; label: string } | null>(null);
  const [outputEditInput, setOutputEditInput] = useState("");
  const [outputEditTime, setOutputEditTime] = useState<number>(0);
  
  const [infusionHoverInfo, setInfusionHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showInfusionDialog, setShowInfusionDialog] = useState(false);
  const [pendingInfusionValue, setPendingInfusionValue] = useState<{ swimlaneId: string; time: number; label: string } | null>(null);
  const [infusionInput, setInfusionInput] = useState("");
  const [showInfusionEditDialog, setShowInfusionEditDialog] = useState(false);
  const [editingInfusionValue, setEditingInfusionValue] = useState<{ swimlaneId: string; time: number; value: string; index: number } | null>(null);
  const [infusionEditInput, setInfusionEditInput] = useState("");
  const [infusionEditTime, setInfusionEditTime] = useState<number>(0);
  
  // State for unified Free-Flow Infusion Sheet
  const [showFreeFlowSheet, setShowFreeFlowSheet] = useState(false);
  const [freeFlowSheetSession, setFreeFlowSheetSession] = useState<{
    swimlaneId: string;
    startTime: number;
    dose: string;
    label: string;
    clickMode?: 'segment' | 'label';
  } | null>(null);
  const [sheetDoseInput, setSheetDoseInput] = useState("");
  const [sheetTimeInput, setSheetTimeInput] = useState<number>(0);
  
  // Type definitions for infusion sessions (managed by useMedicationState hook)
  type FreeFlowSession = {
    swimlaneId: string;
    startTime: number;
    dose: string;
    label: string;
  };
  
  // State for free-flow dose entry dialog (first click, no default dose)
  const [showFreeFlowDoseDialog, setShowFreeFlowDoseDialog] = useState(false);
  const [pendingFreeFlowDose, setPendingFreeFlowDose] = useState<{ swimlaneId: string; time: number; label: string } | null>(null);
  const [freeFlowDoseInput, setFreeFlowDoseInput] = useState("");
  
  // State for rate-based infusion sessions (map swimlaneId to active session info)
  type RateInfusionSegment = {
    startTime: number;
    rate: string; // numeric rate value
    rateUnit: string; // ml/h, μg/kg/min, etc.
  };
  
  type RateInfusionSession = {
    swimlaneId: string;
    label: string;
    syringeQuantity: string; // total amount in syringe (e.g., "50ml")
    segments: RateInfusionSegment[]; // array of rate changes over time
    state: 'running' | 'paused' | 'stopped'; // infusion state
    startTime?: number;
    endTime?: number | null;
  };
  
  // Helper: Get active/latest session from array (using hook's function)
  const getActiveSession = getActiveRateSession;
  
  // State for unified Rate Infusion Sheet
  const [showRateSheet, setShowRateSheet] = useState(false);
  const [rateSheetSession, setRateSheetSession] = useState<{
    swimlaneId: string;
    label: string;
    clickMode: 'segment' | 'label'; // segment = change rate, label = edit
    rateUnit: string; // from medication config
    defaultDose?: string; // e.g., "4-10-16" for rate presets
  } | null>(null);
  const [sheetRateInput, setSheetRateInput] = useState("");
  const [sheetRateTimeInput, setSheetRateTimeInput] = useState<number>(0);
  const [sheetQuantityInput, setSheetQuantityInput] = useState(""); // for Start New
  
  // State for free-flow management dialog (second click on existing session)
  const [showFreeFlowManageDialog, setShowFreeFlowManageDialog] = useState(false);
  const [managingFreeFlowSession, setManagingFreeFlowSession] = useState<FreeFlowSession | null>(null);
  const [freeFlowManageTime, setFreeFlowManageTime] = useState<number>(0);
  
  // State for rate-controlled infusion rate selection dialog (range defaults like "6-12-16")
  const [showRateSelectionDialog, setShowRateSelectionDialog] = useState(false);
  const [pendingRateSelection, setPendingRateSelection] = useState<{ 
    swimlaneId: string; 
    time: number; 
    label: string;
    rateOptions: string[]; // parsed from defaultDose like "6-12-16"
  } | null>(null);
  const [customRateInput, setCustomRateInput] = useState("");
  
  // State for rate-controlled infusion management dialog (edit/stop/change existing rate)
  const [showRateManageDialog, setShowRateManageDialog] = useState(false);
  const [managingRate, setManagingRate] = useState<{
    swimlaneId: string;
    time: number;
    value: string;
    index: number;
    label: string;
    rateOptions?: string[]; // from defaultDose if available
  } | null>(null);
  const [rateManageTime, setRateManageTime] = useState<number>(0);
  const [rateManageInput, setRateManageInput] = useState("");
  
  // State for BP dual entry (systolic then diastolic)
  const [bpEntryMode, setBpEntryMode] = useState<'sys' | 'dia'>('sys');
  const [pendingSysValue, setPendingSysValue] = useState<{ time: number; value: number } | null>(null);
  const [isProcessingClick, setIsProcessingClick] = useState(false);
  
  // State for hover tooltip
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);
  
  // State for Zeiten hover tooltip
  const [zeitenHoverInfo, setZeitenHoverInfo] = useState<{ 
    x: number; 
    y: number; 
    time: number; 
    nextMarker: string | null;
    existingMarker?: { code: string; label: string; time: number };
  } | null>(null);

  // State for medication dose entry
  const [medicationHoverInfo, setMedicationHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showMedicationDoseDialog, setShowMedicationDoseDialog] = useState(false);
  const [pendingMedicationDose, setPendingMedicationDose] = useState<{ swimlaneId: string; time: number; label: string } | null>(null);
  const [medicationDoseInput, setMedicationDoseInput] = useState("");

  // State for administration group medication configuration dialog
  const [showMedicationConfigDialog, setShowMedicationConfigDialog] = useState(false);
  const [selectedAdminGroupForConfig, setSelectedAdminGroupForConfig] = useState<AdministrationGroup | null>(null);
  const [editingItemForConfig, setEditingItemForConfig] = useState<AnesthesiaItem | null>(null);
  const [adminGroupHoverInfo, setAdminGroupHoverInfo] = useState<{ x: number; y: number; groupName: string } | null>(null);

  // State for ventilation parameter entry
  const [ventilationHoverInfo, setVentilationHoverInfo] = useState<{ x: number; y: number; time: number; paramKey: keyof typeof ventilationData; label: string } | null>(null);
  const [showVentilationDialog, setShowVentilationDialog] = useState(false);
  const [pendingVentilationValue, setPendingVentilationValue] = useState<{ paramKey: keyof typeof ventilationData; time: number; label: string } | null>(null);
  const [ventilationValueInput, setVentilationValueInput] = useState("");

  // Touch device detection
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  
  // Track last action for undo
  const [lastAction, setLastAction] = useState<{
    type: 'hr' | 'bp' | 'spo2';
    data?: VitalPoint;
    bpData?: { sys: VitalPoint; dia: VitalPoint };
  } | null>(null);

  // State for edit dialog
  const [editingValue, setEditingValue] = useState<{
    type: 'hr' | 'sys' | 'dia' | 'spo2';
    time: number;
    value: number;
    index: number;
    originalTime: number;  // Track original timestamp for database lookups
  } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // UI state for time markers (data managed by useEventState hook)
  const [bulkEditDialogOpen, setBulkEditDialogOpen] = useState(false);
  const [editingTimeMarker, setEditingTimeMarker] = useState<{
    index: number;
    marker: AnesthesiaTimeMarker;
  } | null>(null);
  const [timeMarkerEditDialogOpen, setTimeMarkerEditDialogOpen] = useState(false);

  // State for AI-extracted data confirmation
  const [extractedData, setExtractedData] = useState<any>(null);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // Detect touch device on mount
  useEffect(() => {
    const checkTouch = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
  }, []);

  // Handle document-level mouse/touch events for edit mode drag operations
  // This allows dragging to continue even when mouse leaves the interactive overlay
  useEffect(() => {
    if (activeToolMode !== 'edit') {
      // Clear any dangling selection when exiting edit mode
      setSelectedPoint(null);
      setDragPosition(null);
      setHoverInfo(null);
      return;
    }
    
    const vitalsOverlay = document.querySelector('[data-vitals-overlay="true"]') as HTMLElement;
    if (!vitalsOverlay) return;
    
    // Prevent scroll on touchstart when in edit mode
    const handleTouchStart = (e: TouchEvent) => {
      if (activeToolMode === 'edit') {
        e.preventDefault();
      }
    };
    
    const handleDocumentMouseMove = (e: MouseEvent | TouchEvent) => {
      const currentSelected = selectedPointRef.current;
      if (!currentSelected) return;
      
      // Prevent default scroll behavior during touch drag
      if ('touches' in e) {
        e.preventDefault();
      }
      
      
      // Get bounding rect of the vitals interactive area
      const rect = vitalsOverlay.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      
      // Calculate value from mouse position (VERTICAL DRAG ONLY)
      // Time stays fixed to the original point's timestamp
      const time = currentSelected.originalTime;
      
      // Calculate value based on point type
      const yPercent = y / rect.height;
      let value: number;
      const isSpO2 = currentSelected.type === 'spo2';
      
      if (isSpO2) {
        const minVal = 45;
        const maxVal = 105;
        const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
        value = Math.min(rawValue, 100);
      } else {
        const minVal = 0;
        const maxVal = 240;
        value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      }
      
      // Store in ref for imperative updates
      dragPreviewRef.current = { time, value };
      setHoverInfo({ x: clientX, y: clientY, value, time });
      
      // Throttle chart updates using requestAnimationFrame
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const preview = dragPreviewRef.current;
          if (preview && currentSelected) {
            // Imperatively update only the preview series
            updateDragPreviewImperatively([preview.time, preview.value], currentSelected.type);
          }
        });
      }
      
    };
    
    const handleMouseUp = () => {
      const currentSelected = selectedPointRef.current;
      const currentDrag = dragPreviewRef.current; // Use preview ref instead of state
      
      
      // Cancel any pending RAF updates
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      // Clear drag preview imperatively
      updateDragPreviewImperatively(null, currentSelected?.type || 'hr');
      dragPreviewRef.current = null;
      
      if (!currentSelected || !currentDrag) {
        // Clear selection even if no drag happened
        setSelectedPoint(null);
        setDragPosition(null);
        setHoverInfo(null);
        return;
      }
      
      // NEW: Update via React Query mutations with point IDs
      // Map index to point ID from clinicalSnapshot
      if (!clinicalSnapshot?.data) {
        console.error('[EDIT] No clinical snapshot data available');
        setSelectedPoint(null);
        setDragPosition(null);
        setHoverInfo(null);
        return;
      }

      if (currentSelected.type === 'hr') {
        const pointId = clinicalSnapshot.data.hr?.[currentSelected.index]?.id;
        if (pointId) {
          updateVitalPointMutation.mutate({
            pointId,
            timestamp: new Date(currentDrag.time).toISOString(),
            value: currentDrag.value,
          });
        }
      } else if (currentSelected.type === 'bp-sys' || currentSelected.type === 'bp-dia') {
        // For BP, use special BP update mutation
        const bpPoint = clinicalSnapshot.data.bp?.[currentSelected.index];
        if (bpPoint) {
          const updates: any = {
            pointId: bpPoint.id,
            timestamp: new Date(currentDrag.time).toISOString(),
          };
          
          // Update only the value that was dragged (sys or dia)
          if (currentSelected.type === 'bp-sys') {
            updates.sys = currentDrag.value;
          } else {
            updates.dia = currentDrag.value;
          }
          
          updateBPPointMutation.mutate(updates);
        }
      } else if (currentSelected.type === 'spo2') {
        const pointId = clinicalSnapshot.data.spo2?.[currentSelected.index]?.id;
        if (pointId) {
          updateVitalPointMutation.mutate({
            pointId,
            timestamp: new Date(currentDrag.time).toISOString(),
            value: currentDrag.value,
          });
        }
      }
      
      // Clear selection and drag state
      setSelectedPoint(null);
      setDragPosition(null);
      setHoverInfo(null);
    };
    
    // Register stable event listeners only once when edit mode is active
    // Use { passive: false } to allow preventDefault() to work on touch events
    vitalsOverlay.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('touchmove', handleDocumentMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    
    return () => {
      vitalsOverlay.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('touchmove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [activeToolMode, currentZoomStart, currentZoomEnd, currentVitalsSnapInterval, data.startTime, data.endTime]); // Include dependencies for position calculation

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(Date.now());
    };

    // Update immediately if now prop changes
    if (now) {
      setCurrentTime(now);
    }

    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000); // 60000ms = 1 minute

    return () => clearInterval(interval);
  }, [now]);

  // Auto-calculate Minute Volume from Tidal Volume × Respiratory Rate
  useEffect(() => {
    const tidalVol = parseFloat(bulkVentilationParams.tidalVolume);
    const respRate = parseFloat(bulkVentilationParams.respiratoryRate);
    
    if (!isNaN(tidalVol) && !isNaN(respRate) && tidalVol > 0 && respRate > 0) {
      // Minute Volume (l/min) = (Tidal Volume in ml / 1000) × Respiratory Rate
      const minuteVol = (tidalVol / 1000) * respRate;
      const roundedMinuteVol = minuteVol.toFixed(1);
      
      // Only update if different to avoid infinite loop
      if (bulkVentilationParams.minuteVolume !== roundedMinuteVol) {
        setBulkVentilationParams(prev => ({
          ...prev,
          minuteVolume: roundedMinuteVol
        }));
      }
    }
  }, [bulkVentilationParams.tidalVolume, bulkVentilationParams.respiratoryRate]);

  // Toggle collapsed state for parent swimlanes
  const toggleSwimlane = (id: string) => {
    setCollapsedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Update default tidal volume when patient weight changes
  useEffect(() => {
    if (patientWeight) {
      const calculatedVT = (6 * patientWeight).toString();
      setBulkVentilationParams(prev => ({
        ...prev,
        tidalVolume: calculatedVT,
      }));
    }
  }, [patientWeight]);

  // Group items by administration group and sort alphabetically within each group
  const itemsByAdminGroup = useMemo(() => {
    const grouped: Record<string, AnesthesiaItem[]> = {};
    
    anesthesiaItems.forEach(item => {
      if (!item.administrationGroup) return; // Skip items without group
      
      if (!grouped[item.administrationGroup]) {
        grouped[item.administrationGroup] = [];
      }
      grouped[item.administrationGroup].push(item);
    });
    
    // Sort items alphabetically by name within each group
    Object.keys(grouped).forEach(groupName => {
      grouped[groupName].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return grouped;
  }, [anesthesiaItems]);

  // Format item display name
  const formatItemDisplayName = (item: AnesthesiaItem): string => {
    const parts = [item.name];
    
    // Determine type from rateUnit: null = bolus, "free" = free-flow, other = rate-controlled
    const isBolus = !item.rateUnit;
    const isFreeFlow = item.rateUnit === 'free';
    const isRateControlled = item.rateUnit && item.rateUnit !== 'free';
    
    if (isBolus) {
      // Bolus medication: "Name (concentration) (unit, route)"
      // Example: "Rocuronium (10mg/ml) (mg, i.v.)"
      if (item.ampuleConcentration) {
        parts.push(`(${item.ampuleConcentration})`);
      }
      if (item.administrationUnit || item.administrationRoute) {
        const unitParts = [];
        if (item.administrationUnit) unitParts.push(item.administrationUnit);
        if (item.administrationRoute) unitParts.push(item.administrationRoute);
        parts.push(`(${unitParts.join(', ')})`);
      }
    } else {
      // Infusion (free-flow or rate-controlled): "Name (unit, route/rate-type)"
      // Example: "Ringer Acetate (ml, i.v./free-flow)" or "NaCl 0.9% (ml, i.v./ml/h)"
      const rateInfo = isFreeFlow ? 'free-flow' : item.rateUnit;
      
      const unitParts = [];
      if (item.administrationUnit) unitParts.push(item.administrationUnit);
      
      if (item.administrationRoute || rateInfo) {
        const routeRate = [item.administrationRoute, rateInfo]
          .filter(Boolean)
          .join('/');
        unitParts.push(routeRate);
      }
      
      if (unitParts.length > 0) {
        parts.push(`(${unitParts.join(', ')})`);
      }
    }
    
    return parts.join(' ');
  };


  // Find best matching medication from configured items across all administration groups
  const findMatchingMedication = (voiceDrugName: string): { 
    swimlaneId: string; 
    fullName: string; 
    isNew: boolean;
    score: number;
  } | null => {
    const threshold = 0.6; // 60% similarity threshold
    let bestMatch: { swimlaneId: string; fullName: string; isNew: boolean; score: number } | null = null;
    let bestScore = 0;

    // Check all configured anesthesia items across all administration groups
    administrationGroups.forEach((group) => {
      const groupItems = itemsByAdminGroup[group.name] || [];
      groupItems.forEach((item, index) => {
        const itemDisplayName = formatItemDisplayName(item);
        const medDrugName = extractDrugName(itemDisplayName);
        const score = calculateSimilarity(voiceDrugName, medDrugName);
        
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = {
            swimlaneId: `admingroup-${group.id}-item-${index}`,
            fullName: itemDisplayName,
            isNew: false,
            score
          };
        }
      });
    });

    return bestMatch;
  };

  // Predefined ventilation parameters list
  const ventilationParams = [
    "etCO2 (mmHg)",
    "P insp (mbar)",
    "PEEP (mbar)",
    "Tidal Volume (ml)",
    "Respiratory Rate (/min)",
    "Minute Volume (l/min)",
    "FiO2 (%)",
  ];

  // Predefined output parameters list
  const outputParams = [
    "Gastric Tube (ml)",
    "Drainage (ml)",
    "Vomit (ml)",
    "Urine (ml)",
    "Urine 677 (ml)",
    "Blood (ml)",
    "Blood and Irrigation in Suction (ml)",
  ];

  // Default swimlane configuration - can be overridden via props
  const baseSwimlanes: SwimlaneConfig[] = [
    { id: "zeiten", label: "Times", height: 50, colorLight: "rgba(243, 232, 255, 0.8)", colorDark: "hsl(270, 55%, 20%)" },
    { id: "ereignisse", label: "Events", height: 48, colorLight: "rgba(219, 234, 254, 0.8)", colorDark: "hsl(210, 60%, 18%)" },
    { id: "herzrhythmus", label: "Heart Rhythm", height: 48, colorLight: "rgba(252, 231, 243, 0.8)", colorDark: "hsl(330, 50%, 20%)" },
    // Administration group lanes will be inserted dynamically here
    { id: "position", label: "Position", height: 48, colorLight: "rgba(226, 232, 240, 0.8)", colorDark: "hsl(215, 20%, 25%)" },
    { id: "staff", label: "Staff", height: 48, colorLight: "rgba(241, 245, 249, 0.8)", colorDark: "hsl(220, 25%, 25%)" },
    { id: "ventilation", label: "Ventilation", height: 48, colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" },
    { id: "output", label: "Output", height: 48, colorLight: "rgba(254, 226, 226, 0.8)", colorDark: "hsl(0, 60%, 25%)" },
  ];

  // Build active swimlanes with collapsible children
  const buildActiveSwimlanes = (): SwimlaneConfig[] => {
    if (swimlanes) return swimlanes; // Use custom if provided
    
    const lanes: SwimlaneConfig[] = [];
    const ventColor = { colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" };
    const medGroupColor = { colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" };
    
    for (const lane of baseSwimlanes) {
      lanes.push(lane);
      
      // Insert single "Medications" parent lane after Heart Rhythm (before Position)
      if (lane.id === "herzrhythmus") {
        // Add single "Medications" parent lane
        lanes.push({
          id: "medikamente",
          label: "Medications",
          height: 48,
          ...medGroupColor,
          hierarchyLevel: 'parent',
        });
        
        // Add administration groups and their items (if Medications is not collapsed)
        if (!collapsedSwimlanes.has("medikamente")) {
          // Sort administration groups by sortOrder
          const sortedGroups = [...administrationGroups].sort((a, b) => a.sortOrder - b.sortOrder);
          
          sortedGroups.forEach((group) => {
            // Add administration group header (non-collapsible, just a label)
            lanes.push({
              id: `admingroup-${group.id}`,
              label: group.name.toUpperCase(),
              height: 40,
              ...medGroupColor,
              hierarchyLevel: 'group',
            });
            
            // Add child lanes for items in this group
            const groupItems = itemsByAdminGroup[group.name] || [];
            groupItems.forEach((item, index) => {
              lanes.push({
                id: `admingroup-${group.id}-item-${index}`,
                label: formatItemDisplayName(item),
                height: 38,
                ...medGroupColor,
                rateUnit: item.rateUnit ?? null,
                defaultDose: item.defaultDose ?? null,
                itemId: item.id,
                hierarchyLevel: 'item',
              });
            });
          });
        }
      }

      // Insert ventilation children after Ventilation parent (if not collapsed)
      if (lane.id === "ventilation" && !collapsedSwimlanes.has("ventilation")) {
        ventilationParams.forEach((paramName, index) => {
          lanes.push({
            id: `ventilation-${index}`,
            label: `  ${paramName}`,
            height: 38,
            ...ventColor,
          });
        });
      }

      // Insert output children after Output parent (if not collapsed)
      if (lane.id === "output" && !collapsedSwimlanes.has("output")) {
        const outputColor = { colorLight: "rgba(254, 226, 226, 0.8)", colorDark: "hsl(0, 60%, 25%)" };
        outputParams.forEach((paramName, index) => {
          lanes.push({
            id: `output-${index}`,
            label: `  ${paramName}`,
            height: 38,
            ...outputColor,
          });
        });
      }

      // Insert staff children after Staff parent (if not collapsed)
      if (lane.id === "staff" && !collapsedSwimlanes.has("staff")) {
        const staffColor = { colorLight: "rgba(241, 245, 249, 0.8)", colorDark: "hsl(220, 25%, 25%)" };
        const staffRoles = ["Doctor", "Nurse", "Assistant"];
        staffRoles.forEach((roleName, index) => {
          lanes.push({
            id: `staff-${roleName.toLowerCase()}`,
            label: `  ${roleName}`,
            height: 38,
            ...staffColor,
          });
        });
      }
    }
    
    return lanes;
  };

  const activeSwimlanes = useMemo(() => buildActiveSwimlanes(), [collapsedSwimlanes, swimlanes, administrationGroups, itemsByAdminGroup]);

  // Handle editing vital values
  const handleSaveEdit = async (newValue: number) => {
    if (!editingValue || !anesthesiaRecordId) return;

    const { type, index, time, originalTime } = editingValue;

    // Update local state first
    if (type === 'hr') {
      const updated = [...hrDataPoints];
      updated[index] = [time, newValue];
      setHrDataPoints(updated);
    } else if (type === 'sys') {
      const updated = [...bpDataPoints.sys];
      updated[index] = [time, newValue];
      setBpDataPoints({ ...bpDataPoints, sys: updated });
    } else if (type === 'dia') {
      const updated = [...bpDataPoints.dia];
      updated[index] = [time, newValue];
      setBpDataPoints({ ...bpDataPoints, dia: updated });
    } else if (type === 'spo2') {
      const updated = [...spo2DataPoints];
      updated[index] = [time, newValue];
      setSpo2DataPoints(updated);
    }

    // Persist update to database
    // Use originalTime to locate the snapshot, fallback to time if not set
    const lookupTime = originalTime || time;
    const timestamp = new Date(lookupTime);
    
    // Validate timestamp
    if (isNaN(timestamp.getTime())) {
      console.error('[EDIT] Invalid timestamp:', { originalTime, time, lookupTime });
      toast({
        title: "Error updating vital",
        description: "Invalid timestamp for update",
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }
    
    // Collect ALL vitals at this timestamp with the updated value
    const updatedVitals: any = {};

    // Get current values at this timestamp
    if (type === 'hr') {
      updatedVitals.hr = newValue;
    } else {
      const hrPoint = hrDataPoints.find(p => p[0] === lookupTime);
      if (hrPoint) updatedVitals.hr = hrPoint[1];
    }

    if (type === 'sys') {
      updatedVitals.sysBP = newValue;
      const diaPoint = bpDataPoints.dia.find(p => p[0] === lookupTime);
      if (diaPoint) updatedVitals.diaBP = diaPoint[1];
    } else if (type === 'dia') {
      updatedVitals.diaBP = newValue;
      const sysPoint = bpDataPoints.sys.find(p => p[0] === lookupTime);
      if (sysPoint) updatedVitals.sysBP = sysPoint[1];
    } else {
      const sysPoint = bpDataPoints.sys.find(p => p[0] === lookupTime);
      const diaPoint = bpDataPoints.dia.find(p => p[0] === lookupTime);
      if (sysPoint) updatedVitals.sysBP = sysPoint[1];
      if (diaPoint) updatedVitals.diaBP = diaPoint[1];
    }

    if (type === 'spo2') {
      updatedVitals.spo2 = newValue;
    }

    // All persistence is now handled by React Query mutations above
    setEditDialogOpen(false);
    setEditingValue(null);
  };

  const handleDeleteValue = async () => {
    if (!editingValue || !anesthesiaRecordId || !clinicalSnapshot?.data) return;

    const { type, index, time, originalTime } = editingValue;

    // NEW: Use React Query delete mutation with point IDs
    if (type === 'hr') {
      const pointId = clinicalSnapshot.data.hr?.[index]?.id;
      if (pointId) {
        deleteVitalPointMutation.mutate(pointId);
      }
    } else if (type === 'sys' || type === 'dia') {
      // For BP, delete the entire BP point (includes both sys and dia)
      const pointId = clinicalSnapshot.data.bp?.[index]?.id;
      if (pointId) {
        deleteVitalPointMutation.mutate(pointId);
      }
    } else if (type === 'spo2') {
      const pointId = clinicalSnapshot.data.spo2?.[index]?.id;
      if (pointId) {
        deleteVitalPointMutation.mutate(pointId);
      }
    }

    // Persist deletion to database
    // Use originalTime to locate the snapshot, fallback to time if not set
    const lookupTime = originalTime || time;
    const timestamp = new Date(lookupTime);
    
    // Validate timestamp
    if (isNaN(timestamp.getTime())) {
      console.error('[DELETE] Invalid timestamp:', { originalTime, time, lookupTime });
      toast({
        title: "Error deleting vital",
        description: "Invalid timestamp for deletion",
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }
    
    // Collect all remaining vitals at this timestamp (excluding the deleted one)
    const remainingVitals: any = {};

    // Check HR at this timestamp (excluding if we deleted it)
    if (type !== 'hr') {
      const hrPoint = hrDataPoints.find(p => p[0] === lookupTime);
      if (hrPoint) remainingVitals.hr = hrPoint[1];
    }

    // Check BP at this timestamp (excluding if we deleted it)
    if (type !== 'sys' && type !== 'dia') {
      const sysPoint = bpDataPoints.sys.find(p => p[0] === lookupTime);
      const diaPoint = bpDataPoints.dia.find(p => p[0] === lookupTime);
      if (sysPoint) remainingVitals.sysBP = sysPoint[1];
      if (diaPoint) remainingVitals.diaBP = diaPoint[1];
    }

    // Check SPO2 at this timestamp (excluding if we deleted it)
    if (type !== 'spo2') {
      const spo2Point = spo2DataPoints.find(p => p[0] === lookupTime);
      if (spo2Point) remainingVitals.spo2 = spo2Point[1];
    }

    // All persistence is now handled by React Query mutations above
    setEditDialogOpen(false);
    setEditingValue(null);
  };

  // Handle clicking on Zeiten swimlane to place next time marker or edit existing
  const handleZeitenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Use tracked zoom state
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    
    // Convert x-position to time
    const xPercent = x / rect.width;
    let clickTime = visibleStart + (xPercent * visibleRange);
    
    // Always snap to 1-minute intervals for time markers
    const snappedTime = snapToInterval(clickTime, ONE_MINUTE);
    
    // Check if clicking on an existing marker (within 1 minute tolerance)
    const timeTolerance = ONE_MINUTE;
    
    for (let i = 0; i < timeMarkers.length; i++) {
      const marker = timeMarkers[i];
      if (marker.time !== null && Math.abs(snappedTime - marker.time) < timeTolerance) {
        // Clicking on existing marker - open edit dialog
        setEditingTimeMarker({ index: i, marker });
        setTimeMarkerEditDialogOpen(true);
        return;
      }
    }
    
    // Not clicking on existing marker - place next marker
    const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
    if (nextMarkerIndex === -1) {
      return;
    }
    
    // Validate that time is within editable boundaries
    const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
    const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
    
    if (snappedTime < editableStartBoundary || snappedTime > editableEndBoundary) {
      // Click is outside editable window - ignore
      return;
    }
    
    // Update the marker with the time
    const updated = [...timeMarkers];
    updated[nextMarkerIndex] = { ...updated[nextMarkerIndex], time: snappedTime };
    setTimeMarkers(updated);

    // Save to database
    if (anesthesiaRecordId) {
      saveTimeMarkersMutation.mutate({
        anesthesiaRecordId,
        timeMarkers: updated,
      });
    }
  };

  // Handle updating time marker time
  const handleUpdateTimeMarker = (newTime: number) => {
    if (!editingTimeMarker) return;
    
    const updated = [...timeMarkers];
    updated[editingTimeMarker.index] = { ...updated[editingTimeMarker.index], time: newTime };
    setTimeMarkers(updated);
    setTimeMarkerEditDialogOpen(false);
    setEditingTimeMarker(null);

    // Save to database
    if (anesthesiaRecordId) {
      saveTimeMarkersMutation.mutate({
        anesthesiaRecordId,
        timeMarkers: updated,
      });
    }
  };

  // Handle deleting time marker
  const handleDeleteTimeMarker = () => {
    if (!editingTimeMarker) return;
    
    const updated = [...timeMarkers];
    updated[editingTimeMarker.index] = { ...updated[editingTimeMarker.index], time: null };
    setTimeMarkers(updated);
    setTimeMarkerEditDialogOpen(false);
    setEditingTimeMarker(null);

    // Save to database
    if (anesthesiaRecordId) {
      saveTimeMarkersMutation.mutate({
        anesthesiaRecordId,
        timeMarkers: updated,
      });
    }
  };

  // Undo last vital entry
  const handleUndo = () => {
    if (!lastAction) return;

    if (lastAction.type === 'hr' && lastAction.data) {
      setHrDataPoints(prev => prev.filter(p => p[0] !== lastAction.data![0] || p[1] !== lastAction.data![1]));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "HR value has been removed",
      //   duration: 2000,
      // });
    } else if (lastAction.type === 'bp' && lastAction.bpData) {
      const { sys, dia } = lastAction.bpData;
      setBpDataPoints(prev => ({
        sys: prev.sys.filter(p => p[0] !== sys[0] || p[1] !== sys[1]),
        dia: prev.dia.filter(p => p[0] !== dia[0] || p[1] !== dia[1])
      }));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "BP values have been removed",
      //   duration: 2000,
      // });
    } else if (lastAction.type === 'spo2' && lastAction.data) {
      setSpo2DataPoints(prev => prev.filter(p => p[0] !== lastAction.data![0] || p[1] !== lastAction.data![1]));
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Value removed",
      //   description: "SpO2 value has been removed",
      //   duration: 2000,
      // });
    }

    setLastAction(null);
  };

  // Track zoom percentages for useMemo
  const [zoomPercent, setZoomPercent] = useState<{ start: number; end: number } | null>(null);

  // Listen for dataZoom changes to sync with sticky header
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleDataZoom = (params: any) => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      
      if (dataZoom) {
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const visibleStart = data.startTime + (start / 100) * fullRange;
        const visibleEnd = data.startTime + (end / 100) * fullRange;
        
        setCurrentZoomStart(visibleStart);
        setCurrentZoomEnd(visibleEnd);
        
        // Track zoom percentages
        setZoomPercent({ start, end });
      }
    };

    chart.on('datazoom', handleDataZoom);
    return () => {
      chart.off('datazoom', handleDataZoom);
    };
  }, []);

  // Track initial zoom state
  const hasSetInitialZoomRef = useRef(false);
  
  // Reset initial zoom flag when anesthesia record changes (opening a different surgery)
  useEffect(() => {
    hasSetInitialZoomRef.current = false;
  }, [anesthesiaRecordId]);

  // Handle chart ready - set initial zoom to 60-minute window with NOW positioned left
  const handleChartReady = (chart: any) => {
    if (hasSetInitialZoomRef.current) return;

    const currentTime = now || data.endTime;
    const fifteenMinutes = 15 * 60 * 1000;
    const fortyFiveMinutes = 45 * 60 * 1000;
    const initialStartTime = currentTime - fifteenMinutes;  // 15min before NOW
    const initialEndTime = currentTime + fortyFiveMinutes;  // 45min after NOW
    
    const startPercent = ((initialStartTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    const endPercent = ((initialEndTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    
    // Set zoom state first so useMemo picks it up
    setZoomPercent({ start: startPercent, end: endPercent });
    
    // Then set in chart
    chart.setOption({
      dataZoom: [{
        start: startPercent,
        end: endPercent,
      }]
    });
    
    hasSetInitialZoomRef.current = true;
  };

  // Update dataZoom xAxisIndex when swimlane structure changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    // Update dataZoom to include all current x-axes without resetting zoom state
    const numGrids = activeSwimlanes.length + 1; // +1 for vitals grid
    const currentOption = chart.getOption() as any;
    const currentDataZoom = currentOption.dataZoom?.[0];
    
    chart.setOption({
      dataZoom: [{
        xAxisIndex: Array.from({ length: numGrids }, (_, i) => i),
        // Preserve current zoom state
        start: currentDataZoom?.start,
        end: currentDataZoom?.end,
      }]
    });
  }, [activeSwimlanes]);


  // Add click handler for editing data points
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleChartClick = (params: any) => {
      // Only handle clicks on scatter/custom data points, not when actively placing new values
      if (params.componentType === 'series' && (params.seriesType === 'scatter' || params.seriesType === 'custom') && !activeToolMode) {
        const [timestamp, value] = params.data;
        const seriesName = params.seriesName;
        
        let type: 'hr' | 'sys' | 'dia' | 'spo2';
        let dataArray: VitalPoint[];
        
        if (seriesName.includes('Heart Rate')) {
          type = 'hr';
          dataArray = hrDataPoints;
        } else if (seriesName.includes('Systolic')) {
          type = 'sys';
          dataArray = bpDataPoints.sys;
        } else if (seriesName.includes('Diastolic')) {
          type = 'dia';
          dataArray = bpDataPoints.dia;
        } else if (seriesName.includes('SpO2')) {
          type = 'spo2';
          dataArray = spo2DataPoints;
        } else {
          return;
        }
        
        // Find the index of this data point
        const index = dataArray.findIndex(p => p[0] === timestamp && p[1] === value);
        if (index !== -1) {
          setEditingValue({ type, time: timestamp, value, index, originalTime: timestamp });
          setEditDialogOpen(true);
        }
      }
    };

    chart.on('click', handleChartClick);
    return () => {
      chart.off('click', handleChartClick);
    };
  }, [chartRef, activeToolMode, hrDataPoints, bpDataPoints, spo2DataPoints]);

  // Update zoom state when zoom changes
  useEffect(() => {
    const updateZoomState = () => {
      // Get fresh chart instance on every call to ensure it's ready
      const chart = chartRef.current?.getEchartsInstance();
      if (!chart) return;
      
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (!dataZoom) return;
      
      const start = dataZoom.start ?? 0;
      const end = dataZoom.end ?? 100;
      const fullRange = data.endTime - data.startTime;
      
      const visibleStart = data.startTime + (start / 100) * fullRange;
      const visibleEnd = data.startTime + (end / 100) * fullRange;
      
      // Update zoom state for interactive layer
      setCurrentZoomStart(visibleStart);
      setCurrentZoomEnd(visibleEnd);
      
      // Query ECharts directly for the ACTUAL time interval it's displaying
      // This ensures snapping matches what ECharts renders, regardless of screen size
      let vitalsSnapInterval: number;
      
      try {
        // Access ECharts internal model to get actual rendered tick coordinates
        const axis = (chart as any)._model?._componentsMap?.get('xAxis')?.[0]?.axis;
        
        if (axis && typeof axis.getTicksCoords === 'function') {
          const ticks = axis.getTicksCoords();
          
          // Calculate actual interval from consecutive tick VALUES (not pixel coords)
          // IMPORTANT: Use ticks[1] and ticks[2] because ticks[0] might be at an odd start time
          // (e.g., chart starts at 22:06:17, so tick[0]=22:06:17, tick[1]=22:10:00, tick[2]=22:15:00)
          // The real interval is between tick[1] and tick[2] (22:10:00 → 22:15:00 = 5 min)
          if (ticks && ticks.length >= 3) {
            const tick1Value = ticks[1].tickValue;
            const tick2Value = ticks[2].tickValue;
            
            if (typeof tick1Value === 'number' && typeof tick2Value === 'number') {
              const actualInterval = Math.abs(tick2Value - tick1Value);
              const intervalMinutes = actualInterval / (60 * 1000);
              
              // Map actual tick interval to fixed snap intervals
              // Rule 1: tick interval <= 2 min → snap to 1 min
              // Rule 2: tick interval > 2 and <= 15 min → snap to 5 min
              // Rule 3: tick interval > 15 min → snap to 10 min
              if (intervalMinutes <= 2) {
                vitalsSnapInterval = 1 * 60 * 1000;
              } else if (intervalMinutes <= 15) {
                vitalsSnapInterval = 5 * 60 * 1000;
              } else {
                vitalsSnapInterval = 10 * 60 * 1000;
              }
              
            } else {
              throw new Error('Tick values not numeric');
            }
          } else {
            throw new Error('Insufficient ticks');
          }
        } else {
          throw new Error('Axis API not available');
        }
      } catch (error) {
        // Fallback: estimate tick interval from visible range
        // Assume ECharts typically shows ~12-20 ticks, use 15 as average
        const visibleRangeMs = visibleEnd - visibleStart;
        const estimatedTickCount = 15;
        const estimatedTickInterval = visibleRangeMs / estimatedTickCount;
        const intervalMinutes = estimatedTickInterval / (60 * 1000);
        
        // Map estimated tick interval to fixed snap intervals (same rules)
        if (intervalMinutes <= 2) {
          vitalsSnapInterval = 1 * 60 * 1000;
        } else if (intervalMinutes <= 15) {
          vitalsSnapInterval = 5 * 60 * 1000;
        } else {
          vitalsSnapInterval = 10 * 60 * 1000;
        }
        
      }
      
      setCurrentVitalsSnapInterval(vitalsSnapInterval);
    };

    // Update immediately
    setTimeout(updateZoomState, 50);

    // Listen for zoom events on the chart instance
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      chart.on('datazoom', updateZoomState);
    }

    return () => {
      const chart = chartRef.current?.getEchartsInstance();
      if (chart) {
        chart.off('datazoom', updateZoomState);
      }
    };
  }, [chartRef, data.startTime, data.endTime]);

  // Initialize NOW line position synchronously before first paint
  useLayoutEffect(() => {
    // Only run on initial mount
    if (!isNowLineFirstRenderRef.current) return;
    
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    const xFraction = (currentTime - visibleStart) / visibleRange;
    
    // Calculate initial position
    if (xFraction >= 0 && xFraction <= 1) {
      const leftPosition = `calc(200px + ${xFraction} * (100% - 210px))`;
      setNowLinePosition(leftPosition);
    } else {
      setNowLinePosition('-10px');
    }
    
    // Enable transitions after first paint completes
    requestAnimationFrame(() => {
      isNowLineFirstRenderRef.current = false;
    });
  }, []); // Run once on mount
  
  // Update NOW line position when zoom/pan/time changes (after initial mount)
  useEffect(() => {
    // Skip until layout effect has run
    if (isNowLineFirstRenderRef.current) return;
    
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    const xFraction = (currentTime - visibleStart) / visibleRange;
    
    // Calculate new position
    let newPosition: string;
    if (xFraction >= 0 && xFraction <= 1) {
      newPosition = `calc(200px + ${xFraction} * (100% - 210px))`;
    } else {
      newPosition = '-10px';
    }
    
    // Only update if position changed (avoid unnecessary re-renders)
    if (newPosition !== nowLinePosition) {
      setNowLinePosition(newPosition);
    }
  }, [currentZoomStart, currentZoomEnd, currentTime, data.startTime, data.endTime, nowLinePosition]);

  // Note: All timeline values (ventilation modes, parameters, medication doses, events) are now
  // rendered as DOM overlays for reliable click handling and scrolling. No ECharts graphics needed.

  const option = useMemo(() => {
    // Use centralized chart layout constants
    const { VITALS_TOP, VITALS_HEIGHT, SWIMLANE_START, GRID_LEFT, GRID_RIGHT } = CHART_LAYOUT;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || data.endTime; // Use provided "now" or fall back to endTime
    
    // Initial view: 60-minute window (1 hour) from -30min to +30min around NOW
    const initialStartTime = currentTime - THIRTY_MINUTES;
    const initialEndTime = currentTime + THIRTY_MINUTES;

    // Calculate swimlane positions dynamically with darker group headers
    let currentTop = SWIMLANE_START;
    const swimlaneGrids = activeSwimlanes.map((lane) => {
      // Use significantly darker background for medication group headers
      let backgroundColor: string;
      if (lane.hierarchyLevel === 'group') {
        // Much darker shade for group headers - more pronounced difference
        backgroundColor = isDark ? "hsl(150, 45%, 8%)" : "hsl(150, 50%, 75%)";
      } else {
        // Regular color for other lanes
        backgroundColor = isDark ? lane.colorDark : lane.colorLight;
      }
      
      const grid = {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: currentTop,
        height: lane.height,
        backgroundColor,
      };
      
      currentTop += lane.height;
      return grid;
    });

    // Combine all grids: vitals + swimlanes
    const grids = [
      // Grid 0: Vitals chart
      { 
        left: GRID_LEFT, 
        right: GRID_RIGHT, 
        top: VITALS_TOP, 
        height: VITALS_HEIGHT, 
        backgroundColor: "transparent" 
      },
      ...swimlaneGrids,
    ];

    // Create x-axis for each grid with conditional grid line visibility
    const createXAxis = (gridIndex: number, lane?: SwimlaneConfig) => {
      // Determine if grid lines should be shown for this swimlane
      const hideGridLines = lane && (
        lane.id === "medikamente" ||    // Parent Medications swimlane
        lane.hierarchyLevel === 'group' || // Medication group headers
        lane.id === "staff"                // Parent Staff swimlane
      );
      
      return {
        type: "time" as const,
        gridIndex,
        min: data.startTime,
        max: data.endTime,
        boundaryGap: false,
        axisLabel: {
          show: false, // Hide labels - they're shown in the sticky header
          formatter: "{HH}:{mm}",
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: isDark ? "#ffffff" : "#000000",
          fontWeight: 500,
        },
        axisLine: { 
          show: false, // Hide axis line
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
        },
        axisTick: { 
          show: false, // Hide ticks
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
        },
        splitLine: { 
          show: !hideGridLines, // Conditionally show vertical grid lines
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          },
        },
        minorTick: {
          show: !hideGridLines,
        },
        minorSplitLine: {
          show: !hideGridLines, // Conditionally show minor grid lines
          lineStyle: {
            color: isDark ? "#333333" : "#e5e7eb",
            width: 0.5,
            type: "dashed" as const,
          },
        },
        position: "top",
      };
    };

    const xAxes = grids.map((_, index) => {
      // Grid 0 is vitals, rest are swimlanes
      const lane = index === 0 ? undefined : activeSwimlanes[index - 1];
      return createXAxis(index, lane);
    });

    // Y-axes: vitals (dual) + swimlanes (categorical)
    const yAxes = [
      // Vitals grid - First y-axis (BP/HR: 0 to 240 range for top and bottom padding, showing 20-220 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 0,
        max: 240,
        interval: 20,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { 
          show: true, // Show horizontal grid lines!
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          }
        },
      },
      // Vitals grid - Second y-axis (SpO2: 45-105 range for top and bottom padding, showing 50-100 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 45,
        max: 105,
        interval: 10,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { show: false }, // Don't show grid lines for this axis
      },
      // Swimlane y-axes
      ...activeSwimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
      })),
    ];

    // Series - HR data points with heart symbols
    const series: any[] = [];
    
    // Sort vitals data chronologically to prevent zigzag lines when backfilling
    // Drag preview is handled imperatively via updateDragPreviewImperatively()
    const sortedHrData = [...hrDataPoints].sort((a, b) => a[0] - b[0]);
    const sortedSysData = [...bpDataPoints.sys].sort((a, b) => a[0] - b[0]);
    const sortedDiaData = [...bpDataPoints.dia].sort((a, b) => a[0] - b[0]);
    const sortedSpo2Data = [...spo2DataPoints].sort((a, b) => a[0] - b[0]);
    
    // Add HR series if there are data points
    if (sortedHrData.length > 0) {
      // Add line connecting HR points (chronologically sorted) - HIGH z-index to stay in front of BP
      series.push({
        type: 'line',
        name: 'Heart Rate Line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedHrData,
        lineStyle: {
          color: '#ef4444',
          width: 2,
        },
        symbol: 'none',
        z: 15,
      });
      
      // Add heart symbols with Lucide Heart icon (stroke rendering)
      const hrIconSeries: any = createLucideIconSeries(
          'Heart Rate',
          sortedHrData,
          VITAL_ICON_PATHS.heart.path,
          '#ef4444', // Red
          0, // yAxisIndex
          16, // size
          100 // z-level - VERY high value to ensure icons are always clickable above connection lines
        );
      hrIconSeries.id = 'hr-icons-main'; // Add unique ID for proper diffing
      series.push(hrIconSeries);
    }
    
    // Add BP line connections with filled area BETWEEN systolic and diastolic
      
    if (sortedSysData.length > 0 && sortedDiaData.length > 0) {
      // Create area between systolic and diastolic using stacked approach
      // First, add the diastolic as base (stack: 'bp')
      series.push({
        type: 'line',
        name: 'Diastolic BP Base',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedDiaData,
        symbol: 'none',
        lineStyle: {
          color: isDark ? '#ffffff' : '#000000',
          width: 1,
          opacity: 0.3,
        },
        stack: 'bp',
        z: 7,
      });
      
      // Then add the DIFFERENCE (systolic - diastolic) on top with area fill
      const diffData = sortedSysData.map((sysPoint, idx) => {
        const diaPoint = sortedDiaData[idx];
        if (diaPoint && sysPoint[0] === diaPoint[0]) {
          // Same timestamp - calculate difference
          return [sysPoint[0], sysPoint[1] - diaPoint[1]];
        }
        return null;
      }).filter(p => p !== null);
      
      series.push({
        type: 'line',
        name: 'BP Range Area',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: diffData,
        symbol: 'none',
        lineStyle: {
          color: isDark ? '#ffffff' : '#000000',
          width: 1,
          opacity: 0.3,
        },
        stack: 'bp', // Stack on top of diastolic
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: isDark ? [
              { offset: 0, color: 'rgba(255, 255, 255, 0.15)' },
              { offset: 1, color: 'rgba(255, 255, 255, 0.08)' }
            ] : [
              { offset: 0, color: 'rgba(0, 0, 0, 0.15)' },
              { offset: 1, color: 'rgba(0, 0, 0, 0.08)' }
            ]
          }
        },
        z: 8,
      });
    }
    
    // Add BP scatter points with Lucide icons (stroke rendering)
    if (sortedSysData.length > 0) {
      series.push(
        createLucideIconSeries(
          'Systolic BP',
          sortedSysData,
          VITAL_ICON_PATHS.chevronDown.path,
          isDark ? '#e5e5e5' : '#000000', // Light gray for dark mode, black for light mode
          0, // yAxisIndex
          16, // size
          30 // z-level - high value to ensure icons are always clickable above lines
        )
      );
    }
    
    // Add diastolic BP scatter points with Lucide ChevronUp (stroke rendering)
    if (sortedDiaData.length > 0) {
      series.push(
        createLucideIconSeries(
          'Diastolic BP',
          sortedDiaData,
          VITAL_ICON_PATHS.chevronUp.path,
          isDark ? '#e5e5e5' : '#000000', // Light gray for dark mode, black for light mode
          0, // yAxisIndex
          16, // size
          30 // z-level - high value to ensure icons are always clickable above lines
        )
      );
    }
    
    // Add SpO2 series with Lucide CircleDot icon (stroke rendering)
    if (sortedSpo2Data.length > 0) {
      // SpO2 line connection
      series.push({
        type: 'line',
        name: 'SpO2 Line',
        xAxisIndex: 0,
        yAxisIndex: 1, // Use second y-axis (45-105 range)
        data: sortedSpo2Data,
        symbol: 'none',
        lineStyle: {
          color: '#8b5cf6', // Purple line
          width: 1.5,
        },
        z: 9,
      });
      
      // SpO2 symbols with Lucide CircleDot (outer circle + inner dot)
      series.push(
        createLucideIconSeries(
          'SpO2',
          sortedSpo2Data,
          '', // Not used for CircleDot
          '#8b5cf6', // Purple
          1, // yAxisIndex (second y-axis for 45-105 range)
          16, // size
          30, // z-level - high value to ensure icons are always clickable above lines
          true // isCircleDot flag
        )
      );
    }

    // Add ventilation parameter text labels
    // Note: ventilationParams order: ["etCO2 (mmHg)", "P insp (mbar)", "PEEP (mbar)", "Tidal Volume (ml)", "Respiratory Rate (/min)", "Minute Volume (l/min)", "FiO2 (%)"]
    // Find the ventilation parent swimlane index to calculate correct xAxisIndex and yAxisIndex
    const ventilationParentIndex = activeSwimlanes.findIndex(lane => lane.id === 'ventilation');
    
    if (ventilationParentIndex !== -1 && !collapsedSwimlanes.has('ventilation')) {
      const textColor = isDark ? '#ffffff' : '#000000';
      const modernMonoFont = '"SF Mono", "JetBrains Mono", "Roboto Mono", "Fira Code", Monaco, Consolas, monospace';
      
      
      // Add etCO2 text labels (index 0)
      if (ventilationData.etCO2.length > 0) {
        const paramIndex = ventilationParentIndex + 1; // First child after parent
        const gridIdx = paramIndex + 1; // +1 because vitals is grid 0
        // Map to store original values for the formatter
        const valuesMap = new Map(ventilationData.etCO2.map(([time, val]) => [time, val]));
        // Convert data format: [timestamp, value] -> [timestamp, ""] where "" is the y-category
        const seriesData = ventilationData.etCO2.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'etCO2',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1, // yAxis indices start at 2 (after 2 vitals axes)
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add PIP text labels (index 1)
      if (ventilationData.pip.length > 0) {
        const paramIndex = ventilationParentIndex + 2;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.pip.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.pip.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'PIP',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add PEEP text labels (index 2)
      if (ventilationData.peep.length > 0) {
        const paramIndex = ventilationParentIndex + 3;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.peep.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.peep.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'PEEP',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Tidal Volume text labels (index 3)
      if (ventilationData.tidalVolume.length > 0) {
        const paramIndex = ventilationParentIndex + 4;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.tidalVolume.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.tidalVolume.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Tidal Volume',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Respiratory Rate text labels (index 4)
      if (ventilationData.respiratoryRate.length > 0) {
        const paramIndex = ventilationParentIndex + 5;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.respiratoryRate.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.respiratoryRate.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Respiratory Rate',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add Minute Volume text labels (index 5)
      if (ventilationData.minuteVolume.length > 0) {
        const paramIndex = ventilationParentIndex + 6;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.minuteVolume.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.minuteVolume.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'Minute Volume',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
      
      // Add FiO2 text labels (index 6)
      if (ventilationData.fiO2.length > 0) {
        const paramIndex = ventilationParentIndex + 7;
        const gridIdx = paramIndex + 1;
        const valuesMap = new Map(ventilationData.fiO2.map(([time, val]) => [time, val]));
        const seriesData = ventilationData.fiO2.map(([time, val]) => [time, ""]);
        series.push({
          type: 'scatter',
          name: 'FiO2',
          xAxisIndex: gridIdx,
          yAxisIndex: gridIdx + 1,
          data: seriesData,
          symbol: 'none',
          label: {
            show: true,
            formatter: (params: any) => {
              const timestamp = params.value[0];
              return valuesMap.get(timestamp)?.toString() || '';
            },
            fontSize: 13,
            fontWeight: '600',
            fontFamily: modernMonoFont,
            color: textColor,
          },
          cursor: 'pointer',
          z: 10,
        });
      }
    }

    // NOTE: Drag preview is now handled imperatively via updateDragPreviewImperatively()
    // to prevent duplicate icons during fast touch drags. The preview series is updated
    // directly via chartInstance.setOption() with requestAnimationFrame throttling.
    
    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    
    // Generate manual y-axis labels in the white space
    const yAxisLabels: any[] = [];
    
    // First y-axis (20-220, interval 20) - positioned at x=140px, grid extends 0 to 240 for top and bottom padding
    for (let val = 20; val <= 220; val += 20) {
      const yPercent = ((240 - val) / 240) * 100; // Invert because top is 0, using 240 range (0 to 240)
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 140,
        top: yPos - 6, // Center text vertically
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: isDark ? "#ffffff" : "#000000",
        },
        silent: true,
        z: 100,
      });
    }
    
    // Second y-axis (50-100, interval 10) - positioned at x=172px, grid extends 45 to 105 for padding
    for (let val = 50; val <= 100; val += 10) {
      const yPercent = ((105 - val) / 60) * 100; // Range is 45-105, so 60 units total
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 172,
        top: yPos - 6,
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: "#8b5cf6",
        },
        silent: true,
        z: 100,
      });
    }
    
    // ECharts automatically generates vertical grid lines via splitLine/minorSplitLine in x-axis config
    // No need for custom graphics anymore

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      graphic: [
        // Y-axis labels
        ...yAxisLabels.map((label, i) => ({ ...label, id: `y-label-${i}` })),
      ],
      dataZoom: [{
        type: "inside",
        xAxisIndex: grids.map((_, i) => i),
        // Preserve current zoom state if available
        ...(zoomPercent ? { start: zoomPercent.start, end: zoomPercent.end } : {}),
        throttle: 50,
        zoomLock: true,
        orient: 'horizontal',
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
        disabled: true, // Disable all touch/mouse interactions - use external controls only
        filterMode: "none",
      }],
      tooltip: {
        trigger: "item", // Changed from "axis" to "item" to show on hover over data points
        textStyle: { fontFamily: "Poppins, sans-serif" },
        formatter: (params: any) => {
          if (Array.isArray(params)) params = params[0];
          if (!params || !params.data) return '';
          
          const [timestamp, value] = params.data;
          const time = formatTime(timestamp);
          
          let label = '';
          let unit = '';
          
          if (params.seriesName.includes('Heart Rate')) {
            label = 'HR';
            unit = ' bpm';
          } else if (params.seriesName.includes('Systolic')) {
            label = 'Systolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('Diastolic')) {
            label = 'Diastolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('SpO2')) {
            label = 'SpO₂';
            unit = '%';
          }
          
          return `<div style="padding: 4px 8px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${label}: ${value}${unit}</div>
            <div style="font-size: 11px; opacity: 0.8;">${time}</div>
          </div>`;
        },
      },
    } as echarts.EChartsOption;
  }, [data, isDark, activeSwimlanes, now, currentTime, hrDataPoints, bpDataPoints, spo2DataPoints, ventilationData, medicationDoseData, zoomPercent, pendingSysValue, bpEntryMode, collapsedSwimlanes]);

  // Calculate component height
  const VITALS_HEIGHT = 380;
  const VITALS_TOP_POS = 32; // Position accounting for sticky header (32px)
  const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
  const componentHeight = height ?? (VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight);

  // Zoom levels are now imported from timelineUtils (ZOOM_LEVELS, findClosestZoomLevel)

  // Zoom and pan handlers
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step smaller
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.max(0, currentLevelIndex - 1);
        const newSpan = ZOOM_LEVELS[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + newSpan;
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - newSpan;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handleZoomOut = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step larger
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.min(ZOOM_LEVELS.length - 1, currentLevelIndex + 1);
        const newSpan = ZOOM_LEVELS[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = Math.min(newStart + newSpan, data.endTime);
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = Math.max(newEnd - newSpan, data.startTime);
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handlePanLeft = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin - panStep;
        let newEnd = currentMax - panStep;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handlePanRight = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin + panStep;
        let newEnd = currentMax + panStep;
        
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handleResetZoom = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const currentTime = now || data.endTime;
      const thirtyMinutes = 30 * 60 * 1000;
      const initialStartTime = currentTime - thirtyMinutes;
      const initialEndTime = currentTime + thirtyMinutes;
      
      // Convert to percentages for dataZoom
      const fullRange = data.endTime - data.startTime;
      const startPercent = ((initialStartTime - data.startTime) / fullRange) * 100;
      const endPercent = ((initialEndTime - data.startTime) / fullRange) * 100;
      
      chart.dispatchAction({
        type: 'dataZoom',
        start: startPercent,
        end: endPercent,
      });
    }
  };

  // Handle camera capture with hybrid detection
  const handleCameraCapture = async (imageBase64: string, timestamp: number) => {
    setIsProcessingImage(true);
    
    try {
      // Step 1: Preprocess image (resize and compress only - skip grayscale for performance)
      const { preprocessImage } = await import('@/lib/imagePreprocessing');
      const preprocessed = await preprocessImage(imageBase64, {
        maxWidth: 512, // Reduced from 768 for faster mobile processing
        quality: 0.6,  // Reduced from 0.75 for faster compression
        grayscale: false, // Skip pixel-by-pixel grayscale conversion - not needed for modern OCR/AI
      });
      
      // Toast notification disabled (can be re-enabled later)
      // toast({
      //   title: "Image Preprocessed",
      //   description: `Optimized: ${preprocessed.sizeReduction}% smaller`,
      // });
      
      // Step 2: Try fast seven-segment detection first
      const { detectVitalsFromImage, validateVitalRange, clampToRange } = await import('@/lib/sevenSegmentOCR');
      const localDetection = await detectVitalsFromImage(preprocessed.base64);
      
      // Step 3: Determine if we need AI fallback
      const highConfidenceThreshold = 0.9;
      const needsAI = 
        !localDetection.hr || localDetection.hr.confidence < highConfidenceThreshold ||
        !localDetection.spo2 || localDetection.spo2.confidence < highConfidenceThreshold ||
        !localDetection.sysBP || localDetection.sysBP.confidence < highConfidenceThreshold ||
        !localDetection.diaBP || localDetection.diaBP.confidence < highConfidenceThreshold;
      
      let finalData: any = {};
      
      if (needsAI) {
        // Step 4: Fall back to OpenAI Vision for low confidence or missing values
        // Toast notification disabled (can be re-enabled later)
        // toast({
        //   title: "Analyzing with AI...",
        //   description: "Using advanced detection for complex readings",
        // });
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        let aiData: MonitorAnalysisResult | any = {};
        try {
          const response = await fetch('/api/analyze-monitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: preprocessed.base64 }),
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error('Failed to analyze image with AI');
          }
          
          aiData = await response.json();
        
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('AI analysis timed out after 30 seconds. Please try again.');
          }
          throw fetchError;
        }
        
        // Check if new API format (with parameters array) or old format
        const isNewFormat = aiData.parameters && Array.isArray(aiData.parameters);
        
        let hr, sysBP, diaBP, spo2;
        let transformedVitals: any = {};
        let transformedVentilation: any = {};
        
        if (isNewFormat) {
          // NEW FORMAT: Extract vitals from parameters array
          const vitalParams = aiData.parameters.filter((p: any) => p.category === 'vitals');
          const ventParams = aiData.parameters.filter((p: any) => p.category === 'ventilation');
          
          // Map vitals to old format
          vitalParams.forEach((param: any) => {
            if (param.standardName === 'HR') {
              hr = param.value;
            } else if (param.standardName === 'SysBP') {
              sysBP = param.value;
            } else if (param.standardName === 'DiaBP') {
              diaBP = param.value;
            } else if (param.standardName === 'SpO2') {
              spo2 = param.value;
            }
          });
          
          // Map ventilation to old format
          ventParams.forEach((param: any) => {
            const key = param.standardName.charAt(0).toLowerCase() + param.standardName.slice(1);
            transformedVentilation[key] = param.value;
          });
        } else {
          // OLD FORMAT: Use directly
          hr = aiData.vitals?.hr;
          sysBP = aiData.vitals?.sysBP;
          diaBP = aiData.vitals?.diaBP;
          spo2 = aiData.vitals?.spo2;
          transformedVentilation = aiData.ventilation || {};
        }
        
        // Merge with local detection, preferring high-confidence local values
        hr = (localDetection.hr && localDetection.hr.confidence >= highConfidenceThreshold) 
          ? localDetection.hr.value 
          : hr;
        sysBP = (localDetection.sysBP && localDetection.sysBP.confidence >= highConfidenceThreshold)
          ? localDetection.sysBP.value
          : sysBP;
        diaBP = (localDetection.diaBP && localDetection.diaBP.confidence >= highConfidenceThreshold)
          ? localDetection.diaBP.value
          : diaBP;
        spo2 = (localDetection.spo2 && localDetection.spo2.confidence >= highConfidenceThreshold)
          ? localDetection.spo2.value
          : spo2;
        
        // Apply range validation and clamping
        if (hr !== null && hr !== undefined && !validateVitalRange('hr', hr)) {
          hr = clampToRange('hr', hr);
        }
        if (sysBP !== null && sysBP !== undefined && !validateVitalRange('sysBP', sysBP)) {
          sysBP = clampToRange('sysBP', sysBP);
        }
        if (diaBP !== null && diaBP !== undefined && !validateVitalRange('diaBP', diaBP)) {
          diaBP = clampToRange('diaBP', diaBP);
        }
        if (spo2 !== null && spo2 !== undefined && !validateVitalRange('spo2', spo2)) {
          spo2 = clampToRange('spo2', spo2);
        }
        
        finalData = {
          vitals: { hr, sysBP, diaBP, spo2 },
          ventilation: transformedVentilation,
          tof: aiData.tof,
          pumps: aiData.pumps,
          detectionMethod: isNewFormat ? aiData.detectionMethod : 'hybrid-ai',
          // Store new format data for enhanced confirmation dialog
          ...(isNewFormat && {
            monitorType: aiData.monitorType,
            confidence: aiData.confidence,
            parameters: aiData.parameters,
          }),
        };
      } else {
        // Use local detection only with range validation
        let hr = localDetection.hr?.value;
        let sysBP = localDetection.sysBP?.value;
        let diaBP = localDetection.diaBP?.value;
        let spo2 = localDetection.spo2?.value;
        
        // Apply range validation and clamping
        if (hr !== null && hr !== undefined && !validateVitalRange('hr', hr)) {
          hr = clampToRange('hr', hr);
        }
        if (sysBP !== null && sysBP !== undefined && !validateVitalRange('sysBP', sysBP)) {
          sysBP = clampToRange('sysBP', sysBP);
        }
        if (diaBP !== null && diaBP !== undefined && !validateVitalRange('diaBP', diaBP)) {
          diaBP = clampToRange('diaBP', diaBP);
        }
        if (spo2 !== null && spo2 !== undefined && !validateVitalRange('spo2', spo2)) {
          spo2 = clampToRange('spo2', spo2);
        }
        
        finalData = {
          vitals: { hr, sysBP, diaBP, spo2 },
          ventilation: null,
          tof: null,
          pumps: null,
          detectionMethod: 'local-ocr',
        };
      }
      
      setExtractedData({ ...finalData, timestamp });
      setConfirmationDialogOpen(true);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to analyze image",
        variant: "destructive",
      });
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Confirm and add extracted data to timeline with validation
  const handleConfirmExtractedData = async () => {
    if (!extractedData) return;

    const { vitals, ventilation, tof, pumps, timestamp, parameters } = extractedData;
    
    // Import validation utilities
    const { validateVitalRange, clampToRange } = await import('@/lib/sevenSegmentOCR');
    const { findStandardParameter } = await import('@shared/monitorParameters');
    
    let addedItems: string[] = [];
    let warningItems: string[] = [];

    // Handle NEW FORMAT with parameters array
    if (parameters && Array.isArray(parameters)) {
      // Process vitals from parameters
      const vitalParams = parameters.filter((p: any) => p.category === 'vitals');
      vitalParams.forEach((param: any) => {
        const paramDef = findStandardParameter(param.standardName);
        let value = param.value;
        
        // Validate and clamp if needed
        if (paramDef?.min !== undefined && paramDef?.max !== undefined) {
          if (value < paramDef.min || value > paramDef.max) {
            const clamped = Math.max(paramDef.min, Math.min(paramDef.max, value));
            warningItems.push(`${param.standardName} ${value}→${clamped}`);
            value = clamped;
          }
        }
        
        // Route to appropriate state - NEW: Use React Query mutations
        if (param.standardName === 'HR') {
          addVitalPointMutation.mutate({
            vitalType: 'hr',
            timestamp: new Date(timestamp).toISOString(),
            value,
          });
          addedItems.push('HR');
        } else if (param.standardName === 'SpO2') {
          addVitalPointMutation.mutate({
            vitalType: 'spo2',
            timestamp: new Date(timestamp).toISOString(),
            value,
          });
          addedItems.push('SpO2');
        }
      });
      
      // Handle BP separately since it needs both sys and dia
      const sysBP = vitalParams.find((p: any) => p.standardName === 'SysBP');
      const diaBP = vitalParams.find((p: any) => p.standardName === 'DiaBP');
      if (sysBP && diaBP) {
        let sysValue = sysBP.value;
        let diaValue = diaBP.value;
        
        const sysDef = findStandardParameter('SysBP');
        const diaDef = findStandardParameter('DiaBP');
        
        if (sysDef?.min !== undefined && sysDef?.max !== undefined) {
          if (sysValue < sysDef.min || sysValue > sysDef.max) {
            const clamped = Math.max(sysDef.min, Math.min(sysDef.max, sysValue));
            warningItems.push(`SysBP ${sysValue}→${clamped}`);
            sysValue = clamped;
          }
        }
        if (diaDef?.min !== undefined && diaDef?.max !== undefined) {
          if (diaValue < diaDef.min || diaValue > diaDef.max) {
            const clamped = Math.max(diaDef.min, Math.min(diaDef.max, diaValue));
            warningItems.push(`DiaBP ${diaValue}→${clamped}`);
            diaValue = clamped;
          }
        }
        
        // NEW: Use React Query mutation for BP
        addBPPointMutation.mutate({
          timestamp: new Date(timestamp).toISOString(),
          sys: sysValue,
          dia: diaValue,
        });
        addedItems.push('BP');
      }
      
      // Process ventilation parameters - add to swimlane events
      const ventParams = parameters.filter((p: any) => p.category === 'ventilation');
      if (ventParams.length > 0) {
        ventParams.forEach((param: any) => {
          // Find matching ventilation swimlane ID
          const paramIndex = ventilationParams.findIndex(vp => 
            vp.includes(param.standardName) || 
            (param.standardName === 'RR' && vp.includes('Respiratory Rate')) ||
            (param.standardName === 'TidalVolume' && vp.includes('Tidal Volume')) ||
            (param.standardName === 'EtCO2' && vp.includes('etCO2')) ||
            (param.standardName === 'FiO2' && vp.includes('FiO2')) ||
            (param.standardName === 'PEEP' && vp.includes('PEEP')) ||
            (param.standardName === 'PIP' && vp.includes('P insp'))
          );
          
          if (paramIndex !== -1) {
            const swimlaneId = `ventilation-${paramIndex}`;
            
            // Map standardName to state key
            const paramKey = param.standardName === 'EtCO2' ? 'etCO2' :
                             param.standardName === 'PIP' ? 'pip' :
                             param.standardName === 'PEEP' ? 'peep' :
                             param.standardName === 'TidalVolume' ? 'tidalVolume' :
                             param.standardName === 'RR' ? 'respiratoryRate' :
                             param.standardName === 'MinuteVolume' ? 'minuteVolume' :
                             param.standardName === 'FiO2' ? 'fiO2' : null;
            
            if (paramKey && typeof param.value === 'number') {
              setVentilationData(prev => ({
                ...prev,
                [paramKey]: [...prev[paramKey as keyof typeof prev], [timestamp, param.value as number]]
              }));
              addedItems.push(param.standardName);
            } else {
              console.warn(`[Ventilation] Skipped ${param.standardName}: paramKey=${paramKey}, value type=${typeof param.value}`);
            }
          }
        });
      }
      
      // Process TOF parameters
      const tofParams = parameters.filter((p: any) => p.category === 'tof');
      if (tofParams.length > 0) {
        addedItems.push('TOF (logged)');
      }
    } else {
      // OLD FORMAT: Handle vitals as before
      if (vitals?.hr !== null && vitals?.hr !== undefined) {
        let hr = vitals.hr;
        if (!validateVitalRange('hr', hr)) {
          const clamped = clampToRange('hr', hr);
          warningItems.push(`HR ${hr}→${clamped} (out of range)`);
          hr = clamped;
        }
        setHrDataPoints(prev => [...prev, [timestamp, hr]]);
        addedItems.push('HR');
      }
      if ((vitals?.sysBP !== null && vitals?.sysBP !== undefined) && (vitals?.diaBP !== null && vitals?.diaBP !== undefined)) {
        let sysBP = vitals.sysBP;
        let diaBP = vitals.diaBP;
        if (!validateVitalRange('sysBP', sysBP)) {
          const clamped = clampToRange('sysBP', sysBP);
          warningItems.push(`SysBP ${sysBP}→${clamped}`);
          sysBP = clamped;
        }
        if (!validateVitalRange('diaBP', diaBP)) {
          const clamped = clampToRange('diaBP', diaBP);
          warningItems.push(`DiaBP ${diaBP}→${clamped}`);
          diaBP = clamped;
        }
        setBpDataPoints(prev => ({
          sys: [...prev.sys, [timestamp, sysBP]],
          dia: [...prev.dia, [timestamp, diaBP]],
        }));
        addedItems.push('BP');
      }
      if (vitals?.spo2 !== null && vitals?.spo2 !== undefined) {
        let spo2 = vitals.spo2;
        if (!validateVitalRange('spo2', spo2)) {
          const clamped = clampToRange('spo2', spo2);
          warningItems.push(`SpO2 ${spo2}→${clamped}`);
          spo2 = clamped;
        }
        setSpo2DataPoints(prev => [...prev, [timestamp, spo2]]);
        addedItems.push('SpO2');
      }

      // Log ventilation parameters (old format)
      if (ventilation && Object.values(ventilation).some((v: any) => v !== null && v !== undefined)) {
        addedItems.push('Ventilation (logged)');
      }

      // Log TOF monitoring data
      if (tof && ((tof.ratio !== null && tof.ratio !== undefined) || (tof.count !== null && tof.count !== undefined))) {
        addedItems.push('TOF (logged)');
      }

      // Log pump/perfusion data
      if (pumps && pumps.length > 0) {
        addedItems.push('Pumps (logged)');
      }
    }

    let description = addedItems.length > 0 
      ? `Added: ${addedItems.join(', ')}` 
      : 'No data extracted from image';
    
    // Add warning items if any values were clamped
    if (warningItems.length > 0) {
      description += ` | Adjusted: ${warningItems.join(', ')}`;
    }

    toast({
      title: "Data Processed",
      description,
      duration: 4000,
      variant: warningItems.length > 0 ? "default" : "default",
    });

    setConfirmationDialogOpen(false);
    setExtractedData(null);
  };

  // Handle voice command for drug administration
  const handleVoiceCommand = async (audioBlob: Blob, timestamp: number) => {
    try {
      // Convert blob to base64 (browser-compatible)
      const reader = new FileReader();
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      
      // Step 1: Transcribe audio using Whisper
      const transcribeResponse = await fetch('/api/transcribe-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioData: audioBase64 }),
      });
      
      if (!transcribeResponse.ok) {
        throw new Error('Failed to transcribe voice');
      }
      
      const { transcription } = await transcribeResponse.json();
      
      // Step 2: Parse drug command(s) - may contain multiple drugs
      const parseResponse = await fetch('/api/parse-drug-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcription }),
      });
      
      if (!parseResponse.ok) {
        throw new Error('Failed to parse drug command');
      }
      
      const response = await parseResponse.json();
      
      if (!response.drugs || response.drugs.length === 0) {
        toast({
          title: "Could not understand command",
          description: `Heard: "${transcription}"`,
          variant: "destructive",
        });
        return;
      }
      
      // Step 3 & 4: Process each drug in the command
      const addedDrugs: string[] = [];
      const doseUpdates: Record<string, [number, string][]> = {};
      
      for (const drugCommand of response.drugs) {
        if (!drugCommand.drug || !drugCommand.dose) continue;
        
        // Find matching medication from configured anesthesia items
        const match = findMatchingMedication(drugCommand.drug);
        
        if (match) {
          // Found a matching medication from configured items
          const targetSwimlaneId = match.swimlaneId;
          const matchInfo = ` (${Math.round(match.score * 100)}%)`;
          
          // Prepare dose data point
          if (!doseUpdates[targetSwimlaneId]) {
            doseUpdates[targetSwimlaneId] = [];
          }
          doseUpdates[targetSwimlaneId].push([timestamp, drugCommand.dose] as [number, string]);
          
          addedDrugs.push(`${drugCommand.drug} ${drugCommand.dose}${matchInfo}`);
        } else {
          // No match found - skip this drug
        }
      }
      
      // Update all dose data
      setMedicationDoseData(prev => {
        const updated = { ...prev };
        for (const [swimlaneId, doses] of Object.entries(doseUpdates)) {
          const existingData = updated[swimlaneId] || [];
          updated[swimlaneId] = [...existingData, ...doses];
        }
        return updated;
      });
      
      // TODO: Store in backend anesthesia case data for persistence
      
      const title = addedDrugs.length === 1 ? "Drug Recorded" : `${addedDrugs.length} Drugs Recorded`;
      toast({
        title,
        description: addedDrugs.join(", "),
      });
      
    } catch (error: any) {
      console.error('[Voice] Error:', error);
      toast({
        title: "Voice command failed",
        description: error.message || "Failed to process voice command",
        variant: "destructive",
      });
    }
  };

  // Handle medication dose entry
  const handleMedicationDoseEntry = async () => {
    console.log('[MED] handleMedicationDoseEntry called', { 
      pendingMedicationDose, 
      medicationDoseInput, 
      anesthesiaRecordId 
    });
    
    if (!pendingMedicationDose || !medicationDoseInput.trim() || !anesthesiaRecordId) {
      console.log('[MED] Early return - missing data');
      return;
    }
    
    const { swimlaneId, time, label } = pendingMedicationDose;
    
    // Extract itemId from swimlaneId (format: "group_{groupId}_item_{itemId}")
    const itemIdMatch = swimlaneId.match(/item_([^_]+)$/);
    if (!itemIdMatch) {
      console.log('[MED] No itemId match found for swimlaneId:', swimlaneId);
      toast({
        title: "Error",
        description: "Could not identify medication",
        variant: "destructive",
      });
      return;
    }
    
    const itemId = itemIdMatch[1];
    console.log('[MED] Extracted itemId:', itemId);
    
    const doseValue = medicationDoseInput.trim();
    
    // Save to database
    try {
      console.log('[MED] Calling mutation with:', {
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: "bolus",
        dose: doseValue,
      });
      
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: "bolus",
        dose: doseValue,
      });
      
      console.log('[MED] Mutation successful - updating local state');
      
      // Manually update local state so the dose appears immediately
      setMedicationDoseData(prev => {
        const existing = prev[swimlaneId] || [];
        const newEntry: [number, string] = [time, doseValue];
        return {
          ...prev,
          [swimlaneId]: [...existing, newEntry].sort((a, b) => a[0] - b[0])
        };
      });
      
      toast({
        title: "Dose saved",
        description: `${label}: ${doseValue}`,
      });
    } catch (error) {
      console.error('[MED] Mutation error:', error);
      // Error toast is already shown by mutation's onError
      return;
    }
    
    // Reset dialog state
    setShowMedicationDoseDialog(false);
    setPendingMedicationDose(null);
    setMedicationDoseInput("");
  };

  // Handle ventilation parameter entry
  const handleVentilationParameterEntry = () => {
    if (!pendingVentilationValue || !ventilationValueInput.trim()) return;
    
    const { paramKey, time, label } = pendingVentilationValue;
    const value = parseFloat(ventilationValueInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    setVentilationData(prev => {
      const existingData = prev[paramKey] || [];
      return {
        ...prev,
        [paramKey]: [...existingData, [time, value] as VitalPoint]
      };
    });
    
    // Toast notification disabled (can be re-enabled later)
    // toast({
    //   title: "Value Added",
    //   description: `${label}: ${value} at ${new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
    // });
    
    // Reset dialog state
    setShowVentilationDialog(false);
    setPendingVentilationValue(null);
    setVentilationValueInput("");
  };

  // Handle event comment save
  const handleEventSave = () => {
    if (!eventTextInput.trim()) return;
    
    if (editingEvent) {
      // Edit existing event - use edited time
      setEventComments(prev => 
        prev.map(ev => ev.id === editingEvent.id ? { ...ev, text: eventTextInput.trim(), time: eventEditTime } : ev)
      );
    } else if (pendingEvent) {
      // Add new event
      const newEvent: EventComment = {
        id: `event-${Date.now()}`,
        time: pendingEvent.time,
        text: eventTextInput.trim(),
      };
      setEventComments(prev => [...prev, newEvent]);
    }
    
    // Reset dialog state
    setShowEventDialog(false);
    setPendingEvent(null);
    setEditingEvent(null);
    setEventTextInput("");
  };

  // Handle event delete
  const handleEventDelete = () => {
    if (editingEvent) {
      setEventComments(prev => prev.filter(ev => ev.id !== editingEvent.id));
    }
    
    setShowEventDialog(false);
    setEditingEvent(null);
    setEventTextInput("");
  };

  // Handle medication dose edit save
  const handleMedicationDoseEditSave = () => {
    if (!editingMedicationDose || !medicationEditInput.trim()) return;
    
    const { swimlaneId, index } = editingMedicationDose;
    
    setMedicationDoseData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData];
      updated[index] = [medicationEditTime, medicationEditInput.trim()];
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    // Reset dialog state
    setShowMedicationEditDialog(false);
    setEditingMedicationDose(null);
    setMedicationEditInput("");
  };

  // Handle medication dose delete
  const handleMedicationDoseDelete = () => {
    if (!editingMedicationDose) return;
    
    const { swimlaneId, index } = editingMedicationDose;
    
    setMedicationDoseData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    setShowMedicationEditDialog(false);
    setEditingMedicationDose(null);
    setMedicationEditInput("");
  };

  // Handle infusion value entry
  const handleInfusionValueEntry = () => {
    if (!pendingInfusionValue || !infusionInput.trim()) return;
    
    const { swimlaneId, time, label } = pendingInfusionValue;
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, infusionInput.trim()] as [number, string]]
      };
    });
    
    // Reset dialog state
    setShowInfusionDialog(false);
    setPendingInfusionValue(null);
    setInfusionInput("");
  };

  // Handle infusion value edit save
  const handleInfusionValueEditSave = () => {
    if (!editingInfusionValue || !infusionEditInput.trim()) return;
    
    const { swimlaneId, index } = editingInfusionValue;
    
    // Use the edited timestamp directly (it's already a number)
    const newTimestamp = infusionEditTime;
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData];
      updated[index] = [newTimestamp, infusionEditInput.trim()];
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    // Reset dialog state
    setShowInfusionEditDialog(false);
    setEditingInfusionValue(null);
    setInfusionEditInput("");
    setInfusionEditTime(0);
  };

  // Handle infusion value delete
  const handleInfusionValueDelete = () => {
    if (!editingInfusionValue) return;
    
    const { swimlaneId, index } = editingInfusionValue;
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    setShowInfusionEditDialog(false);
    setEditingInfusionValue(null);
    setInfusionEditInput("");
  };

  // Handle free-flow dose entry (first click, no default dose)
  const handleFreeFlowDoseEntry = () => {
    if (!pendingFreeFlowDose) return;
    
    const { swimlaneId, time, label } = pendingFreeFlowDose;
    
    // Validate numeric input only
    const doseValue = freeFlowDoseInput.trim();
    if (!doseValue || isNaN(Number(doseValue)) || Number(doseValue) <= 0) {
      toast({
        title: "Invalid dose",
        description: "Please enter a valid numeric dose value",
        variant: "destructive",
      });
      return;
    }
    
    // Create new session
    const newSession: FreeFlowSession = {
      swimlaneId,
      startTime: time,
      dose: doseValue,
      label,
    };
    
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });
    
    // Add visual marker
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, doseValue] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Reset dialog state
    setShowFreeFlowDoseDialog(false);
    setPendingFreeFlowDose(null);
    setFreeFlowDoseInput("");
  };

  // Handle free-flow stop (second click)
  const handleFreeFlowStop = () => {
    if (!managingFreeFlowSession) return;
    
    const { swimlaneId, startTime } = managingFreeFlowSession;
    const stopTime = freeFlowManageTime;
    
    // Remove the session from active sessions (stopping it)
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });
    
    // Add a stop marker to terminate the dashed line
    // Use empty string as value to indicate stop point
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Always add stop marker (ensure it's at least 1ms after start to avoid duplicate)
      const actualStopTime = stopTime <= startTime ? startTime + 60000 : stopTime; // Add 1 minute if same time
      return {
        ...prev,
        [swimlaneId]: [...existingData, [actualStopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "Administration stopped",
      description: `${managingFreeFlowSession.label} stopped at ${formatTime(stopTime)}`,
    });
    
    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow start (resume a stopped segment)
  const handleFreeFlowStart = () => {
    if (!managingFreeFlowSession) return;
    
    const { swimlaneId, label, dose, startTime } = managingFreeFlowSession;
    const resumeTime = freeFlowManageTime;
    
    // Create new session to resume the infusion
    const newSession: FreeFlowSession = {
      swimlaneId,
      startTime: resumeTime,
      dose,
      label,
    };
    
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });
    
    // Add visual marker for resume
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [resumeTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "Administration resumed",
      description: `${label} resumed with dose ${dose}`,
    });
    
    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow start new (from management dialog)
  const handleFreeFlowStartNew = () => {
    if (!managingFreeFlowSession) return;
    
    const { swimlaneId, label, dose, startTime: oldStartTime } = managingFreeFlowSession;
    const baseTime = freeFlowManageTime;
    
    // Stop the current session 1 second before the base time
    const stopTime = baseTime - 1000;
    // Start the new session 60 seconds after the base time (60-second gap)
    const newStartTime = baseTime + 60000;
    
    // Remove the old session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== oldStartTime),
      };
    });
    
    // Create new session with same dose at the new start time
    const newSession: FreeFlowSession = {
      swimlaneId,
      startTime: newStartTime,
      dose,
      label,
    };
    
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });
    
    // Add stop marker for old segment, then start marker for new segment (60 seconds later)
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const withStop = [...existingData, [stopTime, ""] as [number, string]];
      return {
        ...prev,
        [swimlaneId]: [...withStop, [newStartTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "New administration started",
      description: `${label} started with dose ${dose}`,
    });
    
    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow delete (from management dialog)
  const handleFreeFlowDelete = () => {
    if (!managingFreeFlowSession) return;
    
    const { swimlaneId, startTime } = managingFreeFlowSession;
    
    // Remove session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });
    
    // Remove ALL associated markers from infusionData for this segment
    // Find and remove all markers between session's startTime and the next stop marker (or end)
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => a[0] - b[0]);
      
      // Find the index of the segment start
      const segmentStartIndex = sortedData.findIndex(([time]) => time === startTime);
      
      if (segmentStartIndex === -1) {
        // Segment not found, return as is
        return prev;
      }
      
      // Find the next stop marker (empty string) after the segment start
      const segmentEndIndex = sortedData.findIndex((marker, idx) => 
        idx > segmentStartIndex && marker[1] === ""
      );
      
      // Remove markers based on whether a stop marker exists
      let filtered;
      if (segmentEndIndex === -1) {
        // No stop marker: only delete the start marker itself (currently running segment)
        filtered = sortedData.filter((_, idx) => idx !== segmentStartIndex);
      } else {
        // Stop marker exists: delete all markers from start to stop (inclusive)
        filtered = sortedData.filter((_, idx) => 
          idx < segmentStartIndex || idx > segmentEndIndex
        );
      }
      
      return {
        ...prev,
        [swimlaneId]: filtered,
      };
    });
    
    toast({
      title: "Administration deleted",
      description: `${managingFreeFlowSession.label} administration removed`,
    });
    
    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle unified sheet save
  const handleSheetSave = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, startTime: oldTime, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim();
    const newTime = sheetTimeInput;
    
    if (!newDose) {
      toast({
        title: "Invalid quantity",
        description: "Please enter a quantity value",
        variant: "destructive",
      });
      return;
    }
    
    // Find the marker index
    const existingData = infusionData[swimlaneId] || [];
    const markerIndex = existingData.findIndex(([t]) => t === oldTime);
    
    if (markerIndex === -1) return;
    
    // Update the infusion data
    setInfusionData(prev => {
      const updated = [...(prev[swimlaneId] || [])];
      updated[markerIndex] = [newTime, newDose];
      
      return {
        ...prev,
        [swimlaneId]: updated.sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Always update the session to keep it in sync
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = sessions.map(session => 
        session.startTime === oldTime 
          ? { ...session, startTime: newTime, dose: newDose }
          : session
      );
      return {
        ...prev,
        [swimlaneId]: updated.sort((a, b) => a.startTime - b.startTime),
      };
    });
    
    // Update the sheet session to reflect changes
    setFreeFlowSheetSession(prev => prev ? {
      ...prev,
      startTime: newTime,
      dose: newDose,
    } : null);
    
    toast({
      title: "Infusion updated",
      description: `${label} updated`,
    });
    
    // Reset sheet state
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet delete
  const handleSheetDelete = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, startTime } = freeFlowSheetSession;
    
    // Remove session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });
    
    // Remove ALL associated markers from infusionData for this segment
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => a[0] - b[0]);
      
      // Find the index of the segment start
      const segmentStartIndex = sortedData.findIndex(([time]) => time === startTime);
      
      if (segmentStartIndex === -1) {
        return prev;
      }
      
      // Find the next stop marker after the segment start
      const segmentEndIndex = sortedData.findIndex((marker, idx) => 
        idx > segmentStartIndex && marker[1] === ""
      );
      
      // Remove markers based on whether a stop marker exists
      let filtered;
      if (segmentEndIndex === -1) {
        // No stop marker: only delete the start marker itself (currently running segment)
        filtered = sortedData.filter((_, idx) => idx !== segmentStartIndex);
      } else {
        // Stop marker exists: delete all markers from start to stop (inclusive)
        filtered = sortedData.filter((_, idx) => 
          idx < segmentStartIndex || idx > segmentEndIndex
        );
      }
      
      return {
        ...prev,
        [swimlaneId]: filtered,
      };
    });
    
    toast({
      title: "Infusion deleted",
      description: `${freeFlowSheetSession.label} removed`,
    });
    
    // Reset sheet state
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Apply edits to free-flow sheet session (called when dialog closes or actions are taken)
  const applySheetEdits = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, startTime, dose } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim();
    const newStartTime = sheetTimeInput;
    
    // Only apply if there are actual changes
    if (!newDose && !newStartTime) return;
    if (newDose === dose && newStartTime === startTime) return;
    
    const finalDose = newDose || dose;
    const finalStartTime = newStartTime || startTime;
    
    // Update infusion data
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Remove old marker and add updated one
      const withoutOld = existingData.filter(([t, _]) => t !== startTime);
      return {
        ...prev,
        [swimlaneId]: [...withoutOld, [finalStartTime, finalDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Update session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = sessions.map(s => 
        s.startTime === startTime 
          ? { ...s, startTime: finalStartTime, dose: finalDose }
          : s
      );
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
  };

  // Handle sheet stop
  const handleSheetStop = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, label, startTime, dose } = freeFlowSheetSession;
    const stopTime = currentTime;
    
    // Apply any edits first (if quantity or time was changed)
    const newDose = sheetDoseInput.trim() || dose;
    const newStartTime = sheetTimeInput || startTime;
    
    // If edits were made, update the infusion data
    if (newDose !== dose || newStartTime !== startTime) {
      setInfusionData(prev => {
        const existingData = prev[swimlaneId] || [];
        // Remove old marker and add updated one
        const withoutOld = existingData.filter(([t, _]) => t !== startTime);
        return {
          ...prev,
          [swimlaneId]: [...withoutOld, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
        };
      });
      
      // Update session if time changed
      if (newStartTime !== startTime) {
        setFreeFlowSessions(prev => {
          const sessions = prev[swimlaneId] || [];
          const updated = sessions.map(s => 
            s.startTime === startTime 
              ? { ...s, startTime: newStartTime, dose: newDose }
              : s
          );
          return {
            ...prev,
            [swimlaneId]: updated,
          };
        });
      }
    }
    
    // Remove the session from freeFlowSessions
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== (newStartTime || startTime)),
      };
    });
    
    // Add stop marker
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [stopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "Infusion stopped",
      description: `${label} stopped`,
    });
    
    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet start (resume)
  const handleSheetStart = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, label } = freeFlowSheetSession;
    // Use the latest dose from input, or fallback to session dose
    const dose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    const newStartTime = currentTime;
    
    
    // Create a new session at current time
    const newSession: FreeFlowSession = {
      swimlaneId,
      startTime: newStartTime,
      dose,
      label,
    };
    
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = [...sessions, newSession].sort((a, b) => a.startTime - b.startTime);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    // Add start marker with the same dose
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData, [newStartTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    toast({
      title: "Infusion resumed",
      description: `${label} resumed with dose ${dose}`,
    });
    
    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet start new (hang a new bag)
  const handleSheetStartNew = () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    const newStartTime = currentTime;
    
    if (!newDose) {
      toast({
        title: "Quantity required",
        description: "Please enter the quantity for the new bag",
        variant: "destructive",
      });
      return;
    }
    
    // Stop any active sessions
    setFreeFlowSessions(prev => {
      return {
        ...prev,
        [swimlaneId]: [],
      };
    });
    
    // Create new session at current time with new dose
    const newSession: FreeFlowSession = {
      swimlaneId,
      startTime: newStartTime,
      dose: newDose,
      label,
    };
    
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });
    
    // Add stop marker at current time, then immediately start new segment with new dose
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const withStop = [...existingData, [newStartTime, ""] as [number, string]];
      return {
        ...prev,
        [swimlaneId]: [...withStop, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "New bag started",
      description: `${label} - new bag with ${newDose}ml started`,
    });
    
    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // ============ Rate Infusion Sheet Handlers ============
  
  // Handle rate sheet save (editing historical rate data)
  const handleRateSheetSave = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const newTime = sheetRateTimeInput;
    
    if (!newRate) {
      toast({
        title: "Invalid rate",
        description: "Please enter a rate value",
        variant: "destructive",
      });
      return;
    }
    
    // Update the rate in infusionData and session segments
    const session = getActiveSession(swimlaneId);
    if (session) {
      setRateInfusionSessions(prev => {
        const sessions = prev[swimlaneId];
        if (!sessions || sessions.length === 0) return prev;
        
        // Update the active session (last running or last in array)
        const activeIndex = sessions.findIndex(s => s.state === 'running');
        const indexToUpdate = activeIndex !== -1 ? activeIndex : sessions.length - 1;
        
        const updatedSegments = sessions[indexToUpdate].segments.map((seg, idx) => 
          idx === sessions[indexToUpdate].segments.length - 1
            ? { ...seg, rate: newRate, startTime: newTime || seg.startTime }
            : seg
        );
        
        const updatedSessions = [...sessions];
        updatedSessions[indexToUpdate] = {
          ...sessions[indexToUpdate],
          segments: updatedSegments,
        };
        
        return {
          ...prev,
          [swimlaneId]: updatedSessions,
        };
      });
    }
    
    // Update infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
      const latestIndex = sortedData.findIndex(([_, val]) => val !== "");
      
      if (latestIndex !== -1) {
        const updated = [...existingData];
        const originalTime = sortedData[latestIndex][0];
        const replaceIndex = updated.findIndex(([t]) => t === originalTime);
        if (replaceIndex !== -1) {
          updated[replaceIndex] = [newTime || originalTime, newRate];
        }
        return {
          ...prev,
          [swimlaneId]: updated.sort((a, b) => a[0] - b[0]),
        };
      }
      return prev;
    });
    
    toast({
      title: "Rate updated",
      description: `${label} rate updated to ${newRate}`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetRateTimeInput(0);
  };
  
  // Handle rate sheet pause
  const handleRateSheetPause = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label } = rateSheetSession;
    
    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;
      
      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'paused',
        },
      };
    });
    
    toast({
      title: "Infusion paused",
      description: `${label} paused`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
  };
  
  // Handle rate sheet resume
  const handleRateSheetResume = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label } = rateSheetSession;
    
    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;
      
      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'running',
        },
      };
    });
    
    toast({
      title: "Infusion resumed",
      description: `${label} resumed`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
  };
  
  // Handle rate sheet stop
  const handleRateSheetStop = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label } = rateSheetSession;
    const stopTime = currentTime;
    
    // Add stop marker to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [stopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Update session state to stopped
    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;
      
      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'stopped',
        },
      };
    });
    
    toast({
      title: "Infusion stopped",
      description: `${label} stopped`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
  };
  
  // Handle rate sheet change rate (creates new segment at current time)
  const handleRateSheetChangeRate = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label, rateUnit } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const changeTime = currentTime;
    
    if (!newRate) {
      toast({
        title: "Invalid rate",
        description: "Please enter a rate value",
        variant: "destructive",
      });
      return;
    }
    
    // Add new rate segment
    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;
      
      const newSegment: RateInfusionSegment = {
        startTime: changeTime,
        rate: newRate,
        rateUnit: rateUnit,
      };
      
      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          segments: [...session.segments, newSegment],
        },
      };
    });
    
    // Add new rate to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [changeTime, newRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "Rate changed",
      description: `${label} rate changed to ${newRate} ${rateUnit}`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
  };
  
  // Handle rate sheet start new (new syringe with inventory deduction)
  const handleRateSheetStartNew = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label, rateUnit } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const newQuantity = sheetQuantityInput.trim();
    const startTime = currentTime;
    
    if (!newRate) {
      toast({
        title: "Rate required",
        description: "Please enter a rate value",
        variant: "destructive",
      });
      return;
    }
    
    // TODO: Add inventory deduction here when implementing task 7
    
    // Create new session or update existing
    const newSegment: RateInfusionSegment = {
      startTime,
      rate: newRate,
      rateUnit: rateUnit,
    };
    
    setRateInfusionSessions(prev => {
      return {
        ...prev,
        [swimlaneId]: {
          swimlaneId,
          label,
          syringeQuantity: newQuantity || "50ml", // Default if not specified
          segments: [newSegment],
          state: 'running',
        },
      };
    });
    
    // Add start marker to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Add stop marker first if there was a previous session, then start new
      const withStop = existingData.length > 0 
        ? [...existingData, [startTime, ""] as [number, string]]
        : existingData;
      return {
        ...prev,
        [swimlaneId]: [...withStop, [startTime, newRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "New infusion started",
      description: `${label} started at ${newRate} ${rateUnit}`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetQuantityInput("");
  };
  
  // Handle rate sheet delete
  const handleRateSheetDelete = () => {
    if (!rateSheetSession) return;
    
    const { swimlaneId, label } = rateSheetSession;
    
    // Remove entire session
    setRateInfusionSessions(prev => {
      const newSessions = { ...prev };
      delete newSessions[swimlaneId];
      return newSessions;
    });
    
    // Remove all infusion data for this lane
    setInfusionData(prev => {
      const newData = { ...prev };
      delete newData[swimlaneId];
      return newData;
    });
    
    toast({
      title: "Infusion deleted",
      description: `${label} removed`,
    });
    
    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetQuantityInput("");
  };

  // Handle rate selection (from rate options or custom input)
  const handleRateSelection = (selectedRate: string) => {
    if (!pendingRateSelection) return;
    
    const { swimlaneId, time, label } = pendingRateSelection;
    
    // Add the selected rate to infusion data
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, selectedRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Get the rateUnit from the swimlane
    const swimlane = activeSwimlanes.find((lane: any) => lane.id === swimlaneId);
    const rateUnit = swimlane?.rateUnit || '';
    
    // Create initial rate infusion session
    const newSegment: RateInfusionSegment = {
      startTime: time,
      rate: selectedRate,
      rateUnit: rateUnit,
    };
    setRateInfusionSessions(prev => ({
      ...prev,
      [swimlaneId]: {
        swimlaneId,
        label,
        syringeQuantity: "50ml", // Default
        segments: [newSegment],
        state: 'running',
      },
    }));
    
    toast({
      title: "Rate set",
      description: `${label} set to ${selectedRate}`,
    });
    
    // Reset dialog state
    setShowRateSelectionDialog(false);
    setPendingRateSelection(null);
    setCustomRateInput("");
  };

  // Handle custom rate entry (from rate selection dialog)
  const handleCustomRateEntry = () => {
    const rate = customRateInput.trim();
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      toast({
        title: "Invalid rate",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    handleRateSelection(rate);
  };

  // Handle rate start (resume a stopped rate-controlled infusion)
  const handleRateStart = (rate: string) => {
    if (!managingRate) return;
    
    const { swimlaneId, label } = managingRate;
    const resumeTime = rateManageTime;
    
    // Add new rate marker to resume the infusion
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [resumeTime, rate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "Infusion resumed",
      description: `${label} resumed at ${rate}`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle rate stop (from management dialog)
  const handleRateStop = () => {
    if (!managingRate) return;
    
    const { swimlaneId, time: originalTime } = managingRate;
    const stopTime = rateManageTime;
    
    // Find all rate changes after the current one
    const existingData = infusionData[swimlaneId] || [];
    const laterRates = existingData.filter(([t]) => t > originalTime);
    
    if (laterRates.length > 0) {
      // There are later rates - just remove this one and let the next rate take over
      setInfusionData(prev => {
        const data = prev[swimlaneId] || [];
        return {
          ...prev,
          [swimlaneId]: data.filter(([t]) => t !== originalTime),
        };
      });
    } else {
      // No later rates - add a stop marker at the new time if different
      if (stopTime > originalTime) {
        setInfusionData(prev => {
          const data = prev[swimlaneId] || [];
          // Remove the current rate and add an empty marker to stop the line
          const filtered = data.filter(([t]) => t !== originalTime);
          return {
            ...prev,
            [swimlaneId]: [...filtered, [stopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
          };
        });
      } else {
        // Just remove the rate
        setInfusionData(prev => {
          const data = prev[swimlaneId] || [];
          return {
            ...prev,
            [swimlaneId]: data.filter(([t]) => t !== originalTime),
          };
        });
      }
    }
    
    toast({
      title: "Rate stopped",
      description: `${managingRate.label} stopped`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle start new rate (from management dialog)
  const handleRateStartNew = (newRate: string) => {
    if (!managingRate) return;
    
    const { swimlaneId, label, time: oldTime } = managingRate;
    const newTime = rateManageTime;
    
    // Add stop marker just before new rate, then add new rate
    const stopTime = newTime - 1000; // 1 second before new start
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const withStop = [...existingData, [stopTime, ""] as [number, string]];
      return {
        ...prev,
        [swimlaneId]: [...withStop, [newTime, newRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    toast({
      title: "New rate started",
      description: `${label} set to ${newRate}`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle change rate (update existing rate value)
  const handleRateChange = (newRate: string) => {
    if (!managingRate) return;
    
    const { swimlaneId, time, label } = managingRate;
    
    // Update the rate value at the same time
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = existingData.map(([t, v]) => 
        t === time ? [t, newRate] as [number, string] : [t, v] as [number, string]
      );
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
    
    toast({
      title: "Rate changed",
      description: `${label} changed to ${newRate}`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle output value entry (single parameter)
  const handleOutputValueEntry = () => {
    if (!pendingOutputValue || !outputValueInput.trim()) return;
    
    const { paramKey, time, label } = pendingOutputValue;
    const value = parseFloat(outputValueInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    setOutputData(prev => {
      const existingData = prev[paramKey] || [];
      return {
        ...prev,
        [paramKey]: [...existingData, [time, value] as VitalPoint]
      };
    });
    
    // Reset dialog state
    setShowOutputDialog(false);
    setPendingOutputValue(null);
    setOutputValueInput("");
  };

  // Handle ventilation value edit save
  const handleVentilationValueEditSave = () => {
    if (!editingVentilationValue || !ventilationEditInput.trim()) return;
    
    const { paramKey, index } = editingVentilationValue;
    const value = parseFloat(ventilationEditInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    // Use the edited timestamp directly (it's already a number)
    const newTimestamp = ventilationEditTime;
    
    setVentilationData(prev => {
      const existingData = prev[paramKey] || [];
      const updated = [...existingData];
      updated[index] = [newTimestamp, value];
      return {
        ...prev,
        [paramKey]: updated,
      };
    });
    
    // Reset dialog state
    setShowVentilationEditDialog(false);
    setEditingVentilationValue(null);
    setVentilationEditInput("");
    setVentilationEditTime(0);
  };

  // Handle ventilation value delete
  const handleVentilationValueDelete = () => {
    if (!editingVentilationValue) return;
    
    const { paramKey, index } = editingVentilationValue;
    
    setVentilationData(prev => {
      const existingData = prev[paramKey] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [paramKey]: updated,
      };
    });
    
    setShowVentilationEditDialog(false);
    setEditingVentilationValue(null);
    setVentilationEditInput("");
  };

  // Handle ventilation mode edit save
  const handleVentilationModeEditSave = () => {
    if (!editingVentilationMode || !ventilationModeEditInput.trim()) return;
    
    const { index } = editingVentilationMode;
    
    // Use the edited timestamp directly (it's already a number)
    const newTimestamp = ventilationModeEditTime;
    
    setVentilationModeData(prev => {
      const updated = [...prev];
      updated[index] = [newTimestamp, ventilationModeEditInput.trim()];
      return updated;
    });
    
    setShowVentilationModeEditDialog(false);
    setEditingVentilationMode(null);
    setVentilationModeEditInput("");
    setVentilationModeEditTime(0);
  };

  // Handle ventilation mode delete
  const handleVentilationModeDelete = () => {
    if (!editingVentilationMode) return;
    
    const { index } = editingVentilationMode;
    
    setVentilationModeData(prev => prev.filter((_, i) => i !== index));
    
    setShowVentilationModeEditDialog(false);
    setEditingVentilationMode(null);
    setVentilationModeEditInput("");
  };

  // Handle heart rhythm save
  const handleHeartRhythmSave = (rhythmValue?: string) => {
    const rhythm = (rhythmValue || heartRhythmInput).trim();
    if (!rhythm) return;
    
    // Determine time to use
    let time: number;
    
    if (editingHeartRhythm) {
      // Editing existing value
      const { index } = editingHeartRhythm;
      
      // Use the edited timestamp directly (it's already a number)
      const newTimestamp = heartRhythmEditTime;
      
      setHeartRhythmData(prev => {
        const updated = [...prev];
        updated[index] = [newTimestamp, rhythm];
        return updated;
      });
    } else if (pendingHeartRhythm) {
      // Adding new value
      time = pendingHeartRhythm.time;
      setHeartRhythmData(prev => [...prev, [time, rhythm]]);
    }
    
    setShowHeartRhythmDialog(false);
    setPendingHeartRhythm(null);
    setEditingHeartRhythm(null);
    setHeartRhythmInput("");
    setHeartRhythmEditTime(0);
  };

  // Handle heart rhythm delete
  const handleHeartRhythmDelete = () => {
    if (!editingHeartRhythm) return;
    
    const { index } = editingHeartRhythm;
    
    setHeartRhythmData(prev => prev.filter((_, i) => i !== index));
    
    setShowHeartRhythmDialog(false);
    setEditingHeartRhythm(null);
    setHeartRhythmInput("");
    setHeartRhythmEditTime(0);
  };

  // Handle staff entry save
  const handleStaffSave = () => {
    const name = staffInput.trim();
    if (!name) return;
    
    if (editingStaff) {
      // Editing existing value - use edited time
      const { index, role } = editingStaff;
      
      setStaffData(prev => {
        const updated = { ...prev };
        updated[role][index] = [staffEditTime, name];
        return updated;
      });
    } else if (pendingStaff) {
      // Adding new value
      const { time, role } = pendingStaff;
      setStaffData(prev => ({
        ...prev,
        [role]: [...prev[role], [time, name]],
      }));
    }
    
    setShowStaffDialog(false);
    setPendingStaff(null);
    setEditingStaff(null);
    setStaffInput("");
  };

  // Handle staff entry delete
  const handleStaffDelete = () => {
    if (!editingStaff) return;
    
    const { index, role } = editingStaff;
    
    setStaffData(prev => ({
      ...prev,
      [role]: prev[role].filter((_, i) => i !== index),
    }));
    
    setShowStaffDialog(false);
    setEditingStaff(null);
    setStaffInput("");
  };

  // Handle position entry save
  const handlePositionSave = () => {
    const position = positionInput.trim();
    if (!position) return;
    
    let time: number;
    
    if (editingPosition) {
      // Editing existing value - use edited time
      const { index } = editingPosition;
      
      setPositionData(prev => {
        const updated = [...prev];
        updated[index] = [positionEditTime, position];
        return updated;
      });
    } else if (pendingPosition) {
      // Adding new value
      time = pendingPosition.time;
      setPositionData(prev => [...prev, [time, position]]);
    }
    
    setShowPositionDialog(false);
    setPendingPosition(null);
    setEditingPosition(null);
    setPositionInput("");
  };

  // Handle position entry delete
  const handlePositionDelete = () => {
    if (!editingPosition) return;
    
    const { index } = editingPosition;
    
    setPositionData(prev => prev.filter((_, i) => i !== index));
    
    setShowPositionDialog(false);
    setEditingPosition(null);
    setPositionInput("");
  };

  // Handle ventilation bulk entry save
  const handleVentilationBulkSave = () => {
    if (!pendingVentilationBulk) return;
    
    const { time } = pendingVentilationBulk;
    
    // Save the selected ventilation mode to the parent swimlane ONLY if:
    // 1. It's the first value, OR
    // 2. It's different from the previous mode
    setVentilationModeData(prev => {
      if (prev.length === 0) {
        // First value - always add
        return [[time, ventilationMode]];
      }
      
      // Check if the last mode is different from the current one
      const lastMode = prev[prev.length - 1][1];
      if (lastMode !== ventilationMode) {
        // Different from previous - add it
        return [...prev, [time, ventilationMode]];
      }
      
      // Same as previous - don't add
      return prev;
    });
    
    // Add all filled parameters at the same time
    setVentilationData(prev => {
      const updated = { ...prev };
      
      if (bulkVentilationParams.peep) {
        const value = parseFloat(bulkVentilationParams.peep);
        if (!isNaN(value)) {
          updated.peep = [...updated.peep, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.fiO2) {
        const value = parseFloat(bulkVentilationParams.fiO2);
        if (!isNaN(value)) {
          updated.fiO2 = [...updated.fiO2, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.tidalVolume) {
        const value = parseFloat(bulkVentilationParams.tidalVolume);
        if (!isNaN(value)) {
          updated.tidalVolume = [...updated.tidalVolume, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.respiratoryRate) {
        const value = parseFloat(bulkVentilationParams.respiratoryRate);
        if (!isNaN(value)) {
          updated.respiratoryRate = [...updated.respiratoryRate, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.etCO2) {
        const value = parseFloat(bulkVentilationParams.etCO2);
        if (!isNaN(value)) {
          updated.etCO2 = [...updated.etCO2, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.pip) {
        const value = parseFloat(bulkVentilationParams.pip);
        if (!isNaN(value)) {
          updated.pip = [...updated.pip, [time, value] as VitalPoint];
        }
      }
      
      if (bulkVentilationParams.minuteVolume) {
        const value = parseFloat(bulkVentilationParams.minuteVolume);
        if (!isNaN(value)) {
          updated.minuteVolume = [...updated.minuteVolume, [time, value] as VitalPoint];
        }
      }
      
      return updated;
    });
    
    // Reset dialog state
    setShowVentilationBulkDialog(false);
    setPendingVentilationBulk(null);
  };

  // Handle output bulk entry save
  const handleOutputBulkSave = () => {
    if (!pendingOutputBulk) return;
    
    const { time } = pendingOutputBulk;
    
    // Add all filled parameters at the same time
    setOutputData(prev => {
      const updated = { ...prev };
      
      if (bulkOutputParams.gastricTube) {
        const value = parseFloat(bulkOutputParams.gastricTube);
        if (!isNaN(value)) {
          updated.gastricTube = [...updated.gastricTube, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.drainage) {
        const value = parseFloat(bulkOutputParams.drainage);
        if (!isNaN(value)) {
          updated.drainage = [...updated.drainage, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.vomit) {
        const value = parseFloat(bulkOutputParams.vomit);
        if (!isNaN(value)) {
          updated.vomit = [...updated.vomit, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.urine) {
        const value = parseFloat(bulkOutputParams.urine);
        if (!isNaN(value)) {
          updated.urine = [...updated.urine, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.urine677) {
        const value = parseFloat(bulkOutputParams.urine677);
        if (!isNaN(value)) {
          updated.urine677 = [...updated.urine677, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.blood) {
        const value = parseFloat(bulkOutputParams.blood);
        if (!isNaN(value)) {
          updated.blood = [...updated.blood, [time, value] as VitalPoint];
        }
      }
      
      if (bulkOutputParams.bloodIrrigation) {
        const value = parseFloat(bulkOutputParams.bloodIrrigation);
        if (!isNaN(value)) {
          updated.bloodIrrigation = [...updated.bloodIrrigation, [time, value] as VitalPoint];
        }
      }
      
      return updated;
    });
    
    // Reset dialog state
    setShowOutputBulkDialog(false);
    setPendingOutputBulk(null);
  };

  // Handle output value edit save
  const handleOutputValueEditSave = () => {
    if (!editingOutputValue || !outputEditInput.trim()) return;
    
    const { paramKey, index } = editingOutputValue;
    const value = parseFloat(outputEditInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    // Use the edited timestamp directly (it's already a number)
    const newTimestamp = outputEditTime;
    
    setOutputData(prev => {
      const existingData = prev[paramKey] || [];
      const updated = [...existingData];
      updated[index] = [newTimestamp, value];
      return {
        ...prev,
        [paramKey]: updated,
      };
    });
    
    // Reset dialog state
    setShowOutputEditDialog(false);
    setEditingOutputValue(null);
    setOutputEditInput("");
    setOutputEditTime(0);
  };

  // Handle output value delete
  const handleOutputValueDelete = () => {
    if (!editingOutputValue) return;
    
    const { paramKey, index } = editingOutputValue;
    
    setOutputData(prev => {
      const existingData = prev[paramKey] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [paramKey]: updated,
      };
    });
    
    setShowOutputEditDialog(false);
    setEditingOutputValue(null);
    setOutputEditInput("");
    setOutputEditTime(0);
  };

  // Calculate swimlane positions for sidebar
  const SWIMLANE_START = VITALS_TOP_POS + VITALS_HEIGHT;
  let currentTop = SWIMLANE_START;
  const swimlanePositions = activeSwimlanes.map((lane) => {
    const pos = { ...lane, top: currentTop };
    currentTop += lane.height;
    return pos;
  });
  
  // Calculate exact height needed for vertical lines (they start at VITALS_TOP and extend chartHeight down)
  // chartHeight = VITALS_HEIGHT + swimlanesHeight (from the option calculation)
  const backgroundsHeight = VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight;
  
  return (
    <div className="w-full relative" style={{ height: componentHeight }}>
      {/* Sticky Timeline Header */}
      <StickyTimelineHeader
        startTime={data.startTime}
        endTime={data.endTime}
        currentStart={currentZoomStart}
        currentEnd={currentZoomEnd}
        isDark={isDark}
        activeToolMode={activeToolMode}
        onPanLeft={handlePanLeft}
        onPanRight={handlePanRight}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onCameraCapture={handleCameraCapture}
        onVoiceCommand={handleVoiceCommand}
      />
      
      {/* Swimlane backgrounds - explicit height matching vertical lines extent */}
      <div className="absolute left-0 top-0 right-0 pointer-events-none z-0" style={{ height: `${backgroundsHeight}px` }}>
        {swimlanePositions.map((lane, index) => {
          // Apply same darker background logic for group headers
          let swimlaneBackgroundColor: string;
          if (lane.hierarchyLevel === 'group') {
            // Match the darker background used for group headers
            swimlaneBackgroundColor = isDark ? "hsl(150, 45%, 8%)" : "hsl(150, 50%, 75%)";
          } else {
            swimlaneBackgroundColor = isDark ? lane.colorDark : lane.colorLight;
          }
          
          // Remove border-b from group headers
          const shouldShowBorder = lane.hierarchyLevel !== 'group';
          
          return (
            <div 
              key={lane.id}
              className={`absolute w-full ${shouldShowBorder ? 'border-b' : ''}`}
              style={{ 
                top: `${lane.top}px`, 
                height: `${lane.height}px`, 
                backgroundColor: swimlaneBackgroundColor,
                borderColor: isDark ? "#444444" : "#d1d5db"
              }} 
            />
          );
        })}
      </div>

      {/* Left sidebar */}
      <div className="absolute left-0 top-0 w-[200px] h-full border-r border-border z-30 bg-background">
        {/* Y-axis scales - manually rendered on right side of white area */}
        <div className="absolute top-[32px] h-[380px] w-full pointer-events-none z-50">
          {/* First scale: 20-220 with 20-unit steps (11 values) - close to grid, grid extends 0 to 240 for top and bottom padding */}
          {[20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((val) => {
            const yPercent = ((240 - val) / 240) * 100;
            return (
              <div 
                key={`scale1-${val}`}
                className="absolute text-xs font-medium text-foreground"
                style={{ 
                  right: '60px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)'
                }}
              >
                {val}
              </div>
            );
          })}
          
          {/* Second scale: 50-100 with 10-unit steps (6 values) - purple, closest to grid, extends 45 to 105 for padding */}
          {[50, 60, 70, 80, 90, 100].map((val) => {
            const yPercent = ((105 - val) / 60) * 100;
            return (
              <div 
                key={`scale2-${val}`}
                className="absolute text-xs font-bold"
                style={{ 
                  right: '28px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)',
                  color: '#8b5cf6'
                }}
              >
                {val}
              </div>
            );
          })}
        </div>
        
        {/* Vitals icon buttons */}
        <div className="absolute top-[32px] h-[380px] w-full flex flex-col items-start justify-center gap-2 pl-4">
          <button
            onClick={() => {
              if (activeToolMode === 'bp') {
                setActiveToolMode(null);
                setBpEntryMode('sys');
                setPendingSysValue(null);
              } else {
                setActiveToolMode('bp');
                setBpEntryMode('sys');
                setPendingSysValue(null);
              }
            }}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'bp' 
                ? 'border-foreground bg-foreground/20' 
                : 'border-border bg-background hover:border-foreground hover:bg-foreground/10'
            }`}
            data-testid="button-vitals-bp"
            title="Blood Pressure (NIBP)"
          >
            <ChevronsDownUp className={`w-5 h-5 transition-colors ${activeToolMode === 'bp' ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'hr' ? null : 'hr')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'hr' 
                ? 'border-red-500 bg-red-500/20' 
                : 'border-border bg-background hover:border-red-500 hover:bg-red-500/10'
            }`}
            data-testid="button-vitals-heart"
            title="Heart Rate"
          >
            <Heart className={`w-5 h-5 transition-colors ${activeToolMode === 'hr' ? 'text-red-500' : 'hover:text-red-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'spo2' ? null : 'spo2')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'spo2' 
                ? 'border-blue-500 bg-blue-500/20' 
                : 'border-border bg-background hover:border-blue-500 hover:bg-blue-500/10'
            }`}
            data-testid="button-vitals-oxygen"
            title="Oxygenation (SpO2)"
          >
            <CircleDot className={`w-5 h-5 transition-colors ${activeToolMode === 'spo2' ? 'text-blue-500' : 'hover:text-blue-500'}`} />
          </button>
          <button
            onClick={() => {
              if (activeToolMode === 'blend') {
                setActiveToolMode(null);
                setBlendSequenceStep('sys');
              } else {
                setActiveToolMode('blend');
                setBlendSequenceStep('sys');
              }
            }}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'blend' 
                ? 'border-purple-500 bg-purple-500/20' 
                : 'border-border bg-background hover:border-purple-500 hover:bg-purple-500/10'
            }`}
            data-testid="button-vitals-combo"
            title="Sequential Vitals Mode"
          >
            <Blend className={`w-5 h-5 transition-colors ${activeToolMode === 'blend' ? 'text-purple-500' : 'hover:text-purple-500'}`} />
          </button>
          <button
            onClick={() => {
              if (activeToolMode === 'edit') {
                setActiveToolMode(null);
                setSelectedPoint(null);
                setDragPosition(null);
              } else {
                setActiveToolMode('edit');
              }
            }}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'edit' 
                ? 'border-amber-500 bg-amber-500/20' 
                : 'border-border bg-background hover:border-amber-500 hover:bg-amber-500/10'
            }`}
            data-testid="button-vitals-edit"
            title="Edit Mode - Move Vital Points"
          >
            <Pencil className={`w-5 h-5 transition-colors ${activeToolMode === 'edit' ? 'text-amber-500' : 'hover:text-amber-500'}`} />
          </button>
        </div>

        {/* Swimlane labels */}
        {swimlanePositions.map((lane, index) => {
          // Find the corresponding swimlane config to access metadata
          const swimlaneConfig = activeSwimlanes.find(s => s.id === lane.id);
          
          const isZeitenLane = lane.id === "zeiten";
          const isMedParent = lane.id === "medikamente";
          const isVentParent = lane.id === "ventilation";
          const isOutputParent = lane.id === "output";
          const isStaffParent = lane.id === "staff";
          const isVentChild = lane.id.startsWith("ventilation-");
          const isOutputChild = lane.id.startsWith("output-");
          const isStaffChild = lane.id.startsWith("staff-");
          
          // Only the main parent swimlanes are collapsible
          const isCollapsibleParent = isMedParent || isVentParent || isOutputParent || isStaffParent;
          
          // Determine styling based on hierarchyLevel field
          let labelClass = "";
          if (swimlaneConfig?.hierarchyLevel === 'parent' || isCollapsibleParent || lane.id === "zeiten" || lane.id === "ereignisse" || lane.id === "herzrhythmus" || lane.id === "position") {
            // Level 1: Main parent swimlanes (collapsible)
            labelClass = "text-sm font-semibold";
          } else if (swimlaneConfig?.hierarchyLevel === 'group') {
            // Level 2: Administration group headers (non-collapsible, bold, smaller)
            labelClass = "text-xs font-semibold";
          } else if (swimlaneConfig?.hierarchyLevel === 'item' || isVentChild || isOutputChild || isStaffChild) {
            // Level 3: Individual items (non-collapsible, not bold, smaller)
            labelClass = "text-xs";
          } else {
            // Default
            labelClass = "text-sm";
          }
          
          // Apply same darker background logic to label area as swimlane area
          let labelBackgroundColor: string;
          if (swimlaneConfig?.hierarchyLevel === 'group') {
            // Match the darker background used in swimlane area for group headers
            labelBackgroundColor = isDark ? "hsl(150, 45%, 8%)" : "hsl(150, 50%, 75%)";
          } else {
            labelBackgroundColor = isDark ? lane.colorDark : lane.colorLight;
          }
          
          // Remove border-b from group headers
          const shouldShowBorder = swimlaneConfig?.hierarchyLevel !== 'group';
          
          return (
            <div 
              key={lane.id}
              className={`absolute w-full flex items-center justify-between px-2 ${shouldShowBorder ? 'border-b' : ''}`}
              style={{ 
                top: `${lane.top}px`,
                height: `${lane.height}px`,
                backgroundColor: labelBackgroundColor,
                borderColor: isDark ? "#444444" : "#d1d5db"
              }}
            >
              <div className="flex items-center gap-1 flex-1">
                {isCollapsibleParent && (
                  <button
                    onClick={() => toggleSwimlane(lane.id)}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors group"
                    data-testid={`button-toggle-${lane.id}`}
                    title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                  >
                    {collapsedSwimlanes.has(lane.id) ? (
                      <ChevronRight className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                    )}
                  </button>
                )}
                <span className={`${labelClass} text-black dark:text-white`}>
                  {lane.label}
                </span>
              </div>
              
              {isZeitenLane && (
                <button
                  onClick={() => setBulkEditDialogOpen(true)}
                  className="p-1 rounded hover:bg-background/50 transition-colors group"
                  data-testid="button-edit-anesthesia-times"
                  title="Edit Anesthesia Times"
                >
                  <Clock className="w-4 h-4 text-foreground/70 group-hover:text-foreground transition-colors" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ECharts timeline */}
      <div className={`absolute inset-0 z-20 ${activeToolMode ? 'pointer-events-none' : ''}`}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          onChartReady={handleChartReady}
          lazyUpdate
          notMerge={false}
        />
      </div>

      {/* Interactive layer for vitals entry - only active when tool mode is selected */}
      {activeToolMode && (
        <div
          data-vitals-overlay="true"
          className={`absolute z-30 ${activeToolMode === 'edit' ? (selectedPoint ? 'cursor-grabbing' : 'cursor-pointer') : 'cursor-crosshair'}`}
          style={{
            left: '200px',
            right: '10px',
            top: '32px',
            height: '380px',
          }}
          onMouseMove={(e) => {
            // Skip hover preview on touch devices
            if (isTouchDevice) return;
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Use tracked zoom state (updated by dataZoom event listener)
            const visibleStart = currentZoomStart ?? data.startTime;
            const visibleEnd = currentZoomEnd ?? data.endTime;
            const visibleRange = visibleEnd - visibleStart;
            
            // Convert x-position to time
            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);
            
            // Snap to nearest vertical grid line - use zoom-dependent interval for vitals
            time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
            
            // Check if time is within editable boundaries (only show hover if editable)

            const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
            const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
            const isEditable = time >= editableStartBoundary && time <= editableEndBoundary;
            
            // Convert y-position to value based on active tool
            let value: number;
            const yPercent = y / rect.height;
            
            if (activeToolMode === 'edit' && selectedPoint) {
              // In edit mode with selected point - show drag preview
              // VERTICAL DRAG ONLY - time stays fixed to original point's timestamp
              const isSpO2 = selectedPoint.type === 'spo2';
              if (isSpO2) {
                const minVal = 45;
                const maxVal = 105;
                const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
                value = Math.min(rawValue, 100);
              } else {
                const minVal = 0;
                const maxVal = 240;
                value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              }
              const fixedTime = selectedPoint.originalTime; // Keep time constant during drag
              setDragPosition({ time: fixedTime, value });
              setHoverInfo({ x: e.clientX, y: e.clientY, value, time: fixedTime });
            } else if (isEditable && (activeToolMode === 'hr' || activeToolMode === 'bp' || (activeToolMode === 'blend' && (blendSequenceStep === 'sys' || blendSequenceStep === 'dia' || blendSequenceStep === 'hr')))) {
              // BP/HR scale: 0 to 240 (only show if within editable window)
              const minVal = 0;
              const maxVal = 240;
              value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
            } else if (isEditable && (activeToolMode === 'spo2' || (activeToolMode === 'blend' && blendSequenceStep === 'spo2'))) {
              // SpO2 scale: 45 to 105, capped at 100% (only show if within editable window)
              const minVal = 45;
              const maxVal = 105;
              const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              value = Math.min(rawValue, 100); // Cap at 100%
              setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
            } else {
              // Clear hover info if outside editable window
              setHoverInfo(null);
            }
          }}
          onMouseLeave={() => setHoverInfo(null)}
          onMouseDown={(e) => {
            
            // Prevent duplicate processing if touch event was just handled (touch devices fire both touch and mouse events)
            const timeSinceLastTouch = Date.now() - lastTouchTime;
            if (timeSinceLastTouch < 1000) {
              return;
            }
            
            if (activeToolMode !== 'edit' || isProcessingClick) return;
            
            // Prevent default touch behavior to stop page scrolling during drag
            e.preventDefault();
            
            setIsProcessingClick(true);
            
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const visibleStart = currentZoomStart ?? data.startTime;
            const visibleEnd = currentZoomEnd ?? data.endTime;
            const visibleRange = visibleEnd - visibleStart;
            
            const xPercent = x / rect.width;
            const clickTime = visibleStart + (xPercent * visibleRange);
            const yPercent = y / rect.height;
            
            // Helper to calculate screen position for a data point
            const getScreenPosition = (time: number, value: number, scale: 'bp-hr' | 'spo2'): { x: number; y: number } => {
              const xPos = ((time - visibleStart) / visibleRange) * rect.width;
              let yPos: number;
              if (scale === 'bp-hr') {
                const minVal = 0;
                const maxVal = 240;
                yPos = ((maxVal - value) / (maxVal - minVal)) * rect.height;
              } else {
                const minVal = 45;
                const maxVal = 105;
                yPos = ((maxVal - value) / (maxVal - minVal)) * rect.height;
              }
              return { x: xPos, y: yPos };
            };
            
            // Find nearest point within click threshold (20px)
            const threshold = 20;
            let nearestPoint: typeof selectedPoint = null;
            let nearestDistance = threshold;
            
            // Check HR points
            hrDataPoints.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'hr', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check systolic BP points
            bpDataPoints.sys.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'bp-sys', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check diastolic BP points
            bpDataPoints.dia.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'bp-dia', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check SpO2 points
            spo2DataPoints.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'spo2');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'spo2', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            
            if (nearestPoint) {
              setSelectedPoint(nearestPoint);
              // Immediately update the ref so document-level mousemove handler can track this selection
              selectedPointRef.current = nearestPoint;
              // Initialize dragPosition to the original position to engage filter immediately
              const { originalTime, originalValue } = nearestPoint as NonNullable<typeof nearestPoint>;
              setDragPosition({ time: originalTime, value: originalValue });
              dragPositionRef.current = { time: originalTime, value: originalValue };
              // Initialize drag preview imperatively
              dragPreviewRef.current = { time: originalTime, value: originalValue };
            } else {
            }
            
            setIsProcessingClick(false);
          }}
          onTouchStart={(e) => {
            if (activeToolMode !== 'edit' || isProcessingClick) return;
            
            // Note: Cannot call e.preventDefault() here because React's synthetic events are passive
            // Scroll prevention is handled by the native event listener in useEffect with { passive: false }
            
            // Record touch time to prevent duplicate mouse event processing
            setLastTouchTime(Date.now());
            
            setIsProcessingClick(true);
            
            const rect = e.currentTarget.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            const visibleStart = currentZoomStart ?? data.startTime;
            const visibleEnd = currentZoomEnd ?? data.endTime;
            const visibleRange = visibleEnd - visibleStart;
            
            const xPercent = x / rect.width;
            const clickTime = visibleStart + (xPercent * visibleRange);
            const yPercent = y / rect.height;
            
            // Helper to calculate screen position for a data point
            const getScreenPosition = (time: number, value: number, scale: 'bp-hr' | 'spo2'): { x: number; y: number } => {
              const xPos = ((time - visibleStart) / visibleRange) * rect.width;
              let yPos: number;
              if (scale === 'bp-hr') {
                const minVal = 0;
                const maxVal = 240;
                yPos = ((maxVal - value) / (maxVal - minVal)) * rect.height;
              } else {
                const minVal = 45;
                const maxVal = 105;
                yPos = ((maxVal - value) / (maxVal - minVal)) * rect.height;
              }
              return { x: xPos, y: yPos };
            };
            
            // Find nearest point within click threshold (20px)
            const threshold = 20;
            let nearestPoint: typeof selectedPoint = null;
            let nearestDistance = threshold;
            
            // Check HR points
            hrDataPoints.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'hr', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check systolic BP points
            bpDataPoints.sys.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'bp-sys', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check diastolic BP points
            bpDataPoints.dia.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'bp-hr');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'bp-dia', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            // Check SpO2 points
            spo2DataPoints.forEach((point, index) => {
              const pos = getScreenPosition(point[0], point[1], 'spo2');
              const dist = Math.sqrt((pos.x - x) ** 2 + (pos.y - y) ** 2);
              if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestPoint = { type: 'spo2', index, originalTime: point[0], originalValue: point[1] };
              }
            });
            
            
            if (nearestPoint) {
              setSelectedPoint(nearestPoint);
              // Immediately update the ref so document-level touchmove handler can track this selection
              selectedPointRef.current = nearestPoint;
              // Initialize dragPosition to the original position to engage filter immediately
              const { originalTime, originalValue } = nearestPoint as NonNullable<typeof nearestPoint>;
              setDragPosition({ time: originalTime, value: originalValue });
              dragPositionRef.current = { time: originalTime, value: originalValue };
              // Initialize drag preview imperatively
              dragPreviewRef.current = { time: originalTime, value: originalValue };
            } else {
            }
            
            setIsProcessingClick(false);
          }}
          onClick={(e) => {
            console.log('[VITALS-CLICK] onClick triggered', { isProcessingClick, activeToolMode });
            if (isProcessingClick || activeToolMode === 'edit') {
              console.log('[VITALS-CLICK] Blocked by guard');
              return;
            }
            
            setIsProcessingClick(true);
            
            // On touch devices, calculate value directly from click position
            let clickInfo = hoverInfo;
            if (isTouchDevice) {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
              
              const yPercent = y / rect.height;
              let value: number;
              
              if (activeToolMode === 'hr' || activeToolMode === 'bp' || (activeToolMode === 'blend' && (blendSequenceStep === 'sys' || blendSequenceStep === 'dia' || blendSequenceStep === 'hr'))) {
                const minVal = 0;
                const maxVal = 240;
                value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
              } else if (activeToolMode === 'spo2' || (activeToolMode === 'blend' && blendSequenceStep === 'spo2')) {
                // SpO2 scale: 45 to 105, capped at 100%
                const minVal = 45;
                const maxVal = 105;
                const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
                value = Math.min(rawValue, 100); // Cap at 100%
              } else {
                setIsProcessingClick(false);
                return;
              }
              
              clickInfo = { x: e.clientX, y: e.clientY, value, time };
            }
            
            if (!clickInfo) {
              setIsProcessingClick(false);
              return;
            }
            
            // Validate that click time is within editable boundaries

            const editableStartBoundary = currentTime - TEN_MINUTES;
            const editableEndBoundary = currentTime + TEN_MINUTES;
            
            if (clickInfo.time < editableStartBoundary || clickInfo.time > editableEndBoundary) {
              // Click is outside editable window - ignore
              setIsProcessingClick(false);
              return;
            }
            
            // Add data point based on active tool mode
            if (activeToolMode === 'hr') {
              // NEW: Save immediately to database using point-based mutation
              // React Query's optimistic update will handle local state automatically
              if (anesthesiaRecordId) {
                console.log('[VITALS-SAVE] Saving HR point', { time: clickInfo.time, value: clickInfo.value });
                addVitalPointMutation.mutate({
                  vitalType: 'hr',
                  timestamp: new Date(clickInfo.time).toISOString(),
                  value: clickInfo.value
                });
                setLastAction({ type: 'hr', data: [clickInfo.time, clickInfo.value] });
              }
              setHoverInfo(null);
              setIsProcessingClick(false);
            } else if (activeToolMode === 'bp') {
              // Simplified BP entry: each click adds its value immediately (no pending gray bookmark)
              if (bpEntryMode === 'sys') {
                // Add systolic temporarily for UX (will be replaced by React Query optimistic update)
                const sysPoint: VitalPoint = [clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  sys: [...prev.sys, sysPoint]
                }));
                
                // Store for reference and switch to diastolic mode
                setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
                setBpEntryMode('dia');
                setHoverInfo(null);
                setIsProcessingClick(false);
              } else {
                // Add diastolic temporarily for UX (will be replaced by React Query optimistic update)
                const diaPoint: VitalPoint = [pendingSysValue?.time ?? clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  dia: [...prev.dia, diaPoint]
                }));
                
                // NEW: Save BP pair to database using point-based mutation
                // React Query's optimistic update will sync the authoritative data
                if (anesthesiaRecordId && pendingSysValue) {
                  console.log('[VITALS-SAVE] Saving BP pair', { 
                    time: pendingSysValue.time, 
                    sys: pendingSysValue.value,
                    dia: clickInfo.value  
                  });
                  addBPPointMutation.mutate({
                    timestamp: new Date(pendingSysValue.time).toISOString(),
                    sys: pendingSysValue.value,
                    dia: clickInfo.value
                  });
                }
                
                // Reset to systolic mode
                setPendingSysValue(null);
                setBpEntryMode('sys');
                setHoverInfo(null);
                setIsProcessingClick(false);
              }
            } else if (activeToolMode === 'spo2') {
              // NEW: Save immediately to database using point-based mutation
              // React Query's optimistic update will handle local state automatically
              if (anesthesiaRecordId) {
                console.log('[VITALS-SAVE] Saving SPO2 point', { time: clickInfo.time, value: clickInfo.value });
                addVitalPointMutation.mutate({
                  vitalType: 'spo2',
                  timestamp: new Date(clickInfo.time).toISOString(),
                  value: clickInfo.value
                });
                setLastAction({ type: 'spo2', data: [clickInfo.time, clickInfo.value] });
              }
              setHoverInfo(null);
              
              // Toast notification disabled (can be re-enabled later)
              // toast({
              //   title: `💜 SpO2 ${clickInfo.value}% added`,
              //   description: new Date(clickInfo.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              //   duration: 3000,
              //   action: (
              //     <Button
              //       variant="outline"
              //       size="sm"
              //       onClick={handleUndo}
              //       data-testid="button-undo-spo2"
              //     >
              //       <Undo2 className="w-4 h-4 mr-1" />
              //       Undo
              //     </Button>
              //   ),
              // });
              
              setIsProcessingClick(false);
            } else if (activeToolMode === 'blend') {
              // Sequential vitals entry mode - automatically progress through sys -> dia -> hr -> spo2 -> loop
              if (blendSequenceStep === 'sys') {
                // Add systolic temporarily for UX (will be replaced by mutation after diastolic is entered)
                const sysPoint: VitalPoint = [clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  sys: [...prev.sys, sysPoint]
                }));
                setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
                setBlendSequenceStep('dia');
                setHoverInfo(null);
                setIsProcessingClick(false);
              } else if (blendSequenceStep === 'dia') {
                // Add diastolic temporarily for UX
                const diaPoint: VitalPoint = [pendingSysValue?.time ?? clickInfo.time, clickInfo.value];
                setBpDataPoints(prev => ({
                  ...prev,
                  dia: [...prev.dia, diaPoint]
                }));
                
                // NEW: Save BP pair via mutation
                if (anesthesiaRecordId && pendingSysValue) {
                  addBPPointMutation.mutate({
                    timestamp: new Date(pendingSysValue.time).toISOString(),
                    sys: pendingSysValue.value,
                    dia: clickInfo.value
                  });
                }
                
                setBlendSequenceStep('hr');
                setHoverInfo(null);
                setIsProcessingClick(false);
              } else if (blendSequenceStep === 'hr') {
                // NEW: Save HR via mutation
                if (anesthesiaRecordId) {
                  addVitalPointMutation.mutate({
                    vitalType: 'hr',
                    timestamp: new Date(clickInfo.time).toISOString(),
                    value: clickInfo.value
                  });
                }
                setBlendSequenceStep('spo2');
                setHoverInfo(null);
                setIsProcessingClick(false);
              } else if (blendSequenceStep === 'spo2') {
                // NEW: Save SpO2 via mutation
                if (anesthesiaRecordId) {
                  addVitalPointMutation.mutate({
                    vitalType: 'spo2',
                    timestamp: new Date(clickInfo.time).toISOString(),
                    value: clickInfo.value
                  });
                }
                setBlendSequenceStep('sys'); // Loop back to start
                setPendingSysValue(null); // Clear pending systolic value
                setHoverInfo(null);
                setIsProcessingClick(false);
              }
            }
          }}
        />
      )}

      {/* Tooltip for vitals entry - only show on non-touch devices */}
      {hoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold">
            {activeToolMode === 'edit' && selectedPoint && (
              <>
                {selectedPoint.type === 'hr' && `Dragging HR: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-sys' && `Dragging Systolic: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-dia' && `Dragging Diastolic: ${hoverInfo.value}`}
                {selectedPoint.type === 'spo2' && `Dragging SpO2: ${hoverInfo.value}%`}
              </>
            )}
            {activeToolMode === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'bp' && `${bpEntryMode === 'sys' ? 'Systolic' : 'Diastolic'}: ${hoverInfo.value}`}
            {activeToolMode === 'spo2' && `SpO2: ${hoverInfo.value}%`}
            {activeToolMode === 'blend' && blendSequenceStep === 'sys' && `Systolic: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'dia' && `Diastolic: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'spo2' && `SpO2: ${hoverInfo.value}%`}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(hoverInfo.time)}
          </div>
        </div>
      )}

      {/* Tooltip for Zeiten swimlane - only show on non-touch devices */}
      {zeitenHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: zeitenHoverInfo.x + 10,
            top: zeitenHoverInfo.y - 40,
          }}
        >
          {zeitenHoverInfo.existingMarker ? (
            <>
              <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                {zeitenHoverInfo.existingMarker.code} - {zeitenHoverInfo.existingMarker.label}
              </div>
              <div className="text-xs text-muted-foreground">
                Set at {formatTime(zeitenHoverInfo.existingMarker.time)}
              </div>
            </>
          ) : zeitenHoverInfo.nextMarker ? (
            <>
              <div className="text-sm font-semibold text-primary">
                {zeitenHoverInfo.nextMarker}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTime(zeitenHoverInfo.time)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              All markers placed
            </div>
          )}
        </div>
      )}

      {/* Interactive layer for Zeiten swimlane - to place time markers */}
      {!activeToolMode && (() => {
        const zeitenLane = swimlanePositions.find(lane => lane.id === 'zeiten');
        if (!zeitenLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${zeitenLane.top}px`,
              height: `${zeitenLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              // Skip hover preview on touch devices
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              // Use tracked zoom state
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              // Convert x-position to time
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Always snap to 1-minute intervals for time markers
              time = snapToInterval(time, ONE_MINUTE);
              
              // Check if we're hovering over an existing marker (within 3 minutes threshold)
              const threeMinutes = 3 * 60 * 1000;
              const existingMarker = timeMarkers.find(m => 
                m.time !== null && Math.abs(m.time - time) < threeMinutes
              );
              
              // Find next unplaced marker
              const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
              const nextMarker = nextMarkerIndex !== -1 ? timeMarkers[nextMarkerIndex] : null;
              
              setZeitenHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time: existingMarker ? existingMarker.time! : time,
                nextMarker: nextMarker ? `${nextMarker.code} - ${nextMarker.label}` : null,
                existingMarker: existingMarker ? {
                  code: existingMarker.code,
                  label: existingMarker.label,
                  time: existingMarker.time!
                } : undefined
              });
            }}
            onMouseLeave={() => setZeitenHoverInfo(null)}
            onClick={handleZeitenClick}
            data-testid="interactive-zeiten-lane"
          />
        );
      })()}

      {/* Interactive layer for Events swimlane - to add event comments */}
      {!activeToolMode && (() => {
        const eventsLane = swimlanePositions.find(lane => lane.id === 'ereignisse');
        if (!eventsLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${eventsLane.top}px`,
              height: `${eventsLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setEventHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setEventHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              setPendingEvent({ time });
              setEventTextInput("");
              setShowEventDialog(true);
            }}
            data-testid="interactive-events-lane"
          />
        );
      })()}

      {/* Tooltip for events entry */}
      {eventHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: eventHoverInfo.x + 10,
            top: eventHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add event
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(eventHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Inline popup for existing events */}
      {hoveredEvent && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: hoveredEvent.x,
            top: hoveredEvent.y - 20,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-background border-2 border-primary rounded-lg shadow-xl max-w-md p-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquareText className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Event Comment</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {formatTime(hoveredEvent.event.time)}
              </span>
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
              {hoveredEvent.event.text}
            </div>
            <div className="text-xs text-muted-foreground mt-2 italic">
              Click to edit
            </div>
            {/* Arrow pointing down to the icon - double layer for border effect */}
            {/* Outer arrow (border) */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                bottom: '-12px',
                borderLeft: '12px solid transparent',
                borderRight: '12px solid transparent',
                borderTop: '12px solid hsl(var(--primary))',
              }}
            />
            {/* Inner arrow (background) */}
            <div
              className="absolute left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                bottom: '-10px',
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '10px solid hsl(var(--background))',
              }}
            />
          </div>
        </div>
      )}

      {/* Interactive layer for Heart Rhythm swimlane - to add rhythm entries */}
      {!activeToolMode && (() => {
        const rhythmLane = swimlanePositions.find(lane => lane.id === 'herzrhythmus');
        if (!rhythmLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${rhythmLane.top}px`,
              height: `${rhythmLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setHeartRhythmHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setHeartRhythmHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              setPendingHeartRhythm({ time });
              setEditingHeartRhythm(null);
              setHeartRhythmInput("");
              setHeartRhythmEditTime(0);
              setShowHeartRhythmDialog(true);
            }}
            data-testid="interactive-heart-rhythm-lane"
          />
        );
      })()}

      {/* Tooltip for heart rhythm entry */}
      {heartRhythmHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: heartRhythmHoverInfo.x + 10,
            top: heartRhythmHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add rhythm
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(heartRhythmHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layers for staff swimlanes - to add staff entries */}
      {!activeToolMode && !collapsedSwimlanes.has("staff") && ['doctor', 'nurse', 'assistant'].map((role) => {
        const staffLane = swimlanePositions.find(lane => lane.id === `staff-${role}`);
        if (!staffLane) return null;
        
        return (
          <div
            key={`staff-interactive-${role}`}
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${staffLane.top}px`,
              height: `${staffLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setStaffHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time,
                role: role.charAt(0).toUpperCase() + role.slice(1)
              });
            }}
            onMouseLeave={() => setStaffHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              // Prefill with current user's name
              const userFirstName = (user as any)?.firstName || "";
              const userLastName = (user as any)?.lastName || "";
              const userName = userFirstName && userLastName ? `${userFirstName} ${userLastName}` : userFirstName || userLastName || "";
              
              setPendingStaff({ time, role: role as 'doctor' | 'nurse' | 'assistant' });
              setEditingStaff(null);
              setStaffInput(userName);
              setShowStaffDialog(true);
            }}
            data-testid={`interactive-staff-${role}-lane`}
          />
        );
      })}

      {/* Tooltip for staff entry */}
      {staffHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: staffHoverInfo.x + 10,
            top: staffHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add {staffHoverInfo.role.toLowerCase()}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(staffHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layer for position swimlane */}
      {!activeToolMode && (() => {
        const positionLane = swimlanePositions.find(lane => lane.id === 'position');
        if (!positionLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${positionLane.top}px`,
              height: `${positionLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              setPositionHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setPositionHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to 1-minute intervals
              const oneMinute = 60 * 1000;
              time = Math.round(time / oneMinute) * oneMinute;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              setPendingPosition({ time });
              setEditingPosition(null);
              setPositionInput("");
              setShowPositionDialog(true);
            }}
            data-testid="interactive-position-lane"
          />
        );
      })()}

      {/* Tooltip for position entry */}
      {positionHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: positionHoverInfo.x + 10,
            top: positionHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add position
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(positionHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layers for medication swimlanes - to place dose labels */}
      {!activeToolMode && (() => {
        const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
        if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) return null;
        
        return activeSwimlanes.map((lane, index) => {
          const isMedicationChild = !lane.rateUnit && lane.hierarchyLevel !== 'group';
          if (!isMedicationChild) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 30,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to 1-minute interval for medications
                time = Math.round(time / currentDrugSnapInterval) * currentDrugSnapInterval;
                
                setMedicationHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  swimlaneId: lane.id,
                  label: lane.label.trim()
                });
              }}
              onMouseLeave={() => setMedicationHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to 1-minute interval for medications
                time = Math.round(time / currentDrugSnapInterval) * currentDrugSnapInterval;
                
                // Validate that time is within editable boundaries
                const fifteenMinutes = 15 * 60 * 1000;
                const editableStartBoundary = chartInitTime - fifteenMinutes;
                const editableEndBoundary = currentTime + fifteenMinutes;
                
                if (time < editableStartBoundary || time > editableEndBoundary) {
                  // Click is outside editable window - ignore
                  return;
                }
                
                // Check if we're clicking on an existing dose label
                const existingDoses = medicationDoseData[lane.id] || [];
                const clickTolerance = currentDrugSnapInterval; // Allow clicking within one interval of the dose
                const existingDoseAtTime = existingDoses.find(([doseTime]) => 
                  Math.abs(doseTime - time) <= clickTolerance
                );
                
                if (existingDoseAtTime) {
                  // Open edit dialog for existing dose
                  const [doseTime, dose] = existingDoseAtTime;
                  const doseIndex = existingDoses.findIndex(([t, d]) => t === doseTime && d === dose);
                  setEditingMedicationDose({
                    swimlaneId: lane.id,
                    time: doseTime,
                    dose: dose.toString(),
                    index: doseIndex,
                  });
                  // If dose contains hyphens (range values), start with empty field for custom entry
                  setMedicationEditInput(dose.toString().includes('-') ? '' : dose.toString());
                  setShowMedicationEditDialog(true);
                } else {
                  // Check if there's a default dose
                  if (lane.defaultDose) {
                    // Has default dose: insert it directly without dialog
                    const updated = { ...medicationDoseData };
                    if (!updated[lane.id]) updated[lane.id] = [];
                    const newEntry: [number, string] = [time, lane.defaultDose];
                    updated[lane.id] = [...updated[lane.id], newEntry].sort((a, b) => a[0] - b[0]);
                    setMedicationDoseData(updated);
                  } else {
                    // No default dose: open dialog
                    setPendingMedicationDose({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim() 
                    });
                    setShowMedicationDoseDialog(true);
                  }
                }
              }}
              data-testid={`interactive-medication-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for medication dose entry */}
      {medicationHoverInfo && !isTouchDevice && (() => {
        // Check if there's an existing dose at the hover position
        const existingDoses = medicationDoseData[medicationHoverInfo.swimlaneId] || [];
        const clickTolerance = currentDrugSnapInterval;
        const hasExistingDose = existingDoses.some(([doseTime]) => 
          Math.abs(doseTime - medicationHoverInfo.time) <= clickTolerance
        );
        
        return (
          <div
            className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
            style={{
              left: medicationHoverInfo.x + 10,
              top: medicationHoverInfo.y - 40,
            }}
          >
            <div className="text-sm font-semibold text-primary">
              {hasExistingDose ? 'Click to edit dose' : 'Click to add dose'}
            </div>
            <div className="text-xs text-muted-foreground">
              {medicationHoverInfo.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatTime(medicationHoverInfo.time)}
            </div>
          </div>
        );
      })()}

      {/* Interactive layers for infusion swimlanes - to place rate labels */}
      {!activeToolMode && (() => {
        const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
        if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) return null;
        
        return activeSwimlanes.map((lane, index) => {
          const isInfusionChild = lane.rateUnit !== null && lane.rateUnit !== undefined;
          if (!isInfusionChild) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 30,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to 1-minute interval for infusions
                time = Math.round(time / currentDrugSnapInterval) * currentDrugSnapInterval;
                
                setInfusionHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  swimlaneId: lane.id,
                  label: lane.label.trim()
                });
              }}
              onMouseLeave={() => setInfusionHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to 1-minute interval for infusions
                time = Math.round(time / currentDrugSnapInterval) * currentDrugSnapInterval;
                
                // Validate that time is within editable boundaries
                const fifteenMinutes = 15 * 60 * 1000;
                const editableStartBoundary = chartInitTime - fifteenMinutes;
                const editableEndBoundary = currentTime + fifteenMinutes;
                
                if (time < editableStartBoundary || time > editableEndBoundary) {
                  // Click is outside editable window - ignore
                  return;
                }
                
                // Check if we're clicking on an existing infusion value
                const existingValues = infusionData[lane.id] || [];
                const clickTolerance = currentDrugSnapInterval;
                const existingValueAtTime = existingValues.find(([valueTime]) => 
                  Math.abs(valueTime - time) <= clickTolerance
                );
                
                if (existingValueAtTime) {
                  // Check if this is a rate-controlled infusion or free-flow
                  if (lane.rateUnit === 'free') {
                    // For free-flow, open unified Infusion Sheet
                    const [valueTime, value] = existingValueAtTime;
                    
                    // Find the session for this marker
                    const sessions = freeFlowSessions[lane.id] || [];
                    const session = sessions.find(s => s.startTime === valueTime) || {
                      swimlaneId: lane.id,
                      startTime: valueTime,
                      dose: value.toString(),
                      label: lane.label.trim(),
                    };
                    
                    setFreeFlowSheetSession(session);
                    setSheetDoseInput(value.toString());
                    setSheetTimeInput(valueTime);
                    setShowFreeFlowSheet(true);
                  } else {
                    // For rate-controlled, open management dialog with stop/change/start new options
                    const [valueTime, value] = existingValueAtTime;
                    const valueIndex = existingValues.findIndex(([t, v]) => t === valueTime && v === value);
                    
                    // Parse rate options from defaultDose if it's a range
                    let rateOptions: string[] | undefined;
                    if (lane.defaultDose && lane.defaultDose.includes('-')) {
                      rateOptions = lane.defaultDose.split('-').map(v => v.trim()).filter(v => v);
                    }
                    
                    setManagingRate({
                      swimlaneId: lane.id,
                      time: valueTime,
                      value: value.toString(),
                      index: valueIndex,
                      label: lane.label.trim(),
                      rateOptions,
                    });
                    setRateManageTime(time);
                    setRateManageInput(value.toString());
                    setShowRateManageDialog(true);
                  }
                } else {
                  // Check if this is a free-flow infusion (no rate)
                  if (lane.rateUnit === 'free') {
                    // Check if there's any active free-flow session on this swimlane
                    const sessions = freeFlowSessions[lane.id] || [];
                    
                    if (sessions.length > 0) {
                      // Swimlane is already busy - find the closest session and show unified sheet
                      const closestSession = sessions.reduce((closest, session) => {
                        const currentDist = Math.abs(session.startTime - time);
                        const closestDist = Math.abs(closest.startTime - time);
                        return currentDist < closestDist ? session : closest;
                      }, sessions[0]);
                      
                      // Open unified free-flow sheet in segment mode
                      setFreeFlowSheetSession({ ...closestSession, clickMode: 'segment' });
                      setSheetDoseInput(closestSession.dose);
                      setSheetTimeInput(closestSession.startTime);
                      setShowFreeFlowSheet(true);
                    } else {
                      // First click: check for default dose
                      if (lane.defaultDose) {
                        // Create new session with default dose
                        const newSession: FreeFlowSession = {
                          swimlaneId: lane.id,
                          startTime: time,
                          dose: lane.defaultDose,
                          label: lane.label.trim(),
                        };
                        const updatedSessions = { ...freeFlowSessions };
                        if (!updatedSessions[lane.id]) updatedSessions[lane.id] = [];
                        updatedSessions[lane.id] = [...updatedSessions[lane.id], newSession].sort((a, b) => a.startTime - b.startTime);
                        setFreeFlowSessions(updatedSessions);
                        
                        // Add visual marker
                        const updated = { ...infusionData };
                        if (!updated[lane.id]) updated[lane.id] = [];
                        const newEntry: [number, string] = [time, lane.defaultDose];
                        updated[lane.id] = [...updated[lane.id], newEntry].sort((a, b) => a[0] - b[0]);
                        setInfusionData(updated);
                      } else {
                        // No default dose: show dose entry dialog
                        setPendingFreeFlowDose({
                          swimlaneId: lane.id,
                          time,
                          label: lane.label.trim(),
                        });
                        setShowFreeFlowDoseDialog(true);
                      }
                    }
                  } else if (lane.defaultDose) {
                    // Check if defaultDose is a range (contains dashes like "6-12-16")
                    const isRange = lane.defaultDose.includes('-');
                    
                    if (isRange) {
                      // Parse range options
                      const rateOptions = lane.defaultDose.split('-').map(v => v.trim()).filter(v => v);
                      
                      // Check if there are any existing rates
                      const existingRates = infusionData[lane.id] || [];
                      
                      if (existingRates.length > 0) {
                        // Rates already exist - show unified rate sheet for the active segment
                        // Find the active segment: last rate before or at click time
                        const ratesBeforeOrAt = existingRates.filter(([t]) => t <= time);
                        let targetRate: [number, string];
                        
                        if (ratesBeforeOrAt.length > 0) {
                          // Use the last rate before or at the click
                          targetRate = ratesBeforeOrAt[ratesBeforeOrAt.length - 1];
                        } else {
                          // Clicking before all rates - use the first rate
                          targetRate = existingRates[0];
                        }
                        
                        const [valueTime, value] = targetRate;
                        
                        // Open unified rate sheet in segment mode (for forward actions)
                        setRateSheetSession({
                          swimlaneId: lane.id,
                          label: lane.label.trim(),
                          clickMode: 'segment',
                          rateUnit: lane.rateUnit || '',
                          defaultDose: lane.defaultDose || undefined,
                        });
                        setSheetRateInput(value.toString());
                        setSheetRateTimeInput(valueTime);
                        setShowRateSheet(true);
                      } else {
                        // No existing rates: show rate selection dialog to start first infusion
                        setPendingRateSelection({
                          swimlaneId: lane.id,
                          time,
                          label: lane.label.trim(),
                          rateOptions,
                        });
                        setShowRateSelectionDialog(true);
                      }
                    } else {
                      // Simple numeric default: check if there are any existing rates
                      const existingRates = infusionData[lane.id] || [];
                      
                      if (existingRates.length > 0) {
                        // Rates already exist - show unified rate sheet for the active segment
                        // Find the active segment: last rate before or at click time
                        const ratesBeforeOrAt = existingRates.filter(([t]) => t <= time);
                        let targetRate: [number, string];
                        
                        if (ratesBeforeOrAt.length > 0) {
                          // Use the last rate before or at the click
                          targetRate = ratesBeforeOrAt[ratesBeforeOrAt.length - 1];
                        } else {
                          // Clicking before all rates - use the first rate
                          targetRate = existingRates[0];
                        }
                        
                        const [valueTime, value] = targetRate;
                        
                        // Open unified rate sheet in segment mode (for forward actions)
                        setRateSheetSession({
                          swimlaneId: lane.id,
                          label: lane.label.trim(),
                          clickMode: 'segment',
                          rateUnit: lane.rateUnit || '',
                          defaultDose: lane.defaultDose || undefined,
                        });
                        setSheetRateInput(value.toString());
                        setSheetRateTimeInput(valueTime);
                        setShowRateSheet(true);
                      } else {
                        // No existing rates: insert default directly for first click and create session
                        const updated = { ...infusionData };
                        if (!updated[lane.id]) updated[lane.id] = [];
                        const newEntry: [number, string] = [time, lane.defaultDose];
                        updated[lane.id] = [...updated[lane.id], newEntry].sort((a, b) => a[0] - b[0]);
                        setInfusionData(updated);
                        
                        // Create initial rate infusion session
                        const newSegment: RateInfusionSegment = {
                          startTime: time,
                          rate: lane.defaultDose,
                          rateUnit: lane.rateUnit || '',
                        };
                        setRateInfusionSessions(prev => ({
                          ...prev,
                          [lane.id]: {
                            swimlaneId: lane.id,
                            label: lane.label.trim(),
                            syringeQuantity: "50ml", // Default
                            segments: [newSegment],
                            state: 'running',
                          },
                        }));
                      }
                    }
                  } else {
                    // No default dose: open dialog
                    setPendingInfusionValue({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim() 
                    });
                    setShowInfusionDialog(true);
                  }
                }
              }}
              data-testid={`interactive-infusion-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for infusion value entry */}
      {infusionHoverInfo && !isTouchDevice && (() => {
        // Check if there's an existing value at the hover position
        const existingValues = infusionData[infusionHoverInfo.swimlaneId] || [];
        const clickTolerance = currentDrugSnapInterval;
        const hasExistingValue = existingValues.some(([valueTime]) => 
          Math.abs(valueTime - infusionHoverInfo.time) <= clickTolerance
        );
        
        return (
          <div
            className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
            style={{
              left: infusionHoverInfo.x + 10,
              top: infusionHoverInfo.y - 40,
            }}
          >
            <div className="text-sm font-semibold text-primary">
              {hasExistingValue ? 'Click to edit rate' : 'Click to add rate'}
            </div>
            <div className="text-xs text-muted-foreground">
              {infusionHoverInfo.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatTime(infusionHoverInfo.time)}
            </div>
          </div>
        );
      })()}

      {/* Tooltip for output value entry */}
      {outputHoverInfo && !isTouchDevice && (() => {
        // Check if there's an existing value at the hover position
        const existingValues = outputData[outputHoverInfo.paramKey] || [];
        const clickTolerance = currentVitalsSnapInterval;
        const hasExistingValue = existingValues.some(([valueTime]) => 
          Math.abs(valueTime - outputHoverInfo.time) <= clickTolerance
        );
        
        return (
          <div
            className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
            style={{
              left: outputHoverInfo.x + 10,
              top: outputHoverInfo.y - 40,
            }}
          >
            <div className="text-sm font-semibold text-primary">
              {hasExistingValue ? 'Click to edit value' : 'Click to add value'}
            </div>
            <div className="text-xs text-muted-foreground">
              {outputHoverInfo.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatTime(outputHoverInfo.time)}
            </div>
          </div>
        );
      })()}

      {/* Interactive layer for Ventilation parent swimlane - for bulk entry */}
      {!activeToolMode && (() => {
        const ventilationParentLane = swimlanePositions.find(lane => lane.id === 'ventilation');
        if (!ventilationParentLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${ventilationParentLane.top}px`,
              height: `${ventilationParentLane.height}px`,
              zIndex: 35,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to zoom-dependent interval for ventilation parameters
              time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
              
              setVentilationBulkHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setVentilationBulkHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to zoom-dependent interval for ventilation parameters
              time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              setPendingVentilationBulk({ time });
              setShowVentilationBulkDialog(true);
            }}
            data-testid="interactive-ventilation-bulk-lane"
          />
        );
      })()}

      {/* Tooltip for ventilation bulk entry */}
      {ventilationBulkHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationBulkHoverInfo.x + 10,
            top: ventilationBulkHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click for bulk entry
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(ventilationBulkHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layer for output parent swimlane bulk entry */}
      {!activeToolMode && (() => {
        const outputParentLane = swimlanePositions.find(lane => lane.id === 'output');
        if (!outputParentLane) return null;
        
        return (
          <div
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${outputParentLane.top}px`,
              height: `${outputParentLane.height}px`,
              zIndex: 30,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to zoom-dependent interval for output parameters
              time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
              
              setOutputBulkHoverInfo({ 
                x: e.clientX, 
                y: e.clientY, 
                time
              });
            }}
            onMouseLeave={() => setOutputBulkHoverInfo(null)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              
              const visibleStart = currentZoomStart ?? data.startTime;
              const visibleEnd = currentZoomEnd ?? data.endTime;
              const visibleRange = visibleEnd - visibleStart;
              
              const xPercent = x / rect.width;
              let time = visibleStart + (xPercent * visibleRange);
              
              // Snap to zoom-dependent interval for output parameters
              time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
              
              // Validate that time is within editable boundaries

              const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
              const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
              
              if (time < editableStartBoundary || time > editableEndBoundary) {
                // Click is outside editable window - ignore
                return;
              }
              
              setPendingOutputBulk({ time });
              setShowOutputBulkDialog(true);
            }}
            data-testid="interactive-output-bulk-lane"
          />
        );
      })()}

      {/* Tooltip for output bulk entry */}
      {outputBulkHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: outputBulkHoverInfo.x + 10,
            top: outputBulkHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click for bulk entry
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(outputBulkHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layers for ventilation parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const ventilationParentIndex = activeSwimlanes.findIndex(s => s.id === "ventilation");
        if (ventilationParentIndex === -1 || collapsedSwimlanes.has("ventilation")) return null;
        
        // Map ventilation swimlane index to parameter key
        const ventilationParamMap: { [index: number]: { key: keyof typeof ventilationData; label: string } } = {
          0: { key: 'etCO2', label: 'etCO2' },
          1: { key: 'pip', label: 'P insp' },
          2: { key: 'peep', label: 'PEEP' },
          3: { key: 'tidalVolume', label: 'Tidal Volume' },
          4: { key: 'respiratoryRate', label: 'Respiratory Rate' },
          5: { key: 'minuteVolume', label: 'Minute Volume' },
          6: { key: 'fiO2', label: 'FiO2' },
        };
        
        return activeSwimlanes.map((lane, index) => {
          const isVentilationChild = lane.id.startsWith('ventilation-');
          if (!isVentilationChild) return null;
          
          const ventilationIndex = parseInt(lane.id.split('-')[1]);
          const paramInfo = ventilationParamMap[ventilationIndex];
          if (!paramInfo) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 30,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to zoom-dependent interval for ventilation parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
                
                setVentilationHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  paramKey: paramInfo.key,
                  label: paramInfo.label
                });
              }}
              onMouseLeave={() => setVentilationHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to zoom-dependent interval for ventilation parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
                
                // Validate that time is within editable boundaries
  
                const editableStartBoundary = chartInitTime - TEN_MINUTES; // FIXED boundary
                const editableEndBoundary = currentTime + TEN_MINUTES; // MOVING boundary
                
                if (time < editableStartBoundary || time > editableEndBoundary) {
                  // Click is outside editable window - ignore
                  return;
                }
                
                setPendingVentilationValue({ 
                  paramKey: paramInfo.key, 
                  time, 
                  label: paramInfo.label
                });
                setShowVentilationDialog(true);
              }}
              data-testid={`interactive-ventilation-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for ventilation parameter entry */}
      {ventilationHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationHoverInfo.x + 10,
            top: ventilationHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            Click to add value
          </div>
          <div className="text-xs text-muted-foreground">
            {ventilationHoverInfo.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(ventilationHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Tooltip for administration group configuration */}
      {adminGroupHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-blue-500 border border-blue-600 rounded-md shadow-lg px-3 py-2"
          style={{
            left: adminGroupHoverInfo.x + 10,
            top: adminGroupHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-white">
            Click to configure medications
          </div>
          <div className="text-xs text-blue-100">
            {adminGroupHoverInfo.groupName}
          </div>
        </div>
      )}

      {/* Interactive layers for output parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const outputParentIndex = activeSwimlanes.findIndex(s => s.id === "output");
        if (outputParentIndex === -1 || collapsedSwimlanes.has("output")) return null;
        
        // Map output swimlane index to parameter key
        const outputParamMap: { [index: number]: { key: keyof typeof outputData; label: string } } = {
          0: { key: 'gastricTube', label: 'Gastric Tube' },
          1: { key: 'drainage', label: 'Drainage' },
          2: { key: 'vomit', label: 'Vomit' },
          3: { key: 'urine', label: 'Urine' },
          4: { key: 'urine677', label: 'Urine 677' },
          5: { key: 'blood', label: 'Blood' },
          6: { key: 'bloodIrrigation', label: 'Blood and Irrigation' },
        };
        
        return activeSwimlanes.map((lane, index) => {
          const isOutputChild = lane.id.startsWith('output-');
          if (!isOutputChild) return null;
          
          const outputIndex = parseInt(lane.id.split('-')[1]);
          const paramInfo = outputParamMap[outputIndex];
          if (!paramInfo) return null;
          
          const lanePosition = swimlanePositions.find(l => l.id === lane.id);
          if (!lanePosition) return null;
          
          return (
            <div
              key={lane.id}
              className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
              style={{
                left: '200px',
                right: '10px',
                top: `${lanePosition.top}px`,
                height: `${lanePosition.height}px`,
                zIndex: 30,
              }}
              onMouseMove={(e) => {
                if (isTouchDevice) return;
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
                
                // Check if there's an existing value at this time
                const existingValues = outputData[paramInfo.key] || [];
                const clickTolerance = currentVitalsSnapInterval;
                const hasExistingValue = existingValues.some(([valueTime]) => 
                  Math.abs(valueTime - time) <= clickTolerance
                );
                
                setOutputHoverInfo({ 
                  x: e.clientX, 
                  y: e.clientY, 
                  time,
                  paramKey: paramInfo.key,
                  label: paramInfo.label
                });
              }}
              onMouseLeave={() => setOutputHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
                
                // Validate that time is within editable boundaries
                const fifteenMinutes = 15 * 60 * 1000;
                const editableStartBoundary = chartInitTime - fifteenMinutes;
                const editableEndBoundary = currentTime + fifteenMinutes;
                
                if (time < editableStartBoundary || time > editableEndBoundary) {
                  // Click is outside editable window - ignore
                  return;
                }
                
                // Check if we're clicking on an existing value
                const existingValues = outputData[paramInfo.key] || [];
                const clickTolerance = currentVitalsSnapInterval;
                const existingValueAtTime = existingValues.find(([valueTime]) => 
                  Math.abs(valueTime - time) <= clickTolerance
                );
                
                if (existingValueAtTime) {
                  // Open edit dialog for existing value
                  const [valueTime, value] = existingValueAtTime;
                  const valueIndex = existingValues.findIndex(([t, v]) => t === valueTime && v === value);
                  setEditingOutputValue({
                    paramKey: paramInfo.key,
                    time: valueTime,
                    value: value.toString(),
                    index: valueIndex,
                    label: paramInfo.label,
                  });
                  setOutputEditInput(value.toString());
                  setOutputEditTime(valueTime);
                  setShowOutputEditDialog(true);
                } else {
                  // Open add single value dialog
                  setPendingOutputValue({
                    paramKey: paramInfo.key,
                    time,
                    label: paramInfo.label
                  });
                  setOutputValueInput("");
                  setShowOutputDialog(true);
                }
              }}
              data-testid={`interactive-output-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Interactive layer for administration group lanes (for medication configuration) */}
      {!activeToolMode && activeSwimlanes.map((lane) => {
        if (lane.hierarchyLevel !== 'group') return null;
        
        const lanePosition = swimlanePositions.find(l => l.id === lane.id);
        if (!lanePosition) return null;
        
        // Find the corresponding admin group by matching lane ID format: admingroup-${group.id}
        const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
        if (!adminGroup) return null;
        
        return (
          <div
            key={`admin-config-${lane.id}`}
            className="absolute cursor-pointer hover:bg-blue-500/10 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${lanePosition.top}px`,
              height: `${lanePosition.height}px`,
              zIndex: 30,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              setAdminGroupHoverInfo({
                x: e.clientX,
                y: e.clientY,
                groupName: adminGroup.name,
              });
            }}
            onMouseLeave={() => setAdminGroupHoverInfo(null)}
            onClick={() => {
              // Open medication config dialog with this group pre-selected
              setSelectedAdminGroupForConfig(adminGroup);
              setEditingItemForConfig(null); // Clear editing state for adding new
              setShowMedicationConfigDialog(true);
            }}
            data-testid={`interactive-admin-group-${lane.id}`}
          />
        );
      })}

      {/* Interactive layer for medication item labels (for editing medications) */}
      {!activeToolMode && activeSwimlanes.map((lane) => {
        // Only show for individual medication items (hierarchyLevel === 'item')
        if (lane.hierarchyLevel !== 'item' || !lane.itemId) return null;
        
        const lanePosition = swimlanePositions.find(l => l.id === lane.id);
        if (!lanePosition) return null;
        
        // Find the medication item using the itemId property from the lane
        const medicationItem = anesthesiaItems.find(item => item.id === lane.itemId);
        if (!medicationItem || !medicationItem.administrationGroup) return null;
        
        // Find the admin group
        const adminGroup = administrationGroups.find(g => g.name === medicationItem.administrationGroup);
        if (!adminGroup) return null;
        
        return (
          <div
            key={`medication-label-${lane.id}`}
            className="absolute cursor-pointer hover:bg-yellow-500/10 transition-colors"
            style={{
              left: '0px',
              width: '200px',
              top: `${lanePosition.top}px`,
              height: `${lanePosition.height}px`,
              zIndex: 30,
            }}
            onClick={() => {
              // Open medication config dialog for editing this item
              setSelectedAdminGroupForConfig(adminGroup);
              setEditingItemForConfig(medicationItem);
              setShowMedicationConfigDialog(true);
            }}
            data-testid={`interactive-medication-label-${lane.id}`}
          />
        );
      })}

      {/* Time marker badges on the timeline */}
      {timeMarkers.filter(m => m.time !== null).map((marker) => {
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        // Calculate x position from time (as decimal 0-1)
        const xFraction = (marker.time! - visibleStart) / visibleRange;
        
        // Only render if in visible range
        if (xFraction < 0 || xFraction > 1) return null;
        
        const zeitenLane = swimlanePositions.find(lane => lane.id === 'zeiten');
        if (!zeitenLane) return null;
        
        // Calculate exact pixel position: sidebar width (200px) + fraction of chart area - half badge width (16px)
        // Chart area width is: calc(100% - 200px - 10px) = calc(100% - 210px)
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 16px)`;
        
        return (
          <div
            key={marker.id}
            className="absolute z-40 pointer-events-none flex items-center justify-center"
            style={{
              left: leftPosition,
              top: `${zeitenLane.top + 4}px`,
              width: '32px',
              height: '32px',
            }}
          >
            <div
              className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold shadow-md"
              style={{
                backgroundColor: marker.bgColor,
                color: marker.color,
              }}
              data-testid={`time-marker-${marker.code}`}
            >
              {marker.code}
            </div>
          </div>
        );
      })}

      {/* Event comment icons on the timeline */}
      {eventComments.map((event) => {
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        const xFraction = (event.time - visibleStart) / visibleRange;
        
        if (xFraction < 0 || xFraction > 1) return null;
        
        const eventsLane = swimlanePositions.find(lane => lane.id === 'ereignisse');
        if (!eventsLane) return null;
        
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 12px)`;
        
        return (
          <div
            key={event.id}
            className="absolute z-40 cursor-pointer flex items-center justify-center group"
            style={{
              left: leftPosition,
              top: `${eventsLane.top + 8}px`,
              width: '24px',
              height: '24px',
            }}
            onClick={() => {
              setEditingEvent(event);
              setEventTextInput(event.text);
              setEventEditTime(event.time);
              setShowEventDialog(true);
            }}
            onMouseEnter={(e) => {
              if (!isTouchDevice) {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoveredEvent({
                  event,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                });
              }
            }}
            onMouseLeave={() => setHoveredEvent(null)}
            data-testid={`event-icon-${event.id}`}
          >
            <MessageSquareText className="w-5 h-5 text-primary group-hover:scale-110 transition-transform" />
          </div>
        );
      })}

      {/* NOW line - Current time indicator */}
      <div
        className="absolute z-40 pointer-events-none"
        style={{
          left: nowLinePosition,
          top: '32px', // VITALS_TOP position
          width: '2px',
          height: `${backgroundsHeight - 32}px`,
          backgroundColor: isDark ? '#ef4444' : '#dc2626',
          transition: isNowLineFirstRenderRef.current ? 'none' : 'left 0.3s ease-out',
        }}
        data-testid="now-line-indicator"
      />


      {/* Heart Rhythm values as DOM overlays */}
      {heartRhythmData.map(([timestamp, rhythm], index) => {
        const rhythmLane = swimlanePositions.find(lane => lane.id === 'herzrhythmus');
        if (!rhythmLane) return null;
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        const xFraction = (timestamp - visibleStart) / visibleRange;
        
        if (xFraction < 0 || xFraction > 1) return null;
        
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;
        
        return (
          <div
            key={`rhythm-${timestamp}-${index}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-semibold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${rhythmLane.top + (rhythmLane.height / 2) - 10}px`,
              minWidth: '40px',
              height: '20px',
            }}
            onClick={() => {
              setEditingHeartRhythm({
                time: timestamp,
                rhythm,
                index,
              });
              setHeartRhythmInput(rhythm);
              setHeartRhythmEditTime(timestamp);
              setShowHeartRhythmDialog(true);
            }}
            title={`${rhythm} at ${formatTime(timestamp)}`}
            data-testid={`heart-rhythm-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-pink-600 dark:text-pink-400">
              {rhythm}
            </span>
          </div>
        );
      })}

      {/* Staff values as DOM overlays */}
      {!collapsedSwimlanes.has('staff') && Object.entries(staffData).flatMap(([role, entries]) =>
        entries.map(([timestamp, name], index) => {
          const staffLane = swimlanePositions.find(lane => lane.id === `staff-${role}`);
          if (!staffLane) return null;
          
          const visibleStart = currentZoomStart ?? data.startTime;
          const visibleEnd = currentZoomEnd ?? data.endTime;
          const visibleRange = visibleEnd - visibleStart;
          const xFraction = (timestamp - visibleStart) / visibleRange;
          
          if (xFraction < 0 || xFraction > 1) return null;
          
          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 30px)`;
          
          return (
            <div
              key={`staff-${role}-${timestamp}-${index}`}
              className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono text-sm px-2"
              style={{
                left: leftPosition,
                top: `${staffLane.top + (staffLane.height / 2) - 10}px`,
                minWidth: '60px',
                height: '20px',
              }}
              onClick={() => {
                setEditingStaff({
                  time: timestamp,
                  name,
                  role: role as 'doctor' | 'nurse' | 'assistant',
                  index,
                });
                setStaffInput(name);
                setStaffEditTime(timestamp);
                setShowStaffDialog(true);
              }}
              title={`${name} (${role}) at ${formatTime(timestamp)}`}
              data-testid={`staff-${role}-${index}`}
            >
              <span className="group-hover:scale-110 transition-transform text-slate-700 dark:text-slate-300">
                {name}
              </span>
            </div>
          );
        })
      )}

      {/* Position values as DOM overlays */}
      {positionData.map(([timestamp, position], index) => {
        const positionLane = swimlanePositions.find(lane => lane.id === 'position');
        if (!positionLane) return null;
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        const xFraction = (timestamp - visibleStart) / visibleRange;
        
        if (xFraction < 0 || xFraction > 1) return null;
        
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 30px)`;
        
        return (
          <div
            key={`position-${timestamp}-${index}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-semibold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${positionLane.top + (positionLane.height / 2) - 10}px`,
              minWidth: '60px',
              height: '20px',
            }}
            onClick={() => {
              setEditingPosition({
                time: timestamp,
                position,
                index,
              });
              setPositionInput(position);
              setPositionEditTime(timestamp);
              setShowPositionDialog(true);
            }}
            title={`${position} at ${formatTime(timestamp)}`}
            data-testid={`position-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-slate-600 dark:text-slate-400">
              {position}
            </span>
          </div>
        );
      })}

      {/* Ventilation mode values as DOM overlays (parent swimlane) */}
      {!collapsedSwimlanes.has('ventilation') && ventilationModeData.map(([timestamp, mode], index) => {
        const ventilationLane = swimlanePositions.find(lane => lane.id === 'ventilation');
        if (!ventilationLane) return null;
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        const xFraction = (timestamp - visibleStart) / visibleRange;
        
        if (xFraction < 0 || xFraction > 1) return null;
        
        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 30px)`;
        
        return (
          <div
            key={`vent-mode-${timestamp}-${index}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm"
            style={{
              left: leftPosition,
              top: `${ventilationLane.top + (ventilationLane.height / 2) - 10}px`,
              minWidth: '60px',
              height: '20px',
            }}
            onClick={() => {
              setEditingVentilationMode({
                time: timestamp,
                mode,
                index,
              });
              setVentilationModeEditInput(mode);
              setVentilationModeEditTime(timestamp);
              setShowVentilationModeEditDialog(true);
            }}
            title={`${mode} at ${formatTime(timestamp)}`}
            data-testid={`vent-mode-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform">
              {mode}
            </span>
          </div>
        );
      })}

      {/* Ventilation parameter values as DOM overlays */}
      {!collapsedSwimlanes.has('ventilation') && Object.entries(ventilationData).flatMap(([paramKey, dataPoints]) => {
        // Map parameter keys to their child lane indices
        const paramIndexMap: Record<string, number> = {
          etCO2: 0,
          pip: 1,
          peep: 2,
          tidalVolume: 3,
          respiratoryRate: 4,
          minuteVolume: 5,
          fiO2: 6,
        };
        
        const paramIndex = paramIndexMap[paramKey];
        if (paramIndex === undefined) return [];
        
        // Find the corresponding child lane in swimlanePositions
        const childLane = swimlanePositions.find(lane => lane.id === `ventilation-${paramIndex}`);
        if (!childLane) {
          return [];
        }
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        const labelMap: Record<string, string> = {
          etCO2: 'etCO2',
          pip: 'P insp',
          peep: 'PEEP',
          tidalVolume: 'Tidal Volume',
          respiratoryRate: 'Respiratory Rate',
          minuteVolume: 'Minute Volume',
          fiO2: 'FiO2',
        };
        
        return dataPoints.map(([timestamp, value], index) => {
          const xFraction = (timestamp - visibleStart) / visibleRange;
          
          if (xFraction < 0 || xFraction > 1) return null;
          
          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;
          
          return (
            <div
              key={`vent-${paramKey}-${timestamp}-${index}`}
              className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm"
              style={{
                left: leftPosition,
                top: `${childLane.top + 7}px`,
                minWidth: '40px',
                height: '20px',
              }}
              onClick={() => {
                setEditingVentilationValue({
                  paramKey: paramKey as keyof typeof ventilationData,
                  time: timestamp,
                  value: value.toString(),
                  index,
                  label: labelMap[paramKey] || paramKey,
                });
                setVentilationEditInput(value.toString());
                setVentilationEditTime(timestamp);
                setShowVentilationEditDialog(true);
              }}
              title={`${labelMap[paramKey]}: ${value} at ${formatTime(timestamp)}`}
              data-testid={`vent-value-${paramKey}-${index}`}
            >
              <span className="group-hover:scale-110 transition-transform">
                {value}
              </span>
            </div>
          );
        }).filter(Boolean);
      })}

      {/* Output parameter values as DOM overlays */}
      {!collapsedSwimlanes.has('output') && Object.entries(outputData).flatMap(([paramKey, dataPoints]) => {
        // Map parameter keys to their child lane indices
        const paramIndexMap: Record<string, number> = {
          gastricTube: 0,
          drainage: 1,
          vomit: 2,
          urine: 3,
          urine677: 4,
          blood: 5,
          bloodIrrigation: 6,
        };
        
        const paramIndex = paramIndexMap[paramKey];
        if (paramIndex === undefined) return [];
        
        // Find the corresponding child lane in swimlanePositions
        const childLane = swimlanePositions.find(lane => lane.id === `output-${paramIndex}`);
        if (!childLane) {
          return [];
        }
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        const labelMap: Record<string, string> = {
          gastricTube: 'Gastric Tube',
          drainage: 'Drainage',
          vomit: 'Vomit',
          urine: 'Urine',
          urine677: 'Urine 677',
          blood: 'Blood',
          bloodIrrigation: 'Blood and Irrigation',
        };
        
        return dataPoints.map(([timestamp, value], index) => {
          const xFraction = (timestamp - visibleStart) / visibleRange;
          
          if (xFraction < 0 || xFraction > 1) return null;
          
          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;
          
          return (
            <div
              key={`output-${paramKey}-${timestamp}-${index}`}
              className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm"
              style={{
                left: leftPosition,
                top: `${childLane.top + 7}px`,
                minWidth: '40px',
                height: '20px',
              }}
              onClick={() => {
                setEditingOutputValue({
                  paramKey: paramKey as keyof typeof outputData,
                  time: timestamp,
                  value: value.toString(),
                  index,
                  label: labelMap[paramKey] || paramKey,
                });
                setOutputEditInput(value.toString());
                setOutputEditTime(timestamp);
                setShowOutputEditDialog(true);
              }}
              title={`${labelMap[paramKey]}: ${value} ml at ${formatTime(timestamp)}`}
              data-testid={`output-value-${paramKey}-${index}`}
            >
              <span className="group-hover:scale-110 transition-transform">
                {value}
              </span>
            </div>
          );
        }).filter(Boolean);
      })}

      {/* Bolus Medication Pills - Horizontal bars for single-point doses */}
      {activeSwimlanes.flatMap((lane, laneIndex) => {
        const isMedicationChild = !lane.rateUnit;
        
        if (!isMedicationChild || !medicationDoseData[lane.id]?.length) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        return medicationDoseData[lane.id].map(([timestamp, dose], index) => {
          let leftPercent = ((timestamp - visibleStart) / visibleRange) * 100;
          
          if (leftPercent < 0 || leftPercent > 100) return null;
          
          // Ensure pills don't overflow into swimlane label column
          // Pills are 60px wide with 30px offset for centering
          // Minimum safe position: 200px (label width) + 30px (half pill) = 230px from left
          // This translates to approximately 5% of most screen widths as a conservative minimum
          // Maximum safe position: stay within right boundary (95%)
          leftPercent = Math.max(5, Math.min(95, leftPercent));
          
          const isBeforeNow = timestamp < currentTime;
          const yPosition = childLane.top + (childLane.height / 2) - 16; // Center pill vertically
          
          return (
            <BolusPill
              key={`bolus-pill-${lane.id}-${timestamp}-${index}`}
              timestamp={timestamp}
              dose={dose.toString()}
              isBeforeNow={isBeforeNow}
              leftPercent={leftPercent}
              yPosition={yPosition}
              isDark={isDark}
              testId={`bolus-pill-${lane.id}-${index}`}
              onClick={() => {
                setEditingMedicationDose({
                  swimlaneId: lane.id,
                  time: timestamp,
                  dose: dose.toString(),
                  index,
                });
                // If dose contains hyphens (range values), start with empty field for custom entry
                setMedicationEditInput(dose.toString().includes('-') ? '' : dose.toString());
                setMedicationEditTime(timestamp);
                setShowMedicationEditDialog(true);
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Infusion Pills - Horizontal bars with label and segment click zones */}
      {!collapsedSwimlanes.has('infusionen') && activeSwimlanes.flatMap((lane) => {
        const isInfusionChild = lane.rateUnit !== null && lane.rateUnit !== undefined;
        if (!isInfusionChild || !infusionData[lane.id]?.length) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        const isFreeFlow = lane.rateUnit === 'free';
        const sortedRates = [...infusionData[lane.id]].sort((a, b) => a[0] - b[0]);
        
        return sortedRates.map(([timestamp, rate], index) => {
          const nextTimestamp = sortedRates[index + 1]?.[0] ?? visibleEnd;
          
          const leftPercent = ((timestamp - visibleStart) / visibleRange) * 100;
          const widthPercent = ((nextTimestamp - timestamp) / visibleRange) * 100;
          
          const isBeforeNow = timestamp < currentTime;
          const isAfterNow = nextTimestamp > currentTime;
          const crossesNow = timestamp <= currentTime && nextTimestamp > currentTime;
          
          const yPosition = childLane.top + (childLane.height / 2) - 16; // Center pill vertically
          
          return (
            <InfusionPill
              key={`infusion-pill-${lane.id}-${timestamp}-${index}`}
              startTime={timestamp}
              endTime={nextTimestamp}
              rate={rate.toString()}
              isFreeFlow={isFreeFlow}
              isBeforeNow={isBeforeNow}
              isAfterNow={isAfterNow}
              crossesNow={crossesNow}
              currentTime={currentTime}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              yPosition={yPosition}
              isDark={isDark}
              rateUnit={lane.rateUnit || undefined}
              testId={`pill-${lane.id}-${index}`}
              onLabelClick={() => {
                // Label click: Edit historical value
                if (isFreeFlow) {
                  const sessions = freeFlowSessions[lane.id] || [];
                  const session = sessions.find(s => s.startTime === timestamp) || {
                    swimlaneId: lane.id,
                    startTime: timestamp,
                    dose: rate.toString(),
                    label: lane.label.trim(),
                  };
                  
                  setFreeFlowSheetSession({ ...session, clickMode: 'label' });
                  setSheetDoseInput(rate.toString());
                  setSheetTimeInput(timestamp);
                  setShowFreeFlowSheet(true);
                } else {
                  setRateSheetSession({
                    swimlaneId: lane.id,
                    label: lane.label.trim(),
                    clickMode: 'label',
                    rateUnit: lane.rateUnit || '',
                    defaultDose: lane.defaultDose || undefined,
                  });
                  setSheetRateInput(rate.toString());
                  setSheetRateTimeInput(timestamp);
                  setShowRateSheet(true);
                }
              }}
              onSegmentClick={() => {
                // Segment click: Forward actions (Start New, Stop, Change Rate)
                if (isFreeFlow) {
                  const allData = infusionData[lane.id] || [];
                  const sortedData = [...allData].sort((a, b) => b[0] - a[0]);
                  const lastDoseEntry = sortedData.find(([_, val]) => val !== "");
                  const lastDose = lastDoseEntry?.[1] || (rate !== "" ? rate.toString() : "0");
                  
                  const sessions = freeFlowSessions[lane.id] || [];
                  const session = sessions.find(s => s.startTime === timestamp) || {
                    swimlaneId: lane.id,
                    startTime: timestamp,
                    dose: lastDose,
                    label: lane.label.trim(),
                  };
                  
                  setFreeFlowSheetSession({ ...session, clickMode: 'segment' });
                  setSheetDoseInput(lastDose);
                  setSheetTimeInput(timestamp);
                  setShowFreeFlowSheet(true);
                } else {
                  setRateSheetSession({
                    swimlaneId: lane.id,
                    label: lane.label.trim(),
                    clickMode: 'segment',
                    rateUnit: lane.rateUnit || '',
                    defaultDose: lane.defaultDose || undefined,
                  });
                  setSheetRateInput(rate.toString());
                  setSheetRateTimeInput(timestamp);
                  setShowRateSheet(true);
                }
              }}
            />
          );
        });
      })}

      {/* Medication Dose Entry Dialog */}
      <Dialog open={showMedicationDoseDialog} onOpenChange={(open) => {
        console.log('[DIALOG] Medication dose dialog open changed:', open);
        if (!open) {
          setShowMedicationDoseDialog(false);
          setPendingMedicationDose(null);
          setMedicationDoseInput("");
        } else {
          setShowMedicationDoseDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-dose">
          <DialogHeader>
            <DialogTitle>Add Dose</DialogTitle>
            <DialogDescription>
              {pendingMedicationDose ? `${pendingMedicationDose.label}` : 'Add a new medication dose'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="dose-value">Dose</Label>
              <Input
                id="dose-value"
                data-testid="input-dose-value"
                value={medicationDoseInput}
                onChange={(e) => setMedicationDoseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleMedicationDoseEntry();
                  }
                }}
                placeholder="e.g., 5mg, 100mg, 2ml"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingMedicationDose?.time}
            onTimeChange={(newTime) => setPendingMedicationDose(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowMedicationDoseDialog(false);
              setPendingMedicationDose(null);
              setMedicationDoseInput("");
            }}
            onSave={handleMedicationDoseEntry}
            saveDisabled={!medicationDoseInput.trim()}
            saveLabel="Add"
          />
        </DialogContent>
      </Dialog>

      {/* Medication Configuration Dialog (from timeline admin groups) */}
      <MedicationConfigDialog
        open={showMedicationConfigDialog}
        onOpenChange={setShowMedicationConfigDialog}
        administrationGroup={selectedAdminGroupForConfig}
        activeHospitalId={activeHospital?.id}
        activeUnitId={activeHospital?.unitId}
        editingItem={editingItemForConfig}
        onSaveSuccess={() => {
          setEditingItemForConfig(null);
          setSelectedAdminGroupForConfig(null);
        }}
      />

      {/* Infusion Value Entry Dialog */}
      <Dialog open={showInfusionDialog} onOpenChange={(open) => {
        if (!open) {
          setShowInfusionDialog(false);
          setPendingInfusionValue(null);
          setInfusionInput("");
        } else {
          setShowInfusionDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-infusion-value">
          <DialogHeader>
            <DialogTitle>Add Infusion Rate</DialogTitle>
            <DialogDescription>
              {pendingInfusionValue ? `${pendingInfusionValue.label}` : 'Add a new infusion rate value'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="infusion-value">Rate</Label>
              <Input
                id="infusion-value"
                data-testid="input-infusion-value"
                value={infusionInput}
                onChange={(e) => setInfusionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInfusionValueEntry();
                  }
                }}
                placeholder="e.g., 100ml/h, 50ml/h"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingInfusionValue?.time}
            onTimeChange={(newTime) => setPendingInfusionValue(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowInfusionDialog(false);
              setPendingInfusionValue(null);
              setInfusionInput("");
            }}
            onSave={handleInfusionValueEntry}
            saveDisabled={!infusionInput.trim()}
            saveLabel="Add"
          />
        </DialogContent>
      </Dialog>

      {/* Infusion Value Edit Dialog */}
      <Dialog open={showInfusionEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowInfusionEditDialog(false);
          setEditingInfusionValue(null);
          setInfusionEditInput("");
          setInfusionEditTime(0);
        } else {
          setShowInfusionEditDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-infusion-edit">
          <DialogHeader>
            <DialogTitle>Edit Infusion Rate</DialogTitle>
            <DialogDescription>
              Edit or delete the infusion rate
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="infusion-edit-value">Rate</Label>
              <Input
                id="infusion-edit-value"
                data-testid="input-infusion-edit-value"
                value={infusionEditInput}
                onChange={(e) => setInfusionEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleInfusionValueEditSave();
                  }
                }}
                placeholder="e.g., 100ml/h, 50ml/h"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={infusionEditTime}
            onTimeChange={setInfusionEditTime}
            showDelete={true}
            onDelete={handleInfusionValueDelete}
            onCancel={() => {
              setShowInfusionEditDialog(false);
              setEditingInfusionValue(null);
              setInfusionEditInput("");
              setInfusionEditTime(0);
            }}
            onSave={handleInfusionValueEditSave}
            saveDisabled={!infusionEditInput.trim()}
          />
        </DialogContent>
      </Dialog>

      {/* Free-Flow Dose Entry Dialog */}
      <Dialog open={showFreeFlowDoseDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFreeFlowDoseDialog(false);
          setPendingFreeFlowDose(null);
          setFreeFlowDoseInput("");
        } else {
          setShowFreeFlowDoseDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-freeflow-dose">
          <DialogHeader>
            <DialogTitle>Enter Dose</DialogTitle>
            <DialogDescription>
              {pendingFreeFlowDose ? `${pendingFreeFlowDose.label}` : 'Enter the dose for this free-flow infusion'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="freeflow-dose">Dose</Label>
              <Input
                id="freeflow-dose"
                type="number"
                inputMode="decimal"
                data-testid="input-freeflow-dose"
                value={freeFlowDoseInput}
                onChange={(e) => setFreeFlowDoseInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFreeFlowDoseEntry();
                  }
                }}
                placeholder="e.g., 100"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingFreeFlowDose?.time}
            onTimeChange={(newTime) => setPendingFreeFlowDose(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowFreeFlowDoseDialog(false);
              setPendingFreeFlowDose(null);
              setFreeFlowDoseInput("");
            }}
            onSave={handleFreeFlowDoseEntry}
            saveDisabled={!freeFlowDoseInput.trim()}
            saveLabel="Start"
          />
        </DialogContent>
      </Dialog>

      {/* Unified Free-Flow Infusion Sheet */}
      <Dialog open={showFreeFlowSheet} onOpenChange={(open) => {
        if (!open) {
          // Don't auto-save - user must explicitly click Save or action button
          setShowFreeFlowSheet(false);
          setFreeFlowSheetSession(null);
          setSheetDoseInput("");
          setSheetTimeInput(0);
        }
      }}>
        <DialogContent className="sm:max-w-[450px]" data-testid="dialog-freeflow-sheet">
          <DialogHeader>
            <DialogTitle>{freeFlowSheetSession?.label || 'Free-Flow Infusion'}</DialogTitle>
            <DialogDescription>
              Manage this free-flow infusion
            </DialogDescription>
          </DialogHeader>
          
          {freeFlowSheetSession && (() => {
            const { swimlaneId, startTime, dose, clickMode } = freeFlowSheetSession;
            
            // Determine running state
            const hasActiveSession = (freeFlowSessions[swimlaneId] || []).length > 0;
            const existingData = infusionData[swimlaneId] || [];
            const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
            const latestDoseMarker = sortedData.find(([_, val]) => val !== "");
            const latestStopMarker = sortedData.find(([_, val]) => val === "");
            const isRunning = latestDoseMarker && 
              (!latestStopMarker || latestDoseMarker[0] >= latestStopMarker[0]) &&
              hasActiveSession;
            
            return (
              <>
                {/* Parameters - always visible */}
                <div className="grid gap-3 mb-4">
                  <div className="grid gap-2">
                    <Label htmlFor="sheet-dose" className="text-xs">Quantity</Label>
                    <Input
                      id="sheet-dose"
                      type="number"
                      inputMode="decimal"
                      data-testid="input-sheet-dose"
                      value={sheetDoseInput}
                      onChange={(e) => setSheetDoseInput(e.target.value)}
                      placeholder="e.g., 1000"
                      className="h-9"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sheet-time" className="text-xs">Start Time</Label>
                    <TimeAdjustInput
                      value={sheetTimeInput}
                      onChange={setSheetTimeInput}
                      data-testid="input-sheet-time"
                    />
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleSheetDelete}
                    data-testid="button-sheet-delete"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                  
                  <div className="flex gap-2">
                    {/* Stop button (when running) */}
                    {isRunning && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleSheetStop}
                        data-testid="button-sheet-stop"
                      >
                        <StopCircle className="w-4 h-4 mr-1" />
                        Stop
                      </Button>
                    )}
                    
                    {/* Save button (when clicking label) */}
                    {clickMode === 'label' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSheetSave}
                        data-testid="button-sheet-save"
                        disabled={!sheetDoseInput.trim()}
                      >
                        Save
                      </Button>
                    )}
                    
                    {/* Start New button (when clicking segment) */}
                    {clickMode === 'segment' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSheetStartNew}
                        data-testid="button-sheet-start-new"
                      >
                        <PlayCircle className="w-4 h-4 mr-1" />
                        Start New
                      </Button>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Unified Rate Infusion Sheet */}
      <Dialog open={showRateSheet} onOpenChange={(open) => {
        if (!open) {
          // Don't auto-save - user must explicitly click Save or action button
          setShowRateSheet(false);
          setRateSheetSession(null);
          setSheetRateInput("");
          setSheetRateTimeInput(0);
          setSheetQuantityInput("");
        }
      }}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-rate-sheet">
          <DialogHeader>
            <DialogTitle>{rateSheetSession?.label || 'Rate Infusion'}</DialogTitle>
            <DialogDescription>
              {rateSheetSession?.clickMode === 'segment' ? 'Adjust or change infusion rate' : 'Edit infusion settings'}
            </DialogDescription>
          </DialogHeader>
          
          {rateSheetSession && (() => {
            const { swimlaneId, clickMode, rateUnit, defaultDose } = rateSheetSession;
            
            // Parse rate presets from defaultDose (e.g., "4-10-16")
            const ratePresets = defaultDose && defaultDose.includes('-') 
              ? defaultDose.split('-').map(v => v.trim()).filter(v => v)
              : [];
            
            // Determine running state from session
            const session = getActiveSession(swimlaneId);
            const isRunning = session?.state === 'running';
            const isPaused = session?.state === 'paused';
            const isStopped = !session || session.state === 'stopped';
            
            // Get current rate from session or input
            const currentSegment = session?.segments[session.segments.length - 1];
            const currentRate = currentSegment?.rate || '';
            
            // Detect if user has made edits (for segment clicks on running infusions)
            const hasEditedRate = sheetRateInput.trim() && sheetRateInput !== currentRate;
            const hasEditedTime = sheetRateTimeInput && currentSegment && sheetRateTimeInput !== currentSegment.startTime;
            const hasEdits = hasEditedRate || hasEditedTime;
            
            return (
              <>
                {/* Rate Picker - always visible */}
                <div className="mb-4">
                  
                  {/* Preset Buttons */}
                  {ratePresets.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {ratePresets.map((preset, idx) => (
                        <Button
                          key={idx}
                          onClick={() => setSheetRateInput(preset)}
                          variant={sheetRateInput === preset ? "default" : "outline"}
                          className="h-10"
                          data-testid={`button-rate-preset-${preset}`}
                        >
                          {preset}
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  {/* Numeric Stepper */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const current = parseFloat(sheetRateInput) || 0;
                        setSheetRateInput(Math.max(0, current - 1).toString());
                      }}
                      data-testid="button-rate-decrease"
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={sheetRateInput}
                      onChange={(e) => setSheetRateInput(e.target.value)}
                      placeholder="Enter rate"
                      className="text-center font-mono font-bold"
                      data-testid="input-rate-value"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const current = parseFloat(sheetRateInput) || 0;
                        setSheetRateInput((current + 1).toString());
                      }}
                      data-testid="button-rate-increase"
                    >
                      +
                    </Button>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{rateUnit}</span>
                  </div>
                </div>

                {/* Time Editor (always visible for fine adjustment) */}
                <div className="border-t border-border pt-4 mb-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rate-time" className="text-xs">Start Time</Label>
                    <TimeAdjustInput
                      value={sheetRateTimeInput}
                      onChange={setSheetRateTimeInput}
                      data-testid="input-rate-time"
                    />
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRateSheetDelete}
                    data-testid="button-rate-delete"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                  
                  <div className="flex gap-2">
                    {/* Click-mode specific buttons */}
                    {clickMode === 'label' && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleRateSheetSave}
                        data-testid="button-rate-save"
                        disabled={!sheetRateInput.trim()}
                      >
                        Save
                      </Button>
                    )}
                    
                    {clickMode === 'segment' && (
                      <>
                        {/* State-specific buttons for segment clicks */}
                        {isRunning && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRateSheetPause}
                              data-testid="button-rate-pause"
                            >
                              Pause
                            </Button>
                            {hasEdits ? (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handleRateSheetChangeRate}
                                data-testid="button-rate-change"
                              >
                                Change Rate
                              </Button>
                            ) : (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handleRateSheetStartNew}
                                data-testid="button-rate-start-new"
                              >
                                <PlayCircle className="w-4 h-4 mr-1" />
                                Start New
                              </Button>
                            )}
                          </>
                        )}
                        {isPaused && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRateSheetStop}
                              data-testid="button-rate-stop"
                            >
                              <StopCircle className="w-4 h-4 mr-1" />
                              Stop
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleRateSheetResume}
                              data-testid="button-rate-resume"
                            >
                              <PlayCircle className="w-4 h-4 mr-1" />
                              Resume
                            </Button>
                          </>
                        )}
                        {isStopped && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleRateSheetStartNew}
                            data-testid="button-rate-start-new"
                          >
                            <PlayCircle className="w-4 h-4 mr-1" />
                            Start New
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Rate Selection Dialog (for range defaults like "6-12-16") */}
      <Dialog open={showRateSelectionDialog} onOpenChange={(open) => {
        if (!open) {
          setShowRateSelectionDialog(false);
          setPendingRateSelection(null);
          setCustomRateInput("");
        } else {
          setShowRateSelectionDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-rate-selection">
          <DialogHeader>
            <DialogTitle>Select Rate</DialogTitle>
            <DialogDescription>
              {pendingRateSelection ? `${pendingRateSelection.label}` : 'Select a rate or enter a custom value'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="text-sm font-medium">Choose from preset rates:</div>
            <div className="grid grid-cols-3 gap-2">
              {pendingRateSelection?.rateOptions.map((rate, idx) => (
                <Button
                  key={idx}
                  onClick={() => handleRateSelection(rate)}
                  variant="outline"
                  className="h-12"
                  data-testid={`button-rate-option-${rate}`}
                >
                  {rate}
                </Button>
              ))}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or enter custom
                </span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-rate">Custom Rate</Label>
              <Input
                id="custom-rate"
                type="number"
                inputMode="decimal"
                data-testid="input-custom-rate"
                value={customRateInput}
                onChange={(e) => setCustomRateInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCustomRateEntry();
                  }
                }}
                placeholder="e.g., 8"
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingRateSelection?.time}
            onTimeChange={(newTime) => setPendingRateSelection(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowRateSelectionDialog(false);
              setPendingRateSelection(null);
              setCustomRateInput("");
            }}
            onSave={handleCustomRateEntry}
            saveDisabled={!customRateInput.trim()}
            saveLabel="Set Custom"
          />
        </DialogContent>
      </Dialog>

      {/* Rate Management Dialog (edit/stop/change existing rate) */}
      <Dialog open={showRateManageDialog} onOpenChange={(open) => {
        if (!open) {
          setShowRateManageDialog(false);
          setManagingRate(null);
          setRateManageTime(0);
          setRateManageInput("");
        } else {
          setShowRateManageDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-rate-manage">
          <DialogHeader>
            <DialogTitle>Manage Infusion</DialogTitle>
            <DialogDescription>
              {managingRate ? `${managingRate.label} - Current: ${managingRate.value}` : 'Manage this rate'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Conditional Stop/Start/Start New Actions */}
            <div className="grid grid-cols-2 gap-2">
              {managingRate && (() => {
                const { swimlaneId } = managingRate;
                const existingData = infusionData[swimlaneId] || [];
                
                // Find the latest NON-EMPTY marker to determine running state
                // This handles same-timestamp scenarios correctly
                const sortedData = [...existingData].sort((a, b) => b[0] - a[0]); // Sort descending by time
                
                // Find the first non-empty marker (most recent rate value)
                const latestRateMarker = sortedData.find(([_, val]) => val !== "");
                // Find the first empty marker (most recent stop)
                const latestStopMarker = sortedData.find(([_, val]) => val === "");
                
                // Infusion is running if:
                // 1. There's a rate marker AND
                // 2. (No stop marker OR rate marker is same time or newer than stop marker)
                // Using >= instead of > to handle same-timestamp resume scenarios
                const isRunning = latestRateMarker && 
                  (!latestStopMarker || latestRateMarker[0] >= latestStopMarker[0]);
                
                // Get default rate for Start/Start New buttons
                const getDefaultRate = () => {
                  if (rateManageInput.trim() && !isNaN(Number(rateManageInput)) && Number(rateManageInput) > 0) {
                    return rateManageInput.trim();
                  } else if (managingRate?.value && managingRate.value !== "") {
                    return managingRate.value;
                  } else if (managingRate?.rateOptions && managingRate.rateOptions.length > 0) {
                    return managingRate.rateOptions[0];
                  }
                  return "";
                };
                
                return (
                  <>
                    {/* Stop button - only visible for running infusions */}
                    {isRunning && (
                      <Button
                        onClick={handleRateStop}
                        variant="outline"
                        className="h-20 flex flex-col gap-2"
                        data-testid="button-rate-stop"
                      >
                        <StopCircle className="w-6 h-6" />
                        <span className="text-sm">Stop</span>
                      </Button>
                    )}
                    
                    {/* Start button - only visible for stopped infusions */}
                    {!isRunning && (
                      <Button
                        onClick={() => {
                          const rate = getDefaultRate();
                          if (rate) handleRateStart(rate);
                        }}
                        variant="outline"
                        className="h-20 flex flex-col gap-2"
                        data-testid="button-rate-start"
                      >
                        <PlayCircle className="w-6 h-6" />
                        <span className="text-sm">Start</span>
                      </Button>
                    )}
                    
                    {/* Start New button - always visible */}
                    <Button
                      onClick={() => {
                        const rate = getDefaultRate();
                        if (rate) handleRateStartNew(rate);
                      }}
                      variant="outline"
                      className="h-20 flex flex-col gap-2"
                      data-testid="button-rate-start-new"
                    >
                      <PlayCircle className="w-6 h-6" />
                      <span className="text-sm">Start New</span>
                    </Button>
                  </>
                );
              })()}
            </div>
            
            {/* Separate Change Rate Section */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Change Rate
                </span>
              </div>
            </div>
            
            {managingRate?.rateOptions && managingRate.rateOptions.length > 0 && (
              <>
                <div className="text-sm font-medium">Preset rates:</div>
                <div className="grid grid-cols-3 gap-2">
                  {managingRate.rateOptions.map((rate, idx) => (
                    <Button
                      key={idx}
                      onClick={() => handleRateChange(rate)}
                      variant="outline"
                      className="h-12"
                      data-testid={`button-change-rate-${rate}`}
                    >
                      {rate}
                    </Button>
                  ))}
                </div>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or custom
                    </span>
                  </div>
                </div>
              </>
            )}
            
            <div className="grid gap-2">
              <Label htmlFor="rate-manage-input">Custom Rate</Label>
              <Input
                id="rate-manage-input"
                type="number"
                inputMode="decimal"
                data-testid="input-rate-manage"
                value={rateManageInput}
                onChange={(e) => setRateManageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && rateManageInput.trim() && !isNaN(Number(rateManageInput)) && Number(rateManageInput) > 0) {
                    handleRateChange(rateManageInput.trim());
                  }
                }}
                placeholder="e.g., 10"
              />
              <Button
                onClick={() => handleRateChange(rateManageInput.trim())}
                disabled={!rateManageInput.trim() || isNaN(Number(rateManageInput)) || Number(rateManageInput) <= 0}
                className="w-full"
                data-testid="button-change-rate-custom"
              >
                Change to {rateManageInput.trim() || "..."}
              </Button>
            </div>
          </div>
          <DialogFooterWithTime
            time={rateManageTime}
            onTimeChange={setRateManageTime}
            showDelete={false}
            onCancel={() => {
              setShowRateManageDialog(false);
              setManagingRate(null);
              setRateManageTime(0);
              setRateManageInput("");
            }}
            onSave={() => {
              setShowRateManageDialog(false);
              setManagingRate(null);
              setRateManageTime(0);
              setRateManageInput("");
            }}
            saveDisabled={false}
            saveLabel="Close"
          />
        </DialogContent>
      </Dialog>

      {/* Output Value Entry Dialog */}
      <Dialog open={showOutputDialog} onOpenChange={(open) => {
        if (!open) {
          setShowOutputDialog(false);
          setPendingOutputValue(null);
          setOutputValueInput("");
        } else {
          setShowOutputDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-output-value">
          <DialogHeader>
            <DialogTitle>Add Output Value</DialogTitle>
            <DialogDescription>
              {pendingOutputValue ? `${pendingOutputValue.label}` : 'Add a new output value'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="output-value">Volume (ml)</Label>
              <Input
                id="output-value"
                data-testid="input-output-value"
                type="number"
                step="1"
                value={outputValueInput}
                onChange={(e) => setOutputValueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleOutputValueEntry();
                  }
                }}
                placeholder="e.g., 50, 100, 200"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingOutputValue?.time}
            onTimeChange={(newTime) => setPendingOutputValue(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowOutputDialog(false);
              setPendingOutputValue(null);
              setOutputValueInput("");
            }}
            onSave={handleOutputValueEntry}
            saveDisabled={!outputValueInput.trim()}
            saveLabel="Add"
          />
        </DialogContent>
      </Dialog>

      {/* Ventilation Parameter Entry Dialog */}
      <Dialog open={showVentilationDialog} onOpenChange={(open) => {
        if (!open) {
          setShowVentilationDialog(false);
          setPendingVentilationValue(null);
          setVentilationValueInput("");
        } else {
          setShowVentilationDialog(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-value">
          <DialogHeader>
            <DialogTitle>Add Value</DialogTitle>
            <DialogDescription>
              {pendingVentilationValue ? `${pendingVentilationValue.label}` : 'Add a new ventilation parameter value'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ventilation-value">Value</Label>
              <Input
                id="ventilation-value"
                data-testid="input-ventilation-value"
                type="number"
                step="0.1"
                value={ventilationValueInput}
                onChange={(e) => setVentilationValueInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVentilationParameterEntry();
                  }
                }}
                placeholder="e.g., 35, 12.5, 98"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingVentilationValue?.time}
            onTimeChange={(newTime) => setPendingVentilationValue(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowVentilationDialog(false);
              setPendingVentilationValue(null);
              setVentilationValueInput("");
            }}
            onSave={handleVentilationParameterEntry}
            saveDisabled={!ventilationValueInput.trim()}
            saveLabel="Add"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Value Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-value">
          <DialogHeader>
            <DialogTitle>Edit Vital Sign Value</DialogTitle>
          </DialogHeader>
          {editingValue && (
            <EditValueForm
              type={editingValue.type}
              initialValue={editingValue.value}
              onSave={handleSaveEdit}
              onDelete={handleDeleteValue}
              onCancel={() => {
                setEditDialogOpen(false);
                setEditingValue(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Anesthesia Times Dialog */}
      <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-bulk-edit-times">
          <DialogHeader>
            <DialogTitle>Edit Anesthesia Times</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {timeMarkers.map((marker, index) => (
              <div key={marker.id} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center">
                <div
                  className="w-10 h-10 rounded flex items-center justify-center text-xs font-bold shadow-md"
                  style={{
                    backgroundColor: marker.bgColor,
                    color: marker.color,
                  }}
                >
                  {marker.code}
                </div>
                <div className="grid gap-1">
                  <Label className="text-sm font-medium">
                    {marker.label}
                  </Label>
                  {marker.time !== null ? (
                    <TimeAdjustInput
                      value={marker.time}
                      onChange={(newTime) => {
                        const updated = [...timeMarkers];
                        updated[index] = { ...updated[index], time: newTime };
                        setTimeMarkers(updated);
                      }}
                      data-testid={`input-time-${marker.code}`}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground italic py-2">
                      Not set - click on Times lane to place
                    </div>
                  )}
                </div>
                {marker.time === null ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const updated = [...timeMarkers];
                      updated[index] = { ...updated[index], time: Date.now() };
                      setTimeMarkers(updated);
                    }}
                    data-testid={`button-now-${marker.code}`}
                  >
                    Now
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const updated = [...timeMarkers];
                      updated[index] = { ...updated[index], time: null };
                      setTimeMarkers(updated);
                    }}
                    data-testid={`button-clear-${marker.code}`}
                  >
                    Clear
                  </Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkEditDialogOpen(false)}
              data-testid="button-close-bulk-edit"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                // Save time markers to database
                if (anesthesiaRecordId) {
                  saveTimeMarkersMutation.mutate({
                    anesthesiaRecordId,
                    timeMarkers,
                  });
                }
                setBulkEditDialogOpen(false);
                toast({
                  title: "Times saved",
                  description: "Anesthesia times have been updated",
                  duration: 2000,
                });
              }}
              data-testid="button-save-bulk-edit"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Single Time Marker Dialog */}
      <Dialog open={timeMarkerEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setTimeMarkerEditDialogOpen(false);
          setEditingTimeMarker(null);
        } else {
          setTimeMarkerEditDialogOpen(true);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-time-marker">
          <DialogHeader>
            <DialogTitle>Edit Time Marker</DialogTitle>
          </DialogHeader>
          {editingTimeMarker && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded flex items-center justify-center text-sm font-bold shadow-md"
                  style={{
                    backgroundColor: editingTimeMarker.marker.bgColor,
                    color: editingTimeMarker.marker.color,
                  }}
                >
                  {editingTimeMarker.marker.code}
                </div>
                <div>
                  <div className="font-medium">{editingTimeMarker.marker.label}</div>
                  <div className="text-sm text-muted-foreground">
                    {editingTimeMarker.marker.time 
                      ? formatTime(editingTimeMarker.marker.time)
                      : 'Not set'}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooterWithTime
            time={editingTimeMarker?.marker.time || Date.now()}
            onTimeChange={handleUpdateTimeMarker}
            showDelete={true}
            onDelete={handleDeleteTimeMarker}
            onCancel={() => {
              setTimeMarkerEditDialogOpen(false);
              setEditingTimeMarker(null);
            }}
            onSave={() => {
              setTimeMarkerEditDialogOpen(false);
              setEditingTimeMarker(null);
            }}
            saveLabel="Done"
          />
          {editingTimeMarker && (
            <div style={{ display: 'none' }}>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Extracted Data Confirmation Dialog */}
      <Dialog open={confirmationDialogOpen} onOpenChange={setConfirmationDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto" data-testid="dialog-ai-confirmation">
          <DialogHeader>
            <DialogTitle>Confirm Extracted Monitor Data</DialogTitle>
          </DialogHeader>
          {extractedData && (
            <div className="grid gap-4 py-4">
              {/* Monitor Type Badge and Confidence - shown for new format */}
              {extractedData.monitorType && (
                <div className="flex items-center justify-between gap-3 pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-primary" />
                    <Badge variant="outline" className="text-sm font-semibold">
                      {extractedData.monitorType === 'vitals' && '🫀 Vitals Monitor'}
                      {extractedData.monitorType === 'ventilation' && '🫁 Ventilation Monitor'}
                      {extractedData.monitorType === 'tof' && '💉 TOF Monitor'}
                      {extractedData.monitorType === 'perfusor' && '💊 Perfusor'}
                      {extractedData.monitorType === 'mixed' && '📊 Mixed Monitor'}
                      {extractedData.monitorType === 'unknown' && '❓ Unknown Monitor'}
                    </Badge>
                  </div>
                  {extractedData.confidence && (
                    <Badge 
                      variant={extractedData.confidence === 'high' ? 'default' : extractedData.confidence === 'medium' ? 'secondary' : 'destructive'}
                      className="text-xs"
                    >
                      {extractedData.confidence === 'high' && '✓ High Confidence'}
                      {extractedData.confidence === 'medium' && '~ Medium Confidence'}
                      {extractedData.confidence === 'low' && '! Low Confidence'}
                    </Badge>
                  )}
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                Review the extracted data before adding to timeline:
              </div>

              {/* NEW FORMAT: Show parameters grouped by category with mappings */}
              {extractedData.parameters && extractedData.parameters.length > 0 ? (
                <div className="space-y-4">
                  {/* Group parameters by category */}
                  {['vitals', 'ventilation', 'tof', 'perfusor'].map(category => {
                    const categoryParams = extractedData.parameters.filter((p: any) => p.category === category);
                    if (categoryParams.length === 0) return null;

                    const categoryIcon = {
                      vitals: '🫀',
                      ventilation: '🫁',
                      tof: '💉',
                      perfusor: '💊'
                    }[category];

                    const targetSwimlane = {
                      vitals: 'Vitals Chart',
                      ventilation: 'Ventilation Swimlanes',
                      tof: 'TOF Log',
                      perfusor: 'Infusion Swimlanes'
                    }[category];

                    return (
                      <div key={category} className="space-y-2 border rounded-md p-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <span>{categoryIcon}</span>
                            <span className="capitalize">{category}</span>
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            → {targetSwimlane}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          {categoryParams.map((param: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between text-sm bg-background rounded px-2 py-1">
                              <div className="flex items-center gap-2">
                                {param.detectedName !== param.standardName && (
                                  <span className="text-muted-foreground">
                                    {param.detectedName} →
                                  </span>
                                )}
                                <span className="font-medium">{param.standardName}</span>
                              </div>
                              <span className="font-semibold text-primary">
                                {param.value} {param.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  {/* OLD FORMAT: Show vitals, ventilation, etc. as before */}
                  {extractedData.vitals && Object.values(extractedData.vitals).some((v: any) => v !== null) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Vitals:</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {extractedData.vitals.hr && <div>HR: {extractedData.vitals.hr} bpm</div>}
                        {extractedData.vitals.sysBP && extractedData.vitals.diaBP && (
                          <div>BP: {extractedData.vitals.sysBP}/{extractedData.vitals.diaBP} mmHg</div>
                        )}
                        {extractedData.vitals.spo2 && <div>SpO2: {extractedData.vitals.spo2}%</div>}
                        {extractedData.vitals.temp && <div>Temp: {extractedData.vitals.temp}°C</div>}
                        {extractedData.vitals.cvp && <div>CVP: {extractedData.vitals.cvp}</div>}
                        {extractedData.vitals.ibp_sys && extractedData.vitals.ibp_dia && (
                          <div>IBP: {extractedData.vitals.ibp_sys}/{extractedData.vitals.ibp_dia}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {extractedData.ventilation && Object.values(extractedData.ventilation).some((v: any) => v !== null) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Ventilation:</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {extractedData.ventilation.tidalVolume && <div>VT: {extractedData.ventilation.tidalVolume} mL</div>}
                        {extractedData.ventilation.respiratoryRate && <div>RR: {extractedData.ventilation.respiratoryRate} /min</div>}
                        {extractedData.ventilation.peep && <div>PEEP: {extractedData.ventilation.peep} cmH2O</div>}
                        {extractedData.ventilation.fio2 && <div>FiO2: {extractedData.ventilation.fio2}%</div>}
                        {extractedData.ventilation.peakPressure && <div>Peak: {extractedData.ventilation.peakPressure} cmH2O</div>}
                      </div>
                    </div>
                  )}

                  {extractedData.tof && (extractedData.tof.ratio || extractedData.tof.count) && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">TOF:</h4>
                      <div className="text-sm">
                        {extractedData.tof.ratio && <div>Ratio: {extractedData.tof.ratio}</div>}
                        {extractedData.tof.count && <div>Count: {extractedData.tof.count}</div>}
                      </div>
                    </div>
                  )}

                  {extractedData.pumps && extractedData.pumps.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Pumps/Infusions:</h4>
                      <div className="space-y-1 text-sm">
                        {extractedData.pumps.map((pump: any, idx: number) => (
                          <div key={idx}>{pump.drug}: {pump.rate} {pump.unit}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                <div>
                  Time: {formatTime(extractedData.timestamp)}
                </div>
                <div className="flex items-center gap-1">
                  {extractedData.detectionMethod === 'local-ocr' && (
                    <span className="text-green-600 dark:text-green-400 font-medium">⚡ Fast OCR</span>
                  )}
                  {(extractedData.detectionMethod === 'hybrid-ai' || extractedData.detectionMethod === 'ai_vision') && (
                    <span className="text-blue-600 dark:text-blue-400 font-medium">🤖 AI Enhanced</span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmationDialogOpen(false);
                setExtractedData(null);
              }}
              data-testid="button-cancel-ai-data"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmExtractedData}
              data-testid="button-confirm-ai-data"
            >
              Add to Timeline
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Comment Dialog */}
      <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-event-comment">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Add Event'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Edit or delete the event comment' : 'Add an event to the timeline'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="event-text">Event Comment</Label>
              <Textarea
                id="event-text"
                data-testid="input-event-text"
                value={eventTextInput}
                onChange={(e) => setEventTextInput(e.target.value)}
                placeholder="Enter event description..."
                rows={4}
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={editingEvent ? eventEditTime : pendingEvent?.time}
            onTimeChange={editingEvent ? setEventEditTime : (newTime) => setPendingEvent(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={!!editingEvent}
            onDelete={editingEvent ? handleEventDelete : undefined}
            onCancel={() => {
              setShowEventDialog(false);
              setPendingEvent(null);
              setEditingEvent(null);
              setEventTextInput("");
            }}
            onSave={handleEventSave}
            saveDisabled={!eventTextInput.trim()}
            saveLabel={editingEvent ? 'Save' : 'Add'}
          />
        </DialogContent>
      </Dialog>

      {/* Medication Dose Edit Dialog */}
      <Dialog open={showMedicationEditDialog} onOpenChange={setShowMedicationEditDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-edit">
          <DialogHeader>
            <DialogTitle>Edit Dose</DialogTitle>
            <DialogDescription>
              Edit or delete the medication dose
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {(() => {
              // Get the swimlane to check for range defaults
              const swimlane = editingMedicationDose 
                ? activeSwimlanes.find(lane => lane.id === editingMedicationDose.swimlaneId)
                : null;
              
              // Parse dose presets from defaultDose (e.g., "25-35-50")
              const dosePresets = swimlane?.defaultDose && swimlane.defaultDose.includes('-')
                ? swimlane.defaultDose.split('-').map(v => v.trim()).filter(v => v)
                : [];
              
              return (
                <>
                  {/* Preset Buttons if available */}
                  {dosePresets.length > 0 && (
                    <>
                      <div className="text-sm font-medium">Quick doses:</div>
                      <div className="grid grid-cols-3 gap-2">
                        {dosePresets.map((dose, idx) => (
                          <Button
                            key={idx}
                            onClick={() => setMedicationEditInput(dose)}
                            variant="outline"
                            className="h-12"
                            data-testid={`button-dose-preset-${dose}`}
                          >
                            {dose}
                          </Button>
                        ))}
                      </div>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            Or custom
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* Dose Input */}
                  <div className="grid gap-2">
                    <Label htmlFor="dose-edit-value">Dose</Label>
                    <Input
                      id="dose-edit-value"
                      data-testid="input-dose-edit-value"
                      value={medicationEditInput}
                      onChange={(e) => setMedicationEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleMedicationDoseEditSave();
                        }
                      }}
                      placeholder="e.g., 5mg, 100mg, 2ml"
                      autoFocus
                    />
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooterWithTime
            time={medicationEditTime}
            onTimeChange={setMedicationEditTime}
            showDelete={true}
            onDelete={handleMedicationDoseDelete}
            onCancel={() => {
              setShowMedicationEditDialog(false);
              setEditingMedicationDose(null);
              setMedicationEditInput("");
            }}
            onSave={handleMedicationDoseEditSave}
            saveDisabled={!medicationEditInput.trim()}
          />
        </DialogContent>
      </Dialog>

      {/* Ventilation Value Edit Dialog */}
      <Dialog open={showVentilationEditDialog} onOpenChange={setShowVentilationEditDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-edit">
          <DialogHeader>
            <DialogTitle>Edit {editingVentilationValue?.label}</DialogTitle>
            <DialogDescription>
              Edit or delete the ventilation value
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ventilation-edit-value">Value</Label>
              <Input
                id="ventilation-edit-value"
                data-testid="input-ventilation-edit-value"
                type="number"
                step="any"
                value={ventilationEditInput}
                onChange={(e) => setVentilationEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleVentilationValueEditSave();
                  }
                }}
                placeholder="Enter value"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={ventilationEditTime}
            onTimeChange={setVentilationEditTime}
            showDelete={true}
            onDelete={handleVentilationValueDelete}
            onCancel={() => {
              setShowVentilationEditDialog(false);
              setEditingVentilationValue(null);
              setVentilationEditInput("");
            }}
            onSave={handleVentilationValueEditSave}
            saveDisabled={!ventilationEditInput.trim()}
          />
        </DialogContent>
      </Dialog>

      {/* Ventilation Mode Edit Dialog */}
      <Dialog open={showVentilationModeEditDialog} onOpenChange={setShowVentilationModeEditDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-mode-edit">
          <DialogHeader>
            <DialogTitle>Edit Ventilation Mode</DialogTitle>
            <DialogDescription>
              Edit or delete the ventilation mode
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mode-edit-value">Mode</Label>
              <Select value={ventilationModeEditInput} onValueChange={setVentilationModeEditInput}>
                <SelectTrigger id="mode-edit-value" data-testid="select-mode-edit-value">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Präoxygenierung">Preoxygenation</SelectItem>
                  <SelectItem value="Assistierte Spontanatmung">Assisted Spontaneous Breathing</SelectItem>
                  <SelectItem value="Spontanatmung am Gerät">Spontaneous Breathing on Device</SelectItem>
                  <SelectItem value="PCV - druckkontrolliert">PCV - Pressure Controlled</SelectItem>
                  <SelectItem value="VCV - volumenkontrolliert">VCV - Volume Controlled</SelectItem>
                  <SelectItem value="CPAP - PSV">CPAP - PSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooterWithTime
            time={ventilationModeEditTime}
            onTimeChange={setVentilationModeEditTime}
            showDelete={true}
            onDelete={handleVentilationModeDelete}
            onCancel={() => {
              setShowVentilationModeEditDialog(false);
              setEditingVentilationMode(null);
              setVentilationModeEditInput("");
            }}
            onSave={handleVentilationModeEditSave}
            saveDisabled={!ventilationModeEditInput.trim()}
          />
        </DialogContent>
      </Dialog>

      {/* Heart Rhythm Dialog */}
      <Dialog open={showHeartRhythmDialog} onOpenChange={setShowHeartRhythmDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-heart-rhythm">
          <DialogHeader>
            <DialogTitle>Heart Rhythm</DialogTitle>
            <DialogDescription>
              {editingHeartRhythm ? 'Edit or delete the rhythm' : 'Select a heart rhythm to add'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Select Rhythm</Label>
              <div className="grid gap-1">
                {editingHeartRhythm ? (
                  // When editing, show buttons to select new rhythm but require Save
                  <>
                    {['SR', 'SVES', 'VES', 'VHF', 'Vorhofflattern', 'Schrittmacher', 'AV Block III', 'Kammerflimmern', 'Torsade de pointes', 'Defibrillator'].map((rhythm) => (
                      <Button
                        key={rhythm}
                        variant={heartRhythmInput === rhythm ? 'default' : 'outline'}
                        className="justify-start h-12 text-left"
                        onClick={() => {
                          setHeartRhythmInput(rhythm);
                        }}
                        data-testid={`button-rhythm-${rhythm.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {rhythm}
                      </Button>
                    ))}
                    <Input
                      placeholder="Custom value..."
                      value={heartRhythmInput && !['SR', 'SVES', 'VES', 'VHF', 'Vorhofflattern', 'Schrittmacher', 'AV Block III', 'Kammerflimmern', 'Torsade de pointes', 'Defibrillator'].includes(heartRhythmInput) ? heartRhythmInput : ''}
                      onChange={(e) => setHeartRhythmInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && heartRhythmInput.trim()) {
                          handleHeartRhythmSave();
                        }
                      }}
                      className="mt-2"
                      data-testid="input-heart-rhythm-custom"
                    />
                  </>
                ) : (
                  // When adding new, preset buttons immediately save
                  <>
                    {['SR', 'SVES', 'VES', 'VHF', 'Vorhofflattern', 'Schrittmacher', 'AV Block III', 'Kammerflimmern', 'Torsade de pointes', 'Defibrillator'].map((rhythm) => (
                      <Button
                        key={rhythm}
                        variant="outline"
                        className="justify-start h-12 text-left"
                        onClick={() => {
                          handleHeartRhythmSave(rhythm);
                        }}
                        data-testid={`button-rhythm-${rhythm.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {rhythm}
                      </Button>
                    ))}
                    <Input
                      placeholder="Custom value..."
                      value={heartRhythmInput}
                      onChange={(e) => setHeartRhythmInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && heartRhythmInput.trim()) {
                          handleHeartRhythmSave();
                        }
                      }}
                      className="mt-2"
                      data-testid="input-heart-rhythm-custom"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooterWithTime
            time={editingHeartRhythm ? heartRhythmEditTime : pendingHeartRhythm?.time}
            onTimeChange={editingHeartRhythm ? setHeartRhythmEditTime : (newTime) => setPendingHeartRhythm(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={!!editingHeartRhythm}
            onDelete={editingHeartRhythm ? handleHeartRhythmDelete : undefined}
            onCancel={() => {
              setShowHeartRhythmDialog(false);
              setPendingHeartRhythm(null);
              setEditingHeartRhythm(null);
              setHeartRhythmInput("");
            }}
            onSave={handleHeartRhythmSave}
            saveDisabled={!heartRhythmInput.trim()}
            saveLabel={editingHeartRhythm ? 'Save' : 'Add'}
          />
        </DialogContent>
      </Dialog>

      {/* Staff Entry Dialog */}
      <Dialog open={showStaffDialog} onOpenChange={setShowStaffDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-staff">
          <DialogHeader>
            <DialogTitle>Staff Entry</DialogTitle>
            <DialogDescription>
              {editingStaff ? `Edit or delete the ${editingStaff.role} entry` : 'Add staff member to the timeline'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="staff-name">Name</Label>
              <Input
                id="staff-name"
                data-testid="input-staff-name"
                placeholder="Enter name..."
                value={staffInput}
                onChange={(e) => setStaffInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && staffInput.trim()) {
                    handleStaffSave();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={editingStaff ? staffEditTime : pendingStaff?.time}
            onTimeChange={editingStaff ? setStaffEditTime : (newTime) => setPendingStaff(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={!!editingStaff}
            onDelete={editingStaff ? handleStaffDelete : undefined}
            onCancel={() => {
              setShowStaffDialog(false);
              setPendingStaff(null);
              setEditingStaff(null);
              setStaffInput("");
            }}
            onSave={handleStaffSave}
            saveDisabled={!staffInput.trim()}
            saveLabel={editingStaff ? 'Save' : 'Add'}
          />
        </DialogContent>
      </Dialog>

      {/* Position Dialog */}
      <Dialog open={showPositionDialog} onOpenChange={setShowPositionDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-position">
          <DialogHeader>
            <DialogTitle>Patient Position</DialogTitle>
            <DialogDescription>
              {editingPosition ? 'Edit or delete the patient position' : 'Select a patient position'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>Select Position</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'Supine', label: 'Supine (Back)' },
                  { key: 'Prone', label: 'Prone (Belly)' },
                  { key: 'Left Side', label: 'Left Side' },
                  { key: 'Right Side', label: 'Right Side' },
                  { key: 'Beach Chair', label: 'Beach Chair' },
                  { key: 'Lithotomy', label: 'Lithotomy' },
                  { key: 'Head Up', label: 'Head Up' },
                  { key: 'Head Down', label: 'Head Down' },
                  { key: 'Sitting for SPA/PDA', label: 'Sitting for SPA/PDA' },
                  { key: 'Other', label: 'Other' },
                ].map((pos) => (
                  <Button
                    key={pos.key}
                    variant={positionInput === pos.key ? 'default' : 'outline'}
                    className="justify-start h-12 text-left"
                    onClick={() => {
                      setPositionInput(pos.key);
                    }}
                    data-testid={`button-position-${pos.key.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')}`}
                  >
                    {pos.label}
                  </Button>
                ))}
                <Input
                  placeholder="Custom position..."
                  value={positionInput && !['Supine', 'Prone', 'Left Side', 'Right Side', 'Beach Chair', 'Lithotomy', 'Head Up', 'Head Down', 'Sitting for SPA/PDA', 'Other'].includes(positionInput) ? positionInput : ''}
                  onChange={(e) => setPositionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && positionInput.trim() && pendingPosition) {
                      handlePositionSave();
                    }
                  }}
                  className="col-span-2"
                  data-testid="input-position-custom"
                />
              </div>
            </div>
          </div>
          <DialogFooterWithTime
            time={editingPosition ? positionEditTime : pendingPosition?.time}
            onTimeChange={editingPosition ? setPositionEditTime : (newTime) => setPendingPosition(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={!!editingPosition}
            onDelete={editingPosition ? handlePositionDelete : undefined}
            onCancel={() => {
              setShowPositionDialog(false);
              setPendingPosition(null);
              setEditingPosition(null);
              setPositionInput("");
            }}
            onSave={handlePositionSave}
            saveDisabled={!positionInput.trim()}
            saveLabel={editingPosition ? 'Save' : 'Add'}
          />
        </DialogContent>
      </Dialog>

      {/* Ventilation Bulk Entry Dialog */}
      <Dialog open={showVentilationBulkDialog} onOpenChange={setShowVentilationBulkDialog}>
        <DialogContent className="sm:max-w-[550px]" data-testid="dialog-ventilation-bulk">
          <DialogHeader>
            <DialogTitle>Ventilation Bulk Entry</DialogTitle>
            <DialogDescription>
              Add ventilation parameters to the timeline
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label htmlFor="vent-mode">Ventilation Mode</Label>
              <Select value={ventilationMode} onValueChange={setVentilationMode}>
                <SelectTrigger id="vent-mode" data-testid="select-vent-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Präoxygenierung">Preoxygenation</SelectItem>
                  <SelectItem value="Assistierte Spontanatmung">Assisted Spontaneous Breathing</SelectItem>
                  <SelectItem value="Spontanatmung am Gerät">Spontaneous Breathing on Device</SelectItem>
                  <SelectItem value="PCV - druckkontrolliert">PCV - Pressure Controlled</SelectItem>
                  <SelectItem value="VCV - volumenkontrolliert">VCV - Volume Controlled</SelectItem>
                  <SelectItem value="CPAP - PSV">CPAP - PSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="bulk-peep">PEEP (cmH₂O)</Label>
                <Input
                  id="bulk-peep"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.peep}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, peep: e.target.value }))}
                  data-testid="input-bulk-peep"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-fio2">FiO₂ (%)</Label>
                <Input
                  id="bulk-fio2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.fiO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, fiO2: e.target.value }))}
                  data-testid="input-bulk-fio2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-vt">Tidal Volume (ml)</Label>
                <Input
                  id="bulk-vt"
                  type="number"
                  step="10"
                  value={bulkVentilationParams.tidalVolume}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, tidalVolume: e.target.value }))}
                  data-testid="input-bulk-vt"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-rr">Resp. Rate (/min)</Label>
                <Input
                  id="bulk-rr"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.respiratoryRate}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                  data-testid="input-bulk-rr"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-mv">Minute Volume (l/min)</Label>
                <Input
                  id="bulk-mv"
                  type="number"
                  step="0.1"
                  value={bulkVentilationParams.minuteVolume}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, minuteVolume: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-mv"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-etco2">EtCO₂ (mmHg)</Label>
                <Input
                  id="bulk-etco2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.etCO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, etCO2: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-etco2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-pip">P insp (cmH₂O)</Label>
                <Input
                  id="bulk-pip"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.pip}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, pip: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-pip"
                />
              </div>
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingVentilationBulk?.time}
            onTimeChange={(newTime) => setPendingVentilationBulk(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowVentilationBulkDialog(false);
              setPendingVentilationBulk(null);
            }}
            onSave={handleVentilationBulkSave}
            saveLabel="Add All"
          />
        </DialogContent>
      </Dialog>

      {/* Output Bulk Entry Dialog */}
      <Dialog open={showOutputBulkDialog} onOpenChange={setShowOutputBulkDialog}>
        <DialogContent className="sm:max-w-[550px]" data-testid="dialog-output-bulk">
          <DialogHeader>
            <DialogTitle>Output Bulk Entry</DialogTitle>
            <DialogDescription>
              Add output parameters to the timeline
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="bulk-gastrictube">Gastric Tube (ml)</Label>
                <Input
                  id="bulk-gastrictube"
                  type="number"
                  step="1"
                  value={bulkOutputParams.gastricTube}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, gastricTube: e.target.value }))}
                  data-testid="input-bulk-gastrictube"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-drainage">Drainage (ml)</Label>
                <Input
                  id="bulk-drainage"
                  type="number"
                  step="1"
                  value={bulkOutputParams.drainage}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, drainage: e.target.value }))}
                  data-testid="input-bulk-drainage"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-vomit">Vomit (ml)</Label>
                <Input
                  id="bulk-vomit"
                  type="number"
                  step="1"
                  value={bulkOutputParams.vomit}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, vomit: e.target.value }))}
                  data-testid="input-bulk-vomit"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-urine">Urine (ml)</Label>
                <Input
                  id="bulk-urine"
                  type="number"
                  step="1"
                  value={bulkOutputParams.urine}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, urine: e.target.value }))}
                  data-testid="input-bulk-urine"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-urine677">Urine 677 (ml)</Label>
                <Input
                  id="bulk-urine677"
                  type="number"
                  step="1"
                  value={bulkOutputParams.urine677}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, urine677: e.target.value }))}
                  data-testid="input-bulk-urine677"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-blood">Blood (ml)</Label>
                <Input
                  id="bulk-blood"
                  type="number"
                  step="1"
                  value={bulkOutputParams.blood}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, blood: e.target.value }))}
                  data-testid="input-bulk-blood"
                  placeholder="Optional"
                />
              </div>
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="bulk-bloodirrigation">Blood and Irrigation in Suction (ml)</Label>
                <Input
                  id="bulk-bloodirrigation"
                  type="number"
                  step="1"
                  value={bulkOutputParams.bloodIrrigation}
                  onChange={(e) => setBulkOutputParams(prev => ({ ...prev, bloodIrrigation: e.target.value }))}
                  data-testid="input-bulk-bloodirrigation"
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <DialogFooterWithTime
            time={pendingOutputBulk?.time}
            onTimeChange={(newTime) => setPendingOutputBulk(prev => prev ? { ...prev, time: newTime } : null)}
            showDelete={false}
            onCancel={() => {
              setShowOutputBulkDialog(false);
              setPendingOutputBulk(null);
            }}
            onSave={handleOutputBulkSave}
            saveLabel="Add All"
          />
        </DialogContent>
      </Dialog>

      {/* Output Value Edit Dialog */}
      <Dialog open={showOutputEditDialog} onOpenChange={setShowOutputEditDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-output-edit">
          <DialogHeader>
            <DialogTitle>Edit Output Value</DialogTitle>
            <DialogDescription>
              {editingOutputValue ? `Edit or delete the ${editingOutputValue.label} value` : 'Edit output value'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="output-edit-value">Value (ml)</Label>
              <Input
                id="output-edit-value"
                data-testid="input-output-edit-value"
                type="number"
                step="1"
                value={outputEditInput}
                onChange={(e) => setOutputEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleOutputValueEditSave();
                  }
                }}
                placeholder="Enter value"
                autoFocus
              />
            </div>
          </div>
          <DialogFooterWithTime
            time={outputEditTime}
            onTimeChange={setOutputEditTime}
            showDelete={true}
            onDelete={handleOutputValueDelete}
            onCancel={() => {
              setShowOutputEditDialog(false);
              setEditingOutputValue(null);
              setOutputEditInput("");
            }}
            onSave={handleOutputValueEditSave}
            saveDisabled={!outputEditInput.trim()}
          />
        </DialogContent>
      </Dialog>

      {/* Loading overlay for image processing */}
      {isProcessingImage && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center">
          <div className="bg-background rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm font-medium">Analyzing monitor image...</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Edit Value Form Component
function EditValueForm({
  type,
  initialValue,
  onSave,
  onDelete,
  onCancel,
}: {
  type: 'hr' | 'sys' | 'dia' | 'spo2';
  initialValue: number;
  onSave: (value: number) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue.toString());

  const getLabel = () => {
    if (type === 'hr') return 'Heart Rate (bpm)';
    if (type === 'sys') return 'Systolic BP (mmHg)';
    if (type === 'dia') return 'Diastolic BP (mmHg)';
    return 'SpO₂ (%)';
  };

  const handleSave = () => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;
    onSave(numValue);
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-value">{getLabel()}</Label>
        <Input
          id="edit-value"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          data-testid="input-edit-value"
        />
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          data-testid="button-delete-value"
        >
          Delete
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            data-testid="button-save-edit"
            disabled={!value || isNaN(parseInt(value))}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// Dialog Footer Component with Time Navigation (matches screenshot design)
// Left: Time with arrows, Right: Delete icon button and Save button
function DialogFooterWithTime({
  time,
  onTimeChange,
  onDelete,
  onCancel,
  onSave,
  showDelete = false,
  saveDisabled = false,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: {
  time?: number;
  onTimeChange?: (newTime: number) => void;
  onDelete?: () => void;
  onCancel: () => void;
  onSave: () => void;
  showDelete?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-4">
      {/* Left: Time navigation (compact) */}
      <div className="flex items-center gap-1">
        {time !== undefined && onTimeChange && (
          <TimeAdjustInput
            value={time}
            onChange={onTimeChange}
            data-testid="footer-time-input"
          />
        )}
      </div>
      
      {/* Right: Delete and Save buttons */}
      <div className="flex gap-2 ml-auto">
        {showDelete && onDelete && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onDelete}
            data-testid="button-delete"
            className="h-9 w-9"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
        <Button
          onClick={() => {
            console.log('[BUTTON] Save button clicked in DialogFooterWithTime');
            onSave();
          }}
          data-testid="button-save"
          disabled={saveDisabled}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
