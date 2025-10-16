import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Search, GripVertical, Camera } from "lucide-react";

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
  onCameraCapture?: (imageBase64: string, timestamp: number) => void;
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
  onCameraCapture,
}: StickyTimelineHeaderProps) {
  const chartRef = useRef<any>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

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

  // Open camera
  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please check permissions.');
    }
  };

  // Set video source when stream is available
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Close camera
  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  // Capture photo
  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
        const timestamp = Date.now();
        onCameraCapture?.(imageBase64, timestamp);
        closeCamera();
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

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
      <div className="sticky top-0 z-50 bg-background -mt-px" style={{ height: '32px' }}>
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
        className="fixed z-[9999] bg-background/80 backdrop-blur-md border-2 border-border/50 rounded-lg shadow-lg px-1.5 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-2 md:gap-4 cursor-grab active:cursor-grabbing select-none"
        style={{ left: `${position.x}px`, top: `${position.y}px`, transform: 'translate(-50%, 0)' }}
        data-testid="timeline-controls-panel"
      >
        {/* Drag Handle */}
        <div 
          className="p-0.5 sm:p-1 -ml-0.5 sm:-ml-1 text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
          title="Drag to reposition"
        >
          <GripVertical className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        
        <button
          data-testid="button-pan-left"
          onClick={(e) => { e.stopPropagation(); onPanLeft?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-lg sm:text-xl md:text-2xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Pan Left"
        >
          ‹
        </button>
        <button
          data-testid="button-pan-right"
          onClick={(e) => { e.stopPropagation(); onPanRight?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-lg sm:text-xl md:text-2xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Pan Right"
        >
          ›
        </button>
        <div className="border-l-2 border-border h-6 sm:h-8 mx-0.5 sm:mx-1" />
        <button
          data-testid="button-zoom-in"
          onClick={(e) => { e.stopPropagation(); onZoomIn?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-base sm:text-lg md:text-xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Zoom In"
        >
          <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          +
        </button>
        <button
          data-testid="button-zoom-out"
          onClick={(e) => { e.stopPropagation(); onZoomOut?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-base sm:text-lg md:text-xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Zoom Out"
        >
          <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          -
        </button>
        <button
          data-testid="button-reset-zoom"
          onClick={(e) => { e.stopPropagation(); onResetZoom?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-xs sm:text-sm font-medium h-8 sm:h-10 md:h-12 px-2 sm:px-3 md:px-4 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Reset Zoom"
        >
          Reset
        </button>
        <div className="border-l-2 border-border h-6 sm:h-8 mx-0.5 sm:mx-1" />
        <button
          data-testid="button-camera"
          onClick={(e) => { e.stopPropagation(); openCamera(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
          title="Camera"
        >
          <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>

      {/* Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-[10000] bg-black/90 flex flex-col items-center justify-center">
          {/* Warning Banner */}
          <div className="absolute top-0 left-0 right-0 bg-yellow-500 text-black px-4 py-3 text-center font-semibold">
            ⚠️ All photos will be sent to AI for analysis. Do not include any patient data of any kind.
          </div>

          {/* Video Preview */}
          <div className="relative w-full max-w-4xl aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
              data-testid="camera-preview"
            />
          </div>

          {/* Controls */}
          <div className="mt-6 flex gap-4">
            <button
              onClick={capturePhoto}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-md font-medium text-lg"
              data-testid="button-capture-photo"
            >
              Capture
            </button>
            <button
              onClick={closeCamera}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-8 py-3 rounded-md font-medium text-lg"
              data-testid="button-close-camera"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
