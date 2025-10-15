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

export type DrugSwimlane = {
  id: string;
  name: string;
  color?: string;
};

export type UnifiedTimelineData = {
  startTime: number;
  endTime: number;
  vitals: TimelineVitals;
  events: TimelineEvent[];
  drugs?: DrugSwimlane[]; // Optional dynamic drug list
};

export function UnifiedTimeline({
  data,
  height,
}: {
  data: UnifiedTimelineData;
  height?: number;
}) {
  // Use dynamic drug list or fallback to default
  const defaultDrugs: DrugSwimlane[] = [
    { id: "propofol", name: "Propofol 1%" },
    { id: "fentanyl", name: "Fentanyl 50µg/ml" },
    { id: "rocuronium", name: "Rocuronium 10mg/ml" },
    { id: "sevoflurane", name: "Sevoflurane" },
    { id: "midazolam", name: "Midazolam 5mg/ml" },
    { id: "atracurium", name: "Atracurium 10mg/ml" },
    { id: "remifentanil", name: "Remifentanil 2mg" },
    { id: "succinylcholine", name: "Succinylcholine 20mg/ml" },
    { id: "vecuronium", name: "Vecuronium 4mg" },
    { id: "morphine", name: "Morphine 10mg/ml" }
  ];
  
  const drugs = data.drugs ?? defaultDrugs;
  const numDrugs = drugs.length;
  const drugHeight = 30;
  const defaultHeight = 510 + 40 + (numDrugs * drugHeight) + 120; // base + medications header + drug swimlanes + other swimlanes
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

    // Medications swimlane - parent header plus individual drug swimlanes
    const medicationColor = isDark ? "hsl(150, 45%, 18%)" : "rgba(220, 252, 231, 0.8)";

    // Calculate positions
    const medicationStart = 510;
    const medicationHeaderHeight = 40; // Parent Medications header
    const totalDrugHeight = numDrugs * drugHeight; // Total height for all drug swimlanes
    const medicationEnd = medicationStart + medicationHeaderHeight + totalDrugHeight;

    // CRITICAL: All grids must have IDENTICAL left/right values for perfect alignment
    const gridLeft = 150;
    const gridRight = 10;

    // Individual drug swimlanes
    const drugGrids = Array.from({ length: numDrugs }, (_, i) => ({
      left: gridLeft,
      right: gridRight,
      top: medicationStart + medicationHeaderHeight + (i * drugHeight),
      height: drugHeight,
      backgroundColor: medicationColor
    }));

    const grids = [
      // Grid 0: Vitals chart (taller for better visibility)
      { left: gridLeft, right: gridRight, top: 40, height: 340, backgroundColor: "transparent" },
      // Grid 1: Times (purple background) - taller to avoid text overlap
      { left: gridLeft, right: gridRight, top: 380, height: 50, backgroundColor: isDark ? "hsl(270, 55%, 20%)" : "rgba(243, 232, 255, 0.8)" },
      // Grid 2: Events (blue background)
      { left: gridLeft, right: gridRight, top: 430, height: 40, backgroundColor: isDark ? "hsl(210, 60%, 18%)" : "rgba(219, 234, 254, 0.8)" },
      // Grid 3: Heart Rhythm (pink background)
      { left: gridLeft, right: gridRight, top: 470, height: 40, backgroundColor: isDark ? "hsl(330, 50%, 20%)" : "rgba(252, 231, 243, 0.8)" },
      // Grid 4: Medications header (green background)
      { left: gridLeft, right: gridRight, top: medicationStart, height: medicationHeaderHeight, backgroundColor: medicationColor },
      // Grids 5-14: Individual drug swimlanes
      ...drugGrids,
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
      boundaryGap: false, // Ensure no gaps at boundaries
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
        show: true, // CRITICAL: Show vertical grid lines on ALL grids for alignment through all swimlanes
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        },
      },
      minorTick: {
        show: index === 0, // Only show minor ticks on top grid
        splitNumber: 4, // 15-minute intervals (4 splits per hour)
      },
      minorSplitLine: {
        show: true, // CRITICAL: Show minor vertical lines on ALL grids
        lineStyle: {
          color: isDark ? "#333333" : "#e5e7eb",
          width: 0.5,
          type: "dashed" as const,
        },
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
        // All swimlanes now have single row
        return {
          type: "category" as const,
          gridIndex: gridIdx,
          data: [""], // Single category for each swimlane
          show: false,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { 
            show: true, // Enable splitLine to allow vertical grid lines to pass through
            lineStyle: {
              color: "transparent", // Make invisible but still allow grid lines to extend
              width: 0
            }
          },
        };
      }),
    ];

    // Series - clean slate for vitals (no simulated data)
    const series: any[] = [];

    // Calculate total chart height for continuous vertical lines
    const chartBottom = medicationEnd + 120; // Bottom of last grid
    const chartTop = 40; // Top of first grid  
    const totalHeight = chartBottom - chartTop;
    
    // Generate continuous vertical line positions based on time axis
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    const fifteenMin = 15 * 60 * 1000;
    
    const verticalLines = [];
    
    // Major lines (hourly) - more prominent
    for (let t = Math.ceil(data.startTime / oneHour) * oneHour; t <= data.endTime; t += oneHour) {
      const xPercent = ((t - data.startTime) / timeRange) * 100;
      
      verticalLines.push({
        type: "line",
        shape: {
          x1: xPercent,
          y1: 0,
          x2: xPercent,
          y2: totalHeight
        },
        style: {
          stroke: isDark ? "#444444" : "#d1d5db",
          lineWidth: 1
        },
        silent: true,
        z: 0
      });
    }
    
    // Minor lines (15-minute intervals) - lighter
    for (let t = Math.ceil(data.startTime / fifteenMin) * fifteenMin; t <= data.endTime; t += fifteenMin) {
      // Skip if this is already a major hourly line
      if (t % oneHour !== 0) {
        const xPercent = ((t - data.startTime) / timeRange) * 100;
        
        verticalLines.push({
          type: "line",
          shape: {
            x1: xPercent,
            y1: 0,
            x2: xPercent,
            y2: totalHeight
          },
          style: {
            stroke: isDark ? "#333333" : "#e5e7eb",
            lineWidth: 0.5,
            lineDash: [3, 3]
          },
          silent: true,
          z: 0
        });
      }
    }

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      series,
      // Use graphic elements to draw continuous vertical lines spanning all swimlanes
      graphic: {
        elements: [{
          type: "group",
          left: gridLeft,
          right: gridRight,
          top: chartTop,
          height: totalHeight,
          children: verticalLines,
          silent: true,
          z: 0
        }]
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: Array.from({ length: grids.length }, (_, i) => i), // Explicitly list all x-axis indices
          startValue: data.startTime, // Use provided start time
          endValue: data.endTime, // Use provided end time
          minValueSpan: 5 * 60 * 1000, // Minimum 5 minutes visible (set by user)
          maxValueSpan: 6 * 60 * 60 * 1000, // Maximum 6 hours visible (set by user)
          throttle: 50,
          zoomOnMouseWheel: false, // Disable scroll zoom - use page scroll instead
          moveOnMouseWheel: false, // Disable scroll pan
          moveOnMouseMove: false, // Disable drag pan (use buttons instead)
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

  // Calculate positions for sidebar (reuse values from component top)
  const medicationStart = 510;
  const medicationHeaderHeight = 40;
  const totalDrugHeight = numDrugs * drugHeight;
  const medicationEnd = medicationStart + medicationHeaderHeight + totalDrugHeight;
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

      {/* Swimlane background colors - extend full width behind everything with continuous bottom borders */}
      <div className="absolute left-0 top-0 right-0 h-full pointer-events-none z-0">
        {/* Times background */}
        <div 
          className="absolute top-[380px] h-[50px] w-full border-b" 
          style={{ 
            backgroundColor: isDark ? "hsl(270, 55%, 20%)" : "rgba(243, 232, 255, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Events background */}
        <div 
          className="absolute top-[430px] h-[40px] w-full border-b" 
          style={{ 
            backgroundColor: isDark ? "hsl(210, 60%, 18%)" : "rgba(219, 234, 254, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Heart Rhythm background */}
        <div 
          className="absolute top-[470px] h-[40px] w-full border-b" 
          style={{ 
            backgroundColor: isDark ? "hsl(330, 50%, 20%)" : "rgba(252, 231, 243, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Medications header background */}
        <div 
          className="absolute w-full border-b" 
          style={{ 
            top: `${medicationStart}px`, 
            height: `${medicationHeaderHeight}px`, 
            backgroundColor: medicationColor,
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Individual drug swimlane backgrounds */}
        {drugs.map((drug, i) => (
          <div 
            key={drug.id}
            className="absolute w-full border-b" 
            style={{ 
              top: `${medicationStart + medicationHeaderHeight + (i * drugHeight)}px`, 
              height: `${drugHeight}px`, 
              backgroundColor: drug.color || medicationColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }} 
          />
        ))}
        {/* Infusions background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full border-b" 
          style={{ 
            top: `${medicationEnd}px`,
            backgroundColor: isDark ? "hsl(190, 60%, 18%)" : "rgba(207, 250, 254, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Ventilation background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full border-b" 
          style={{ 
            top: `${medicationEnd + 40}px`,
            backgroundColor: isDark ? "hsl(35, 70%, 22%)" : "rgba(254, 243, 199, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
          }} 
        />
        {/* Staff background - dynamic position */}
        <div 
          className="absolute h-[40px] w-full border-b" 
          style={{ 
            top: `${medicationEnd + 80}px`,
            backgroundColor: isDark ? "hsl(220, 25%, 25%)" : "rgba(241, 245, 249, 0.8)",
            borderColor: isDark ? "#444444" : "#d1d5db"
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

        {/* Medications header */}
        <div 
          className="absolute w-full flex items-center px-2 border-b" 
          style={{ 
            top: `${medicationStart}px`,
            height: `${medicationHeaderHeight}px`,
            backgroundColor: medicationColor,
            borderColor: isDark ? "#444444" : "#d1d5db"
          }}
        >
          <span className="text-sm font-semibold text-black dark:text-white">Medications</span>
        </div>

        {/* Individual drug swimlane headers */}
        {drugs.map((drug, i) => (
          <div 
            key={drug.id}
            className="absolute w-full flex items-center px-2 border-b" 
            style={{ 
              top: `${medicationStart + medicationHeaderHeight + (i * drugHeight)}px`,
              height: `${drugHeight}px`,
              backgroundColor: drug.color || medicationColor,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }}
          >
            <span className="text-xs text-black dark:text-white">{drug.name}</span>
          </div>
        ))}

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
          
        />
      </div>
    </div>
  );
}