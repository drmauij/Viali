import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { PositionPoint } from '@/hooks/useEventState';

/**
 * PositionSwimlane Component
 * 
 * Handles rendering and interactions for the patient positioning swimlane.
 * 
 * Features:
 * - Displays position labels (supine, prone, lateral, etc.) as clickable overlays
 * - Interactive layer for adding new position entries
 * - Hover tooltips showing position entry details
 * - Click handlers for editing existing positions
 * - Snaps position timestamps to 1-minute intervals
 * 
 * Position data is managed through the TimelineContext's eventState.
 */

const ONE_MINUTE = 60 * 1000;

export interface PositionSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onPositionDialogOpen: (pending: { time: number }) => void;
  onPositionEditDialogOpen: (editing: { id: string; time: number; position: string; index: number }) => void;
}

export function PositionSwimlane({
  swimlanePositions,
  isTouchDevice,
  onPositionDialogOpen,
  onPositionEditDialogOpen,
}: PositionSwimlaneProps) {
  const { t } = useTranslation();
  const {
    eventState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    activeToolMode,
    formatTime,
    data,
  } = useTimelineContext();

  const { positionData } = eventState;

  // State for hover tooltip
  const [positionHoverInfo, setPositionHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  // Find position swimlane
  const positionLane = swimlanePositions.find(lane => lane.id === 'position');

  return (
    <>
      {/* Interactive layer for position swimlane */}
      {!activeToolMode && positionLane && (
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

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to 1-minute intervals
            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

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

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to 1-minute intervals
            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onPositionDialogOpen({ time });
          }}
          data-testid="interactive-position-lane"
        />
      )}

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
            {t('anesthesia.timeline.position.clickToAdd', 'Click to add position')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(positionHoverInfo.time))}
          </div>
        </div>
      )}

      {/* Position values as DOM overlays */}
      {positionData.map((entry: PositionPoint, index: number) => {
        const { id, timestamp, position } = entry;
        if (!positionLane) return null;

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
              onPositionEditDialogOpen({
                id,
                time: timestamp,
                position,
                index,
              });
            }}
            title={`${position} ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`position-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-slate-600 dark:text-slate-400">
              {position}
            </span>
          </div>
        );
      })}
    </>
  );
}
