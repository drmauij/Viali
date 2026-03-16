import { useState } from "react";
import type { EventComment } from "@/hooks/useEventState";
import type { VentilationData } from "@/hooks/useVentilationState";
import type { OutputData } from "@/hooks/useOutputState";
import type { FreeFlowSession } from "@/hooks/useMedicationState";
import type { AdministrationGroup, AnesthesiaItem } from "./types";

// ── Types used only by dialog state ──

export type EditingHeartRhythm = { time: number; rhythm: string; index: number; id: string };
export type EditingBIS = { id: string; time: number; value: number; index: number };
export type EditingTOF = { id: string; time: number; value: string; percentage?: number; index: number };
export type EditingVAS = { id: string; time: number; value: number; index: number };
export type EditingScore = {
  id: string;
  time: number;
  scoreType: 'aldrete' | 'parsap';
  totalScore: number;
  aldreteScore?: any;
  parsapScore?: any;
  index: number;
};
export type EditingPosition = { id: string; time: number; position: string; index: number };
export type EditingMedicationDose = { swimlaneId: string; time: number; dose: string; index: number; id: string };
export type EditingVentilationValue = { paramKey: keyof VentilationData; time: number; value: string; index: number; label: string; id: string };
export type EditingVentilationMode = { time: number; mode: string; index: number; id: string };
export type PendingVentilationBulk = {
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
};
export type EditingOutputValue = { paramKey: keyof OutputData; time: number; value: string; index: number; label: string; id: string };
export type EditingInfusionValue = { swimlaneId: string; time: number; value: string; index: number };
export type PendingInfusionValue = { swimlaneId: string; time: number; label: string; itemId?: string; administrationUnit?: string | null };
export type PendingFreeFlowDose = { swimlaneId: string; time: number; label: string; administrationUnit?: string | null };
export type PendingFreeFlowStop = { session: FreeFlowSession; clickTime: number };
export type PendingFreeFlowRestart = { previousSession: FreeFlowSession; clickTime: number };
export type PendingRateStop = { session: any; clickTime: number };
export type PendingRateRestart = { previousSession: any; clickTime: number };

export type RateInfusionSegment = {
  startTime: number;
  rate: string;
  rateUnit: string;
};

export type RateInfusionSession = {
  swimlaneId: string;
  label: string;
  syringeQuantity: string;
  segments: RateInfusionSegment[];
  state: 'running' | 'paused' | 'stopped';
  startTime?: number;
  endTime?: number | null;
};

export type PendingRateSelection = {
  swimlaneId: string;
  time: number;
  label: string;
  rateOptions: string[];
  itemId?: string;
  administrationUnit?: string | null;
};

export type ManagingRate = {
  swimlaneId: string;
  time: number;
  value: string;
  index: number;
  label: string;
  rateOptions?: string[];
  rateUnit?: string;
  sessionId?: string;
  itemId?: string;
  isRunning?: boolean;
  administrationUnit?: string | null;
  ampuleUnit?: string | null;
};

export type EditingTciAmount = {
  stopRecordId: string;
  currentAmount: string;
  unit: string;
  label: string;
  swimlaneId: string;
  itemId?: string;
  isManualOverride?: boolean;
};

/**
 * Pure state hook that declares all dialog open/close, pending, and editing
 * states for the UnifiedTimeline component. No side-effects or external deps.
 */
export function useVitalsDialogState() {
  // ── Heart Rhythm ──
  const [showHeartRhythmDialog, setShowHeartRhythmDialog] = useState(false);
  const [pendingHeartRhythm, setPendingHeartRhythm] = useState<{ time: number } | null>(null);
  const [editingHeartRhythm, setEditingHeartRhythm] = useState<EditingHeartRhythm | null>(null);
  const [heartRhythmInput, setHeartRhythmInput] = useState("");
  const [heartRhythmEditTime, setHeartRhythmEditTime] = useState<number>(0);

  // ── BIS ──
  const [showBISDialog, setShowBISDialog] = useState(false);
  const [pendingBIS, setPendingBIS] = useState<{ time: number } | null>(null);
  const [editingBIS, setEditingBIS] = useState<EditingBIS | null>(null);

  // ── TOF ──
  const [showTOFDialog, setShowTOFDialog] = useState(false);
  const [pendingTOF, setPendingTOF] = useState<{ time: number } | null>(null);
  const [editingTOF, setEditingTOF] = useState<EditingTOF | null>(null);

  // ── VAS (PACU mode) ──
  const [showVASDialog, setShowVASDialog] = useState(false);
  const [pendingVAS, setPendingVAS] = useState<{ time: number } | null>(null);
  const [editingVAS, setEditingVAS] = useState<EditingVAS | null>(null);

  // ── Scores (PACU mode) ──
  const [showScoresDialog, setShowScoresDialog] = useState(false);
  const [pendingScore, setPendingScore] = useState<{ time: number } | null>(null);
  const [editingScore, setEditingScore] = useState<EditingScore | null>(null);

  // ── Position ──
  const [showPositionDialog, setShowPositionDialog] = useState(false);
  const [pendingPosition, setPendingPosition] = useState<{ time: number } | null>(null);
  const [editingPosition, setEditingPosition] = useState<EditingPosition | null>(null);

  // ── Event comments ──
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<{ time: number } | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventComment | null>(null);
  const [eventEditTime, setEventEditTime] = useState<number>(Date.now());
  const [eventHoverInfo, setEventHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<{ event: EventComment; x: number; y: number } | null>(null);

  // ── Medication dose edit ──
  const [showMedicationEditDialog, setShowMedicationEditDialog] = useState(false);
  const [editingMedicationDose, setEditingMedicationDose] = useState<EditingMedicationDose | null>(null);

  // ── Ventilation value edit ──
  const [showVentilationEditDialog, setShowVentilationEditDialog] = useState(false);
  const [editingVentilationValue, setEditingVentilationValue] = useState<EditingVentilationValue | null>(null);

  // ── Ventilation mode edit ──
  const [showVentilationModeEditDialog, setShowVentilationModeEditDialog] = useState(false);
  const [editingVentilationMode, setEditingVentilationMode] = useState<EditingVentilationMode | null>(null);

  // ── Ventilation mode add ──
  const [showVentilationModeAddDialog, setShowVentilationModeAddDialog] = useState(false);
  const [pendingVentilationMode, setPendingVentilationMode] = useState<{ time: number } | null>(null);

  // ── Ventilation bulk entry ──
  const [showVentilationBulkDialog, setShowVentilationBulkDialog] = useState(false);
  const [pendingVentilationBulk, setPendingVentilationBulk] = useState<PendingVentilationBulk | null>(null);
  const [ventilationBulkHoverInfo, setVentilationBulkHoverInfo] = useState<{ x: number; y: number; time: number } | null>(null);

  // ── Ventilation entry lane (params-only mode) ──
  const [ventilationEntrySkipMode, setVentilationEntrySkipMode] = useState(false);
  const [editingVentilationEntryTimestamp, setEditingVentilationEntryTimestamp] = useState<number | null>(null);

  // ── Output bulk entry ──
  const [showOutputBulkDialog, setShowOutputBulkDialog] = useState(false);
  const [pendingOutputBulk, setPendingOutputBulk] = useState<{ time: number } | null>(null);

  // ── Output value add (single value) ──
  const [showOutputDialog, setShowOutputDialog] = useState(false);
  const [pendingOutputValue, setPendingOutputValue] = useState<{ paramKey: keyof OutputData; time: number; label: string } | null>(null);

  // ── Output value edit ──
  const [showOutputEditDialog, setShowOutputEditDialog] = useState(false);
  const [editingOutputValue, setEditingOutputValue] = useState<EditingOutputValue | null>(null);

  // ── Infusion entry ──
  const [infusionHoverInfo, setInfusionHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showInfusionDialog, setShowInfusionDialog] = useState(false);
  const [pendingInfusionValue, setPendingInfusionValue] = useState<PendingInfusionValue | null>(null);
  const [infusionInput, setInfusionInput] = useState("");
  const [showInfusionEditDialog, setShowInfusionEditDialog] = useState(false);
  const [editingInfusionValue, setEditingInfusionValue] = useState<EditingInfusionValue | null>(null);
  const [infusionEditInput, setInfusionEditInput] = useState("");
  const [infusionEditTime, setInfusionEditTime] = useState<number>(0);

  // ── Free-Flow Infusion Sheet ──
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

  // ── Free-flow dose entry dialog ──
  const [showFreeFlowDoseDialog, setShowFreeFlowDoseDialog] = useState(false);
  const [pendingFreeFlowDose, setPendingFreeFlowDose] = useState<PendingFreeFlowDose | null>(null);
  const [freeFlowDoseInput, setFreeFlowDoseInput] = useState("");

  // ── Free-flow stop/start-new dialog ──
  const [showFreeFlowStopDialog, setShowFreeFlowStopDialog] = useState(false);
  const [pendingFreeFlowStop, setPendingFreeFlowStop] = useState<PendingFreeFlowStop | null>(null);

  // ── Free-flow resume dialog ──
  const [showFreeFlowRestartDialog, setShowFreeFlowRestartDialog] = useState(false);
  const [pendingFreeFlowRestart, setPendingFreeFlowRestart] = useState<PendingFreeFlowRestart | null>(null);

  // ── Rate infusion stop/start-new ──
  const [showRateStopDialog, setShowRateStopDialog] = useState(false);
  const [pendingRateStop, setPendingRateStop] = useState<PendingRateStop | null>(null);

  // ── Rate infusion resume ──
  const [showRateRestartDialog, setShowRateRestartDialog] = useState(false);
  const [pendingRateRestart, setPendingRateRestart] = useState<PendingRateRestart | null>(null);

  // ── Rate Infusion Sheet ──
  const [showRateSheet, setShowRateSheet] = useState(false);
  const [rateSheetSession, setRateSheetSession] = useState<{
    swimlaneId: string;
    label: string;
    clickMode: 'segment' | 'label';
    rateUnit: string;
    defaultDose?: string;
  } | null>(null);
  const [sheetRateInput, setSheetRateInput] = useState("");
  const [sheetRateTimeInput, setSheetRateTimeInput] = useState<number>(0);
  const [sheetQuantityInput, setSheetQuantityInput] = useState("");

  // ── Free-flow management dialog ──
  const [showFreeFlowManageDialog, setShowFreeFlowManageDialog] = useState(false);
  const [managingFreeFlowSession, setManagingFreeFlowSession] = useState<FreeFlowSession | null>(null);
  const [freeFlowManageTime, setFreeFlowManageTime] = useState<number>(0);

  // ── Rate selection dialog ──
  const [showRateSelectionDialog, setShowRateSelectionDialog] = useState(false);
  const [pendingRateSelection, setPendingRateSelection] = useState<PendingRateSelection | null>(null);
  const [customRateInput, setCustomRateInput] = useState("");

  // ── Bulk vitals entry ──
  const [showBulkVitalsDialog, setShowBulkVitalsDialog] = useState(false);
  const [bulkVitalsTime, setBulkVitalsTime] = useState<number>(0);

  // ── Rate management dialog ──
  const [showRateManageDialog, setShowRateManageDialog] = useState(false);
  const [managingRate, setManagingRate] = useState<ManagingRate | null>(null);
  const [rateManageTime, setRateManageTime] = useState<number>(0);
  const [rateManageInput, setRateManageInput] = useState("");

  // ── TCI amount edit dialog ──
  const [showTciAmountEditDialog, setShowTciAmountEditDialog] = useState(false);
  const [editingTciAmount, setEditingTciAmount] = useState<EditingTciAmount | null>(null);
  const [tciAmountEditInput, setTciAmountEditInput] = useState("");

  // ── BP dual entry ──
  const [bpEntryMode, setBpEntryMode] = useState<'sys' | 'dia'>('sys');
  const [pendingSysValue, setPendingSysValue] = useState<{ time: number; value: number } | null>(null);
  const [isProcessingClick, setIsProcessingClick] = useState(false);

  // ── Hover tooltip ──
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);

  // ── Zeiten hover tooltip ──
  const [zeitenHoverInfo, setZeitenHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    nextMarker: string | null;
    existingMarker?: { code: string; label: string; time: number };
  } | null>(null);

  // ── Medication dose entry ──
  const [medicationHoverInfo, setMedicationHoverInfo] = useState<{ x: number; y: number; time: number; swimlaneId: string; label: string } | null>(null);
  const [showMedicationDoseDialog, setShowMedicationDoseDialog] = useState(false);
  const [pendingMedicationDose, setPendingMedicationDose] = useState<{ swimlaneId: string; time: number; label: string; itemId: string } | null>(null);

  // ── Administration group medication config ──
  const [showMedicationConfigDialog, setShowMedicationConfigDialog] = useState(false);
  const [selectedAdminGroupForConfig, setSelectedAdminGroupForConfig] = useState<AdministrationGroup | null>(null);
  const [editingItemForConfig, setEditingItemForConfig] = useState<AnesthesiaItem | null>(null);
  const [adminGroupHoverInfo, setAdminGroupHoverInfo] = useState<{ x: number; y: number; groupName: string } | null>(null);

  // ── On-demand medication selection ──
  const [showOnDemandDialog, setShowOnDemandDialog] = useState(false);
  const [selectedAdminGroupForOnDemand, setSelectedAdminGroupForOnDemand] = useState<AdministrationGroup | null>(null);

  // ── Ventilation parameter entry ──
  const [ventilationHoverInfo, setVentilationHoverInfo] = useState<{ x: number; y: number; time: number; paramKey: keyof VentilationData; label: string } | null>(null);
  const [showVentilationDialog, setShowVentilationDialog] = useState(false);
  const [pendingVentilationValue, setPendingVentilationValue] = useState<{ paramKey: keyof VentilationData; time: number; label: string } | null>(null);

  // ── Touch device detection ──
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  return {
    // Heart Rhythm
    showHeartRhythmDialog, setShowHeartRhythmDialog,
    pendingHeartRhythm, setPendingHeartRhythm,
    editingHeartRhythm, setEditingHeartRhythm,
    heartRhythmInput, setHeartRhythmInput,
    heartRhythmEditTime, setHeartRhythmEditTime,

    // BIS
    showBISDialog, setShowBISDialog,
    pendingBIS, setPendingBIS,
    editingBIS, setEditingBIS,

    // TOF
    showTOFDialog, setShowTOFDialog,
    pendingTOF, setPendingTOF,
    editingTOF, setEditingTOF,

    // VAS
    showVASDialog, setShowVASDialog,
    pendingVAS, setPendingVAS,
    editingVAS, setEditingVAS,

    // Scores
    showScoresDialog, setShowScoresDialog,
    pendingScore, setPendingScore,
    editingScore, setEditingScore,

    // Position
    showPositionDialog, setShowPositionDialog,
    pendingPosition, setPendingPosition,
    editingPosition, setEditingPosition,

    // Event comments
    showEventDialog, setShowEventDialog,
    pendingEvent, setPendingEvent,
    editingEvent, setEditingEvent,
    eventEditTime, setEventEditTime,
    eventHoverInfo, setEventHoverInfo,
    hoveredEvent, setHoveredEvent,

    // Medication dose edit
    showMedicationEditDialog, setShowMedicationEditDialog,
    editingMedicationDose, setEditingMedicationDose,

    // Ventilation value edit
    showVentilationEditDialog, setShowVentilationEditDialog,
    editingVentilationValue, setEditingVentilationValue,

    // Ventilation mode edit
    showVentilationModeEditDialog, setShowVentilationModeEditDialog,
    editingVentilationMode, setEditingVentilationMode,

    // Ventilation mode add
    showVentilationModeAddDialog, setShowVentilationModeAddDialog,
    pendingVentilationMode, setPendingVentilationMode,

    // Ventilation bulk entry
    showVentilationBulkDialog, setShowVentilationBulkDialog,
    pendingVentilationBulk, setPendingVentilationBulk,
    ventilationBulkHoverInfo, setVentilationBulkHoverInfo,

    // Ventilation entry lane
    ventilationEntrySkipMode, setVentilationEntrySkipMode,
    editingVentilationEntryTimestamp, setEditingVentilationEntryTimestamp,

    // Output bulk entry
    showOutputBulkDialog, setShowOutputBulkDialog,
    pendingOutputBulk, setPendingOutputBulk,

    // Output value add
    showOutputDialog, setShowOutputDialog,
    pendingOutputValue, setPendingOutputValue,

    // Output value edit
    showOutputEditDialog, setShowOutputEditDialog,
    editingOutputValue, setEditingOutputValue,

    // Infusion entry
    infusionHoverInfo, setInfusionHoverInfo,
    showInfusionDialog, setShowInfusionDialog,
    pendingInfusionValue, setPendingInfusionValue,
    infusionInput, setInfusionInput,
    showInfusionEditDialog, setShowInfusionEditDialog,
    editingInfusionValue, setEditingInfusionValue,
    infusionEditInput, setInfusionEditInput,
    infusionEditTime, setInfusionEditTime,

    // Free-Flow Infusion Sheet
    showFreeFlowSheet, setShowFreeFlowSheet,
    freeFlowSheetSession, setFreeFlowSheetSession,
    sheetDoseInput, setSheetDoseInput,
    sheetTimeInput, setSheetTimeInput,

    // Free-flow dose entry
    showFreeFlowDoseDialog, setShowFreeFlowDoseDialog,
    pendingFreeFlowDose, setPendingFreeFlowDose,
    freeFlowDoseInput, setFreeFlowDoseInput,

    // Free-flow stop/start-new
    showFreeFlowStopDialog, setShowFreeFlowStopDialog,
    pendingFreeFlowStop, setPendingFreeFlowStop,

    // Free-flow resume
    showFreeFlowRestartDialog, setShowFreeFlowRestartDialog,
    pendingFreeFlowRestart, setPendingFreeFlowRestart,

    // Rate infusion stop/start-new
    showRateStopDialog, setShowRateStopDialog,
    pendingRateStop, setPendingRateStop,

    // Rate infusion resume
    showRateRestartDialog, setShowRateRestartDialog,
    pendingRateRestart, setPendingRateRestart,

    // Rate Infusion Sheet
    showRateSheet, setShowRateSheet,
    rateSheetSession, setRateSheetSession,
    sheetRateInput, setSheetRateInput,
    sheetRateTimeInput, setSheetRateTimeInput,
    sheetQuantityInput, setSheetQuantityInput,

    // Free-flow management
    showFreeFlowManageDialog, setShowFreeFlowManageDialog,
    managingFreeFlowSession, setManagingFreeFlowSession,
    freeFlowManageTime, setFreeFlowManageTime,

    // Rate selection
    showRateSelectionDialog, setShowRateSelectionDialog,
    pendingRateSelection, setPendingRateSelection,
    customRateInput, setCustomRateInput,

    // Bulk vitals entry
    showBulkVitalsDialog, setShowBulkVitalsDialog,
    bulkVitalsTime, setBulkVitalsTime,

    // Rate management
    showRateManageDialog, setShowRateManageDialog,
    managingRate, setManagingRate,
    rateManageTime, setRateManageTime,
    rateManageInput, setRateManageInput,

    // TCI amount edit
    showTciAmountEditDialog, setShowTciAmountEditDialog,
    editingTciAmount, setEditingTciAmount,
    tciAmountEditInput, setTciAmountEditInput,

    // BP dual entry
    bpEntryMode, setBpEntryMode,
    pendingSysValue, setPendingSysValue,
    isProcessingClick, setIsProcessingClick,

    // Hover tooltip
    hoverInfo, setHoverInfo,

    // Zeiten hover tooltip
    zeitenHoverInfo, setZeitenHoverInfo,

    // Medication dose entry
    medicationHoverInfo, setMedicationHoverInfo,
    showMedicationDoseDialog, setShowMedicationDoseDialog,
    pendingMedicationDose, setPendingMedicationDose,

    // Administration group medication config
    showMedicationConfigDialog, setShowMedicationConfigDialog,
    selectedAdminGroupForConfig, setSelectedAdminGroupForConfig,
    editingItemForConfig, setEditingItemForConfig,
    adminGroupHoverInfo, setAdminGroupHoverInfo,

    // On-demand medication selection
    showOnDemandDialog, setShowOnDemandDialog,
    selectedAdminGroupForOnDemand, setSelectedAdminGroupForOnDemand,

    // Ventilation parameter entry
    ventilationHoverInfo, setVentilationHoverInfo,
    showVentilationDialog, setShowVentilationDialog,
    pendingVentilationValue, setPendingVentilationValue,

    // Touch device detection
    isTouchDevice, setIsTouchDevice,
  };
}

export type VitalsDialogState = ReturnType<typeof useVitalsDialogState>;
