import { useMemo, useRef, useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Activity, Heart, Wind, Combine, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
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
  
  // State for collapsible parent swimlanes
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set());
  
  // State for dynamic medications
  const [medications, setMedications] = useState<string[]>([]);
  const [showAddMedDialog, setShowAddMedDialog] = useState(false);
  const [newMedName, setNewMedName] = useState("");

  // State for current time indicator - updates every minute
  const [currentTime, setCurrentTime] = useState<number>(now || Date.now());
  
  // State for tracking current zoom/pan range - will be initialized from dataZoom
  const [currentZoomStart, setCurrentZoomStart] = useState<number | undefined>(undefined);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number | undefined>(undefined);
  
  // State for tracking current snap interval (in milliseconds) - matches vertical grid lines
  const [currentSnapInterval, setCurrentSnapInterval] = useState<number>(15 * 60 * 1000); // Default 15 minutes

  // State for interactive vital entry
  const [activeToolMode, setActiveToolMode] = useState<'hr' | 'bp' | 'spo2' | null>(null);
  const [hrDataPoints, setHrDataPoints] = useState<VitalPoint[]>(data.vitals.hr || []);
  const [bpDataPoints, setBpDataPoints] = useState<{ sys: VitalPoint[], dia: VitalPoint[] }>({
    sys: data.vitals.sysBP || [],
    dia: data.vitals.diaBP || []
  });
  const [spo2DataPoints, setSpo2DataPoints] = useState<VitalPoint[]>(data.vitals.spo2 || []);
  
  // State for BP dual entry (systolic then diastolic)
  const [bpEntryMode, setBpEntryMode] = useState<'sys' | 'dia'>('sys');
  const [pendingSysValue, setPendingSysValue] = useState<{ time: number; value: number } | null>(null);
  
  // State for hover tooltip
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);

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

  // Toggle collapsed state for parent swimlanes
  const toggleSwimlane = (id: string) => {
    setCollapsedSwimlanes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

  // Build active swimlanes with collapsible children
  const buildActiveSwimlanes = (): SwimlaneConfig[] => {
    if (swimlanes) return swimlanes; // Use custom if provided
    
    const lanes: SwimlaneConfig[] = [];
    const medColor = { colorLight: "rgba(220, 252, 231, 0.8)", colorDark: "hsl(150, 45%, 18%)" };
    const ventColor = { colorLight: "rgba(254, 243, 199, 0.8)", colorDark: "hsl(35, 70%, 22%)" };
    
    for (const lane of baseSwimlanes) {
      lanes.push(lane);
      
      // Insert medication children after Medications parent (if not collapsed)
      if (lane.id === "medikamente" && !collapsedSwimlanes.has("medikamente")) {
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

      // Insert ventilation children after Ventilation parent (if not collapsed)
      if (lane.id === "ventilation" && !collapsedSwimlanes.has("ventilation")) {
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

  const activeSwimlanes = useMemo(() => buildActiveSwimlanes(), [collapsedSwimlanes, medications, swimlanes]);

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

  // Track zoom percentages for useMemo
  const [zoomPercent, setZoomPercent] = useState<{ start: number; end: number } | null>(null);

  // Listen for dataZoom changes to sync with sticky header
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleDataZoom = (params: any) => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      
      if (dataZoom) {
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const visibleStart = data.startTime + (start / 100) * fullRange;
        const visibleEnd = data.startTime + (end / 100) * fullRange;
        
        setCurrentZoomStart(visibleStart);
        setCurrentZoomEnd(visibleEnd);
        
        // Track zoom percentages
        setZoomPercent({ start, end });
      }
    };

    chart.on('datazoom', handleDataZoom);
    return () => {
      chart.off('datazoom', handleDataZoom);
    };
  }, []);

  // Track initial zoom state
  const hasSetInitialZoomRef = useRef(false);

  // Handle chart ready - set initial 60-minute zoom (1 hour)
  const handleChartReady = (chart: any) => {
    if (hasSetInitialZoomRef.current) return;

    const currentTime = now || data.endTime;
    const thirtyMinutes = 30 * 60 * 1000;
    const initialStartTime = currentTime - thirtyMinutes;
    const initialEndTime = currentTime + thirtyMinutes;
    
    const startPercent = ((initialStartTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    const endPercent = ((initialEndTime - data.startTime) / (data.endTime - data.startTime)) * 100;
    
    // Set zoom state first so useMemo picks it up
    setZoomPercent({ start: startPercent, end: endPercent });
    
    // Then set in chart
    chart.setOption({
      dataZoom: [{
        start: startPercent,
        end: endPercent,
      }]
    });
    
    hasSetInitialZoomRef.current = true;
  };

  // Update dataZoom xAxisIndex when swimlane structure changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    // Update dataZoom to include all current x-axes without resetting zoom state
    const numGrids = activeSwimlanes.length + 1; // +1 for vitals grid
    const currentOption = chart.getOption() as any;
    const currentDataZoom = currentOption.dataZoom?.[0];
    
    chart.setOption({
      dataZoom: [{
        xAxisIndex: Array.from({ length: numGrids }, (_, i) => i),
        // Preserve current zoom state
        start: currentDataZoom?.start,
        end: currentDataZoom?.end,
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
      const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
      const chartHeight = VITALS_HEIGHT + swimlanesHeight;
      
      try {
        const tenMinutes = 10 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;
        
        // Zone boundaries:
        // Zone 1 (past/non-editable): from data.startTime to (NOW - 10 min)
        // Zone 2 (editable): from (NOW - 10 min) to (NOW + 1 hour)
        // Zone 3 (future/non-editable): from (NOW + 1 hour) to data.endTime
        const editableStartBoundary = currentTime - tenMinutes;
        const editableEndBoundary = currentTime + oneHour;
        
        // Use convertToPixel to get accurate pixel positions based on current zoom
        const startPx = chart.convertToPixel({ xAxisIndex: 0 }, data.startTime);
        const editableStartPx = chart.convertToPixel({ xAxisIndex: 0 }, editableStartBoundary);
        const editableEndPx = chart.convertToPixel({ xAxisIndex: 0 }, editableEndBoundary);
        const endPx = chart.convertToPixel({ xAxisIndex: 0 }, data.endTime);
        
        // Calculate pixel widths for three zones
        const pastNonEditableWidth = Math.max(0, editableStartPx - startPx);
        const editableWidth = Math.max(0, editableEndPx - editableStartPx);
        const futureNonEditableWidth = Math.max(0, endPx - editableEndPx);
        
        // Calculate position for current time indicator (NOW line)
        const nowPx = chart.convertToPixel({ xAxisIndex: 0 }, currentTime);
        
        // Get current graphic elements to preserve vertical lines and labels
        const currentOption = chart.getOption() as any;
        const currentGraphic = currentOption.graphic?.[0]?.elements || [];
        
        // Find and update only the zone/indicator elements, preserve everything else
        const updatedGraphic = currentGraphic.map((el: any) => {
          if (el.id === 'past-non-editable-zone') {
            return {
              ...el,
              left: startPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: pastNonEditableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(100, 100, 100, 0.15)' : 'rgba(200, 200, 200, 0.25)',
              },
            };
          }
          if (el.id === 'editable-zone') {
            return {
              ...el,
              left: editableStartPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: editableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.5)',
              },
            };
          }
          if (el.id === 'future-non-editable-zone') {
            return {
              ...el,
              left: editableEndPx,
              top: VITALS_TOP,
              shape: {
                x: 0,
                y: 0,
                width: futureNonEditableWidth,
                height: chartHeight,
              },
              style: {
                fill: isDark ? 'rgba(100, 100, 100, 0.15)' : 'rgba(200, 200, 200, 0.25)',
              },
            };
          }
          if (el.id === 'now-indicator') {
            return {
              ...el,
              left: nowPx,
              top: VITALS_TOP,
              shape: {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: chartHeight,
              },
              style: {
                stroke: isDark ? '#ef4444' : '#dc2626',
                lineWidth: 2,
              },
            };
          }
          return el; // Preserve all other elements (vertical lines, labels)
        });
        
        // Update with all elements preserved
        chart.setOption({
          graphic: {
            elements: updatedGraphic,
          },
        }, { replaceMerge: ['graphic'] });
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

    // Update zones after chart is ready
    setTimeout(updateZones, 100);
    
    // Update on resize
    const handleResize = () => updateZones();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [chartRef, data, isDark, activeSwimlanes, now, currentZoomStart, currentZoomEnd, currentTime]);

  // Update zoom state when zoom changes
  useEffect(() => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const updateZoomState = () => {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (!dataZoom) return;
      
      const start = dataZoom.start ?? 0;
      const end = dataZoom.end ?? 100;
      const fullRange = data.endTime - data.startTime;
      
      const visibleStart = data.startTime + (start / 100) * fullRange;
      const visibleEnd = data.startTime + (end / 100) * fullRange;
      
      // Update zoom state for interactive layer
      setCurrentZoomStart(visibleStart);
      setCurrentZoomEnd(visibleEnd);
      
      // Calculate adaptive snap interval based on zoom span (finer granularity)
      const timeSpan = visibleEnd - visibleStart;
      const spanMinutes = timeSpan / (60 * 1000);
      
      let snapInterval: number;
      if (spanMinutes <= 10) {
        snapInterval = 1 * 60 * 1000; // 1-minute snap for very fine zoom (5, 10 min spans)
      } else if (spanMinutes <= 30) {
        snapInterval = 1 * 60 * 1000; // 1-minute snap for fine zoom (30 min span)
      } else if (spanMinutes <= 60) {
        snapInterval = 5 * 60 * 1000; // 5-minute snap for medium zoom (50 min span)
      } else if (spanMinutes <= 120) {
        snapInterval = 5 * 60 * 1000; // 5-minute snap for coarse zoom (80, 120 min spans)
      } else if (spanMinutes <= 480) {
        snapInterval = 10 * 60 * 1000; // 10-minute snap for very coarse zoom (240, 480 min spans)
      } else {
        snapInterval = 15 * 60 * 1000; // 15-minute snap for ultra coarse zoom (1200+ min spans)
      }
      
      setCurrentSnapInterval(snapInterval);
    };

    // Update immediately
    setTimeout(updateZoomState, 50);

    // Listen for zoom events
    chart.on('datazoom', updateZoomState);

    return () => {
      chart.off('datazoom', updateZoomState);
    };
  }, [chartRef, data.startTime, data.endTime]);

  const option = useMemo(() => {
    // Layout constants
    const VITALS_TOP = 32; // Space for sticky header (32px)
    const VITALS_HEIGHT = 340;
    const SWIMLANE_START = VITALS_TOP + VITALS_HEIGHT; // 396px
    const GRID_LEFT = 200; // Increased width to accommodate longer header text
    const GRID_RIGHT = 10;

    // Calculate initial zoom and editable zones based on "now"
    const currentTime = now || data.endTime; // Use provided "now" or fall back to endTime
    const fiveMinutes = 5 * 60 * 1000;
    const tenMinutes = 10 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    
    // Initial view: 60-minute window (1 hour) from -30min to +30min around NOW
    const initialStartTime = currentTime - thirtyMinutes;
    const initialEndTime = currentTime + thirtyMinutes;

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
        show: true, // Show vertical grid lines - ECharts auto-calculates optimal intervals
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        },
      },
      minorTick: {
        show: true,
      },
      minorSplitLine: {
        show: true, // Show minor grid lines - ECharts auto-calculates subdivisions
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

    // Series - HR data points with heart symbols
    const series: any[] = [];
    
    // Sort vitals data chronologically to prevent zigzag lines when backfilling
    const sortedHrData = [...hrDataPoints].sort((a, b) => a[0] - b[0]);
    const sortedSysData = [...bpDataPoints.sys].sort((a, b) => a[0] - b[0]);
    const sortedDiaData = [...bpDataPoints.dia].sort((a, b) => a[0] - b[0]);
    const sortedSpo2Data = [...spo2DataPoints].sort((a, b) => a[0] - b[0]);
    
    // Add HR series if there are data points
    if (sortedHrData.length > 0) {
      // Add line connecting HR points (chronologically sorted)
      series.push({
        type: 'line',
        name: 'Heart Rate Line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedHrData,
        lineStyle: {
          color: '#ef4444',
          width: 2,
        },
        symbol: 'none',
        z: 9,
      });
      
      // Add heart symbols
      series.push({
        type: 'scatter',
        name: 'Heart Rate',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedHrData,
        symbol: 'path://M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2 c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z',
        symbolSize: 18,
        itemStyle: {
          color: '#ef4444', // Red color for heart
        },
        z: 10,
      });
    }
    
    // Add BP series if there are data points (chronologically sorted)
    if (sortedSysData.length > 0) {
      series.push({
        type: 'scatter',
        name: 'Systolic BP',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedSysData,
        symbol: 'triangle',
        symbolSize: 12,
        symbolRotate: 0, // Point up for systolic
        itemStyle: {
          color: '#000000', // Black color for BP
        },
        z: 10,
      });
    }
    
    // Add diastolic BP series if there are data points (chronologically sorted)
    if (sortedDiaData.length > 0) {
      series.push({
        type: 'scatter',
        name: 'Diastolic BP',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: sortedDiaData,
        symbol: 'triangle',
        symbolSize: 12,
        symbolRotate: 180, // Point down for diastolic
        itemStyle: {
          color: '#000000', // Black color for BP
        },
        z: 10,
      });
    }
    
    // Add SpO2 series if there are data points (chronologically sorted)
    if (sortedSpo2Data.length > 0) {
      series.push({
        type: 'scatter',
        name: 'SpO2',
        xAxisIndex: 0,
        yAxisIndex: 1, // Use second y-axis (45-105 range)
        data: sortedSpo2Data,
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: {
          color: '#8b5cf6', // Purple color for SpO2
        },
        z: 10,
      });
    }

    // Calculate total height for vertical lines - dynamically based on current swimlanes
    const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
    const chartHeight = VITALS_HEIGHT + swimlanesHeight;
    const timeRange = data.endTime - data.startTime;
    const oneHour = 60 * 60 * 1000;
    
    // Generate manual y-axis labels in the white space
    const yAxisLabels: any[] = [];
    
    // First y-axis (0-220, interval 20) - positioned at x=140px, grid extends -20 to 240 for top and bottom padding
    for (let val = 0; val <= 220; val += 20) {
      const yPercent = ((240 - val) / 260) * 100; // Invert because top is 0, using 260 range (-20 to 240)
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 140,
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
    
    // Second y-axis (50-100, interval 10) - positioned at x=172px, grid extends 45 to 105 for padding
    for (let val = 50; val <= 100; val += 10) {
      const yPercent = ((105 - val) / 60) * 100; // Range is 45-105, so 60 units total
      const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
      yAxisLabels.push({
        type: "text",
        left: 172,
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
    
    // ECharts automatically generates vertical grid lines via splitLine/minorSplitLine in x-axis config
    // No need for custom graphics anymore

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
          id: 'past-non-editable-zone',
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
          id: 'future-non-editable-zone',
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
        // Preserve current zoom state if available
        ...(zoomPercent ? { start: zoomPercent.start, end: zoomPercent.end } : {}),
        throttle: 50,
        zoomLock: true,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        moveOnMouseMove: false,
        filterMode: "none",
      }],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        textStyle: { fontFamily: "Poppins, sans-serif" },
      },
    } as echarts.EChartsOption;
  }, [data, isDark, activeSwimlanes, now, hrDataPoints, bpDataPoints, spo2DataPoints, zoomPercent]);

  // Calculate component height
  const VITALS_HEIGHT = 340;
  const VITALS_TOP_POS = 32; // Position accounting for sticky header (32px)
  const swimlanesHeight = activeSwimlanes.reduce((sum, lane) => sum + lane.height, 0);
  const componentHeight = height ?? (VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight);

  // Zoom levels: time spans for different viewing granularities
  const zoomLevels = [
    5 * 60 * 1000,        // 5 min
    10 * 60 * 1000,       // 10 min
    30 * 60 * 1000,       // 30 min
    50 * 60 * 1000,       // 50 min - DEFAULT
    80 * 60 * 1000,       // 80 min
    120 * 60 * 1000,      // 120 min (2 hours)
    240 * 60 * 1000,      // 240 min (4 hours)
    480 * 60 * 1000,      // 480 min (8 hours)
    1200 * 60 * 1000,     // 1200 min (20 hours)
  ];

  // Find closest zoom level to current span
  const findClosestZoomLevel = (currentSpan: number): number => {
    let closest = zoomLevels[0];
    let minDiff = Math.abs(currentSpan - closest);
    
    for (const level of zoomLevels) {
      const diff = Math.abs(currentSpan - level);
      if (diff < minDiff) {
        minDiff = diff;
        closest = level;
      }
    }
    return zoomLevels.indexOf(closest);
  };

  // Zoom and pan handlers
  const handleZoomIn = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const option = chart.getOption() as any;
      const dataZoom = option.dataZoom?.[0];
      if (dataZoom) {
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step smaller
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.max(0, currentLevelIndex - 1);
        const newSpan = zoomLevels[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + newSpan;
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - newSpan;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
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
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const currentSpan = currentMax - currentMin;
        
        // Find current level and go one step larger
        const currentLevelIndex = findClosestZoomLevel(currentSpan);
        const newLevelIndex = Math.min(zoomLevels.length - 1, currentLevelIndex + 1);
        const newSpan = zoomLevels[newLevelIndex];
        
        const center = (currentMin + currentMax) / 2;
        
        // Constrain to data bounds
        let newStart = center - newSpan / 2;
        let newEnd = center + newSpan / 2;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = Math.min(newStart + newSpan, data.endTime);
        }
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = Math.max(newEnd - newSpan, data.startTime);
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
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
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin - panStep;
        let newEnd = currentMax - panStep;
        
        if (newStart < data.startTime) {
          newStart = data.startTime;
          newEnd = newStart + span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
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
        // Calculate actual values from percentages
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        const fullRange = data.endTime - data.startTime;
        
        const currentMin = data.startTime + (start / 100) * fullRange;
        const currentMax = data.startTime + (end / 100) * fullRange;
        const span = currentMax - currentMin;
        const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
        
        // Constrain to data bounds
        let newStart = currentMin + panStep;
        let newEnd = currentMax + panStep;
        
        if (newEnd > data.endTime) {
          newEnd = data.endTime;
          newStart = newEnd - span;
        }
        
        // Convert to percentages for dataZoom
        const startPercent = ((newStart - data.startTime) / fullRange) * 100;
        const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
        
        chart.dispatchAction({
          type: 'dataZoom',
          start: startPercent,
          end: endPercent,
        });
      }
    }
  };

  const handleResetZoom = () => {
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) {
      const currentTime = now || data.endTime;
      const thirtyMinutes = 30 * 60 * 1000;
      const initialStartTime = currentTime - thirtyMinutes;
      const initialEndTime = currentTime + thirtyMinutes;
      
      // Convert to percentages for dataZoom
      const fullRange = data.endTime - data.startTime;
      const startPercent = ((initialStartTime - data.startTime) / fullRange) * 100;
      const endPercent = ((initialEndTime - data.startTime) / fullRange) * 100;
      
      chart.dispatchAction({
        type: 'dataZoom',
        start: startPercent,
        end: endPercent,
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
  
  // Calculate exact height needed for vertical lines (they start at VITALS_TOP and extend chartHeight down)
  // chartHeight = VITALS_HEIGHT + swimlanesHeight (from the option calculation)
  const backgroundsHeight = VITALS_TOP_POS + VITALS_HEIGHT + swimlanesHeight;
  
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
      
      {/* Swimlane backgrounds - explicit height matching vertical lines extent */}
      <div className="absolute left-0 top-0 right-0 pointer-events-none z-0" style={{ height: `${backgroundsHeight}px` }}>
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
      <div className="absolute left-0 top-0 w-[200px] h-full border-r border-border z-30 bg-background">
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
                  right: '60px',
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
                  right: '28px',
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
            onClick={() => {
              if (activeToolMode === 'bp') {
                setActiveToolMode(null);
                setBpEntryMode('sys');
                setPendingSysValue(null);
              } else {
                setActiveToolMode('bp');
                setBpEntryMode('sys');
                setPendingSysValue(null);
              }
            }}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'bp' 
                ? 'border-black bg-black/20' 
                : 'border-border bg-background hover:border-black hover:bg-black/10'
            }`}
            data-testid="button-vitals-bp"
            title="Blood Pressure (NIBP)"
          >
            <Activity className={`w-5 h-5 transition-colors ${activeToolMode === 'bp' ? 'text-black dark:text-white' : 'hover:text-black dark:hover:text-white'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'hr' ? null : 'hr')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'hr' 
                ? 'border-red-500 bg-red-500/20' 
                : 'border-border bg-background hover:border-red-500 hover:bg-red-500/10'
            }`}
            data-testid="button-vitals-heart"
            title="Heart Rate"
          >
            <Heart className={`w-5 h-5 transition-colors ${activeToolMode === 'hr' ? 'text-red-500' : 'hover:text-red-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(activeToolMode === 'spo2' ? null : 'spo2')}
            className={`p-2 rounded-md border transition-colors flex items-center justify-center shadow-sm ${
              activeToolMode === 'spo2' 
                ? 'border-blue-500 bg-blue-500/20' 
                : 'border-border bg-background hover:border-blue-500 hover:bg-blue-500/10'
            }`}
            data-testid="button-vitals-oxygen"
            title="Oxygenation (SpO2)"
          >
            <Wind className={`w-5 h-5 transition-colors ${activeToolMode === 'spo2' ? 'text-blue-500' : 'hover:text-blue-500'}`} />
          </button>
          <button
            onClick={() => setActiveToolMode(null)}
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
          const isVentParent = lane.id === "ventilation";
          const isMedChild = lane.id.startsWith("medication-");
          const isVentChild = lane.id.startsWith("ventilation-");
          const isDynamicMed = lane.id.startsWith("medication-dynamic-");
          const isChild = isMedChild || isVentChild;
          const isParent = isMedParent || isVentParent;
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
                {isParent && (
                  <button
                    onClick={() => toggleSwimlane(lane.id)}
                    className="p-0.5 rounded hover:bg-background/50 transition-colors"
                    data-testid={`button-toggle-${lane.id}`}
                    title={collapsedSwimlanes.has(lane.id) ? "Expand" : "Collapse"}
                  >
                    {collapsedSwimlanes.has(lane.id) ? (
                      <ChevronRight className="w-4 h-4 text-black dark:text-white" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-black dark:text-white" />
                    )}
                  </button>
                )}
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
          onChartReady={handleChartReady}
          lazyUpdate
        />
      </div>

      {/* Interactive layer for vitals entry - only active when tool mode is selected */}
      {activeToolMode && (
        <div
          className="absolute z-30 cursor-crosshair"
          style={{
            left: '200px',
            right: '10px',
            top: '32px',
            height: '340px',
          }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Use tracked zoom state (updated by dataZoom event listener)
            const visibleStart = currentZoomStart ?? data.startTime;
            const visibleEnd = currentZoomEnd ?? data.endTime;
            const visibleRange = visibleEnd - visibleStart;
            
            // Convert x-position to time
            const xPercent = x / rect.width;
            let time = visibleStart + (xPercent * visibleRange);
            
            // Snap to nearest vertical grid line - use the current snap interval (already calculated)
            console.log('Current snap interval (ms):', currentSnapInterval, 'minutes:', currentSnapInterval / 60000);
            time = Math.round(time / currentSnapInterval) * currentSnapInterval;
            
            // Convert y-position to value based on active tool
            let value: number;
            const yPercent = y / rect.height;
            
            if (activeToolMode === 'hr' || activeToolMode === 'bp') {
              // BP/HR scale: -20 to 240
              const minVal = -20;
              const maxVal = 240;
              value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
            } else if (activeToolMode === 'spo2') {
              // SpO2 scale: 45 to 105
              const minVal = 45;
              const maxVal = 105;
              value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
            } else {
              return; // No active tool mode
            }
            
            // Allow adding data points anywhere in the timeline (no restrictions)
            setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
          }}
          onMouseLeave={() => setHoverInfo(null)}
          onClick={(e) => {
            if (!hoverInfo) return;
            
            // Add data point based on active tool mode
            if (activeToolMode === 'hr') {
              setHrDataPoints(prev => [...prev, [hoverInfo.time, hoverInfo.value]]);
              setHoverInfo(null);
            } else if (activeToolMode === 'bp') {
              // Sequential BP entry: first systolic, then diastolic at same time
              if (bpEntryMode === 'sys') {
                // Save systolic value and switch to diastolic mode
                setPendingSysValue({ time: hoverInfo.time, value: hoverInfo.value });
                setBpEntryMode('dia');
                setHoverInfo(null);
              } else {
                // Save diastolic value with the same time as systolic
                if (pendingSysValue) {
                  setBpDataPoints(prev => ({
                    sys: [...prev.sys, [pendingSysValue.time, pendingSysValue.value]],
                    dia: [...prev.dia, [pendingSysValue.time, hoverInfo.value]]
                  }));
                }
                // Reset to systolic mode
                setPendingSysValue(null);
                setBpEntryMode('sys');
                setHoverInfo(null);
              }
            } else if (activeToolMode === 'spo2') {
              setSpo2DataPoints(prev => [...prev, [hoverInfo.time, hoverInfo.value]]);
              setHoverInfo(null);
            }
          }}
        />
      )}

      {/* Tooltip for vitals entry */}
      {hoverInfo && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold">
            {activeToolMode === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'bp' && `${bpEntryMode === 'sys' ? 'Systolic' : 'Diastolic'}: ${hoverInfo.value}`}
            {activeToolMode === 'spo2' && `SpO2: ${hoverInfo.value}%`}
          </div>
          {activeToolMode === 'bp' && pendingSysValue && bpEntryMode === 'dia' && (
            <div className="text-xs text-muted-foreground">
              Systolic: {pendingSysValue.value} (already set)
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {new Date(hoverInfo.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}

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
