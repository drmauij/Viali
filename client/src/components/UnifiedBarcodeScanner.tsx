import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface UnifiedBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeDetected: (barcode: string, format: string) => void;
  onImageCapture: (photo: string) => void;
  hint?: string;
}

export function UnifiedBarcodeScanner({ 
  isOpen, 
  onClose, 
  onBarcodeDetected,
  onImageCapture,
  hint 
}: UnifiedBarcodeScannerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const bluetoothInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsVideoReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      console.log("[UnifiedScanner] Requesting camera access...");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
      });
      
      streamRef.current = mediaStream;
      console.log("[UnifiedScanner] Got media stream");
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        
        // Wait for video to be fully loaded and playing
        videoRef.current.onloadedmetadata = () => {
          console.log("[UnifiedScanner] Video metadata loaded");
          videoRef.current?.play().then(() => {
            console.log("[UnifiedScanner] Video playing");
            // Wait a moment for the camera to stabilize and ensure we have valid dimensions
            setTimeout(() => {
              if (videoRef.current) {
                const w = videoRef.current.videoWidth;
                const h = videoRef.current.videoHeight;
                console.log(`[UnifiedScanner] Video dimensions: ${w}x${h}`);
                if (w > 0 && h > 0) {
                  setIsVideoReady(true);
                } else {
                  // Retry after another delay
                  setTimeout(() => {
                    if (videoRef.current && videoRef.current.videoWidth > 0) {
                      setIsVideoReady(true);
                    }
                  }, 500);
                }
              }
            }, 300);
          }).catch(err => {
            console.error("[UnifiedScanner] Video play error:", err);
            setError("Failed to start camera preview");
          });
        };
      }
    } catch (error: any) {
      console.error("[UnifiedScanner] Camera error:", error);
      if (error.name === "NotAllowedError" || error.message?.includes("Permission")) {
        setError(t('camera.errorAccessing'));
      } else {
        setError(error.message || "Failed to access camera");
      }
    }
  }, [t]);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setError(null);
      setIsCapturing(false);
      return;
    }

    startCamera();

    if (bluetoothInputRef.current) {
      bluetoothInputRef.current.focus();
    }

    return () => {
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  const handleBluetoothInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value) {
        console.log("[UnifiedScanner] Bluetooth scanner input:", value);
        stopStream();
        onBarcodeDetected(value, 'bluetooth');
        onClose();
      }
    }
  }, [onBarcodeDetected, onClose, stopStream]);

  const captureForOcr = useCallback(async () => {
    const video = videoRef.current;
    
    // Validate video is ready with valid dimensions
    if (!video) {
      console.error("[UnifiedScanner] No video element");
      return;
    }
    
    if (isCapturing) {
      console.log("[UnifiedScanner] Already capturing");
      return;
    }
    
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    console.log(`[UnifiedScanner] Capture attempt - dimensions: ${videoWidth}x${videoHeight}, ready: ${isVideoReady}`);
    
    if (videoWidth <= 0 || videoHeight <= 0) {
      console.error("[UnifiedScanner] Invalid video dimensions");
      setError("Camera not ready. Please wait and try again.");
      return;
    }
    
    setIsCapturing(true);
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
        const photo = canvas.toDataURL("image/jpeg", 0.9);
        
        // Validate the captured image has actual content (not just empty)
        if (photo.length < 1000) {
          console.error("[UnifiedScanner] Captured image too small:", photo.length);
          setError("Failed to capture image. Please try again.");
          setIsCapturing(false);
          return;
        }
        
        console.log(`[UnifiedScanner] Captured image: ${photo.length} bytes`);
        
        stopStream();
        onImageCapture(photo);
        onClose();
      } else {
        setError("Failed to capture image");
      }
    } catch (error: any) {
      console.error("[UnifiedScanner] OCR capture error:", error);
      setError(error.message || "Failed to capture image");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, isVideoReady, stopStream, onImageCapture, onClose]);

  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-black"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative w-full h-full flex flex-col">
        <input
          ref={bluetoothInputRef}
          type="text"
          className="absolute opacity-0 pointer-events-none"
          style={{ position: 'absolute', left: '-9999px' }}
          onKeyDown={handleBluetoothInput}
          autoComplete="off"
          data-testid="bluetooth-scanner-input"
        />

        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white p-4">
              <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
              <p className="mb-4">{error}</p>
              <Button onClick={handleClose}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="absolute top-4 left-0 right-0 text-center z-20 pointer-events-none">
              <div className="inline-block bg-black/70 px-4 py-2 rounded-lg">
                <p className="text-white text-base font-medium">
                  {hint || t('items.captureItemPhoto', 'Take a photo of the item label')}
                </p>
                <p className="text-white/70 text-xs mt-1">
                  {t('items.ocrWillExtractInfo', 'AI will extract item information from the photo')}
                </p>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {!isVideoReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  <div className="text-white text-center">
                    <i className="fas fa-spinner fa-spin text-3xl mb-2"></i>
                    <p>{t('common.loading')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between z-10 bg-gradient-to-t from-black/80 to-transparent pt-12">
              <Button
                variant="outline"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handleClose}
                className="bg-white/10 text-white border-white hover:bg-white/20 px-6 touch-manipulation"
                data-testid="close-scanner"
              >
                <i className="fas fa-times mr-2"></i>
                {t('common.cancel')}
              </Button>
              
              <Button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={captureForOcr}
                disabled={isCapturing || !isVideoReady}
                className="bg-accent hover:bg-accent/90 px-6 disabled:opacity-50 touch-manipulation"
                data-testid="capture-for-ocr"
              >
                <i className={`fas ${isCapturing ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                {isCapturing ? t('common.loading') : t('items.capture', 'Capture')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
