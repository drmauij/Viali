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
    
    // Calculate visible range and determine interval
    const visibleStart = currentStart || startTime;
    const visibleEnd = currentEnd || endTime;
    const visibleRange = visibleEnd - visibleStart;
    const viewSpanMinutes = visibleRange / (60 * 1000);
    
    // Adaptive interval: 5-min for <= 30 min view, 15-min for wider views
    const useFineTicks = viewSpanMinutes <= 30;
    const intervalMs = useFineTicks ? (5 * 60 * 1000) : (15 * 60 * 1000); // 5 or 15 minutes

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
        interval: intervalMs,
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
      
      // Calculate interval for dynamic updates
      const visibleStart = currentStart || startTime;
      const visibleEnd = currentEnd || endTime;
      const visibleRange = visibleEnd - visibleStart;
      const viewSpanMinutes = visibleRange / (60 * 1000);
      const useFineTicks = viewSpanMinutes <= 30;
      const intervalMs = useFineTicks ? (5 * 60 * 1000) : (15 * 60 * 1000);
      
      chart.setOption({
        xAxis: {
          min: visibleStart,
          max: visibleEnd,
          interval: intervalMs,
        },
      });
    }
  }, [currentStart, currentEnd, startTime, endTime]);

  return (
    <div className="sticky top-0 z-50 bg-background border-b border-border relative" style={{ height: '32px' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: "32px", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />

      {/* Controls Positioned Absolutely in the Center */}
      <div className="absolute left-1/2 transform -translate-x-1/2 top-0 flex items-center gap-1" style={{ height: '32px' }}>
        <button
          data-testid="button-pan-left"
          onClick={onPanLeft}
          className="p-1 hover:bg-muted rounded text-xs h-6 w-6 flex items-center justify-center"
          title="Pan Left"
        >
          ‹
        </button>
        <button
          data-testid="button-pan-right"
          onClick={onPanRight}
          className="p-1 hover:bg-muted rounded text-xs h-6 w-6 flex items-center justify-center"
          title="Pan Right"
        >
          ›
        </button>
        <div className="border-l border-border h-4 mx-1" />
        <button
          data-testid="button-zoom-in"
          onClick={onZoomIn}
          className="p-1 hover:bg-muted rounded text-xs h-6 w-6 flex items-center justify-center"
          title="Zoom In"
        >
          <Search className="h-3 w-3" />
          +
        </button>
        <button
          data-testid="button-zoom-out"
          onClick={onZoomOut}
          className="p-1 hover:bg-muted rounded text-xs h-6 w-6 flex items-center justify-center"
          title="Zoom Out"
        >
          <Search className="h-3 w-3" />
          -
        </button>
        <button
          data-testid="button-reset-zoom"
          onClick={onResetZoom}
          className="p-1 hover:bg-muted rounded text-xs h-6 px-2 flex items-center justify-center"
          title="Reset Zoom"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
