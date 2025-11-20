import { useState } from "react";
import { Droplet } from "lucide-react";
import { useTimelineContext } from "../TimelineContext";
import { useCreateMedication } from "@/hooks/useMedicationQuery";
import type {
  RateInfusionSegment,
  RateInfusionSession,
  FreeFlowSession,
} from "@/hooks/useMedicationState";

/**
 * InfusionLine Component - Horizontal line for infusions starting from vertical tick
 */
type InfusionLineProps = {
  startTime: number;
  endTime: number | null;
  isFreeFlow: boolean;
  onClick: () => void;
  leftPercent: number;
  widthPercent: number;
  yPosition: number;
  swimlaneHeight: number;
  testId: string;
};

const InfusionLine = ({
  startTime,
  endTime,
  isFreeFlow,
  onClick,
  leftPercent,
  widthPercent,
  yPosition,
  swimlaneHeight,
  testId,
}: InfusionLineProps) => {
  // Line starts 2px from the tick's bottom end
  // Tick is 12px tall and attached to swimlane bottom
  // So line should be positioned 2px from the swimlane bottom
  const lineYOffset = swimlaneHeight - 2;
  
  return (
    <div
      className="absolute cursor-pointer hover:opacity-80 transition-opacity"
      style={{
        left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100))`,
        top: `${yPosition + lineYOffset}px`,
        width: `calc((100% - 210px) * ${widthPercent} / 100)`,
        height: '0',
        borderTop: isFreeFlow ? '2px dashed #ef4444' : '2px solid #ef4444', // Red for both, dashed for free-flow
        zIndex: 35, // Below tick marks (40) but above background
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    />
  );
};

/**
 * BolusPill Component - Vertical tick mark for bolus medication administration
 */
type BolusPillProps = {
  timestamp: number;
  dose: string;
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
};

const BolusPill = ({
  timestamp,
  dose,
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
}: BolusPillProps) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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
        {/* Dose number positioned absolutely in vertical center */}
        <span 
          className="absolute text-base font-semibold leading-none"
          style={{ 
            color: '#000000',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
        >
          {dose}
        </span>
        {/* Vertical tick line at the bottom */}
        <div
          className="mt-auto"
          style={{
            width: '2px',
            height: '12px',
            backgroundColor: '#000000',
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
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(timestamp))}
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
  onMedicationDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string; defaultDose?: string | null }) => void;
  onMedicationEditDialogOpen: (editing: { swimlaneId: string; time: number; dose: string; index: number; id: string }) => void;
  onInstantMedicationSave: (swimlaneId: string, time: number, dose: string, itemId: string) => Promise<void>;
  onInfusionDialogOpen: (pending: { swimlaneId: string; time: number; label: string }) => void;
  onFreeFlowDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string }) => void;
  onFreeFlowSheetOpen: (session: FreeFlowSession & { clickMode?: 'label' | 'segment' }, doseInput: string, timeInput: number) => void;
  onFreeFlowStopDialogOpen: (session: FreeFlowSession, clickTime: number) => void;
  onFreeFlowRestartDialogOpen: (previousSession: FreeFlowSession, clickTime: number) => void;
  onRateSheetOpen: (session: { swimlaneId: string; label: string; clickMode: 'label' | 'segment'; rateUnit: string; defaultDose?: string }, rateInput: string, timeInput: number, quantityInput?: string) => void;
  onRateManageDialogOpen: (managing: { swimlaneId: string; time: number; value: string; index: number; label: string; rateOptions?: string[] }, time: number, input: string) => void;
  onRateSelectionDialogOpen: (pending: { swimlaneId: string; time: number; label: string; rateOptions: string[] }) => void;
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
    formatTime,
    data,
    swimlanes: activeSwimlanes,
    anesthesiaItems,
    anesthesiaRecordId,
  } = useTimelineContext();

  // Mutation for creating medications
  const createMedicationMutation = useCreateMedication(anesthesiaRecordId);

  const {
    medicationDoseData,
    infusionData,
    rateInfusionSessions,
    freeFlowSessions,
    setInfusionData,
    setRateInfusionSessions,
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

  // Helper: Get active rate session
  const getActiveSession = (swimlaneId: string): RateInfusionSession | null => {
    const session = rateInfusionSessions[swimlaneId];
    if (!session) return null;
    return session;
  };

  // Helper: Calculate editable boundaries
  const TEN_MINUTES = 10 * 60 * 1000;
  const FIFTEEN_MINUTES = 15 * 60 * 1000;
  
  return (
    <>
      {/* Medication Markers - Simple tick marks for all medication events (bolus, infusions, rate changes) */}
      {activeSwimlanes.flatMap((lane, laneIndex) => {
        // Include all medication items (bolus and infusions)
        const isMedicationItem = lane.hierarchyLevel === 'item' && lane.id.startsWith('admingroup-');
        
        // Check BOTH medicationDoseData (bolus) AND infusionData (rate-controlled infusions)
        const bolusData = medicationDoseData[lane.id] || [];
        const infusionDataPoints = infusionData[lane.id] || [];
        const hasAnyData = bolusData.length > 0 || infusionDataPoints.length > 0;
        
        console.log('[MED-RENDER] Checking lane for medication markers:', {
          laneId: lane.id,
          isMedicationItem,
          hasBolusDoses: bolusData.length,
          hasInfusionData: infusionDataPoints.length,
          hasAnyData,
          allDoseKeys: Object.keys(medicationDoseData)
        });
        
        if (!isMedicationItem || !hasAnyData) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        // Render tick marks for BOTH bolus doses and infusion rate changes
        const allTickMarks = [
          ...bolusData.map(([timestamp, dose, id], index) => ({ timestamp, dose, id, index, type: 'bolus' as const })),
          ...infusionDataPoints.map(([timestamp, dose], index) => ({ timestamp, dose, id: `infusion-${index}`, index, type: 'infusion' as const }))
        ].sort((a, b) => a.timestamp - b.timestamp);
        
        return allTickMarks.map(({ timestamp, dose, id, index, type }) => {
          let leftPercent = ((timestamp - visibleStart) / visibleRange) * 100;
          
          if (leftPercent < 0 || leftPercent > 100) return null;
          
          // Ensure pills don't overflow into swimlane label column
          // Pills are 60px wide with 30px offset for centering
          // Minimum safe position: 200px (label width) + 30px (half pill) = 230px from left
          // This translates to approximately 5% of most screen widths as a conservative minimum
          // Maximum safe position: stay within right boundary (95%)
          leftPercent = Math.max(5, Math.min(95, leftPercent));
          
          const isBeforeNow = timestamp < currentTime;
          const yPosition = childLane.top; // Start from top of swimlane, tick will attach to bottom
          
          return (
            <BolusPill
              key={`${type}-pill-${lane.id}-${timestamp}-${index}`}
              timestamp={timestamp}
              dose={dose.toString()}
              medicationName={lane.label.trim()}
              isBeforeNow={isBeforeNow}
              leftPercent={leftPercent}
              yPosition={yPosition}
              swimlaneHeight={childLane.height}
              isDark={isDark}
              testId={`${type}-pill-${lane.id}-${index}`}
              formatTime={formatTime}
              isTouchDevice={isTouchDevice}
              onClick={() => {
                if (type === 'bolus') {
                  // Bolus medication - edit dose dialog
                  onMedicationEditDialogOpen({
                    swimlaneId: lane.id,
                    time: timestamp,
                    dose: dose.toString(),
                    index,
                    id: id as string,
                  });
                } else {
                  // Rate-controlled infusion tick mark - open rate management
                  const rateOptions = lane.defaultDose?.includes('-') 
                    ? lane.defaultDose.split('-').map(v => v.trim()).filter(v => v)
                    : undefined;
                  
                  onRateManageDialogOpen({
                    swimlaneId: lane.id,
                    time: timestamp,
                    value: dose.toString(),
                    index,
                    label: lane.label.trim(),
                    rateOptions,
                  }, timestamp, dose.toString());
                }
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Infusion Lines - Horizontal lines for rate-controlled infusions */}
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
          const endTime = session.endTime || visibleEnd; // If no end time, draw to end of visible range
          
          let leftPercent = ((startTime - visibleStart) / visibleRange) * 100;
          let widthPercent = ((endTime - startTime) / visibleRange) * 100;
          
          // Clip to visible range
          if (leftPercent + widthPercent < 0 || leftPercent > 100) return null;
          leftPercent = Math.max(0, leftPercent);
          widthPercent = Math.min(100 - leftPercent, widthPercent);
          
          return (
            <InfusionLine
              key={`rate-infusion-line-${lane.id}-${sessionIndex}`}
              startTime={startTime}
              endTime={endTime}
              isFreeFlow={false}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              yPosition={childLane.top}
              swimlaneHeight={childLane.height}
              testId={`rate-infusion-line-${lane.id}-${sessionIndex}`}
              onClick={() => {
                // Open dialog to change rate or stop infusion
                const rateUnit = session.segments[0]?.rateUnit || 'ml/h';
                onRateSheetOpen(
                  { 
                    swimlaneId: lane.id, 
                    label: lane.label.trim(), 
                    clickMode: 'segment',
                    rateUnit,
                    defaultDose: lane.defaultDose || undefined
                  },
                  session.segments[session.segments.length - 1]?.rate || '0',
                  currentTime,
                  session.syringeQuantity
                );
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Infusion Lines - Horizontal lines for free-flow infusions */}
      {activeSwimlanes.flatMap((lane) => {
        const sessions = freeFlowSessions[lane.id];
        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        return sessions.map((session, sessionIndex) => {
          const startTime = session.startTime;
          const endTime = visibleEnd; // Free-flow always draws to end of visible range
          
          let leftPercent = ((startTime - visibleStart) / visibleRange) * 100;
          let widthPercent = ((endTime - startTime) / visibleRange) * 100;
          
          // Clip to visible range
          if (leftPercent + widthPercent < 0 || leftPercent > 100) return null;
          leftPercent = Math.max(0, leftPercent);
          widthPercent = Math.min(100 - leftPercent, widthPercent);
          
          return (
            <InfusionLine
              key={`freeflow-infusion-line-${lane.id}-${sessionIndex}`}
              startTime={startTime}
              endTime={null}
              isFreeFlow={true}
              leftPercent={leftPercent}
              widthPercent={widthPercent}
              yPosition={childLane.top}
              swimlaneHeight={childLane.height}
              testId={`freeflow-infusion-line-${lane.id}-${sessionIndex}`}
              onClick={() => {
                // Open dialog to stop free-flow infusion
                onFreeFlowSheetOpen(
                  { ...session, clickMode: 'segment' },
                  session.dose,
                  currentTime
                );
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
                
                // Validate that time is within editable boundaries
                const editableStartBoundary = chartInitTime - FIFTEEN_MINUTES;
                const editableEndBoundary = currentTime + FIFTEEN_MINUTES;
                
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
                  // Check if medication has a simple default dose (no hyphen = single value)
                  const hasSimpleDefaultDose = lane.defaultDose && !lane.defaultDose.includes('-');
                  
                  if (hasSimpleDefaultDose && lane.itemId) {
                    // Instantly save with default dose without opening dialog
                    onInstantMedicationSave(lane.id, time, lane.defaultDose!, lane.itemId);
                  } else {
                    // Open dialog for new dose (no default or has range)
                    onMedicationDoseDialogOpen({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim(),
                      defaultDose: lane.defaultDose
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
                const editableStartBoundary = chartInitTime - FIFTEEN_MINUTES;
                const editableEndBoundary = currentTime + FIFTEEN_MINUTES;
                
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
                    // SCENARIO 1: Clicked on existing tick/value => Edit Dose dialog
                    const [valueTime, value] = existingValueAtTime;
                    
                    // Find the session for this marker
                    const sessions = freeFlowSessions[lane.id] || [];
                    const session = sessions.find(s => s.startTime === valueTime) || {
                      swimlaneId: lane.id,
                      startTime: valueTime,
                      dose: value.toString(),
                      label: lane.label.trim(),
                    };
                    
                    onFreeFlowSheetOpen(session, value.toString(), valueTime);
                  } else {
                    // For rate-controlled, open management dialog with stop/change/start new options
                    const [valueTime, value] = existingValueAtTime;
                    const valueIndex = existingValues.findIndex(([t, v]) => t === valueTime && v === value);
                    
                    // Parse rate options from defaultDose if it's a range
                    let rateOptions: string[] | undefined;
                    if (lane.defaultDose && lane.defaultDose.includes('-')) {
                      rateOptions = lane.defaultDose.split('-').map(v => v.trim()).filter(v => v);
                    }
                    
                    onRateManageDialogOpen({
                      swimlaneId: lane.id,
                      time: valueTime,
                      value: value.toString(),
                      index: valueIndex,
                      label: lane.label.trim(),
                      rateOptions,
                    }, time, value.toString());
                  }
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
                        const sessionEnd = session.endTime || currentTime;
                        return time >= sessionStart && time <= sessionEnd;
                      });
                      
                      if (clickedSession && !clickedSession.endTime) {
                        // SCENARIO 2: Clicked on RUNNING infusion area => Stop or Start New dialog
                        console.log('[FREE-FLOW-CLICK] Scenario 2: Running infusion area clicked');
                        onFreeFlowStopDialogOpen(clickedSession, time);
                      } else {
                        // SCENARIO 3: Clicked on STOPPED infusion area => Start or Start New dialog
                        console.log('[FREE-FLOW-CLICK] Scenario 3: Stopped infusion area clicked');
                        // Find the most recent stopped session for this swimlane
                        const stoppedSession = sessions.filter(s => s.endTime).sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0];
                        if (stoppedSession) {
                          onFreeFlowRestartDialogOpen(stoppedSession, time);
                        }
                      }
                    } else {
                      // First click: check for default dose
                      if (lane.defaultDose) {
                        console.log('[FREE-FLOW-CLICK] Has default dose, creating session:', lane.defaultDose);
                        
                        // Extract group ID and item index from swimlane id
                        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
                        const groupMatch = lane.id.match(/admingroup-([a-f0-9-]+)-item-(\d+)/);
                        if (!groupMatch || !anesthesiaRecordId) {
                          console.log('[FREE-FLOW-CLICK] Failed to match swimlane ID or missing recordId');
                          return;
                        }
                        
                        const groupId = groupMatch[1];
                        const itemIndex = parseInt(groupMatch[2], 10);
                        console.log('[FREE-FLOW-CLICK] Extracted:', { groupId, itemIndex });
                        
                        // Find all items in this administration group and get the item at index
                        // Note: Items are already sorted by buildItemToSwimlaneMap
                        const groupItems = anesthesiaItems
                          .filter(item => item.administrationGroup === groupId);
                        
                        console.log('[FREE-FLOW-CLICK] Group items:', groupItems.length);
                        
                        const item = groupItems[itemIndex];
                        if (!item) {
                          console.log('[FREE-FLOW-CLICK] Item not found at index', itemIndex);
                          return;
                        }
                        
                        console.log('[FREE-FLOW-CLICK] Found item:', item.id, item.name);
                        
                        // Create new session with default dose
                        const newSession: FreeFlowSession = {
                          swimlaneId: lane.id,
                          startTime: time,
                          dose: lane.defaultDose,
                          label: lane.label.trim(),
                        };
                        
                        console.log('[FREE-FLOW-CLICK] Creating session:', newSession);
                        
                        // Update state directly
                        medicationState.setFreeFlowSessions(prev => ({
                          ...prev,
                          [lane.id]: [...(prev[lane.id] || []), newSession].sort((a, b) => a.startTime - b.startTime),
                        }));
                        
                        // Add visual marker
                        setInfusionData(prev => ({
                          ...prev,
                          [lane.id]: [...(prev[lane.id] || []), [time, lane.defaultDose]].sort((a, b) => a[0] - b[0]),
                        }));
                        
                        console.log('[FREE-FLOW-CLICK] States updated, calling mutation...');
                        console.log('[TIMESTAMP-DEBUG] Free-flow click:', {
                          clickedTimeEpoch: time,
                          clickedTimeDate: new Date(time),
                          clickedTimeISO: new Date(time).toISOString(),
                          clickedTimeLocal: new Date(time).toLocaleString(),
                        });
                        
                        // 🔥 FIX: Save to database
                        createMedicationMutation.mutate({
                          anesthesiaRecordId,
                          itemId: item.id,
                          timestamp: new Date(time),
                          type: 'infusion_start' as const,
                          rate: 'free',
                          dose: lane.defaultDose,
                        });
                        
                        console.log('[FREE-FLOW-CLICK] Mutation called!');
                      } else {
                        // No default dose: show dose entry dialog
                        onFreeFlowDoseDialogOpen({
                          swimlaneId: lane.id,
                          time,
                          label: lane.label.trim(),
                        });
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
                        onRateSheetOpen({
                          swimlaneId: lane.id,
                          label: lane.label.trim(),
                          clickMode: 'segment',
                          rateUnit: lane.rateUnit || '',
                          defaultDose: lane.defaultDose || undefined,
                        }, value.toString(), valueTime);
                      } else {
                        // No existing rates: show rate selection dialog to start first infusion
                        onRateSelectionDialogOpen({
                          swimlaneId: lane.id,
                          time,
                          label: lane.label.trim(),
                          rateOptions,
                        });
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
                        onRateSheetOpen({
                          swimlaneId: lane.id,
                          label: lane.label.trim(),
                          clickMode: 'segment',
                          rateUnit: lane.rateUnit || '',
                          defaultDose: lane.defaultDose || undefined,
                        }, value.toString(), valueTime);
                      } else {
                        // No existing rates: insert default directly for first click and create session
                        
                        // Extract group ID and item index from swimlane id
                        const groupMatch = lane.id.match(/admingroup-([a-f0-9-]+)-item-(\d+)/);
                        if (!groupMatch || !anesthesiaRecordId) {
                          console.error('[RATE-INFUSION-CLICK] Failed to match swimlane ID or missing recordId');
                          return;
                        }
                        
                        const groupId = groupMatch[1];
                        const itemIndex = parseInt(groupMatch[2], 10);
                        
                        // Find all items in this administration group and get the item at index
                        const groupItems = anesthesiaItems.filter(item => item.administrationGroup === groupId);
                        const item = groupItems[itemIndex];
                        if (!item) {
                          console.error('[RATE-INFUSION-CLICK] Item not found at index', itemIndex);
                          return;
                        }
                        
                        console.log('[RATE-INFUSION-CLICK] Starting rate-controlled infusion:', {
                          itemId: item.id,
                          itemName: item.name,
                          rate: lane.defaultDose,
                          rateUnit: lane.rateUnit,
                          time
                        });
                        
                        // Update local state for immediate feedback
                        setInfusionData(prev => ({
                          ...prev,
                          [lane.id]: [...(prev[lane.id] || []), [time, lane.defaultDose]].sort((a, b) => a[0] - b[0]),
                        }));
                        
                        // Create initial rate infusion session (as array!)
                        const newSegment: RateInfusionSegment = {
                          startTime: time,
                          rate: lane.defaultDose,
                          rateUnit: lane.rateUnit || '',
                        };
                        setRateInfusionSessions(prev => ({
                          ...prev,
                          [lane.id]: [{
                            swimlaneId: lane.id,
                            label: lane.label.trim(),
                            syringeQuantity: "50ml", // Default
                            segments: [newSegment],
                            startTime: time,
                            state: 'running',
                          }],
                        }));
                        
                        // 🔥 FIX: Save to database as infusion_start (first rate)
                        createMedicationMutation.mutate({
                          anesthesiaRecordId,
                          itemId: item.id,
                          timestamp: new Date(time),
                          type: 'infusion_start' as const,
                          rate: lane.defaultDose,
                          dose: lane.defaultDose, // Syringe quantity
                        });
                        
                        console.log('[RATE-INFUSION-CLICK] Mutation called!');
                      }
                    }
                  } else {
                    // No default dose: open dialog
                    onInfusionDialogOpen({ 
                      swimlaneId: lane.id, 
                      time, 
                      label: lane.label.trim() 
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
    </>
  );
}
