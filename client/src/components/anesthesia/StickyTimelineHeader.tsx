import { useMemo, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";

interface StickyTimelineHeaderProps {
  startTime: number;
  endTime: number;
  currentStart?: number;
  currentEnd?: number;
  isDark: boolean;
}

export function StickyTimelineHeader({
  startTime,
  endTime,
  currentStart,
  currentEnd,
  isDark,
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
        top: 0,
        bottom: 20,
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
          margin: 8,
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
        position: "bottom",
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
    <div className="sticky top-0 z-50 bg-background border-b border-border" style={{ height: '50px' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '50px', width: '100%' }}
        opts={{ renderer: 'canvas' }}
      />
    </div>
  );
}
