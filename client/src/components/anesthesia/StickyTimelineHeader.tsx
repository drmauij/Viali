import { useMemo, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface StickyTimelineHeaderProps {
  startTime: number;
  endTime: number;
  currentStart?: number;
  currentEnd?: number;
  isDark: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
}

export function StickyTimelineHeader({
  startTime,
  endTime,
  currentStart,
  currentEnd,
  isDark,
  onNavigateBack,
  onNavigateForward,
}: StickyTimelineHeaderProps) {
  const chartRef = useRef<any>(null);

  const option = useMemo(() => {
    const GRID_LEFT = 158; // 150 + 8 for back button
    const GRID_RIGHT = 40; // Space for forward button

    return {
      backgroundColor: "transparent",
      animation: false,
      grid: {
        left: GRID_LEFT,
        right: GRID_RIGHT,
        top: 12,
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
          margin: 6,
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
      {/* Back button */}
      {onNavigateBack && (
        <button
          onClick={onNavigateBack}
          className="absolute left-0 top-0 h-full w-8 flex items-center justify-center hover:bg-accent/50 transition-colors z-10 border-r border-border"
          data-testid="button-timeline-back"
          title="Navigate backward"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '32px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
      
      {/* Forward button */}
      {onNavigateForward && (
        <button
          onClick={onNavigateForward}
          className="absolute right-0 top-0 h-full w-8 flex items-center justify-center hover:bg-accent/50 transition-colors z-10 border-l border-border"
          data-testid="button-timeline-forward"
          title="Navigate forward"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
