import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { OutputData } from '@/hooks/useOutputState';

/**
 * OutputSwimlane Component
 * 
 * Handles rendering and interactions for all output-related swimlanes including:
 * - Output parameter swimlanes (urine, blood, gastricTube, drainage, vomit)
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

interface OutputSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onOutputDialogOpen: (pending: { paramKey: keyof OutputData; time: number; label: string }) => void;
  onOutputEditDialogOpen: (editing: { paramKey: keyof OutputData; time: number; value: string; index: number; label: string; id: string }) => void;
  onOutputBulkDialogOpen: (pending: { time: number }) => void;
}

export function OutputSwimlane({
  swimlanePositions,
  isTouchDevice,
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

  const { outputData } = outputState;

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
            {formatTime(outputBulkHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layers for output parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const outputParentIndex = activeSwimlanes.findIndex(s => s.id === "output");
        if (outputParentIndex === -1 || collapsedSwimlanes.has("output")) return null;

        return activeSwimlanes.map((lane, index) => {
          const isOutputChild = lane.id.startsWith('output-');
          if (!isOutputChild) return null;

          const outputIndex = parseInt(lane.id.split('-')[1]);
          const paramInfo = OUTPUT_PARAM_MAP[outputIndex];
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

                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);

                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                // Check if there's an existing value at this time
                const existingValues = outputData[paramInfo.key] || [];
                const clickTolerance = currentVitalsSnapInterval;
                const hasExistingValue = existingValues.some((point) =>
                  Math.abs(point.timestamp - time) <= clickTolerance
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

                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);

                // Snap to zoom-dependent interval for output parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                // Check if we're clicking on an existing value
                const existingValues = outputData[paramInfo.key] || [];
                const clickTolerance = currentVitalsSnapInterval;
                const existingValueAtTime = existingValues.find((point) =>
                  Math.abs(point.timestamp - time) <= clickTolerance
                );

                if (existingValueAtTime) {
                  // Open edit dialog for existing value
                  const { id, timestamp: valueTime, value } = existingValueAtTime;
                  const valueIndex = existingValues.findIndex(p => p.id === id);
                  onOutputEditDialogOpen({
                    paramKey: paramInfo.key,
                    time: valueTime,
                    value: value.toString(),
                    index: valueIndex,
                    label: paramInfo.label,
                    id,
                  });
                } else {
                  // Open add single value dialog
                  onOutputDialogOpen({
                    paramKey: paramInfo.key,
                    time,
                    label: paramInfo.label
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
              {formatTime(outputHoverInfo.time)}
            </div>
          </div>
        );
      })()}

      {/* Output parameter values as DOM overlays */}
      {!collapsedSwimlanes.has('output') && Object.entries(outputData).flatMap(([paramKey, dataPoints]) => {
        const paramIndex = PARAM_INDEX_MAP[paramKey];
        if (paramIndex === undefined) return [];

        // Find the corresponding child lane in swimlanePositions
        const childLane = swimlanePositions.find(lane => lane.id === `output-${paramIndex}`);
        if (!childLane) {
          return [];
        }

        return dataPoints.map((point, index) => {
          const { id, timestamp, value } = point;
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
                onOutputEditDialogOpen({
                  paramKey: paramKey as keyof OutputData,
                  time: timestamp,
                  value: value.toString(),
                  index,
                  label: LABEL_MAP[paramKey] || paramKey,
                  id,
                });
              }}
              title={`${LABEL_MAP[paramKey]}: ${value} ml at ${formatTime(timestamp)}`}
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
