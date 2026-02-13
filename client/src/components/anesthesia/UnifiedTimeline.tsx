import { useMemo, useRef, useState, useEffect, useLayoutEffect, useCallback, forwardRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Heart, CircleDot, Blend, Plus, X, ChevronDown, ChevronRight, Undo2, Clock, Monitor, ChevronsDownUp, MessageSquareText, Trash2, Pencil, StopCircle, PlayCircle, Droplet, Loader2, ArrowUpDown, GripVertical, Check, Copy, Lock, LockOpen, Layers } from "lucide-react";
import {
  VitalPoint,
  TimelineVitals,
  TimelineEvent,
  InfusionSegment,
  InfusionSession,
  UnifiedTimelineData,
  SwimlaneConfig,
  AnesthesiaItem,
  AdministrationGroup,
  ChartExportResult,
  SwimlaneExportResult,
  UnifiedTimelineRef,
  ANESTHESIA_TIME_MARKERS,
  FOUR_HOURS_MS,
  EditValueForm,
  SortableMedicationItem,
} from "./unifiedTimeline";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StickyTimelineHeader } from "./StickyTimelineHeader";
import { MedicationConfigDialog } from "./MedicationConfigDialog";
import { OnDemandMedicationDialog } from "./dialogs/OnDemandMedicationDialog";
import { EventDialog } from "./dialogs/EventDialog";
import { HeartRhythmDialog } from "./dialogs/HeartRhythmDialog";
import { BISDialog } from "./dialogs/BISDialog";
import { TOFDialog } from "./dialogs/TOFDialog";
import { PositionDialog } from "./dialogs/PositionDialog";
import { MedicationDoseDialog } from "./dialogs/MedicationDoseDialog";
import { MedicationEditDialog } from "./dialogs/MedicationEditDialog";
import { VentilationDialog } from "./dialogs/VentilationDialog";
import { VentilationEditDialog } from "./dialogs/VentilationEditDialog";
import { VentilationModeEditDialog } from "./dialogs/VentilationModeEditDialog";
import { VentilationModeAddDialog } from "./dialogs/VentilationModeAddDialog";
import { VentilationBulkDialog } from "./dialogs/VentilationBulkDialog";
import { OutputDialog } from "./dialogs/OutputDialog";
import { OutputEditDialog } from "./dialogs/OutputEditDialog";
import { OutputBulkDialog } from "./dialogs/OutputBulkDialog";
import { InfusionDialog } from "./dialogs/InfusionDialog";
import { InfusionEditDialog } from "./dialogs/InfusionEditDialog";
import { FreeFlowDoseDialog } from "./dialogs/FreeFlowDoseDialog";
import { FreeFlowManageDialog } from "./dialogs/FreeFlowManageDialog";
import { RateSelectionDialog } from "./dialogs/RateSelectionDialog";
import { RateManageDialog } from "./dialogs/RateManageDialog";
import { ManualVitalsDialog } from "./dialogs/ManualVitalsDialog";
import { BulkVitalsDialog } from "./dialogs/BulkVitalsDialog";
import { DialogFooterWithTime } from "./DialogFooterWithTime";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { saveMedication, saveTimeMarkers } from "@/services/timelinePersistence";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useVitalsState } from "@/hooks/useVitalsState";
import { useMedicationState, type MedicationDosePoint } from "@/hooks/useMedicationState";
import { useVentilationState } from "@/hooks/useVentilationState";
import { useEventState } from "@/hooks/useEventState";
import { useOutputState } from "@/hooks/useOutputState";
import { useInventoryCommitState } from "@/hooks/useInventoryCommitState";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useTimelineGestures } from "@/hooks/useTimelineGestures";
import { useTimelineExport } from "./unifiedTimeline/useTimelineExport";
import { useViewportController } from "./unifiedTimeline/useViewportController";
import { 
  useClinicalSnapshot, 
  useAddVitalPoint, 
  useAddBPPoint, 
  useUpdateVitalPoint, 
  useUpdateBPPoint,
  useDeleteVitalPoint,
  convertToRecordsFormat 
} from "@/hooks/useVitalsQuery";
import { useCreateVentilationMode, useUpdateVentilationMode, useDeleteVentilationMode } from "@/hooks/useVentilationModeQuery";
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from "@/hooks/useEventsQuery";
import { useCreateMedication, useUpdateMedication, useDeleteMedication } from "@/hooks/useMedicationQuery";
import { useCreateOutput, useUpdateOutput, useDeleteOutput } from "@/hooks/useOutputQuery";
import type { MonitorAnalysisResult } from "@shared/monitorParameters";
import { TimelineContextProvider } from "./TimelineContext";
import { VITAL_ICON_PATHS } from "@/lib/vitalIconPaths";
import { TimeAdjustInput } from "./TimeAdjustInput";
import { formatTime, formatElapsedTime } from "@/lib/dateUtils";
import { calculateMaxTracks, assignInfusionTracks } from "@/lib/infusionTrackAssignment";
import {
  ONE_MINUTE,
  FIVE_MINUTES,
  TEN_MINUTES,
  THIRTY_MINUTES,
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
  transformManualTotals,
  type ManualTotalRecord,
} from "@/services/timelineTransform";
import { 
  VitalsSwimlane, 
  generateVitalsYAxes, 
  generateVitalsSeries, 
  generateVitalsYAxisLabels 
} from "./swimlanes/VitalsSwimlane";
import { EventsSwimlane } from "./swimlanes/EventsSwimlane";
import { MedicationsSwimlane } from "./swimlanes/MedicationsSwimlane";
import { VentilationSwimlane, generateVentilationSeries } from "./swimlanes/VentilationSwimlane";
import { OutputSwimlane } from "./swimlanes/OutputSwimlane";
import { PositionSwimlane } from "./swimlanes/PositionSwimlane";
import { HeartRhythmSwimlane } from "./swimlanes/HeartRhythmSwimlane";
import { BISSwimlane } from "./swimlanes/BISSwimlane";
import { TOFSwimlane } from "./swimlanes/TOFSwimlane";
import { VASSwimlane } from "./swimlanes/VASSwimlane";
import { ScoresSwimlane } from "./swimlanes/ScoresSwimlane";
import { VASDialog } from "./dialogs/VASDialog";
import { ScoresDialog } from "./dialogs/ScoresDialog";
import { EventsTimesPanel } from "./EventsTimesPanel";
import type { EventComment, AnesthesiaTimeMarker } from "@/hooks/useEventState";

export type { VitalPoint, TimelineVitals, TimelineEvent, InfusionSegment, InfusionSession, UnifiedTimelineData, SwimlaneConfig, ChartExportResult, SwimlaneExportResult, UnifiedTimelineRef } from "./unifiedTimeline";
export { ANESTHESIA_TIME_MARKERS } from "./unifiedTimeline";

export const UnifiedTimeline = forwardRef<UnifiedTimelineRef, {
  data: UnifiedTimelineData;
  height?: number;
  swimlanes?: SwimlaneConfig[];
  now?: number;
  patientWeight?: number;
  anesthesiaRecordId?: string;
  anesthesiaRecord?: any;
  openEventsPanel?: boolean;
  onEventsPanelChange?: (open: boolean) => void;
  isPacuMode?: boolean;
}>(function UnifiedTimeline({
  data,
  height,
  swimlanes, // Optional: allow custom swimlane configuration
  now, // Current time for determining editable zones and initial zoom
  patientWeight, // Patient weight in kg for default ventilation calculations
  anesthesiaRecordId, // Anesthesia record ID for auto-saving vitals
  anesthesiaRecord, // Full anesthesia record for loading saved data (time markers, etc.)
  openEventsPanel, // External trigger to open events panel
  onEventsPanelChange, // Callback when events panel state changes
  isPacuMode = false, // PACU mode: show VAS and Scores instead of TOF
}, ref) {
  const chartRef = useRef<any>(null);
  const gestureContainerRef = useRef<HTMLDivElement>(null); // Container for touch gesture handling
  const activeSwimlaneRef = useRef<SwimlaneConfig[]>([]); // Stores latest swimlanes for PDF export
  const isMountedRef = useRef(true); // Track if component is mounted to prevent accessing disposed chart
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  const [showCommitReminder, setShowCommitReminder] = useState(false);
  const [isChartReady, setIsChartReady] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { t } = useTranslation();
  const canWriteBase = useCanWrite();
  
  // Track component mount state to prevent accessing disposed chart on unmount
  // CRITICAL: Use useLayoutEffect so cleanup runs BEFORE other effect cleanups
  // This ensures isMountedRef.current is false when chart event handlers cleanup
  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Reset chart ready state when anesthesia record changes to prevent stale instance access
  useEffect(() => {
    setIsChartReady(false);
  }, [anesthesiaRecordId]);
  
  // Extract lock status from anesthesia record
  const isRecordLocked = anesthesiaRecord?.isLocked ?? false;
  
  // Effective canWrite: user must have write permission AND record must not be locked
  // When record is locked, editing is blocked until explicitly unlocked
  const canWrite = canWriteBase && !isRecordLocked;
  
  // Admin check for medication configuration features (sorting, add/edit medication config)
  const isAdmin = activeHospital?.role === "admin";

  useTimelineExport({ ref, chartRef, isChartReady, activeSwimlaneRef, data, anesthesiaRecord });

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

  // Fetch imported on-demand medications for this record
  type ImportedMedication = {
    id: string;
    medicationConfigId: string;
    itemId: string;
    itemName: string;
    administrationGroup: string | null;
  };
  const { data: importedMedications = [] } = useQuery<ImportedMedication[]>({
    queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'imported-medications'],
    queryFn: async () => {
      if (!anesthesiaRecordId) return [];
      const response = await fetch(`/api/anesthesia/records/${anesthesiaRecordId}/imported-medications`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!anesthesiaRecordId,
  });

  // Get set of imported item IDs for quick lookup
  const importedItemIds = useMemo(() => {
    return new Set(importedMedications.map(m => m.itemId));
  }, [importedMedications]);

  // Filter to only show items with an administration group assigned
  // Exclude on-demand items unless they are imported to this record
  const anesthesiaItems = useMemo(() => {
    return allAnesthesiaItems.filter(item => {
      // Must have an administration group
      if (!item.administrationGroup) return false;
      // If it's on-demand only, only include if it's been imported to this record
      if (item.onDemandOnly) {
        return importedItemIds.has(item.id);
      }
      // Regular items are always included
      return true;
    });
  }, [allAnesthesiaItems, importedItemIds]);
  
  // Mutation for saving medication doses - now using centralized persistence service
  const saveMedicationMutation = useMutation({
    mutationFn: saveMedication,
    onSuccess: (data, variables) => {
      console.log('[MEDICATION] Save successful', { data, variables });
      
      // 🔥 FIX: Immediately update local state (don't wait for useEffect)
      // This makes infusions work like boluses
      if (variables.type === 'infusion_start' && variables.rate === 'free') {
        // Find the item and its swimlane
        const item = anesthesiaItems.find(i => i.id === variables.itemId);
        if (item && item.administrationGroup) {
          const swimlaneId = `admingroup-${item.administrationGroup}-item-${item.id}`;
          const newSession = {
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            swimlaneId,
            startTime: new Date(variables.timestamp).getTime(),
            dose: variables.dose,
            label: item.name,
          };
          console.log('[MEDICATION] Adding free-flow session to local state:', newSession);
          setFreeFlowSessions(prev => ({
            ...prev,
            [swimlaneId]: [...(prev[swimlaneId] || []), newSession]
          }));
        }
      }
      
      // Still invalidate cache for consistency (but don't rely on useEffect)
      if (anesthesiaRecordId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`] 
        });
        
        // Trigger inventory recalculation when medications change
        fetch(`/api/anesthesia/inventory/${anesthesiaRecordId}/calculate`, {
          method: 'POST',
          credentials: 'include',
        })
          .then(() => {
            queryClient.invalidateQueries({ 
              queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] 
            });
          })
          .catch(error => {
            console.error('[MEDICATION] Error recalculating inventory:', error);
          });
      }
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
      // Invalidate both query keys to refetch with updated time markers and lock status
      if (anesthesiaRecordId) {
        // Invalidate record-specific query (for lock status) - use exact key format used by consumers
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        // Invalidate surgery-based query (for time markers)
        const surgeryId = data.surgeryId;
        if (surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
        }
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
  
  // Mutation for locking the anesthesia record
  const lockRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const response = await apiRequest('POST', `/api/anesthesia/records/${recordId}/lock`);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[RECORD_LOCK] Record locked successfully', data);
      if (anesthesiaRecordId) {
        // Use string template format to match consumer query keys
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        // Also invalidate surgery-based query
        if (data.surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${data.surgeryId}`] });
        }
      }
      toast({
        title: t('anesthesia.record.locked', 'Record Locked'),
        description: t('anesthesia.record.lockedDescription', 'The anesthesia record has been locked. Unlock to make changes.'),
      });
    },
    onError: (error) => {
      console.error('[RECORD_LOCK] Lock failed', error);
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('anesthesia.record.lockFailed', 'Failed to lock record'),
        variant: "destructive",
      });
    },
  });
  
  // Mutation for unlocking the anesthesia record
  const unlockRecordMutation = useMutation({
    mutationFn: async ({ recordId, reason }: { recordId: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/anesthesia/records/${recordId}/unlock`, { reason });
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[RECORD_UNLOCK] Record unlocked successfully', data);
      if (anesthesiaRecordId) {
        // Use string template format to match consumer query keys
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        if (data.surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${data.surgeryId}`] });
        }
      }
      toast({
        title: t('anesthesia.record.unlocked', 'Record Unlocked'),
        description: t('anesthesia.record.unlockedDescription', 'You can now make changes. Remember to lock when done.'),
      });
    },
    onError: (error) => {
      console.error('[RECORD_UNLOCK] Unlock failed', error);
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('anesthesia.record.unlockFailed', 'Failed to unlock record'),
        variant: "destructive",
      });
    },
  });


  // Mutation hooks for ventilation mode
  const createVentilationMode = useCreateVentilationMode(anesthesiaRecordId);
  const updateVentilationMode = useUpdateVentilationMode(anesthesiaRecordId);
  const deleteVentilationMode = useDeleteVentilationMode(anesthesiaRecordId);

  // Mutation hooks for events
  const createEvent = useCreateEvent(anesthesiaRecordId || '');
  const updateEvent = useUpdateEvent(anesthesiaRecordId || '');
  const deleteEvent = useDeleteEvent(anesthesiaRecordId || '');

  // Mutation hooks for medications
  const createMedication = useCreateMedication(anesthesiaRecordId);
  const updateMedication = useUpdateMedication(anesthesiaRecordId);
  const deleteMedication = useDeleteMedication(anesthesiaRecordId);
  
  // Medication reorder mutation
  const reorderMedsMutation = useMutation({
    mutationFn: async (items: Array<{ itemId: string; sortOrder: number }>) => {
      if (!activeHospital?.id) throw new Error("No active hospital");
      await apiRequest('POST', '/api/anesthesia/items/reorder', { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospital?.id}`] });
      toast({
        title: t("common.success"),
        description: t("anesthesia.settings.reorderSuccess"),
      });
    },
    onError: (error) => {
      console.error('Failed to reorder items:', error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("anesthesia.settings.reorderError"),
        variant: "destructive",
      });
    },
  });
  
  // Mutation hooks for output
  const createOutput = useCreateOutput(anesthesiaRecordId);
  const updateOutput = useUpdateOutput(anesthesiaRecordId);
  const deleteOutput = useDeleteOutput(anesthesiaRecordId);
  
  // State for collapsible parent swimlanes
  // Initialize with all parent swimlanes expanded to ensure BIS/TOF are visible
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('collapsedSwimlanes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      } catch {
        return new Set();
      }
    }
    return new Set();
  });
  
  // Function to toggle swimlane collapsed state
  const toggleSwimlane = (swimlaneId: string) => {
    setCollapsedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(swimlaneId)) {
        next.delete(swimlaneId);
      } else {
        next.add(swimlaneId);
      }
      // Persist to localStorage
      localStorage.setItem('collapsedSwimlanes', JSON.stringify(Array.from(next)));
      return next;
    });
  };
  
  // State for unlock dialog
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  
  // State for medication reorder mode
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderedItemsByFolder, setReorderedItemsByFolder] = useState<Record<string, typeof anesthesiaItems>>({});
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  
  // DnD Kit sensors for reordering
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Enter reorder mode - group items by folder
  const enterReorderMode = () => {
    const itemsByFolder: Record<string, typeof anesthesiaItems> = {};
    
    // Group ALL items by folder, including those without administrationGroup
    anesthesiaItems.forEach(item => {
      const folderId = item.administrationGroup || 'unassigned';
      if (!itemsByFolder[folderId]) {
        itemsByFolder[folderId] = [];
      }
      itemsByFolder[folderId].push(item);
    });
    
    setReorderedItemsByFolder(itemsByFolder);
    setIsReorderMode(true);
  };
  
  // Cancel reorder mode
  const cancelReorderMode = () => {
    setIsReorderMode(false);
    setReorderedItemsByFolder({});
    setCollapsedFolders(new Set());
  };
  
  // Save reorder changes - folder-scoped sortOrder
  const saveReorderChanges = async () => {
    const updates: Array<{ itemId: string; sortOrder: number; folderId: string }> = [];
    
    Object.entries(reorderedItemsByFolder).forEach(([folderId, items]) => {
      items.forEach((item, index) => {
        updates.push({
          itemId: item.id,
          folderId,
          sortOrder: index, // folder-scoped: 0, 1, 2... within each folder
        });
      });
    });
    
    await reorderMedsMutation.mutateAsync(updates);
    setIsReorderMode(false);
    setReorderedItemsByFolder({});
    setCollapsedFolders(new Set());
  };
  
  // Handle drag end for reordering within a folder
  const handleDragEndInFolder = (folderId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setReorderedItemsByFolder((prev) => {
        const folderItems = prev[folderId] || [];
        const oldIndex = folderItems.findIndex((item) => item.id === active.id);
        const newIndex = folderItems.findIndex((item) => item.id === over.id);
        
        return {
          ...prev,
          [folderId]: arrayMove(folderItems, oldIndex, newIndex),
        };
      });
    }
  };
  
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
    addMedicationDose,
    addInfusionPoint,
    getActiveRateSession,
    getActiveFreeFlowSession,
    resetMedicationData,
  } = useMedicationState({
    doses: {},
    infusions: {},
    rateSessions: {},
    freeFlowSessions: {},
  });

  const [chartInitTime] = useState<number>(now || Date.now());

  const {
    currentTime,
    setCurrentTime,
    currentZoomStart,
    setCurrentZoomStart,
    currentZoomEnd,
    setCurrentZoomEnd,
    nowLinePosition,
    nowLineTransitionsEnabled,
    currentVitalsSnapInterval,
    setCurrentVitalsSnapInterval,
    currentDrugSnapInterval,
    isHistoricalRecord,
    shouldAutoRecenterView,
    contentBounds,
    graphicsRevision,
    setGraphicsRevision,
    zoomPercent,
    setZoomPercent,
    midnightLinePositions,
    handleChartReady,
    handleZoomIn,
    handleZoomOut,
    handlePanLeft,
    handlePanRight,
    handleResetZoom,
    viewportControllerRef,
    userPinnedViewportRef,
    initialZoomAppliedRef,
  } = useViewportController({
    chartRef,
    isChartReady,
    setIsChartReady,
    isMountedRef,
    data,
    now,
    anesthesiaRecordId,
    anesthesiaRecord,
    rateInfusionSessions,
    freeFlowSessions,
  });

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
  
  // Fetch positions and events from separate tables
  // Use staleTime: 0 and refetchOnMount to ensure fresh data on navigation
  const { data: apiPositions = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/positions/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  
  const { data: apiEvents = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/events/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  
  // NEW: Get mutation hooks for point-based CRUD
  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId);
  const addBPPointMutation = useAddBPPoint(anesthesiaRecordId);
  const updateVitalPointMutation = useUpdateVitalPoint(anesthesiaRecordId);
  const updateBPPointMutation = useUpdateBPPoint(anesthesiaRecordId);
  const deleteVitalPointMutation = useDeleteVitalPoint(anesthesiaRecordId);
  
  // Convert React Query snapshot to records format (with IDs)
  const vitalsRecords = useMemo(() => {
    return convertToRecordsFormat(clinicalSnapshot);
  }, [clinicalSnapshot]);
  
  // Use custom hook for vitals state management (fed from React Query)
  const {
    hrRecords,
    bpRecords,
    spo2Records,
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    hrRecordsRef,
    bpRecordsRef,
    spo2RecordsRef,
    setHrRecords,
    setBpRecords,
    setSpo2Records,
    resetVitalsData,
    addHrPoint,
    addBPPoint,
    addSpo2Point,
    updateHrPoint,
    updateBPPoint,
    updateSpo2Point,
  } = useVitalsState({
    hr: vitalsRecords.hr,
    bp: vitalsRecords.bp,
    spo2: vitalsRecords.spo2,
  });
  
  // Use custom hook for ventilation state management
  const {
    ventilationData,
    ventilationModeData,
    setVentilationData,
    setVentilationModeData,
    addVentilationPoint,
    addVentilationMode,
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
    if (!vitalsRecords) return;
    
    console.log('[VITALS-SYNC] Syncing vitals from React Query to local state', { 
      recordId: anesthesiaRecordId,
      hrCount: vitalsRecords.hr.length,
      bpCount: vitalsRecords.bp.length,
      spo2Count: vitalsRecords.spo2.length
    });
    
    // Always sync from React Query - it's the source of truth
    // This ensures optimistic updates from mutations propagate to the UI
    resetVitalsData({ 
      hr: vitalsRecords.hr, 
      bp: vitalsRecords.bp, 
      spo2: vitalsRecords.spo2 
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitalsRecords, anesthesiaRecordId]);
  
  // NEW: Auto-save removed - vitals are now saved immediately via point-based mutations
  // Each add/edit/delete operation triggers its own optimistic mutation with React Query
  // This eliminates the O(n²) snapshot aggregation that was blocking UI for 700-900ms


  // Auto-load medications from API data - React Query is the single source of truth
  // Always sync when data.medications changes (after mutations, cache invalidation, or record switch)
  useEffect(() => {
    // 🔥 FIX: Guard against React StrictMode timing issue
    // resetMedicationData can be undefined during first render due to StrictMode double-render
    if (!resetMedicationData) {
      return;
    }
    
    // Skip if items not loaded yet
    if (!anesthesiaItems || anesthesiaItems.length === 0) {
      return;
    }
    if (!data.medications) {
      return;
    }
    
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
    
    // Note: Events are already handled via data.events prop for timeline rendering
    // No need to process data.apiEvents separately for now
  }, [data.medications, anesthesiaItems, administrationGroups, anesthesiaRecordId, resetMedicationData]);

  // Event state management hook (heart rhythm, staff, position, BIS, TOF, VAS, Scores, events, time markers)
  const {
    heartRhythmData,
    staffData,
    positionData,
    bisData,
    tofData,
    vasData,
    scoresData,
    eventComments,
    timeMarkers,
    setHeartRhythmData,
    setStaffData,
    setPositionData,
    setBisData,
    setTofData,
    setVasData,
    setScoresData,
    setEventComments,
    setTimeMarkers,
    addHeartRhythm,
    addStaffEntry,
    addPosition,
    addBIS,
    addTOF,
    addVAS,
    addScore,
    addEvent,
    resetEventData,
  } = useEventState({
    timeMarkers: ANESTHESIA_TIME_MARKERS.map(marker => ({ ...marker, time: null })),
    bis: [],
    tof: [],
    vas: [],
    scores: [],
  });

  // Inventory commit state management (for X2/P safeguards)
  const inventoryCommitState = useInventoryCommitState(anesthesiaRecordId || null);

  // Load time markers from database when anesthesia record is fetched
  useEffect(() => {
    if (anesthesiaRecord?.timeMarkers && Array.isArray(anesthesiaRecord.timeMarkers)) {
      console.log('[TIME_MARKERS] Loading from database:', anesthesiaRecord.timeMarkers);
      setTimeMarkers(anesthesiaRecord.timeMarkers);
    }
  }, [anesthesiaRecord, setTimeMarkers]);

  // NEW: Sync heart rhythm data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const heartRhythm = snapshotData?.heartRhythm || [];
    
    if (heartRhythm.length > 0) {
      console.log('[RHYTHM-SYNC] Loading heart rhythm from snapshot:', heartRhythm.length, 'points');
      // Store as objects with ID to enable proper CRUD operations
      const rhythmEntries = heartRhythm.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setHeartRhythmData(rhythmEntries);
    } else {
      // Clear stale state when switching to record with no data
      setHeartRhythmData([]);
    }
  }, [clinicalSnapshot, setHeartRhythmData]);

  // NEW: Sync BIS data from clinical snapshot
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const bis = snapshotData?.bis || [];
    
    if (bis.length > 0) {
      console.log('[BIS-SYNC] Loading BIS from snapshot:', bis.length, 'points');
      const bisEntries = bis.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setBisData(bisEntries);
    } else {
      setBisData([]);
    }
  }, [clinicalSnapshot, setBisData]);

  // NEW: Sync TOF data from clinical snapshot
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const tof = snapshotData?.tof || [];
    
    if (tof.length > 0) {
      console.log('[TOF-SYNC] Loading TOF from snapshot:', tof.length, 'points');
      const tofEntries = tof.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
        percentage: point.percentage,
      }));
      setTofData(tofEntries);
    } else {
      setTofData([]);
    }
  }, [clinicalSnapshot, setTofData]);

  // NEW: Sync VAS data from clinical snapshot (PACU mode)
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const vas = snapshotData?.vas || [];
    
    if (vas.length > 0) {
      console.log('[VAS-SYNC] Loading VAS from snapshot:', vas.length, 'points');
      const vasEntries = vas.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setVasData(vasEntries);
    } else {
      setVasData([]);
    }
  }, [clinicalSnapshot, setVasData]);

  // NEW: Sync Scores data from clinical snapshot (PACU mode)
  useEffect(() => {
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const scores = snapshotData?.scores || [];
    
    if (scores.length > 0) {
      console.log('[SCORES-SYNC] Loading Scores from snapshot:', scores.length, 'points');
      const scoresEntries = scores.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        scoreType: point.scoreType,
        totalScore: point.totalScore,
        aldreteScore: point.aldreteScore,
        parsapScore: point.parsapScore,
      }));
      setScoresData(scoresEntries);
    } else {
      setScoresData([]);
    }
  }, [clinicalSnapshot, setScoresData]);

  // NEW: Sync ventilation mode data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    const ventilationModes = snapshotData?.ventilationModes || [];
    
    if (ventilationModes.length > 0) {
      console.log('[VENT-MODE-SYNC] Loading ventilation modes from snapshot:', ventilationModes.length, 'points');
      // Store as objects with ID to enable proper CRUD operations
      const modeEntries = ventilationModes.map((point: any) => ({
        id: point.id,
        timestamp: new Date(point.timestamp).getTime(),
        value: point.value,
      }));
      setVentilationModeData(modeEntries);
    } else {
      // Clear stale state when switching to record with no data
      setVentilationModeData([]);
    }
  }, [clinicalSnapshot, setVentilationModeData]);

  // NEW: Sync ventilation parameter data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    console.log('[VENT-PARAMS-SYNC] Snapshot data keys:', snapshotData ? Object.keys(snapshotData) : 'null');
    console.log('[VENT-PARAMS-SYNC] Raw pip:', snapshotData?.pip);
    console.log('[VENT-PARAMS-SYNC] Raw peep:', snapshotData?.peep);
    console.log('[VENT-PARAMS-SYNC] Raw etco2:', snapshotData?.etco2);
    
    // Extract all ventilation parameters
    const ventParams = {
      etCO2: snapshotData?.etco2 || [],
      pip: snapshotData?.pip || [],
      peep: snapshotData?.peep || [],
      tidalVolume: snapshotData?.tidalVolume || [],
      respiratoryRate: snapshotData?.respiratoryRate || [],
      minuteVolume: snapshotData?.minuteVolume || [],
      fiO2: snapshotData?.fio2 || [],
    };
    
    const totalPoints = Object.values(ventParams).reduce((sum, arr) => sum + arr.length, 0);
    console.log('[VENT-PARAMS-SYNC] Total ventilation points:', totalPoints);
    
    // Build complete ventData object with all keys (including empty arrays)
    // to ensure proper state structure when calling setVentilationData
    const ventData = {
      etCO2: ventParams.etCO2.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      pip: ventParams.pip.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      peep: ventParams.peep.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      tidalVolume: ventParams.tidalVolume.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      respiratoryRate: ventParams.respiratoryRate.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      minuteVolume: ventParams.minuteVolume.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
      fiO2: ventParams.fiO2.map((point: any) => [
        new Date(point.timestamp).getTime(),
        point.value,
      ] as [number, number]),
    };
    
    console.log('[VENT-PARAMS-SYNC] Total points:', totalPoints, 'Setting ventilationData:', ventData);
    setVentilationData(ventData);
  }, [clinicalSnapshot, setVentilationData]);

  // NEW: Sync output data from clinical snapshot
  useEffect(() => {
    // Wait for snapshot to load (undefined means loading, null/object means resolved)
    if (clinicalSnapshot === undefined) return;
    
    const snapshotData = clinicalSnapshot?.data as any;
    
    // Extract all output parameters
    const outputParams = {
      urine: snapshotData?.urine || [],
      blood: snapshotData?.blood || [],
      gastricTube: snapshotData?.gastricTube || [],
      drainage: snapshotData?.drainage || [],
      vomit: snapshotData?.vomit || [],
    };
    
    const totalPoints = Object.values(outputParams).reduce((sum, arr) => sum + arr.length, 0);
    
    if (totalPoints > 0) {
      console.log('[OUTPUT-SYNC] Loading output data from snapshot:', totalPoints, 'points');
      const outputDataEntries: any = {};
      
      for (const [key, points] of Object.entries(outputParams)) {
        if (points.length > 0) {
          // Store as objects with ID to enable proper CRUD operations
          outputDataEntries[key] = points.map((point: any) => ({
            id: point.id,
            timestamp: new Date(point.timestamp).getTime(),
            value: point.value,
          }));
        }
      }
      
      setOutputData(outputDataEntries);
    } else {
      // Clear stale state when switching to record with no data
      setOutputData({ urine: [], blood: [], gastricTube: [], drainage: [], vomit: [] });
    }
  }, [clinicalSnapshot, setOutputData]);

  // NEW: Sync position data from API
  useEffect(() => {
    if (apiPositions.length > 0) {
      console.log('[POSITION-SYNC] Loading positions from API:', apiPositions.length, 'entries');
      // Store as objects with ID to enable proper CRUD operations
      const positionEntries = apiPositions.map((pos: any) => ({
        id: pos.id,
        timestamp: new Date(pos.timestamp).getTime(),
        position: pos.position,
      }));
      setPositionData(positionEntries);
    } else {
      // Clear stale state when switching to record with no data
      setPositionData([]);
    }
  }, [apiPositions, setPositionData]);

  // NEW: Sync event comments from API
  useEffect(() => {
    console.log('[EVENTS-SYNC] apiEvents changed:', apiEvents?.length || 0, 'entries', apiEvents);
    if (apiEvents && apiEvents.length > 0) {
      console.log('[EVENTS-SYNC] Loading events from API:', apiEvents.length, 'entries');
      const eventEntries = apiEvents.map((event: any) => ({
        id: event.id,
        time: new Date(event.timestamp).getTime(),
        text: event.description || event.eventType, // Use description as text, fallback to eventType
        eventType: event.eventType, // Include eventType for icon rendering
        anesthesiaRecordId: event.anesthesiaRecordId,
      }));
      console.log('[EVENTS-SYNC] Mapped event entries:', eventEntries);
      setEventComments(eventEntries);
    } else {
      // Clear stale state when switching to record with no data
      console.log('[EVENTS-SYNC] Clearing event comments (no data)');
      setEventComments([]);
    }
  }, [apiEvents, setEventComments]);

  // UI state for heart rhythm dialogs and interactions
  const [showHeartRhythmDialog, setShowHeartRhythmDialog] = useState(false);
  const [pendingHeartRhythm, setPendingHeartRhythm] = useState<{ time: number } | null>(null);
  const [editingHeartRhythm, setEditingHeartRhythm] = useState<{ time: number; rhythm: string; index: number; id: string } | null>(null);
  const [heartRhythmInput, setHeartRhythmInput] = useState("");
  const [heartRhythmEditTime, setHeartRhythmEditTime] = useState<number>(0);

  // UI state for BIS dialogs and interactions
  const [showBISDialog, setShowBISDialog] = useState(false);
  const [pendingBIS, setPendingBIS] = useState<{ time: number } | null>(null);
  const [editingBIS, setEditingBIS] = useState<{ id: string; time: number; value: number; index: number } | null>(null);

  // UI state for TOF dialogs and interactions
  const [showTOFDialog, setShowTOFDialog] = useState(false);
  const [pendingTOF, setPendingTOF] = useState<{ time: number } | null>(null);
  const [editingTOF, setEditingTOF] = useState<{ id: string; time: number; value: string; percentage?: number; index: number } | null>(null);

  // UI state for VAS dialogs and interactions (PACU mode)
  const [showVASDialog, setShowVASDialog] = useState(false);
  const [pendingVAS, setPendingVAS] = useState<{ time: number } | null>(null);
  const [editingVAS, setEditingVAS] = useState<{ id: string; time: number; value: number; index: number } | null>(null);

  // UI state for Scores dialogs and interactions (PACU mode)
  const [showScoresDialog, setShowScoresDialog] = useState(false);
  const [pendingScore, setPendingScore] = useState<{ time: number } | null>(null);
  const [editingScore, setEditingScore] = useState<{ id: string; time: number; scoreType: 'aldrete' | 'parsap'; totalScore: number; aldreteScore?: any; parsapScore?: any; index: number } | null>(null);

  // UI state for position dialogs and interactions
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ time: number } | null>(null);
  const [editingPosition, setEditingPosition] = useState<{ id: string; time: number; position: string; index: number } | null>(null);

  // UI state for event comment dialogs and interactions
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<{ time: number } | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventComment | null>(null);
  const [eventEditTime, setEventEditTime] = useState<number>(Date.now());
  const [eventHoverInfo, setEventHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: EventComment; x: number; y: number } | null>(null);

  // State for medication dose edit dialog
  const [showMedicationEditDialog, setShowMedicationEditDialog] = useState(false);
  const [editingMedicationDose, setEditingMedicationDose] = useState<{ swimlaneId: string; time: number; dose: string; index: number; id: string } | null>(null);

  // State for ventilation value edit dialog
  const [showVentilationEditDialog, setShowVentilationEditDialog] = useState(false);
  const [editingVentilationValue, setEditingVentilationValue] = useState<{ paramKey: keyof typeof ventilationData; time: number; value: string; index: number; label: string; id: string } | null>(null);

  // State for ventilation mode edit dialog
  const [showVentilationModeEditDialog, setShowVentilationModeEditDialog] = useState(false);
  const [editingVentilationMode, setEditingVentilationMode] = useState<{ time: number; mode: string; index: number; id: string } | null>(null);

  // State for ventilation mode add dialog
  const [showVentilationModeAddDialog, setShowVentilationModeAddDialog] = useState(false);
  const [pendingVentilationMode, setPendingVentilationMode] = useState<{ time: number } | null>(null);

  // State for ventilation bulk entry dialog
  const [showVentilationBulkDialog, setShowVentilationBulkDialog] = useState(false);
  const [pendingVentilationBulk, setPendingVentilationBulk] = useState<{ 
    time: number;
    existingParams?: {
      pip?: number;
      peep?: number;
      tidalVolume?: number;
      respiratoryRate?: number;
      fio2?: number;
      etco2?: number;
      minuteVolume?: number;
    };
  } | null>(null);
  const [ventilationBulkHoverInfo, setVentilationBulkHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  
  // State for ventilation entry lane (params-only mode, no mode selection)
  const [ventilationEntrySkipMode, setVentilationEntrySkipMode] = useState(false);
  const [editingVentilationEntryTimestamp, setEditingVentilationEntryTimestamp] = useState<number | null>(null);
  
  // State for output bulk entry dialog
  const [showOutputBulkDialog, setShowOutputBulkDialog] = useState(false);
  const [pendingOutputBulk, setPendingOutputBulk] = useState<{ time: number } | null>(null);
  
  // State for output value add dialog (single value)
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [pendingOutputValue, setPendingOutputValue] = useState<{ paramKey: keyof typeof outputData; time: number; label: string } | null>(null);
  
  // State for output value edit dialog
  const [showOutputEditDialog, setShowOutputEditDialog] = useState(false);
  const [editingOutputValue, setEditingOutputValue] = useState<{ paramKey: keyof typeof outputData; time: number; value: string; index: number; label: string; id: string } | null>(null);
  
  const [infusionHoverInfo, setInfusionHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showInfusionDialog, setShowInfusionDialog] = useState(false);
  const [pendingInfusionValue, setPendingInfusionValue] = useState<{ swimlaneId: string; time: number; label: string; itemId?: string; administrationUnit?: string | null } | null>(null);
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
  const [pendingFreeFlowDose, setPendingFreeFlowDose] = useState<{ swimlaneId: string; time: number; label: string; administrationUnit?: string | null } | null>(null);
  const [freeFlowDoseInput, setFreeFlowDoseInput] = useState("");
  
  // State for free-flow stop/start-new dialog (scenario 2: running infusion clicked)
  const [showFreeFlowStopDialog, setShowFreeFlowStopDialog] = useState(false);
  const [pendingFreeFlowStop, setPendingFreeFlowStop] = useState<{ 
    session: FreeFlowSession; 
    clickTime: number; 
  } | null>(null);
  
  // State for free-flow resume dialog (scenario 3: stopped area clicked)
  const [showFreeFlowRestartDialog, setShowFreeFlowRestartDialog] = useState(false);
  const [pendingFreeFlowRestart, setPendingFreeFlowRestart] = useState<{ 
    previousSession: FreeFlowSession; 
    clickTime: number; 
  } | null>(null);
  
  // State for rate infusion stop/start-new dialog (running rate infusion clicked)
  const [showRateStopDialog, setShowRateStopDialog] = useState(false);
  const [pendingRateStop, setPendingRateStop] = useState<{ 
    session: any; // RateInfusionSession type defined below
    clickTime: number; 
  } | null>(null);
  
  // State for rate infusion resume dialog (stopped rate infusion clicked)
  const [showRateRestartDialog, setShowRateRestartDialog] = useState(false);
  const [pendingRateRestart, setPendingRateRestart] = useState<{ 
    previousSession: any; // RateInfusionSession type defined below
    clickTime: number; 
  } | null>(null);
  
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
    itemId?: string; // item ID for database mutation
    administrationUnit?: string | null; // unit for initial bolus display
  } | null>(null);
  const [customRateInput, setCustomRateInput] = useState("");
  
  // State for bulk vitals entry dialog (click on vitals chart without tool mode)
  const [showBulkVitalsDialog, setShowBulkVitalsDialog] = useState(false);
  const [bulkVitalsTime, setBulkVitalsTime] = useState<number>(0);
  
  // State for rate-controlled infusion management dialog (edit/stop/change existing rate)
  const [showRateManageDialog, setShowRateManageDialog] = useState(false);
  const [managingRate, setManagingRate] = useState<{
    swimlaneId: string;
    time: number;
    value: string;
    index: number;
    label: string;
    rateOptions?: string[]; // from defaultDose if available
    rateUnit?: string; // unit for rate display (e.g., ml/h, µg/kg/min)
    sessionId?: string; // medication record ID for the running session
    itemId?: string; // item ID for creating new records
    isRunning?: boolean; // whether the infusion is currently running
    administrationUnit?: string | null; // unit for initial bolus display
    ampuleUnit?: string | null; // unit for TCI actual amount entry (parsed from ampuleTotalContent)
  } | null>(null);
  const [rateManageTime, setRateManageTime] = useState<number>(0);
  const [rateManageInput, setRateManageInput] = useState("");
  
  // State for medication total edit dialog (editable pill for all medications)
  const [showTciAmountEditDialog, setShowTciAmountEditDialog] = useState(false);
  const [editingTciAmount, setEditingTciAmount] = useState<{
    stopRecordId: string; // Empty string means we need to create a new manual_total record
    currentAmount: string;
    unit: string;
    label: string;
    swimlaneId: string;
    itemId?: string; // For creating new manual_total records
    isManualOverride?: boolean; // Whether this is already a manual override
  } | null>(null);
  const [tciAmountEditInput, setTciAmountEditInput] = useState("");
  
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
  const [pendingMedicationDose, setPendingMedicationDose] = useState<{ swimlaneId: string; time: number; label: string; itemId: string } | null>(null);

  // State for administration group medication configuration dialog
  const [showMedicationConfigDialog, setShowMedicationConfigDialog] = useState(false);
  const [selectedAdminGroupForConfig, setSelectedAdminGroupForConfig] = useState<AdministrationGroup | null>(null);
  const [editingItemForConfig, setEditingItemForConfig] = useState<AnesthesiaItem | null>(null);
  const [adminGroupHoverInfo, setAdminGroupHoverInfo] = useState<{ x: number; y: number; groupName: string } | null>(null);
  
  // State for on-demand medication selection dialog
  const [showOnDemandDialog, setShowOnDemandDialog] = useState(false);
  const [selectedAdminGroupForOnDemand, setSelectedAdminGroupForOnDemand] = useState<AdministrationGroup | null>(null);

  // State for ventilation parameter entry
  const [ventilationHoverInfo, setVentilationHoverInfo] = useState<{ x: number; y: number; time: number; paramKey: keyof typeof ventilationData; label: string } | null>(null);
  const [showVentilationDialog, setShowVentilationDialog] = useState(false);
  const [pendingVentilationValue, setPendingVentilationValue] = useState<{ paramKey: keyof typeof ventilationData; time: number; label: string } | null>(null);

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
    pointId?: string;  // NEW: Capture point ID immediately when clicking
  } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // State for manual vitals entry dialog
  const [showManualVitalsDialog, setShowManualVitalsDialog] = useState(false);
  const [manualVitalsTime, setManualVitalsTime] = useState<number>(Date.now());
  const [manualVitalsInitialValues, setManualVitalsInitialValues] = useState<{
    hr?: number;
    sys?: number;
    dia?: number;
    spo2?: number;
  } | undefined>(undefined);

  // State for Events/Times sliding panel
  const [showEventsTimesPanel, setShowEventsTimesPanel] = useState(false);
  
  // Watch for external trigger to open events panel
  useEffect(() => {
    if (openEventsPanel !== undefined && openEventsPanel !== showEventsTimesPanel) {
      setShowEventsTimesPanel(openEventsPanel);
    }
  }, [openEventsPanel]);
  
  // Notify parent when events panel state changes
  useEffect(() => {
    onEventsPanelChange?.(showEventsTimesPanel);
  }, [showEventsTimesPanel]);

  // UI state for time markers (data managed by useEventState hook)
  const bulkEditPacuEndWasSetRef = useRef(false);
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


  // Group items by administration group and sort by sortOrder within each group
  const itemsByAdminGroup = useMemo(() => {
    const grouped: Record<string, AnesthesiaItem[]> = {};
    
    anesthesiaItems.forEach(item => {
      if (!item.administrationGroup) return; // Skip items without group
      
      if (!grouped[item.administrationGroup]) {
        grouped[item.administrationGroup] = [];
      }
      grouped[item.administrationGroup].push(item);
    });
    
    // Sort items by medicationSortOrder within each group (fallback to alphabetical if no sortOrder)
    Object.keys(grouped).forEach(groupName => {
      grouped[groupName].sort((a, b) => {
        const aOrder = a.medicationSortOrder ?? 999;
        const bOrder = b.medicationSortOrder ?? 999;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        // Fallback to alphabetical if sortOrder is the same
        return a.name.localeCompare(b.name);
      });
    });
    
    return grouped;
  }, [anesthesiaItems]);

  // Calculate max tracks needed for each free-flow swimlane
  const swimlaneTrackCounts = useMemo(() => {
    const trackCounts: Record<string, number> = {};
    const maxTime = data.endTime;
    
    Object.keys(freeFlowSessions).forEach(swimlaneId => {
      const sessions = freeFlowSessions[swimlaneId];
      if (sessions && sessions.length > 0) {
        trackCounts[swimlaneId] = calculateMaxTracks(sessions.map(s => ({ ...s, endTime: s.endTime ?? null })), maxTime);
      }
    });
    
    return trackCounts;
  }, [freeFlowSessions, data.endTime]);

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
      // Infusion (free-flow or rate-controlled): "Name (rate-type)"
      // Example: "Ringer (free-flow)" or "Remifentanil (μg/kg/min)"
      const rateInfo = isFreeFlow ? 'free-flow' : item.rateUnit;
      
      // For infusions, show ONLY the rate unit (free-flow or rate unit)
      if (rateInfo) {
        parts.push(`(${rateInfo})`);
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
      const groupItems = itemsByAdminGroup[group.id] || [];
      groupItems.forEach((item) => {
        const itemDisplayName = formatItemDisplayName(item);
        const medDrugName = extractDrugName(itemDisplayName);
        const score = calculateSimilarity(voiceDrugName, medDrugName);
        
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = {
            swimlaneId: `admingroup-${group.id}-item-${item.id}`,
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
    "Urine (ml)",
    "Blood (ml)",
    "Gastric Tube (ml)",
    "Drainage (ml)",
    "Vomit (ml)",
  ];

  // Default swimlane configuration - can be overridden via props
  // In PACU mode, show VAS and Scores instead of TOF
  const baseSwimlanes: SwimlaneConfig[] = [
    { id: "zeiten", label: t("anesthesia.timeline.times"), height: 50, colorLight: "rgba(243, 232, 255, 0.8)", colorDark: "hsl(270, 55%, 20%)" },
    { id: "ereignisse", label: t("anesthesia.timeline.events"), height: 48, colorLight: "rgba(219, 234, 254, 0.8)", colorDark: "hsl(210, 60%, 18%)" },
    // Conditionally show TOF (OR mode) or VAS/Scores (PACU mode)
    ...(isPacuMode ? [
      { id: "vas", label: "VAS", height: 38, colorLight: "rgba(254, 215, 215, 0.8)", colorDark: "hsl(0, 55%, 22%)" },
      { id: "scores", label: t("anesthesia.timeline.scores", "Scores"), height: 38, colorLight: "rgba(187, 247, 208, 0.8)", colorDark: "hsl(150, 55%, 22%)" },
    ] : [
      { id: "tof", label: "TOF", height: 38, colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" },
    ]),
    // Administration group lanes will be inserted dynamically after TOF or Scores
    { id: "herzrhythmus", label: t("anesthesia.timeline.heartRhythm"), height: 48, colorLight: "rgba(252, 231, 243, 0.8)", colorDark: "hsl(330, 50%, 20%)" },
    { id: "position", label: t("anesthesia.timeline.position"), height: 48, colorLight: "rgba(226, 232, 240, 0.8)", colorDark: "hsl(215, 20%, 25%)" },
    { id: "ventilation", label: t("anesthesia.timeline.ventilation"), height: 48, colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" },
    { id: "output", label: t("anesthesia.timeline.output"), height: 48, colorLight: "rgba(254, 226, 226, 0.8)", colorDark: "hsl(0, 60%, 25%)" },
    { id: "others", label: t("anesthesia.timeline.others"), height: 48, colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" },
  ];

  // Build active swimlanes with collapsible children
  const buildActiveSwimlanes = (): SwimlaneConfig[] => {
    if (swimlanes) return swimlanes; // Use custom if provided
    
    const lanes: SwimlaneConfig[] = [];
    const ventColor = { colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" };
    const medGroupColor = { colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" };
    
    for (const lane of baseSwimlanes) {
      lanes.push(lane);
      
      // Insert single "Medications" parent lane after TOF/Scores (before Heart Rhythm)
      // In PACU mode, insert after Scores; in OR mode, insert after TOF
      if ((isPacuMode && lane.id === "scores") || (!isPacuMode && lane.id === "tof")) {
        // Add single "Medications" parent lane
        lanes.push({
          id: "medikamente",
          label: t("anesthesia.timeline.medications"),
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
            const groupItems = itemsByAdminGroup[group.id] || [];
            groupItems.forEach((item) => {
              const swimlaneId = `admingroup-${group.id}-item-${item.id}`;
              
              // Calculate dynamic height for free-flow infusions based on parallel tracks
              let laneHeight = 38; // Default height
              const isFreeFlow = item.rateUnit === 'free';
              if (isFreeFlow) {
                const trackCount = swimlaneTrackCounts[swimlaneId] || 1;
                const TRACK_HEIGHT = 30; // Height per track
                laneHeight = Math.max(38, trackCount * TRACK_HEIGHT);
              }
              
              lanes.push({
                id: swimlaneId,
                label: formatItemDisplayName(item),
                height: laneHeight,
                ...medGroupColor,
                rateUnit: item.rateUnit ?? null,
                defaultDose: item.defaultDose ?? null,
                administrationUnit: item.administrationUnit ?? null,
                ampuleTotalContent: item.ampuleTotalContent ?? null,
                itemId: item.id,
                hierarchyLevel: 'item',
              });
            });
          });
        }
      }

      // Insert ventilation children after Ventilation parent (if not collapsed)
      if (lane.id === "ventilation" && !collapsedSwimlanes.has("ventilation")) {
        // Add the Parameter Entry Lane first (for quick bulk entry of ventilation values)
        lanes.push({
          id: "ventilation-entry",
          label: t("anesthesia.timeline.ventParams", "Vent.-Parameter"),
          height: 24,
          ...ventColor,
          hierarchyLevel: 'entry',
        });
        
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

      // Insert BIS child after Others parent (if not collapsed)
      // Note: TOF is now a standalone swimlane after Events
      if (lane.id === "others" && !collapsedSwimlanes.has("others")) {
        const othersColor = { colorLight: "rgba(233, 213, 255, 0.8)", colorDark: "hsl(280, 55%, 22%)" };
        const othersParams = ["BIS"];
        othersParams.forEach((paramName) => {
          lanes.push({
            id: paramName.toLowerCase(),
            label: `  ${paramName}`,
            height: 38,
            ...othersColor,
          });
        });
      }
    }
    
    return lanes;
  };

  const activeSwimlanes = useMemo(() => buildActiveSwimlanes(), [collapsedSwimlanes, swimlanes, administrationGroups, itemsByAdminGroup, swimlaneTrackCounts, isPacuMode]);

  // Keep the ref updated with latest swimlanes for PDF export
  useEffect(() => {
    activeSwimlaneRef.current = activeSwimlanes;
  }, [activeSwimlanes]);

  // Extract manual total overrides from medications data
  // These allow users to override the calculated cumulative dose with a manually entered value
  const manualTotals = useMemo(() => {
    if (!data.medications || !anesthesiaItems?.length || !administrationGroups?.length) {
      return {} as Record<string, ManualTotalRecord>;
    }
    const itemToSwimlane = buildItemToSwimlaneMap(anesthesiaItems, administrationGroups);
    return transformManualTotals(data.medications, itemToSwimlane);
  }, [data.medications, anesthesiaItems, administrationGroups]);

  // Calculate cumulative doses for each medication swimlane
  // Combines bolus doses, free-flow infusion doses, and rate-controlled infusion doses
  // If a manual_total override exists for a swimlane, use that instead of calculated value
  const cumulativeDoses = useMemo(() => {
    const doses: Record<string, { total: number; unit: string; isManualOverride?: boolean; manualRecordId?: string }> = {};
    
    // Helper to parse dose/rate value and extract numeric part
    const parseNumericValue = (valueStr: string): number => {
      if (!valueStr) return 0;
      // Remove units and parse number (handles "10mg", "10 mg", "10.5", etc.)
      const match = valueStr.match(/^([\d.,]+)/);
      if (match) {
        // Handle European number format (comma as decimal)
        return parseFloat(match[1].replace(',', '.')) || 0;
      }
      return 0;
    };
    
    // Helper to calculate dose from rate-controlled infusion segment
    // Returns dose in the base unit (e.g., ml, mg, µg)
    const calculateSegmentDose = (
      rate: string,
      rateUnit: string,
      durationMs: number,
      weight?: number
    ): { dose: number; baseUnit: string } => {
      const rateValue = parseNumericValue(rate);
      if (rateValue <= 0 || durationMs <= 0) return { dose: 0, baseUnit: '' };
      
      const durationMinutes = durationMs / (1000 * 60);
      const durationHours = durationMs / (1000 * 60 * 60);
      
      // Normalize rate unit to lowercase for matching
      const unitLower = (rateUnit || '').toLowerCase().trim();
      
      let dose = 0;
      let baseUnit = '';
      
      // Rate units: ml/h, mg/h, µg/h, µg/min, mg/min, µg/kg/min, mg/kg/h, ml/kg/h, etc.
      if (unitLower.includes('/h') || unitLower.includes('/hr')) {
        // Per hour rates
        if (unitLower.includes('/kg/')) {
          // Weight-based per hour (e.g., mg/kg/h, µg/kg/h, ml/kg/h)
          if (!weight || weight <= 0) return { dose: 0, baseUnit: '' };
          dose = rateValue * weight * durationHours;
        } else {
          // Simple per hour (e.g., ml/h, mg/h, µg/h)
          dose = rateValue * durationHours;
        }
        // Extract base unit (everything before /h or /kg/h)
        baseUnit = unitLower.replace(/\/kg\/h.*$/, '').replace(/\/h.*$/, '').trim();
      } else if (unitLower.includes('/min')) {
        // Per minute rates
        if (unitLower.includes('/kg/')) {
          // Weight-based per minute (e.g., µg/kg/min, mg/kg/min)
          if (!weight || weight <= 0) return { dose: 0, baseUnit: '' };
          dose = rateValue * weight * durationMinutes;
        } else {
          // Simple per minute (e.g., µg/min, mg/min, ml/min)
          dose = rateValue * durationMinutes;
        }
        // Extract base unit
        baseUnit = unitLower.replace(/\/kg\/min.*$/, '').replace(/\/min.*$/, '').trim();
      } else {
        // Unknown rate format, try to parse as simple rate per hour
        dose = rateValue * durationHours;
        baseUnit = unitLower.replace(/\/.*$/, '').trim();
      }
      
      // Normalize unit symbols
      if (baseUnit === 'μg' || baseUnit === 'ug' || baseUnit === 'mcg') baseUnit = 'µg';
      
      return { dose, baseUnit };
    };
    
    // Process bolus doses from medicationDoseData
    Object.entries(medicationDoseData).forEach(([swimlaneId, points]) => {
      if (!Array.isArray(points)) return;
      
      // Find the swimlane config to get the unit
      const swimlaneConfig = activeSwimlanes.find(s => s.id === swimlaneId);
      const unit = swimlaneConfig?.administrationUnit || '';
      
      let totalDose = 0;
      points.forEach((point) => {
        // MedicationDosePoint is [timestamp, dose, id, note]
        if (Array.isArray(point) && point.length >= 2) {
          totalDose += parseNumericValue(point[1] as string);
        }
      });
      
      if (totalDose > 0) {
        if (!doses[swimlaneId]) {
          doses[swimlaneId] = { total: 0, unit };
        }
        doses[swimlaneId].total += totalDose;
      }
    });
    
    // Process free-flow infusion doses
    Object.entries(freeFlowSessions).forEach(([swimlaneId, sessions]) => {
      if (!Array.isArray(sessions)) return;
      
      const swimlaneConfig = activeSwimlanes.find(s => s.id === swimlaneId);
      const unit = swimlaneConfig?.administrationUnit || '';
      
      sessions.forEach((session) => {
        if (session.dose) {
          const doseValue = parseNumericValue(session.dose);
          if (doseValue > 0) {
            if (!doses[swimlaneId]) {
              doses[swimlaneId] = { total: 0, unit };
            }
            doses[swimlaneId].total += doseValue;
          }
        }
      });
    });
    
    // Process rate-controlled infusion doses - calculate based on rate × duration
    // For TCI: use actualAmountUsed from infusion_stop record instead of rate calculation
    Object.entries(rateInfusionSessions).forEach(([swimlaneId, sessions]) => {
      if (!Array.isArray(sessions)) return;
      
      const swimlaneConfig = activeSwimlanes.find(s => s.id === swimlaneId);
      const unit = swimlaneConfig?.administrationUnit || '';
      const isTciMode = swimlaneConfig?.rateUnit === 'TCI';
      
      sessions.forEach((session) => {
        if (!session.segments || !Array.isArray(session.segments)) return;
        
        const sessionStartTime = session.startTime || (session.segments[0]?.startTime);
        const sessionEndTime = session.endTime || (session.state === 'running' ? currentTime : null);
        
        if (!sessionStartTime) return;
        
        let sessionTotalDose = 0;
        let derivedUnit = ''; // Start empty, derive from rate unit
        
        // TCI: If stopped and has actualAmountUsed, use that directly
        if (isTciMode && session.actualAmountUsed && session.endTime) {
          const actualDose = parseNumericValue(session.actualAmountUsed);
          if (actualDose > 0) {
            // Parse unit from actualAmountUsed if present (e.g., "150 mg" → "mg")
            const unitMatch = session.actualAmountUsed.match(/[\d.,]+\s*(.+)/);
            const actualUnit = unitMatch ? unitMatch[1].trim() : unit;
            
            if (!doses[swimlaneId]) {
              doses[swimlaneId] = { total: 0, unit: actualUnit };
            }
            doses[swimlaneId].total += actualDose;
          }
          return; // Skip rate × duration calculation for TCI
        }
        
        // TCI running: skip calculation (will show "Running" badge instead)
        if (isTciMode && !session.endTime) {
          return;
        }
        
        // Non-TCI: Calculate dose for each segment
        session.segments.forEach((segment, index) => {
          const segmentStart = segment.startTime;
          
          // Determine segment end time:
          // - If there's a next segment, use its start time
          // - Otherwise, use session end time or current time (if running)
          let segmentEnd: number;
          if (index < session.segments.length - 1) {
            segmentEnd = session.segments[index + 1].startTime;
          } else if (sessionEndTime) {
            segmentEnd = sessionEndTime;
          } else if (session.state === 'running') {
            segmentEnd = currentTime;
          } else {
            return; // Can't determine end time
          }
          
          const durationMs = segmentEnd - segmentStart;
          if (durationMs <= 0) return;
          
          const { dose, baseUnit } = calculateSegmentDose(
            segment.rate,
            segment.rateUnit,
            durationMs,
            patientWeight
          );
          
          if (dose > 0) {
            sessionTotalDose += dose;
            if (baseUnit && !derivedUnit) {
              derivedUnit = baseUnit;
            }
          }
        });
        
        // Add initial bolus to session total if present
        if (session.initialBolus) {
          const bolusValue = parseNumericValue(session.initialBolus);
          if (bolusValue > 0) {
            sessionTotalDose += bolusValue;
          }
        }
        
        if (sessionTotalDose > 0) {
          if (!doses[swimlaneId]) {
            // Use derived unit from rate calculation, fallback to administrationUnit
            doses[swimlaneId] = { total: 0, unit: derivedUnit || unit };
          } else if (derivedUnit && !doses[swimlaneId].unit) {
            // Update unit if we derived one and none was set
            doses[swimlaneId].unit = derivedUnit;
          }
          doses[swimlaneId].total += sessionTotalDose;
        }
      });
    });
    
    // Apply manual total overrides - these take precedence over calculated values
    Object.entries(manualTotals).forEach(([swimlaneId, manualRecord]) => {
      if (manualRecord.dose > 0) {
        const swimlaneConfig = activeSwimlanes.find(s => s.id === swimlaneId);
        const unit = manualRecord.unit || swimlaneConfig?.administrationUnit || '';
        doses[swimlaneId] = { 
          total: manualRecord.dose, 
          unit,
          isManualOverride: true,
          manualRecordId: manualRecord.recordId,
        };
      }
    });
    
    return doses;
  }, [medicationDoseData, freeFlowSessions, rateInfusionSessions, activeSwimlanes, currentTime, patientWeight, manualTotals]);

  // Compute unique timestamps from ventilation parameter data for the entry lane markers
  const ventilationEntryTimestamps = useMemo(() => {
    const timestampSet = new Set<number>();
    
    // Iterate over all ventilation parameters and collect unique timestamps
    if (ventilationData && typeof ventilationData === 'object') {
      const keys = Object.keys(ventilationData);
      console.log('[VENT-ENTRY] Computing timestamps from ventilationData, keys:', keys);
      
      Object.entries(ventilationData).forEach(([key, points]: [string, any]) => {
        if (Array.isArray(points)) {
          console.log(`[VENT-ENTRY] Processing ${key}: ${points.length} points`);
          points.forEach((point) => {
            // Format: [timestamp, value]
            if (Array.isArray(point) && point.length >= 2) {
              timestampSet.add(point[0]);
            }
          });
        }
      });
    } else {
      console.log('[VENT-ENTRY] ventilationData is empty or not an object:', ventilationData);
    }
    
    const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);
    console.log('[VENT-ENTRY] Unique timestamps:', sortedTimestamps.length, sortedTimestamps.slice(0, 5));
    
    // Sort timestamps in ascending order
    return sortedTimestamps;
  }, [ventilationData]);

  // Handle editing vital values
  const handleSaveEdit = async (newValue: number) => {
    console.log('[EDIT] handleSaveEdit called:', { newValue, editingValue, anesthesiaRecordId, hasClinicalSnapshot: !!clinicalSnapshot });
    
    if (!editingValue || !anesthesiaRecordId) {
      console.log('[EDIT] Bailing out - missing editingValue or anesthesiaRecordId');
      return;
    }
    
    if (!canWrite) {
      toast({
        title: t('common.recordLocked', 'Record locked'),
        description: t('common.cannotModifyLocked', 'Cannot modify a locked record'),
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }

    const { type, time, originalTime } = editingValue;
    const pointId = editingValue.pointId;

    // Mutations handle optimistic updates via query cache
    // Local state syncs from query cache via useEffect (single source of truth)
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

    console.log('[EDIT] Using captured point ID:', { type, pointId, timestamp, updatedVitals });

    if (!pointId) {
      console.error('[EDIT] No point ID available - was not captured on click:', { type });
      toast({
        title: "Error updating vital",
        description: "Could not locate vital point. Please try clicking the point again.",
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }

    // Persist update to database using React Query mutation
    if (type === 'hr' || type === 'spo2') {
      console.log('[EDIT] Calling updateVitalPointMutation with value:', newValue);
      updateVitalPointMutation.mutate({
        pointId,
        timestamp: timestamp.toISOString(),
        value: newValue,
      });
    } else if (type === 'sys' || type === 'dia') {
      console.log('[EDIT] Calling updateBPPointMutation with BP values:', { sys: updatedVitals.sysBP, dia: updatedVitals.diaBP });
      updateBPPointMutation.mutate({
        pointId,
        timestamp: timestamp.toISOString(),
        sys: updatedVitals.sysBP,
        dia: updatedVitals.diaBP,
      });
    }

    setEditDialogOpen(false);
    setEditingValue(null);
  };

  const handleDeleteValue = async () => {
    if (!editingValue || !anesthesiaRecordId) return;
    
    if (!canWrite) {
      toast({
        title: t('common.recordLocked', 'Record locked'),
        description: t('common.cannotModifyLocked', 'Cannot modify a locked record'),
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }

    const { type, time, originalTime } = editingValue;
    const pointId = editingValue.pointId;

    // Validate we have a point ID
    if (!pointId) {
      console.error('[DELETE] No point ID available for deletion');
      toast({
        title: "Error deleting vital",
        description: "Point ID is missing",
        variant: "destructive",
      });
      setEditDialogOpen(false);
      setEditingValue(null);
      return;
    }

    // Use React Query delete mutation with point ID
    // The mutation handles optimistic updates via query cache
    // Local state syncs from query cache via useEffect (single source of truth)
    deleteVitalPointMutation.mutate(pointId);

    setEditDialogOpen(false);
    setEditingValue(null);
  };

  // Handle saving manual vitals entry
  const handleManualVitalsSave = (data: {
    hr?: number;
    sys?: number;
    dia?: number;
    spo2?: number;
    time: number;
  }) => {
    if (!anesthesiaRecordId) return;
    if (!canWrite) {
      toast({
        title: t('common.recordLocked', 'Record locked'),
        description: t('common.cannotModifyLocked', 'Cannot modify a locked record'),
        variant: "destructive",
      });
      return;
    }

    const timestamp = new Date(data.time).toISOString();

    // Mutations handle optimistic updates via query cache
    // Local state syncs from query cache via useEffect (single source of truth)
    
    // Save HR if provided
    if (data.hr !== undefined) {
      addVitalPointMutation.mutate({
        vitalType: 'hr',
        timestamp,
        value: data.hr,
      });
    }

    // Save SpO2 if provided (backend persistence)
    if (data.spo2 !== undefined) {
      addVitalPointMutation.mutate({
        vitalType: 'spo2',
        timestamp,
        value: data.spo2,
      });
    }

    // Save BP if both sys and dia are provided (backend persistence)
    if (data.sys !== undefined && data.dia !== undefined) {
      addBPPointMutation.mutate({
        timestamp,
        sys: data.sys,
        dia: data.dia,
      });
    }

    toast({
      title: "Vitals added",
      description: "Manual vital signs have been recorded",
      duration: 2000,
    });
  };

  // Handle clicking on Zeiten swimlane to place next time marker or edit existing
  const handleZeitenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canWrite) return; // Silently ignore clicks on locked records
    
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
    
    const nextMarker = timeMarkers[nextMarkerIndex];

    if (nextMarker.code === 'P') {
      const stoppedInfusions: string[] = [];
      Object.entries(rateInfusionSessions).forEach(([swimlaneId, sessions]) => {
        if (Array.isArray(sessions)) {
          sessions.forEach(session => {
            if (session.state === 'running' && session.id) {
              stoppedInfusions.push(session.label || swimlaneId);
              updateMedication.mutate({
                id: session.id,
                endTimestamp: new Date(currentTime),
              });
            }
          });
        }
      });
      Object.entries(freeFlowSessions).forEach(([swimlaneId, sessions]) => {
        if (Array.isArray(sessions)) {
          sessions.forEach(session => {
            if (!session.endTime && session.id) {
              stoppedInfusions.push(swimlaneId);
              updateMedication.mutate({
                id: session.id,
                endTimestamp: new Date(currentTime),
              });
            }
          });
        }
      });
      if (stoppedInfusions.length > 0) {
        console.log('[P_CHECK] Auto-stopped running infusions (swimlane click):', stoppedInfusions);
        toast({
          title: t('anesthesia.pacuEnd.infusionsStopped', 'Infusions stopped'),
          description: t('anesthesia.pacuEnd.autoStoppedInfusions', '{{count}} running infusion(s) automatically stopped', { count: stoppedInfusions.length }),
        });
      }

      if (inventoryCommitState.hasPendingCommits) {
        console.log('[P_CHECK] Blocking PACU End (swimlane click) - pending commits exist');
        toast({
          title: t('anesthesia.pacuEnd.cannotSetTitle', 'Cannot set PACU End'),
          description: t('anesthesia.pacuEnd.commitInventoryFirst', 'Please commit all inventory items before marking PACU End.'),
          variant: "destructive",
        });
        return;
      }
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
    if (!canWrite) return; // Ignore updates on locked records
    
    if (editingTimeMarker.marker.code === 'P') {
      const stoppedInfusions: string[] = [];
      Object.entries(rateInfusionSessions).forEach(([swimlaneId, sessions]) => {
        if (Array.isArray(sessions)) {
          sessions.forEach(session => {
            if (session.state === 'running' && session.id) {
              stoppedInfusions.push(session.label || swimlaneId);
              updateMedication.mutate({
                id: session.id,
                endTimestamp: new Date(currentTime),
              });
            }
          });
        }
      });
      Object.entries(freeFlowSessions).forEach(([swimlaneId, sessions]) => {
        if (Array.isArray(sessions)) {
          sessions.forEach(session => {
            if (!session.endTime && session.id) {
              stoppedInfusions.push(swimlaneId);
              updateMedication.mutate({
                id: session.id,
                endTimestamp: new Date(currentTime),
              });
            }
          });
        }
      });
      if (stoppedInfusions.length > 0) {
        console.log('[P_CHECK] Auto-stopped running infusions (edit marker dialog):', stoppedInfusions);
        toast({
          title: t('anesthesia.pacuEnd.infusionsStopped', 'Infusions stopped'),
          description: t('anesthesia.pacuEnd.autoStoppedInfusions', '{{count}} running infusion(s) automatically stopped', { count: stoppedInfusions.length }),
        });
      }

      if (inventoryCommitState.hasPendingCommits) {
        console.log('[P_CHECK] Blocking PACU End (edit marker dialog) - pending commits exist');
        toast({
          title: t('anesthesia.pacuEnd.cannotSetTitle', 'Cannot set PACU End'),
          description: t('anesthesia.pacuEnd.commitInventoryFirst', 'Please commit all inventory items before marking PACU End.'),
          variant: "destructive",
        });
        return;
      }
    }

    const updated = [...timeMarkers];
    updated[editingTimeMarker.index] = { ...updated[editingTimeMarker.index], time: newTime };
    setTimeMarkers(updated);
    
    // Update the editing state with the new time so the dialog shows the updated value
    setEditingTimeMarker({
      ...editingTimeMarker,
      marker: { ...editingTimeMarker.marker, time: newTime }
    });

    // Save to database immediately (auto-save on each adjustment)
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
    if (!canWrite) return; // Ignore deletes on locked records
    
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
  // NOTE: Undo functionality disabled - React Query mutations handle optimistic updates
  // and automatic rollback on errors. To properly implement undo with the new ID-based
  // system, we would need to track point IDs in lastAction.
  const handleUndo = () => {
    if (!lastAction) return;
    
    console.log('[UNDO] Undo functionality disabled with mutation-based architecture');
    toast({
      title: "Undo not available",
      description: "Use the edit/delete dialogs to modify vitals",
      variant: "default",
    });
    
    setLastAction(null);
  };

  // Update dataZoom xAxisIndex when swimlane structure changes
  // CRITICAL: Must wait for chart to have matching grids/xAxes before updating xAxisIndex
  // Otherwise ECharts throws "coordinateSystem" errors when series reference non-existent grids
  useEffect(() => {
    if (!isChartReady) return;
    if (!isMountedRef.current) return;
    
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    let rafId: number | null = null;
    let attempts = 0;
    const maxAttempts = 10;

    const tryUpdateDataZoom = () => {
      if (!isMountedRef.current) return;
      
      try {
        const numGrids = activeSwimlanes.length + 1; // +1 for vitals grid
        const currentOption = chart.getOption() as any;
        if (!currentOption) return;
        
        // CRITICAL GUARD: Wait for chart to have the expected number of xAxes
        // If counts don't match, the chart hasn't processed the new option yet
        const xAxisCount = Array.isArray(currentOption.xAxis) ? currentOption.xAxis.length : 0;
        
        if (xAxisCount !== numGrids) {
          // Chart grids not yet synchronized - retry with RAF
          attempts++;
          if (attempts < maxAttempts) {
            rafId = requestAnimationFrame(tryUpdateDataZoom);
          }
          return;
        }
        
        const currentDataZoom = currentOption.dataZoom?.[0];
        
        // Only update if xAxisIndex doesn't already match
        const currentXAxisIndex = currentDataZoom?.xAxisIndex || [];
        const expectedXAxisIndex = Array.from({ length: xAxisCount }, (_, i) => i);
        const indexMatches = Array.isArray(currentXAxisIndex) && 
          currentXAxisIndex.length === expectedXAxisIndex.length &&
          currentXAxisIndex.every((v: number, i: number) => v === expectedXAxisIndex[i]);
        
        if (!indexMatches) {
          // Preserve current zoom state - use defaults only if explicitly set
          const hasZoomState = currentDataZoom?.start !== undefined && currentDataZoom?.end !== undefined;
          chart.setOption({
            dataZoom: [{
              xAxisIndex: expectedXAxisIndex,
              // Only include start/end if they were explicitly set, otherwise let the viewport controller handle it
              ...(hasZoomState ? { start: currentDataZoom.start, end: currentDataZoom.end } : {}),
            }]
          });
        }
      } catch (error) {
        console.warn('[TIMELINE] Error updating dataZoom:', error);
      }
    };

    // Use RAF to ensure chart has processed option changes first
    rafId = requestAnimationFrame(tryUpdateDataZoom);
    
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeSwimlanes, isChartReady]);


  // Add click handler for editing data points and manual entry
  useEffect(() => {
    if (!isChartReady) return;
    
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleChartClick = (params: any) => {
      // Don't handle clicks when actively placing new values
      if (activeToolMode) return;
      // Don't allow edits on locked records
      if (!canWrite) return;

      // Handle clicks on scatter/custom data points
      if (params.componentType === 'series' && (params.seriesType === 'scatter' || params.seriesType === 'custom')) {
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
          // CRITICAL FIX: Capture point ID from clinical snapshot when clicking
          let pointId: string | undefined;
          if (type === 'hr') {
            pointId = clinicalSnapshot?.data?.hr?.[index]?.id;
          } else if (type === 'sys' || type === 'dia') {
            pointId = clinicalSnapshot?.data?.bp?.[index]?.id;
          } else if (type === 'spo2') {
            pointId = clinicalSnapshot?.data?.spo2?.[index]?.id;
          }

          console.log('[CLICK] Captured point for editing:', { type, index, pointId, timestamp, value });
          
          setEditingValue({ type, time: timestamp, value, index, originalTime: timestamp, pointId });
          setEditDialogOpen(true);
        }
      } 
      // Handle clicks on empty areas of vitals chart for manual entry
      else if (params.componentType === 'xAxis' || params.componentType === 'yAxis' || !params.componentType) {
        // Calculate clicked time based on mouse position
        const clickedTime = params.value || currentTime;
        setManualVitalsTime(clickedTime);
        setShowManualVitalsDialog(true);
      }
    };

    chart.on('click', handleChartClick);
    return () => {
      // Don't access chart if component is unmounted - chart is already disposed
      if (!isMountedRef.current) return;
      try {
        const currentChart = chartRef.current?.getEchartsInstance();
        if (currentChart) {
          currentChart.off('click', handleChartClick);
        }
      } catch (error) {
        // Suppress warning - chart may already be disposed during navigation
      }
    };
  }, [chartRef, activeToolMode, hrDataPoints, bpDataPoints, spo2DataPoints, clinicalSnapshot, currentTime, canWrite, isChartReady]);

  // Note: All timeline values (ventilation modes, parameters, medication doses, events) are now
  // rendered as DOM overlays for reliable click handling and scrolling. No ECharts graphics needed.

  const option = useMemo(() => {
    // Use centralized chart layout constants
    const { VITALS_TOP, VITALS_HEIGHT, SWIMLANE_START, GRID_LEFT, GRID_RIGHT } = CHART_LAYOUT;

    // Validate data range - use safe defaults if data is invalid
    // This prevents coordinateSystem errors when chart renders before data is loaded
    const safeStartTime = isFinite(data.startTime) && data.startTime > 0 ? data.startTime : Date.now() - 60 * 60 * 1000;
    const safeEndTime = isFinite(data.endTime) && data.endTime > safeStartTime ? data.endTime : safeStartTime + 60 * 60 * 1000;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || safeEndTime; // Use provided "now" or fall back to endTime
    
    // Initial view: 60-minute window (1 hour) from -30min to +30min around NOW
    const initialStartTime = currentTime - THIRTY_MINUTES;
    const initialEndTime = currentTime + THIRTY_MINUTES;
    
    // Calculate initial zoom percentages for dataZoom (same logic as Reset button)
    const fullRange = safeEndTime - safeStartTime;
    let initialZoomStart = 0;
    let initialZoomEnd = 100;
    if (fullRange > 0) {
      // Clamp to data bounds while preserving window size
      let viewStart = initialStartTime;
      let viewEnd = initialEndTime;
      const targetWindow = viewEnd - viewStart;
      
      if (viewStart < safeStartTime) {
        viewStart = safeStartTime;
        viewEnd = Math.min(safeEndTime, viewStart + targetWindow);
      }
      if (viewEnd > safeEndTime) {
        viewEnd = safeEndTime;
        viewStart = Math.max(safeStartTime, viewEnd - targetWindow);
      }
      
      initialZoomStart = Math.max(0, Math.min(100, ((viewStart - safeStartTime) / fullRange) * 100));
      initialZoomEnd = Math.max(0, Math.min(100, ((viewEnd - safeStartTime) / fullRange) * 100));
    }

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
        lane.hierarchyLevel === 'group' // Medication group headers
      );
      
      return {
        type: "time" as const,
        gridIndex,
        min: safeStartTime,
        max: safeEndTime,
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
      // Vitals Y-axes - generated by VitalsSwimlane utility function
      ...generateVitalsYAxes(isDark),
      // Swimlane y-axes
      ...activeSwimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
      })),
    ];

    // Series - generated by VitalsSwimlane utility function
    const series: any[] = [
      // Vitals series (HR, BP, SpO2)
      ...generateVitalsSeries(hrDataPoints, bpDataPoints, spo2DataPoints, isDark),
    ];

    // Add ventilation parameter text labels - generated by VentilationSwimlane utility function
    // CRITICAL: Filter out any series that reference grids that don't exist
    // This prevents "coordinateSystem" errors when chart renders before all data is loaded
    const maxGridIndex = grids.length - 1;
    const maxYAxisIndex = yAxes.length - 1;
    const ventilationParentIndex = activeSwimlanes.findIndex(lane => lane.id === 'ventilation');
    if (ventilationParentIndex !== -1 && !collapsedSwimlanes.has('ventilation')) {
      const ventSeries = generateVentilationSeries(ventilationData, ventilationParentIndex, isDark);
      // Only include series with valid grid indices
      const validVentSeries = ventSeries.filter((s: any) => {
        const xIdx = s.xAxisIndex ?? 0;
        const yIdx = s.yAxisIndex ?? 0;
        return xIdx <= maxGridIndex && yIdx <= maxYAxisIndex;
      });
      series.push(...validVentSeries);
    }

    // NOTE: Drag preview is now handled imperatively via updateDragPreviewImperatively()
    // to prevent duplicate icons during fast touch drags. The preview series is updated
    // directly via chartInstance.setOption() with requestAnimationFrame throttling.
    
    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    
    // Generate manual y-axis labels - generated by VitalsSwimlane utility function
    const yAxisLabels: any[] = generateVitalsYAxisLabels(VITALS_TOP, VITALS_HEIGHT, isDark);
    
    // ECharts automatically generates vertical grid lines via splitLine/minorSplitLine in x-axis config
    // No need for custom graphics anymore
    
    // Generate midnight timestamps for day separation
    const midnightTimestamps: number[] = [];
    const startDate = new Date(safeStartTime);
    startDate.setHours(0, 0, 0, 0);
    if (startDate.getTime() < safeStartTime) {
      startDate.setDate(startDate.getDate() + 1);
    }
    // Generate midnight markers for up to 365 days
    for (let d = startDate.getTime(); d <= safeEndTime && midnightTimestamps.length < 365; d += 24 * 60 * 60 * 1000) {
      midnightTimestamps.push(d);
    }

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
        // Only include initial zoom percentages on first render
        // After initial zoom is applied, omit start/end to preserve user zoom state
        ...(initialZoomAppliedRef.current ? {} : { start: initialZoomStart, end: initialZoomEnd }),
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
  // NOTE: Initial zoom is set in dataZoom to start with ±30 min window; subsequent zoom is managed imperatively
  }, [data, isDark, activeSwimlanes, now, currentTime, hrDataPoints, bpDataPoints, spo2DataPoints, ventilationData, medicationDoseData, pendingSysValue, bpEntryMode, collapsedSwimlanes]);

  // Calculate component height
  const VITALS_HEIGHT = 380;
  const VITALS_TOP_POS = 32; // Position accounting for sticky header (32px)
  const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
  const componentHeight = height ?? (VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight);

  // Touch gesture support for timeline navigation (swipe to pan, pinch to zoom)
  // Only enabled on touch devices, works alongside button controls
  useTimelineGestures(gestureContainerRef, {
    onPanLeft: handlePanLeft,
    onPanRight: handlePanRight,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
  }, { enabled: isTouchDevice && isChartReady });

  // Handle camera capture with AI-based detection
  const handleCameraCapture = async (imageBase64: string, timestamp: number) => {
    setIsProcessingImage(true);
    
    try {
      // Step 1: Preprocess image (resize and compress only)
      const { preprocessImage } = await import('@/lib/imagePreprocessing');
      const preprocessed = await preprocessImage(imageBase64, {
        maxWidth: 1280,
        quality: 0.85,
        grayscale: false,
      });
      
      // Step 2: Analyze with AI (always use AI for reliable recognition)
      const { validateVitalRange, clampToRange } = await import('@/lib/sevenSegmentOCR');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
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
      
      const finalData = {
        vitals: { hr, sysBP, diaBP, spo2 },
        ventilation: transformedVentilation,
        tof: aiData.tof,
        pumps: aiData.pumps,
        detectionMethod: isNewFormat ? aiData.detectionMethod : 'ai',
        ...(isNewFormat && {
          monitorType: aiData.monitorType,
          confidence: aiData.confidence,
          parameters: aiData.parameters,
        }),
      };
      
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
      
      // Process ventilation parameters - use bulk API for persistence
      const ventParams = parameters.filter((p: any) => p.category === 'ventilation');
      if (ventParams.length > 0 && anesthesiaRecordId) {
        // Build parameters object for bulk API
        const bulkParams: Record<string, number> = {};
        const addedVentParams: string[] = [];
        
        ventParams.forEach((param: any) => {
          if (typeof param.value !== 'number') {
            console.warn(`[Ventilation] Skipped ${param.standardName}: value type=${typeof param.value}`);
            return;
          }
          
          // Map standardName to API parameter key (matching bulk API format)
          if (param.standardName === 'EtCO2') {
            bulkParams.etco2 = param.value;
            addedVentParams.push('EtCO2');
          } else if (param.standardName === 'PIP') {
            bulkParams.pip = param.value;
            addedVentParams.push('PIP');
          } else if (param.standardName === 'PEEP') {
            bulkParams.peep = param.value;
            addedVentParams.push('PEEP');
          } else if (param.standardName === 'TidalVolume') {
            bulkParams.tidalVolume = param.value;
            addedVentParams.push('TidalVolume');
          } else if (param.standardName === 'RR') {
            bulkParams.respiratoryRate = param.value;
            addedVentParams.push('RR');
          } else if (param.standardName === 'MinuteVolume') {
            bulkParams.minuteVolume = param.value;
            addedVentParams.push('MinuteVolume');
          } else if (param.standardName === 'FiO2') {
            bulkParams.fio2 = param.value;
            addedVentParams.push('FiO2');
          }
        });
        
        // Calculate Minute Volume if not directly detected but RR and TidalVolume are present
        if (!bulkParams.minuteVolume && bulkParams.respiratoryRate && bulkParams.tidalVolume) {
          // MV = RR * TV / 1000 (convert ml to L)
          bulkParams.minuteVolume = Math.round((bulkParams.respiratoryRate * bulkParams.tidalVolume / 1000) * 10) / 10;
          addedVentParams.push('MinuteVolume (calc)');
        }
        
        // Call bulk API if we have any valid parameters
        if (Object.keys(bulkParams).length > 0) {
          try {
            await apiRequest('POST', '/api/anesthesia/ventilation/bulk', {
              anesthesiaRecordId,
              timestamp: new Date(timestamp).toISOString(),
              ventilationMode: null, // Don't change mode from AI capture
              parameters: bulkParams,
            });
            addedItems.push(...addedVentParams);
            
            // Invalidate the snapshot cache to refresh data
            queryClient.invalidateQueries({ 
              queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`] 
            });
          } catch (error) {
            console.error('[AI-Ventilation] Error saving via bulk API:', error);
            warningItems.push('Ventilation save failed');
          }
        }
      }
      
      // Process TOF parameters
      const tofParams = parameters.filter((p: any) => p.category === 'tof');
      if (tofParams.length > 0) {
        addedItems.push('TOF (logged)');
      }
    } else {
      // OLD FORMAT: Handle vitals using mutations
      if (vitals?.hr !== null && vitals?.hr !== undefined) {
        let hr = vitals.hr;
        if (!validateVitalRange('hr', hr)) {
          const clamped = clampToRange('hr', hr);
          warningItems.push(`HR ${hr}→${clamped} (out of range)`);
          hr = clamped;
        }
        addVitalPointMutation.mutate({
          vitalType: 'hr',
          timestamp: new Date(timestamp).toISOString(),
          value: hr
        });
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
        addBPPointMutation.mutate({
          timestamp: new Date(timestamp).toISOString(),
          sys: sysBP,
          dia: diaBP
        });
        addedItems.push('BP');
      }
      if (vitals?.spo2 !== null && vitals?.spo2 !== undefined) {
        let spo2 = vitals.spo2;
        if (!validateVitalRange('spo2', spo2)) {
          const clamped = clampToRange('spo2', spo2);
          warningItems.push(`SpO2 ${spo2}→${clamped}`);
          spo2 = clamped;
        }
        addVitalPointMutation.mutate({
          vitalType: 'spo2',
          timestamp: new Date(timestamp).toISOString(),
          value: spo2
        });
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
      const doseUpdates: Record<string, MedicationDosePoint[]> = {};
      
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
          doseUpdates[targetSwimlaneId].push([timestamp, drugCommand.dose, `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, null]);
          
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
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      description: `${managingFreeFlowSession.label} stopped at ${formatTime(new Date(stopTime))}`,
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
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  const handleSheetStop = async () => {
    if (!freeFlowSheetSession || !anesthesiaRecordId) return;
    
    const { swimlaneId, label, startTime, dose } = freeFlowSheetSession;
    const stopTime = currentTime;
    
    // Apply any edits first (if quantity or time was changed)
    const newDose = sheetDoseInput.trim() || dose;
    const newStartTime = sheetTimeInput || startTime;
    
    // Find the medication ID for this infusion start
    const medications = data.medications || [];
    const swimlaneParts = swimlaneId.split('-item-');
    const adminGroupPart = swimlaneParts[0];
    
    // Get the item ID from the swimlane
    const item = anesthesiaItems?.find(i => {
      const expectedSwimlaneId = `${adminGroupPart}-item-${i.id}`;
      return expectedSwimlaneId === swimlaneId;
    });
    
    if (!item) {
      console.error('[SHEET-STOP] Could not find item for swimlane:', swimlaneId);
      return;
    }
    
    // Find the medication record for this infusion start
    const medicationRecord = medications.find(med => 
      med.itemId === item.id && 
      med.type === 'infusion_start' &&
      new Date(med.timestamp).getTime() === (newStartTime || startTime)
    );
    
    if (!medicationRecord) {
      console.error('[SHEET-STOP] Could not find medication record for infusion');
      return;
    }
    
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
    
    // Save to database - update the medication record with endTimestamp
    try {
      await updateMedication.mutateAsync({
        id: medicationRecord.id,
        endTimestamp: new Date(stopTime),
      });
      
      toast({
        title: "Infusion stopped",
        description: `${label} stopped`,
      });
    } catch (error) {
      console.error('[SHEET-STOP] Error saving stop:', error);
      toast({
        title: "Error",
        description: "Failed to save infusion stop",
        variant: "destructive",
      });
      return;
    }
    
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
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
  const handleSheetStartNew = async () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    // 🔥 FIX: Use sheetTimeInput (clicked time) instead of currentTime
    const newStartTime = sheetTimeInput || currentTime;
    
    if (!newDose) {
      toast({
        title: "Quantity required",
        description: "Please enter the quantity for the new bag",
        variant: "destructive",
      });
      return;
    }
    
    // Get item ID from swimlane
    const item = anesthesiaItems.find(i => `admingroup-${i.administrationGroup}-item-${i.id}` === swimlaneId);
    if (!item) {
      toast({
        title: "Error",
        description: "Could not find medication item",
        variant: "destructive",
      });
      return;
    }
    
    // 🔥 FIX: Update local state optimistically
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // 🔥 FIX: Save to database using mutation
    console.log('[SHEET-START-NEW] Saving to database:', {
      anesthesiaRecordId,
      itemId: item.id,
      timestamp: new Date(newStartTime),
      dose: newDose,
    });
    
    try {
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId: anesthesiaRecordId!,
        itemId: item.id,
        timestamp: new Date(newStartTime),
        type: 'infusion_start' as const,
        rate: 'free',
        dose: newDose,
      });
      
      toast({
        title: "New bag started",
        description: `${label} - new bag with ${newDose}ml started`,
      });
    } catch (error) {
      console.error('[SHEET-START-NEW] Failed to save:', error);
      toast({
        title: "Error saving infusion",
        description: error instanceof Error ? error.message : "Failed to save",
        variant: "destructive",
      });
    }
    
    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet duplicate (create a parallel infusion)
  const handleSheetDuplicate = async () => {
    if (!freeFlowSheetSession) return;
    
    const { swimlaneId, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    const newStartTime = sheetTimeInput || currentTime; // Use selected time or current time
    
    if (!newDose) {
      toast({
        title: "Quantity required",
        description: "Please enter the quantity for the parallel infusion",
        variant: "destructive",
      });
      return;
    }
    
    // Get item ID from swimlane
    const item = anesthesiaItems.find(i => `admingroup-${i.administrationGroup}-item-${i.id}` === swimlaneId);
    if (!item) {
      toast({
        title: "Error",
        description: "Could not find medication item",
        variant: "destructive",
      });
      return;
    }
    
    // Update local state optimistically
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
    
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });
    
    // Save to database using mutation
    console.log('[SHEET-DUPLICATE] Saving parallel infusion to database:', {
      anesthesiaRecordId,
      itemId: item.id,
      timestamp: new Date(newStartTime),
      dose: newDose,
    });
    
    try {
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId: anesthesiaRecordId!,
        itemId: item.id,
        timestamp: new Date(newStartTime),
        type: 'infusion_start' as const,
        rate: 'free',
        dose: newDose,
      });
      
      toast({
        title: "Parallel infusion started",
        description: `${label} - parallel infusion with ${newDose}ml started`,
      });
    } catch (error) {
      console.error('[SHEET-DUPLICATE] Failed to save:', error);
      toast({
        title: "Error saving infusion",
        description: error instanceof Error ? error.message : "Failed to save",
        variant: "destructive",
      });
    }
    
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
      const sessions = prev[swimlaneId];
      if (!sessions || sessions.length === 0) return prev;
      
      const newSegment: RateInfusionSegment = {
        startTime: changeTime,
        rate: newRate,
        rateUnit: rateUnit,
      };
      
      const activeSession = sessions.find(s => s.state === 'running') || sessions[sessions.length - 1];
      return {
        ...prev,
        [swimlaneId]: sessions.map(s => s === activeSession ? {
          ...s,
          segments: [...s.segments, newSegment],
        } : s),
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
        [swimlaneId]: [...(prev[swimlaneId] || []), {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          swimlaneId,
          label,
          syringeQuantity: newQuantity || "50ml",
          startDose: newRate,
          segments: [newSegment],
          state: 'running' as const,
        }],
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
  const handleRateSelection = (selectedRate: string, initialBolus?: string) => {
    if (!pendingRateSelection) return;
    
    const { swimlaneId, time, label, itemId } = pendingRateSelection;
    
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
      [swimlaneId]: [...(prev[swimlaneId] || []), {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        swimlaneId,
        label,
        syringeQuantity: "50ml",
        startDose: selectedRate,
        segments: [newSegment],
        state: 'running' as const,
      }],
    }));
    
    // Persist to database
    if (itemId && anesthesiaRecordId) {
      createMedication.mutate({
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: 'infusion_start',
        rate: selectedRate,
        dose: selectedRate, // Syringe quantity
        initialBolus: initialBolus || undefined, // Initial bolus given at infusion start
      });
    }
    
    toast({
      title: "Rate set",
      description: `${label} set to ${selectedRate}${initialBolus ? ` with ${initialBolus} bolus` : ''}`,
    });
    
    // Reset dialog state
    setShowRateSelectionDialog(false);
    setPendingRateSelection(null);
    setCustomRateInput("");
  };

  // Handle custom rate entry (from rate selection dialog)
  const handleCustomRateEntry = (customRate: string, initialBolus?: string) => {
    const rate = customRate.trim();
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      toast({
        title: "Invalid rate",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    handleRateSelection(rate, initialBolus);
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

  // Handle rate stop (update the infusion_start record's endTimestamp)
  const handleRateStop = () => {
    if (!managingRate || !anesthesiaRecordId) return;
    
    const { label, sessionId } = managingRate;
    const stopTime = rateManageTime;
    
    if (!sessionId) {
      toast({
        title: "Error",
        description: "Session not identified",
        variant: "destructive",
      });
      return;
    }
    
    // Update the infusion_start record with endTimestamp
    updateMedication.mutate({
      id: sessionId,
      endTimestamp: new Date(stopTime),
    });
    
    toast({
      title: "Infusion stopped",
      description: `${label} stopped`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle TCI stop (stop infusion and record actual amount used for inventory calculation)
  const handleTciStop = (amountUsed: string) => {
    if (!managingRate || !anesthesiaRecordId) return;
    
    const { label, sessionId, itemId, administrationUnit, ampuleUnit } = managingRate;
    const stopTime = rateManageTime;
    
    // Validate amount input
    const parsedAmount = parseFloat(amountUsed);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }
    
    if (!sessionId) {
      toast({
        title: "Error",
        description: "Session not identified",
        variant: "destructive",
      });
      return;
    }
    
    if (!itemId) {
      toast({
        title: "Error",
        description: "Medication item not identified",
        variant: "destructive",
      });
      return;
    }
    
    // For TCI, use ampuleUnit (e.g., "mg" from "200 mg" ampule content) as the dose unit
    // This is the actual medication unit, not the TCI target concentration unit
    const doseUnit = ampuleUnit || administrationUnit;
    const formattedDose = doseUnit 
      ? `${amountUsed} ${doseUnit}` 
      : amountUsed;
    
    // Close dialog immediately to show progress (user sees spinner in background)
    setShowRateManageDialog(false);
    
    // Update the infusion_start record with endTimestamp
    updateMedication.mutate({
      id: sessionId,
      endTimestamp: new Date(stopTime),
    }, {
      onSuccess: () => {
        // Create an infusion_stop record to capture the actual amount used
        // Link to the session via infusionSessionId for proper pairing
        createMedication.mutate({
          anesthesiaRecordId,
          itemId,
          timestamp: new Date(stopTime),
          type: 'infusion_stop',
          dose: formattedDose, // Store actual amount used for inventory calculation
          infusionSessionId: sessionId, // Link to the parent session
        }, {
          onSuccess: () => {
            // Only show success and reset state after both mutations complete
            toast({
              title: t("anesthesia.timeline.tciStopInfusion"),
              description: `${label} - ${formattedDose}`,
            });
            setManagingRate(null);
            setRateManageTime(0);
            setRateManageInput("");
          },
          onError: (error) => {
            toast({
              title: "Error",
              description: "Failed to record TCI amount. Please try again.",
              variant: "destructive",
            });
            console.error('[TCI-STOP] Failed to create stop record:', error);
          }
        });
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: "Failed to stop TCI infusion. Please try again.",
          variant: "destructive",
        });
        console.error('[TCI-STOP] Failed to update session:', error);
        // Re-open dialog on error so user can try again
        setShowRateManageDialog(true);
      }
    });
  };

  // Handle start new rate (stop current and create new infusion_start)
  const handleRateStartNew = (newRate: string, initialBolus?: string) => {
    if (!managingRate || !anesthesiaRecordId) return;
    
    const { swimlaneId, label, itemId, sessionId } = managingRate;
    const newTime = rateManageTime;
    const stopTime = newTime - 60000; // Stop 1 minute before new start
    
    if (!itemId) {
      toast({
        title: "Error",
        description: "Medication item not identified",
        variant: "destructive",
      });
      return;
    }
    
    // Get current session for syringe quantity
    const sessions = rateInfusionSessions[swimlaneId];
    const currentSession = sessions?.find(s => s.id === sessionId);
    
    // First, stop the current infusion if there is one
    if (sessionId) {
      updateMedication.mutate({
        id: sessionId,
        endTimestamp: new Date(stopTime),
      });
    }
    
    // Then create a new infusion_start record
    createMedication.mutate({
      anesthesiaRecordId,
      itemId,
      timestamp: new Date(newTime),
      type: 'infusion_start',
      rate: newRate,
      dose: currentSession?.syringeQuantity || '50ml', // Use same syringe quantity or default
      initialBolus: initialBolus || undefined, // Initial bolus given at infusion start
    });
    
    toast({
      title: "New infusion started",
      description: `${label} started at ${newRate}`,
    });
    
    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle change rate (create a new rate_change medication record)
  const handleRateChange = (newRate: string) => {
    if (!managingRate || !anesthesiaRecordId) return;
    
    const { label, itemId } = managingRate;
    const changeTime = rateManageTime; // Use the manage time, not original time
    
    if (!itemId) {
      toast({
        title: "Error",
        description: "Medication item not identified",
        variant: "destructive",
      });
      return;
    }
    
    // Create a rate_change medication record
    createMedication.mutate({
      anesthesiaRecordId,
      itemId,
      timestamp: new Date(changeTime),
      type: 'rate_change',
      rate: newRate,
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
  
  // Create state objects to pass to TimelineContextProvider
  const vitalsState = {
    hrRecords,
    bpRecords,
    spo2Records,
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    hrRecordsRef,
    bpRecordsRef,
    spo2RecordsRef,
    setHrRecords,
    setBpRecords,
    setSpo2Records,
    addHrPoint,
    addBPPoint,
    addSpo2Point,
    updateHrPoint,
    updateBPPoint,
    updateSpo2Point,
    resetVitalsData,
  };
  
  const medicationState = {
    medicationDoseData,
    infusionData,
    rateInfusionSessions,
    freeFlowSessions,
    setMedicationDoseData,
    setInfusionData,
    setRateInfusionSessions,
    setFreeFlowSessions,
    addMedicationDose,
    addInfusionPoint,
    getActiveRateSession,
    getActiveFreeFlowSession,
    resetMedicationData,
  };
  
  const ventilationState = {
    ventilationData,
    ventilationModeData,
    setVentilationData,
    setVentilationModeData,
    addVentilationPoint,
    addVentilationMode,
    resetVentilationData,
  };
  
  const eventState = {
    heartRhythmData,
    staffData,
    positionData,
    bisData,
    tofData,
    vasData,
    scoresData,
    eventComments,
    timeMarkers,
    setHeartRhythmData,
    setStaffData,
    setPositionData,
    setBisData,
    setTofData,
    setVasData,
    setScoresData,
    setEventComments,
    setTimeMarkers,
    addHeartRhythm,
    addStaffEntry,
    addPosition,
    addBIS,
    addTOF,
    addVAS,
    addScore,
    addEvent,
    resetEventData,
  };
  
  const outputState = {
    outputData,
    setOutputData,
    resetOutputData,
  };
  
  return (
    <TimelineContextProvider
      vitalsState={vitalsState}
      medicationState={medicationState}
      ventilationState={ventilationState}
      eventState={eventState}
      outputState={outputState}
      inventoryCommitState={inventoryCommitState}
      currentTime={currentTime}
      setCurrentTime={setCurrentTime}
      chartInitTime={chartInitTime}
      currentZoomStart={currentZoomStart ?? 0}
      setCurrentZoomStart={setCurrentZoomStart}
      currentZoomEnd={currentZoomEnd ?? 100}
      setCurrentZoomEnd={setCurrentZoomEnd}
      currentVitalsSnapInterval={currentVitalsSnapInterval}
      setCurrentVitalsSnapInterval={setCurrentVitalsSnapInterval}
      currentDrugSnapInterval={currentDrugSnapInterval}
      setCurrentDrugSnapInterval={() => {}}
      isDark={isDark}
      setIsDark={setIsDark}
      collapsedSwimlanes={collapsedSwimlanes}
      setCollapsedSwimlanes={setCollapsedSwimlanes}
      toggleSwimlane={toggleSwimlane}
      activeToolMode={activeToolMode}
      setActiveToolMode={setActiveToolMode}
      blendSequenceStep={blendSequenceStep}
      setBlendSequenceStep={setBlendSequenceStep}
      bpEntryMode={bpEntryMode}
      setBpEntryMode={setBpEntryMode}
      pendingSysValue={pendingSysValue}
      setPendingSysValue={setPendingSysValue}
      isProcessingClick={isProcessingClick}
      setIsProcessingClick={setIsProcessingClick}
      addVitalPointMutation={addVitalPointMutation}
      updateVitalPointMutation={updateVitalPointMutation}
      deleteVitalPointMutation={deleteVitalPointMutation}
      addBPPointMutation={addBPPointMutation}
      updateBPPointMutation={updateBPPointMutation}
      createMedicationMutation={createMedication}
      updateMedicationMutation={updateMedication}
      deleteMedicationMutation={deleteMedication}
      createVentilationModeMutation={createVentilationMode}
      updateVentilationModeMutation={updateVentilationMode}
      deleteVentilationModeMutation={deleteVentilationMode}
      createEventMutation={createEvent}
      updateEventMutation={updateEvent}
      deleteEventMutation={deleteEvent}
      createOutputMutation={createOutput}
      updateOutputMutation={updateOutput}
      deleteOutputMutation={deleteOutput}
      saveTimeMarkersMutation={saveTimeMarkersMutation}
      anesthesiaItems={anesthesiaItems}
      administrationGroups={administrationGroups}
      anesthesiaRecordId={anesthesiaRecordId}
      patientWeight={patientWeight}
      data={data}
      swimlanes={activeSwimlanes}
    >
      <div 
        ref={gestureContainerRef}
        className="w-full relative touch-pan-y"
        style={{ height: componentHeight }}
        data-testid="timeline-gesture-container"
      >
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
        isTouchDevice={isTouchDevice}
      />
      
      {/* Record Lock Status Indicator - shown when record is locked */}
      {isRecordLocked && (
        <div className="sticky top-8 z-40 flex justify-end pr-4 -mt-1 -mb-1">
          <button
            onClick={() => setShowUnlockDialog(true)}
            className="flex items-center gap-1.5 bg-amber-500/90 text-white px-3 py-1 rounded-full shadow-lg hover:bg-amber-600 transition-colors text-sm font-medium"
            data-testid="button-record-locked-indicator"
            title={t('anesthesia.record.clickToUnlock', 'Click to unlock this record for editing')}
          >
            <Lock className="w-4 h-4" />
            <span>{t('anesthesia.record.locked', 'Locked')}</span>
          </button>
        </div>
      )}
      
      {/* Re-Lock button when record is unlocked but was previously locked (has lockedAt) */}
      {!isRecordLocked && anesthesiaRecord?.lockedAt && (
        <div className="sticky top-8 z-40 flex justify-end pr-4 -mt-1 -mb-1">
          <button
            onClick={() => {
              if (anesthesiaRecordId) {
                lockRecordMutation.mutate(anesthesiaRecordId);
              }
            }}
            disabled={lockRecordMutation.isPending}
            className="flex items-center gap-1.5 bg-green-500/90 text-white px-3 py-1 rounded-full shadow-lg hover:bg-green-600 transition-colors text-sm font-medium disabled:opacity-50"
            data-testid="button-record-unlocked-indicator"
            title={t('anesthesia.record.clickToLock', 'Click to lock this record')}
          >
            {lockRecordMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LockOpen className="w-4 h-4" />
            )}
            <span>{t('anesthesia.record.unlocked', 'Unlocked')}</span>
          </button>
        </div>
      )}
      
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
            disabled={!canWrite}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'bp' 
                ? 'border-foreground bg-foreground/20' 
                : 'border-border bg-background hover:border-foreground hover:bg-foreground/10'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="button-vitals-bp"
            title="Blood Pressure (NIBP)"
          >
            <ChevronsDownUp className={`w-5 h-5 transition-colors ${activeToolMode === 'bp' ? 'text-foreground' : 'text-foreground/70 hover:text-foreground'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'hr' ? null : 'hr')}
            disabled={!canWrite}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'hr' 
                ? 'border-red-500 bg-red-500/20' 
                : 'border-border bg-background hover:border-red-500 hover:bg-red-500/10'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid="button-vitals-heart"
            title="Heart Rate"
          >
            <Heart className={`w-5 h-5 transition-colors ${activeToolMode === 'hr' ? 'text-red-500' : 'hover:text-red-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'spo2' ? null : 'spo2')}
            disabled={!canWrite}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'spo2' 
                ? 'border-blue-500 bg-blue-500/20' 
                : 'border-border bg-background hover:border-blue-500 hover:bg-blue-500/10'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            disabled={!canWrite}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'blend' 
                ? 'border-purple-500 bg-purple-500/20' 
                : 'border-border bg-background hover:border-purple-500 hover:bg-purple-500/10'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            disabled={!canWrite}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'edit' 
                ? 'border-amber-500 bg-amber-500/20' 
                : 'border-border bg-background hover:border-amber-500 hover:bg-amber-500/10'
            } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          const isEreignisseLane = lane.id === "ereignisse";
          const isMedParent = lane.id === "medikamente";
          const isVentParent = lane.id === "ventilation";
          const isOutputParent = lane.id === "output";
          const isOthersParent = lane.id === "others";
          const isVentChild = lane.id.startsWith("ventilation-");
          const isOutputChild = lane.id.startsWith("output-");
          const isOthersChild = lane.id === "bis";
          const isTofLane = lane.id === "tof";
          
          // Only the main parent swimlanes are collapsible
          const isCollapsibleParent = isMedParent || isVentParent || isOutputParent || isOthersParent;
          
          // Determine styling based on hierarchyLevel field
          let labelClass = "";
          if (swimlaneConfig?.hierarchyLevel === 'parent' || isCollapsibleParent || lane.id === "zeiten" || lane.id === "ereignisse" || isTofLane || lane.id === "herzrhythmus" || lane.id === "position") {
            // Level 1: Main parent swimlanes (collapsible)
            labelClass = "text-sm font-semibold";
          } else if (swimlaneConfig?.hierarchyLevel === 'group') {
            // Level 2: Administration group headers (non-collapsible, bold, smaller)
            labelClass = "text-xs font-semibold";
          } else if (swimlaneConfig?.hierarchyLevel === 'entry') {
            // Entry lane (e.g., Vent. Params) - bold, smaller text
            labelClass = "text-xs font-semibold";
          } else if (swimlaneConfig?.hierarchyLevel === 'item' || isVentChild || isOutputChild || isOthersChild) {
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
              {isZeitenLane ? (
                // For Times swimlane, show next timepoint button and times icon
                <div className="flex items-center justify-between gap-1 flex-1">
                  <button
                    onClick={() => {
                      if (!canWrite) return; // Don't allow modifications on locked records
                      
                      const nextMarkerIndex = timeMarkers.findIndex(m => m.time === null);
                      if (nextMarkerIndex !== -1) {
                        const nextMarker = timeMarkers[nextMarkerIndex];
                        
                        // Check if trying to set PACU End (P) - auto-stop all running infusions first
                        if (nextMarker.code === 'P') {
                          // Collect and auto-stop all running rate-controlled infusions
                          const stoppedInfusions: string[] = [];
                          Object.entries(rateInfusionSessions).forEach(([swimlaneId, sessions]) => {
                            if (Array.isArray(sessions)) {
                              sessions.forEach(session => {
                                if (session.state === 'running' && session.id) {
                                  stoppedInfusions.push(session.label || swimlaneId);
                                  updateMedication.mutate({
                                    id: session.id,
                                    endTimestamp: new Date(currentTime),
                                  });
                                }
                              });
                            }
                          });
                          
                          // Collect and auto-stop all running free-flow infusions
                          Object.entries(freeFlowSessions).forEach(([swimlaneId, sessions]) => {
                            if (Array.isArray(sessions)) {
                              sessions.forEach(session => {
                                if (!session.endTime && session.id) {
                                  stoppedInfusions.push(swimlaneId);
                                  updateMedication.mutate({
                                    id: session.id,
                                    endTimestamp: new Date(currentTime),
                                  });
                                }
                              });
                            }
                          });
                          
                          if (stoppedInfusions.length > 0) {
                            console.log('[P_CHECK] Auto-stopped running infusions:', stoppedInfusions);
                            toast({
                              title: t('anesthesia.pacuEnd.infusionsStopped', 'Infusions stopped'),
                              description: t('anesthesia.pacuEnd.autoStoppedInfusions', '{{count}} running infusion(s) automatically stopped', { count: stoppedInfusions.length }),
                            });
                          }
                          
                          // Check for pending commits
                          if (inventoryCommitState.hasPendingCommits) {
                            console.log('[P_CHECK] Blocking PACU End - pending commits exist');
                            toast({
                              title: t('anesthesia.pacuEnd.cannotSetTitle', 'Cannot set PACU End'),
                              description: t('anesthesia.pacuEnd.commitInventoryFirst', 'Please commit all inventory items before marking PACU End.'),
                              variant: "destructive",
                            });
                            return;
                          }
                        }

                        // Check if setting X2 (Anesthesia End) with pending commits (NON-BLOCKING REMINDER)
                        const shouldShowX2Reminder = 
                          nextMarker.code === 'X2' && 
                          inventoryCommitState.hasPendingCommits && 
                          !inventoryCommitState.x2ReminderShownRef.current;

                        const updatedMarkers = [...timeMarkers];
                        updatedMarkers[nextMarkerIndex] = {
                          ...updatedMarkers[nextMarkerIndex],
                          time: currentTime,
                        };
                        setTimeMarkers(updatedMarkers);
                        
                        // Save to database
                        // NOTE: The backend automatically locks the record when PACU End (P) is set
                        // so we don't need to call lockRecordMutation here
                        if (anesthesiaRecordId && saveTimeMarkersMutation) {
                          console.log('[TIME_MARKERS] Quick add button - triggering save mutation');
                          saveTimeMarkersMutation.mutate({
                            anesthesiaRecordId,
                            timeMarkers: updatedMarkers,
                          });
                        }

                        // Show X2 reminder dialog after marker is set
                        if (shouldShowX2Reminder) {
                          console.log('[X2_CHECK] Showing reminder dialog from quick button');
                          inventoryCommitState.x2ReminderShownRef.current = true;
                          setShowCommitReminder(true);
                        }
                      }
                    }}
                    disabled={!canWrite}
                    className={`flex items-center gap-1 text-left bg-primary/10 text-foreground px-2 py-1 rounded text-xs hover:bg-primary/20 transition-colors pointer-events-auto truncate flex-1 max-w-[140px] ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                    data-testid="button-next-timepoint"
                    title={(() => {
                      const nextMarker = timeMarkers.find(m => m.time === null);
                      return nextMarker 
                        ? `${t('anesthesia.timeline.zeitenTooltip.next', 'Next')}: ${t(`anesthesia.timeline.timeMarkerLabels.${nextMarker.code}`, nextMarker.label)}` 
                        : t('anesthesia.timeline.zeitenTooltip.allMarkersPlaced', 'All times set');
                    })()}
                  >
                    {(() => {
                      const nextMarker = timeMarkers.find(m => m.time === null);
                      if (nextMarker) {
                        return (
                          <>
                            <ChevronRight className="w-4 h-4 shrink-0" />
                            <span className="truncate text-[11px]">{t(`anesthesia.timeline.timeMarkerLabels.${nextMarker.code}`, nextMarker.label)}</span>
                          </>
                        );
                      } else {
                        return <span className="text-[11px]">{t('anesthesia.timeline.zeitenTooltip.allMarkersPlaced', 'All times set')}</span>;
                      }
                    })()}
                  </button>
                  <button
                    onClick={() => {
                      const pMarker = timeMarkers.find(m => m.code === 'P');
                      bulkEditPacuEndWasSetRef.current = pMarker?.time != null;
                      setBulkEditDialogOpen(true);
                    }}
                    className="hover:bg-background/10 transition-colors rounded p-0.5 pointer-events-auto"
                    data-testid="button-edit-anesthesia-times"
                    title={t('anesthesia.timeline.bulkEditTimes.title', 'Edit Anesthesia Times')}
                  >
                    <Clock className="w-4 h-4 text-foreground/70 group-hover:text-foreground shrink-0" />
                  </button>
                </div>
              ) : isEreignisseLane ? (
                // For Events swimlane, make entire label area clickable to toggle panel
                <button
                  onClick={() => setShowEventsTimesPanel(true)}
                  className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 pointer-events-auto"
                  data-testid="button-toggle-events-panel"
                  title="View Events & Times"
                >
                  <span className={`${labelClass} text-black dark:text-white`}>
                    {lane.label}
                  </span>
                </button>
              ) : isCollapsibleParent ? (
                // For collapsible parent swimlanes, make entire label area clickable to toggle
                <div className="flex items-center justify-between flex-1">
                  <button
                    onClick={() => toggleSwimlane(lane.id)}
                    className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 pointer-events-auto"
                    data-testid={`button-toggle-${lane.id}`}
                    title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                  >
                    {collapsedSwimlanes.has(lane.id) ? (
                      <ChevronRight className="w-4 h-4 text-foreground/70 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-foreground/70 shrink-0" />
                    )}
                    <span className={`${labelClass} text-black dark:text-white`}>
                      {lane.label}
                    </span>
                  </button>
                  {isMedParent && !collapsedSwimlanes.has(lane.id) && (
                    <>
                      {/* Reorder button - admin only */}
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            enterReorderMode();
                          }}
                          className="hover:bg-background/10 transition-colors rounded p-1 pointer-events-auto ml-1"
                          data-testid="button-reorder-medications"
                          title={t("anesthesia.timeline.reorderMedications")}
                        >
                          <ArrowUpDown className="w-4 h-4 text-foreground/70" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : swimlaneConfig?.hierarchyLevel === 'group' ? (
                // For administration group headers, make entire label area clickable to configure medications (admin only)
                isAdmin ? (
                  <>
                    <button
                      onClick={() => {
                        // Find the corresponding admin group by matching lane ID format: admingroup-${group.id}
                        const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                        if (adminGroup) {
                          setSelectedAdminGroupForConfig(adminGroup);
                          setEditingItemForConfig(null);
                          setShowMedicationConfigDialog(true);
                        }
                      }}
                      onMouseMove={(e) => {
                        if (isTouchDevice) return;
                        const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                        if (adminGroup) {
                          setAdminGroupHoverInfo({
                            x: e.clientX,
                            y: e.clientY,
                            groupName: adminGroup.name,
                          });
                        }
                      }}
                      onMouseLeave={() => setAdminGroupHoverInfo(null)}
                      className="flex items-center gap-1 flex-1 text-left cursor-pointer pointer-events-auto"
                      data-testid={`button-configure-${lane.id}`}
                      title="Configure Medications"
                    >
                      <span className={`${labelClass} text-black dark:text-white`}>
                        {lane.label}
                      </span>
                    </button>
                    {/* Plus button for on-demand medications (admin users) */}
                    {canWrite && anesthesiaRecordId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                          if (adminGroup) {
                            setSelectedAdminGroupForOnDemand(adminGroup);
                            setShowOnDemandDialog(true);
                          }
                        }}
                        className="ml-1 p-2 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 transition-colors pointer-events-auto touch-manipulation"
                        data-testid={`button-add-on-demand-admin-${lane.id}`}
                        title={t("anesthesia.timeline.addOnDemandMedication", "Add On-Demand Medication")}
                      >
                        <Plus className="w-5 h-5 text-primary" />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1 flex-1">
                    <span className={`${labelClass} text-black dark:text-white`}>
                      {lane.label}
                    </span>
                    {/* Plus button to add on-demand medications (available for all users) */}
                    {canWrite && anesthesiaRecordId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const adminGroup = administrationGroups.find(g => `admingroup-${g.id}` === lane.id);
                          if (adminGroup) {
                            setSelectedAdminGroupForOnDemand(adminGroup);
                            setShowOnDemandDialog(true);
                          }
                        }}
                        className="ml-1 p-2 rounded-full bg-primary/10 hover:bg-primary/20 active:bg-primary/30 transition-colors pointer-events-auto touch-manipulation"
                        data-testid={`button-add-on-demand-${lane.id}`}
                        title={t("anesthesia.timeline.addOnDemandMedication", "Add On-Demand Medication")}
                      >
                        <Plus className="w-5 h-5 text-primary" />
                      </button>
                    )}
                  </div>
                )
              ) : swimlaneConfig?.hierarchyLevel === 'item' && lane.itemId ? (
                // For medication item labels, make them clickable to edit (admin only)
                // Also show cumulative dose badge on the right side
                <>
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        // Find the medication item using the itemId property from the lane
                        const medicationItem = anesthesiaItems.find(item => item.id === lane.itemId);
                        if (medicationItem && medicationItem.administrationGroup) {
                          // Find the admin group by ID (administrationGroup field stores the UUID)
                          const adminGroup = administrationGroups.find(g => g.id === medicationItem.administrationGroup);
                          if (adminGroup) {
                            setSelectedAdminGroupForConfig(adminGroup);
                            setEditingItemForConfig(medicationItem);
                            setShowMedicationConfigDialog(true);
                          }
                        }
                      }}
                      className="flex items-center gap-1 flex-1 text-left hover:bg-background/10 transition-colors rounded px-1 -mx-1 cursor-pointer min-w-0"
                      data-testid={`button-edit-medication-${lane.id}`}
                      title="Edit Medication Configuration"
                    >
                      <span className={`${labelClass} text-black dark:text-white truncate`}>
                        {lane.label}
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className={`${labelClass} text-black dark:text-white truncate`}>
                        {lane.label}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-1 flex-1">
                  {isCollapsibleParent && (
                    <button
                      onClick={() => toggleSwimlane(lane.id)}
                      className="p-0.5 rounded hover:bg-background/50 transition-colors group pointer-events-auto"
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
              )}
            </div>
          );
        })}
      </div>

      {/* Fixed right-side panel for cumulative dose badges */}
      {/* z-50 ensures pills are above medication swimlane elements (z-40) for click capture */}
      <div 
        className="absolute right-0 z-50 pointer-events-none"
        style={{ 
          top: `${VITALS_TOP_POS + VITALS_HEIGHT}px`,
          width: '70px',
          height: `${swimlanePositions.length > 0 ? swimlanePositions[swimlanePositions.length - 1].top + swimlanePositions[swimlanePositions.length - 1].height - (VITALS_TOP_POS + VITALS_HEIGHT) : 0}px`
        }}
      >
        {swimlanePositions.map((lane) => {
          const swimlaneConfig = activeSwimlanes.find(s => s.id === lane.id);
          const isItem = swimlaneConfig?.hierarchyLevel === 'item' && lane.itemId;
          const cumulativeDose = cumulativeDoses[lane.id];
          
          // Check if this is an active TCI infusion (show "Running" instead of calculated total)
          const isTciMode = swimlaneConfig?.rateUnit === "TCI";
          const sessions = rateInfusionSessions[lane.id] || [];
          const hasRunningTciSession = isTciMode && sessions.some(s => !s.endTime);
          
          // For TCI, show "Running" while active, or show total if stopped
          // For non-TCI, show calculated total
          if (!isItem) return null;
          
          // If TCI is running, show "Running" badge
          if (hasRunningTciSession) {
            const topOffset = lane.top - (VITALS_TOP_POS + VITALS_HEIGHT);
            return (
              <div
                key={`cumulative-${lane.id}`}
                className="absolute right-1 flex items-center justify-end"
                style={{
                  top: `${topOffset}px`,
                  height: `${lane.height}px`,
                }}
              >
                <span 
                  className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500 text-white rounded-full whitespace-nowrap shadow-sm animate-pulse"
                  data-testid={`badge-cumulative-dose-${lane.id}`}
                  title={t("anesthesia.timeline.tciRunning")}
                >
                  {t("anesthesia.timeline.tciRunning")}
                </span>
              </div>
            );
          }
          
          // For stopped TCI or non-TCI, show cumulative dose if available
          if (!cumulativeDose || cumulativeDose.total <= 0) return null;
          
          // Calculate position relative to the right panel's top
          const topOffset = lane.top - (VITALS_TOP_POS + VITALS_HEIGHT);
          
          // Check if this is a stopped TCI with editable amount via infusion_stop record
          const stoppedTciSession = isTciMode ? sessions.find(s => s.endTime && s.stopRecordId && s.actualAmountUsed) : undefined;
          
          // All medication pills are now editable when canWrite is true
          // Users can override calculated totals with manual values
          const isEditable = canWrite;
          
          const handleMedicationPillClick = () => {
            if (!canWrite) return;
            
            // Get current numeric value from cumulativeDose
            const numericValue = cumulativeDose.total.toString();
            
            // Determine if we're updating an existing record or creating new
            // Priority: 1) manual_total record, 2) TCI infusion_stop record, 3) create new manual_total
            const isManualOverride = (cumulativeDose as any).isManualOverride;
            const manualRecordId = (cumulativeDose as any).manualRecordId;
            
            setEditingTciAmount({
              stopRecordId: isManualOverride && manualRecordId 
                ? manualRecordId 
                : (stoppedTciSession?.stopRecordId || ''),
              currentAmount: numericValue,
              unit: cumulativeDose.unit,
              label: swimlaneConfig?.label || '',
              swimlaneId: lane.id,
              // Additional fields for creating new manual_total if needed
              ...(lane.itemId && { itemId: lane.itemId }),
              isManualOverride: isManualOverride || false,
            } as any);
            setTciAmountEditInput(numericValue);
            setShowTciAmountEditDialog(true);
          };
          
          return (
            <div
              key={`cumulative-${lane.id}`}
              className="absolute right-1 flex items-center justify-end"
              style={{
                top: `${topOffset}px`,
                height: `${lane.height}px`,
              }}
            >
              <span 
                className={`px-1.5 py-0.5 text-[10px] font-medium text-white rounded-full whitespace-nowrap shadow-sm ${
                  (cumulativeDose as any).isManualOverride 
                    ? 'bg-blue-600' 
                    : 'bg-emerald-600'
                } ${isEditable ? 'pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                data-testid={`badge-cumulative-dose-${lane.id}`}
                title={isEditable 
                  ? t("anesthesia.timeline.clickToEditTotal", "Click to edit total") 
                  : `Total administered: ${cumulativeDose.total % 1 === 0 ? cumulativeDose.total : cumulativeDose.total.toFixed(1)} ${cumulativeDose.unit}`}
                onClick={isEditable ? handleMedicationPillClick : undefined}
              >
                {cumulativeDose.total % 1 === 0 
                  ? cumulativeDose.total 
                  : cumulativeDose.total.toFixed(1)} {cumulativeDose.unit}
              </span>
            </div>
          );
        })}
      </div>

      {/* ECharts timeline */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <ReactECharts
          key={anesthesiaRecordId || 'timeline'}
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%", pointerEvents: "none" }}
          opts={{ renderer: "canvas" }}
          onChartReady={handleChartReady}
          lazyUpdate
          notMerge={false}
        />
      </div>

      {/* Midnight boundary lines overlay */}
      {midnightLinePositions.map((midnight, index) => (
        <div
          key={`midnight-line-${index}`}
          className="absolute pointer-events-none z-15"
          style={{
            left: midnight.position,
            top: '32px',
            bottom: '0px',
            width: '2px',
            background: 'linear-gradient(to bottom, rgba(100, 116, 139, 0.5) 0%, rgba(100, 116, 139, 0.3) 50%, rgba(100, 116, 139, 0.1) 100%)',
          }}
        />
      ))}

      {/* VitalsSwimlane Component - Interactive layer for vitals entry */}
      <VitalsSwimlane
        chartRef={chartRef}
        VITALS_TOP={VITALS_TOP_POS}
        VITALS_HEIGHT={VITALS_HEIGHT}
        isTouchDevice={isTouchDevice}
        onBulkVitalsOpen={(time) => {
          setBulkVitalsTime(time);
          setShowBulkVitalsDialog(true);
        }}
        onVitalPointEdit={(type, pointId, time, value) => {
          // Clicking on existing point → Open Edit Value Dialog for single edit/delete
          // VitalsSwimlane passes the point ID directly as the second parameter
          let editType: 'hr' | 'sys' | 'dia' | 'spo2';
          
          if (type === 'hr') {
            editType = 'hr';
          } else if (type === 'bp-sys') {
            editType = 'sys';
          } else if (type === 'bp-dia') {
            editType = 'dia';
          } else {
            editType = 'spo2';
          }
          
          setEditingValue({ 
            type: editType, 
            time, 
            value, 
            index: 0,
            originalTime: time,
            pointId 
          });
          setEditDialogOpen(true);
        }}
      />

      {/* EventsSwimlane Component - Interactive layers and rendering for events and time markers */}
      <EventsSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onEventDialogOpen={(pending) => {
          setPendingEvent(pending);
          setShowEventDialog(true);
        }}
        onEventEditDialogOpen={(event) => {
          setEditingEvent(event);
          setEventEditTime(event.time);
          setShowEventDialog(true);
        }}
        onTimeMarkerEditDialogOpen={(editData) => {
          setEditingTimeMarker(editData);
          setTimeMarkerEditDialogOpen(true);
        }}
      />

      {/* MedicationsSwimlane Component - Interactive layers and rendering for medications */}
      <MedicationsSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onMedicationDoseDialogOpen={(pending) => {
          setPendingMedicationDose(pending);
          setShowMedicationDoseDialog(true);
        }}
        onMedicationEditDialogOpen={(editing) => {
          setEditingMedicationDose(editing);
          setShowMedicationEditDialog(true);
        }}
        onInstantMedicationSave={async (swimlaneId, time, dose, itemId) => {
          if (!anesthesiaRecordId) return;
          
          try {
            // Save to database
            await saveMedicationMutation.mutateAsync({
              anesthesiaRecordId,
              itemId,
              timestamp: new Date(time),
              type: "bolus",
              dose: dose,
            });
            
            // Update local state immediately
            setMedicationDoseData(prev => {
              const existing = prev[swimlaneId] || [];
              const newEntry: MedicationDosePoint = [time, dose, `temp-${Date.now()}`, null];
              return {
                ...prev,
                [swimlaneId]: [...existing, newEntry].sort((a, b) => a[0] - b[0])
              };
            });
            
            toast({
              title: "Dose saved",
              description: `Added ${dose} at ${formatTime(new Date(time))}`,
            });
          } catch (error) {
            console.error('[INSTANT-SAVE] Error saving medication:', error);
            toast({
              title: "Error saving dose",
              description: "Please try again",
              variant: "destructive",
            });
          }
        }}
        onInfusionDialogOpen={(pending) => {
          setPendingInfusionValue(pending);
          setShowInfusionDialog(true);
        }}
        onFreeFlowDoseDialogOpen={(pending) => {
          setPendingFreeFlowDose(pending);
          setShowFreeFlowDoseDialog(true);
        }}
        onFreeFlowStopDialogOpen={(session, clickTime) => {
          setPendingFreeFlowStop({ session, clickTime });
          setShowFreeFlowStopDialog(true);
        }}
        onFreeFlowRestartDialogOpen={(previousSession, clickTime) => {
          setPendingFreeFlowRestart({ previousSession, clickTime });
          setShowFreeFlowRestartDialog(true);
        }}
        onRateStopDialogOpen={(session, clickTime) => {
          setPendingRateStop({ session, clickTime });
          setShowRateStopDialog(true);
        }}
        onRateRestartDialogOpen={(previousSession, clickTime) => {
          setPendingRateRestart({ previousSession, clickTime });
          setShowRateRestartDialog(true);
        }}
        onFreeFlowSheetOpen={(session, doseInput, timeInput) => {
          setFreeFlowSheetSession(session);
          setSheetDoseInput(doseInput);
          setSheetTimeInput(timeInput);
          setShowFreeFlowSheet(true);
        }}
        onRateSheetOpen={(session, rateInput, timeInput, quantityInput) => {
          setRateSheetSession(session);
          setSheetRateInput(rateInput);
          setSheetRateTimeInput(timeInput);
          if (quantityInput) setSheetQuantityInput(quantityInput);
          setShowRateSheet(true);
        }}
        onRateManageDialogOpen={(managing, time, input) => {
          setManagingRate(managing);
          setRateManageTime(time);
          setRateManageInput(input);
          setShowRateManageDialog(true);
        }}
        onRateSelectionDialogOpen={(pending) => {
          setPendingRateSelection(pending);
          setShowRateSelectionDialog(true);
        }}
      />

      {/* VentilationSwimlane Component - Interactive layers and rendering for ventilation parameters and modes */}
      <VentilationSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onVentilationDialogOpen={(pending) => {
          setPendingVentilationValue(pending);
          setShowVentilationDialog(true);
        }}
        onVentilationEditDialogOpen={(editing) => {
          setEditingVentilationValue(editing);
          setShowVentilationEditDialog(true);
        }}
        onVentilationModeEditDialogOpen={(editing) => {
          setEditingVentilationMode(editing);
          setShowVentilationModeEditDialog(true);
        }}
        onVentilationModeAddDialogOpen={(pending) => {
          setPendingVentilationMode(pending);
          setShowVentilationModeAddDialog(true);
        }}
        clinicalSnapshot={clinicalSnapshot}
      />

      {/* HeartRhythmSwimlane Component - Interactive layer and rendering for heart rhythm tracking */}
      <HeartRhythmSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onHeartRhythmDialogOpen={(pending) => {
          setPendingHeartRhythm(pending);
          setEditingHeartRhythm(null);
          setHeartRhythmInput("");
          setHeartRhythmEditTime(0);
          setShowHeartRhythmDialog(true);
        }}
        onHeartRhythmEditDialogOpen={(editing) => {
          setEditingHeartRhythm(editing);
          setHeartRhythmInput(editing.rhythm);
          setHeartRhythmEditTime(editing.time);
          setShowHeartRhythmDialog(true);
        }}
      />

      {/* BISSwimlane Component - Interactive layer and rendering for BIS monitoring */}
      <BISSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onBISDialogOpen={(pending) => {
          setPendingBIS(pending);
          setEditingBIS(null);
          setShowBISDialog(true);
        }}
        onBISEditDialogOpen={(editing) => {
          setEditingBIS(editing);
          setPendingBIS(null);
          setShowBISDialog(true);
        }}
      />

      {/* TOFSwimlane Component - Interactive layer and rendering for TOF monitoring (OR mode only) */}
      {!isPacuMode && (
        <TOFSwimlane
          swimlanePositions={swimlanePositions}
          isTouchDevice={isTouchDevice}
          onTOFDialogOpen={(pending) => {
            setPendingTOF(pending);
            setEditingTOF(null);
            setShowTOFDialog(true);
          }}
          onTOFEditDialogOpen={(editing) => {
            setEditingTOF(editing);
            setPendingTOF(null);
            setShowTOFDialog(true);
          }}
        />
      )}

      {/* VASSwimlane Component - Interactive layer and rendering for VAS pain scoring (PACU mode only) */}
      {isPacuMode && (
        <VASSwimlane
          swimlanePositions={swimlanePositions}
          isTouchDevice={isTouchDevice}
          onVASDialogOpen={(pending) => {
            setPendingVAS(pending);
            setEditingVAS(null);
            setShowVASDialog(true);
          }}
          onVASEditDialogOpen={(editing) => {
            setEditingVAS(editing);
            setPendingVAS(null);
            setShowVASDialog(true);
          }}
        />
      )}

      {/* ScoresSwimlane Component - Interactive layer and rendering for Aldrete/PARSAP scores (PACU mode only) */}
      {isPacuMode && (
        <ScoresSwimlane
          swimlanePositions={swimlanePositions}
          isTouchDevice={isTouchDevice}
          onScoresDialogOpen={(pending) => {
            setPendingScore(pending);
            setEditingScore(null);
            setShowScoresDialog(true);
          }}
          onScoresEditDialogOpen={(editing) => {
            setEditingScore(editing);
            setPendingScore(null);
            setShowScoresDialog(true);
          }}
        />
      )}

      {/* Interactive overlays for collapsible parent swimlanes */}
      {swimlanePositions.map((lane) => {
        const isCollapsibleParent = lane.id === "medikamente" || lane.id === "ventilation" || lane.id === "output" || lane.id === "others";
        if (!isCollapsibleParent) return null;
        
        return (
          <div
            key={`overlay-${lane.id}`}
            className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${lane.top}px`,
              height: `${lane.height}px`,
              zIndex: 25,
            }}
            onClick={() => toggleSwimlane(lane.id)}
            data-testid={`interactive-parent-lane-${lane.id}`}
            title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
          />
        );
      })}

      {/* PositionSwimlane Component - Interactive layer and rendering for patient positioning */}
      <PositionSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onPositionDialogOpen={(pending) => {
          setPendingPosition(pending);
          setEditingPosition(null);
          setShowPositionDialog(true);
        }}
        onPositionEditDialogOpen={(editing) => {
          setEditingPosition(editing);
          setPendingPosition(null);
          setShowPositionDialog(true);
        }}
      />

      {/* OutputSwimlane Component - Interactive layers and rendering for output parameters */}
      <OutputSwimlane
        swimlanePositions={swimlanePositions}
        isTouchDevice={isTouchDevice}
        onOutputDialogOpen={(pending) => {
          setPendingOutputValue(pending);
          setShowOutputDialog(true);
        }}
        onOutputEditDialogOpen={(editing) => {
          setEditingOutputValue(editing);
          setShowOutputEditDialog(true);
        }}
        onOutputBulkDialogOpen={(pending) => {
          setPendingOutputBulk(pending);
          setShowOutputBulkDialog(true);
        }}
      />

      {/* VentilationEntryLane - Interactive layer with vertical lines for parameter entry */}
      {(() => {
        const entryLane = swimlanePositions.find(l => l.id === "ventilation-entry");
        if (!entryLane) return null;
        
        // Use actual chart viewport range (matches ECharts x-axis)
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const timeRange = visibleEnd - visibleStart;
        
        if (timeRange <= 0) return null;
        
        return (
          <div
            className="absolute pointer-events-auto cursor-pointer hover:bg-primary/5 transition-colors"
            style={{
              left: '200px',
              right: '10px',
              top: `${entryLane.top}px`,
              height: `${entryLane.height}px`,
              zIndex: 30,
            }}
            onMouseMove={(e) => {
              if (isTouchDevice) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const chartPixelWidth = rect.width;
              
              // Guard against division by zero
              if (chartPixelWidth <= 0) {
                setVentilationBulkHoverInfo(null);
                return;
              }
              
              const hoveredTime = visibleStart + (clickX / chartPixelWidth) * timeRange;
              
              setVentilationBulkHoverInfo({
                x: e.clientX,
                y: e.clientY,
                time: hoveredTime,
              });
            }}
            onMouseLeave={() => setVentilationBulkHoverInfo(null)}
            onClick={(e) => {
              if (!canWrite) {
                toast({
                  title: t('common.recordLocked', 'Record locked'),
                  description: t('common.cannotModifyLocked', 'Cannot modify a locked record'),
                  variant: "destructive",
                });
                return;
              }
              
              // Calculate clicked time position using actual chart viewport
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const chartPixelWidth = rect.width;
              const clickedTime = visibleStart + (clickX / chartPixelWidth) * timeRange;
              
              // Check if clicked near an existing marker (within 2 minutes = 120000ms)
              const CLICK_THRESHOLD = 120000;
              const nearbyTimestamp = ventilationEntryTimestamps.find(
                ts => Math.abs(ts - clickedTime) < CLICK_THRESHOLD
              );
              
              if (nearbyTimestamp) {
                // Edit existing entry - gather existing parameter values
                const existingParams: {
                  pip?: number;
                  peep?: number;
                  tidalVolume?: number;
                  respiratoryRate?: number;
                  fio2?: number;
                  etco2?: number;
                  minuteVolume?: number;
                } = {};
                
                // Find values at or near this timestamp (within 5 seconds tolerance)
                const findValue = (data: Array<[number, number]> | undefined, ts: number): number | undefined => {
                  if (!data) return undefined;
                  const match = data.find(([t]) => Math.abs(t - ts) < 5000);
                  return match ? match[1] : undefined;
                };
                
                existingParams.pip = findValue(ventilationData.pip, nearbyTimestamp);
                existingParams.peep = findValue(ventilationData.peep, nearbyTimestamp);
                existingParams.tidalVolume = findValue(ventilationData.tidalVolume, nearbyTimestamp);
                existingParams.respiratoryRate = findValue(ventilationData.respiratoryRate, nearbyTimestamp);
                existingParams.fio2 = findValue(ventilationData.fiO2, nearbyTimestamp);
                existingParams.etco2 = findValue(ventilationData.etCO2, nearbyTimestamp);
                existingParams.minuteVolume = findValue(ventilationData.minuteVolume, nearbyTimestamp);
                
                setEditingVentilationEntryTimestamp(nearbyTimestamp);
                setPendingVentilationBulk({ time: nearbyTimestamp, existingParams });
                setVentilationEntrySkipMode(true);
                setShowVentilationBulkDialog(true);
              } else {
                // Add new entry at the clicked time position (skip mode selection)
                setEditingVentilationEntryTimestamp(null);
                setPendingVentilationBulk({ time: clickedTime });
                setVentilationEntrySkipMode(true);
                setShowVentilationBulkDialog(true);
              }
            }}
            data-testid="ventilation-entry-lane"
          >
            {/* Render vertical lines at each ventilation timestamp */}
            {ventilationEntryTimestamps.map((timestamp) => {
              // Use the same viewport range as the chart (visibleStart/visibleEnd from IIFE scope)
              const leftPercent = ((timestamp - visibleStart) / timeRange) * 100;
              
              // Skip if outside visible range
              if (leftPercent < 0 || leftPercent > 100) return null;
              
              return (
                <div
                  key={`vent-entry-${timestamp}`}
                  className="absolute top-0 bottom-0 w-[2px] bg-amber-600 dark:bg-amber-400 cursor-pointer hover:w-[4px] hover:bg-amber-500 transition-all"
                  style={{
                    left: `${leftPercent}%`,
                    transform: 'translateX(-50%)',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canWrite) {
                      toast({
                        title: t('common.recordLocked', 'Record locked'),
                        description: t('common.cannotModifyLocked', 'Cannot modify a locked record'),
                        variant: "destructive",
                      });
                      return;
                    }
                    // Edit this specific timestamp entry - gather existing parameter values
                    const existingParams: {
                      pip?: number;
                      peep?: number;
                      tidalVolume?: number;
                      respiratoryRate?: number;
                      fio2?: number;
                      etco2?: number;
                      minuteVolume?: number;
                    } = {};
                    
                    // Find values at or near this timestamp (within 5 seconds tolerance)
                    const findValue = (data: Array<[number, number]> | undefined, ts: number): number | undefined => {
                      if (!data) return undefined;
                      const match = data.find(([t]) => Math.abs(t - ts) < 5000);
                      return match ? match[1] : undefined;
                    };
                    
                    existingParams.pip = findValue(ventilationData.pip, timestamp);
                    existingParams.peep = findValue(ventilationData.peep, timestamp);
                    existingParams.tidalVolume = findValue(ventilationData.tidalVolume, timestamp);
                    existingParams.respiratoryRate = findValue(ventilationData.respiratoryRate, timestamp);
                    existingParams.fio2 = findValue(ventilationData.fiO2, timestamp);
                    existingParams.etco2 = findValue(ventilationData.etCO2, timestamp);
                    existingParams.minuteVolume = findValue(ventilationData.minuteVolume, timestamp);
                    
                    setEditingVentilationEntryTimestamp(timestamp);
                    setPendingVentilationBulk({ time: timestamp, existingParams });
                    setVentilationEntrySkipMode(true);
                    setShowVentilationBulkDialog(true);
                  }}
                  data-testid={`vent-entry-marker-${timestamp}`}
                  title={new Date(timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                />
              );
            })}
          </div>
        );
      })()}

      {/* Tooltip for ventilation parameter bulk entry */}
      {ventilationBulkHoverInfo && !isTouchDevice && isFinite(ventilationBulkHoverInfo.time) && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationBulkHoverInfo.x + 10,
            top: ventilationBulkHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.clickBulkEntry', 'Click for bulk entry/edit')}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(ventilationBulkHoverInfo.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
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

      {/* Interactive overlays for administration groups (RIGHT side chart area only) - Admin only */}
      {isAdmin && (
        <div className="absolute inset-0 pointer-events-none z-[70]">
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
                className="absolute cursor-pointer pointer-events-auto"
                style={{
                  left: '200px',
                  right: '10px',
                  top: `${lanePosition.top}px`,
                  height: `${lanePosition.height}px`,
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
        </div>
      )}

      {/* NOW line - Current time indicator (hidden for historical records) */}
      {!isHistoricalRecord && (
        <div
          className="absolute z-40 pointer-events-none"
          style={{
            left: nowLinePosition,
            top: '32px', // VITALS_TOP position
            width: '2px',
            height: `${backgroundsHeight - 32}px`,
            backgroundColor: isDark ? '#ef4444' : '#dc2626',
            transition: nowLineTransitionsEnabled ? 'left 0.3s ease-out' : 'none',
          }}
          data-testid="now-line-indicator"
        />
      )}



      {/* Medication Dose Entry Dialog */}
      <MedicationDoseDialog
        open={showMedicationDoseDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowMedicationDoseDialog(false);
            setPendingMedicationDose(null);
          } else {
            setShowMedicationDoseDialog(true);
          }
        }}
        anesthesiaRecordId={anesthesiaRecordId || null}
        pendingMedicationDose={pendingMedicationDose}
        anesthesiaItems={anesthesiaItems}
        onTimeChange={(newTime) => {
          if (pendingMedicationDose) {
            setPendingMedicationDose({
              ...pendingMedicationDose,
              time: newTime,
            });
          }
        }}
        onMedicationDoseCreated={() => {
          setPendingMedicationDose(null);
        }}
        onLocalStateUpdate={(swimlaneId, time, doseValue, note) => {
          // Manually update local state so the dose appears immediately
          // MedicationDosePoint is [timestamp, dose, id, note] - use temp ID until React Query syncs
          setMedicationDoseData(prev => {
            const existing = prev[swimlaneId] || [];
            const tempId = `temp-${Date.now()}`;
            const newEntry: [number, string, string, string | null] = [time, doseValue, tempId, note || null];
            return {
              ...prev,
              [swimlaneId]: [...existing, newEntry].sort((a, b) => a[0] - b[0])
            };
          });
        }}
        readOnly={!canWrite}
      />

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

      {/* On-Demand Medication Selection Dialog */}
      {anesthesiaRecordId && selectedAdminGroupForOnDemand && (
        <OnDemandMedicationDialog
          open={showOnDemandDialog}
          onOpenChange={(open) => {
            setShowOnDemandDialog(open);
            if (!open) {
              setSelectedAdminGroupForOnDemand(null);
            }
          }}
          anesthesiaRecordId={anesthesiaRecordId}
          administrationGroupId={selectedAdminGroupForOnDemand.id}
          administrationGroupName={selectedAdminGroupForOnDemand.name}
          onMedicationImported={() => {
            // Invalidate imported medications query to refresh the swimlanes
            queryClient.invalidateQueries({ 
              queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'imported-medications'] 
            });
          }}
        />
      )}

      {/* Infusion Value Entry Dialog */}
      <InfusionDialog
        open={showInfusionDialog}
        onOpenChange={setShowInfusionDialog}
        pendingInfusionValue={pendingInfusionValue}
        onInfusionValueEntry={(swimlaneId, time, value, initialBolus) => {
          // Update local infusion data for visual display
          setInfusionData(prev => {
            const existingData = prev[swimlaneId] || [];
            return {
              ...prev,
              [swimlaneId]: [...existingData, [time, value] as [number, string]]
            };
          });
          
          // Persist to database if we have the necessary IDs
          const itemId = pendingInfusionValue?.itemId;
          if (itemId && anesthesiaRecordId) {
            createMedication.mutate({
              anesthesiaRecordId,
              itemId,
              timestamp: new Date(time),
              type: 'infusion_start',
              rate: value,
              dose: value,
              initialBolus: initialBolus || undefined,
            });
          }
          
          setPendingInfusionValue(null);
        }}
      />

      {/* Infusion Value Edit Dialog */}
      <InfusionEditDialog
        open={showInfusionEditDialog}
        onOpenChange={setShowInfusionEditDialog}
        editingInfusionValue={editingInfusionValue}
        onInfusionValueEditSave={(swimlaneId, index, newTime, value) => {
          setInfusionData(prev => {
            const existingData = prev[swimlaneId] || [];
            const updated = [...existingData];
            updated[index] = [newTime, value];
            return {
              ...prev,
              [swimlaneId]: updated,
            };
          });
          setEditingInfusionValue(null);
        }}
        onInfusionValueDelete={(swimlaneId, index) => {
          setInfusionData(prev => {
            const existingData = prev[swimlaneId] || [];
            const updated = existingData.filter((_, i) => i !== index);
            return {
              ...prev,
              [swimlaneId]: updated,
            };
          });
          setEditingInfusionValue(null);
        }}
      />

      {/* Free-Flow Dose Entry Dialog */}
      <FreeFlowDoseDialog
        open={showFreeFlowDoseDialog}
        onOpenChange={setShowFreeFlowDoseDialog}
        pendingFreeFlowDose={pendingFreeFlowDose}
        onFreeFlowDoseEntry={(swimlaneId, time, dose, label) => {
          // Create new session
          const newSession: FreeFlowSession = {
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            swimlaneId,
            startTime: time,
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
          
          // Add dose marker to infusionData
          setInfusionData(prev => {
            const existingData = prev[swimlaneId] || [];
            return {
              ...prev,
              [swimlaneId]: [...existingData, [time, dose] as [number, string]].sort((a, b) => a[0] - b[0]),
            };
          });
          
          setPendingFreeFlowDose(null);
          toast({
            title: "Free-flow started",
            description: `${label} started with dose ${dose}`,
          });
        }}
      />

      {/* Free-Flow Stop/Start-New Dialog (Scenario 2: Running infusion clicked) */}
      <AlertDialog open={showFreeFlowStopDialog} onOpenChange={setShowFreeFlowStopDialog}>
        <AlertDialogContent data-testid="dialog-freeflow-stop">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingFreeFlowStop?.session.label}</AlertDialogTitle>
            <AlertDialogDescription>
              This infusion is currently running. Choose an action:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            {/* Primary actions: Start New and Stop */}
            <Button
              onClick={() => {
                if (!pendingFreeFlowStop || !anesthesiaRecordId) return;
                const { session, clickTime } = pendingFreeFlowStop;
                
                // START NEW action: Stop current + Start new with same dose after a 1-minute gap
                const stopTime = clickTime;
                const newStartTime = clickTime + 60000; // 1 minute gap
                
                // Extract item ID from swimlane ID
                const groupMatch = session.swimlaneId.match(/admingroup-([a-f0-9-]+)-item-([a-f0-9-]+)/);
                if (!groupMatch) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Unable to start new infusion",
                  });
                  return;
                }
                
                const itemId = groupMatch[2];
                const item = anesthesiaItems.find(i => i.id === itemId);
                
                if (!item) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Item not found",
                  });
                  return;
                }
                
                // Optimistic update: Immediately update UI
                setFreeFlowSessions(prev => {
                  const sessions = prev[session.swimlaneId] || [];
                  const updated = sessions.map(s => 
                    s.id === session.id 
                      ? { ...s, endTime: stopTime }
                      : s
                  );
                  
                  // Add new session with temporary ID
                  const newSession: FreeFlowSession = {
                    id: `temp-${Date.now()}`,
                    swimlaneId: session.swimlaneId,
                    startTime: newStartTime,
                    dose: session.dose,
                    label: session.label,
                  };
                  
                  return {
                    ...prev,
                    [session.swimlaneId]: [...updated, newSession].sort((a, b) => a.startTime - b.startTime),
                  };
                });
                
                // Close dialog immediately
                setShowFreeFlowStopDialog(false);
                setPendingFreeFlowStop(null);
                
                // Show success message immediately
                toast({
                  title: "New infusion started",
                  description: `${session.label} stopped and restarted with dose ${session.dose}`,
                });
                
                // 1. Stop the current infusion (background)
                updateMedication.mutate({
                  id: session.id,
                  endTimestamp: new Date(stopTime),
                }, {
                  onSuccess: () => {
                    // 2. Create new infusion after a gap (background)
                    createMedication.mutate({
                      anesthesiaRecordId,
                      itemId: item.id,
                      timestamp: new Date(newStartTime),
                      type: 'infusion_start' as const,
                      rate: 'free',
                      dose: session.dose,
                    });
                  },
                });
              }}
              variant="default"
              data-testid="button-freeflow-start-new"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Start New Infusion
            </Button>
            <Button
              onClick={() => {
                if (!pendingFreeFlowStop) return;
                const { session, clickTime } = pendingFreeFlowStop;
                
                // Optimistic update: Immediately update UI
                setFreeFlowSessions(prev => {
                  const sessions = prev[session.swimlaneId] || [];
                  return {
                    ...prev,
                    [session.swimlaneId]: sessions.map(s => 
                      s.startTime === session.startTime 
                        ? { ...s, endTime: clickTime }
                        : s
                    ),
                  };
                });
                
                // Add visual end marker (tick without dose value)
                setInfusionData(prev => {
                  const existingData = prev[session.swimlaneId] || [];
                  return {
                    ...prev,
                    [session.swimlaneId]: [...existingData, [clickTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
                  };
                });
                
                // Close dialog immediately
                setShowFreeFlowStopDialog(false);
                setPendingFreeFlowStop(null);
                
                // Show success message immediately
                toast({
                  title: "Infusion stopped",
                  description: `${session.label} stopped at ${formatTime(clickTime)}`,
                });
                
                // Background: Persist to database
                const matchingMedication = data.medications?.find(med => {
                  const medTime = new Date(med.timestamp).getTime();
                  return med.type === 'infusion_start' && 
                         med.rate === 'free' &&
                         Math.abs(medTime - session.startTime) < 1000; // Within 1 second tolerance
                });
                
                if (matchingMedication) {
                  updateMedication.mutate({
                    id: matchingMedication.id,
                    endTimestamp: new Date(clickTime),
                  });
                }
              }}
              variant="outline"
              data-testid="button-freeflow-stop"
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Stop Infusion
            </Button>
            
            {/* Spacing divider */}
            <div className="border-t border-border my-2"></div>
            
            {/* Secondary action: Duplicate */}
            <Button
              onClick={() => {
                if (!pendingFreeFlowStop || !anesthesiaRecordId) return;
                const { session, clickTime } = pendingFreeFlowStop;
                
                // DUPLICATE action: Create a parallel infusion (keep current running)
                // Extract item ID from swimlane ID
                const groupMatch = session.swimlaneId.match(/admingroup-([a-f0-9-]+)-item-([a-f0-9-]+)/);
                if (!groupMatch) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Unable to duplicate infusion",
                  });
                  return;
                }
                
                const itemId = groupMatch[2];
                const item = anesthesiaItems.find(i => i.id === itemId);
                
                if (!item) {
                  toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Item not found",
                  });
                  return;
                }
                
                const duplicateStartTime = clickTime; // Start at current time
                
                // Optimistic update: Add new parallel session
                setFreeFlowSessions(prev => {
                  const sessions = prev[session.swimlaneId] || [];
                  
                  // Add duplicate session with temporary ID
                  const duplicateSession: FreeFlowSession = {
                    id: `temp-duplicate-${Date.now()}`,
                    swimlaneId: session.swimlaneId,
                    startTime: duplicateStartTime,
                    dose: session.dose,
                    label: session.label,
                  };
                  
                  return {
                    ...prev,
                    [session.swimlaneId]: [...sessions, duplicateSession].sort((a, b) => a.startTime - b.startTime),
                  };
                });
                
                // Add dose marker to infusionData
                setInfusionData(prev => {
                  const existingData = prev[session.swimlaneId] || [];
                  return {
                    ...prev,
                    [session.swimlaneId]: [...existingData, [duplicateStartTime, session.dose] as [number, string]].sort((a, b) => a[0] - b[0]),
                  };
                });
                
                // Close dialog immediately
                setShowFreeFlowStopDialog(false);
                setPendingFreeFlowStop(null);
                
                // Show success message immediately
                toast({
                  title: "Parallel infusion created",
                  description: `Duplicate ${session.label} started with dose ${session.dose}`,
                });
                
                // Background: Persist to database
                createMedication.mutate({
                  anesthesiaRecordId,
                  itemId: item.id,
                  timestamp: new Date(duplicateStartTime),
                  type: 'infusion_start' as const,
                  rate: 'free',
                  dose: session.dose,
                });
              }}
              variant="secondary"
              data-testid="button-freeflow-duplicate"
            >
              <Copy className="w-4 h-4 mr-2" />
              Duplicate (Parallel Infusion)
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Free-Flow Resume Dialog (Scenario 3: Stopped area clicked) */}
      <AlertDialog open={showFreeFlowRestartDialog} onOpenChange={setShowFreeFlowRestartDialog}>
        <AlertDialogContent data-testid="dialog-freeflow-restart">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingFreeFlowRestart?.previousSession.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Resume the stopped infusion with dose: <span className="font-semibold">{pendingFreeFlowRestart?.previousSession.dose}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4 my-4">
            <Button
              onClick={() => {
                if (!pendingFreeFlowRestart) return;
                const { previousSession } = pendingFreeFlowRestart;
                
                // Optimistic update: Immediately update UI to remove endTime
                setFreeFlowSessions(prev => {
                  const sessions = prev[previousSession.swimlaneId] || [];
                  return {
                    ...prev,
                    [previousSession.swimlaneId]: sessions.map(s => 
                      s.id === previousSession.id 
                        ? { ...s, endTime: undefined }
                        : s
                    ),
                  };
                });
                
                // Close dialog immediately
                setShowFreeFlowRestartDialog(false);
                setPendingFreeFlowRestart(null);
                
                // Show success message immediately
                toast({
                  title: "Infusion resumed",
                  description: `${previousSession.label} continues with dose ${previousSession.dose}`,
                });
                
                // Background: Persist to database (clear the stop timestamp)
                updateMedication.mutate({ 
                  id: previousSession.id,
                  endTimestamp: null as any,
                });
              }}
              variant="default"
              className="w-full"
              data-testid="button-freeflow-resume"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Resume
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rate Infusion Stop/Start-New Dialog (Running rate infusion clicked) */}
      <AlertDialog open={showRateStopDialog} onOpenChange={setShowRateStopDialog}>
        <AlertDialogContent data-testid="dialog-rate-stop">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRateStop?.session.label}</AlertDialogTitle>
            <AlertDialogDescription>
              This rate infusion is currently running. Choose an action:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 my-4">
            <Button
              onClick={() => {
                if (!pendingRateStop) return;
                const { session, clickTime } = pendingRateStop;
                
                // Optimistic update: Immediately update UI to set endTime
                setRateInfusionSessions(prev => {
                  const sessions = prev[session.swimlaneId] || [];
                  return {
                    ...prev,
                    [session.swimlaneId]: sessions.map(s => 
                      s.id === session.id 
                        ? { ...s, endTime: clickTime, state: 'stopped' as const }
                        : s
                    ),
                  };
                });
                
                // Close dialog immediately
                setShowRateStopDialog(false);
                setPendingRateStop(null);
                
                // Show success message immediately
                toast({
                  title: "Rate infusion stopped",
                  description: `${session.label} stopped at ${new Date(clickTime).toLocaleTimeString()}`,
                });
                
                // Background: Persist to database (set the stop timestamp)
                updateMedication.mutate({ 
                  id: session.id,
                  endTimestamp: new Date(clickTime),
                });
              }}
              variant="destructive"
              data-testid="button-rate-stop"
            >
              <StopCircle className="w-4 h-4 mr-2" />
              Stop
            </Button>
            
            <Button
              onClick={() => {
                if (!pendingRateStop || !anesthesiaRecordId) return;
                const { session, clickTime } = pendingRateStop;
                
                // Calculate new start time (1 minute after stop time)
                const newStartTime = clickTime + 60000;
                
                // Optimistic update: 1. Stop current session
                setRateInfusionSessions(prev => {
                  const sessions = prev[session.swimlaneId] || [];
                  return {
                    ...prev,
                    [session.swimlaneId]: sessions.map(s => 
                      s.id === session.id 
                        ? { ...s, endTime: clickTime, state: 'stopped' as const }
                        : s
                    ),
                  };
                });
                
                // Close dialog immediately
                setShowRateStopDialog(false);
                setPendingRateStop(null);
                
                // Show success message immediately
                toast({
                  title: "New rate infusion started",
                  description: `Stopped at ${new Date(clickTime).toLocaleTimeString()}, new infusion starts at ${new Date(newStartTime).toLocaleTimeString()}`,
                });
                
                // Background: 1. Stop current (set the stop timestamp)
                updateMedication.mutate({ 
                  id: session.id,
                  endTimestamp: new Date(clickTime),
                }, {
                  onSuccess: () => {
                    // 2. Find the item for this session
                    const groupMatch = session.swimlaneId.match(/admingroup-([a-f0-9-]+)-item-([a-f0-9-]+)/);
                    if (!groupMatch) return;
                    
                    const itemId = groupMatch[2];
                    const item = anesthesiaItems.find(i => i.id === itemId);
                    if (!item) return;
                    
                    // 3. Get the last segment to continue with same rate
                    const lastSegment = session.segments[session.segments.length - 1];
                    
                    // 4. Create new infusion after a gap (background)
                    createMedication.mutate({
                      anesthesiaRecordId,
                      itemId: item.id,
                      timestamp: new Date(newStartTime),
                      type: 'infusion_start' as const,
                      rate: lastSegment?.rate || '0',
                      dose: session.syringeQuantity,
                    });
                  },
                });
              }}
              variant="outline"
              data-testid="button-rate-start-new"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Start New Infusion
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rate Infusion Resume Dialog (Stopped rate infusion clicked) */}
      <AlertDialog open={showRateRestartDialog} onOpenChange={setShowRateRestartDialog}>
        <AlertDialogContent data-testid="dialog-rate-restart">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingRateRestart?.previousSession.label}</AlertDialogTitle>
            <AlertDialogDescription>
              Resume the stopped rate infusion with rate: <span className="font-semibold">{pendingRateRestart?.previousSession.segments?.[pendingRateRestart.previousSession.segments.length - 1]?.rate || '?'} {pendingRateRestart?.previousSession.segments?.[0]?.rateUnit || ''}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-4 my-4">
            <Button
              onClick={() => {
                if (!pendingRateRestart) return;
                const { previousSession } = pendingRateRestart;
                
                // Optimistic update: Immediately update UI to remove endTime and set state to running
                setRateInfusionSessions(prev => {
                  const sessions = prev[previousSession.swimlaneId] || [];
                  return {
                    ...prev,
                    [previousSession.swimlaneId]: sessions.map(s => 
                      s.id === previousSession.id 
                        ? { ...s, endTime: null, state: 'running' as const }
                        : s
                    ),
                  };
                });
                
                // Close dialog immediately
                setShowRateRestartDialog(false);
                setPendingRateRestart(null);
                
                // Show success message immediately
                toast({
                  title: "Rate infusion resumed",
                  description: `${previousSession.label} continues at ${previousSession.segments?.[previousSession.segments.length - 1]?.rate || '?'} ${previousSession.segments?.[0]?.rateUnit || ''}`,
                });
                
                // Background: Persist to database (clear the stop timestamp)
                updateMedication.mutate({ 
                  id: previousSession.id,
                  endTimestamp: null as any,
                });
              }}
              variant="default"
              className="w-full"
              data-testid="button-rate-resume"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Resume
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Medication Reorder Mode Dialog - Folder-grouped */}
      <Dialog open={isReorderMode} onOpenChange={(open) => !open && cancelReorderMode()}>
        <DialogContent className="max-w-2xl max-h-[80vh]" data-testid="dialog-reorder-medications">
          <DialogHeader>
            <DialogTitle>{t("anesthesia.timeline.reorderMedications")}</DialogTitle>
            <DialogDescription>
              {t("anesthesia.timeline.reorderMedicationsDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh] p-4">
            <div className="space-y-4">
              {Object.entries(reorderedItemsByFolder)
                .sort(([aId], [bId]) => {
                  // Sort: put "unassigned" at the end
                  if (aId === 'unassigned') return 1;
                  if (bId === 'unassigned') return -1;
                  // Otherwise maintain order by folder name
                  const aFolder = administrationGroups.find(g => g.id === aId);
                  const bFolder = administrationGroups.find(g => g.id === bId);
                  return (aFolder?.name || '').localeCompare(bFolder?.name || '');
                })
                .map(([folderId, items]) => {
                const folder = administrationGroups.find(g => g.id === folderId);
                const folderName = folder?.name || (folderId === 'unassigned' ? 'Unassigned' : 'Unknown');
                const isCollapsed = collapsedFolders.has(folderId);
                
                return (
                  <div key={folderId} className="border rounded-lg overflow-hidden">
                    {/* Folder Header - Collapsible */}
                    <button
                      onClick={() => {
                        setCollapsedFolders(prev => {
                          const next = new Set(prev);
                          if (next.has(folderId)) {
                            next.delete(folderId);
                          } else {
                            next.add(folderId);
                          }
                          return next;
                        });
                      }}
                      className="w-full flex items-center justify-between p-3 bg-muted hover:bg-muted/80 transition-colors"
                      data-testid={`button-toggle-folder-${folderId}`}
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        <span className="font-semibold">{folderName}</span>
                        <Badge variant="secondary">{items.length}</Badge>
                      </div>
                    </button>
                    
                    {/* Folder Items - Drag-and-drop within folder only */}
                    {!isCollapsed && (
                      <div className="p-3">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEndInFolder(folderId)}
                        >
                          <SortableContext
                            items={items.map(item => item.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {items.map((item) => (
                                <SortableMedicationItem key={item.id} id={item.id} item={item} />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelReorderMode}
              data-testid="button-cancel-reorder"
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={saveReorderChanges}
              disabled={reorderMedsMutation.isPending}
              data-testid="button-save-reorder"
            >
              {reorderMedsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  {t("common.save")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Free-Flow Infusion Sheet */}
      <FreeFlowManageDialog
        open={showFreeFlowSheet}
        onOpenChange={setShowFreeFlowSheet}
        freeFlowSheetSession={freeFlowSheetSession}
        freeFlowSessions={freeFlowSessions}
        infusionData={infusionData}
        onSheetSave={handleSheetSave}
        onSheetDelete={handleSheetDelete}
        onSheetStop={handleSheetStop}
        onSheetStartNew={handleSheetStartNew}
        onSheetDuplicate={handleSheetDuplicate}
        sheetDoseInput={sheetDoseInput}
        onSheetDoseInputChange={setSheetDoseInput}
        sheetTimeInput={sheetTimeInput}
        onSheetTimeInputChange={setSheetTimeInput}
      />

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
      <RateSelectionDialog
        open={showRateSelectionDialog}
        onOpenChange={setShowRateSelectionDialog}
        pendingRateSelection={pendingRateSelection}
        onRateSelection={handleRateSelection}
        onCustomRateEntry={handleCustomRateEntry}
        administrationUnit={pendingRateSelection?.administrationUnit}
      />

      {/* Rate Management Dialog (edit/stop/change existing rate) */}
      <RateManageDialog
        open={showRateManageDialog}
        onOpenChange={setShowRateManageDialog}
        managingRate={managingRate}
        infusionData={infusionData}
        rateManageTime={rateManageTime}
        onRateManageTimeChange={setRateManageTime}
        onRateStop={handleRateStop}
        onRateStart={handleRateStart}
        onRateStartNew={handleRateStartNew}
        onRateChange={handleRateChange}
        onTciStop={handleTciStop}
        isRunning={managingRate?.isRunning}
        administrationUnit={managingRate?.administrationUnit}
        ampuleUnit={managingRate?.ampuleUnit}
      />

      {/* Medication Total Edit Dialog (for editing cumulative dose amounts) */}
      <Dialog open={showTciAmountEditDialog} onOpenChange={setShowTciAmountEditDialog}>
        <DialogContent className="sm:max-w-[350px]" data-testid="dialog-medication-total-edit">
          <DialogHeader>
            <DialogTitle>{editingTciAmount?.label}</DialogTitle>
            <DialogDescription>
              {editingTciAmount?.isManualOverride 
                ? t("anesthesia.timeline.editManualTotal", "Edit the manual override for total amount")
                : t("anesthesia.timeline.setManualTotal", "Set a manual override for the total amount")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="medication-total-edit">{t("anesthesia.timeline.totalAmount", "Total amount")} ({editingTciAmount?.unit})</Label>
              <Input
                id="medication-total-edit"
                type="number"
                inputMode="decimal"
                className="text-center text-xl font-bold h-12"
                data-testid="input-medication-total-edit"
                value={tciAmountEditInput}
                onChange={(e) => setTciAmountEditInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const parsedAmount = parseFloat(tciAmountEditInput);
                    if (!isNaN(parsedAmount) && parsedAmount > 0 && editingTciAmount) {
                      const newDose = `${tciAmountEditInput} ${editingTciAmount.unit}`;
                      
                      // If we have an existing record ID, update it; otherwise create new manual_total
                      if (editingTciAmount.stopRecordId) {
                        updateMedication.mutate({
                          id: editingTciAmount.stopRecordId,
                          dose: newDose,
                        }, {
                          onSuccess: () => {
                            toast({
                              title: t("anesthesia.timeline.totalUpdated", "Total updated"),
                              description: `${editingTciAmount.label}: ${newDose}`,
                            });
                            setShowTciAmountEditDialog(false);
                            setEditingTciAmount(null);
                            setTciAmountEditInput("");
                          },
                          onError: () => {
                            toast({ title: "Error", description: "Failed to update", variant: "destructive" });
                          }
                        });
                      } else if (editingTciAmount.itemId && anesthesiaRecordId) {
                        // Create new manual_total record
                        createMedication.mutate({
                          anesthesiaRecordId,
                          itemId: editingTciAmount.itemId,
                          type: 'manual_total',
                          dose: newDose,
                          timestamp: new Date().toISOString(),
                        }, {
                          onSuccess: () => {
                            toast({
                              title: t("anesthesia.timeline.manualTotalSet", "Manual total set"),
                              description: `${editingTciAmount.label}: ${newDose}`,
                            });
                            setShowTciAmountEditDialog(false);
                            setEditingTciAmount(null);
                            setTciAmountEditInput("");
                          },
                          onError: () => {
                            toast({ title: "Error", description: "Failed to set manual total", variant: "destructive" });
                          }
                        });
                      }
                    }
                  }
                }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowTciAmountEditDialog(false);
                  setEditingTciAmount(null);
                  setTciAmountEditInput("");
                }}
                data-testid="button-medication-total-cancel"
              >
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => {
                  const parsedAmount = parseFloat(tciAmountEditInput);
                  if (!isNaN(parsedAmount) && parsedAmount > 0 && editingTciAmount) {
                    const newDose = `${tciAmountEditInput} ${editingTciAmount.unit}`;
                    
                    // If we have an existing record ID, update it; otherwise create new manual_total
                    if (editingTciAmount.stopRecordId) {
                      updateMedication.mutate({
                        id: editingTciAmount.stopRecordId,
                        dose: newDose,
                      }, {
                        onSuccess: () => {
                          toast({
                            title: t("anesthesia.timeline.totalUpdated", "Total updated"),
                            description: `${editingTciAmount.label}: ${newDose}`,
                          });
                          setShowTciAmountEditDialog(false);
                          setEditingTciAmount(null);
                          setTciAmountEditInput("");
                        },
                        onError: () => {
                          toast({ title: "Error", description: "Failed to update", variant: "destructive" });
                        }
                      });
                    } else if (editingTciAmount.itemId && anesthesiaRecordId) {
                      // Create new manual_total record
                      createMedication.mutate({
                        anesthesiaRecordId,
                        itemId: editingTciAmount.itemId,
                        type: 'manual_total',
                        dose: newDose,
                        timestamp: new Date().toISOString(),
                      }, {
                        onSuccess: () => {
                          toast({
                            title: t("anesthesia.timeline.manualTotalSet", "Manual total set"),
                            description: `${editingTciAmount.label}: ${newDose}`,
                          });
                          setShowTciAmountEditDialog(false);
                          setEditingTciAmount(null);
                          setTciAmountEditInput("");
                        },
                        onError: () => {
                          toast({ title: "Error", description: "Failed to set manual total", variant: "destructive" });
                        }
                      });
                    }
                  }
                }}
                disabled={!tciAmountEditInput.trim() || isNaN(Number(tciAmountEditInput)) || Number(tciAmountEditInput) <= 0}
                data-testid="button-medication-total-save"
              >
                {t("common.save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Output Value Entry Dialog */}
      <OutputDialog
        open={showOutputDialog}
        onOpenChange={setShowOutputDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        pendingOutputValue={pendingOutputValue}
        onOutputCreated={() => {
          setPendingOutputValue(null);
        }}
        readOnly={!canWrite}
      />

      {/* Ventilation Parameter Entry Dialog */}
      <VentilationDialog
        open={showVentilationDialog}
        onOpenChange={setShowVentilationDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        pendingVentilationValue={pendingVentilationValue}
        onVentilationCreated={() => {
          setPendingVentilationValue(null);
        }}
        readOnly={!canWrite}
      />

      {/* Edit Value Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-edit-value">
          <DialogHeader>
            <DialogTitle>Edit Vital Sign Value</DialogTitle>
            <DialogDescription>
              Modify the vital sign measurement or delete it from the timeline.
            </DialogDescription>
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

      {/* Manual Vitals Entry Dialog */}
      <ManualVitalsDialog
        open={showManualVitalsDialog}
        onOpenChange={setShowManualVitalsDialog}
        initialTime={manualVitalsTime}
        initialValues={manualVitalsInitialValues}
        onSave={handleManualVitalsSave}
      />

      {/* Bulk Edit Anesthesia Times Dialog */}
      <Dialog open={bulkEditDialogOpen} onOpenChange={setBulkEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-bulk-edit-times">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.timeline.bulkEditTimes.title')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.timeline.bulkEditTimes.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            {/* Calculated Durations */}
            {(() => {
              const o1Marker = timeMarkers.find(m => m.code === 'O1');
              const o2Marker = timeMarkers.find(m => m.code === 'O2');
              const x1Marker = timeMarkers.find(m => m.code === 'X1');
              const x2Marker = timeMarkers.find(m => m.code === 'X2');
              
              const formatDuration = (startTime: number, endTime: number): string => {
                const durationMs = endTime - startTime;
                if (durationMs < 0) return t('anesthesia.timeline.bulkEditTimes.invalidDuration');
                
                const hours = Math.floor(durationMs / (1000 * 60 * 60));
                const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                
                if (hours > 0) {
                  return `${hours}h ${minutes}min`;
                } else {
                  return `${minutes}min`;
                }
              };
              
              const surgeryDuration = o1Marker?.time && o2Marker?.time 
                ? formatDuration(o1Marker.time, o2Marker.time)
                : null;
              
              const anesthesiaDuration = x1Marker?.time && x2Marker?.time
                ? formatDuration(x1Marker.time, x2Marker.time)
                : null;
              
              if (!surgeryDuration && !anesthesiaDuration) return null;
              
              return (
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <div className="text-sm font-medium mb-2 text-foreground/70">{t('anesthesia.timeline.bulkEditTimes.calculatedDurations')}</div>
                  <div className="grid gap-2">
                    {surgeryDuration && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-foreground/70">{t('anesthesia.timeline.bulkEditTimes.surgeryTime')}</span>
                        <Badge variant="secondary" className="font-mono" data-testid="calculated-surgery-time">
                          {surgeryDuration}
                        </Badge>
                      </div>
                    )}
                    {anesthesiaDuration && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-foreground/70">{t('anesthesia.timeline.bulkEditTimes.anesthesiaTime')}</span>
                        <Badge variant="secondary" className="font-mono" data-testid="calculated-anesthesia-time">
                          {anesthesiaDuration}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            
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
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">
                      {t(`anesthesia.timeline.timeMarkerLabels.${marker.code}`, marker.label)}
                    </Label>
                    {marker.time !== null && (
                      <Badge variant="outline" className="text-xs font-normal text-muted-foreground" data-testid={`elapsed-time-${marker.code}`}>
                        {formatElapsedTime(marker.time)}
                      </Badge>
                    )}
                  </div>
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
                      {t('anesthesia.timeline.bulkEditTimes.notSetClickToPlace')}
                    </div>
                  )}
                </div>
                {marker.time === null ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="pointer-events-auto relative z-10"
                    onClick={() => {
                      const updated = [...timeMarkers];
                      updated[index] = { ...updated[index], time: Date.now() };
                      setTimeMarkers(updated);
                    }}
                    data-testid={`button-now-${marker.code}`}
                  >
                    {t('anesthesia.timeline.bulkEditTimes.now')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="pointer-events-auto relative z-10"
                    onClick={() => {
                      const updated = [...timeMarkers];
                      updated[index] = { ...updated[index], time: null };
                      setTimeMarkers(updated);
                    }}
                    data-testid={`button-clear-${marker.code}`}
                  >
                    {t('anesthesia.timeline.bulkEditTimes.clear')}
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
              {t('anesthesia.timeline.bulkEditTimes.close')}
            </Button>
            <Button
              onClick={() => {
                console.log('[TIME_MARKERS] Save button clicked', {
                  anesthesiaRecordId,
                  timeMarkersCount: timeMarkers.length,
                  timeMarkers
                });

                const pacuEndMarker = timeMarkers.find(m => m.code === 'P');
                const pacuEndNewlySet = pacuEndMarker?.time != null && !bulkEditPacuEndWasSetRef.current;
                if (pacuEndNewlySet && inventoryCommitState.hasPendingCommits) {
                  console.log('[P_CHECK] Blocking PACU End (bulk edit dialog) - pending commits exist');
                  toast({
                    title: t('anesthesia.pacuEnd.cannotSetTitle', 'Cannot set PACU End'),
                    description: t('anesthesia.pacuEnd.commitInventoryFirst', 'Please commit all inventory items before marking PACU End.'),
                    variant: "destructive",
                  });
                  return;
                }
                
                // Save time markers to database
                if (anesthesiaRecordId) {
                  console.log('[TIME_MARKERS] Triggering mutation...');
                  saveTimeMarkersMutation.mutate({
                    anesthesiaRecordId,
                    timeMarkers,
                  }, {
                    onSuccess: () => {
                      console.log('[TIME_MARKERS] Save successful, closing dialog');
                      setBulkEditDialogOpen(false);
                      toast({
                        title: t('anesthesia.timeline.bulkEditTimes.timesSaved'),
                        description: t('anesthesia.timeline.bulkEditTimes.timesUpdated'),
                        duration: 2000,
                      });
                    },
                    onError: (error) => {
                      console.error('[TIME_MARKERS] Save failed', error);
                      toast({
                        title: t('anesthesia.timeline.bulkEditTimes.errorSaving'),
                        description: error instanceof Error ? error.message : "Failed to save times",
                        variant: "destructive",
                      });
                    }
                  });
                } else {
                  console.error('[TIME_MARKERS] Cannot save - no anesthesiaRecordId');
                }
              }}
              data-testid="button-save-bulk-edit"
              disabled={saveTimeMarkersMutation.isPending}
            >
              {saveTimeMarkersMutation.isPending ? t('anesthesia.timeline.bulkEditTimes.saving') : t('anesthesia.timeline.bulkEditTimes.save')}
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
            <DialogTitle>{t('anesthesia.timeline.editTimeMarker.title')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.timeline.editTimeMarker.description')}
            </DialogDescription>
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
                <div className="flex-1">
                  <div className="font-medium">{t(`anesthesia.timeline.timeMarkerLabels.${editingTimeMarker.marker.code}`, editingTimeMarker.marker.label)}</div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {editingTimeMarker.marker.time 
                        ? formatTime(editingTimeMarker.marker.time)
                        : t('anesthesia.timeline.editTimeMarker.notSet')}
                    </span>
                    {editingTimeMarker.marker.time && (
                      <Badge variant="secondary" className="text-xs font-normal" data-testid="elapsed-time-single">
                        {formatElapsedTime(editingTimeMarker.marker.time)}
                      </Badge>
                    )}
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
            saveLabel={t('anesthesia.timeline.editTimeMarker.done')}
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
            <DialogDescription>
              Review the AI-extracted vitals and parameters before adding them to the timeline.
            </DialogDescription>
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
      <EventDialog
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingEvent={editingEvent}
        pendingEvent={pendingEvent}
        onEventCreated={() => {
          setPendingEvent(null);
        }}
        onEventUpdated={() => {
          setEditingEvent(null);
        }}
        onEventDeleted={() => {
          setEditingEvent(null);
        }}
        readOnly={!canWrite}
      />

      {/* Medication Dose Edit Dialog */}
      <MedicationEditDialog
        open={showMedicationEditDialog}
        onOpenChange={setShowMedicationEditDialog}
        anesthesiaRecordId={anesthesiaRecordId || null}
        editingMedicationDose={editingMedicationDose}
        activeSwimlanes={activeSwimlanes}
        onMedicationDoseUpdated={() => {
          setEditingMedicationDose(null);
        }}
        onMedicationDoseDeleted={() => {
          setEditingMedicationDose(null);
        }}
        readOnly={!canWrite}
      />

      {/* Ventilation Value Edit Dialog */}
      <VentilationEditDialog
        open={showVentilationEditDialog}
        onOpenChange={setShowVentilationEditDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingVentilationValue={editingVentilationValue}
        onVentilationUpdated={() => {
          setEditingVentilationValue(null);
        }}
        onVentilationDeleted={() => {
          setEditingVentilationValue(null);
        }}
        readOnly={!canWrite}
      />

      {/* Ventilation Mode Edit Dialog */}
      <VentilationModeEditDialog
        open={showVentilationModeEditDialog}
        onOpenChange={setShowVentilationModeEditDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingVentilationMode={editingVentilationMode}
        onVentilationModeUpdated={() => {
          setEditingVentilationMode(null);
        }}
        onVentilationModeDeleted={() => {
          setEditingVentilationMode(null);
        }}
        readOnly={!canWrite}
      />

      {/* Ventilation Mode Add Dialog */}
      <VentilationModeAddDialog
        open={showVentilationModeAddDialog}
        onOpenChange={setShowVentilationModeAddDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        pendingVentilationMode={pendingVentilationMode}
        ventilationModeData={ventilationModeData}
        onVentilationModeCreated={() => {
          setPendingVentilationMode(null);
        }}
        readOnly={!canWrite}
      />

      {/* Heart Rhythm Dialog */}
      <HeartRhythmDialog
        open={showHeartRhythmDialog}
        onOpenChange={setShowHeartRhythmDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingHeartRhythm={editingHeartRhythm}
        pendingHeartRhythm={pendingHeartRhythm}
        onHeartRhythmCreated={() => {
          setPendingHeartRhythm(null);
          setEditingHeartRhythm(null);
        }}
        onHeartRhythmUpdated={() => {
          setEditingHeartRhythm(null);
        }}
        onHeartRhythmDeleted={() => {
          setEditingHeartRhythm(null);
        }}
        readOnly={!canWrite}
      />

      {/* BIS Dialog */}
      <BISDialog
        open={showBISDialog}
        onOpenChange={setShowBISDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingBIS={editingBIS}
        pendingBIS={pendingBIS}
        onBISCreated={() => {
          setPendingBIS(null);
          setEditingBIS(null);
        }}
        onBISUpdated={() => {
          setEditingBIS(null);
        }}
        onBISDeleted={() => {
          setEditingBIS(null);
        }}
        readOnly={!canWrite}
      />

      {/* TOF Dialog */}
      <TOFDialog
        open={showTOFDialog}
        onOpenChange={setShowTOFDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingTOF={editingTOF}
        pendingTOF={pendingTOF}
        onTOFCreated={() => {
          setPendingTOF(null);
          setEditingTOF(null);
        }}
        onTOFUpdated={() => {
          setEditingTOF(null);
        }}
        onTOFDeleted={() => {
          setEditingTOF(null);
        }}
        readOnly={!canWrite}
      />

      {/* VAS Dialog (PACU mode) */}
      <VASDialog
        open={showVASDialog}
        onOpenChange={setShowVASDialog}
        anesthesiaRecordId={anesthesiaRecordId ?? null}
        editingVAS={editingVAS}
        pendingVAS={pendingVAS}
        onVASCreated={() => {
          setPendingVAS(null);
          setEditingVAS(null);
        }}
        onVASUpdated={() => {
          setEditingVAS(null);
        }}
        onVASDeleted={() => {
          setEditingVAS(null);
        }}
        readOnly={!canWrite}
      />

      {/* Scores Dialog (PACU mode) */}
      <ScoresDialog
        open={showScoresDialog}
        onOpenChange={setShowScoresDialog}
        anesthesiaRecordId={anesthesiaRecordId ?? null}
        editingScore={editingScore}
        pendingScore={pendingScore}
        onScoreCreated={() => {
          setPendingScore(null);
          setEditingScore(null);
        }}
        onScoreUpdated={() => {
          setEditingScore(null);
        }}
        onScoreDeleted={() => {
          setEditingScore(null);
        }}
        readOnly={!canWrite}
      />

      {/* Position Dialog */}
      <PositionDialog
        open={showPositionDialog}
        onOpenChange={setShowPositionDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingPosition={editingPosition}
        pendingPosition={pendingPosition}
        onPositionCreated={() => {
          setPendingPosition(null);
          setEditingPosition(null);
        }}
        onPositionUpdated={() => {
          setEditingPosition(null);
        }}
        onPositionDeleted={() => {
          setEditingPosition(null);
        }}
        readOnly={!canWrite}
      />

      {/* Ventilation Bulk Entry Dialog */}
      <VentilationBulkDialog
        open={showVentilationBulkDialog}
        onOpenChange={(open) => {
          setShowVentilationBulkDialog(open);
          if (!open) {
            setVentilationEntrySkipMode(false);
            setEditingVentilationEntryTimestamp(null);
          }
        }}
        anesthesiaRecordId={anesthesiaRecordId}
        pendingVentilationBulk={pendingVentilationBulk}
        ventilationModeData={ventilationModeData}
        patientWeight={patientWeight}
        onVentilationBulkCreated={() => {
          setPendingVentilationBulk(null);
          setVentilationEntrySkipMode(false);
          setEditingVentilationEntryTimestamp(null);
        }}
        readOnly={!canWrite}
        editingTimestamp={editingVentilationEntryTimestamp}
        skipModeSelection={ventilationEntrySkipMode}
      />

      {/* Output Bulk Entry Dialog */}
      <OutputBulkDialog
        open={showOutputBulkDialog}
        onOpenChange={setShowOutputBulkDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        pendingOutputBulk={pendingOutputBulk}
        onOutputBulkCreated={() => {
          setPendingOutputBulk(null);
        }}
        readOnly={!canWrite}
      />

      {/* Output Value Edit Dialog */}
      <OutputEditDialog
        open={showOutputEditDialog}
        onOpenChange={setShowOutputEditDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        editingOutputValue={editingOutputValue}
        onOutputUpdated={() => {
          setEditingOutputValue(null);
        }}
        onOutputDeleted={() => {
          setEditingOutputValue(null);
        }}
        readOnly={!canWrite}
      />

      {/* Bulk Vitals Entry Dialog */}
      <BulkVitalsDialog
        open={showBulkVitalsDialog}
        onOpenChange={setShowBulkVitalsDialog}
        anesthesiaRecordId={anesthesiaRecordId}
        initialTime={bulkVitalsTime}
        onVitalsCreated={() => {
          setShowBulkVitalsDialog(false);
        }}
        readOnly={!canWrite}
      />

      {/* Loading overlay for image processing */}
      {isProcessingImage && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center">
          <div className="bg-background rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="text-sm font-medium">Analyzing monitor image...</p>
          </div>
        </div>
      )}

      {/* Events & Times Sliding Panel */}
      <EventsTimesPanel
        open={showEventsTimesPanel}
        onClose={() => setShowEventsTimesPanel(false)}
        events={eventComments}
        timeMarkers={timeMarkers}
        onEventClick={(event) => {
          setEditingEvent(event);
          setEventEditTime(event.time);
          setShowEventDialog(true);
          setShowEventsTimesPanel(false);
        }}
        onTimeMarkerClick={(marker, index) => {
          setEditingTimeMarker({ index, marker });
          setTimeMarkerEditDialogOpen(true);
          setShowEventsTimesPanel(false);
        }}
      />

      {/* Unlock Record Dialog */}
      <Dialog open={showUnlockDialog} onOpenChange={(open) => {
        setShowUnlockDialog(open);
        if (!open) setUnlockReason('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('anesthesia.record.unlockTitle', 'Unlock Anesthesia Record')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.record.unlockDescription', 'This record is locked. Please provide a reason for unlocking it. This action will be logged for audit purposes.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="unlock-reason">{t('anesthesia.record.unlockReason', 'Reason for Unlocking')}</Label>
              <Textarea
                id="unlock-reason"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder={t('anesthesia.record.unlockReasonPlaceholder', 'Enter the reason for unlocking this record...')}
                className="min-h-[100px]"
                data-testid="input-unlock-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUnlockDialog(false);
                setUnlockReason('');
              }}
              data-testid="button-cancel-unlock"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (anesthesiaRecordId && unlockReason.trim()) {
                  unlockRecordMutation.mutate({ recordId: anesthesiaRecordId, reason: unlockReason.trim() });
                  setShowUnlockDialog(false);
                  setUnlockReason('');
                }
              }}
              disabled={!unlockReason.trim() || unlockRecordMutation.isPending}
              data-testid="button-confirm-unlock"
            >
              {unlockRecordMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <LockOpen className="w-4 h-4 mr-2" />
              )}
              {t('anesthesia.record.unlock', 'Unlock Record')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Friendly reminder dialog for inventory commit after X2 */}
      <AlertDialog open={showCommitReminder} onOpenChange={setShowCommitReminder}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inventory Commit Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              You've marked Anesthesia End. Don't forget to commit the inventory items that were used during this procedure.
              <br /><br />
              You can commit them from the Inventory tab when you're ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction data-testid="button-close-commit-reminder">Got it, thanks!</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TimelineContextProvider>
  );
});

