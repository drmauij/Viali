import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { TOFPoint } from '@/hooks/useEventState';

const ONE_MINUTE = 60 * 1000;

export interface TOFSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onTOFDialogOpen: (pending: { time: number }) => void;
  onTOFEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    value: string;
    percentage?: number;
    index: number;
  }) => void;
}

export function TOFSwimlane({
  swimlanePositions,
  isTouchDevice,
  onTOFDialogOpen,
  onTOFEditDialogOpen,
}: TOFSwimlaneProps) {
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

  const { tofData } = eventState;

  const [tofHoverInfo, setTofHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  const tofLane = swimlanePositions.find(lane => lane.id === 'tof');

  return (
    <>
      {!activeToolMode && tofLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${tofLane.top}px`,
            height: `${tofLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setTofHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setTofHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onTOFDialogOpen({ time });
          }}
          data-testid="interactive-tof-lane"
        />
      )}

      {tofHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: tofHoverInfo.x + 10,
            top: tofHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.tof.clickToAdd', 'Click to add TOF value')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(tofHoverInfo.time))}
          </div>
        </div>
      )}

      {tofData?.map((point: TOFPoint, index: number) => {
        const { id, timestamp, value, percentage } = point;
        if (!tofLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 25px)`;

        const displayText = percentage !== undefined ? `${value} (${percentage}%)` : value;

        return (
          <div
            key={`tof-${id}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-semibold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${tofLane.top + (tofLane.height / 2) - 10}px`,
              minWidth: '50px',
              height: '20px',
            }}
            onClick={() => {
              onTOFEditDialogOpen({
                id,
                time: timestamp,
                value,
                percentage,
                index,
              });
            }}
            title={`${t('anesthesia.timeline.tof.title', 'TOF')}: ${displayText} ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`tof-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-purple-600 dark:text-purple-400">
              {displayText}
            </span>
          </div>
        );
      })}
    </>
  );
}
