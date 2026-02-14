import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { VASPoint } from '@/hooks/useEventState';

const ONE_MINUTE = 60 * 1000;

export interface VASSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onVASDialogOpen: (pending: { time: number }) => void;
  onVASEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    value: number;
    index: number;
  }) => void;
}

function getVASColor(value: number): string {
  if (value <= 3) return 'text-green-600 dark:text-green-400';
  if (value <= 6) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

export function VASSwimlane({
  swimlanePositions,
  isTouchDevice,
  onVASDialogOpen,
  onVASEditDialogOpen,
}: VASSwimlaneProps) {
  const { t } = useTranslation();
  const {
    eventState,
    currentZoomStart,
    currentZoomEnd,
    activeToolMode,
    formatTime,
    data,
  } = useTimelineContext();

  const { vasData } = eventState;

  const [vasHoverInfo, setVasHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  const vasLane = swimlanePositions.find(lane => lane.id === 'vas');

  return (
    <>
      {!activeToolMode && vasLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${vasLane.top}px`,
            height: `${vasLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setVasHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setVasHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onVASDialogOpen({ time });
          }}
          data-testid="interactive-vas-lane"
        />
      )}

      {vasHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: vasHoverInfo.x + 10,
            top: vasHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.vas.clickToAdd', 'Click to add VAS pain score')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(vasHoverInfo.time))}
          </div>
        </div>
      )}

      {vasData?.map((point: VASPoint, index: number) => {
        const { id, timestamp, value } = point;
        if (!vasLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;

        return (
          <div
            key={`vas-${id}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${vasLane.top + (vasLane.height / 2) - 10}px`,
              minWidth: '40px',
              height: '20px',
            }}
            onClick={() => {
              onVASEditDialogOpen({
                id,
                time: timestamp,
                value,
                index,
              });
            }}
            title={`${t('anesthesia.timeline.vas.title', 'VAS')}: ${value} ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`vas-${index}`}
          >
            <span className={`group-hover:scale-110 transition-transform ${getVASColor(value)}`}>
              {value}
            </span>
          </div>
        );
      })}
    </>
  );
}
