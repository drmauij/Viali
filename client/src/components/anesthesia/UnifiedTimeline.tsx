import { useMemo, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Activity, Heart, Wind, Combine } from "lucide-react";

/**
 * UnifiedTimeline
 * 
 * A professional anesthesia timeline with:
 * - Top grid: Vitals chart with dual y-axes (BP/HR left, SpO2 right)
 * - Multiple swimlanes: Zeiten, Ereignisse, Herzrhythmus, Medikamente, Infusionen, Perfusors, Ventilation, Staff
 * - Unified zoom/pan controls
 * - Dark/light theme support
 */

export type VitalPoint = [number, number]; // [timestamp(ms), value]

export type TimelineVitals = {
  hr?: VitalPoint[];
  sysBP?: VitalPoint[];
  diaBP?: VitalPoint[];
  spo2?: VitalPoint[];
};

export type TimelineEvent = {
  time: number; // ms
  swimlane: "zeiten" | "ereignisse" | "herzrhythmus" | "medikamente" | "infusionen" | "perfusors" | "ventilation" | "staff";
  label: string;
  icon?: string;
  color?: string;
  duration?: number; // ms - for range items like infusions
  row?: number; // for multiple medication rows
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
};

export function UnifiedTimeline({
  data,
  height,
}: {
  data: UnifiedTimelineData;
  height?: number;
}) {
  // Calculate dynamic height based on medication count
  const medicationEvents = data.events.filter(e => e.swimlane === "medikamente");
  const uniqueRows = new Set(medicationEvents.map(e => e.row ?? 0));
  const numMedicationRows = Math.max(uniqueRows.size, 1);
  const defaultHeight = 510 + 30 + (numMedicationRows * 30) + 120; // base + medications header + medications + other swimlanes
  const componentHeight = height ?? defaultHeight;
  const chartRef = useRef<any>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const option = useMemo(() => {
    // Grid layout configuration - continuous rows with no gaps
    // Left margin: 150px for both scales side by side + header labels
    // Right margin: 10px for minimal padding
    // All grids MUST have identical left/right positioning for perfect alignment

    // Dynamically determine medication drugs from events
    const medicationEvents = data.events.filter(e => e.swimlane === "medikamente");
    const uniqueRows = new Set(medicationEvents.map(e => e.row ?? 0));
    const numMedicationRows = Math.max(uniqueRows.size, 1);
    const medicationRowHeight = 30;
    const medicationColor = isDark ? "hsl(150, 45%, 18%)" : "rgba(220, 252, 231, 0.8)";

    // Calculate dynamic positions
    const medicationStart = 510;
    const medicationHeaderHeight = 30;
    const medicationEnd = medicationStart + medicationHeaderHeight + (numMedicationRows * medicationRowHeight);

    // CRITICAL: All grids must have IDENTICAL left/right values for perfect alignment
    const gridLeft = 150;
    const gridRight = 10;

    const grids = [
      // Grid 0: Vitals chart (taller for better visibility)
      { left: gridLeft, right: gridRight, top: 40, height: 340, backgroundColor: "transparent" },
      // Grid 1: Times (purple background) - taller to avoid text overlap
      { left: gridLeft, right: gridRight, top: 380, height: 50, backgroundColor: isDark ? "hsl(270, 55%, 20%)" : "rgba(243, 232, 255, 0.8)" },
      // Grid 2: Events (blue background)
      { left: gridLeft, right: gridRight, top: 430, height: 40, backgroundColor: isDark ? "hsl(210, 60%, 18%)" : "rgba(219, 234, 254, 0.8)" },
      // Grid 3: Heart Rhythm (pink background)
      { left: gridLeft, right: gridRight, top: 470, height: 40, backgroundColor: isDark ? "hsl(330, 50%, 20%)" : "rgba(252, 231, 243, 0.8)" },
      // Grid 4: Medications Header (green background)
      { left: gridLeft, right: gridRight, top: medicationStart, height: medicationHeaderHeight, backgroundColor: medicationColor },
      // Grid 5+: Individual medication drugs (green background) - dynamic count
      ...Array.from({ length: numMedicationRows }, (_, i) => ({
        left: gridLeft,
        right: gridRight,
        top: medicationStart + medicationHeaderHeight + (i * medicationRowHeight),
        height: medicationRowHeight,
        backgroundColor: medicationColor,
      })),
      // Infusions/Perfusors (cyan background)
      { left: gridLeft, right: gridRight, top: medicationEnd, height: 40, backgroundColor: isDark ? "hsl(190, 60%, 18%)" : "rgba(207, 250, 254, 0.8)" },
      // Ventilation (amber background)
      { left: gridLeft, right: gridRight, top: medicationEnd + 40, height: 40, backgroundColor: isDark ? "hsl(35, 70%, 22%)" : "rgba(254, 243, 199, 0.8)" },
      // Staff (slate background)
      { left: gridLeft, right: gridRight, top: medicationEnd + 80, height: 40, backgroundColor: isDark ? "hsl(220, 25%, 25%)" : "rgba(241, 245, 249, 0.8)" },
    ];

    // Calculate current time and center the view around it
    const now = Date.now();
    const defaultStart = now - (5 * 60 * 1000); // 5 minutes before now
    const defaultEnd = now + (5 * 60 * 1000);   // 5 minutes after now

    // Time x-axes (one per grid) - IDENTICAL configuration for perfect synchronization
    // Create x-axis for each grid (including dynamically added medication grids)
    const xAxes = grids.map((_, index) => ({
      type: "time" as const,
      gridIndex: index,
      // CRITICAL: All x-axes must have IDENTICAL time ranges and intervals
      min: data.startTime,
      max: data.endTime,
      axisLabel: {
        show: index === 0, // Only show labels on top grid
        formatter: "{HH}:{mm}",
        fontSize: 10,
        fontFamily: "Poppins, sans-serif",
        interval: 0, // Show all labels
      },
      axisLine: { 
        show: index === 0, // Only show line on top grid
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
        }
      },
      axisTick: { 
        show: index === 0, // Only show ticks on top grid
        interval: 0, // Show all ticks
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
        }
      },
      splitLine: { 
        show: true, // Show grid lines on all swimlanes for alignment
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        }
      },
      minorTick: {
        show: index === 0, // Only show minor ticks on top grid
        splitNumber: 4, // 15-minute intervals (4 splits per hour)
      },
      minorSplitLine: {
        show: true, // Show minor grid lines on all swimlanes
        lineStyle: {
          color: isDark ? "#333333" : "#e5e7eb",
          width: 0.5,
          type: "dashed" as const,
        }
      },
      // CRITICAL: Ensure all axes use the same scale and positioning
      position: "top",
      inverse: false,
    }));

    // Y-axes
    const yAxes = [
      // Grid 0 - Left side 1: BP/HR (0-240) - first scale on left
      {
        type: "value" as const,
        gridIndex: 0,
        min: 0,
        max: 240,
        interval: 40,
        position: "left" as const,
        offset: 30, // Offset to make room for second scale
        axisLabel: { 
          show: true,
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: isDark ? "#ffffff" : "#000000",
        },
        axisLine: { 
          show: true,
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
          }
        },
        axisTick: { show: true },
        splitLine: { 
          show: true,
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          }
        },
      },
      // Grid 0 - Left side 2: SpO2 (50-100) - second scale on left, side by side
      {
        type: "value" as const,
        gridIndex: 0,
        min: 50,
        max: 100,
        interval: 10,
        position: "left" as const,
        offset: 0, // No offset for innermost scale
        axisLabel: { 
          show: true,
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: "#8b5cf6",
        },
        axisLine: { 
          show: true,
          lineStyle: {
            color: "#8b5cf6",
          }
        },
        axisTick: { show: true },
        splitLine: { show: false },
      },
      // Swimlane y-axes (categorical or numeric for positioning)
      ...grids.slice(1).map((_, index) => {
        const gridIdx = index + 1;
        // All swimlanes now have single row (medications split into individual grids)
        return {
          type: "category" as const,
          gridIndex: gridIdx,
          data: [""], // Single category for each swimlane
          show: false,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        };
      }),
    ];

    // Series
    const series: any[] = [];

    // Vitals - Systolic BP (red line with circles)
    if (data.vitals.sysBP) {
      series.push({
        name: "Systolic BP",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data.vitals.sysBP,
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#ef4444" },
        lineStyle: { color: "#ef4444", width: 2 },
      });
    }

    // Vitals - Diastolic BP (red line with triangles, connected to systolic with area)
    if (data.vitals.diaBP) {
      series.push({
        name: "Diastolic BP",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data.vitals.diaBP,
        smooth: true,
        showSymbol: true,
        symbol: "triangle",
        symbolSize: 8,
        itemStyle: { color: "#ef4444" },
        lineStyle: { color: "#ef4444", width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(239, 68, 68, 0.2)" },
            { offset: 1, color: "rgba(239, 68, 68, 0.05)" },
          ]),
        },
      });
    }

    // Vitals - Heart Rate (blue line with heart symbols)
    if (data.vitals.hr) {
      series.push({
        name: "HR",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data.vitals.hr,
        smooth: true,
        showSymbol: true,
        symbol: "path://M512 938L93 519a256 256 0 11362-362l57 57 57-57a256 256 0 01362 362L512 938z",
        symbolSize: 10,
        itemStyle: { color: "#3b82f6" },
        lineStyle: { color: "#3b82f6", width: 2 },
      });
    }

    // Vitals - SpO2 (purple line with circles on right axis)
    if (data.vitals.spo2) {
      series.push({
        name: "SpO2",
        type: "line",
        xAxisIndex: 0,
        yAxisIndex: 1,
        data: data.vitals.spo2,
        smooth: true,
        showSymbol: true,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#8b5cf6" },
        lineStyle: { color: "#8b5cf6", width: 2 },
      });
    }

    // Swimlane events - render as scatter or custom elements
    // Dynamic swimlane mapping based on number of medication rows
    // Grid 4 is Medications header, Grids 5 to (5+numMedicationRows-1) are drug rows
    const infusionenGridIndex = 5 + numMedicationRows;
    const ventilationGridIndex = infusionenGridIndex + 1;
    const staffGridIndex = ventilationGridIndex + 1;

    const swimlaneMap: Record<string, number> = {
      zeiten: 1,
      ereignisse: 2,
      herzrhythmus: 3,
      medikamente: 4, // Will use grids 4 to 4+numRows based on row
      infusionen: infusionenGridIndex,
      perfusors: infusionenGridIndex,
      ventilation: ventilationGridIndex,
      staff: staffGridIndex,
    };

    // Group events by swimlane - ensure each medication drug gets its own swimlane
    const eventsBySwimlane = data.events.reduce((acc, event) => {
      // Skip medication events that don't have a row (they shouldn't appear anywhere)
      if (event.swimlane === "medikamente" && event.row === undefined) {
        return acc;
      }

      let gridIndex = swimlaneMap[event.swimlane];

      // For medications, map to specific drug grid based on row
      if (event.swimlane === "medikamente" && event.row !== undefined) {
        gridIndex = 5 + event.row; // Grid 4 is header, row 0->grid 5, row 1->grid 6, etc.
      }

      // Ensure we have a valid grid index
      if (gridIndex !== undefined) {
        if (!acc[gridIndex]) acc[gridIndex] = [];
        acc[gridIndex].push(event);
      }

      return acc;
    }, {} as Record<number, TimelineEvent[]>);

    // Create scatter series for each swimlane
    Object.entries(eventsBySwimlane).forEach(([gridIndex, events]) => {
      const idx = parseInt(gridIndex);

      // Point events (no duration)
      const pointEvents = events.filter(e => !e.duration);
      if (pointEvents.length > 0) {
        series.push({
          type: "scatter",
          xAxisIndex: idx,
          yAxisIndex: idx + 1,
          data: pointEvents.map(e => {
            // All swimlanes use single category positioned at center
            return [e.time, 0]; // Use numeric 0 instead of empty string for better positioning
          }),
          symbol: "circle",
          symbolSize: 6, // Make symbol slightly visible for better alignment
          itemStyle: {
            color: event => {
              // For medication events, use a subtle color per drug type
              const evt = pointEvents[event.dataIndex];
              if (evt && events.length > 0 && events[0].swimlane === "medikamente") {
                const drugColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"];
                return drugColors[(evt.row || 0) % drugColors.length];
              }
              return isDark ? "#ffffff" : "#333333";
            },
            borderWidth: 1,
            borderColor: isDark ? "#666666" : "#cccccc",
          },
          label: {
            show: true,
            position: "right",
            formatter: (params: any) => {
              const event = pointEvents[params.dataIndex];
              // Just show the label text without icons
              return event?.label || "";
            },
            fontSize: 11,
            fontFamily: "Poppins, sans-serif",
            color: isDark ? "#ffffff" : "#000000",
            fontWeight: "500",
            offset: [8, 0], // Add horizontal offset for better readability
          },
        });
      }

      // Range events (with duration) - render as bars
      const rangeEvents = events.filter(e => e.duration);
      if (rangeEvents.length > 0) {
        rangeEvents.forEach((event) => {
          // Use numeric positioning for better control
          const yValue = 0;

          series.push({
            type: "custom",
            xAxisIndex: idx,
            yAxisIndex: idx + 1,
            renderItem: (params: any, api: any) => {
              const start = api.coord([event.time, yValue]);
              const end = api.coord([event.time + (event.duration || 0), yValue]);
              const gridHeight = api.size([0, 1])[1];
              const barHeight = gridHeight * 0.6; // 60% of grid height for better visibility
              const y = start[1] - barHeight / 2;

              return {
                type: "group",
                children: [
                  {
                    type: "rect",
                    shape: {
                      x: start[0],
                      y,
                      width: Math.max(end[0] - start[0], 3), // Minimum 3px width
                      height: barHeight,
                    },
                    style: {
                      fill: event.color || "#10b981",
                      opacity: 0.8,
                      stroke: isDark ? "#333333" : "#ffffff",
                      lineWidth: 1,
                    },
                  },
                  {
                    type: "text",
                    style: {
                      text: event.label,
                      x: start[0] + 6,
                      y: y + barHeight / 2,
                      fontSize: 10,
                      fontFamily: "Poppins, sans-serif",
                      fill: isDark ? "#ffffff" : "#000000",
                      fontWeight: "600",
                      textVerticalAlign: "middle",
                    },
                  },
                ],
              };
            },
            data: [[event.time, yValue]],
            z: 2,
          });
        });
      }
    });

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: Array.from({ length: grids.length }, (_, i) => i), // Explicitly list all x-axis indices
          startValue: data.startTime, // Use provided start time
          endValue: data.endTime, // Use provided end time
          minValueSpan: 5 * 60 * 1000, // Minimum 5 minutes visible (set by user)
          maxValueSpan: 6 * 60 * 60 * 1000, // Maximum 6 hours visible (set by user)
          throttle: 50,
          // CRITICAL: Ensure synchronization across all axes
          filterMode: "none", // Don't filter data, just zoom
        },
        {
          type: "slider",
          xAxisIndex: Array.from({ length: grids.length }, (_, i) => i), // Apply slider to all x-axes for synchronization
          height: 20,
          bottom: 10,
          startValue: data.startTime, // Use provided start time
          endValue: data.endTime, // Use provided end time
          minValueSpan: 5 * 60 * 1000, // Minimum 5 minutes
          maxValueSpan: 6 * 60 * 60 * 1000, // Maximum 6 hours
          handleIcon: "path://M10.7,11.9v-1.3H9.3v13c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z",
          // CRITICAL: Ensure synchronization across all axes
          filterMode: "none", // Don't filter data, just zoom
        }
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        textStyle: {
          fontFamily: "Poppins, sans-serif",
        },
      },
    } as echarts.EChartsOption;
  }, [data, isDark]);

  // Extract medication drug names dynamically for sidebar
  const medicationDrugs = useMemo(() => {
    const medicationEvents = data.events.filter(e => e.swimlane === "medikamente" && e.row !== undefined);
    const drugsByRow = new Map<number, string>();

    medicationEvents.forEach(e => {
      const row = e.row!; // We know row is defined due to filter above
      if (!drugsByRow.has(row)) {
        // Extract drug name from label (e.g., "Propofol 200mg" -> "Propofol")
        const drugName = e.label.split(/\s+|\d/)[0].trim();
        drugsByRow.set(row, drugName);
      }
    });

    // Sort by row number and return drug names
    return Array.from(drugsByRow.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, name]) => name);
  }, [data.events]);

  // Calculate dynamic positions for sidebar (reuse numMedicationRows from top)
  const medicationStart = 510;
  const medicationHeaderHeight = 30;
  const medicationRowHeight = 30;
  const medicationEnd = medicationStart + medicationHeaderHeight + (numMedicationRows * medicationRowHeight);
  const medicationColor = isDark ? "hsl(150, 45%, 18%)" : "rgba(220, 252, 231, 0.8)";

  // Zoom and pan controls with 5-minute minimum intervals
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const currentMin = dataZoom.startValue;
        const currentMax = dataZoom.endValue;
        const currentSpan = currentMax - currentMin;
        const newSpan = Math.max(currentSpan * 0.5, 5 * 60 * 1000); // Min 5 minutes
        const center = (currentMin + currentMax) / 2;

        chart.dispatchAction({
          type: 'dataZoom',
          startValue: center - newSpan / 2,
          endValue: center + newSpan / 2,
        });
      }
    }
  };

  const handleZoomOut = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const currentMin = dataZoom.startValue;
        const currentMax = dataZoom.endValue;
        const currentSpan = currentMax - currentMin;
        const newSpan = Math.min(currentSpan * 2, 6 * 60 * 60 * 1000); // Max 6 hours
        const center = (currentMin + currentMax) / 2;

        chart.dispatchAction({
          type: 'dataZoom',
          startValue: center - newSpan / 2,
          endValue: center + newSpan / 2,
        });
      }
    }
  };

  const handlePanLeft = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const currentMin = dataZoom.startValue;
        const currentMax = dataZoom.endValue;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000); // Pan by 10% or 5 min minimum

        chart.dispatchAction({
          type: 'dataZoom',
          startValue: currentMin - panStep,
          endValue: currentMax - panStep,
        });
      }
    }
  };

  const handlePanRight = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const currentMin = dataZoom.startValue;
        const currentMax = dataZoom.endValue;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000); // Pan by 10% or 5 min minimum

        chart.dispatchAction({
          type: 'dataZoom',
          startValue: currentMin + panStep,
          endValue: currentMax + panStep,
        });
      }
    }
  };

  return (
    <div className="w-full relative" style={{ height: componentHeight }}>
      {/* Zoom and Pan Controls - Centered */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-30 flex gap-2">
        <button
          onClick={handlePanLeft}
          className="p-2 rounded bg-background border border-border hover:bg-accent transition-colors"
          data-testid="button-pan-left"
          title="Pan Left"
        >
          ◀
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 rounded bg-background border border-border hover:bg-accent transition-colors"
          data-testid="button-zoom-out"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 rounded bg-background border border-border hover:bg-accent transition-colors"
          data-testid="button-zoom-in"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={handlePanRight}
          className="p-2 rounded bg-background border border-border hover:bg-accent transition-colors"
          data-testid="button-pan-right"
          title="Pan Right"
        >
          ▶
        </button>
      </div>

      {/* Swimlane background colors - extend full width behind everything */}
      <div className="absolute left-0 top-0 right-0 h-full pointer-events-none z-0">
        {/* Times background */}
        <div className="absolute top-[380px] h-[50px] w-full" style={{ backgroundColor: isDark ? "hsl(270, 55%, 20%)" : "rgba(243, 232, 255, 0.8)" }} />
        {/* Events background */}
        <div className="absolute top-[430px] h-[40px] w-full" style={{ backgroundColor: isDark ? "hsl(210, 60%, 18%)" : "rgba(219, 234, 254, 0.8)" }} />
        {/* Heart Rhythm background */}
        <div className="absolute top-[470px] h-[40px] w-full" style={{ backgroundColor: isDark ? "hsl(330, 50%, 20%)" : "rgba(252, 231, 243, 0.8)" }} />
        {/* Medications Header background */}
        <div className="absolute h-[30px] w-full" style={{ top: `${medicationStart}px`, backgroundColor: medicationColor }} />
        {/* Individual medication drug backgrounds - each gets its own row with separator */}
        {Array.from({ length: numMedicationRows }, (_, i) => (
          <div 
            key={i}
            className="absolute w-full border-b" 
            style={{ 
              top: `${medicationStart + 30 + (i * medicationRowHeight)}px`, 
              height: `${medicationRowHeight}px`,
              backgroundColor: medicationColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }} 
          />
        ))}
        {/* Infusions background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full" 
          style={{ 
            top: `${medicationEnd}px`,
            backgroundColor: isDark ? "hsl(190, 60%, 18%)" : "rgba(207, 250, 254, 0.8)"
          }} 
        />
        {/* Ventilation background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full" 
          style={{ 
            top: `${medicationEnd + 40}px`,
            backgroundColor: isDark ? "hsl(35, 70%, 22%)" : "rgba(254, 243, 199, 0.8)"
          }} 
        />
        {/* Staff background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full" 
          style={{ 
            top: `${medicationEnd + 80}px`,
            backgroundColor: isDark ? "hsl(220, 25%, 25%)" : "rgba(241, 245, 249, 0.8)"
          }} 
        />
      </div>

      {/* Left sidebar with swimlane labels - extends to chart start */}
      <div className="absolute left-0 top-0 w-[150px] h-full border-r border-border z-10 bg-background">
        {/* Vitals icon buttons - matches grid 0: top 40, height 340 */}
        <div className="absolute top-[40px] h-[340px] w-full flex flex-col items-start justify-center gap-2 pl-4">
          <button
            className="p-2 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors flex items-center justify-center shadow-sm"
            data-testid="button-vitals-bp"
            title="Blood Pressure"
          >
            <Activity className="w-5 h-5" />
          </button>
          <button
            className="p-2 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors flex items-center justify-center shadow-sm"
            data-testid="button-vitals-heart"
            title="Heart Rate"
          >
            <Heart className="w-5 h-5" />
          </button>
          <button
            className="p-2 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors flex items-center justify-center shadow-sm"
            data-testid="button-vitals-oxygen"
            title="Oxygenation"
          >
            <Wind className="w-5 h-5" />
          </button>
          <button
            className="p-2 rounded-md border border-border bg-background hover:bg-accent/50 transition-colors flex items-center justify-center shadow-sm"
            data-testid="button-vitals-combo"
            title="Combined View"
          >
            <Combine className="w-5 h-5" />
          </button>
        </div>

        {/* Times - matches grid 1: top 380, height 50 */}
        <div className="absolute top-[380px] h-[50px] w-full flex items-center px-2 border-b" style={{ backgroundColor: isDark ? "hsl(270, 55%, 20%)" : "rgba(243, 232, 255, 0.8)", borderColor: isDark ? "#444444" : "#d1d5db" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Times</span>
        </div>

        {/* Events - matches grid 2: top 430, height 40 */}
        <div className="absolute top-[430px] h-[40px] w-full flex items-center px-2 border-b" style={{ backgroundColor: isDark ? "hsl(210, 60%, 18%)" : "rgba(219, 234, 254, 0.8)", borderColor: isDark ? "#444444" : "#d1d5db" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Events</span>
        </div>

        {/* Heart Rhythm - matches grid 3: top 470, height 40 */}
        <div className="absolute top-[470px] h-[40px] w-full flex items-center px-2 border-b" style={{ backgroundColor: isDark ? "hsl(330, 50%, 20%)" : "rgba(252, 231, 243, 0.8)", borderColor: isDark ? "#444444" : "#d1d5db" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Heart Rhythm</span>
        </div>

        {/* Medications Header */}
        <div 
          className="absolute h-[30px] w-full flex items-center px-2 border-b-2" 
          style={{ 
            top: `${medicationStart}px`,
            backgroundColor: medicationColor,
            borderColor: isDark ? "#666666" : "#999999"
          }}
        >
          <span className="text-sm font-semibold text-black dark:text-white">Medications</span>
        </div>

        {/* Medications Container - dynamic height based on drug count */}
        <div 
          className="absolute w-full" 
          style={{ 
            top: `${medicationStart + 30}px`, 
            height: `${numMedicationRows * medicationRowHeight}px`,
            backgroundColor: medicationColor 
          }}
        >
          {/* Individual drug swimlanes - dynamically generated */}
          <div className="relative">
            {medicationDrugs.map((drugName, index) => (
              <div 
                key={index}
                className="flex items-center px-2 pl-4 border-b"
                style={{ 
                  height: `${medicationRowHeight}px`,
                  borderColor: isDark ? "#444444" : "#d1d5db"
                }}
              >
                <span className="text-xs text-black dark:text-white">{drugName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Infusions - dynamic position */}
        <div 
          className="absolute h-[40px] w-full flex items-center px-2 border-b" 
          style={{ 
            top: `${medicationEnd}px`,
            backgroundColor: isDark ? "hsl(190, 60%, 18%)" : "rgba(207, 250, 254, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }}
        >
          <span className="text-sm font-semibold text-black dark:text-white">Infusions</span>
        </div>

        {/* Ventilation - dynamic position */}
        <div 
          className="absolute h-[40px] w-full flex items-center px-2 border-b" 
          style={{ 
            top: `${medicationEnd + 40}px`,
            backgroundColor: isDark ? "hsl(35, 70%, 22%)" : "rgba(254, 243, 199, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }}
        >
          <span className="text-sm font-semibold text-black dark:text-white">Ventilation</span>
        </div>

        {/* Staff - dynamic position */}
        <div 
          className="absolute h-[40px] w-full flex items-center px-2 border-b" 
          style={{ 
            top: `${medicationEnd + 80}px`,
            backgroundColor: isDark ? "hsl(220, 25%, 25%)" : "rgba(241, 245, 249, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }}
        >
          <span className="text-sm font-semibold text-black dark:text-white">Staff</span>
        </div>
      </div>

      {/* ECharts timeline - high z-index to stay on top */}
      <div className="absolute inset-0 z-20">
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
          onEvents={{
            dataZoom: (params: any) => {
              const chart = chartRef.current?.getEchartsInstance();
              if (!chart) return;

              // Get current zoom state
              const option = chart.getOption() as any;
              const dataZoom = option.dataZoom?.[0];
              if (!dataZoom) return;

              const currentSpan = dataZoom.endValue - dataZoom.startValue;
              const minSpan = 5 * 60 * 1000; // 5 minutes in milliseconds
              const maxSpan = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

              // If zoom is too granular, reset to minimum
              if (currentSpan < minSpan) {
                const center = (dataZoom.startValue + dataZoom.endValue) / 2;
                chart.dispatchAction({
                  type: 'dataZoom',
                  startValue: center - minSpan / 2,
                  endValue: center + minSpan / 2,
                });
              }
              // If zoom is too wide, reset to maximum
              else if (currentSpan > maxSpan) {
                const center = (dataZoom.startValue + dataZoom.endValue) / 2;
                chart.dispatchAction({
                  type: 'dataZoom',
                  startValue: center - maxSpan / 2,
                  endValue: center + maxSpan / 2,
                });
              }
            }
          }}
        />
      </div>
    </div>
  );
}