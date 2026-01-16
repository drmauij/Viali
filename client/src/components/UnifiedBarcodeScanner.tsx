import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const bluetoothInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [lastDetectedCode, setLastDetectedCode] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  
  const readerId = useRef(`unified-reader-${Date.now()}`);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (error) {
        console.log("Scanner cleanup:", error);
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (scannerActive || scannerRef.current) return;
    
    const containerElement = document.getElementById(readerId.current);
    if (!containerElement) {
      console.error("Scanner container not found");
      return;
    }

    try {
      setScannerActive(true);
      const html5QrCode = new Html5Qrcode(readerId.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.5,
        disableFlip: false,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText, result) => {
          console.log("[UnifiedScanner] Barcode detected:", decodedText, result?.result?.format?.formatName);
          setLastDetectedCode(decodedText);
          
          stopScanner();
          onBarcodeDetected(decodedText, result?.result?.format?.formatName || 'unknown');
          onClose();
        },
        () => {}
      );
      
      console.log("[UnifiedScanner] Scanner started successfully");
    } catch (error: any) {
      console.error("[UnifiedScanner] Error starting scanner:", error);
      setScannerActive(false);
      
      if (error.message?.includes("NotAllowedError") || error.message?.includes("Permission")) {
        setError(t('camera.errorAccessing'));
      }
    }
  }, [scannerActive, onBarcodeDetected, onClose, stopScanner, t]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setLastDetectedCode(null);
      setError(null);
      setIsCapturing(false);
      return;
    }

    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    if (bluetoothInputRef.current) {
      bluetoothInputRef.current.focus();
    }

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, startScanner, stopScanner]);

  const handleBluetoothInput = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value) {
        console.log("[UnifiedScanner] Bluetooth scanner input:", value);
        stopScanner();
        onBarcodeDetected(value, 'bluetooth');
        onClose();
      }
    }
  }, [onBarcodeDetected, onClose, stopScanner]);

  const captureForOcr = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    
    try {
      await stopScanner();
      
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
      });
      
      const video = document.createElement('video');
      video.srcObject = mediaStream;
      video.playsInline = true;
      
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(() => resolve());
        };
      });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const photo = canvas.toDataURL("image/jpeg", 0.9);
        
        mediaStream.getTracks().forEach(track => track.stop());
        
        onImageCapture(photo);
        onClose();
      } else {
        mediaStream.getTracks().forEach(track => track.stop());
        setError("Failed to capture image");
      }
    } catch (error: any) {
      console.error("[UnifiedScanner] OCR capture error:", error);
      setError(error.message || "Failed to capture image");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, stopScanner, onImageCapture, onClose]);

  const handleClose = useCallback(() => {
    stopScanner();
    onClose();
  }, [stopScanner, onClose]);

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
                  {hint || t('items.pointAtGtinBarcode', 'Point at GTIN/EAN barcode')}
                </p>
                <p className="text-white/70 text-xs mt-1">
                  {t('items.autoDetectOrCapture', 'Auto-detects barcodes • Tap capture for OCR')}
                </p>
              </div>
            </div>

            <div 
              ref={scannerContainerRef}
              className="flex-1 relative"
            >
              <div 
                id={readerId.current} 
                className="w-full h-full"
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
              
              {scannerActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="border-2 border-dashed border-green-400/50 rounded-lg" 
                       style={{ width: 280, height: 180 }}>
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-400 rounded-tl"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-400 rounded-tr"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-400 rounded-bl"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-400 rounded-br"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between z-10 bg-gradient-to-t from-black/80 to-transparent pt-12">
              <Button
                variant="outline"
                onClick={handleClose}
                className="bg-white/10 text-white border-white hover:bg-white/20 px-6"
                data-testid="close-scanner"
              >
                <i className="fas fa-times mr-2"></i>
                {t('common.cancel')}
              </Button>
              
              <Button
                onClick={captureForOcr}
                disabled={isCapturing}
                className="bg-accent hover:bg-accent/90 px-6 disabled:opacity-50"
                data-testid="capture-for-ocr"
              >
                <i className={`fas ${isCapturing ? 'fa-spinner fa-spin' : 'fa-camera'} mr-2`}></i>
                {isCapturing ? t('common.loading') : t('items.captureForOcr', 'Capture for OCR')}
              </Button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
