import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import * as echarts from "echarts";
import { Search, GripVertical, Camera, Mic, Square, Loader2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface StickyTimelineHeaderProps {
  startTime: number;
  endTime: number;
  currentStart?: number;
  currentEnd?: number;
  isDark: boolean;
  activeToolMode?: 'hr' | 'bp' | 'spo2' | 'blend' | 'edit' | null;
  onPanLeft?: () => void;
  onPanRight?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  onCameraCapture?: (imageBase64: string, timestamp: number) => void;
  onVoiceCommand?: (audioBlob: Blob, timestamp: number) => void;
  onOpenSets?: () => void;
  showSetsButton?: boolean;
  isTouchDevice?: boolean;
}

export function StickyTimelineHeader({
  startTime,
  endTime,
  currentStart,
  currentEnd,
  isDark,
  activeToolMode = null,
  onPanLeft,
  onPanRight,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onCameraCapture,
  onVoiceCommand,
  onOpenSets,
  showSetsButton = false,
  isTouchDevice = false,
}: StickyTimelineHeaderProps) {
  const chartRef = useRef<any>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  const dragRefMedia = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0,
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingToastRef = useRef<{ dismiss: () => void } | null>(null);

  // Load position from localStorage or use default centered position
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('timeline-controls-position');
    if (saved) return JSON.parse(saved);
    // Default: centered both horizontally and vertically, slightly covering timeline header
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 - 40 };
  });

  // Load media controls position from localStorage or use default
  const [mediaPosition, setMediaPosition] = useState<{ x: number; y: number }>(() => {
    const saved = localStorage.getItem('timeline-media-controls-position');
    if (saved) return JSON.parse(saved);
    // Default: bottom-right corner
    return { x: window.innerWidth - 60, y: window.innerHeight - 100 };
  });

  // Save position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('timeline-controls-position', JSON.stringify(position));
  }, [position]);

  // Save media controls position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('timeline-media-controls-position', JSON.stringify(mediaPosition));
  }, [mediaPosition]);

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
      alert(t("anesthesia.timeline.cameraError"));
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

  // Start voice recording (press and hold)
  const startRecording = async () => {
    if (isProcessing || isRecording) return;
    
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(audioStream, {
        mimeType: 'audio/webm' // Use webm for broad browser support
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });
      
      mediaRecorder.addEventListener('stop', async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const timestamp = Date.now();
        
        setIsProcessing(true);
        
        // Stop all audio tracks
        audioStream.getTracks().forEach(track => track.stop());
        
        // Send to parent for processing
        if (onVoiceCommand) {
          await onVoiceCommand(audioBlob, timestamp);
        }
        
        setIsProcessing(false);
      });
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      
      // Show recording toast and store reference for manual dismissal
      const toastResult = toast({
        title: t("anesthesia.timeline.recording"),
        description: t("anesthesia.timeline.releaseToProcess"),
        duration: 30000, // Will auto-dismiss if user holds for 30 seconds
      });
      recordingToastRef.current = toastResult;
      
      // Safety timeout: Auto-stop after 30 seconds (in case button doesn't release)
      recordingTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording();
          toast({
            title: t("anesthesia.timeline.recordingStopped"),
            description: t("anesthesia.timeline.maxRecordingTime"),
            variant: "default",
          });
        }
      }, 30000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: t("anesthesia.timeline.micError"),
        description: t("anesthesia.timeline.micErrorDesc"),
        variant: "destructive",
      });
    }
  };
  
  // Stop voice recording (on button release)
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Dismiss the recording toast
      if (recordingToastRef.current) {
        recordingToastRef.current.dismiss();
        recordingToastRef.current = null;
      }
      
      // Clear safety timeout
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Dismiss recording toast if component unmounts while recording
      if (recordingToastRef.current) {
        recordingToastRef.current.dismiss();
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

  const handleDragStartMedia = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    dragRefMedia.current = {
      isDragging: true,
      startX: clientX - mediaPosition.x,
      startY: clientY - mediaPosition.y,
    };
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (dragRef.current.isDragging) {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        setPosition({
          x: clientX - dragRef.current.startX,
          y: clientY - dragRef.current.startY,
        });
      }
      
      if (dragRefMedia.current.isDragging) {
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        setMediaPosition({
          x: clientX - dragRefMedia.current.startX,
          y: clientY - dragRefMedia.current.startY,
        });
      }
    };

    const handleEnd = () => {
      dragRef.current.isDragging = false;
      dragRefMedia.current.isDragging = false;
      
      // Stop recording if active (handles case where mouse/touch is released outside button)
      if (mediaRecorderRef.current?.state === 'recording') {
        stopRecording();
      }
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
    const viewSpanHours = viewSpanMinutes / 60;
    
    // Adaptive interval based on view span:
    // - <= 30 min: 5-minute ticks
    // - <= 6 hours: 15-minute ticks
    // - <= 24 hours: 1-hour ticks
    // - > 24 hours: 2-hour ticks (with day labels at midnight)
    let intervalMs: number;
    if (viewSpanMinutes <= 30) {
      intervalMs = 5 * 60 * 1000; // 5 minutes
    } else if (viewSpanHours <= 6) {
      intervalMs = 15 * 60 * 1000; // 15 minutes
    } else if (viewSpanHours <= 24) {
      intervalMs = 60 * 60 * 1000; // 1 hour
    } else {
      intervalMs = 2 * 60 * 60 * 1000; // 2 hours
    }
    
    // Custom formatter that shows date at midnight crossings
    const formatAxisLabel = (value: number): string => {
      const date = new Date(value);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      
      // At midnight (00:00), show just the date with prominent styling
      if (hours === 0 && minutes === 0) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        return `{date|${day}.${month}.}`;
      }
      
      // Regular time format
      const hh = hours.toString().padStart(2, '0');
      const mm = minutes.toString().padStart(2, '0');
      return `${hh}:${mm}`;
    };

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
          formatter: formatAxisLabel,
          fontSize: 11,
          fontFamily: "Poppins, sans-serif",
          color: isDark ? "#ffffff" : "#000000",
          fontWeight: 500,
          margin: -2,
          rich: {
            bold: {
              fontWeight: 700,
              fontSize: 12,
              color: isDark ? "#ffffff" : "#000000",
            },
            date: {
              fontWeight: 800,
              fontSize: 13,
              color: isDark ? "#60a5fa" : "#2563eb", // Blue color to stand out
              backgroundColor: isDark ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)",
              borderRadius: 3,
              padding: [2, 4, 2, 4],
            },
          },
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
      try {
        const chart = chartRef.current.getEchartsInstance();
        // Safety check: ensure chart exists and is not disposed
        if (!chart || chart.isDisposed?.()) return;
        
        // Calculate interval for dynamic updates
        const visibleStart = currentStart || startTime;
        const visibleEnd = currentEnd || endTime;
        const visibleRange = visibleEnd - visibleStart;
        const viewSpanMinutes = visibleRange / (60 * 1000);
        const viewSpanHours = viewSpanMinutes / 60;
        
        // Adaptive interval based on view span
        let intervalMs: number;
        if (viewSpanMinutes <= 30) {
          intervalMs = 5 * 60 * 1000; // 5 minutes
        } else if (viewSpanHours <= 6) {
          intervalMs = 15 * 60 * 1000; // 15 minutes
        } else if (viewSpanHours <= 24) {
          intervalMs = 60 * 60 * 1000; // 1 hour
        } else {
          intervalMs = 2 * 60 * 60 * 1000; // 2 hours
        }
        
        // Custom formatter that shows date at midnight crossings
        const formatAxisLabel = (value: number): string => {
          const date = new Date(value);
          const hours = date.getHours();
          const minutes = date.getMinutes();
          
          // At midnight (00:00), show just the date with prominent styling
          if (hours === 0 && minutes === 0) {
            const day = date.getDate();
            const month = date.getMonth() + 1;
            return `{date|${day}.${month}.}`;
          }
          
          // Regular time format
          const hh = hours.toString().padStart(2, '0');
          const mm = minutes.toString().padStart(2, '0');
          return `${hh}:${mm}`;
        };
        
        chart.setOption({
          xAxis: {
            min: visibleStart,
            max: visibleEnd,
            interval: intervalMs,
            axisLabel: {
              formatter: formatAxisLabel,
              rich: {
                bold: {
                  fontWeight: 700,
                  fontSize: 12,
                },
                date: {
                  fontWeight: 800,
                  fontSize: 13,
                  color: isDark ? "#60a5fa" : "#2563eb",
                  backgroundColor: isDark ? "rgba(37, 99, 235, 0.2)" : "rgba(37, 99, 235, 0.1)",
                  borderRadius: 3,
                  padding: [2, 4, 2, 4],
                },
              },
            },
          },
        });
      } catch (e) {
        // Chart may be disposed during navigation - ignore errors
      }
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
      {/* Hidden on touch devices since gestures handle pan/zoom */}
      {/* Disable pointer events in edit mode to allow clicking on vital points */}
      {!isTouchDevice && (
      <div 
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        className={`fixed z-[9999] bg-background/80 backdrop-blur-md border-2 border-border/50 rounded-lg shadow-lg px-1.5 sm:px-3 py-1 sm:py-1.5 flex items-center gap-1 sm:gap-2 md:gap-4 cursor-grab active:cursor-grabbing select-none ${activeToolMode === 'edit' ? 'pointer-events-none' : ''}`}
        style={{ left: `${position.x}px`, top: `${position.y}px`, transform: 'translate(-50%, 0)' }}
        data-testid="timeline-controls-panel"
      >
        {/* Drag Handle - Re-enable pointer events for individual buttons in edit mode */}
        <div 
          className="p-0.5 sm:p-1 -ml-0.5 sm:-ml-1 text-muted-foreground hover:text-foreground transition-colors touch-manipulation pointer-events-auto"
          title={t('timeline.dragToReposition', 'Drag to reposition')}
        >
          <GripVertical className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>

        <button
          data-testid="button-pan-left"
          onClick={(e) => { e.stopPropagation(); onPanLeft?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-lg sm:text-xl md:text-2xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t('timeline.panLeft', 'Pan Left')}
        >
          ‹
        </button>
        <button
          data-testid="button-pan-right"
          onClick={(e) => { e.stopPropagation(); onPanRight?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-lg sm:text-xl md:text-2xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t('timeline.panRight', 'Pan Right')}
        >
          ›
        </button>
        <div className="border-l-2 border-border h-6 sm:h-8 mx-0.5 sm:mx-1 pointer-events-auto" />
        <button
          data-testid="button-zoom-in"
          onClick={(e) => { e.stopPropagation(); onZoomIn?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-base sm:text-lg md:text-xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t('timeline.zoomIn', 'Zoom In')}
        >
          <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          +
        </button>
        <button
          data-testid="button-zoom-out"
          onClick={(e) => { e.stopPropagation(); onZoomOut?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-base sm:text-lg md:text-xl h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t('timeline.zoomOut', 'Zoom Out')}
        >
          <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5" />
          -
        </button>
        <button
          data-testid="button-reset-zoom"
          onClick={(e) => { e.stopPropagation(); onResetZoom?.(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md text-xs sm:text-sm font-medium h-8 sm:h-10 md:h-12 px-2 sm:px-3 md:px-4 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t("anesthesia.timeline.reset")}
        >
          {t("anesthesia.timeline.reset")}
        </button>
      </div>
      )}

      {/* Separate Draggable Media Controls Container - Stacked Vertically */}
      {/* Disable pointer events in edit mode to allow clicking on vital points */}
      <div 
        className={`fixed z-[9999] bg-background/80 backdrop-blur-md border-2 border-border/50 rounded-lg shadow-lg px-1.5 sm:px-3 py-1 sm:py-1.5 flex flex-col items-center gap-1 sm:gap-2 select-none ${activeToolMode === 'edit' ? 'pointer-events-none' : ''}`}
        style={{ left: `${mediaPosition.x}px`, top: `${mediaPosition.y}px`, transform: 'translate(-50%, -50%)' }}
        data-testid="timeline-media-controls-panel"
      >
        {/* Camera Button - Re-enable pointer events for individual buttons in edit mode */}
        <button
          data-testid="button-camera"
          onClick={(e) => { e.stopPropagation(); openCamera(); }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="hover:bg-muted active:bg-muted/80 rounded-md h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation cursor-pointer pointer-events-auto"
          title={t('common.camera', 'Camera')}
        >
          <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
        
        {/* Drag Handle - Between icons with increased mobile size */}
        <div 
          onMouseDown={handleDragStartMedia}
          onTouchStart={handleDragStartMedia}
          className="py-2 sm:py-1 text-muted-foreground hover:text-foreground transition-colors touch-manipulation cursor-grab active:cursor-grabbing pointer-events-auto"
          title={t('timeline.dragToReposition', 'Drag to reposition')}
        >
          <GripVertical className="h-6 w-6 sm:h-5 sm:w-5 rotate-90" />
        </div>
        
        {/* Voice Recording Button */}
        <button
          data-testid="button-voice"
          onMouseDown={(e) => { 
            e.stopPropagation(); 
            if (!isProcessing && !isRecording) {
              startRecording();
            }
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            if (isRecording) {
              stopRecording();
            }
          }}
          onMouseLeave={(e) => {
            // Stop recording if mouse leaves while holding
            if (isRecording) {
              stopRecording();
            }
          }}
          onTouchStart={(e) => { 
            e.stopPropagation(); 
            if (!isProcessing && !isRecording) {
              startRecording();
            }
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            if (isRecording) {
              stopRecording();
            }
          }}
          onTouchCancel={(e) => {
            // Stop recording if touch is cancelled (e.g., interrupted by system gesture)
            if (isRecording) {
              stopRecording();
            }
          }}
          disabled={isProcessing}
          className={`rounded-md h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex items-center justify-center transition-colors touch-manipulation select-none ${
            isRecording 
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse cursor-pointer' 
              : isProcessing 
                ? 'bg-muted/50 cursor-not-allowed' 
                : 'hover:bg-muted active:bg-muted/80 cursor-pointer'
          }`}
          title={isRecording ? t("anesthesia.timeline.recordingRelease") : isProcessing ? t("anesthesia.timeline.processing") : t("anesthesia.timeline.pressToRecord")}
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
          ) : isRecording ? (
            <Square className="h-4 w-4 sm:h-5 sm:w-5" />
          ) : (
            <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
        </button>
      </div>

      {/* Camera Modal - Responsive to portrait/landscape orientation */}
      {showCamera && (
        <div className="fixed inset-0 z-[10000] bg-black/90 flex flex-col portrait:justify-center landscape:justify-start items-center">
          {/* Warning Banner - Compact in landscape */}
          <div className="w-full bg-yellow-500 text-black px-2 py-1.5 portrait:py-3 text-center text-xs portrait:text-sm font-semibold portrait:absolute portrait:top-0 landscape:relative landscape:flex-shrink-0">
            {t("anesthesia.timeline.aiPhotoWarning")}
          </div>

          {/* Video Preview - Flexible sizing for orientation */}
          <div className="relative portrait:w-full portrait:max-w-4xl portrait:aspect-video landscape:flex-1 landscape:w-full landscape:h-full flex items-center justify-center portrait:mt-16">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="portrait:w-full portrait:h-full landscape:max-h-full landscape:max-w-full object-contain"
              data-testid="camera-preview"
            />
          </div>

          {/* Controls - Cancel left, Capture right for easy thumb access */}
          <div className="portrait:mt-6 landscape:absolute landscape:bottom-4 landscape:left-0 landscape:right-0 landscape:px-6 flex justify-between portrait:w-full portrait:px-6 portrait:mb-8 landscape:mb-0 z-10">
            <button
              onClick={closeCamera}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-6 portrait:px-8 py-2.5 portrait:py-3 rounded-md font-medium text-base portrait:text-lg shadow-lg"
              data-testid="button-close-camera"
            >
              {t("cancel")}
            </button>
            <button
              onClick={capturePhoto}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 portrait:px-8 py-2.5 portrait:py-3 rounded-md font-medium text-base portrait:text-lg shadow-lg"
              data-testid="button-capture-photo"
            >
              {t("anesthesia.timeline.capture")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
