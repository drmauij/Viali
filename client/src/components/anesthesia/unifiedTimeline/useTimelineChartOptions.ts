import { useMemo } from "react";
import * as echarts from "echarts";
import type { VitalPoint } from "@/hooks/useVitalsState";
import type { BpDataPoints } from "@/hooks/useVitalsState";
import type { VentilationData } from "@/hooks/useVentilationState";
import type { MedicationDoseData } from "@/hooks/useMedicationState";
import type { UnifiedTimelineData, SwimlaneConfig } from "./types";
import { THIRTY_MINUTES } from "@/utils/timelineUtils";
import { CHART_LAYOUT } from "@/utils/chartUtils";
import { formatTime } from "@/lib/dateUtils";
import {
  generateVitalsYAxes,
  generateVitalsSeries,
  generateVitalsYAxisLabels,
} from "../swimlanes/VitalsSwimlane";
import { generateVentilationSeries } from "../swimlanes/VentilationSwimlane";

export interface UseTimelineChartOptionsParams {
  data: UnifiedTimelineData;
  isDark: boolean;
  activeSwimlanes: SwimlaneConfig[];
  now: number | undefined;
  currentTime: number;
  hrDataPoints: VitalPoint[];
  bpDataPoints: BpDataPoints;
  spo2DataPoints: VitalPoint[];
  ventilationData: VentilationData;
  medicationDoseData: MedicationDoseData;
  pendingSysValue: { time: number; value: number } | null;
  bpEntryMode: 'sys' | 'dia';
  collapsedSwimlanes: Set<string>;
  initialZoomAppliedRef: React.MutableRefObject<boolean>;
}

export function useTimelineChartOptions({
  data,
  isDark,
  activeSwimlanes,
  now,
  currentTime,
  hrDataPoints,
  bpDataPoints,
  spo2DataPoints,
  ventilationData,
  medicationDoseData,
  pendingSysValue,
  bpEntryMode,
  collapsedSwimlanes,
  initialZoomAppliedRef,
}: UseTimelineChartOptionsParams) {
  const option = useMemo(() => {
    // Use centralized chart layout constants
    const { VITALS_TOP, VITALS_HEIGHT, SWIMLANE_START, GRID_LEFT, GRID_RIGHT } = CHART_LAYOUT;

    // Validate data range - use safe defaults if data is invalid
    // This prevents coordinateSystem errors when chart renders before data is loaded
    const safeStartTime = isFinite(data.startTime) && data.startTime > 0 ? data.startTime : Date.now() - 60 * 60 * 1000;
    const safeEndTime = isFinite(data.endTime) && data.endTime > safeStartTime ? data.endTime : safeStartTime + 60 * 60 * 1000;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || safeEndTime; // Use provided "now" or fall back to endTime

    // Initial view: 60-minute window (1 hour) from -30min to +30min around NOW
    const initialStartTime = currentTime - THIRTY_MINUTES;
    const initialEndTime = currentTime + THIRTY_MINUTES;

    // Calculate initial zoom percentages for dataZoom (same logic as Reset button)
    const fullRange = safeEndTime - safeStartTime;
    let initialZoomStart = 0;
    let initialZoomEnd = 100;
    if (fullRange > 0) {
      // Clamp to data bounds while preserving window size
      let viewStart = initialStartTime;
      let viewEnd = initialEndTime;
      const targetWindow = viewEnd - viewStart;

      if (viewStart < safeStartTime) {
        viewStart = safeStartTime;
        viewEnd = Math.min(safeEndTime, viewStart + targetWindow);
      }
      if (viewEnd > safeEndTime) {
        viewEnd = safeEndTime;
        viewStart = Math.max(safeStartTime, viewEnd - targetWindow);
      }

      initialZoomStart = Math.max(0, Math.min(100, ((viewStart - safeStartTime) / fullRange) * 100));
      initialZoomEnd = Math.max(0, Math.min(100, ((viewEnd - safeStartTime) / fullRange) * 100));
    }

    // Calculate swimlane positions dynamically with darker group headers
    let currentTop = SWIMLANE_START;
    const swimlaneGrids = activeSwimlanes.map((lane) => {
      // Use significantly darker background for medication group headers
      let backgroundColor: string;
      if (lane.hierarchyLevel === 'group') {
        // Much darker shade for group headers - more pronounced difference
        backgroundColor = isDark ? "hsl(150, 45%, 8%)" : "hsl(150, 50%, 75%)";
      } else {
        // Regular color for other lanes
        backgroundColor = isDark ? lane.colorDark : lane.colorLight;
      }

      const grid = {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: currentTop,
        height: lane.height,
        backgroundColor,
      };

      currentTop += lane.height;
      return grid;
    });

    // Combine all grids: vitals + swimlanes
    const grids = [
      // Grid 0: Vitals chart
      {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: VITALS_TOP,
        height: VITALS_HEIGHT,
        backgroundColor: "transparent"
      },
      ...swimlaneGrids,
    ];

    // Create x-axis for each grid with conditional grid line visibility
    const createXAxis = (gridIndex: number, lane?: SwimlaneConfig) => {
      // Determine if grid lines should be shown for this swimlane
      const hideGridLines = lane && (
        lane.id === "medikamente" ||    // Parent Medications swimlane
        lane.hierarchyLevel === 'group' // Medication group headers
      );

      return {
        type: "time" as const,
        gridIndex,
        min: safeStartTime,
        max: safeEndTime,
        boundaryGap: false,
        axisLabel: {
          show: false, // Hide labels - they're shown in the sticky header
          formatter: "{HH}:{mm}",
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: isDark ? "#ffffff" : "#000000",
          fontWeight: 500,
        },
        axisLine: {
          show: false, // Hide axis line
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
        },
        axisTick: {
          show: false, // Hide ticks
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" }
        },
        splitLine: {
          show: !hideGridLines, // Conditionally show vertical grid lines
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          },
        },
        minorTick: {
          show: !hideGridLines,
        },
        minorSplitLine: {
          show: !hideGridLines, // Conditionally show minor grid lines
          lineStyle: {
            color: isDark ? "#333333" : "#e5e7eb",
            width: 0.5,
            type: "dashed" as const,
          },
        },
        position: "top",
      };
    };

    const xAxes = grids.map((_, index) => {
      // Grid 0 is vitals, rest are swimlanes
      const lane = index === 0 ? undefined : activeSwimlanes[index - 1];
      return createXAxis(index, lane);
    });

    // Y-axes: vitals (dual) + swimlanes (categorical)
    const yAxes = [
      // Vitals Y-axes - generated by VitalsSwimlane utility function
      ...generateVitalsYAxes(isDark),
      // Swimlane y-axes
      ...activeSwimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
      })),
    ];

    // Series - generated by VitalsSwimlane utility function
    const series: any[] = [
      // Vitals series (HR, BP, SpO2)
      ...generateVitalsSeries(hrDataPoints, bpDataPoints, spo2DataPoints, isDark),
    ];

    // Add ventilation parameter text labels - generated by VentilationSwimlane utility function
    // CRITICAL: Filter out any series that reference grids that don't exist
    // This prevents "coordinateSystem" errors when chart renders before all data is loaded
    const maxGridIndex = grids.length - 1;
    const maxYAxisIndex = yAxes.length - 1;
    const ventilationParentIndex = activeSwimlanes.findIndex(lane => lane.id === 'ventilation');
    if (ventilationParentIndex !== -1 && !collapsedSwimlanes.has('ventilation')) {
      const ventSeries = generateVentilationSeries(ventilationData, ventilationParentIndex, isDark);
      // Only include series with valid grid indices
      const validVentSeries = ventSeries.filter((s: any) => {
        const xIdx = s.xAxisIndex ?? 0;
        const yIdx = s.yAxisIndex ?? 0;
        return xIdx <= maxGridIndex && yIdx <= maxYAxisIndex;
      });
      series.push(...validVentSeries);
    }

    // NOTE: Drag preview is now handled imperatively via updateDragPreviewImperatively()
    // to prevent duplicate icons during fast touch drags. The preview series is updated
    // directly via chartInstance.setOption() with requestAnimationFrame throttling.

    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;

    // Generate manual y-axis labels - generated by VitalsSwimlane utility function
    const yAxisLabels: any[] = generateVitalsYAxisLabels(VITALS_TOP, VITALS_HEIGHT, isDark);

    // ECharts automatically generates vertical grid lines via splitLine/minorSplitLine in x-axis config
    // No need for custom graphics anymore

    // Generate midnight timestamps for day separation
    const midnightTimestamps: number[] = [];
    const startDate = new Date(safeStartTime);
    startDate.setHours(0, 0, 0, 0);
    if (startDate.getTime() < safeStartTime) {
      startDate.setDate(startDate.getDate() + 1);
    }
    // Generate midnight markers for up to 365 days
    for (let d = startDate.getTime(); d <= safeEndTime && midnightTimestamps.length < 365; d += 24 * 60 * 60 * 1000) {
      midnightTimestamps.push(d);
    }

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      graphic: [
        // Y-axis labels
        ...yAxisLabels.map((label, i) => ({ ...label, id: `y-label-${i}` })),
      ],
      dataZoom: [{
        type: "inside",
        xAxisIndex: grids.map((_, i) => i),
        // Only include initial zoom percentages on first render
        // After initial zoom is applied, omit start/end to preserve user zoom state
        ...(initialZoomAppliedRef.current ? {} : { start: initialZoomStart, end: initialZoomEnd }),
        throttle: 50,
        zoomLock: true,
        orient: 'horizontal',
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
        disabled: true, // Disable all touch/mouse interactions - use external controls only
        filterMode: "none",
      }],
      tooltip: {
        trigger: "item", // Changed from "axis" to "item" to show on hover over data points
        textStyle: { fontFamily: "Poppins, sans-serif" },
        formatter: (params: any) => {
          if (Array.isArray(params)) params = params[0];
          if (!params || !params.data) return '';

          const [timestamp, value] = params.data;
          const time = formatTime(timestamp);

          let label = '';
          let unit = '';

          if (params.seriesName.includes('Heart Rate')) {
            label = 'HR';
            unit = ' bpm';
          } else if (params.seriesName.includes('Systolic')) {
            label = 'Systolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('Diastolic')) {
            label = 'Diastolic BP';
            unit = ' mmHg';
          } else if (params.seriesName.includes('SpO2')) {
            label = 'SpO\u2082';
            unit = '%';
          }

          return `<div style="padding: 4px 8px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${label}: ${value}${unit}</div>
            <div style="font-size: 11px; opacity: 0.8;">${time}</div>
          </div>`;
        },
      },
    } as echarts.EChartsOption;
  // NOTE: Initial zoom is set in dataZoom to start with ±30 min window; subsequent zoom is managed imperatively
  }, [data, isDark, activeSwimlanes, now, currentTime, hrDataPoints, bpDataPoints, spo2DataPoints, ventilationData, medicationDoseData, pendingSysValue, bpEntryMode, collapsedSwimlanes]);

  return option;
}
