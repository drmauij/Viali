import { useState, useEffect, useRef } from 'react';
import { VITAL_ICON_PATHS } from '@/lib/vitalIconPaths';
import { createLucideIconSeries } from '@/utils/chartUtils';
import { useTimelineContext } from '../TimelineContext';
import type { VitalPoint } from '@/hooks/useVitalsState';

/**
 * VitalsSwimlane Component
 * 
 * Renders the interactive overlay for the vitals chart (HR, BP, SpO2).
 * Handles mouse/touch interactions for adding and editing vital sign data points.
 * 
 * Also exports utility functions for generating ECharts configuration:
 * - generateVitalsYAxes: Y-axis configuration for BP/HR and SpO2
 * - generateVitalsSeries: Chart series for HR, BP, SpO2 lines and symbols
 * - generateVitalsYAxisLabels: Graphics for manual y-axis labels
 */

const TEN_MINUTES = 10 * 60 * 1000;

interface VitalsSwimlaneProps {
  chartRef: React.RefObject<any>;
  VITALS_TOP: number;
  VITALS_HEIGHT: number;
  isTouchDevice: boolean;
  onBulkVitalsOpen?: (time: number) => void;
  onVitalPointEdit?: (type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2', index: number, time: number, value: number) => void;
}

export function VitalsSwimlane({
  chartRef,
  VITALS_TOP,
  VITALS_HEIGHT,
  isTouchDevice,
  onBulkVitalsOpen,
  onVitalPointEdit,
}: VitalsSwimlaneProps) {
  const {
    vitalsState,
    currentTime,
    chartInitTime,
    currentZoomStart,
    currentZoomEnd,
    currentVitalsSnapInterval,
    isDark,
    activeToolMode,
    addVitalPointMutation,
    addBPPointMutation,
    data,
    blendSequenceStep,
    setBlendSequenceStep,
    bpEntryMode,
    setBpEntryMode,
    pendingSysValue,
    setPendingSysValue,
    isProcessingClick,
    setIsProcessingClick,
  } = useTimelineContext();

  const {
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    setBpDataPoints,
  } = vitalsState;

  // State for hover tooltip (remains local to this component)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
  const [lastAction, setLastAction] = useState<{ type: 'hr' | 'bp' | 'spo2'; data?: VitalPoint; bpData?: { sys: VitalPoint; dia: VitalPoint } } | null>(null);

  // State for edit mode - dragging and repositioning existing vitals
  const [selectedPoint, setSelectedPoint] = useState<{
    type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2';
    index: number;
    originalTime: number;
    originalValue: number;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ time: number; value: number } | null>(null);

  // Refs for edit mode
  const selectedPointRef = useRef(selectedPoint);
  const dragPositionRef = useRef(dragPosition);

  // Keep refs in sync with state
  useEffect(() => { selectedPointRef.current = selectedPoint; }, [selectedPoint]);
  useEffect(() => { dragPositionRef.current = dragPosition; }, [dragPosition]);

  /**
   * Handle mouse move for hover preview
   */
  const handleVitalsMouseMove = (e: React.MouseEvent) => {
    if (isTouchDevice) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;

    const xPercent = x / rect.width;
    let time = visibleStart + (xPercent * visibleRange);
    time = Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;

    const editableStartBoundary = chartInitTime - TEN_MINUTES;
    const editableEndBoundary = currentTime + TEN_MINUTES;
    const isEditable = time >= editableStartBoundary && time <= editableEndBoundary;

    let value: number;
    const yPercent = y / rect.height;

    if (activeToolMode === 'edit' && selectedPoint) {
      const isSpO2 = selectedPoint.type === 'spo2';
      if (isSpO2) {
        const minVal = 45;
        const maxVal = 105;
        const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
        value = Math.min(rawValue, 100);
      } else {
        const minVal = 0;
        const maxVal = 240;
        value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      }
      const fixedTime = selectedPoint.originalTime;
      setDragPosition({ time: fixedTime, value });
      setHoverInfo({ x: e.clientX, y: e.clientY, value, time: fixedTime });
    } else if (isEditable && (activeToolMode === 'hr' || activeToolMode === 'bp' || (activeToolMode === 'blend' && (blendSequenceStep === 'sys' || blendSequenceStep === 'dia' || blendSequenceStep === 'hr')))) {
      const minVal = 0;
      const maxVal = 240;
      value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
    } else if (isEditable && (activeToolMode === 'spo2' || (activeToolMode === 'blend' && blendSequenceStep === 'spo2'))) {
      const minVal = 45;
      const maxVal = 105;
      const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      value = Math.min(rawValue, 100);
      setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
    } else {
      setHoverInfo(null);
    }
  };

  /**
   * Find if clicking on an existing vital point
   * Returns the point that is closest vertically to the click
   */
  const findVitalPointAtClick = (clickTime: number, clickY: number, rect: DOMRect) => {
    const TIME_THRESHOLD = 30000; // 30 seconds tolerance
    const PIXEL_THRESHOLD = 20; // 20 pixels vertical tolerance
    
    const yPercent = clickY / rect.height;
    let closestPoint: { type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2'; index: number; time: number; value: number } | null = null;
    let closestDistance = PIXEL_THRESHOLD;
    
    // Check HR points
    for (let i = 0; i < hrDataPoints.length; i++) {
      const [time, value] = hrDataPoints[i];
      if (Math.abs(time - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (value / 240); // HR scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'hr' as const, index: i, time, value };
        }
      }
    }
    
    // Check systolic BP points
    for (let i = 0; i < bpDataPoints.sys.length; i++) {
      const [time, value] = bpDataPoints.sys[i];
      if (Math.abs(time - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (value / 240); // BP scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'bp-sys' as const, index: i, time, value };
        }
      }
    }
    
    // Check diastolic BP points
    for (let i = 0; i < bpDataPoints.dia.length; i++) {
      const [time, value] = bpDataPoints.dia[i];
      if (Math.abs(time - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (value / 240); // BP scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'bp-dia' as const, index: i, time, value };
        }
      }
    }
    
    // Check SpO2 points (scale 45-105)
    for (let i = 0; i < spo2DataPoints.length; i++) {
      const [time, value] = spo2DataPoints[i];
      if (Math.abs(time - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - ((value - 45) / (105 - 45)); // SpO2 scale 45-105
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'spo2' as const, index: i, time, value };
        }
      }
    }
    
    return closestPoint;
  };

  /**
   * Handle click to add vital point or edit existing
   */
  const handleVitalsClick = (e: React.MouseEvent) => {
    if (isProcessingClick || activeToolMode === 'edit') {
      return;
    }

    setIsProcessingClick(true);

    // Calculate click time from position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    
    const xPercent = x / rect.width;
    // Keep raw click time for hit-testing existing points
    const rawClickTime = visibleStart + (xPercent * visibleRange);
    // Snap time only for creating new entries
    const snappedClickTime = Math.round(rawClickTime / currentVitalsSnapInterval) * currentVitalsSnapInterval;

    // Validate that click time is within editable boundaries
    const editableStartBoundary = currentTime - TEN_MINUTES;
    const editableEndBoundary = currentTime + TEN_MINUTES;

    if (rawClickTime < editableStartBoundary || rawClickTime > editableEndBoundary) {
      setIsProcessingClick(false);
      return;
    }

    // If no tool mode is active, check if clicking on existing point
    if (!activeToolMode) {
      const existingPoint = findVitalPointAtClick(rawClickTime, y, rect);
      
      if (existingPoint) {
        // Clicking on existing point → Open single edit dialog
        setIsProcessingClick(false);
        onVitalPointEdit?.(existingPoint.type, existingPoint.index, existingPoint.time, existingPoint.value);
        return;
      } else {
        // Clicking on empty space → Open bulk entry dialog
        setIsProcessingClick(false);
        onVitalPointEdit?.(null, 0, snappedClickTime, 0);
        return;
      }
    }

    // On touch devices, calculate value directly from click position
    let clickInfo = hoverInfo;
    if (isTouchDevice) {
      const y = e.clientY - rect.top;
      const yPercent = y / rect.height;
      let value: number;

      if (activeToolMode === 'hr' || activeToolMode === 'bp' || (activeToolMode === 'blend' && (blendSequenceStep === 'sys' || blendSequenceStep === 'dia' || blendSequenceStep === 'hr'))) {
        const minVal = 0;
        const maxVal = 240;
        value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      } else if (activeToolMode === 'spo2' || (activeToolMode === 'blend' && blendSequenceStep === 'spo2')) {
        const minVal = 45;
        const maxVal = 105;
        const rawValue = Math.round(maxVal - (yPercent * (maxVal - minVal)));
        value = Math.min(rawValue, 100);
      } else {
        setIsProcessingClick(false);
        return;
      }

      clickInfo = { x: e.clientX, y: e.clientY, value, time: clickTime };
    }

    if (!clickInfo) {
      setIsProcessingClick(false);
      return;
    }

    // Add data point based on active tool mode
    if (activeToolMode === 'hr') {
      addVitalPointMutation.mutate({
        vitalType: 'hr',
        timestamp: new Date(clickInfo.time).toISOString(),
        value: clickInfo.value
      });
      setLastAction({ type: 'hr', data: [clickInfo.time, clickInfo.value] });
      setHoverInfo(null);
      setIsProcessingClick(false);
    } else if (activeToolMode === 'bp') {
      if (bpEntryMode === 'sys') {
        const sysPoint: VitalPoint = [clickInfo.time, clickInfo.value];
        setBpDataPoints(prev => ({
          ...prev,
          sys: [...prev.sys, sysPoint]
        }));
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBpEntryMode('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else {
        const diaPoint: VitalPoint = [pendingSysValue?.time ?? clickInfo.time, clickInfo.value];
        setBpDataPoints(prev => ({
          ...prev,
          dia: [...prev.dia, diaPoint]
        }));

        if (pendingSysValue) {
          addBPPointMutation.mutate({
            timestamp: new Date(pendingSysValue.time).toISOString(),
            sys: pendingSysValue.value,
            dia: clickInfo.value
          });
        }

        setPendingSysValue(null);
        setBpEntryMode('sys');
        setHoverInfo(null);
        setIsProcessingClick(false);
      }
    } else if (activeToolMode === 'spo2') {
      addVitalPointMutation.mutate({
        vitalType: 'spo2',
        timestamp: new Date(clickInfo.time).toISOString(),
        value: clickInfo.value
      });
      setLastAction({ type: 'spo2', data: [clickInfo.time, clickInfo.value] });
      setHoverInfo(null);
      setIsProcessingClick(false);
    } else if (activeToolMode === 'blend') {
      if (blendSequenceStep === 'sys') {
        const sysPoint: VitalPoint = [clickInfo.time, clickInfo.value];
        setBpDataPoints(prev => ({
          ...prev,
          sys: [...prev.sys, sysPoint]
        }));
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBlendSequenceStep('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else if (blendSequenceStep === 'dia') {
        const diaPoint: VitalPoint = [pendingSysValue?.time ?? clickInfo.time, clickInfo.value];
        setBpDataPoints(prev => ({
          ...prev,
          dia: [...prev.dia, diaPoint]
        }));

        if (pendingSysValue) {
          addBPPointMutation.mutate({
            timestamp: new Date(pendingSysValue.time).toISOString(),
            sys: pendingSysValue.value,
            dia: clickInfo.value
          });
        }

        setBlendSequenceStep('hr');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else if (blendSequenceStep === 'hr') {
        addVitalPointMutation.mutate({
          vitalType: 'hr',
          timestamp: new Date(clickInfo.time).toISOString(),
          value: clickInfo.value
        });
        setBlendSequenceStep('spo2');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else if (blendSequenceStep === 'spo2') {
        addVitalPointMutation.mutate({
          vitalType: 'spo2',
          timestamp: new Date(clickInfo.time).toISOString(),
          value: clickInfo.value
        });
        setBlendSequenceStep('sys');
        setHoverInfo(null);
        setIsProcessingClick(false);
      }
    }
  };

  // Determine cursor style based on tool mode
  const getCursorStyle = () => {
    if (activeToolMode === 'edit') {
      return selectedPoint ? 'cursor-grabbing' : 'cursor-pointer';
    } else if (activeToolMode) {
      return 'cursor-crosshair';
    } else {
      return 'cursor-pointer'; // No tool mode - bulk entry
    }
  };

  return (
    <>
      {/* Interactive layer for vitals entry */}
      <div
        data-vitals-overlay="true"
        className={`absolute z-30 ${getCursorStyle()}`}
        style={{
          left: '200px',
          right: '10px',
          top: `${VITALS_TOP}px`,
          height: `${VITALS_HEIGHT}px`,
        }}
        onMouseMove={handleVitalsMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        onClick={handleVitalsClick}
        data-testid="vitals-interactive-overlay"
      />

      {/* Hover tooltip */}
      {hoverInfo && !isTouchDevice && (
        <div
          className="fixed z-50 pointer-events-none bg-background border border-border rounded-md shadow-lg px-3 py-2"
          style={{
            left: hoverInfo.x + 10,
            top: hoverInfo.y - 40,
          }}
        >
          <div className="text-sm font-semibold text-primary">
            {activeToolMode === 'edit' && selectedPoint && (
              <>
                {selectedPoint.type === 'hr' && `Dragging HR: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-sys' && `Dragging Systolic: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-dia' && `Dragging Diastolic: ${hoverInfo.value}`}
                {selectedPoint.type === 'spo2' && `Dragging SpO2: ${hoverInfo.value}%`}
              </>
            )}
            {activeToolMode === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'bp' && `${bpEntryMode === 'sys' ? 'Systolic' : 'Diastolic'}: ${hoverInfo.value}`}
            {activeToolMode === 'spo2' && `SpO2: ${hoverInfo.value}%`}
            {activeToolMode === 'blend' && blendSequenceStep === 'sys' && `Systolic: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'dia' && `Diastolic: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'hr' && `HR: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'spo2' && `SpO2: ${hoverInfo.value}%`}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Utility function: Generate vitals Y-axes configuration for ECharts
 */
export function generateVitalsYAxes(isDark: boolean) {
  return [
    // First y-axis (BP/HR: 0 to 240 range)
    {
      type: "value" as const,
      gridIndex: 0,
      min: 0,
      max: 240,
      interval: 20,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: {
          color: isDark ? "#444444" : "#d1d5db",
          width: 1,
          type: "solid" as const,
        }
      },
    },
    // Second y-axis (SpO2: 45-105 range)
    {
      type: "value" as const,
      gridIndex: 0,
      min: 45,
      max: 105,
      interval: 10,
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
  ];
}

/**
 * Utility function: Generate vitals chart series for ECharts
 */
export function generateVitalsSeries(
  hrDataPoints: VitalPoint[],
  bpDataPoints: { sys: VitalPoint[]; dia: VitalPoint[] },
  spo2DataPoints: VitalPoint[],
  isDark: boolean
) {
  const series: any[] = [];

  // Sort vitals data chronologically
  const sortedHrData = [...hrDataPoints].sort((a, b) => a[0] - b[0]);
  const sortedSysData = [...bpDataPoints.sys].sort((a, b) => a[0] - b[0]);
  const sortedDiaData = [...bpDataPoints.dia].sort((a, b) => a[0] - b[0]);
  const sortedSpo2Data = [...spo2DataPoints].sort((a, b) => a[0] - b[0]);

  // Add HR series
  if (sortedHrData.length > 0) {
    series.push({
      type: 'line',
      name: 'Heart Rate Line',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: sortedHrData,
      lineStyle: { color: '#ef4444', width: 2 },
      symbol: 'none',
      z: 15,
    });

    const hrIconSeries: any = createLucideIconSeries(
      'Heart Rate',
      sortedHrData,
      VITAL_ICON_PATHS.heart.path,
      '#ef4444',
      0,
      16,
      100
    );
    hrIconSeries.id = 'hr-icons-main';
    series.push(hrIconSeries);
  }

  // Add BP series
  if (sortedSysData.length > 0 && sortedDiaData.length > 0) {
    series.push({
      type: 'line',
      name: 'Diastolic BP Base',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: sortedDiaData,
      symbol: 'none',
      lineStyle: { color: isDark ? '#ffffff' : '#000000', width: 1, opacity: 0.3 },
      stack: 'bp',
      z: 7,
    });

    const diffData = sortedSysData.map((sysPoint, idx) => {
      const diaPoint = sortedDiaData[idx];
      if (diaPoint && sysPoint[0] === diaPoint[0]) {
        return [sysPoint[0], sysPoint[1] - diaPoint[1]];
      }
      return null;
    }).filter(p => p !== null);

    series.push({
      type: 'line',
      name: 'BP Range Area',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: diffData,
      symbol: 'none',
      lineStyle: { color: isDark ? '#ffffff' : '#000000', width: 1, opacity: 0.3 },
      stack: 'bp',
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: isDark ? [
            { offset: 0, color: 'rgba(255, 255, 255, 0.15)' },
            { offset: 1, color: 'rgba(255, 255, 255, 0.08)' }
          ] : [
            { offset: 0, color: 'rgba(0, 0, 0, 0.15)' },
            { offset: 1, color: 'rgba(0, 0, 0, 0.08)' }
          ]
        }
      },
      z: 8,
    });
  }

  if (sortedSysData.length > 0) {
    series.push(
      createLucideIconSeries(
        'Systolic BP',
        sortedSysData,
        VITAL_ICON_PATHS.chevronDown.path,
        isDark ? '#e5e5e5' : '#000000',
        0,
        16,
        30
      )
    );
  }

  if (sortedDiaData.length > 0) {
    series.push(
      createLucideIconSeries(
        'Diastolic BP',
        sortedDiaData,
        VITAL_ICON_PATHS.chevronUp.path,
        isDark ? '#e5e5e5' : '#000000',
        0,
        16,
        30
      )
    );
  }

  // Add SpO2 series
  if (sortedSpo2Data.length > 0) {
    series.push({
      type: 'line',
      name: 'SpO2 Line',
      xAxisIndex: 0,
      yAxisIndex: 1,
      data: sortedSpo2Data,
      symbol: 'none',
      lineStyle: { color: '#8b5cf6', width: 1.5 },
      z: 9,
    });

    series.push(
      createLucideIconSeries(
        'SpO2',
        sortedSpo2Data,
        '',
        '#8b5cf6',
        1,
        16,
        30,
        true
      )
    );
  }

  return series;
}

/**
 * Utility function: Generate y-axis label graphics for manual rendering
 */
export function generateVitalsYAxisLabels(VITALS_TOP: number, VITALS_HEIGHT: number, isDark: boolean) {
  const yAxisLabels: any[] = [];

  // First y-axis (20-220, interval 20)
  for (let val = 20; val <= 220; val += 20) {
    const yPercent = ((240 - val) / 240) * 100;
    const yPos = VITALS_TOP + (yPercent / 100) * VITALS_HEIGHT;
    yAxisLabels.push({
      type: "text",
      left: 140,
      top: yPos - 6,
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

  // Second y-axis (50-100, interval 10)
  for (let val = 50; val <= 100; val += 10) {
    const yPercent = ((105 - val) / 60) * 100;
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

  return yAxisLabels;
}
