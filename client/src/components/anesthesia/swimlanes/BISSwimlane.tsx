import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { BISPoint } from '@/hooks/useEventState';

const ONE_MINUTE = 60 * 1000;

export interface BISSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onBISDialogOpen: (pending: { time: number }) => void;
  onBISEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    value: number; 
    index: number;
  }) => void;
}

export function BISSwimlane({
  swimlanePositions,
  isTouchDevice,
  onBISDialogOpen,
  onBISEditDialogOpen,
}: BISSwimlaneProps) {
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

  const { bisData } = eventState;

  const [bisHoverInfo, setBisHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  const bisLane = swimlanePositions.find(lane => lane.id === 'bis');

  return (
    <>
      {!activeToolMode && bisLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${bisLane.top}px`,
            height: `${bisLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setBisHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setBisHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onBISDialogOpen({ time });
          }}
          data-testid="interactive-bis-lane"
        />
      )}

      {bisHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: bisHoverInfo.x + 10,
            top: bisHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.bis.clickToAdd', 'Click to add BIS value')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(bisHoverInfo.time))}
          </div>
        </div>
      )}

      {bisData?.map((point: BISPoint, index: number) => {
        const { id, timestamp, value } = point;
        if (!bisLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;

        return (
          <div
            key={`bis-${id}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${bisLane.top + (bisLane.height / 2) - 10}px`,
              minWidth: '40px',
              height: '20px',
            }}
            onClick={() => {
              onBISEditDialogOpen({
                id,
                time: timestamp,
                value,
                index,
              });
            }}
            title={`${t('anesthesia.timeline.bis.title', 'BIS')}: ${value} ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`bis-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-blue-600 dark:text-blue-400">
              {value}
            </span>
          </div>
        );
      })}
    </>
  );
}
