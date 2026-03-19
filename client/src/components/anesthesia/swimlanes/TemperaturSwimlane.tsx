import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { TemperaturPoint } from '@/hooks/useEventState';

const ONE_MINUTE = 60 * 1000;

export interface TemperaturSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onTemperaturDialogOpen: (pending: { time: number }) => void;
  onTemperaturEditDialogOpen: (editing: {
    id: string;
    time: number;
    value: number;
    index: number;
  }) => void;
}

export function TemperaturSwimlane({
  swimlanePositions,
  isTouchDevice,
  onTemperaturDialogOpen,
  onTemperaturEditDialogOpen,
}: TemperaturSwimlaneProps) {
  const { t } = useTranslation();
  const {
    eventState,
    currentZoomStart,
    currentZoomEnd,
    activeToolMode,
    formatTime,
    data,
  } = useTimelineContext();

  const { temperaturData } = eventState;

  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  const tempLane = swimlanePositions.find(lane => lane.id === 'temperatur');

  return (
    <>
      {!activeToolMode && tempLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${tempLane.top}px`,
            height: `${tempLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onTemperaturDialogOpen({ time });
          }}
          data-testid="interactive-temperatur-lane"
        />
      )}

      {hoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.temperature.clickToAdd', 'Click to add temperature')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(hoverInfo.time))}
          </div>
        </div>
      )}

      {temperaturData?.map((point: TemperaturPoint, index: number) => {
        const { id, timestamp, value } = point;
        if (!tempLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;

        return (
          <div
            key={`temp-${id}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm px-2"
            style={{
              left: leftPosition,
              top: `${tempLane.top + (tempLane.height / 2) - 10}px`,
              minWidth: '40px',
              height: '20px',
            }}
            onClick={() => {
              onTemperaturEditDialogOpen({
                id,
                time: timestamp,
                value,
                index,
              });
            }}
            title={`${t('anesthesia.timeline.temperature.label', 'Temperature')}: ${value}°C ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}`}
            data-testid={`temperatur-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform text-orange-600 dark:text-orange-400">
              {value}°
            </span>
          </div>
        );
      })}
    </>
  );
}
