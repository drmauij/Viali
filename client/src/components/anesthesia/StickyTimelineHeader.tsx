import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Search, GripVertical } from "lucide-react";

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
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });

  // Load position from localStorage or use default centered position
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('timeline-controls-position');
    if (saved) return JSON.parse(saved);
    // Default: centered both horizontally and vertically, slightly covering timeline header
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 - 40 };
  });

  // Save position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('timeline-controls-position', JSON.stringify(position));
  }, [position]);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragRef.current = {
      isDragging: true,
      startX: clientX - position.x,
      startY: clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.isDragging) return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      setPosition({
        x: clientX - dragRef.current.startX,
        y: clientY - dragRef.current.startY,
      });
    };

    const handleEnd = () => {
      dragRef.current.isDragging = false;
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove);
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, []);

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
    <>
      <div className="sticky top-0 z-50 bg-background" style={{ height: '32px' }}>
        <ReactECharts
          ref={chartRef}
          option={option}
          style={{ height: "32px", width: "100%" }}
          opts={{ renderer: "canvas" }}
        />
      </div>

      {/* Touch-Friendly Draggable Controls with Glass Effect - Fixed positioning for unrestricted dragging */}
      <div 
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className="fixed z-[9999] bg-background/80 backdrop-blur-md border-2 border-border/50 rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-4 cursor-grab active:cursor-grabbing select-none"
        style={{ left: `${position.x}px`, top: `${position.y}px`, transform: 'translate(-50%, 0)' }}
        data-testid="timeline-controls-panel"
      >
        {/* Drag Handle */}
        <div 
          className="p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          title="Drag to reposition"
        >
          <GripVertical className="h-5 w-5" />
        </div>
        
        <button
          data-testid="button-pan-left"
          onClick={(e) => { e.stopPropagation(); onPanLeft?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-2xl h-12 w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Pan Left"
        >
          ‹
        </button>
        <button
          data-testid="button-pan-right"
          onClick={(e) => { e.stopPropagation(); onPanRight?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-2xl h-12 w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Pan Right"
        >
          ›
        </button>
        <div className="border-l-2 border-border h-8 mx-1" />
        <button
          data-testid="button-zoom-in"
          onClick={(e) => { e.stopPropagation(); onZoomIn?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-xl h-12 w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Zoom In"
        >
          <Search className="h-5 w-5" />
          +
        </button>
        <button
          data-testid="button-zoom-out"
          onClick={(e) => { e.stopPropagation(); onZoomOut?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-xl h-12 w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Zoom Out"
        >
          <Search className="h-5 w-5" />
          -
        </button>
        <button
          data-testid="button-reset-zoom"
          onClick={(e) => { e.stopPropagation(); onResetZoom?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-sm font-medium h-12 px-4 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Reset Zoom"
        >
          Reset
        </button>
      </div>
    </>
  );
}
