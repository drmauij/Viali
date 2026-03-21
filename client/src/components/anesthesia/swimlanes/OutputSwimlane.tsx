import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { OutputData, OutputPoint } from '@/hooks/useOutputState';

/**
 * OutputSwimlane Component
 *
 * Handles rendering and interactions for all output-related swimlanes including:
 * - Output parameter swimlanes (urine, blood, gastricTube, drainage, vomit)
 * - Individual drainage swimlanes (drainage_<id>) when drainages are documented
 * - Auto-computed drainage total when individual drainages exist
 * - Interactive layers for adding/editing output values
 * - Hover tooltips showing output details
 * - Click handlers for editing output values
 * - Bulk entry on parent swimlane
 *
 * Uses TimelineContext for shared state and mutations
 */

/**
 * Output parameter info mapping
 */
const OUTPUT_PARAM_MAP: { [index: number]: { key: keyof OutputData; label: string } } = {
  0: { key: 'urine', label: 'Urine' },
  1: { key: 'blood', label: 'Blood' },
  2: { key: 'gastricTube', label: 'Gastric Tube' },
  3: { key: 'drainage', label: 'Drainage' },
  4: { key: 'vomit', label: 'Vomit' },
};

/**
 * Label map for display
 */
const LABEL_MAP: Record<string, string> = {
  urine: 'Urine',
  blood: 'Blood',
  gastricTube: 'Gastric Tube',
  drainage: 'Drainage',
  vomit: 'Vomit',
};

/**
 * Parameter index map (reverse of OUTPUT_PARAM_MAP)
 */
const PARAM_INDEX_MAP: Record<string, number> = {
  urine: 0,
  blood: 1,
  gastricTube: 2,
  drainage: 3,
  vomit: 4,
};

interface DrainageInfo {
  id: string;
  type: string;
  typeOther?: string;
  size: string;
  position: string;
}

interface OutputSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  intraOpDrainages: DrainageInfo[];
  onOutputDialogOpen: (pending: { paramKey: keyof OutputData; time: number; label: string }) => void;
  onOutputEditDialogOpen: (editing: { paramKey: keyof OutputData; time: number; value: string; index: number; label: string; id: string }) => void;
  onOutputBulkDialogOpen: (pending: { time: number }) => void;
}

/** Get the display label for a drainage */
function getDrainageLabel(drainage: DrainageInfo): string {
  const typeName = drainage.type === 'Other' && drainage.typeOther
    ? drainage.typeOther
    : drainage.type;
  return drainage.position ? `${typeName} — ${drainage.position}` : typeName;
}

export function OutputSwimlane({
  swimlanePositions,
  isTouchDevice,
  intraOpDrainages,
  onOutputDialogOpen,
  onOutputEditDialogOpen,
  onOutputBulkDialogOpen,
}: OutputSwimlaneProps) {
  const { t } = useTranslation();
  const {
    outputState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    currentVitalsSnapInterval,
    isDark,
    activeToolMode,
    collapsedSwimlanes,
    formatTime,
    data,
    swimlanes: activeSwimlanes,
  } = useTimelineContext();

  const { outputData, urineMode } = outputState;

  const hasDrainages = intraOpDrainages.length > 0;

  // State for hover tooltips
  const [outputHoverInfo, setOutputHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    paramKey: keyof OutputData;
    label: string;
  } | null>(null);

  const [outputBulkHoverInfo, setOutputBulkHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  // Find output parent lane
  const outputParentLane = swimlanePositions.find(lane => lane.id === 'output');

  /** Resolve lane ID to paramKey and label */
  function resolveOutputLane(laneId: string): { paramKey: keyof OutputData; label: string } | null {
    // Individual drainage lane: output-drainage-<uuid>
    const drainageMatch = laneId.match(/^output-drainage-(.+)$/);
    if (drainageMatch) {
      const drainageId = drainageMatch[1];
      const drainage = intraOpDrainages.find(d => d.id === drainageId);
      if (!drainage) return null;
      const paramKey = `drainage_${drainageId}` as keyof OutputData;
      return { paramKey, label: getDrainageLabel(drainage) };
    }
    // Standard output lane: output-<index>
    const indexMatch = laneId.match(/^output-(\d+)$/);
    if (indexMatch) {
      const outputIndex = parseInt(indexMatch[1]);
      const paramInfo = OUTPUT_PARAM_MAP[outputIndex];
      if (!paramInfo) return null;
      // Drainage total lane is read-only when individual drainages exist
      if (outputIndex === 3 && hasDrainages) return null;
      return { paramKey: paramInfo.key, label: paramInfo.label };
    }
    return null;
  }

  /** Compute the sum of all drainage_* data points */
  function computeDrainageTotalSum(): number {
    let total = 0;
    for (const key of Object.keys(outputData)) {
      if (key.startsWith('drainage_')) {
        const points = outputData[key as keyof OutputData] || [];
        total += points.reduce((sum, p) => sum + p.value, 0);
      }
    }
    return total;
  }

  /** Get all data entries relevant for rendering (static params + individual drainages) */
  function getAllOutputEntries(): Array<{ paramKey: string; laneId: string; dataPoints: OutputPoint[] }> {
    const entries: Array<{ paramKey: string; laneId: string; dataPoints: OutputPoint[] }> = [];

    // Standard params
    for (const [paramKey, paramIndex] of Object.entries(PARAM_INDEX_MAP)) {
      const dataPoints = outputData[paramKey as keyof OutputData] || [];
      entries.push({ paramKey, laneId: `output-${paramIndex}`, dataPoints });
    }

    // Individual drainage entries
    for (const drainage of intraOpDrainages) {
      const paramKey = `drainage_${drainage.id}`;
      const dataPoints = outputData[paramKey as keyof OutputData] || [];
      entries.push({ paramKey, laneId: `output-drainage-${drainage.id}`, dataPoints });
    }

    return entries;
  }

  return (
    <>
      {/* Interactive layer for output parent swimlane - bulk entry */}
      {!activeToolMode && outputParentLane && !collapsedSwimlanes.has('output') && (
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

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to zoom-dependent interval for output parameters
            time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

            onOutputBulkDialogOpen({ time });
          }}
          data-testid="interactive-output-bulk-lane"
        />
      )}

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
            {t('anesthesia.timeline.output.clickForBulkEntry', 'Click for bulk entry')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(outputBulkHoverInfo.time))}
          </div>
        </div>
      )}

      {/* Interactive layers for output parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const outputParentIndex = activeSwimlanes.findIndex(s => s.id === "output");
        if (outputParentIndex === -1 || collapsedSwimlanes.has("output")) return null;

        return activeSwimlanes.map((lane) => {
          if (!lane.id.startsWith('output-')) return null;

          const resolved = resolveOutputLane(lane.id);
          if (!resolved) return null;

          const { paramKey, label } = resolved;

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

                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);

                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                setOutputHoverInfo({
                  x: e.clientX,
                  y: e.clientY,
                  time,
                  paramKey,
                  label,
                });
              }}
              onMouseLeave={() => setOutputHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;

                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);

                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                // Check if we're clicking on an existing value
                const existingValues = outputData[paramKey] || [];
                const clickTolerance = currentVitalsSnapInterval;
                const existingValueAtTime = existingValues.find((point) =>
                  Math.abs(point.timestamp - time) <= clickTolerance
                );

                if (existingValueAtTime) {
                  // Open edit dialog for existing value
                  const { id, timestamp: valueTime, value } = existingValueAtTime;
                  const valueIndex = existingValues.findIndex(p => p.id === id);
                  onOutputEditDialogOpen({
                    paramKey,
                    time: valueTime,
                    value: value.toString(),
                    index: valueIndex,
                    label,
                    id,
                  });
                } else {
                  // Open add single value dialog
                  onOutputDialogOpen({
                    paramKey,
                    time,
                    label,
                  });
                }
              }}
              data-testid={`interactive-output-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for output value entry */}
      {outputHoverInfo && !isTouchDevice && (() => {
        // Check if there's an existing value at the hover position
        const existingValues = outputData[outputHoverInfo.paramKey] || [];
        const clickTolerance = currentVitalsSnapInterval;
        const hasExistingValue = existingValues.some((point) =>
          Math.abs(point.timestamp - outputHoverInfo.time) <= clickTolerance
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
              {hasExistingValue ? t('anesthesia.timeline.output.clickToEdit', 'Click to edit value') : t('anesthesia.timeline.output.clickToAdd', 'Click to add value')}
            </div>
            <div className="text-xs text-muted-foreground">
              {outputHoverInfo.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatTime(new Date(outputHoverInfo.time))}
            </div>
          </div>
        );
      })()}

      {/* Cumulative total badges on right side of output swimlanes */}
      {!collapsedSwimlanes.has('output') && getAllOutputEntries().map(({ paramKey, laneId, dataPoints }) => {
        const childLane = swimlanePositions.find(lane => lane.id === laneId);
        if (!childLane) return null;

        // For the drainage total lane when individual drainages exist, show sum of all drainage_* keys
        if (paramKey === 'drainage' && hasDrainages) {
          const drainageTotalSum = computeDrainageTotalSum();
          if (drainageTotalSum <= 0) return null;

          return (
            <div
              key={`output-cumulative-drainage-total`}
              className="absolute right-1 z-50 flex items-center justify-end"
              style={{
                top: `${childLane.top}px`,
                height: `${childLane.height}px`,
              }}
            >
              <span
                className="px-1.5 py-0.5 text-[10px] font-medium text-white rounded-full whitespace-nowrap shadow-sm bg-rose-600/70"
                title={`Drainage Total: ${drainageTotalSum} ml`}
              >
                Σ {drainageTotalSum} ml
              </span>
            </div>
          );
        }

        if (!dataPoints || dataPoints.length === 0) return null;

        // Calculate cumulative total
        // For urine in 'total' (bag) mode, use the last value; otherwise sum all
        let cumulativeTotal: number;
        const isUrineTotal = paramKey === 'urine' && urineMode === 'total';
        if (isUrineTotal) {
          // Bag mode: last entered value is the total
          const sorted = [...dataPoints].sort((a, b) => a.timestamp - b.timestamp);
          cumulativeTotal = sorted[sorted.length - 1].value;
        } else {
          cumulativeTotal = dataPoints.reduce((sum: number, p) => sum + p.value, 0);
        }

        if (cumulativeTotal <= 0) return null;

        const displayLabel = LABEL_MAP[paramKey] || paramKey;

        return (
          <div
            key={`output-cumulative-${paramKey}`}
            className="absolute right-1 z-50 flex items-center justify-end"
            style={{
              top: `${childLane.top}px`,
              height: `${childLane.height}px`,
            }}
          >
            <span
              className="px-1.5 py-0.5 text-[10px] font-medium text-white rounded-full whitespace-nowrap shadow-sm bg-rose-600"
              title={`${displayLabel}: ${cumulativeTotal} ml${isUrineTotal ? ' (bag)' : ''}`}
            >
              {cumulativeTotal} ml
            </span>
          </div>
        );
      })}

      {/* Output parameter values as DOM overlays */}
      {!collapsedSwimlanes.has('output') && getAllOutputEntries().flatMap(({ paramKey, laneId, dataPoints }) => {
        // Skip rendering data points on the drainage total lane (it's auto-computed)
        if (paramKey === 'drainage' && hasDrainages) return [];

        // Find the corresponding child lane in swimlanePositions
        const childLane = swimlanePositions.find(lane => lane.id === laneId);
        if (!childLane) return [];

        return dataPoints.map((point, index: number) => {
          const { id, timestamp, value } = point;
          const xFraction = (timestamp - visibleStart) / visibleRange;

          if (xFraction < 0 || xFraction > 1) return null;

          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;
          const displayLabel = LABEL_MAP[paramKey] || paramKey;

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
                onOutputEditDialogOpen({
                  paramKey: paramKey as keyof OutputData,
                  time: timestamp,
                  value: value.toString(),
                  index,
                  label: displayLabel,
                  id,
                });
              }}
              title={`${displayLabel}: ${value} ml at ${formatTime(new Date(timestamp))}`}
              data-testid={`output-value-${paramKey}-${index}`}
            >
              <span className="group-hover:scale-110 transition-transform">
                {value}
              </span>
            </div>
          );
        }).filter(Boolean);
      })}
    </>
  );
}
