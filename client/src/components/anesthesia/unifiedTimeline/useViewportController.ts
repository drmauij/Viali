import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import type { MutableRefObject, RefObject } from "react";
import type {
  VitalPoint,
  TimelineEvent,
  UnifiedTimelineData,
} from "../unifiedTimeline";
import {
  THIRTY_MINUTES,
  ZOOM_LEVELS,
  findClosestZoomLevel,
} from "@/utils/timelineUtils";

type RateInfusionSessions = Record<string, any[]>;
type FreeFlowSessions = Record<string, any[]>;

interface UseViewportControllerParams {
  chartRef: RefObject<any>;
  isChartReady: boolean;
  setIsChartReady: (ready: boolean) => void;
  isMountedRef: MutableRefObject<boolean>;
  data: UnifiedTimelineData;
  now?: number;
  anesthesiaRecordId?: string;
  anesthesiaRecord?: any;
  rateInfusionSessions: RateInfusionSessions;
  freeFlowSessions: FreeFlowSessions;
}

export interface ViewportControllerReturn {
  currentTime: number;
  setCurrentTime: (v: number) => void;
  currentZoomStart: number | undefined;
  setCurrentZoomStart: (v: number | undefined) => void;
  currentZoomEnd: number | undefined;
  setCurrentZoomEnd: (v: number | undefined) => void;
  nowLinePosition: string;
  nowLineTransitionsEnabled: boolean;
  currentVitalsSnapInterval: number;
  setCurrentVitalsSnapInterval: (v: number) => void;
  currentDrugSnapInterval: number;
  isHistoricalRecord: boolean;
  shouldAutoRecenterView: boolean;
  contentBounds: { start: number; end: number } | null;
  graphicsRevision: number;
  setGraphicsRevision: (v: number | ((prev: number) => number)) => void;
  zoomPercent: { start: number; end: number } | null;
  setZoomPercent: (v: { start: number; end: number } | null) => void;
  midnightLinePositions: { position: string; label: string }[];
  handleChartReady: (chart: any) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handlePanLeft: () => void;
  handlePanRight: () => void;
  handleResetZoom: () => void;
  viewportControllerRef: MutableRefObject<{
    hasInitialized: boolean;
    initializedForRecordId: string | null;
    capturedContentBounds: { start: number; end: number } | null;
    isDataUpdateInProgress: boolean;
  }>;
  userPinnedViewportRef: MutableRefObject<boolean>;
  initialZoomAppliedRef: MutableRefObject<boolean>;
}

export function useViewportController({
  chartRef,
  isChartReady,
  setIsChartReady,
  isMountedRef,
  data,
  now,
  anesthesiaRecordId,
  anesthesiaRecord,
  rateInfusionSessions,
  freeFlowSessions,
}: UseViewportControllerParams): ViewportControllerReturn {

  const [currentTime, setCurrentTime] = useState<number>(now || Date.now());

  useEffect(() => {
    const updateTime = () => { setCurrentTime(Date.now()); };
    if (now) { setCurrentTime(now); }
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [now]);

  const [currentZoomStart, setCurrentZoomStart] = useState<number | undefined>(undefined);
  const [currentZoomEnd, setCurrentZoomEnd] = useState<number | undefined>(undefined);
  const [nowLinePosition, setNowLinePosition] = useState<string>('-10px');
  const [nowLineTransitionsEnabled, setNowLineTransitionsEnabled] = useState<boolean>(false);
  const prevZoomRef = useRef<{ start: number | undefined; end: number | undefined }>({ start: undefined, end: undefined });
  const userPinnedViewportRef = useRef<boolean>(false);
  const initialZoomAppliedRef = useRef<boolean>(false);

  const viewportControllerRef = useRef<{
    hasInitialized: boolean;
    initializedForRecordId: string | null;
    capturedContentBounds: { start: number; end: number } | null;
    isDataUpdateInProgress: boolean;
  }>({
    hasInitialized: false,
    initializedForRecordId: null,
    capturedContentBounds: null,
    isDataUpdateInProgress: false,
  });

  const [currentVitalsSnapInterval, setCurrentVitalsSnapInterval] = useState<number>(1 * 60 * 1000);
  const [currentDrugSnapInterval] = useState<number>(1 * 60 * 1000);

  const isHistoricalRecord = useMemo(() => {
    if (data.isHistoricalData) return true;
    if (anesthesiaRecord?.caseStatus === 'closed' || anesthesiaRecord?.caseStatus === 'amended') return true;
    if (anesthesiaRecord?.isLocked) return true;
    const timeMarkersArray = anesthesiaRecord?.timeMarkers;
    if (Array.isArray(timeMarkersArray)) {
      const a2Marker = timeMarkersArray.find((m: any) => m.code === 'A2');
      if (a2Marker?.time && isFinite(a2Marker.time)) return true;
    }
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (isFinite(data.endTime) && data.endTime < oneHourAgo) return true;
    return false;
  }, [anesthesiaRecord?.caseStatus, anesthesiaRecord?.timeMarkers, anesthesiaRecord?.isLocked, data.endTime, data.isHistoricalData]);

  const shouldAutoRecenterView = useMemo(() => {
    if (!anesthesiaRecord?.isLocked) return false;
    const timeMarkersArray = anesthesiaRecord?.timeMarkers;
    if (!Array.isArray(timeMarkersArray)) return false;
    const pacuEndMarker = timeMarkersArray.find((m: any) => m.code === 'P');
    if (!pacuEndMarker?.time || !isFinite(pacuEndMarker.time)) return false;
    return true;
  }, [anesthesiaRecord?.isLocked, anesthesiaRecord?.timeMarkers]);

  const contentBounds = useMemo(() => {
    const timestamps: number[] = [];
    if (data.vitals?.hr) data.vitals.hr.forEach((p: VitalPoint) => timestamps.push(p[0]));
    if (data.vitals?.sysBP) data.vitals.sysBP.forEach((p: VitalPoint) => timestamps.push(p[0]));
    if (data.vitals?.diaBP) data.vitals.diaBP.forEach((p: VitalPoint) => timestamps.push(p[0]));
    if (data.vitals?.spo2) data.vitals.spo2.forEach((p: VitalPoint) => timestamps.push(p[0]));
    if (data.medications) {
      data.medications.forEach((m: any) => {
        if (m.timestamp) timestamps.push(new Date(m.timestamp).getTime());
        if (m.endTimestamp) timestamps.push(new Date(m.endTimestamp).getTime());
      });
    }
    Object.values(rateInfusionSessions).forEach(sessions => {
      if (Array.isArray(sessions)) {
        sessions.forEach(session => {
          if (session.startTime) timestamps.push(session.startTime);
          if (session.endTime) timestamps.push(session.endTime);
          if (session.segments && session.segments.length > 0) {
            session.segments.forEach((seg: any, i: number) => {
              if (seg.startTime) timestamps.push(seg.startTime);
              if (i < session.segments.length - 1) {
                const nextSeg = session.segments[i + 1];
                if (nextSeg?.startTime) timestamps.push(nextSeg.startTime);
              } else if (session.endTime) {
                timestamps.push(session.endTime);
              }
            });
          }
        });
      }
    });
    Object.values(freeFlowSessions).forEach(sessions => {
      if (Array.isArray(sessions)) {
        sessions.forEach(session => {
          if (session.startTime) timestamps.push(session.startTime);
          if (session.endTime) timestamps.push(session.endTime);
        });
      }
    });
    if (data.events) {
      data.events.forEach((e: TimelineEvent) => {
        if (e.time) timestamps.push(e.time);
      });
    }
    const timeMarkersArray = anesthesiaRecord?.timeMarkers;
    if (Array.isArray(timeMarkersArray)) {
      timeMarkersArray.forEach((m: any) => {
        if (m.time) timestamps.push(m.time);
      });
    }
    const validTimestamps = timestamps.filter(t => t && isFinite(t) && t > 0);
    if (validTimestamps.length === 0) return null;
    const minTime = Math.min(...validTimestamps);
    const maxTime = Math.max(...validTimestamps);
    const padding = 15 * 60 * 1000;
    let start = Math.max(data.startTime, minTime - padding);
    let end = Math.min(data.endTime, maxTime + padding);
    if (start > end) [start, end] = [end, start];
    return { start, end };
  }, [data.vitals, data.medications, data.events, anesthesiaRecord?.timeMarkers, rateInfusionSessions, freeFlowSessions, data.startTime, data.endTime]);

  const [graphicsRevision, setGraphicsRevision] = useState<number>(0);
  const [zoomPercent, setZoomPercent] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    if (!isChartReady) return;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;

    const handleDataZoom = (params: any) => {
      if (!isMountedRef.current) return;
      try {
        const option = chart.getOption() as any;
        if (!option) return;
        const dataZoom = option.dataZoom?.[0];
        if (dataZoom) {
          const start = dataZoom.start ?? 0;
          const end = dataZoom.end ?? 100;
          let fullRange = data.endTime - data.startTime;
          const MIN_RANGE = 10 * 60 * 1000;
          if (fullRange <= 0) {
            console.warn('[ZOOM-EVENT] Data range is zero or negative, using minimum 10-minute window', {
              startTime: new Date(data.startTime).toISOString(),
              endTime: new Date(data.endTime).toISOString(),
              originalRange: fullRange
            });
            fullRange = MIN_RANGE;
          }
          const visibleStart = data.startTime + (start / 100) * fullRange;
          const visibleEnd = data.startTime + (end / 100) * fullRange;
          setCurrentZoomStart(visibleStart);
          setCurrentZoomEnd(visibleEnd);
          setZoomPercent({ start, end });
        }
      } catch (e) {
      }
    };

    chart.on('datazoom', handleDataZoom);
    return () => {
      if (!isMountedRef.current) return;
      try {
        const currentChart = chartRef.current?.getEchartsInstance();
        if (currentChart) currentChart.off('datazoom', handleDataZoom);
      } catch (e) {
      }
    };
  }, [isChartReady, data.startTime, data.endTime]);

  const hasSetInitialZoomRef = useRef(false);

  const handleChartReady = useCallback((chart: any) => {
    if (!isMountedRef.current) return;
    setIsChartReady(true);
  }, []);

  const hasValidContentBounds = useMemo(() => {
    return contentBounds !== null && 
           isFinite(contentBounds.start) && 
           isFinite(contentBounds.end) &&
           contentBounds.start > 0 && 
           contentBounds.end > 0;
  }, [contentBounds]);

  useEffect(() => {
    const controller = viewportControllerRef.current;
    if (controller.initializedForRecordId !== anesthesiaRecordId) {
      controller.hasInitialized = false;
      controller.initializedForRecordId = null;
      controller.capturedContentBounds = null;
      hasSetInitialZoomRef.current = false;
      userPinnedViewportRef.current = false;
      initialZoomAppliedRef.current = false;
    }
    if (controller.hasInitialized && controller.initializedForRecordId === anesthesiaRecordId) return;
    if (userPinnedViewportRef.current) return;
    if (shouldAutoRecenterView) {
      if (!hasValidContentBounds || !contentBounds) return;
      if (!controller.capturedContentBounds) {
        controller.capturedContentBounds = { ...contentBounds };
      }
    }
    let isCancelled = false;
    let retryTimeoutId: NodeJS.Timeout | null = null;
    const applyViewport = (): boolean => {
      if (isCancelled) return false;
      if (!isMountedRef.current) return false;
      const chart = chartRef.current?.getEchartsInstance();
      if (!chart) return false;
      let viewStart: number;
      let viewEnd: number;
      if (shouldAutoRecenterView && controller.capturedContentBounds) {
        const bounds = controller.capturedContentBounds;
        const contentSpan = bounds.end - bounds.start;
        const FIVE_HOURS = 5 * 60 * 60 * 1000;
        const PADDING = 15 * 60 * 1000;
        const contentCenter = (bounds.start + bounds.end) / 2;
        if (contentSpan <= FIVE_HOURS) {
          viewStart = bounds.start - PADDING;
          viewEnd = bounds.end + PADDING;
        } else {
          viewStart = contentCenter - FIVE_HOURS / 2;
          viewEnd = contentCenter + FIVE_HOURS / 2;
        }
      } else {
        const ct = now || data.endTime;
        const thirtyMinutes = 30 * 60 * 1000;
        viewStart = ct - thirtyMinutes;
        viewEnd = ct + thirtyMinutes;
      }
      const targetWindow = viewEnd - viewStart;
      if (viewStart < data.startTime) {
        viewStart = data.startTime;
        viewEnd = Math.min(data.endTime, viewStart + targetWindow);
      }
      if (viewEnd > data.endTime) {
        viewEnd = data.endTime;
        viewStart = Math.max(data.startTime, viewEnd - targetWindow);
      }
      const fullRange = data.endTime - data.startTime;
      if (fullRange <= 0) return false;
      const startPercent = ((viewStart - data.startTime) / fullRange) * 100;
      const endPercent = ((viewEnd - data.startTime) / fullRange) * 100;
      let clampedStart = Math.max(0, Math.min(100, startPercent));
      let clampedEnd = Math.max(0, Math.min(100, endPercent));
      if (clampedStart > clampedEnd) [clampedStart, clampedEnd] = [clampedEnd, clampedStart];
      setZoomPercent({ start: clampedStart, end: clampedEnd });
      chart.setOption({ dataZoom: [{ start: clampedStart, end: clampedEnd }] });
      setCurrentZoomStart(viewStart);
      setCurrentZoomEnd(viewEnd);
      controller.hasInitialized = true;
      controller.initializedForRecordId = anesthesiaRecordId ?? null;
      hasSetInitialZoomRef.current = true;
      initialZoomAppliedRef.current = true;
      return true;
    };
    if (applyViewport()) return;
    const scheduleRetry = (delay: number, attempt: number, maxAttempts: number) => {
      if (isCancelled || attempt >= maxAttempts) return;
      retryTimeoutId = setTimeout(() => {
        if (!isCancelled && !applyViewport() && attempt + 1 < maxAttempts) {
          scheduleRetry(delay * 2, attempt + 1, maxAttempts);
        }
      }, delay);
    };
    scheduleRetry(200, 0, 3);
    return () => {
      isCancelled = true;
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
    };
  }, [shouldAutoRecenterView, anesthesiaRecordId, data.startTime, data.endTime, now, isChartReady, hasValidContentBounds]);

  useEffect(() => {
    if (!isChartReady) return;
    const updateZoomState = () => {
      if (!isMountedRef.current) return;
      const chart = chartRef.current?.getEchartsInstance();
      if (!chart) return;
      try {
        const option = chart.getOption() as any;
        if (!option) return;
        const dataZoom = option.dataZoom?.[0];
        if (!dataZoom) return;
        const start = dataZoom.start ?? 0;
        const end = dataZoom.end ?? 100;
        let fullRange = data.endTime - data.startTime;
        const MIN_RANGE = 10 * 60 * 1000;
        if (fullRange <= 0) {
          console.warn('[ZOOM] Data range is zero or negative, using minimum 10-minute window', {
            startTime: new Date(data.startTime).toISOString(),
            endTime: new Date(data.endTime).toISOString(),
            originalRange: fullRange
          });
          fullRange = MIN_RANGE;
        }
        const visibleStart = data.startTime + (start / 100) * fullRange;
        const visibleEnd = data.startTime + (end / 100) * fullRange;
        setCurrentZoomStart(visibleStart);
        setCurrentZoomEnd(visibleEnd);
        const vitalsSnapInterval = 1 * 60 * 1000;
        setCurrentVitalsSnapInterval(vitalsSnapInterval);
      } catch (error) {
        console.warn('[ZOOM] Error updating zoom state:', error);
      }
    };
    setTimeout(updateZoomState, 50);
    const chart = chartRef.current?.getEchartsInstance();
    if (chart) chart.on('datazoom', updateZoomState);
    return () => {
      if (!isMountedRef.current) return;
      try {
        const chart = chartRef.current?.getEchartsInstance();
        if (chart) chart.off('datazoom', updateZoomState);
      } catch (error) {
      }
    };
  }, [chartRef, data.startTime, data.endTime, isChartReady]);

  useEffect(() => {
    if (currentZoomStart === undefined || currentZoomStart === null || 
        currentZoomEnd === undefined || currentZoomEnd === null) {
      return;
    }
    const zoomChanged = prevZoomRef.current.start !== currentZoomStart || 
                        prevZoomRef.current.end !== currentZoomEnd;
    prevZoomRef.current = { start: currentZoomStart, end: currentZoomEnd };
    const visibleStart = currentZoomStart;
    const visibleEnd = currentZoomEnd;
    const visibleRange = visibleEnd - visibleStart;
    const xFraction = (currentTime - visibleStart) / visibleRange;
    let newPosition: string;
    if (xFraction >= 0 && xFraction <= 1) {
      newPosition = `calc(200px + ${xFraction} * (100% - 210px))`;
    } else {
      newPosition = '-10px';
    }
    if (newPosition !== nowLinePosition) {
      if (zoomChanged && nowLineTransitionsEnabled) {
        setNowLineTransitionsEnabled(false);
        setNowLinePosition(newPosition);
        setTimeout(() => { setNowLineTransitionsEnabled(true); }, 50);
      } else {
        setNowLinePosition(newPosition);
        if (!nowLineTransitionsEnabled) {
          setTimeout(() => { setNowLineTransitionsEnabled(true); }, 100);
        }
      }
    }
  }, [currentZoomStart, currentZoomEnd, currentTime, nowLinePosition, nowLineTransitionsEnabled]);

  const midnightLinePositions = useMemo(() => {
    if (currentZoomStart === undefined || currentZoomStart === null || 
        currentZoomEnd === undefined || currentZoomEnd === null) {
      return [];
    }
    const visibleStart = currentZoomStart;
    const visibleEnd = currentZoomEnd;
    const visibleRange = visibleEnd - visibleStart;
    if (visibleRange <= 0) return [];
    const positions: { position: string; label: string }[] = [];
    const startDate = new Date(visibleStart);
    startDate.setHours(0, 0, 0, 0);
    for (let d = startDate.getTime(); d <= visibleEnd + 24 * 60 * 60 * 1000; d += 24 * 60 * 60 * 1000) {
      const midnightTime = d;
      if (midnightTime >= visibleStart && midnightTime <= visibleEnd) {
        const xFraction = (midnightTime - visibleStart) / visibleRange;
        if (xFraction >= 0 && xFraction <= 1) {
          const position = `calc(200px + ${xFraction} * (100% - 210px))`;
          const date = new Date(midnightTime);
          const label = `${date.getDate()}.${date.getMonth() + 1}.`;
          positions.push({ position, label });
        }
      }
    }
    return positions;
  }, [currentZoomStart, currentZoomEnd]);

  const dispatchZoom = useCallback((newStart: number, newEnd: number) => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const fullRange = data.endTime - data.startTime;
    if (fullRange <= 0) return;
    const startPercent = ((newStart - data.startTime) / fullRange) * 100;
    const endPercent = ((newEnd - data.startTime) / fullRange) * 100;
    chart.dispatchAction({ type: 'dataZoom', start: startPercent, end: endPercent });
  }, [chartRef, data.startTime, data.endTime]);

  const handleZoomIn = useCallback(() => {
    if (!isChartReady) return;
    userPinnedViewportRef.current = true;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const option = chart.getOption() as any;
    if (!option) return;
    const dataZoom = option.dataZoom?.[0];
    if (!dataZoom) return;
    const start = dataZoom.start ?? 0;
    const end = dataZoom.end ?? 100;
    const fullRange = data.endTime - data.startTime;
    const currentMin = data.startTime + (start / 100) * fullRange;
    const currentMax = data.startTime + (end / 100) * fullRange;
    const currentSpan = currentMax - currentMin;
    const currentLevelIndex = findClosestZoomLevel(currentSpan);
    const newLevelIndex = Math.max(0, currentLevelIndex - 1);
    const newSpan = ZOOM_LEVELS[newLevelIndex];
    const center = (currentMin + currentMax) / 2;
    let newStart = center - newSpan / 2;
    let newEnd = center + newSpan / 2;
    if (newStart < data.startTime) { newStart = data.startTime; newEnd = newStart + newSpan; }
    if (newEnd > data.endTime) { newEnd = data.endTime; newStart = newEnd - newSpan; }
    dispatchZoom(newStart, newEnd);
  }, [isChartReady, chartRef, data.startTime, data.endTime, dispatchZoom]);

  const handleZoomOut = useCallback(() => {
    if (!isChartReady) return;
    userPinnedViewportRef.current = true;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const option = chart.getOption() as any;
    if (!option) return;
    const dataZoom = option.dataZoom?.[0];
    if (!dataZoom) return;
    const start = dataZoom.start ?? 0;
    const end = dataZoom.end ?? 100;
    const fullRange = data.endTime - data.startTime;
    const currentMin = data.startTime + (start / 100) * fullRange;
    const currentMax = data.startTime + (end / 100) * fullRange;
    const currentSpan = currentMax - currentMin;
    const currentLevelIndex = findClosestZoomLevel(currentSpan);
    const newLevelIndex = Math.min(ZOOM_LEVELS.length - 1, currentLevelIndex + 1);
    const newSpan = ZOOM_LEVELS[newLevelIndex];
    const center = (currentMin + currentMax) / 2;
    let newStart = center - newSpan / 2;
    let newEnd = center + newSpan / 2;
    if (newStart < data.startTime) { newStart = data.startTime; newEnd = Math.min(newStart + newSpan, data.endTime); }
    if (newEnd > data.endTime) { newEnd = data.endTime; newStart = Math.max(newEnd - newSpan, data.startTime); }
    dispatchZoom(newStart, newEnd);
  }, [isChartReady, chartRef, data.startTime, data.endTime, dispatchZoom]);

  const handlePanLeft = useCallback(() => {
    if (!isChartReady) return;
    userPinnedViewportRef.current = true;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const option = chart.getOption() as any;
    if (!option) return;
    const dataZoom = option.dataZoom?.[0];
    if (!dataZoom) return;
    const start = dataZoom.start ?? 0;
    const end = dataZoom.end ?? 100;
    const fullRange = data.endTime - data.startTime;
    const currentMin = data.startTime + (start / 100) * fullRange;
    const currentMax = data.startTime + (end / 100) * fullRange;
    const span = currentMax - currentMin;
    const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
    let newStart = currentMin - panStep;
    let newEnd = currentMax - panStep;
    if (newStart < data.startTime) { newStart = data.startTime; newEnd = newStart + span; }
    dispatchZoom(newStart, newEnd);
  }, [isChartReady, chartRef, data.startTime, data.endTime, dispatchZoom]);

  const handlePanRight = useCallback(() => {
    if (!isChartReady) return;
    userPinnedViewportRef.current = true;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const option = chart.getOption() as any;
    if (!option) return;
    const dataZoom = option.dataZoom?.[0];
    if (!dataZoom) return;
    const start = dataZoom.start ?? 0;
    const end = dataZoom.end ?? 100;
    const fullRange = data.endTime - data.startTime;
    const currentMin = data.startTime + (start / 100) * fullRange;
    const currentMax = data.startTime + (end / 100) * fullRange;
    const span = currentMax - currentMin;
    const panStep = Math.max(span * 0.1, 5 * 60 * 1000);
    let newStart = currentMin + panStep;
    let newEnd = currentMax + panStep;
    if (newEnd > data.endTime) { newEnd = data.endTime; newStart = newEnd - span; }
    dispatchZoom(newStart, newEnd);
  }, [isChartReady, chartRef, data.startTime, data.endTime, dispatchZoom]);

  const handleResetZoom = useCallback(() => {
    if (!isChartReady) return;
    userPinnedViewportRef.current = false;
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const ct = now || data.endTime;
    const thirtyMinutes = 30 * 60 * 1000;
    dispatchZoom(ct - thirtyMinutes, ct + thirtyMinutes);
  }, [isChartReady, chartRef, now, data.endTime, dispatchZoom]);

  return {
    currentTime,
    setCurrentTime,
    currentZoomStart,
    setCurrentZoomStart,
    currentZoomEnd,
    setCurrentZoomEnd,
    nowLinePosition,
    nowLineTransitionsEnabled,
    currentVitalsSnapInterval,
    setCurrentVitalsSnapInterval,
    currentDrugSnapInterval,
    isHistoricalRecord,
    shouldAutoRecenterView,
    contentBounds,
    graphicsRevision,
    setGraphicsRevision,
    zoomPercent,
    setZoomPercent,
    midnightLinePositions,
    handleChartReady,
    handleZoomIn,
    handleZoomOut,
    handlePanLeft,
    handlePanRight,
    handleResetZoom,
    viewportControllerRef,
    userPinnedViewportRef,
    initialZoomAppliedRef,
  };
}
