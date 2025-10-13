import { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

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
  height = 750,
}: {
  data: UnifiedTimelineData;
  height?: number;
}) {
  const chartRef = useRef<any>(null);

  const option = useMemo(() => {
    // Grid layout configuration with background colors
    const grids = [
      // Grid 0: Vitals chart (tall)
      { left: 140, right: 60, top: 40, height: 280, backgroundColor: "transparent" },
      // Grid 1: Times (purple)
      { left: 140, right: 60, top: 340, height: 40, backgroundColor: "rgba(243, 232, 255, 0.5)" },
      // Grid 2: Events (blue)
      { left: 140, right: 60, top: 390, height: 40, backgroundColor: "rgba(219, 234, 254, 0.5)" },
      // Grid 3: Heart Rhythm (pink)
      { left: 140, right: 60, top: 440, height: 40, backgroundColor: "rgba(252, 231, 243, 0.5)" },
      // Grid 4: Medications (green, multiple rows)
      { left: 140, right: 60, top: 490, height: 90, backgroundColor: "rgba(220, 252, 231, 0.5)" },
      // Grid 5: Infusions/Perfusors (cyan)
      { left: 140, right: 60, top: 590, height: 40, backgroundColor: "rgba(207, 250, 254, 0.5)" },
      // Grid 6: Ventilation (amber)
      { left: 140, right: 60, top: 640, height: 40, backgroundColor: "rgba(254, 243, 199, 0.5)" },
      // Grid 7: Staff (slate)
      { left: 140, right: 60, top: 690, height: 40, backgroundColor: "rgba(241, 245, 249, 0.5)" },
    ];

    // Time x-axes (one per grid)
    const xAxes = grids.map((_, index) => ({
      type: "time" as const,
      gridIndex: index,
      min: data.startTime,
      max: data.endTime,
      axisLabel: {
        show: index === 0, // Only show labels on top grid
        formatter: "{HH}:{mm}",
        fontSize: 10,
        fontFamily: "Poppins, sans-serif",
      },
      axisLine: { show: true },
      axisTick: { show: true },
      splitLine: { 
        show: true,
        lineStyle: {
          color: "var(--border)",
          opacity: 0.3,
        }
      },
    }));

    // Y-axes
    const yAxes = [
      // Grid 0 - Left: BP/HR (0-200)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 0,
        max: 200,
        interval: 40,
        position: "left" as const,
        axisLabel: { 
          fontSize: 10,
          fontFamily: "Poppins, sans-serif",
        },
        splitLine: { 
          lineStyle: {
            color: "var(--border)",
            opacity: 0.3,
            type: "dashed" as const,
          }
        },
      },
      // Grid 0 - Right: SpO2 (85-100)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 85,
        max: 100,
        interval: 5,
        position: "right" as const,
        axisLabel: { 
          fontSize: 10,
          fontFamily: "Poppins, sans-serif",
          color: "#8b5cf6",
        },
        splitLine: { show: false },
      },
      // Swimlane y-axes (categorical or numeric for positioning)
      ...grids.slice(1).map((_, index) => {
        const gridIdx = index + 1;
        // Medikamente grid needs multiple rows
        if (gridIdx === 4) {
          return {
            type: "category" as const,
            gridIndex: gridIdx,
            data: ["Row 0", "Row 1", "Row 2"],
            show: false,
            axisLine: { show: false },
            axisTick: { show: false },
          };
        }
        // Other swimlanes have single row
        return {
          type: "category" as const,
          gridIndex: gridIdx,
          data: [""],
          show: false,
          axisLine: { show: false },
          axisTick: { show: false },
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
    const swimlaneMap: Record<string, number> = {
      zeiten: 1,
      ereignisse: 2,
      herzrhythmus: 3,
      medikamente: 4,
      infusionen: 5,
      perfusors: 5,
      ventilation: 6,
      staff: 7,
    };

    // Group events by swimlane
    const eventsBySwimlane = data.events.reduce((acc, event) => {
      const gridIndex = swimlaneMap[event.swimlane];
      if (!acc[gridIndex]) acc[gridIndex] = [];
      acc[gridIndex].push(event);
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
            // For medikamente grid, use row number; otherwise use empty string
            const yValue = idx === 4 && e.row !== undefined ? `Row ${e.row}` : "";
            return [e.time, yValue];
          }),
          symbol: "circle",
          symbolSize: 12,
          itemStyle: {
            color: (params: any) => pointEvents[params.dataIndex]?.color || "#3b82f6",
            borderColor: (params: any) => {
              // Use theme-aware border color
              return "var(--background)";
            },
            borderWidth: 2,
          },
          label: {
            show: true,
            position: "top",
            formatter: (params: any) => {
              const event = pointEvents[params.dataIndex];
              return `${event?.icon || "●"} ${event?.label || ""}`;
            },
            fontSize: 11,
            fontFamily: "Poppins, sans-serif",
            color: "var(--foreground)",
          },
        });
      }

      // Range events (with duration) - render as bars
      const rangeEvents = events.filter(e => e.duration);
      if (rangeEvents.length > 0) {
        rangeEvents.forEach((event) => {
          // For medikamente grid, use row number; otherwise use empty string
          const yValue = idx === 4 && event.row !== undefined ? `Row ${event.row}` : "";
          
          series.push({
            type: "custom",
            xAxisIndex: idx,
            yAxisIndex: idx + 1,
            renderItem: (params: any, api: any) => {
              const start = api.coord([event.time, yValue]);
              const end = api.coord([event.time + (event.duration || 0), yValue]);
              const height = api.size([0, 1])[1] * 0.5;
              const y = start[1] - height / 2;
              
              return {
                type: "group",
                children: [
                  {
                    type: "rect",
                    shape: {
                      x: start[0],
                      y,
                      width: Math.max(end[0] - start[0], 2),
                      height,
                    },
                    style: {
                      fill: event.color || "#10b981",
                      opacity: 0.8,
                      stroke: "transparent",
                      lineWidth: 0,
                    },
                  },
                  {
                    type: "text",
                    style: {
                      text: `${event.icon || ""} ${event.label}`,
                      x: start[0] + 4,
                      y: y + height / 2,
                      fontSize: 11,
                      fontFamily: "Poppins, sans-serif",
                      fill: "#ffffff",
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
          type: "slider",
          xAxisIndex: grids.map((_, i) => i),
          bottom: 10,
          height: 20,
          handleSize: "80%",
          textStyle: {
            fontFamily: "Poppins, sans-serif",
          },
        },
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        textStyle: {
          fontFamily: "Poppins, sans-serif",
        },
      },
      legend: {
        data: ["Systolic BP", "Diastolic BP", "HR", "SpO2"],
        top: 10,
        left: 140,
        textStyle: {
          fontFamily: "Poppins, sans-serif",
          fontSize: 11,
        },
      },
    } as echarts.EChartsOption;
  }, [data]);

  return (
    <div className="w-full h-full relative" style={{ height }}>
      {/* Left sidebar with swimlane labels */}
      <div className="absolute left-0 top-0 w-[140px] h-full border-r border-border z-10 bg-background">
        {/* Vitals label */}
        <div className="h-[280px] flex items-center justify-center px-3 border-b border-border" style={{ marginTop: "40px" }}>
          <span className="text-base font-semibold">Vitals</span>
        </div>
        
        {/* Times */}
        <div className="h-[40px] flex items-center px-3 border-b border-border bg-purple-100 dark:bg-purple-900/30" style={{ marginTop: "20px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Times</span>
        </div>
        
        {/* Events */}
        <div className="h-[40px] flex items-center px-3 border-b border-border bg-blue-100 dark:bg-blue-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Events</span>
        </div>
        
        {/* Heart Rhythm */}
        <div className="h-[40px] flex items-center px-3 border-b border-border bg-pink-100 dark:bg-pink-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Heart Rhythm</span>
        </div>
        
        {/* Medications */}
        <div className="h-[90px] flex items-center px-3 border-b border-border bg-green-100 dark:bg-green-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Medications</span>
        </div>
        
        {/* Infusions/Perfusors */}
        <div className="h-[40px] flex items-center px-3 border-b border-border bg-cyan-100 dark:bg-cyan-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Infusions</span>
        </div>
        
        {/* Ventilation */}
        <div className="h-[40px] flex items-center px-3 border-b border-border bg-amber-100 dark:bg-amber-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Ventilation</span>
        </div>
        
        {/* Staff */}
        <div className="h-[40px] flex items-center px-3 bg-slate-100 dark:bg-slate-900/30" style={{ marginTop: "10px" }}>
          <span className="text-sm font-semibold text-black dark:text-white">Staff</span>
        </div>
      </div>

      {/* ECharts timeline */}
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
