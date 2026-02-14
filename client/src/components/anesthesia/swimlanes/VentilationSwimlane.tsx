import { useState } from 'react';
import { useTranslation } from "react-i18next";
import { useTimelineContext } from '../TimelineContext';
import type { VitalPoint } from '@/hooks/useVitalsState';

/**
 * VentilationSwimlane Component
 * 
 * Handles rendering and interactions for all ventilation-related swimlanes including:
 * - Ventilation mode swimlane (CMV, SIMV, PSV, CPAP, etc.)
 * - Ventilation parameter swimlanes (etCO2, PIP, PEEP, Tidal Volume, etc.)
 * - Interactive layers for adding/editing ventilation values
 * - Hover tooltips showing parameter details
 * - Click handlers for editing parameters and modes
 * 
 * Also exports utility functions for generating ECharts configuration:
 * - generateVentilationSeries: Chart series for ventilation parameter text labels
 */

/**
 * Ventilation parameter info mapping
 */
const VENTILATION_PARAM_MAP: { [index: number]: { key: keyof VentilationData; label: string } } = {
  0: { key: 'etCO2', label: 'etCO2' },
  1: { key: 'pip', label: 'P insp' },
  2: { key: 'peep', label: 'PEEP' },
  3: { key: 'tidalVolume', label: 'Tidal Volume' },
  4: { key: 'respiratoryRate', label: 'Respiratory Rate' },
  5: { key: 'minuteVolume', label: 'Minute Volume' },
  6: { key: 'fiO2', label: 'FiO2' },
};

/**
 * Snapshot key mapping for parameter IDs
 */
const SNAPSHOT_KEY_MAP: Record<string, string> = {
  etCO2: 'etco2',
  pip: 'pip',
  peep: 'peep',
  tidalVolume: 'tidalVolume',
  respiratoryRate: 'respiratoryRate',
  minuteVolume: 'minuteVolume',
  fiO2: 'fio2',
};

export interface VentilationData {
  etCO2: VitalPoint[];
  pip: VitalPoint[];
  peep: VitalPoint[];
  tidalVolume: VitalPoint[];
  respiratoryRate: VitalPoint[];
  minuteVolume: VitalPoint[];
  fiO2: VitalPoint[];
}

export interface VentilationModePoint {
  id: string;
  timestamp: number;
  value: string;
}

interface VentilationSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  isTouchDevice: boolean;
  onVentilationDialogOpen: (pending: { paramKey: keyof VentilationData; time: number; label: string }) => void;
  onVentilationEditDialogOpen: (editing: { paramKey: keyof VentilationData; time: number; value: string; index: number; label: string; id: string }) => void;
  onVentilationModeEditDialogOpen: (editing: { time: number; mode: string; index: number; id: string }) => void;
  onVentilationModeAddDialogOpen: (pending: { time: number }) => void;
  clinicalSnapshot?: any;
}

export function VentilationSwimlane({
  swimlanePositions,
  isTouchDevice,
  onVentilationDialogOpen,
  onVentilationEditDialogOpen,
  onVentilationModeEditDialogOpen,
  onVentilationModeAddDialogOpen,
  clinicalSnapshot,
}: VentilationSwimlaneProps) {
  const { t } = useTranslation();
  const {
    ventilationState,
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

  const { ventilationData, ventilationModeData } = ventilationState;

  // State for hover tooltips
  const [ventilationHoverInfo, setVentilationHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
    paramKey: keyof VentilationData;
    label: string;
  } | null>(null);

  const [ventilationModeHoverInfo, setVentilationModeHoverInfo] = useState<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  // Calculate visible range
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const visibleRange = visibleEnd - visibleStart;

  // Find ventilation parent lane
  const ventilationParentLane = swimlanePositions.find(lane => lane.id === 'ventilation');

  return (
    <>
      {/* Interactive layer for ventilation parent swimlane - mode selection */}
      {!activeToolMode && ventilationParentLane && !collapsedSwimlanes.has('ventilation') && (
        <div
          className="absolute cursor-pointer hover:bg-primary/5 transition-colors"
          style={{
            left: '200px',
            right: '10px',
            top: `${ventilationParentLane.top}px`,
            height: `${ventilationParentLane.height}px`,
            zIndex: 30,
          }}
          onMouseMove={(e) => {
            if (isTouchDevice) return;

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to zoom-dependent interval
            time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

            setVentilationModeHoverInfo({
              x: e.clientX,
              y: e.clientY,
              time
            });
          }}
          onMouseLeave={() => setVentilationModeHoverInfo(null)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;

            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);

            // Snap to zoom-dependent interval
            time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

            onVentilationModeAddDialogOpen({ time });
          }}
          data-testid="interactive-ventilation-mode-lane"
        />
      )}

      {/* Tooltip for ventilation mode selection */}
      {ventilationModeHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationModeHoverInfo.x + 10,
            top: ventilationModeHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.ventilation.clickToAddMode', 'Click to add mode')}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(ventilationModeHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Interactive layers for ventilation parameter swimlanes - to place values */}
      {!activeToolMode && (() => {
        const ventilationParentIndex = activeSwimlanes.findIndex(s => s.id === "ventilation");
        if (ventilationParentIndex === -1 || collapsedSwimlanes.has("ventilation")) return null;

        return activeSwimlanes.map((lane, index) => {
          const isVentilationChild = lane.id.startsWith('ventilation-');
          if (!isVentilationChild) return null;

          const ventilationIndex = parseInt(lane.id.split('-')[1]);
          const paramInfo = VENTILATION_PARAM_MAP[ventilationIndex];
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

                // Snap to zoom-dependent interval for ventilation parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                setVentilationHoverInfo({
                  x: e.clientX,
                  y: e.clientY,
                  time,
                  paramKey: paramInfo.key,
                  label: paramInfo.label
                });
              }}
              onMouseLeave={() => setVentilationHoverInfo(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;

                const xPercent = x / rect.width;
                let time = visibleStart + (xPercent * visibleRange);

                // Snap to zoom-dependent interval for ventilation parameters
                time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

                onVentilationDialogOpen({
                  paramKey: paramInfo.key,
                  time,
                  label: paramInfo.label
                });
              }}
              data-testid={`interactive-ventilation-lane-${lane.id}`}
            />
          );
        });
      })()}

      {/* Tooltip for ventilation parameter entry */}
      {ventilationHoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: ventilationHoverInfo.x + 10,
            top: ventilationHoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {t('anesthesia.timeline.ventilation.clickToAddValue', 'Click to add value')}
          </div>
          <div className="text-xs text-muted-foreground">
            {ventilationHoverInfo.label}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(ventilationHoverInfo.time)}
          </div>
        </div>
      )}

      {/* Ventilation mode values as DOM overlays (parent swimlane) */}
      {!collapsedSwimlanes.has('ventilation') && ventilationModeData.map((point, index) => {
        const { id, timestamp, value: mode } = point;
        const ventilationLane = swimlanePositions.find(lane => lane.id === 'ventilation');
        if (!ventilationLane) return null;

        const xFraction = (timestamp - visibleStart) / visibleRange;

        if (xFraction < 0 || xFraction > 1) return null;

        const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 30px)`;

        return (
          <div
            key={`vent-mode-${timestamp}-${index}`}
            className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm"
            style={{
              left: leftPosition,
              top: `${ventilationLane.top + (ventilationLane.height / 2) - 10}px`,
              minWidth: '60px',
              height: '20px',
            }}
            onClick={() => {
              onVentilationModeEditDialogOpen({
                time: timestamp,
                mode,
                index,
                id,
              });
            }}
            title={`${mode} at ${formatTime(timestamp)}`}
            data-testid={`vent-mode-${index}`}
          >
            <span className="group-hover:scale-110 transition-transform">
              {mode}
            </span>
          </div>
        );
      })}

      {/* Ventilation parameter values as DOM overlays */}
      {!collapsedSwimlanes.has('ventilation') && Object.entries(ventilationData).flatMap(([paramKey, dataPoints]) => {
        // Map parameter keys to their child lane indices
        const paramIndexMap: Record<string, number> = {
          etCO2: 0,
          pip: 1,
          peep: 2,
          tidalVolume: 3,
          respiratoryRate: 4,
          minuteVolume: 5,
          fiO2: 6,
        };

        const paramIndex = paramIndexMap[paramKey];
        if (paramIndex === undefined) return [];

        // Find the corresponding child lane in swimlanePositions
        const childLane = swimlanePositions.find(lane => lane.id === `ventilation-${paramIndex}`);
        if (!childLane) {
          return [];
        }

        const labelMap: Record<string, string> = {
          etCO2: 'etCO2',
          pip: 'P insp',
          peep: 'PEEP',
          tidalVolume: 'Tidal Volume',
          respiratoryRate: 'Respiratory Rate',
          minuteVolume: 'Minute Volume',
          fiO2: 'FiO2',
        };

        return dataPoints.map((point: VitalPoint, index: number) => {
          // Destructure as tuple [timestamp, value]
          const [timestamp, value] = point;

          // Look up the ID from clinical snapshot for edit/delete operations
          const snapshotKey = SNAPSHOT_KEY_MAP[paramKey];
          const snapshotData = clinicalSnapshot?.data as any;
          const pointId = snapshotData?.[snapshotKey]?.[index]?.id || '';

          const xFraction = (timestamp - visibleStart) / visibleRange;

          if (xFraction < 0 || xFraction > 1) return null;

          const leftPosition = `calc(200px + ${xFraction} * (100% - 210px) - 20px)`;

          return (
            <div
              key={`vent-${paramKey}-${timestamp}-${index}`}
              className="absolute z-40 cursor-pointer flex items-center justify-center group font-mono font-bold text-sm"
              style={{
                left: leftPosition,
                top: `${childLane.top + 7}px`,
                minWidth: '40px',
                height: '20px',
              }}
              onClick={() => {
                onVentilationEditDialogOpen({
                  paramKey: paramKey as keyof VentilationData,
                  time: timestamp,
                  value: value.toString(),
                  index,
                  label: labelMap[paramKey] || paramKey,
                  id: pointId,
                });
              }}
              title={`${labelMap[paramKey]}: ${value} at ${formatTime(timestamp)}`}
              data-testid={`vent-value-${paramKey}-${index}`}
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

/**
 * Utility function: Generate ventilation parameter series for ECharts
 * 
 * Creates scatter series with text labels for each ventilation parameter.
 * This function is called from UnifiedTimeline to add ventilation data to the chart option.
 * 
 * @param ventilationData - Ventilation parameter data points
 * @param ventilationParentIndex - Index of ventilation parent in activeSwimlanes array
 * @param isDark - Whether dark theme is active
 * @returns Array of ECharts series configurations
 */
export function generateVentilationSeries(
  ventilationData: VentilationData,
  ventilationParentIndex: number,
  isDark: boolean
): any[] {
  const series: any[] = [];
  const textColor = isDark ? '#ffffff' : '#000000';
  const modernMonoFont = '"SF Mono", "JetBrains Mono", "Roboto Mono", "Fira Code", Monaco, Consolas, monospace';

  // Add etCO2 text labels (index 0)
  if (ventilationData.etCO2?.length > 0) {
    const paramIndex = ventilationParentIndex + 1;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.etCO2.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.etCO2.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'etCO2',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add PIP text labels (index 1)
  if (ventilationData.pip?.length > 0) {
    const paramIndex = ventilationParentIndex + 2;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.pip.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.pip.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'PIP',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add PEEP text labels (index 2)
  if (ventilationData.peep?.length > 0) {
    const paramIndex = ventilationParentIndex + 3;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.peep.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.peep.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'PEEP',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add Tidal Volume text labels (index 3)
  if (ventilationData.tidalVolume?.length > 0) {
    const paramIndex = ventilationParentIndex + 4;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.tidalVolume.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.tidalVolume.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'Tidal Volume',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add Respiratory Rate text labels (index 4)
  if (ventilationData.respiratoryRate?.length > 0) {
    const paramIndex = ventilationParentIndex + 5;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.respiratoryRate.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.respiratoryRate.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'Respiratory Rate',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add Minute Volume text labels (index 5)
  if (ventilationData.minuteVolume?.length > 0) {
    const paramIndex = ventilationParentIndex + 6;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.minuteVolume.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.minuteVolume.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'Minute Volume',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  // Add FiO2 text labels (index 6)
  if (ventilationData.fiO2?.length > 0) {
    const paramIndex = ventilationParentIndex + 7;
    const gridIdx = paramIndex + 1;
    const valuesMap = new Map(ventilationData.fiO2.map(([time, val]) => [time, val]));
    const seriesData = ventilationData.fiO2.map(([time, val]) => [time, ""]);
    series.push({
      type: 'scatter',
      name: 'FiO2',
      xAxisIndex: gridIdx,
      yAxisIndex: gridIdx + 1,
      data: seriesData,
      symbol: 'none',
      label: {
        show: true,
        formatter: (params: any) => {
          const timestamp = params.value[0];
          return valuesMap.get(timestamp)?.toString() || '';
        },
        fontSize: 13,
        fontWeight: '600',
        fontFamily: modernMonoFont,
        color: textColor,
      },
      cursor: 'pointer',
      z: 10,
    });
  }

  return series;
}
