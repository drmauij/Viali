import { useMemo, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

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
          margin: 2,
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
    <div className="sticky top-0 z-50 bg-background border-b border-border relative" style={{ height: '56px' }}>
      <div className="absolute bottom-0 left-0 right-0" style={{ height: '32px' }}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: '32px', width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
      
      {/* Navigation and zoom controls - positioned above timeline labels */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none flex items-center justify-between px-2" style={{ height: '24px' }}>
        {/* Left: Back button */}
        <button
          onClick={onPanLeft}
          className="pointer-events-auto p-1 rounded bg-background/30 hover:bg-background/50 border border-border/50 transition-colors"
          data-testid="button-pan-left"
          title="Pan Left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        
        {/* Center: Zoom controls */}
        <div className="pointer-events-auto flex items-center gap-1 bg-background/30 rounded border border-border/50 px-1">
          <button
            onClick={onZoomIn}
            className="p-1 hover:bg-background/50 rounded transition-colors"
            data-testid="button-zoom-in"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={onZoomOut}
            className="p-1 hover:bg-background/50 rounded transition-colors"
            data-testid="button-zoom-out"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={onResetZoom}
            className="p-1 hover:bg-background/50 rounded transition-colors"
            data-testid="button-reset-zoom"
            title="Reset Zoom"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        
        {/* Right: Forward button */}
        <button
          onClick={onPanRight}
          className="pointer-events-auto p-1 rounded bg-background/30 hover:bg-background/50 border border-border/50 transition-colors"
          data-testid="button-pan-right"
          title="Pan Right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
