import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { HeartRhythmPoint } from '@/hooks/useEventState';

/**
 * HeartRhythmSwimlane Component
 * 
 * Handles rendering and interactions for the heart rhythm tracking swimlane.
 * 
 * Features:
 * - Displays heart rhythm labels (NSR, AF, VT, VF, etc.) as clickable overlays
 * - Interactive layer for adding new rhythm entries
 * - Hover tooltips showing rhythm entry details
 * - Click handlers for editing existing rhythms
 * - Snaps rhythm timestamps to 1-minute intervals
 * 
 * Heart rhythm data is managed through the TimelineContext's eventState.
 */

const ONE_MINUTE = 60 * 1000;

export interface HeartRhythmSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onHeartRhythmDialogOpen: (pending: { time: number }) => void;
  onHeartRhythmEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    rhythm: string; 
    index: number;
  }) => void;
}

export function HeartRhythmSwimlane({
  swimlanePositions,
  isTouchDevice,
  onHeartRhythmDialogOpen,
  onHeartRhythmEditDialogOpen,
}: HeartRhythmSwimlaneProps) {
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

  const { heartRhythmData } = eventState;

  // State for hover tooltip
  const [heartRhythmHoverInfo, setHeartRhythmHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  // Find heart rhythm swimlane
  const rhythmLane = swimlanePositions.find(lane => lane.id === 'herzrhythmus');

  return (
    <>
      {/* Interactive layer for heart rhythm swimlane */}
      {!activeToolMode && rhythmLane && (
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

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to 1-minute intervals
            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

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

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to 1-minute intervals
            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onHeartRhythmDialogOpen({ time });
          }}
          data-testid="interactive-heart-rhythm-lane"
        />
      )}

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
            {t('anesthesia.timeline.heartRhythm.clickToAdd', 'Click to add rhythm')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(heartRhythmHoverInfo.time))}
          </div>
        </div>
      )}

      {/* Heart rhythm values as DOM overlays */}
      {heartRhythmData.map((point: HeartRhythmPoint, index: number) => {
        const { id, timestamp, value: rhythm } = point;
        if (!rhythmLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;

        return (
          <div
            key={`rhythm-${id}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-semibold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${rhythmLane.top + (rhythmLane.height / 2) - 10}px`,
              minWidth: '40px',
              height: '20px',
            }}
            onClick={() => {
              onHeartRhythmEditDialogOpen({
                id,
                time: timestamp,
                rhythm,
                index,
              });
            }}
            title={`${rhythm} ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`heart-rhythm-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-pink-600 dark:text-pink-400">
              {rhythm}
            </span>
          </div>
        );
      })}
    </>
  );
}
