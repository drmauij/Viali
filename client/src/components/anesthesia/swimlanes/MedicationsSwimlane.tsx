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
 * InfusionPill Component - Unified horizontal bar for both free-flow and rate-based infusions
 */
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

/**
 * BolusPill Component - Horizontal bar for bolus medication administration
 */
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
  return (
    <div
      className="absolute flex items-center cursor-pointer"
      style={{
        left: `calc(200px + ((100% - 210px) * ${leftPercent} / 100))`,
        top: `${yPosition}px`,
        height: '32px',
        zIndex: 40,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={testId}
    >
      {/* Vertical tick line */}
      <div
        style={{
          width: '2px',
          height: '16px',
          backgroundColor: '#000000',
        }}
      />
      {/* Dose number beside the tick */}
      <span 
        className="text-sm font-semibold ml-1"
        style={{ color: '#000000' }}
      >
        {dose}
      </span>
    </div>
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
  onMedicationDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string }) => void;
  onMedicationEditDialogOpen: (editing: { swimlaneId: string; time: number; dose: string; index: number; id: string }) => void;
  onInfusionDialogOpen: (pending: { swimlaneId: string; time: number; label: string }) => void;
  onFreeFlowDoseDialogOpen: (pending: { swimlaneId: string; time: number; label: string }) => void;
  onFreeFlowSheetOpen: (session: FreeFlowSession & { clickMode?: 'label' | 'segment' }, doseInput: string, timeInput: number) => void;
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
  onInfusionDialogOpen,
  onFreeFlowDoseDialogOpen,
  onFreeFlowSheetOpen,
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
      {/* Bolus Medication Pills - Horizontal bars for single-point doses */}
      {activeSwimlanes.flatMap((lane, laneIndex) => {
        const isMedicationChild = !lane.rateUnit;
        
        console.log('[MED-RENDER] Checking lane for bolus pills:', {
          laneId: lane.id,
          isMedicationChild,
          hasDoseData: !!medicationDoseData[lane.id]?.length,
          doseData: medicationDoseData[lane.id],
          allDoseKeys: Object.keys(medicationDoseData)
        });
        
        if (!isMedicationChild || !medicationDoseData[lane.id]?.length) return [];
        
        const childLane = swimlanePositions.find(pos => pos.id === lane.id);
        if (!childLane) return [];
        
        const visibleStart = currentZoomStart ?? data.startTime;
        const visibleEnd = currentZoomEnd ?? data.endTime;
        const visibleRange = visibleEnd - visibleStart;
        
        return medicationDoseData[lane.id].map(([timestamp, dose, id], index) => {
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
                onMedicationEditDialogOpen({
                  swimlaneId: lane.id,
                  time: timestamp,
                  dose: dose.toString(),
                  index,
                  id,
                });
              }}
            />
          );
        }).filter(Boolean);
      })}

      {/* Infusion Pills - Horizontal bars with label and segment click zones */}
      {!collapsedSwimlanes.has('medikamente') && activeSwimlanes.flatMap((lane) => {
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
                  
                  onFreeFlowSheetOpen({ ...session, clickMode: 'label' }, rate.toString(), timestamp);
                } else {
                  onRateSheetOpen({
                    swimlaneId: lane.id,
                    label: lane.label.trim(),
                    clickMode: 'label',
                    rateUnit: lane.rateUnit || '',
                    defaultDose: lane.defaultDose || undefined,
                  }, rate.toString(), timestamp);
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
                  
                  onFreeFlowSheetOpen({ ...session, clickMode: 'segment' }, lastDose, timestamp);
                } else {
                  onRateSheetOpen({
                    swimlaneId: lane.id,
                    label: lane.label.trim(),
                    clickMode: 'segment',
                    rateUnit: lane.rateUnit || '',
                    defaultDose: lane.defaultDose || undefined,
                  }, rate.toString(), timestamp);
                }
              }}
            />
          );
        });
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
                  // Open dialog for new dose
                  onMedicationDoseDialogOpen({ 
                    swimlaneId: lane.id, 
                    time, 
                    label: lane.label.trim() 
                  });
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
                      // Swimlane is already busy - find the closest session and show unified sheet
                      const closestSession = sessions.reduce((closest, session) => {
                        const currentDist = Math.abs(session.startTime - time);
                        const closestDist = Math.abs(closest.startTime - time);
                        return currentDist < closestDist ? session : closest;
                      }, sessions[0]);
                      
                      // 🔥 FIX: Open unified free-flow sheet with CLICKED time, not session start time
                      onFreeFlowSheetOpen({ ...closestSession, clickMode: 'segment' }, closestSession.dose, time);
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
                        setInfusionData(prev => ({
                          ...prev,
                          [lane.id]: [...(prev[lane.id] || []), [time, lane.defaultDose]].sort((a, b) => a[0] - b[0]),
                        }));
                        
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
