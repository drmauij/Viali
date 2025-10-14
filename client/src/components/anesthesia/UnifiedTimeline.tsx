import { useMemo, useRef, useState, useEffect } from "react";
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
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  // Listen for theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const option = useMemo(() => {
    // Grid layout configuration - continuous rows with no gaps
    // Left margin: 120px for scales + 40px for header labels = 160px total
    const grids = [
      // Grid 0: Vitals chart (taller for better visibility)
      { left: 160, right: 100, top: 40, height: 340, backgroundColor: "transparent" },
      // Grid 1: Times (purple background) - continuous from 380 to 420
      { left: 160, right: 100, top: 380, height: 40, backgroundColor: isDark ? "rgba(216, 180, 254, 0.15)" : "rgba(243, 232, 255, 0.8)" },
      // Grid 2: Events (blue background) - continuous from 420 to 460
      { left: 160, right: 100, top: 420, height: 40, backgroundColor: isDark ? "rgba(147, 197, 253, 0.15)" : "rgba(219, 234, 254, 0.8)" },
      // Grid 3: Heart Rhythm (pink background) - continuous from 460 to 500
      { left: 160, right: 100, top: 460, height: 40, backgroundColor: isDark ? "rgba(244, 114, 182, 0.15)" : "rgba(252, 231, 243, 0.8)" },
      // Grid 4: Medications (green background) - continuous from 500 to 590
      { left: 160, right: 100, top: 500, height: 90, backgroundColor: isDark ? "rgba(134, 239, 172, 0.15)" : "rgba(220, 252, 231, 0.8)" },
      // Grid 5: Infusions/Perfusors (cyan background) - continuous from 590 to 630
      { left: 160, right: 100, top: 590, height: 40, backgroundColor: isDark ? "rgba(103, 232, 249, 0.15)" : "rgba(207, 250, 254, 0.8)" },
      // Grid 6: Ventilation (amber background) - continuous from 630 to 670
      { left: 160, right: 100, top: 630, height: 40, backgroundColor: isDark ? "rgba(251, 191, 36, 0.15)" : "rgba(254, 243, 199, 0.8)" },
      // Grid 7: Staff (slate background) - continuous from 670 to 710
      { left: 160, right: 100, top: 670, height: 40, backgroundColor: isDark ? "rgba(203, 213, 225, 0.15)" : "rgba(241, 245, 249, 0.8)" },
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
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        }
      },
    }));

    // Y-axes
    const yAxes = [
      // Grid 0 - Left: BP/HR (0-240) - visible scale outside graphic
      {
        type: "value" as const,
        gridIndex: 0,
        min: 0,
        max: 240,
        interval: 40,
        position: "left" as const,
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
      // Grid 0 - Right: SpO2 (50-100) - visible scale outside graphic
      {
        type: "value" as const,
        gridIndex: 0,
        min: 50,
        max: 100,
        interval: 10,
        position: "right" as const,
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
            color: isDark ? "#ffffff" : "#000000",
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
  }, [data, isDark]);

  // Zoom and pan controls
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      chart.dispatchAction({
        type: 'dataZoom',
        startValue: data.startTime,
        endValue: data.startTime + (data.endTime - data.startTime) * 0.7,
      });
    }
  };

  const handleZoomOut = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      chart.dispatchAction({
        type: 'dataZoom',
        startValue: data.startTime,
        endValue: data.endTime,
      });
    }
  };

  const handlePanLeft = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const start = Math.max(0, (dataZoom.start || 0) - 10);
        const end = Math.max(10, (dataZoom.end || 100) - 10);
        chart.dispatchAction({
          type: 'dataZoom',
          start,
          end,
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
        const start = Math.min(90, (dataZoom.start || 0) + 10);
        const end = Math.min(100, (dataZoom.end || 100) + 10);
        chart.dispatchAction({
          type: 'dataZoom',
          start,
          end,
        });
      }
    }
  };

  return (
    <div className="w-full h-full relative" style={{ height }}>
      {/* Zoom and Pan Controls */}
      <div className="absolute top-2 right-4 z-30 flex gap-2">
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
        <div className="absolute top-[380px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(216, 180, 254, 0.15)" : "rgba(243, 232, 255, 0.8)" }} />
        {/* Events background */}
        <div className="absolute top-[420px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(147, 197, 253, 0.15)" : "rgba(219, 234, 254, 0.8)" }} />
        {/* Heart Rhythm background */}
        <div className="absolute top-[460px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(244, 114, 182, 0.15)" : "rgba(252, 231, 243, 0.8)" }} />
        {/* Medications background */}
        <div className="absolute top-[500px] h-[90px] w-full" style={{ backgroundColor: isDark ? "rgba(134, 239, 172, 0.15)" : "rgba(220, 252, 231, 0.8)" }} />
        {/* Infusions background */}
        <div className="absolute top-[590px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(103, 232, 249, 0.15)" : "rgba(207, 250, 254, 0.8)" }} />
        {/* Ventilation background */}
        <div className="absolute top-[630px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(251, 191, 36, 0.15)" : "rgba(254, 243, 199, 0.8)" }} />
        {/* Staff background */}
        <div className="absolute top-[670px] h-[40px] w-full" style={{ backgroundColor: isDark ? "rgba(203, 213, 225, 0.15)" : "rgba(241, 245, 249, 0.8)" }} />
      </div>

      {/* Left sidebar with swimlane labels */}
      <div className="absolute left-0 top-0 w-[120px] h-full border-r border-border z-10 bg-background">
        {/* Vitals label - matches grid 0: top 40, height 340 */}
        <div className="absolute top-[40px] h-[340px] w-full flex items-center justify-center px-2 border-b border-border">
          <span className="text-base font-semibold">Vitals</span>
        </div>
        
        {/* Times - matches grid 1: top 380, height 40 */}
        <div className="absolute top-[380px] h-[40px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Times</span>
        </div>
        
        {/* Events - matches grid 2: top 420, height 40 */}
        <div className="absolute top-[420px] h-[40px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Events</span>
        </div>
        
        {/* Heart Rhythm - matches grid 3: top 460, height 40 */}
        <div className="absolute top-[460px] h-[40px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Heart Rhythm</span>
        </div>
        
        {/* Medications - matches grid 4: top 500, height 90 */}
        <div className="absolute top-[500px] h-[90px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Medications</span>
        </div>
        
        {/* Infusions - matches grid 5: top 590, height 40 */}
        <div className="absolute top-[590px] h-[40px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Infusions</span>
        </div>
        
        {/* Ventilation - matches grid 6: top 630, height 40 */}
        <div className="absolute top-[630px] h-[40px] w-full flex items-center px-2 border-b border-border">
          <span className="text-sm font-semibold text-black dark:text-white">Ventilation</span>
        </div>
        
        {/* Staff - matches grid 7: top 670, height 40 */}
        <div className="absolute top-[670px] h-[40px] w-full flex items-center px-2">
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
        />
      </div>
    </div>
  );
}
