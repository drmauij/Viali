import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { ScorePoint } from '@/hooks/useEventState';

const ONE_MINUTE = 60 * 1000;

const ALDRETE_DISCHARGE_THRESHOLD = 9;
const PARSAP_DISCHARGE_THRESHOLD = 9;

export interface ScoresSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onScoresDialogOpen: (pending: { time: number }) => void;
  onScoresEditDialogOpen: (editing: { 
    id: string; 
    time: number; 
    scoreType: 'aldrete' | 'parsap';
    totalScore: number;
    aldreteScore?: any;
    parsapScore?: any;
    index: number;
  }) => void;
}

function getScoreDisplay(point: ScorePoint): { label: string; isDischargeReady: boolean } {
  const threshold = point.scoreType === 'aldrete' ? ALDRETE_DISCHARGE_THRESHOLD : PARSAP_DISCHARGE_THRESHOLD;
  const isDischargeReady = point.totalScore >= threshold;
  const prefix = point.scoreType === 'aldrete' ? 'A' : 'P';
  return {
    label: `${prefix}:${point.totalScore}`,
    isDischargeReady,
  };
}

export function ScoresSwimlane({
  swimlanePositions,
  isTouchDevice,
  onScoresDialogOpen,
  onScoresEditDialogOpen,
}: ScoresSwimlaneProps) {
  const { t } = useTranslation();
  const {
    eventState,
    currentZoomStart,
    currentZoomEnd,
    activeToolMode,
    formatTime,
    data,
  } = useTimelineContext();

  const { scoresData } = eventState;

  const [scoresHoverInfo, setScoresHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  const scoresLane = swimlanePositions.find(lane => lane.id === 'scores');

  return (
    <>
      {!activeToolMode && scoresLane && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${scoresLane.top}px`,
            height: `${scoresLane.height}px`,
            zIndex: 35,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            setScoresHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setScoresHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            time = Math.round(time / ONE_MINUTE) * ONE_MINUTE;

            onScoresDialogOpen({ time });
          }}
          data-testid="interactive-scores-lane"
        />
      )}

      {scoresHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: scoresHoverInfo.x + 10,
            top: scoresHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.scores.clickToAdd', 'Click to add Aldrete/PARSAP score')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(new Date(scoresHoverInfo.time))}
          </div>
        </div>
      )}

      {scoresData?.map((point: ScorePoint, index: number) => {
        const { id, timestamp, scoreType, totalScore, aldreteScore, parsapScore } = point;
        if (!scoresLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 25px)`;
        const { label, isDischargeReady } = getScoreDisplay(point);

        return (
          <div
            key={`scores-${id}`}
            className={`absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm px-2 rounded ${
              isDischargeReady 
                ? 'bg-green-100 dark:bg-green-900/30 border border-green-500' 
                : 'bg-background border border-border'
            }`}
            style={{
              left: leftPosition,
              top: `${scoresLane.top + (scoresLane.height / 2) - 12}px`,
              minWidth: '50px',
              height: '24px',
            }}
            onClick={() => {
              onScoresEditDialogOpen({
                id,
                time: timestamp,
                scoreType,
                totalScore,
                aldreteScore,
                parsapScore,
                index,
              });
            }}
            title={`${scoreType === 'aldrete' ? t('anesthesia.timeline.scores.aldrete', 'Aldrete') : t('anesthesia.timeline.scores.parsap', 'PARSAP')}: ${totalScore}/10 ${t('anesthesia.timeline.at', 'at')} ${formatTime(new Date(timestamp))}${isDischargeReady ? ` - ${t('anesthesia.timeline.scores.dischargeReady', 'Discharge Ready')}` : ''}`}
            data-testid={`scores-${index}`}
          >
            <span className={`group-hover:scale-110 transition-transform ${
              isDischargeReady 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-foreground'
            }`}>
              {label}
            </span>
          </div>
        );
      })}
    </>
  );
}
