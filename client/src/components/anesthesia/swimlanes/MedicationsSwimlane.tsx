import { useState } from "react";
import { Droplet } from "lucide-react";
import { useTimelineContext } from "../TimelineContext";
import { useCreateMedication, useUpdateMedication, useDeleteMedication } from "@/hooks/useMedicationQuery";
import { InfusionStartEditDialog } from "../dialogs/InfusionStartEditDialog";
import { RateChangeEditDialog } from "../dialogs/RateChangeEditDialog";
import { useToast } from "@/hooks/use-toast";
import { assignInfusionTracks } from "@/lib/infusionTrackAssignment";
import { useTranslation } from "react-i18next";
import type {
  RateInfusionSegment,
  RateInfusionSession,
  FreeFlowSession,
} from "@/hooks/useMedicationState";

/**
 * UnifiedInfusion Component - Complete infusion visualization with start tick, line, and optional end tick
 */
type UnifiedInfusionProps = {
  startTime: number;
  endTime: number | null;
  startDose: string;
  startNote?: string | null;
  initialBolus?: string | null; // Initial bolus given at infusion start
  isFreeFlow: boolean;
  isTciMode?: boolean; // TCI mode - show "Running" instead of rate when active
  medicationName: string;
  onClick: () => void; // Click on line - opens management sheet
  onStartTickClick: () => void; // Click on start tick - opens edit dialog
  onSegmentClick?: (segment: { startTime: number; rate: string; rateUnit?: string }, segmentIndex: number) => void; // Click on rate change marker
  leftPercent: number;
  widthPercent: number;
  yPosition: number;
  swimlaneHeight: number;
  testId: string;
  formatTime: (time: number) => string;
  isTouchDevice: boolean;
  visibleStart: number;
  visibleEnd: number;
  segments?: Array<{ startTime: number; rate: string; rateUnit?: string }>; // For rendering rate change markers
  administrationUnit?: string | null; // Unit for start dose display (e.g., ml, mg)
};

const UnifiedInfusion = ({
  startTime,
  endTime,
  startDose,
  startNote,
  initialBolus,
  isFreeFlow,
  isTciMode,
  medicationName,
  onClick,
  onStartTickClick,
  onSegmentClick,
  leftPercent,
  widthPercent,
  yPosition,
  swimlaneHeight,
  testId,
  formatTime,
  isTouchDevice,
  visibleStart,
  visibleEnd,
  segments,
  administrationUnit,
}: UnifiedInfusionProps) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  
  const lineYOffset = swimlaneHeight - 2;
  const visibleRange = visibleEnd - visibleStart;
  
  // Check running state
  const isRunning = endTime === null;
  
  // For TCI mode, show target concentration with "Tc" unit in the segment (not "Running")
  // The "Running" text will be shown in the right-side pill instead
  const tciDisplayText = isTciMode ? `${startDose} Tc` : null;
  
  // Build display text with unit, optional initial bolus, and optional note in parentheses
  const unit = administrationUnit || '';
  const doseWithUnit = unit ? `${startDose} ${unit}` : startDose;
  
  // Extract base unit for bolus from rate unit (e.g., mg/kg/h → mg, mcg/min → mcg)
  const getBolusUnit = (rateUnit: string): string => {
    const unitLower = (rateUnit || '').toLowerCase();
    if (unitLower.includes('mcg') || unitLower.includes('µg') || unitLower.includes('μg') || unitLower.includes('ug')) {
      return 'mcg';
    } else if (unitLower.includes('mg')) {
      return 'mg';
    } else if (unitLower.includes('ml')) {
      return 'ml';
    }
    return '';
  };
  const bolusUnit = getBolusUnit(unit);
  
  // For rate-controlled infusions with initial bolus, show: "<rate> - <bolus> <baseUnit>"
  const bolusDisplay = initialBolus ? ` - ${initialBolus} ${bolusUnit}` : '';
  const rateAndBolus = `${doseWithUnit}${bolusDisplay}`;
  // For TCI mode, show target concentration (e.g., "5 Tc") instead of rate unit
  const displayText = tciDisplayText || (startNote ? `${rateAndBolus} (${startNote})` : rateAndBolus);
  
  // Calculate actual start position (before clipping)
  const actualStartPercent = ((startTime - visibleStart) / visibleRange) * 100;
  const showStartTick = actualStartPercent >= -5 && actualStartPercent <= 100; // Show if within view (with small buffer)
  
  // Calculate end tick position if infusion is stopped
  const endLeftPercent = endTime ? ((endTime - visibleStart) / visibleRange) * 100 : null;
  const showEndTick = endTime !== null && endLeftPercent !== null && endLeftPercent >= 0 && endLeftPercent <= 100;
  
  return (
    <>
      {/* Start Tick */}
      {showStartTick && <div
        className="absolute flex flex-col cursor-pointer hover:scale-110 transition-transform"
        style={{
          left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100))`,
          top: `${yPosition}px`,
          height: `${swimlaneHeight}px`,
          zIndex: 40,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onStartTickClick();
        }}
        onMouseEnter={(e) => {
          if (!isTouchDevice) {
            setShowTooltip(true);
            setTooltipPosition({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseMove={(e) => {
          if (!isTouchDevice) {
            setTooltipPosition({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseLeave={() => {
          setShowTooltip(false);
        }}
        data-testid={`${testId}-start-tick`}
      >
        <span 
          className="absolute text-base font-semibold leading-none whitespace-nowrap"
          style={{ 
            color: isFreeFlow ? '#ef4444' : '#ef4444',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          {displayText}
        </span>
        <div
          className="mt-auto"
          style={{
            width: '2px',
            height: '12px',
            backgroundColor: '#ef4444',
          }}
        />
      </div>}

      {/* Horizontal Line */}
      <div
        className="absolute cursor-pointer hover:opacity-80 transition-opacity"
        style={{
          left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100))`,
          top: `${yPosition + lineYOffset}px`,
          width: `calc((100% - 210px) * ${widthPercent} / 100)`,
          height: '0',
          borderTop: isFreeFlow ? '2px dashed #ef4444' : '2px solid #ef4444',
          zIndex: 35,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        data-testid={`${testId}-line`}
      />

      {/* End Tick (only if infusion is stopped) */}
      {showEndTick && endLeftPercent !== null && (
        <div
          className="absolute flex flex-col pointer-events-none"
          style={{
            left: `calc(200px + ((100% - 210px) * ${endLeftPercent} / 100))`,
            top: `${yPosition}px`,
            height: `${swimlaneHeight}px`,
            zIndex: 40,
          }}
          data-testid={`${testId}-end-tick`}
        >
          <div
            className="mt-auto"
            style={{
              width: '2px',
              height: '12px',
              backgroundColor: '#ef4444',
            }}
          />
        </div>
      )}

      {/* Rate Change Markers (carets) - only for rate-controlled infusions */}
      {!isFreeFlow && segments && segments.length > 1 && segments.slice(1).map((segment, index) => {
        const segmentTime = segment.startTime;
        const segmentLeftPercent = ((segmentTime - visibleStart) / visibleRange) * 100;
        
        // Only render if within visible range
        if (segmentLeftPercent < 0 || segmentLeftPercent > 100) return null;
          
        return (
          <div
            key={`segment-marker-${index}`}
            className="absolute flex flex-col items-center cursor-pointer hover:scale-110 transition-transform"
            style={{
              left: `calc(200px + ((100% - 210px) * ${segmentLeftPercent} / 100))`,
              top: `${yPosition}px`,
              height: `${swimlaneHeight}px`,
              zIndex: 38,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSegmentClick?.(segment, index + 1);
            }}
            data-testid={`${testId}-segment-${index}`}
          >
            <span 
              className="absolute text-sm font-semibold leading-none"
              style={{ 
                color: '#ef4444',
                top: '50%',
                transform: 'translateY(-50%)'
              }}
            >
              {segment.rateUnit ? `${segment.rate} ${segment.rateUnit}` : segment.rate}
            </span>
            <div
              className="mt-auto"
              style={{
                width: '2px',
                height: '8px',
                backgroundColor: '#ef4444',
              }}
            />
          </div>
        );
      })}

      {/* Tooltip */}
      {showTooltip && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {medicationName} {isFreeFlow ? '(Free-flow)' : '(Rate-controlled)'}
          </div>
          <div className="text-xs text-muted-foreground">
            {isFreeFlow ? 'Dose' : 'Rate'}: {startDose} {unit}
          </div>
          {initialBolus && (
            <div className="text-xs text-muted-foreground">
              Initial bolus: {initialBolus} {bolusUnit}
            </div>
          )}
          {startNote && (
            <div className="text-xs text-muted-foreground">
              Note: {startNote}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Started: {formatTime(startTime)}
          </div>
          {endTime && (
            <div className="text-xs text-muted-foreground">
              Stopped: {formatTime(endTime)}
            </div>
          )}
          <div className="text-xs text-muted-foreground italic mt-1">
            Click start tick: edit | Click line: {endTime ? 'view' : 'manage'}
          </div>
        </div>
      )}
    </>
  );
};

/**
 * BolusPill Component - Vertical tick mark for bolus medication administration
 */
type BolusPillProps = {
  timestamp: number;
  dose: string;
  note?: string | null;
  medicationName: string;
  isBeforeNow: boolean;
  onClick: () => void;
  leftPercent: number;
  yPosition: number;
  swimlaneHeight: number;
  isDark: boolean;
  testId: string;
  formatTime: (time: number) => string;
  isTouchDevice: boolean;
  administrationUnit?: string | null;
};

const BolusPill = ({
  timestamp,
  dose,
  note,
  medicationName,
  isBeforeNow,
  onClick,
  leftPercent,
  yPosition,
  swimlaneHeight,
  isDark,
  testId,
  formatTime,
  isTouchDevice,
  administrationUnit,
}: BolusPillProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Build display text with unit and optional note in parentheses
  const unit = administrationUnit || '';
  const doseWithUnit = unit ? `${dose} ${unit}` : dose;
  const displayText = note ? `${doseWithUnit} (${note})` : doseWithUnit;

  return (
    <>
      <div
        className="absolute flex flex-col cursor-pointer hover:scale-110 transition-transform"
        style={{
          left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100))`,
          top: `${yPosition}px`,
          height: `${swimlaneHeight}px`,
          zIndex: 40,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseEnter={(e) => {
          if (!isTouchDevice) {
            setShowTooltip(true);
            setTooltipPosition({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseMove={(e) => {
          if (!isTouchDevice) {
            setTooltipPosition({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseLeave={() => {
          setShowTooltip(false);
        }}
        data-testid={testId}
      >
        {/* Dose number (with optional note) positioned absolutely in vertical center */}
        <span 
          className="absolute text-base font-semibold leading-none whitespace-nowrap"
          style={{ 
            color: isDark ? '#ffffff' : '#000000',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          {displayText}
        </span>
        {/* Vertical tick line at the bottom */}
        <div
          className="mt-auto"
          style={{
            width: '2px',
            height: '12px',
            backgroundColor: isDark ? '#ffffff' : '#000000',
          }}
        />
      </div>
      
      {/* Tooltip */}
      {showTooltip && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: tooltipPosition.x + 10,
            top: tooltipPosition.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {medicationName}
          </div>
          <div className="text-xs text-muted-foreground">
            Dose: {dose}
          </div>
          {note && (
            <div className="text-xs text-muted-foreground">
              Note: {note}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {formatTime(timestamp)}
          </div>
          <div className="text-xs text-muted-foreground italic mt-1">
            Click to edit
          </div>
        </div>
      )}
    </>
  );
};

/**
 * MedicationsSwimlane Component Props
 */
export interface MedicationsSwimlaneProps {
  swimlanePositions: Array<{
    id: string;
    label: string;
    top: number;
    height: number;
    colorLight: string;
    colorDark: string;
  }>;
  isTouchDevice: boolean;
  onMedicationDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string; defaultDose?: string | null; administrationUnit?: string | null; itemId: string }) => void;
  onMedicationEditDialogOpen: (editing: { swimlaneId: string; time: number; dose: string; note?: string; index: number; id: string }) => void;
  onInstantMedicationSave: (swimlaneId: string, time: number, dose: string, itemId: string) => Promise<void>;
  onInfusionDialogOpen: (pending: { swimlaneId: string; time: number; label: string; itemId?: string; administrationUnit?: string | null; rateUnit?: string | null }) => void;
  onFreeFlowDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string; administrationUnit?: string | null }) => void;
  onFreeFlowSheetOpen: (session: FreeFlowSession & { clickMode?: 'label' | 'segment' }, doseInput: string, timeInput: number) => void;
  onFreeFlowStopDialogOpen: (session: FreeFlowSession, clickTime: number) => void;
  onFreeFlowRestartDialogOpen: (previousSession: FreeFlowSession, clickTime: number) => void;
  onRateStopDialogOpen: (session: RateInfusionSession, clickTime: number) => void;
  onRateRestartDialogOpen: (previousSession: RateInfusionSession, clickTime: number) => void;
  onRateSheetOpen: (session: { swimlaneId: string; label: string; clickMode: 'label' | 'segment'; rateUnit: string; defaultDose?: string }, rateInput: string, timeInput: number, quantityInput?: string) => void;
  onRateManageDialogOpen: (managing: { swimlaneId: string; time: number; value: string; index: number; label: string; rateOptions?: string[]; rateUnit?: string; sessionId?: string; itemId?: string; isRunning?: boolean; administrationUnit?: string | null; ampuleUnit?: string | null }, time: number, input: string) => void;
  onRateSelectionDialogOpen: (pending: { swimlaneId: string; time: number; label: string; rateOptions: string[]; itemId?: string; administrationUnit?: string | null }) => void;
}

/**
 * MedicationsSwimlane Component
 * 
 * Handles rendering and interactions for all medication-related swimlanes including:
 * - Bolus dose markers (single point doses)
 * - Infusion segments (continuous infusions shown as bars/blocks)
 * - Rate-based infusion sessions
 * - Free-flow infusion sessions
 * - Interactive layers for adding new doses/starting infusions
 * - Hover tooltips showing medication details
 */
export function MedicationsSwimlane({
  swimlanePositions,
  isTouchDevice,
  onMedicationDoseDialogOpen,
  onMedicationEditDialogOpen,
  onInstantMedicationSave,
  onInfusionDialogOpen,
  onFreeFlowDoseDialogOpen,
  onFreeFlowSheetOpen,
  onFreeFlowStopDialogOpen,
  onFreeFlowRestartDialogOpen,
  onRateStopDialogOpen,
  onRateRestartDialogOpen,
  onRateSheetOpen,
  onRateManageDialogOpen,
  onRateSelectionDialogOpen,
}: MedicationsSwimlaneProps) {
  const {
    medicationState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    currentDrugSnapInterval,
    isDark,
    collapsedSwimlanes,
    formatTime: originalFormatTime,
    data,
    swimlanes: activeSwimlanes,
    anesthesiaItems,
    anesthesiaRecordId,
  } = useTimelineContext();
  
  // Wrapper to convert timestamp to Date for formatTime
  const formatTime = (timestamp: number) => originalFormatTime(new Date(timestamp));
  
  // Helper: Parse ampule unit from ampuleTotalContent (e.g., "200 mg" → "mg")
  const parseAmpuleUnit = (content: string | null | undefined): string | null => {
    if (!content) return null;
    const match = content.match(/[\d.,]+\s*(.+)/);
    return match ? match[1].trim() : null;
  };

  // Toast for notifications
  const { toast } = useToast();

  // Mutation for creating medications
  const createMedicationMutation = useCreateMedication(anesthesiaRecordId);

  const {
    medicationDoseData,
    infusionData,
    rateInfusionSessions,
    freeFlowSessions,
    setInfusionData,
    setRateInfusionSessions,
    setFreeFlowSessions,
  } = medicationState;

  // State for hover tooltips
  const [medicationHoverInfo, setMedicationHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    swimlaneId: string;
    label: string;
  } | null>(null);

  const [infusionHoverInfo, setInfusionHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    swimlaneId: string;
    label: string;
  } | null>(null);
  
  // State for infusion start edit dialog
  const [editingInfusionStart, setEditingInfusionStart] = useState<{
    id: string;
    swimlaneId: string;
    time: number;
    dose: string;
    note?: string;
    medicationName: string;
    isFreeFlow: boolean;
    administrationUnit?: string | null;
    rateUnit?: string | null;
  } | null>(null);
  const [showInfusionEditDialog, setShowInfusionEditDialog] = useState(false);

  // State for rate change edit dialog
  const [editingRateChange, setEditingRateChange] = useState<{
    medicationId: string;
    currentRate: string;
    currentTime: number;
    rateUnit: string;
    medicationName: string;
  } | null>(null);
  const [showRateChangeEditDialog, setShowRateChangeEditDialog] = useState(false);

  // Mutation hooks
  const updateMedicationMutation = useUpdateMedication(anesthesiaRecordId);
  const deleteMedicationMutation = useDeleteMedication(anesthesiaRecordId);

  // Helper: Get active rate session
  const getActiveSession = (swimlaneId: string): RateInfusionSession | null => {
    const sessions = rateInfusionSessions[swimlaneId];
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return null;
    // Prefer running session, otherwise most recent
    const runningSession = sessions.find(s => s.state === 'running');
    return runningSession || sessions[sessions.length - 1];
  };

  // Handler: Save rate change edit
  const handleSaveRateChange = async (medicationId: string, newRate: string, newTime: Date) => {
    try {
      await updateMedicationMutation.mutateAsync({
        id: medicationId,
        rate: newRate,
        timestamp: newTime,
      });
      toast({
        title: t("anesthesia.timeline.toasts.rateChangeUpdated", "Rate change updated"),
        description: t("anesthesia.timeline.toasts.rateChangeUpdatedDesc", "The rate change has been successfully updated."),
      });
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.failedToUpdateRateChange", "Failed to update rate change."),
        variant: "destructive",
      });
    }
  };

  // Handler: Delete rate change
  const handleDeleteRateChange = async (medicationId: string) => {
    try {
      await deleteMedicationMutation.mutateAsync(medicationId);
      toast({
        title: t("anesthesia.timeline.toasts.rateChangeDeleted", "Rate change deleted"),
        description: t("anesthesia.timeline.toasts.rateChangeDeletedDesc", "The rate change has been successfully deleted."),
      });
    } catch (error) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.failedToDeleteRateChange", "Failed to delete rate change."),
        variant: "destructive",
      });
    }
  };
  
  return (
    <>
      {/* Bolus Medication Markers - Tick marks for bolus doses only */}
      {activeSwimlanes.flatMap((lane, laneIndex) => {
        // Only include medication items
        const isMedicationItem = lane.hierarchyLevel === 'item' && lane.id.startsWith('admingroup-');
        
        // Only render bolus doses here (infusions are handled separately)
        const bolusData = medicationDoseData[lane.id] || [];
        
        if (!isMedicationItem || bolusData.length === 0) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        return bolusData.map(([timestamp, dose, id, note], index) => {
          let leftPercent = ((timestamp - visibleStart) / visibleRange) * 100;
          
          if (leftPercent < 0 || leftPercent > 100) return null;
          
          leftPercent = Math.max(5, Math.min(95, leftPercent));
          
          const isBeforeNow = timestamp < currentTime;
          const yPosition = childLane.top; // Start from top of swimlane, tick will attach to bottom
          
          return (
            <BolusPill
              key={`bolus-pill-${lane.id}-${timestamp}-${index}`}
              timestamp={timestamp}
              dose={dose.toString()}
              note={note}
              medicationName={lane.label.trim()}
              isBeforeNow={isBeforeNow}
              leftPercent={leftPercent}
              yPosition={yPosition}
              swimlaneHeight={childLane.height}
              isDark={isDark}
              testId={`bolus-pill-${lane.id}-${index}`}
              formatTime={formatTime}
              isTouchDevice={isTouchDevice}
              administrationUnit={lane.administrationUnit}
              onClick={() => {
                onMedicationEditDialogOpen({
                  swimlaneId: lane.id,
                  time: timestamp,
                  dose: dose.toString(),
                  note: note || undefined,
                  index,
                  id: id as string,
                });
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Rate-Controlled Infusions - Unified rendering with start/line/end */}
      {activeSwimlanes.flatMap((lane) => {
        const sessions = rateInfusionSessions[lane.id];
        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        return sessions.map((session, sessionIndex) => {
          const startTime = session.startTime || 0;
          const endTime = session.endTime || null; // null means still running
          const displayEndTime = endTime || visibleEnd; // For rendering, use visible end if running
          
          // Calculate positions as percentages first
          const startPercent = ((startTime - visibleStart) / visibleRange) * 100;
          const endPercent = ((displayEndTime - visibleStart) / visibleRange) * 100;
          
          // Skip if completely outside visible range
          if (endPercent < 0 || startPercent > 100) return null;
          
          // Clip to visible range [0, 100]
          const leftPercent = Math.max(0, startPercent);
          const rightPercent = Math.min(100, endPercent);
          const widthPercent = rightPercent - leftPercent;
          
          // Check if this is a TCI infusion (rateUnit === "TCI")
          const sessionRateUnit = session.segments?.[0]?.rateUnit || lane.rateUnit;
          const isTciMode = sessionRateUnit === "TCI";
          
          return (
            <UnifiedInfusion
              key={`rate-infusion-${lane.id}-${sessionIndex}`}
              startTime={startTime}
              endTime={endTime}
              startDose={session.startDose || session.syringeQuantity || '?'}
              startNote={session.startNote}
              initialBolus={session.initialBolus}
              isFreeFlow={false}
              isTciMode={isTciMode}
              medicationName={lane.label.trim()}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              yPosition={childLane.top}
              swimlaneHeight={childLane.height}
              testId={`rate-infusion-${lane.id}-${sessionIndex}`}
              formatTime={formatTime}
              isTouchDevice={isTouchDevice}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              segments={session.segments}
              administrationUnit={isTciMode ? "Tc" : (session.segments?.[0]?.rateUnit || lane.rateUnit || lane.administrationUnit)}
              onClick={() => {
                // If session is running (no endTime), open the simplified RateManageDialog
                // If session is stopped (has endTime), allow resuming or show appropriate dialog
                if (!endTime) {
                  // Running infusion - open simplified manage dialog
                  const currentRate = session.segments[session.segments.length - 1]?.rate || '0';
                  const rateUnit = session.segments[0]?.rateUnit || lane.rateUnit || 'ml/h';
                  
                  // Parse rate options from defaultDose if available (e.g., "4-10-16")
                  const rateOptions = lane.defaultDose && lane.defaultDose.includes('-')
                    ? lane.defaultDose.split('-').map(v => v.trim()).filter(v => v)
                    : undefined;
                  
                  // Check if this is TCI mode to pass ampule unit for stop dialog
                  const isTciModeSession = lane.rateUnit === "TCI";
                  
                  onRateManageDialogOpen(
                    {
                      swimlaneId: lane.id,
                      time: currentTime, // Use current time for proper forward-looking management
                      value: currentRate,
                      index: 0,
                      label: `${lane.label.trim()} (${isTciModeSession ? 'TCI' : rateUnit})`, // Include rate unit in label
                      rateOptions,
                      rateUnit: isTciModeSession ? "TCI" : rateUnit, // Pass the rate unit for display in dialog
                      sessionId: session.id, // Add session ID for mutations
                      itemId: lane.itemId, // Add item ID for creating new records
                      isRunning: true, // Session is running (no endTime)
                      administrationUnit: lane.administrationUnit,
                      ampuleUnit: isTciModeSession ? parseAmpuleUnit(lane.ampuleTotalContent) : null,
                    },
                    currentTime,
                    currentRate
                  );
                } else {
                  // Stopped infusion - check if it can be resumed
                  onRateRestartDialogOpen(session, currentTime);
                }
              }}
              onStartTickClick={() => {
                setEditingInfusionStart({
                  id: session.id,
                  swimlaneId: lane.id,
                  time: startTime,
                  dose: session.startDose || session.syringeQuantity || '?',
                  note: session.startNote || undefined,
                  medicationName: lane.label.trim(),
                  isFreeFlow: false,
                  administrationUnit: lane.administrationUnit,
                  rateUnit: session.segments?.[0]?.rateUnit || lane.rateUnit,
                });
                setShowInfusionEditDialog(true);
              }}
              onSegmentClick={(segment, segmentIndex) => {
                // Find the medication ID for this rate change by matching timestamp and item
                const rateChangeMedication = data.medications?.find(med => 
                  med.type === 'rate_change' &&
                  med.itemId === lane.itemId &&
                  new Date(med.timestamp).getTime() === segment.startTime
                );
                
                if (!rateChangeMedication) {
                  toast({
                    title: t("common.error", "Error"),
                    description: t("anesthesia.timeline.toasts.couldNotFindRateChangeRecord", "Could not find medication record for this rate change."),
                    variant: "destructive",
                  });
                  return;
                }
                
                // Set up edit data
                setEditingRateChange({
                  medicationId: rateChangeMedication.id,
                  currentRate: segment.rate,
                  currentTime: segment.startTime,
                  rateUnit: segment.rateUnit || lane.rateUnit || 'ml/h',
                  medicationName: lane.label.trim(),
                });
                setShowRateChangeEditDialog(true);
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Free-Flow Infusions - Unified rendering with start/line/end */}
      {activeSwimlanes.flatMap((lane) => {
        const sessions = freeFlowSessions[lane.id];
        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        // Assign tracks to sessions for parallel display
        // Normalize endTime to null if undefined for type compatibility
        const normalizedSessions = sessions.map(s => ({
          ...s,
          endTime: s.endTime ?? null
        }));
        const sessionsWithTracks = assignInfusionTracks(normalizedSessions, data.endTime);
        
        // Calculate track height
        const maxTrack = Math.max(...sessionsWithTracks.map((s: any) => s.track), 0);
        const trackCount = maxTrack + 1;
        const TRACK_HEIGHT = 30;
        
        return sessionsWithTracks.map((session: any, sessionIndex: number) => {
          const startTime = session.startTime;
          const endTime = session.endTime || null; // null means still running
          const displayEndTime = endTime || visibleEnd; // For rendering, use visible end if running
          
          // Calculate positions as percentages first
          const startPercent = ((startTime - visibleStart) / visibleRange) * 100;
          const endPercent = ((displayEndTime - visibleStart) / visibleRange) * 100;
          
          // Skip if completely outside visible range
          if (endPercent < 0 || startPercent > 100) return null;
          
          // Clip to visible range [0, 100]
          const leftPercent = Math.max(0, startPercent);
          const rightPercent = Math.min(100, endPercent);
          const widthPercent = rightPercent - leftPercent;
          
          // Calculate vertical position based on track assignment
          // Track 0 at bottom, Track 1 above it, etc.
          const trackYOffset = session.track * TRACK_HEIGHT;
          
          return (
            <UnifiedInfusion
              key={`freeflow-infusion-${lane.id}-${sessionIndex}`}
              startTime={startTime}
              endTime={endTime}
              startDose={session.dose || '?'}
              startNote={session.note}
              isFreeFlow={true}
              medicationName={lane.label.trim()}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              yPosition={childLane.top + trackYOffset}
              swimlaneHeight={TRACK_HEIGHT}
              testId={`freeflow-infusion-${lane.id}-${sessionIndex}`}
              formatTime={formatTime}
              isTouchDevice={isTouchDevice}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              administrationUnit={lane.administrationUnit}
              onClick={() => {
                // If infusion is stopped (has endTime), check if it's the last session before allowing resume
                // If infusion is running (no endTime), show stop dialog
                if (endTime) {
                  // Check if there are any sessions after this one in the same swimlane
                  const allSessionsInLane = sessions;
                  const hasLaterSessions = allSessionsInLane.some((s: any) => s.startTime > session.startTime);
                  
                  if (hasLaterSessions) {
                    // Cannot resume a historical session - show informational toast
                    toast({
                      title: t("anesthesia.timeline.toasts.cannotResume", "Cannot resume"),
                      description: t("anesthesia.timeline.toasts.cannotResumeDesc", "You can only resume the most recent infusion session. This session has newer infusions after it."),
                      variant: "default",
                    });
                  } else {
                    // This is the last session - allow resume
                    onFreeFlowRestartDialogOpen(session, currentTime);
                  }
                } else {
                  onFreeFlowStopDialogOpen(session, currentTime);
                }
              }}
              onStartTickClick={() => {
                setEditingInfusionStart({
                  id: session.id,
                  swimlaneId: lane.id,
                  time: startTime,
                  dose: session.dose || '?',
                  note: session.note || undefined,
                  medicationName: lane.label.trim(),
                  isFreeFlow: true,
                  administrationUnit: lane.administrationUnit,
                });
                setShowInfusionEditDialog(true);
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Interactive layers for medication swimlanes - to place dose labels */}
      {(() => {
        const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
        if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) return null;
        
        return activeSwimlanes.map((lane, index) => {
          // Only include actual medication child lanes (must be item hierarchyLevel and belong to medications)
          const isMedicationChild = 
            !lane.rateUnit && 
            lane.hierarchyLevel === 'item' && 
            lane.id !== 'medikamente' &&
            index > medicationParentIndex; // Must come after the parent in the swimlane order
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
                
                // Check if we're clicking on an existing dose label
                const existingDoses = medicationDoseData[lane.id] || [];
                const clickTolerance = currentDrugSnapInterval; // Allow clicking within one interval of the dose
                const existingDoseAtTime = existingDoses.find(([doseTime]) => 
                  Math.abs(doseTime - time) <= clickTolerance
                );
                
                if (existingDoseAtTime) {
                  // Open edit dialog for existing dose
                  const [doseTime, dose, id] = existingDoseAtTime;
                  const doseIndex = existingDoses.findIndex(([t, d, i]) => t === doseTime && d === dose && i === id);
                  onMedicationEditDialogOpen({
                    swimlaneId: lane.id,
                    time: doseTime,
                    dose: dose.toString(),
                    index: doseIndex,
                    id,
                  });
                } else {
                  // Ensure lane has an itemId before proceeding
                  if (!lane.itemId) {
                    console.error('[MED] Lane missing itemId, cannot add dose:', lane);
                    toast({
                      title: t("anesthesia.timeline.toasts.configurationError", "Configuration Error"),
                      description: t("anesthesia.timeline.toasts.configurationErrorDesc", "This medication is not properly configured. Please contact support."),
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  // Check if medication has a simple default dose (no hyphen = single value)
                  const hasSimpleDefaultDose = lane.defaultDose && !lane.defaultDose.includes('-');
                  
                  if (hasSimpleDefaultDose) {
                    // Instantly save with default dose without opening dialog
                    onInstantMedicationSave(lane.id, time, lane.defaultDose!, lane.itemId);
                  } else {
                    // Open dialog for new dose (no default or has range)
                    onMedicationDoseDialogOpen({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim(),
                      defaultDose: lane.defaultDose,
                      administrationUnit: lane.administrationUnit,
                      itemId: lane.itemId
                    });
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
      {(() => {
        const medicationParentIndex = activeSwimlanes.findIndex(s => s.id === "medikamente");
        if (medicationParentIndex === -1 || collapsedSwimlanes.has("medikamente")) return null;
        
        return activeSwimlanes.map((lane, index) => {
          const isInfusionChild = lane.rateUnit !== null && lane.rateUnit !== undefined && lane.id !== 'medikamente';
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
                // Don't handle clicks if they're on the tick mark itself (which has stopPropagation)
                // This check prevents double-dialog opening when clicking tick marks
                if ((e.target as HTMLElement).closest('[data-testid^="bolus-pill-"]') || 
                    (e.target as HTMLElement).closest('[data-testid^="infusion-pill-"]')) {
                  return;
                }
                
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                const visibleStart = currentZoomStart ?? data.startTime;
                const visibleEnd = currentZoomEnd ?? data.endTime;
                const visibleRange = visibleEnd - visibleStart;
                
                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);
                
                // Snap to 1-minute interval for infusions
                time = Math.round(time / currentDrugSnapInterval) * currentDrugSnapInterval;
                
                // Check if we're clicking on an existing infusion value
                const existingValues = infusionData[lane.id] || [];
                const clickTolerance = currentDrugSnapInterval;
                const existingValueAtTime = existingValues.find(([valueTime]) => 
                  Math.abs(valueTime - time) <= clickTolerance
                );
                
                if (existingValueAtTime) {
                  // Clicking on existing tick marks is handled by the tick mark's own onClick
                  // This background handler should not interfere
                  return;
                } else {
                  // Check if this is a free-flow infusion (no rate)
                  if (lane.rateUnit === 'free') {
                    console.log('[FREE-FLOW-CLICK] Clicked free-flow lane:', { 
                      swimlaneId: lane.id, 
                      defaultDose: lane.defaultDose, 
                      time,
                      anesthesiaRecordId 
                    });
                    
                    // Check if there's any active free-flow session on this swimlane
                    const sessions = freeFlowSessions[lane.id] || [];
                    console.log('[FREE-FLOW-CLICK] Existing sessions:', sessions.length);
                    
                    if (sessions.length > 0) {
                      // Find if click is on a running infusion or a stopped area
                      const clickedSession = sessions.find(session => {
                        const sessionStart = session.startTime;
                        // For running infusions (no endTime), extend clickable area to infinity
                        const sessionEnd = session.endTime || Infinity;
                        return time >= sessionStart && time <= sessionEnd;
                      });
                      
                      if (clickedSession) {
                        if (!clickedSession.endTime) {
                          // SCENARIO 2: Clicked on RUNNING infusion area => Stop dialog
                          console.log('[FREE-FLOW-CLICK] Scenario 2: Running infusion area clicked');
                          onFreeFlowStopDialogOpen(clickedSession, time);
                        } else {
                          // SCENARIO 3: Clicked on STOPPED infusion area => Restart dialog
                          console.log('[FREE-FLOW-CLICK] Scenario 3: Stopped infusion area clicked');
                          onFreeFlowRestartDialogOpen(clickedSession, time);
                        }
                        return;
                      }
                      
                      // No session clicked - fall through to create new infusion
                      console.log('[FREE-FLOW-CLICK] Clicked in empty area, creating new infusion');
                    }
                    
                    // SCENARIO 1: First click or click in empty area => Create new infusion
                    {
                      // First click: check for default dose
                      if (lane.defaultDose) {
                        console.log('[FREE-FLOW-CLICK] Has default dose, creating session:', lane.defaultDose);
                        
                        // Extract group ID and item ID from swimlane id
                        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                        const groupMatch = lane.id.match(/admingroup-([a-f0-9-]+)-item-([a-f0-9-]+)/);
                        if (!groupMatch || !anesthesiaRecordId) {
                          console.log('[FREE-FLOW-CLICK] Failed to match swimlane ID or missing recordId');
                          return;
                        }
                        
                        const groupId = groupMatch[1];
                        const itemId = groupMatch[2];
                        console.log('[FREE-FLOW-CLICK] Extracted:', { groupId, itemId });
                        
                        // Find item by ID directly
                        const item = anesthesiaItems.find(i => i.id === itemId);
                        
                        if (!item) {
                          console.log('[FREE-FLOW-CLICK] Item not found with ID', itemId);
                          return;
                        }
                        
                        console.log('[FREE-FLOW-CLICK] Found item:', item.id, item.name);
                        
                        // OPTIMISTIC UPDATE: Add session to UI immediately
                        const tempId = crypto.randomUUID();
                        const newSession: FreeFlowSession = {
                          id: tempId,
                          swimlaneId: lane.id,
                          startTime: time,
                          endTime: null,
                          dose: lane.defaultDose,
                          label: item.name,
                        };
                        
                        // Update local state immediately
                        const currentSessions = freeFlowSessions[lane.id] || [];
                        setFreeFlowSessions({
                          ...freeFlowSessions,
                          [lane.id]: [...currentSessions, newSession],
                        });
                        
                        console.log('[FREE-FLOW-CLICK] Optimistically added session to UI');
                        
                        // Create new free-flow infusion in database (background operation)
                        // React Query will sync the real ID when mutation completes
                        createMedicationMutation.mutate({
                          anesthesiaRecordId,
                          itemId: item.id,
                          timestamp: new Date(time),
                          type: 'infusion_start' as const,
                          rate: 'free',
                          dose: lane.defaultDose,
                        });
                        
                        console.log('[FREE-FLOW-CLICK] Background mutation started');
                      } else {
                        // No default dose: show dose entry dialog
                        onFreeFlowDoseDialogOpen({
                          swimlaneId: lane.id,
                          time,
                          label: lane.label.trim(),
                          administrationUnit: lane.administrationUnit,
                        });
                      }
                    }
                  } else if (lane.defaultDose) {
                    // Check if TCI mode - auto-start immediately without dialog
                    const isTciMode = lane.rateUnit === "TCI";
                    
                    if (isTciMode) {
                      // TCI MODE: Check for existing sessions first
                      const sessions = rateInfusionSessions[lane.id] || [];
                      console.log('[TCI-CLICK] Checking sessions:', { swimlaneId: lane.id, count: sessions.length, time });
                      
                      // Find if click is within any session (running or stopped)
                      const clickedSession = sessions.find(session => {
                        const sessionStart = session.startTime ?? 0;
                        const sessionEnd = session.endTime || Infinity;
                        return time >= sessionStart && time <= sessionEnd;
                      });
                      
                      if (clickedSession) {
                        if (!clickedSession.endTime) {
                          // Clicked on RUNNING TCI infusion → open manage dialog
                          console.log('[TCI-CLICK] Clicked on running TCI infusion - opening manage dialog');
                          const currentRate = clickedSession.segments[clickedSession.segments.length - 1]?.rate || lane.defaultDose;
                          
                          onRateManageDialogOpen(
                            {
                              swimlaneId: lane.id,
                              time: time,
                              value: currentRate,
                              index: 0,
                              label: `${lane.label.trim()} (TCI)`,
                              rateOptions: undefined,
                              rateUnit: "TCI",
                              sessionId: clickedSession.id,
                              itemId: lane.itemId,
                              isRunning: true,
                              administrationUnit: lane.administrationUnit,
                              ampuleUnit: parseAmpuleUnit(lane.ampuleTotalContent),
                            },
                            time,
                            currentRate
                          );
                        } else {
                          // Clicked on STOPPED TCI infusion → open restart dialog
                          console.log('[TCI-CLICK] Clicked on stopped TCI infusion - opening restart dialog');
                          onRateRestartDialogOpen(clickedSession, time);
                        }
                        return;
                      }
                      
                      // No session clicked - AUTO-START TCI immediately with defaultDose
                      console.log('[TCI-CLICK] No session - auto-starting TCI with rate:', lane.defaultDose);
                      const groupMatch = lane.id.match(/admingroup-([a-f0-9-]+)-item-([a-f0-9-]+)/);
                      if (groupMatch && anesthesiaRecordId) {
                        const itemId = groupMatch[2];
                        createMedicationMutation.mutate({
                          anesthesiaRecordId,
                          itemId: itemId,
                          timestamp: new Date(time),
                          type: 'infusion_start' as const,
                          rate: lane.defaultDose,
                          dose: lane.defaultDose, // TCI target concentration for display
                        });
                        console.log('[TCI-CLICK] TCI infusion auto-started');
                      }
                      return;
                    }
                    
                    // Check if defaultDose is a range (contains dashes like "6-12-16")
                    const isRange = lane.defaultDose.includes('-');
                    
                    if (isRange) {
                      // Parse range options
                      const rateOptions = lane.defaultDose.split('-').map(v => v.trim()).filter(v => v);
                      
                      // Check ALL sessions (including stopped ones)
                      const sessions = rateInfusionSessions[lane.id] || [];
                      console.log('[RATE-INFUSION-CLICK] Checking range sessions:', { swimlaneId: lane.id, count: sessions.length, time });
                      
                      // Find if click is within any session (running or stopped)
                      const clickedSession = sessions.find(session => {
                        const sessionStart = session.startTime ?? 0;
                        const sessionEnd = session.endTime || Infinity;
                        return time >= sessionStart && time <= sessionEnd;
                      });
                      
                      if (clickedSession) {
                        if (!clickedSession.endTime) {
                          // SCENARIO 2: Clicked on RUNNING infusion → open manage dialog
                          console.log('[RATE-INFUSION-CLICK] Clicked on running range infusion');
                          const currentRate = clickedSession.segments[clickedSession.segments.length - 1]?.rate || '0';
                          const rateUnit = clickedSession.segments[0]?.rateUnit || lane.rateUnit || 'ml/h';
                          
                          onRateManageDialogOpen(
                            {
                              swimlaneId: lane.id,
                              time: time,
                              value: currentRate,
                              index: 0,
                              label: `${lane.label.trim()} (${rateUnit})`,
                              rateOptions,
                              rateUnit, // Pass the rate unit for display in dialog
                              sessionId: clickedSession.id,
                              itemId: lane.itemId,
                              isRunning: true,
                              administrationUnit: lane.administrationUnit,
                            },
                            time,
                            currentRate
                          );
                        } else {
                          // SCENARIO 3: Clicked on STOPPED infusion → open restart dialog
                          console.log('[RATE-INFUSION-CLICK] Clicked on stopped range infusion - opening restart dialog');
                          onRateRestartDialogOpen(clickedSession, time);
                        }
                        return;
                      }
                      
                      // SCENARIO 1: No session clicked - open rate selection dialog
                      console.log('[RATE-INFUSION-CLICK] No range session clicked - opening rate selection');
                      onRateSelectionDialogOpen({
                        swimlaneId: lane.id,
                        time,
                        label: lane.label.trim(),
                        rateOptions,
                        itemId: lane.itemId,
                        administrationUnit: lane.administrationUnit,
                      });
                    } else {
                      // Simple numeric default: check ALL sessions (including stopped ones)
                      const sessions = rateInfusionSessions[lane.id] || [];
                      console.log('[RATE-INFUSION-CLICK] Checking sessions:', { swimlaneId: lane.id, count: sessions.length, time });
                      
                      // Find if click is within any session (running or stopped)
                      const clickedSession = sessions.find(session => {
                        const sessionStart = session.startTime ?? 0;
                        const sessionEnd = session.endTime || Infinity;
                        return time >= sessionStart && time <= sessionEnd;
                      });
                      
                      if (clickedSession) {
                        if (!clickedSession.endTime) {
                          // SCENARIO 2: Clicked on RUNNING infusion → open manage dialog
                          console.log('[RATE-INFUSION-CLICK] Clicked on running infusion');
                          const currentRate = clickedSession.segments[clickedSession.segments.length - 1]?.rate || '0';
                          const rateUnit = clickedSession.segments[0]?.rateUnit || lane.rateUnit || 'ml/h';
                          
                          onRateManageDialogOpen(
                            {
                              swimlaneId: lane.id,
                              time: time,
                              value: currentRate,
                              index: 0,
                              label: `${lane.label.trim()} (${rateUnit})`,
                              rateOptions: undefined,
                              rateUnit, // Pass the rate unit for display in dialog
                              sessionId: clickedSession.id,
                              itemId: lane.itemId,
                              isRunning: true,
                              administrationUnit: lane.administrationUnit,
                            },
                            time,
                            currentRate
                          );
                        } else {
                          // SCENARIO 3: Clicked on STOPPED infusion → open restart dialog
                          console.log('[RATE-INFUSION-CLICK] Clicked on stopped infusion - opening restart dialog');
                          onRateRestartDialogOpen(clickedSession, time);
                        }
                        return;
                      }
                      
                      // SCENARIO 1: No session clicked - open rate selection dialog with default rate
                      // This allows user to optionally add an initial bolus before starting
                      console.log('[RATE-INFUSION-CLICK] No session clicked - opening rate selection dialog for bolus option');
                      onRateSelectionDialogOpen({
                        swimlaneId: lane.id,
                        time,
                        label: lane.label.trim(),
                        rateOptions: [lane.defaultDose!], // Single option with the default rate
                        itemId: lane.itemId,
                        administrationUnit: lane.administrationUnit,
                      });
                    }
                  } else {
                    // No default dose - but still check for running sessions first
                    const sessions = rateInfusionSessions[lane.id] || [];
                    console.log('[RATE-INFUSION-CLICK] No default dose, checking sessions:', { swimlaneId: lane.id, count: sessions.length, time });
                    
                    // Find if click is within any session (running or stopped)
                    const clickedSession = sessions.find(session => {
                      const sessionStart = session.startTime ?? 0;
                      const sessionEnd = session.endTime || Infinity;
                      return time >= sessionStart && time <= sessionEnd;
                    });
                    
                    if (clickedSession) {
                      if (!clickedSession.endTime) {
                        // Clicked on RUNNING infusion → open manage dialog
                        console.log('[RATE-INFUSION-CLICK] No default dose, but clicked on running infusion');
                        const currentRate = clickedSession.segments[clickedSession.segments.length - 1]?.rate || '0';
                        const rateUnit = clickedSession.segments[0]?.rateUnit || lane.rateUnit || 'ml/h';
                        
                        onRateManageDialogOpen(
                          {
                            swimlaneId: lane.id,
                            time: time,
                            value: currentRate,
                            index: 0,
                            label: `${lane.label.trim()} (${rateUnit})`,
                            rateOptions: undefined,
                            rateUnit,
                            sessionId: clickedSession.id,
                            itemId: lane.itemId,
                            isRunning: true,
                            administrationUnit: lane.administrationUnit,
                          },
                          time,
                          currentRate
                        );
                      } else {
                        // Clicked on STOPPED infusion → open restart dialog
                        console.log('[RATE-INFUSION-CLICK] No default dose, clicked on stopped infusion');
                        onRateRestartDialogOpen(clickedSession, time);
                      }
                      return;
                    }
                    
                    // No session clicked - open infusion dialog for new infusion
                    onInfusionDialogOpen({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim(),
                      itemId: lane.itemId,
                      administrationUnit: lane.administrationUnit,
                      rateUnit: lane.rateUnit,
                    });
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
      
      {/* Infusion Start Edit Dialog */}
      <InfusionStartEditDialog
        open={showInfusionEditDialog}
        onOpenChange={setShowInfusionEditDialog}
        anesthesiaRecordId={anesthesiaRecordId ?? null}
        editingInfusionStart={editingInfusionStart}
        onInfusionUpdated={() => {
          // Cache will be invalidated automatically by the mutation
        }}
        onInfusionDeleted={() => {
          // Cache will be invalidated automatically by the mutation
        }}
      />

      {/* Rate Change Edit Dialog */}
      <RateChangeEditDialog
        open={showRateChangeEditDialog}
        onOpenChange={setShowRateChangeEditDialog}
        rateChangeData={editingRateChange}
        onSave={handleSaveRateChange}
        onDelete={handleDeleteRateChange}
        formatTime={formatTime}
      />
    </>
  );
}
