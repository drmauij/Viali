import { useState, useEffect, useRef } from 'react';
import { useTranslation } from "react-i18next";
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

interface VitalsSwimlaneProps {
  chartRef: React.RefObject<any>;
  VITALS_TOP: number;
  VITALS_HEIGHT: number;
  isTouchDevice: boolean;
  onBulkVitalsOpen?: (time: number) => void;
  onVitalPointEdit?: (type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2', id: string, time: number, value: number) => void;
}

export function VitalsSwimlane({
  chartRef,
  VITALS_TOP,
  VITALS_HEIGHT,
  isTouchDevice,
  onBulkVitalsOpen,
  onVitalPointEdit,
}: VitalsSwimlaneProps) {
  const { t } = useTranslation();
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
    updateVitalPointMutation,
    updateBPPointMutation,
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
    hrRecords,
    bpRecords,
    spo2Records,
    hrDataPoints,
    bpDataPoints,
    spo2DataPoints,
    updateHrPoint,
    updateBPPoint,
    updateSpo2Point,
    addBPPoint,
    setBpRecords,
  } = vitalsState;

  // State for hover tooltip (remains local to this component)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; value: number; time: number } | null>(null);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
  const [lastAction, setLastAction] = useState<{ type: 'hr' | 'bp' | 'spo2'; data?: VitalPoint; bpData?: { sys: VitalPoint; dia: VitalPoint } } | null>(null);

  // State for temporary BP point during entry (shows systolic immediately)
  const [tempBpPointId, setTempBpPointId] = useState<string | null>(null);

  // State for edit mode - dragging and repositioning existing vitals with ID
  const [selectedPoint, setSelectedPoint] = useState<{
    type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2';
    id: string;
    originalTime: number;
    originalValue: number;
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ time: number; value: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false); // NEW: Track if currently dragging

  // Refs for edit mode
  const selectedPointRef = useRef(selectedPoint);
  const dragPositionRef = useRef(dragPosition);
  
  // Ref to track touch start position and prevent synthesized click from firing
  const touchStartRef = useRef<{ x: number; y: number; time: number; handled: boolean } | null>(null);

  // Keep refs in sync with state
  useEffect(() => { selectedPointRef.current = selectedPoint; }, [selectedPoint]);
  useEffect(() => { dragPositionRef.current = dragPosition; }, [dragPosition]);

  // Clean up temporary BP point when tool mode changes or BP entry is cancelled
  useEffect(() => {
    const shouldCleanup = tempBpPointId && (
      // BP mode cancelled or switched back to sys
      (activeToolMode === 'bp' && bpEntryMode === 'sys') ||
      // Blend mode cancelled or switched away from dia
      (activeToolMode === 'blend' && blendSequenceStep !== 'dia') ||
      // Switched to different tool mode
      (activeToolMode !== 'bp' && activeToolMode !== 'blend')
    );

    if (shouldCleanup) {
      // Remove temp point from local state (temp points have IDs starting with 'temp-')
      setBpRecords(prev => prev.filter(r => r.id !== tempBpPointId));
      setTempBpPointId(null);
      setPendingSysValue(null);
    }
  }, [activeToolMode, bpEntryMode, blendSequenceStep, tempBpPointId, setBpRecords, setPendingSysValue]);

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

    let value: number;
    const yPercent = y / rect.height;

    if (activeToolMode === 'edit' && selectedPoint && isDragging) {
      const isSpO2 = selectedPoint.type === 'spo2';
      const isBP = selectedPoint.type === 'bp-sys' || selectedPoint.type === 'bp-dia';
      
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
      
      // For BP points, only allow value dragging (time fixed) to maintain pairing
      // For HR/SpO2, allow full repositioning (both time and value)
      const dragTime = isBP ? selectedPoint.originalTime : Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
      setDragPosition({ time: dragTime, value });
      setHoverInfo({ x: e.clientX, y: e.clientY, value, time: dragTime });
    } else if (activeToolMode === 'hr' || activeToolMode === 'bp' || (activeToolMode === 'blend' && (blendSequenceStep === 'sys' || blendSequenceStep === 'dia' || blendSequenceStep === 'hr'))) {
      const minVal = 0;
      const maxVal = 240;
      value = Math.round(maxVal - (yPercent * (maxVal - minVal)));
      setHoverInfo({ x: e.clientX, y: e.clientY, value, time });
    } else if (activeToolMode === 'spo2' || (activeToolMode === 'blend' && blendSequenceStep === 'spo2')) {
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
   * Returns the point that is closest vertically to the click (with ID)
   */
  const findVitalPointAtClick = (clickTime: number, clickY: number, rect: DOMRect) => {
    const TIME_THRESHOLD = 30000; // 30 seconds tolerance
    const PIXEL_THRESHOLD = 20; // 20 pixels vertical tolerance
    
    const yPercent = clickY / rect.height;
    let closestPoint: { type: 'hr' | 'bp-sys' | 'bp-dia' | 'spo2'; id: string; time: number; value: number } | null = null;
    let closestDistance = PIXEL_THRESHOLD;
    
    // Check HR points - use records to get IDs
    for (let i = 0; i < hrRecords.length; i++) {
      const record = hrRecords[i];
      if (Math.abs(record.timestamp - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (record.value / 240); // HR scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'hr' as const, id: record.id, time: record.timestamp, value: record.value };
        }
      }
    }
    
    // Check systolic BP points - use records to get IDs
    for (let i = 0; i < bpRecords.length; i++) {
      const record = bpRecords[i];
      if (Math.abs(record.timestamp - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (record.sys / 240); // BP scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'bp-sys' as const, id: record.id, time: record.timestamp, value: record.sys };
        }
      }
    }
    
    // Check diastolic BP points - use same records (skip temp points with dia: 0)
    for (let i = 0; i < bpRecords.length; i++) {
      const record = bpRecords[i];
      // Skip temporary BP records (those with dia: 0)
      if (record.dia > 0 && Math.abs(record.timestamp - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - (record.dia / 240); // BP scale 0-240
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'bp-dia' as const, id: record.id, time: record.timestamp, value: record.dia };
        }
      }
    }
    
    // Check SpO2 points (scale 45-105) - use records to get IDs
    for (let i = 0; i < spo2Records.length; i++) {
      const record = spo2Records[i];
      if (Math.abs(record.timestamp - clickTime) <= TIME_THRESHOLD) {
        const expectedYPercent = 1 - ((record.value - 45) / (105 - 45)); // SpO2 scale 45-105
        const pixelDiff = Math.abs((yPercent - expectedYPercent) * rect.height);
        if (pixelDiff < closestDistance) {
          closestDistance = pixelDiff;
          closestPoint = { type: 'spo2' as const, id: record.id, time: record.timestamp, value: record.value };
        }
      }
    }
    
    return closestPoint;
  };

  /**
   * Handle mouse/touch down to start dragging in edit mode
   */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeToolMode !== 'edit') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    
    const xPercent = x / rect.width;
    const rawClickTime = visibleStart + (xPercent * visibleRange);

    // Try to find a point at this location
    const pointToSelect = findVitalPointAtClick(rawClickTime, y, rect);
    if (pointToSelect) {
      setSelectedPoint({
        type: pointToSelect.type,
        id: pointToSelect.id,
        originalTime: pointToSelect.time,
        originalValue: pointToSelect.value
      });
      setDragPosition({ time: pointToSelect.time, value: pointToSelect.value });
      setIsDragging(true);
    }
  };

  /**
   * Handle mouse up to finalize drag in edit mode
   */
  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging || !selectedPoint) return;

    // Save the dragged point if position changed
    if (dragPosition && (dragPosition.value !== selectedPoint.originalValue || dragPosition.time !== selectedPoint.originalTime)) {
      // Update local state immediately for responsive UI + persist to backend
      if (selectedPoint.type === 'hr') {
        updateHrPoint(selectedPoint.id, { timestamp: dragPosition.time, value: dragPosition.value });
        updateVitalPointMutation.mutate({
          pointId: selectedPoint.id,
          timestamp: new Date(dragPosition.time).toISOString(),
          value: dragPosition.value
        });
      } else if (selectedPoint.type === 'bp-sys') {
        // For BP points, only value changes (time fixed) to maintain pairing
        const bpRecord = bpRecords.find(r => r.id === selectedPoint.id);
        if (bpRecord) {
          updateBPPoint(selectedPoint.id, { sys: dragPosition.value });
          updateBPPointMutation.mutate({
            pointId: selectedPoint.id,
            timestamp: new Date(selectedPoint.originalTime).toISOString(),
            sys: dragPosition.value,
            dia: bpRecord.dia
          });
        }
      } else if (selectedPoint.type === 'bp-dia') {
        // For BP points, only value changes (time fixed) to maintain pairing
        const bpRecord = bpRecords.find(r => r.id === selectedPoint.id);
        if (bpRecord) {
          updateBPPoint(selectedPoint.id, { dia: dragPosition.value });
          updateBPPointMutation.mutate({
            pointId: selectedPoint.id,
            timestamp: new Date(selectedPoint.originalTime).toISOString(),
            sys: bpRecord.sys,
            dia: dragPosition.value
          });
        }
      } else if (selectedPoint.type === 'spo2') {
        updateSpo2Point(selectedPoint.id, { timestamp: dragPosition.time, value: dragPosition.value });
        updateVitalPointMutation.mutate({
          pointId: selectedPoint.id,
          timestamp: new Date(dragPosition.time).toISOString(),
          value: dragPosition.value
        });
      }
    }
    
    // Reset drag state
    setSelectedPoint(null);
    setDragPosition(null);
    setIsDragging(false);
  };

  /**
   * Handle touch start to initiate dragging on touch devices
   * For non-edit modes, captures touch position to use in touchend for vitals entry
   */
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return; // Only handle single-touch

    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    // Always capture touch start position for later use in touchend
    touchStartRef.current = { x, y, time: Date.now(), handled: false };
    
    // Prevent default for all tool modes to stop scrolling and block synthesized click
    // This is critical for accurate touch position handling
    if (activeToolMode) {
      e.preventDefault();
    }
    
    // For edit mode, also handle point selection for dragging
    if (activeToolMode === 'edit') {
      const visibleStart = currentZoomStart ?? data.startTime;
      const visibleEnd = currentZoomEnd ?? data.endTime;
      const visibleRange = visibleEnd - visibleStart;
      
      const xPercent = x / rect.width;
      const rawClickTime = visibleStart + (xPercent * visibleRange);

      // Try to find a point at this location
      const pointToSelect = findVitalPointAtClick(rawClickTime, y, rect);
      if (pointToSelect) {
        setSelectedPoint({
          type: pointToSelect.type,
          id: pointToSelect.id,
          originalTime: pointToSelect.time,
          originalValue: pointToSelect.value
        });
        setDragPosition({ time: pointToSelect.time, value: pointToSelect.value });
        setIsDragging(true);
      }
    }
  };

  /**
   * Handle touch move for dragging on touch devices
   * Also prevents scrolling during touch interactions when a tool mode is active
   */
  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent scrolling when a tool mode is active (not just during dragging)
    if (activeToolMode && e.touches.length === 1) {
      e.preventDefault();
    }
    
    // Only process drag movement in edit mode
    if (!isDragging || !selectedPoint || e.touches.length !== 1) return;

    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;

    const xPercent = x / rect.width;
    let time = visibleStart + (xPercent * visibleRange);

    const yPercent = y / rect.height;
    const isSpO2 = selectedPoint.type === 'spo2';
    const isBP = selectedPoint.type === 'bp-sys' || selectedPoint.type === 'bp-dia';
    
    let value: number;
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
    
    // For BP points, only allow value dragging (time fixed) to maintain pairing
    // For HR/SpO2, allow full repositioning (both time and value)
    const dragTime = isBP ? selectedPoint.originalTime : Math.round(time / currentVitalsSnapInterval) * currentVitalsSnapInterval;
    setDragPosition({ time: dragTime, value });
  };

  /**
   * Handle touch end to finalize drag on touch devices
   * For non-edit modes, handles vitals entry directly using touch position
   */
  const handleTouchEnd = (e: React.TouchEvent) => {
    // For edit mode dragging
    if (isDragging && selectedPoint) {
      e.preventDefault();

      // Save the dragged point if position changed
      if (dragPosition && (dragPosition.value !== selectedPoint.originalValue || dragPosition.time !== selectedPoint.originalTime)) {
        // Update local state immediately for responsive UI + persist to backend
        if (selectedPoint.type === 'hr') {
          updateHrPoint(selectedPoint.id, { timestamp: dragPosition.time, value: dragPosition.value });
          updateVitalPointMutation.mutate({
            pointId: selectedPoint.id,
            timestamp: new Date(dragPosition.time).toISOString(),
            value: dragPosition.value
          });
        } else if (selectedPoint.type === 'bp-sys') {
          // For BP points, only value changes (time fixed) to maintain pairing
          const bpRecord = bpRecords.find(r => r.id === selectedPoint.id);
          if (bpRecord) {
            updateBPPoint(selectedPoint.id, { sys: dragPosition.value });
            updateBPPointMutation.mutate({
              pointId: selectedPoint.id,
              timestamp: new Date(selectedPoint.originalTime).toISOString(),
              sys: dragPosition.value,
              dia: bpRecord.dia
            });
          }
        } else if (selectedPoint.type === 'bp-dia') {
          // For BP points, only value changes (time fixed) to maintain pairing
          const bpRecord = bpRecords.find(r => r.id === selectedPoint.id);
          if (bpRecord) {
            updateBPPoint(selectedPoint.id, { dia: dragPosition.value });
            updateBPPointMutation.mutate({
              pointId: selectedPoint.id,
              timestamp: new Date(selectedPoint.originalTime).toISOString(),
              sys: bpRecord.sys,
              dia: dragPosition.value
            });
          }
        } else if (selectedPoint.type === 'spo2') {
          updateSpo2Point(selectedPoint.id, { timestamp: dragPosition.time, value: dragPosition.value });
          updateVitalPointMutation.mutate({
            pointId: selectedPoint.id,
            timestamp: new Date(dragPosition.time).toISOString(),
            value: dragPosition.value
          });
        }
      }
      
      // Reset drag state
      setSelectedPoint(null);
      setDragPosition(null);
      setIsDragging(false);
      touchStartRef.current = null;
      return;
    }
    
    // For non-edit modes: handle vitals entry directly from touch
    // This replaces the synthesized click event for more accurate positioning
    if (!touchStartRef.current || touchStartRef.current.handled) {
      touchStartRef.current = null;
      return;
    }
    
    // Skip edit mode (already handled above) and no-tool mode (will use click for bulk entry)
    if (activeToolMode === 'edit' || !activeToolMode) {
      touchStartRef.current = null;
      return;
    }
    
    // Prevent default to block the synthesized click event
    e.preventDefault();
    
    // Mark as handled to prevent the synthesized click from also firing
    touchStartRef.current.handled = true;
    
    // Use the touch end position (changedTouches) for more accurate placement
    const touch = e.changedTouches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }
    
    // Check if already processing
    if (isProcessingClick) {
      touchStartRef.current = null;
      return;
    }
    
    setIsProcessingClick(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    const visibleStart = currentZoomStart ?? data.startTime;
    const visibleEnd = currentZoomEnd ?? data.endTime;
    const visibleRange = visibleEnd - visibleStart;
    
    const xPercent = x / rect.width;
    const snappedClickTime = Math.round((visibleStart + (xPercent * visibleRange)) / currentVitalsSnapInterval) * currentVitalsSnapInterval;
    
    // Calculate value from touch position
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
      touchStartRef.current = null;
      return;
    }
    
    const clickInfo = { x: touch.clientX, y: touch.clientY, value, time: snappedClickTime };
    
    // Process based on active tool mode (same logic as handleVitalsClick)
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
        const tempId = `temp-bp-${clickInfo.time}`;
        addBPPoint({
          id: tempId,
          timestamp: clickInfo.time,
          sys: clickInfo.value,
          dia: 0,
        });
        setTempBpPointId(tempId);
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBpEntryMode('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else {
        if (pendingSysValue && tempBpPointId) {
          setBpRecords(prev => prev.filter(r => r.id !== tempBpPointId));
          setTempBpPointId(null);
          
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
        const tempId = `temp-bp-${clickInfo.time}`;
        addBPPoint({
          id: tempId,
          timestamp: clickInfo.time,
          sys: clickInfo.value,
          dia: 0,
        });
        setTempBpPointId(tempId);
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBlendSequenceStep('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else if (blendSequenceStep === 'dia') {
        if (pendingSysValue && tempBpPointId) {
          setBpRecords(prev => prev.filter(r => r.id !== tempBpPointId));
          setTempBpPointId(null);
          
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
    
    // Clear touch start ref
    touchStartRef.current = null;
  };

  /**
   * Handle click to add vital point or edit existing
   * Note: On touch devices with an active tool mode, vitals entry is handled by handleTouchEnd
   * This function will still be called for synthesized clicks, but we skip if touch was already handled
   */
  const handleVitalsClick = (e: React.MouseEvent) => {
    // Skip if touch event was already handled (prevents double entry on touch devices)
    // This check is for synthesized click events that fire after touch events
    if (touchStartRef.current?.handled) {
      touchStartRef.current = null;
      return;
    }
    
    // Also skip if there's an active tool mode on touch devices - touchend handles it
    // (touchStartRef will be set from touchstart even if not yet handled)
    if (isTouchDevice && activeToolMode && activeToolMode !== 'edit' && touchStartRef.current) {
      // Touch sequence in progress, let touchend handle it
      return;
    }
    
    if (isProcessingClick) {
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

    // EDIT MODE: Now handled by mouse down/up for dragging - skip click handling
    if (activeToolMode === 'edit') {
      setIsProcessingClick(false);
      return;
    }

    // If no tool mode is active, check if clicking on existing point
    if (!activeToolMode) {
      const existingPoint = findVitalPointAtClick(rawClickTime, y, rect);
      
      if (existingPoint) {
        // Clicking on existing point → Open single edit dialog
        setIsProcessingClick(false);
        onVitalPointEdit?.(existingPoint.type, existingPoint.id, existingPoint.time, existingPoint.value);
        return;
      } else {
        // Clicking on empty space → Open bulk entry dialog
        setIsProcessingClick(false);
        onBulkVitalsOpen?.(snappedClickTime);
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

      clickInfo = { x: e.clientX, y: e.clientY, value, time: snappedClickTime };
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
        // Store systolic value and show it immediately as a temporary point
        const tempId = `temp-bp-${clickInfo.time}`;
        addBPPoint({
          id: tempId,
          timestamp: clickInfo.time,
          sys: clickInfo.value,
          dia: 0, // Placeholder, will be replaced when diastolic is entered
        });
        setTempBpPointId(tempId);
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBpEntryMode('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else {
        // Now have both sys and dia - remove temp point and create real BP point via mutation
        if (pendingSysValue && tempBpPointId) {
          // Remove temp point
          setBpRecords(prev => prev.filter(r => r.id !== tempBpPointId));
          setTempBpPointId(null);
          
          // Create real BP point via mutation
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
        // Store systolic value and show it immediately as a temporary point
        const tempId = `temp-bp-${clickInfo.time}`;
        addBPPoint({
          id: tempId,
          timestamp: clickInfo.time,
          sys: clickInfo.value,
          dia: 0, // Placeholder, will be replaced when diastolic is entered
        });
        setTempBpPointId(tempId);
        setPendingSysValue({ time: clickInfo.time, value: clickInfo.value });
        setBlendSequenceStep('dia');
        setHoverInfo(null);
        setIsProcessingClick(false);
      } else if (blendSequenceStep === 'dia') {
        // Now have both sys and dia - remove temp point and create real BP point via mutation
        if (pendingSysValue && tempBpPointId) {
          // Remove temp point
          setBpRecords(prev => prev.filter(r => r.id !== tempBpPointId));
          setTempBpPointId(null);
          
          // Create real BP point via mutation
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
      return isDragging ? 'cursor-grabbing' : 'cursor-grab';
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
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleVitalsMouseMove}
        onMouseLeave={() => {
          setHoverInfo(null);
          // Cancel drag if mouse leaves overlay
          if (isDragging) {
            setSelectedPoint(null);
            setDragPosition(null);
            setIsDragging(false);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          // Cancel drag if touch is interrupted
          if (isDragging) {
            setSelectedPoint(null);
            setDragPosition(null);
            setIsDragging(false);
          }
          // Also clear touch ref
          touchStartRef.current = null;
        }}
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
                {selectedPoint.type === 'hr' && `${t('anesthesia.timeline.vitals.draggingHR', 'Dragging HR')}: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-sys' && `${t('anesthesia.timeline.vitals.draggingSystolic', 'Dragging Systolic')}: ${hoverInfo.value}`}
                {selectedPoint.type === 'bp-dia' && `${t('anesthesia.timeline.vitals.draggingDiastolic', 'Dragging Diastolic')}: ${hoverInfo.value}`}
                {selectedPoint.type === 'spo2' && `${t('anesthesia.timeline.vitals.draggingSpO2', 'Dragging SpO2')}: ${hoverInfo.value}%`}
              </>
            )}
            {activeToolMode === 'hr' && `${t('anesthesia.timeline.vitals.hr', 'HR')}: ${hoverInfo.value}`}
            {activeToolMode === 'bp' && `${bpEntryMode === 'sys' ? t('anesthesia.timeline.vitals.systolic', 'Systolic') : t('anesthesia.timeline.vitals.diastolic', 'Diastolic')}: ${hoverInfo.value}`}
            {activeToolMode === 'spo2' && `${t('anesthesia.timeline.vitals.spo2', 'SpO2')}: ${hoverInfo.value}%`}
            {activeToolMode === 'blend' && blendSequenceStep === 'sys' && `${t('anesthesia.timeline.vitals.systolic', 'Systolic')}: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'dia' && `${t('anesthesia.timeline.vitals.diastolic', 'Diastolic')}: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'hr' && `${t('anesthesia.timeline.vitals.hr', 'HR')}: ${hoverInfo.value}`}
            {activeToolMode === 'blend' && blendSequenceStep === 'spo2' && `${t('anesthesia.timeline.vitals.spo2', 'SpO2')}: ${hoverInfo.value}%`}
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
