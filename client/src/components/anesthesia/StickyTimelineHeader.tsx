import { useMemo, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Search } from "lucide-react";

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
    const GRID_LEFT = 200;
    const GRID_RIGHT = 10;
    
    // Calculate visible range
    const visibleStart = currentStart || startTime;
    const visibleEnd = currentEnd || endTime;

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
        min: visibleStart,
        max: visibleEnd,
        boundaryGap: false,
        axisLabel: {
          show: true,
          formatter: (value: number, index: number, params: any) => {
            // Calculate interval dynamically based on current axis range
            const axisMin = params?.min || visibleStart;
            const axisMax = params?.max || visibleEnd;
            const visibleRange = axisMax - axisMin;
            const viewSpanMinutes = visibleRange / (60 * 1000);
            
            // Adaptive interval: 5-min for <= 30 min view, 15-min for wider views
            const targetInterval = viewSpanMinutes <= 30 ? 5 : 15;
            
            const date = new Date(value);
            const minutes = date.getMinutes();
            
            // Only show labels at target interval boundaries
            if (minutes % targetInterval === 0) {
              const hours = String(date.getHours()).padStart(2, '0');
              const mins = String(minutes).padStart(2, '0');
              return `${hours}:${mins}`;
            }
            return ''; // Hide other tick labels
          },
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
          show: false, // Disable minor ticks to use explicit interval
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
      
      // Calculate visible range for updates
      const visibleStart = currentStart || startTime;
      const visibleEnd = currentEnd || endTime;
      
      chart.setOption({
        xAxis: {
          min: visibleStart,
          max: visibleEnd,
          axisLabel: {
            formatter: (value: number, index: number, params: any) => {
              // Calculate interval dynamically based on current axis range
              const axisMin = params?.min || visibleStart;
              const axisMax = params?.max || visibleEnd;
              const visibleRange = axisMax - axisMin;
              const viewSpanMinutes = visibleRange / (60 * 1000);
              
              // Adaptive interval: 5-min for <= 30 min view, 15-min for wider views
              const targetInterval = viewSpanMinutes <= 30 ? 5 : 15;
              
              const date = new Date(value);
              const minutes = date.getMinutes();
              
              // Only show labels at target interval boundaries
              if (minutes % targetInterval === 0) {
                const hours = String(date.getHours()).padStart(2, '0');
                const mins = String(minutes).padStart(2, '0');
                return `${hours}:${mins}`;
              }
              return ''; // Hide other tick labels
            },
          },
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
      
      {/* Control buttons centered with solid background */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex gap-1 bg-background border border-border rounded-md p-1">
          {onPanLeft && (
            <button
              onClick={onPanLeft}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
              data-testid="button-pan-left"
              title="Pan Left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {onZoomIn && (
            <button
              onClick={onZoomIn}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
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
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
              data-testid="button-reset-zoom"
              title="Reset Zoom"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          {onZoomOut && (
            <button
              onClick={onZoomOut}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
              data-testid="button-zoom-out"
              title="Zoom Out"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </button>
          )}
          {onPanRight && (
            <button
              onClick={onPanRight}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-accent transition-colors"
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
    </div>
  );
}
