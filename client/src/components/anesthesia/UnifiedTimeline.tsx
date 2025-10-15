import { useMemo, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Activity, Heart, Wind, Combine } from "lucide-react";

/**
 * UnifiedTimeline
 * 
 * A professional anesthesia timeline with:
 * - Top grid: Vitals chart with dual y-axes (BP/HR left, SpO2 right)
 * - Dynamic swimlanes that can be added/removed at runtime
 * - Unified zoom/pan controls
 * - Synchronized vertical grid lines across all swimlanes
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

export type Swimlane = {
  id: string;
  name: string;
  type: "header" | "data";
  parentId?: string; // for child swimlanes
  color?: string;
  height?: number;
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
  swimlanes?: Swimlane[]; // Dynamic swimlane configuration
};

export function UnifiedTimeline({
  data,
  height,
}: {
  data: UnifiedTimelineData;
  height?: number;
}) {
  // Default swimlanes configuration
  const defaultSwimlanes: Swimlane[] = [
    { id: "zeiten", name: "Times", type: "data", color: "hsl(270, 55%, 20%)", height: 50 },
    { id: "ereignisse", name: "Events", type: "data", color: "hsl(210, 60%, 18%)", height: 40 },
    { id: "herzrhythmus", name: "Heart Rhythm", type: "data", color: "hsl(330, 50%, 20%)", height: 40 },
    { id: "medikamente", name: "Medications", type: "header", color: "hsl(150, 45%, 18%)", height: 40 },
    { id: "propofol", name: "Propofol 1%", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "fentanyl", name: "Fentanyl 50µg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "rocuronium", name: "Rocuronium 10mg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "sevoflurane", name: "Sevoflurane", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "midazolam", name: "Midazolam 5mg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "atracurium", name: "Atracurium 10mg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "remifentanil", name: "Remifentanil 2mg", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "succinylcholine", name: "Succinylcholine 20mg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "vecuronium", name: "Vecuronium 4mg", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "morphine", name: "Morphine 10mg/ml", type: "data", parentId: "medikamente", color: "hsl(150, 45%, 18%)", height: 30 },
    { id: "infusionen", name: "Infusions", type: "data", color: "hsl(190, 60%, 18%)", height: 40 },
    { id: "ventilation", name: "Ventilation", type: "data", color: "hsl(35, 70%, 22%)", height: 40 },
    { id: "staff", name: "Staff", type: "data", color: "hsl(220, 25%, 25%)", height: 40 },
  ];

  const swimlanes = data.swimlanes ?? defaultSwimlanes;
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
    // Calculate positions for all swimlanes
    const vitalsHeight = 340;
    const vitalsTop = 40;
    const gridLeft = 150;
    const gridRight = 10;

    let currentTop = vitalsTop + vitalsHeight;
    const swimlanePositions = [];

    // Calculate positions for each swimlane
    swimlanes.forEach((swimlane) => {
      const bgColor = isDark 
        ? swimlane.color || "hsl(220, 25%, 25%)"
        : swimlane.color?.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (_, h, s, l) => 
            `hsla(${h}, ${s}%, ${Math.min(parseInt(l) + 40, 80)}%, 0.8)`
          ) || "rgba(241, 245, 249, 0.8)";

      swimlanePositions.push({
        ...swimlane,
        top: currentTop,
        backgroundColor: bgColor
      });
      currentTop += swimlane.height || 40;
    });

    const totalHeight = currentTop;
    const componentHeight = height ?? totalHeight + 50;

    // Create grids - one for vitals, one per swimlane
    const grids = [
      // Vitals grid
      {
        left: gridLeft,
        right: gridRight,
        top: vitalsTop,
        height: vitalsHeight,
        backgroundColor: "transparent"
      },
      // Swimlane grids
      ...swimlanePositions.map(pos => ({
        left: gridLeft,
        right: gridRight,
        top: pos.top,
        height: pos.height,
        backgroundColor: pos.backgroundColor
      }))
    ];

    // Create x-axes - all synchronized to same time range
    const xAxes = grids.map((_, index) => ({
      type: "time" as const,
      gridIndex: index,
      min: data.startTime,
      max: data.endTime,
      boundaryGap: false,
      axisLabel: {
        show: index === 0, // Only show on vitals grid
        formatter: "{HH}:{mm}",
        fontSize: 10,
        fontFamily: "Poppins, sans-serif",
      },
      axisLine: { 
        show: index === 0,
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
        }
      },
      axisTick: { 
        show: index === 0,
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
        }
      },
      // CRITICAL: All x-axes have identical splitLine configuration
      splitLine: { 
        show: true,
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        },
      },
      minorTick: {
        show: index === 0,
        splitNumber: 4,
      },
      minorSplitLine: {
        show: true,
        lineStyle: {
          color: isDark ? "#333333" : "#e5e7eb",
          width: 0.5,
          type: "dashed" as const,
        },
      },
    }));

    // Create y-axes
    const yAxes = [
      // Vitals grid - dual y-axes
      {
        type: "value" as const,
        gridIndex: 0,
        min: 0,
        max: 240,
        interval: 40,
        position: "left" as const,
        offset: 30,
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
      {
        type: "value" as const,
        gridIndex: 0,
        min: 50,
        max: 100,
        interval: 10,
        position: "left" as const,
        offset: 0,
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
      // Swimlane y-axes
      ...swimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      })),
    ];

    const series: any[] = [];

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
          xAxisIndex: Array.from({ length: grids.length }, (_, i) => i),
          startValue: data.startTime,
          endValue: data.endTime,
          minValueSpan: 5 * 60 * 1000,
          maxValueSpan: 6 * 60 * 60 * 1000,
          throttle: 50,
          zoomOnMouseWheel: false,
          moveOnMouseWheel: false,
          moveOnMouseMove: false,
          filterMode: "none",
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
  }, [data, isDark, swimlanes, height]);

  // Calculate positions for UI elements
  const vitalsHeight = 340;
  const vitalsTop = 40;
  let currentTop = vitalsTop + vitalsHeight;

  const swimlanePositions = swimlanes.map((swimlane) => {
    const bgColor = isDark 
      ? swimlane.color || "hsl(220, 25%, 25%)"
      : swimlane.color?.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, (_, h, s, l) => 
          `hsla(${h}, ${s}%, ${Math.min(parseInt(l) + 40, 80)}%, 0.8)`
        ) || "rgba(241, 245, 249, 0.8)";

    const position = {
      ...swimlane,
      top: currentTop,
      backgroundColor: bgColor
    };
    currentTop += swimlane.height || 40;
    return position;
  });

  const totalHeight = currentTop;
  const componentHeight = height ?? totalHeight + 50;

  // Zoom and pan controls
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        const currentMin = dataZoom.startValue;
        const currentMax = dataZoom.endValue;
        const currentSpan = currentMax - currentMin;
        const newSpan = Math.max(currentSpan * 0.5, 5 * 60 * 1000);
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
        const newSpan = Math.min(currentSpan * 2, 6 * 60 * 60 * 1000);
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
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);

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
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);

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
      {/* Zoom and Pan Controls */}
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

      {/* Swimlane background colors with continuous bottom borders */}
      <div className="absolute left-0 top-0 right-0 h-full pointer-events-none z-0">
        {swimlanePositions.map((pos) => (
          <div 
            key={pos.id}
            className="absolute w-full border-b" 
            style={{ 
              top: `${pos.top}px`, 
              height: `${pos.height}px`, 
              backgroundColor: pos.backgroundColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }} 
          />
        ))}
      </div>

      {/* Left sidebar with swimlane labels */}
      <div className="absolute left-0 top-0 w-[150px] h-full border-r border-border z-10 bg-background">
        {/* Vitals icon buttons */}
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

        {/* Swimlane labels */}
        {swimlanePositions.map((pos) => (
          <div 
            key={pos.id}
            className="absolute w-full flex items-center px-2 border-b" 
            style={{ 
              top: `${pos.top}px`,
              height: `${pos.height}px`,
              backgroundColor: pos.backgroundColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }}
          >
            <span className={`${pos.type === 'header' ? 'text-sm font-semibold' : 'text-xs'} text-black dark:text-white`}>
              {pos.name}
            </span>
          </div>
        ))}
      </div>

      {/* ECharts timeline */}
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