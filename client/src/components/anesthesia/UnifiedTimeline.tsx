import { useMemo, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Activity, Heart, Wind, Combine, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StickyTimelineHeader } from "./StickyTimelineHeader";

/**
 * UnifiedTimeline - Refactored for robustness and flexibility
 * 
 * Features:
 * - Dynamic swimlanes - easy to add/remove at runtime
 * - Consistent vertical grid lines across all swimlanes
 * - Simplified configuration with centralized swimlane definitions
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
  swimlane: string; // Now flexible - any swimlane id
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

// Centralized swimlane configuration - easy to add/remove swimlanes
type SwimlaneConfig = {
  id: string;
  label: string;
  height: number;
  colorLight: string;
  colorDark: string;
};

export function UnifiedTimeline({
  data,
  height,
  swimlanes, // Optional: allow custom swimlane configuration
  now, // Current time for determining editable zones and initial zoom
}: {
  data: UnifiedTimelineData;
  height?: number;
  swimlanes?: SwimlaneConfig[];
  now?: number;
}) {
  const chartRef = useRef<any>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute("data-theme") === "dark");
  
  // State for dynamic medications
  const [medications, setMedications] = useState<string[]>([]);
  const [showAddMedDialog, setShowAddMedDialog] = useState(false);
  const [newMedName, setNewMedName] = useState("");

  // State for tracking current zoom/pan range
  const [currentZoomStart, setCurrentZoomStart] = useState<number | undefined>(undefined);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number | undefined>(undefined);

  // State for current time indicator - updates every minute
  const [currentTime, setCurrentTime] = useState<number>(now || Date.now());

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(Date.now());
    };

    // Update immediately if now prop changes
    if (now) {
      setCurrentTime(now);
    }

    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000); // 60000ms = 1 minute

    return () => clearInterval(interval);
  }, [now]);

  

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

  // Predefined medications list
  const medicationsList = [
    "Ringer Acetate (ml, i.v./free-flow)",
    "Rapidocain (mg, i.v.)",
    "Sufentanil (Sufenta) (μg, i.v.)",
    "Rocuronium (Esmeron) (mg, i.v.)",
    "Propofol 1% (mg/kg/h, i.v.)",
    "Arterenol 20mcg/ml (μg/kg/min, i.v.)",
    "Adrenalin 20mcg/ml (μg/kg/min, i.v.)",
    "Ephedrine /5.0ml, 50.0mg (mg, i.v.)",
    "Zentiva (Dexamethasone) /1.0ml, 5.0mg (mg, i.v.)",
    "Droperidol (Novalgin) (g, i.v.)",
    "Droperidol /2.0ml, 1.0mg (mg, i.v.)",
    "Toradol /1.0ml, 30.0mg (mg, i.v.)",
    "NaCl 0.9% (ml, infusion/free-flow)",
    "Glucose 5% 100 ml (ml, i.v./free-flow)",
  ];

  // Predefined ventilation parameters list
  const ventilationParams = [
    "etCO2 (mmHg)",
    "P insp (mbar)",
    "PEEP (mbar)",
    "Tidal Volume (ml)",
    "Respiratory Rate (/min)",
    "Minute Volume (l/min)",
    "FiO2 (%)",
  ];

  // Default swimlane configuration - can be overridden via props
  const baseSwimlanes: SwimlaneConfig[] = [
    { id: "zeiten", label: "Times", height: 50, colorLight: "rgba(243, 232, 255, 0.8)", colorDark: "hsl(270, 55%, 20%)" },
    { id: "ereignisse", label: "Events", height: 40, colorLight: "rgba(219, 234, 254, 0.8)", colorDark: "hsl(210, 60%, 18%)" },
    { id: "herzrhythmus", label: "Heart Rhythm", height: 40, colorLight: "rgba(252, 231, 243, 0.8)", colorDark: "hsl(330, 50%, 20%)" },
    { id: "medikamente", label: "Medications", height: 40, colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" },
    { id: "infusionen", label: "Infusions", height: 40, colorLight: "rgba(207, 250, 254, 0.8)", colorDark: "hsl(190, 60%, 18%)" },
    { id: "ventilation", label: "Ventilation", height: 40, colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" },
    { id: "staff", label: "Staff", height: 40, colorLight: "rgba(241, 245, 249, 0.8)", colorDark: "hsl(220, 25%, 25%)" },
  ];

  // Build static swimlanes - all expanded
  const buildActiveSwimlanes = (): SwimlaneConfig[] => {
    if (swimlanes) return swimlanes; // Use custom if provided
    
    const lanes: SwimlaneConfig[] = [];
    const medColor = { colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" };
    const ventColor = { colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" };
    
    for (const lane of baseSwimlanes) {
      lanes.push(lane);
      
      // Always insert medication children after Medications parent
      if (lane.id === "medikamente") {
        // Add predefined medications
        medicationsList.forEach((medName, index) => {
          lanes.push({
            id: `medication-predefined-${index}`,
            label: `  ${medName}`,
            height: 30,
            ...medColor,
          });
        });
        
        // Add user-added dynamic medications
        medications.forEach((medName, index) => {
          lanes.push({
            id: `medication-dynamic-${index}`,
            label: `  ${medName}`,
            height: 30,
            ...medColor,
          });
        });
      }

      // Always insert ventilation children after Ventilation parent
      if (lane.id === "ventilation") {
        ventilationParams.forEach((paramName, index) => {
          lanes.push({
            id: `ventilation-${index}`,
            label: `  ${paramName}`,
            height: 30,
            ...ventColor,
          });
        });
      }
    }
    
    return lanes;
  };

  const activeSwimlanes = useMemo(() => buildActiveSwimlanes(), [medications, swimlanes]);

  // Add medication handler
  const handleAddMedication = () => {
    if (newMedName.trim()) {
      setMedications([...medications, newMedName.trim()]);
      setNewMedName("");
      setShowAddMedDialog(false);
    }
  };

  // Remove medication handler
  const handleRemoveMedication = (index: number) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  // Listen for dataZoom changes to sync with sticky header
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleDataZoom = (params: any) => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        setCurrentZoomStart(dataZoom.startValue);
        setCurrentZoomEnd(dataZoom.endValue);
      }
    };

    chart.on('datazoom', handleDataZoom);
    return () => {
      chart.off('datazoom', handleDataZoom);
    };
  }, []);

  // Update dataZoom xAxisIndex when swimlane structure changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    // Get current dataZoom state to preserve zoom level
    const currentOption = chart.getOption() as any;
    const currentDataZoom = currentOption.dataZoom?.[0];
    
    // Update dataZoom to include all current x-axes
    const numGrids = activeSwimlanes.length + 1; // +1 for vitals grid
    chart.setOption({
      dataZoom: [{
        ...currentDataZoom,
        xAxisIndex: Array.from({ length: numGrids }, (_, i) => i),
      }]
    });
  }, [activeSwimlanes]);

  // Update editable zone widths after chart is rendered
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const updateZones = () => {
      // Calculate heights outside try block for error logging
      const VITALS_TOP = 32;
      const VITALS_HEIGHT = 340;
      const GRID_LEFT = 150;
      const GRID_RIGHT = 10;
      // Calculate current swimlanes height based on expanded/collapsed state
      const currentSwimlanes = buildActiveSwimlanes();
      const swimlanesHeight = currentSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
      const chartHeight = VITALS_HEIGHT + swimlanesHeight;
      
      try {
        const tenMinutes = 10 * 60 * 1000;
        const editableBoundary = currentTime - tenMinutes;
        
        // Use convertToPixel to get accurate pixel positions based on current zoom
        const startPx = chart.convertToPixel({ xAxisIndex: 0 }, data.startTime);
        const boundaryPx = chart.convertToPixel({ xAxisIndex: 0 }, editableBoundary);
        const endPx = chart.convertToPixel({ xAxisIndex: 0 }, data.endTime);
        
        // Calculate pixel widths based on zoom-aware positions
        const nonEditableWidth = Math.max(0, boundaryPx - startPx);
        const editableWidth = Math.max(0, endPx - boundaryPx);
        
        // Calculate position for current time indicator
        const nowPx = chart.convertToPixel({ xAxisIndex: 0 }, currentTime);
        
        // Generate vertical grid lines as individual elements with pixel positioning
        const oneHour = 60 * 60 * 1000;
        const verticalLineElements: any[] = [];
        
        // Calculate the actual total height by getting the last grid's bottom position
        const chartInstance = chart;
        const currentOption = chartInstance.getOption() as any;
        const grids = currentOption.grid || [];
        
        // Find the bottom-most grid to calculate total height
        let totalHeight = VITALS_HEIGHT; // Start with vitals height
        if (grids.length > 1) {
          // Get the last grid (swimlanes)
          const lastGrid = grids[grids.length - 1];
          if (lastGrid && typeof lastGrid.top === 'number' && typeof lastGrid.height === 'number') {
            totalHeight = (lastGrid.top - VITALS_TOP) + lastGrid.height;
          } else {
            // Fallback: calculate from swimlanes data
            totalHeight = VITALS_HEIGHT + swimlanesHeight;
          }
        }
        
        for (let t = Math.ceil(data.startTime / oneHour) * oneHour; t <= data.endTime; t += oneHour) {
          const xPx = chart.convertToPixel({ xAxisIndex: 0 }, t);
          
          // Major hourly line - use calculated total height
          verticalLineElements.push({
            id: `vline-${t}`,
            type: "line",
            left: xPx,
            top: VITALS_TOP,
            shape: {
              x1: 0,
              y1: 0,
              x2: 0,
              y2: totalHeight,
            },
            style: {
              stroke: isDark ? "#444444" : "#d1d5db",
              lineWidth: 1,
            },
            silent: true,
            z: 1,
          });
          
          // Minor 15-minute lines - use calculated total height
          for (let minor = 1; minor < 4; minor++) {
            const minorTime = t + (minor * 15 * 60 * 1000);
            if (minorTime > data.endTime) break;
            
            const minorXPx = chart.convertToPixel({ xAxisIndex: 0 }, minorTime);
            verticalLineElements.push({
              id: `vline-minor-${minorTime}`,
              type: "line",
              left: minorXPx,
              top: VITALS_TOP,
              shape: {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: totalHeight,
              },
              style: {
                stroke: isDark ? "#333333" : "#e5e7eb",
                lineWidth: 0.5,
                lineDash: [4, 4],
              },
              silent: true,
              z: 1,
            });
          }
        }
        
        // Get current graphic elements to preserve Y-axis labels  
        const currentOption = chart.getOption() as any;
        const currentGraphic = currentOption.graphic?.[0]?.elements || [];
        const yAxisLabels = currentGraphic.filter((el: any) => el.id && el.id.startsWith('y-label-'));
        
        // Update with vertical lines, zones, now indicator, and preserved labels
        chart.setOption({
          graphic: [
            ...verticalLineElements,
            // Preserved Y-axis labels
            ...yAxisLabels,
            // Zones and indicator
            {
              id: 'non-editable-zone',
              type: "rect",
              left: startPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: nonEditableWidth,
                height: totalHeight,
              },
              style: {
                fill: isDark ? 'rgba(100, 100, 100, 0.15)' : 'rgba(200, 200, 200, 0.25)',
              },
              silent: true,
              z: 0,
              cursor: 'not-allowed',
            },
            {
              id: 'editable-zone',
              type: "rect",
              left: boundaryPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: editableWidth,
                height: totalHeight,
              },
              style: {
                fill: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.5)',
              },
              silent: false,
              z: 0,
              cursor: 'pointer',
            },
            {
              id: 'now-indicator',
              type: "line",
              left: nowPx,
              top: VITALS_TOP,
              shape: {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: totalHeight,
              },
              style: {
                stroke: isDark ? '#ef4444' : '#dc2626',
                lineWidth: 2,
              },
              silent: true,
              z: 100,
            },
          ],
        }, { notMerge: false, lazyUpdate: false });
      } catch (e) {
        console.error('Error updating zones:', e);
        console.error('Error details:', {
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
          activeSwimlanes: activeSwimlanes.length,
          chartHeight,
        });
      }
    };

    // Update zones after chart finishes rendering
    chart.on('finished', updateZones);
    
    // Update on resize
    const handleResize = () => updateZones();
    window.addEventListener('resize', handleResize);
    
    return () => {
      chart.off('finished', updateZones);
      window.removeEventListener('resize', handleResize);
    };
  }, [chartRef, data, isDark, activeSwimlanes, now, currentZoomStart, currentZoomEnd, currentTime]);

  const option = useMemo(() => {
    // Layout constants
    const VITALS_TOP = 32; // Space for sticky header (32px)
    const VITALS_HEIGHT = 340;
    const SWIMLANE_START = VITALS_TOP + VITALS_HEIGHT; // 372px
    const GRID_LEFT = 150; // Original value - y-axes will use existing white space
    const GRID_RIGHT = 10;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || data.endTime; // Use provided "now" or fall back to endTime
    const fiveMinutes = 5 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;
    const fifteenMinutes = 15 * 60 * 1000;
    
    // Initial view: 5 minutes starting 15 minutes before now
    const initialStartTime = currentTime - fifteenMinutes;
    const initialEndTime = initialStartTime + fiveMinutes;
    
    // Editable zone boundary: 10 minutes before now
    const editableBoundary = currentTime - tenMinutes;

    // Calculate swimlane positions dynamically
    let currentTop = SWIMLANE_START;
    const swimlaneGrids = activeSwimlanes.map((lane) => {
      const grid = {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: currentTop,
        height: lane.height,
        backgroundColor: isDark ? lane.colorDark : lane.colorLight,
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

    // Create x-axis for each grid with consistent configuration
    const createXAxis = (gridIndex: number) => ({
      type: "time" as const,
      gridIndex,
      min: data.startTime,
      max: data.endTime,
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
        show: true, // Vertical lines on all grids
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        },
      },
      minorTick: {
        show: gridIndex === 0,
        splitNumber: 4, // 15-minute intervals
      },
      minorSplitLine: {
        show: true, // Minor vertical lines on all grids
        lineStyle: {
          color: isDark ? "#333333" : "#e5e7eb",
          width: 0.5,
          type: "dashed" as const,
        },
      },
      position: "top",
    });

    const xAxes = grids.map((_, index) => createXAxis(index));

    // Y-axes: vitals (dual) + swimlanes (categorical)
    const yAxes = [
      // Vitals grid - First y-axis (BP/HR: -20 to 240 range for top and bottom padding, showing 0-220 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: -20,
        max: 240,
        interval: 20,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { 
          show: true, // Show horizontal grid lines!
          lineStyle: {
            color: isDark ? "#444444" : "#d1d5db",
            width: 1,
            type: "solid" as const,
          }
        },
      },
      // Vitals grid - Second y-axis (SpO2: 45-105 range for top and bottom padding, showing 50-100 labels)
      {
        type: "value" as const,
        gridIndex: 0,
        min: 45,
        max: 105,
        interval: 10,
        axisLabel: { show: false }, // Hide labels (we render manually)
        axisLine: { show: false }, // Hide axis line
        axisTick: { show: false }, // Hide ticks
        splitLine: { show: false }, // Don't show grid lines for this axis
      },
      // Swimlane y-axes
      ...activeSwimlanes.map((_, index) => ({
        type: "category" as const,
        gridIndex: index + 1,
        data: [""],
        show: false,
      })),
    ];

    // Series (empty for now - to be populated with data)
    const series: any[] = [];

    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    
    // Generate manual y-axis labels in the white space
    const yAxisLabels: any[] = [];
    
    // First y-axis (0-220, interval 20) - positioned at x=85px, grid extends -20 to 240 for top and bottom padding
    for (let val = 0; val <= 220; val += 20) {
      const yPercent = ((240 - val) / 260) * 100; // Invert because top is 0, using 260 range (-20 to 240)
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 85,
        top: yPos - 6, // Center text vertically
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: isDark ? "#ffffff" : "#000000",
        },
        silent: true,
        z: 100,
      });
    }
    
    // Second y-axis (50-100, interval 10) - positioned at x=125px, grid extends 45 to 105 for padding
    for (let val = 50; val <= 100; val += 10) {
      const yPercent = ((105 - val) / 60) * 100; // Range is 45-105, so 60 units total
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 125,
        top: yPos - 6,
        style: {
          text: val.toString(),
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          fill: "#8b5cf6",
        },
        silent: true,
        z: 100,
      });
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
        // Zone placeholders (will be replaced by useEffect)
        {
          id: 'non-editable-zone',
          type: "rect",
          left: 0,
          top: VITALS_TOP,
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: 'transparent' },
          silent: true,
          z: 0,
        },
        {
          id: 'editable-zone',
          type: "rect",
          left: 0,
          top: VITALS_TOP,
          shape: { x: 0, y: 0, width: 0, height: 0 },
          style: { fill: 'transparent' },
          silent: true,
          z: 0,
        },
        {
          id: 'now-indicator',
          type: "line",
          left: 0,
          top: VITALS_TOP,
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          style: { stroke: 'transparent', lineWidth: 0 },
          silent: true,
          z: 100,
        },
      ],
      dataZoom: [{
        type: "inside",
        xAxisIndex: grids.map((_, i) => i),
        startValue: initialStartTime,
        endValue: initialEndTime,
        minValueSpan: 5 * 60 * 1000, // 5 minutes minimum
        maxValueSpan: 6 * 60 * 60 * 1000, // 6 hours maximum
        throttle: 50,
        zoomLock: true, // Completely disable zoom to allow page scrolling
        zoomOnMouseWheel: false, // Disable scroll zoom
        moveOnMouseWheel: false, // Disable scroll pan
        moveOnMouseMove: false, // Disable drag pan
        filterMode: "none",
      }],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        textStyle: { fontFamily: "Poppins, sans-serif" },
      },
    } as echarts.EChartsOption;
  }, [data, isDark, activeSwimlanes, now]);

  // Calculate component height
  const VITALS_HEIGHT = 340;
  const VITALS_TOP_POS = 32; // Position accounting for sticky header (32px)
  const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
  const componentHeight = height ?? (VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight);

  // Zoom and pan handlers
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

  const handleResetZoom = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const currentTime = now || data.endTime;
      const fiveMinutes = 5 * 60 * 1000;
      const fifteenMinutes = 15 * 60 * 1000;
      const initialStartTime = currentTime - fifteenMinutes;
      const initialEndTime = initialStartTime + fiveMinutes;
      
      chart.dispatchAction({
        type: 'dataZoom',
        startValue: initialStartTime,
        endValue: initialEndTime,
      });
    }
  };

  // Calculate swimlane positions for sidebar
  const SWIMLANE_START = VITALS_TOP_POS + VITALS_HEIGHT;
  let currentTop = SWIMLANE_START;
  const swimlanePositions = activeSwimlanes.map((lane) => {
    const pos = { ...lane, top: currentTop };
    currentTop += lane.height;
    return pos;
  });

  return (
    <div className="w-full relative" style={{ height: componentHeight }}>
      {/* Sticky Timeline Header */}
      <StickyTimelineHeader
        startTime={data.startTime}
        endTime={data.endTime}
        currentStart={currentZoomStart}
        currentEnd={currentZoomEnd}
        isDark={isDark}
        onPanLeft={handlePanLeft}
        onPanRight={handlePanRight}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
      />
      
      {/* Swimlane backgrounds */}
      <div className="absolute left-0 top-0 right-0 h-full pointer-events-none z-0">
        {swimlanePositions.map((lane, index) => (
          <div 
            key={lane.id}
            className="absolute w-full border-b" 
            style={{ 
              top: `${lane.top}px`, 
              height: `${lane.height}px`, 
              backgroundColor: isDark ? lane.colorDark : lane.colorLight,
              borderColor: isDark ? "#444444" : "#d1d5db"
            }} 
          />
        ))}
      </div>

      {/* Left sidebar */}
      <div className="absolute left-0 top-0 w-[150px] h-full border-r border-border z-30 bg-background">
        {/* Y-axis scales - manually rendered on right side of white area */}
        <div className="absolute top-[32px] h-[340px] w-full pointer-events-none z-50">
          {/* First scale: 0-220 with 20-unit steps (11 values) - close to grid, grid extends -20 to 240 for top and bottom padding */}
          {[0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((val) => {
            const yPercent = ((240 - val) / 260) * 100;
            return (
              <div 
                key={`scale1-${val}`}
                className="absolute text-xs font-medium text-foreground"
                style={{ 
                  right: '40px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)'
                }}
              >
                {val}
              </div>
            );
          })}
          
          {/* Second scale: 50-100 with 10-unit steps (6 values) - purple, closest to grid, extends 45 to 105 for padding */}
          {[50, 60, 70, 80, 90, 100].map((val) => {
            const yPercent = ((105 - val) / 60) * 100;
            return (
              <div 
                key={`scale2-${val}`}
                className="absolute text-xs font-bold"
                style={{ 
                  right: '8px',
                  top: `${yPercent}%`,
                  transform: 'translateY(-50%)',
                  color: '#8b5cf6'
                }}
              >
                {val}
              </div>
            );
          })}
        </div>
        
        {/* Vitals icon buttons */}
        <div className="absolute top-[32px] h-[340px] w-full flex flex-col items-start justify-center gap-2 pl-4">
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
        {swimlanePositions.map((lane, index) => {
          const isMedParent = lane.id === "medikamente";
          const isMedChild = lane.id.startsWith("medication-");
          const isVentChild = lane.id.startsWith("ventilation-");
          const isDynamicMed = lane.id.startsWith("medication-dynamic-");
          const isChild = isMedChild || isVentChild;
          const medIndex = isDynamicMed ? parseInt(lane.id.split("-")[2]) : -1;
          
          return (
            <div 
              key={lane.id}
              className="absolute w-full flex items-center justify-between px-2 border-b" 
              style={{ 
                top: `${lane.top}px`,
                height: `${lane.height}px`,
                backgroundColor: isDark ? lane.colorDark : lane.colorLight,
                borderColor: isDark ? "#444444" : "#d1d5db"
              }}
            >
              <div className="flex items-center gap-1 flex-1">
                <span className={`${isChild ? 'text-xs' : 'text-sm font-semibold'} text-black dark:text-white`}>
                  {lane.label}
                </span>
              </div>
              
              {isMedParent && (
                <button
                  onClick={() => setShowAddMedDialog(true)}
                  className="p-1 rounded hover:bg-background/50 transition-colors"
                  data-testid="button-add-medication"
                  title="Add Medication"
                >
                  <Plus className="w-4 h-4 text-black dark:text-white" />
                </button>
              )}
              
              {isDynamicMed && (
                <button
                  onClick={() => handleRemoveMedication(medIndex)}
                  className="p-1 rounded hover:bg-background/50 transition-colors"
                  data-testid={`button-remove-medication-${medIndex}`}
                  title="Remove Medication"
                >
                  <X className="w-3 h-3 text-black dark:text-white" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ECharts timeline */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "100%", width: "100%" }}
          opts={{ renderer: "canvas" }}
          notMerge
          lazyUpdate
        />
      </div>

      {/* Add Medication Dialog */}
      <Dialog open={showAddMedDialog} onOpenChange={setShowAddMedDialog}>
        <DialogContent className="sm:max-w-[425px]" data-testid="dialog-add-medication">
          <DialogHeader>
            <DialogTitle>Add Medication</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="medication-name">Medication Name</Label>
              <Input
                id="medication-name"
                data-testid="input-medication-name"
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddMedication();
                  }
                }}
                placeholder="e.g., Propofol 1%"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddMedDialog(false);
                setNewMedName("");
              }}
              data-testid="button-cancel-medication"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMedication}
              data-testid="button-confirm-add-medication"
              disabled={!newMedName.trim()}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
