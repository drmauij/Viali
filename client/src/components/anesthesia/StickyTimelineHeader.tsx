import { useMemo, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

interface StickyTimelineHeaderProps {
  startTime: number;
  endTime: number;
  currentStart?: number;
  currentEnd?: number;
  isDark: boolean;
  onPanLeft?: () => void;
  onPanRight?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
}

export function StickyTimelineHeader({
  startTime,
  endTime,
  currentStart,
  currentEnd,
  isDark,
  onPanLeft,
  onPanRight,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: StickyTimelineHeaderProps) {
  const chartRef = useRef<any>(null);

  const option = useMemo(() => {
    const GRID_LEFT = 150;
    const GRID_RIGHT = 10;

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: 18,
        bottom: 0,
        backgroundColor: "transparent",
      },
      xAxis: {
        type: "time" as const,
        min: currentStart || startTime,
        max: currentEnd || endTime,
        boundaryGap: false,
        axisLabel: {
          show: true,
          formatter: "{HH}:{mm}",
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: isDark ? "#ffffff" : "#000000",
          fontWeight: 500,
          margin: -2,
        },
        axisLine: {
          show: true,
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" },
        },
        axisTick: {
          show: true,
          lineStyle: { color: isDark ? "#444444" : "#d1d5db" },
        },
        splitLine: {
          show: false,
        },
        minorTick: {
          show: true,
          splitNumber: 4,
        },
        minorSplitLine: {
          show: false,
        },
        position: "top",
      },
      yAxis: {
        type: "value" as const,
        show: false,
      },
      series: [],
    } as echarts.EChartsOption;
  }, [startTime, endTime, currentStart, currentEnd, isDark]);

  useEffect(() => {
    if (chartRef.current && (currentStart || currentEnd)) {
      const chart = chartRef.current.getEchartsInstance();
      chart.setOption({
        xAxis: {
          min: currentStart || startTime,
          max: currentEnd || endTime,
        },
      });
    }
  }, [currentStart, currentEnd, startTime, endTime]);

  return (
    <div className="sticky top-0 z-50 bg-background border-b border-border relative" style={{ height: '32px' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '32px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      
      {/* Control buttons overlaid on top of timeline */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        {/* Left: Pan back button */}
        {onPanLeft && (
          <button
            onClick={onPanLeft}
            className="absolute left-[155px] top-1/2 -translate-y-1/2 pointer-events-auto w-7 h-7 rounded flex items-center justify-center bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
            data-testid="button-pan-left"
            title="Pan Left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        
        {/* Center: Zoom controls */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex gap-1">
          {onZoomIn && (
            <button
              onClick={onZoomIn}
              className="w-7 h-7 rounded flex items-center justify-center bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
              data-testid="button-zoom-in"
              title="Zoom In"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
              </svg>
            </button>
          )}
          {onResetZoom && (
            <button
              onClick={onResetZoom}
              className="w-7 h-7 rounded flex items-center justify-center bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
              data-testid="button-reset-zoom"
              title="Reset Zoom"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {onZoomOut && (
            <button
              onClick={onZoomOut}
              className="w-7 h-7 rounded flex items-center justify-center bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
              data-testid="button-zoom-out"
              title="Zoom Out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
          )}
        </div>
        
        {/* Right: Pan forward button */}
        {onPanRight && (
          <button
            onClick={onPanRight}
            className="absolute right-[15px] top-1/2 -translate-y-1/2 pointer-events-auto w-7 h-7 rounded flex items-center justify-center bg-background/50 hover:bg-background/80 border border-border/50 transition-colors"
            data-testid="button-pan-right"
            title="Pan Right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
