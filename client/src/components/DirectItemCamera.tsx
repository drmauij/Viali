import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2, X, Camera, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DirectItemCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onCodesExtracted: (codes: {
    gtin?: string;
    pharmacode?: string;
    lotNumber?: string;
    expiryDate?: string;
    migel?: string;
    atc?: string;
  }) => Promise<{ galexisFound: boolean; productName?: string }>;
  onProductInfoExtracted: (info: {
    name?: string;
    description?: string;
    unitsPerPack?: number;
  }) => void;
  onComplete: () => void;
}

type CameraMode = "codes" | "product";
type ProcessingStatus = "idle" | "capturing" | "processing" | "success" | "error";

export function DirectItemCamera({
  isOpen,
  onClose,
  onCodesExtracted,
  onProductInfoExtracted,
  onComplete,
}: DirectItemCameraProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [mode, setMode] = useState<CameraMode>("codes");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const isProcessing = status === "processing" || status === "capturing";

  // Start camera when opened
  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      setIsVideoReady(false);
      setCameraError(null);
      setMode("codes");
      setStatus("idle");
      setStatusMessage("");
      return;
    }

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
        });
        
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
          };
          videoRef.current.onplaying = () => {
            setIsVideoReady(true);
          };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setCameraError(t('camera.errorAccessing', 'Could not access camera'));
      }
    }

    startCamera();
  }, [isOpen, t]);

  const switchToProductMode = useCallback((message: string) => {
    setStatus("idle");
    setStatusMessage(message);
    setMode("product");
  }, []);

  const captureAndProcess = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isVideoReady) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) {
      return;
    }

    setStatus("processing");
    setStatusMessage(mode === "codes" 
      ? t('items.analyzingCodes', 'Analyzing codes...') 
      : t('items.analyzingProduct', 'Analyzing product...')
    );

    // Capture full frame
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);

    // Convert to base64 with compression
    const maxDimension = 1200;
    let finalWidth = videoWidth;
    let finalHeight = videoHeight;
    
    if (videoWidth > maxDimension || videoHeight > maxDimension) {
      const ratio = Math.min(maxDimension / videoWidth, maxDimension / videoHeight);
      finalWidth = Math.round(videoWidth * ratio);
      finalHeight = Math.round(videoHeight * ratio);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = finalWidth;
      tempCanvas.height = finalHeight;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0, finalWidth, finalHeight);
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        ctx.drawImage(tempCanvas, 0, 0);
      }
    }

    const imageData = canvas.toDataURL("image/jpeg", 0.8);

    try {
      if (mode === "codes") {
        const response = await fetch('/api/items/analyze-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: imageData }),
        });
        
        if (!response.ok) throw new Error('Failed to analyze codes');
        
        const result = await response.json();
        const extractedGtin = result.gtin || '';
        const hasAnyCodes = extractedGtin || result.pharmacode;

        if (hasAnyCodes) {
          setStatusMessage(t('items.codesFound', 'Codes found! Looking up...'));
          
          const { galexisFound, productName } = await onCodesExtracted({
            gtin: result.gtin,
            pharmacode: result.pharmacode,
            lotNumber: result.lotNumber,
            expiryDate: result.expiryDate,
            migel: result.migel,
            atc: result.atc,
          });

          if (galexisFound) {
            setStatus("success");
            setStatusMessage(t('items.productFoundComplete', 'Product found: {{name}}', { name: productName || 'Item' }));
            setTimeout(() => {
              stopCameraAndComplete();
            }, 1000);
          } else {
            switchToProductMode(t('items.codesNotInDatabase', 'Codes saved. Not in database - capture product name.'));
          }
        } else {
          switchToProductMode(t('items.noCodesDetected', 'No codes detected. Capture product name.'));
        }
      } else {
        const response = await fetch('/api/items/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: imageData }),
        });
        
        if (!response.ok) throw new Error('Failed to analyze product');
        
        const result = await response.json();
        
        if (result.name) {
          onProductInfoExtracted({
            name: result.name,
            description: result.description,
            unitsPerPack: result.unitsPerPack,
          });
          setStatus("success");
          setStatusMessage(t('items.productNameExtracted', 'Product name extracted'));
        } else {
          setStatus("idle");
          setStatusMessage(t('items.couldNotExtractName', 'Could not extract name - opening form'));
        }
        
        setTimeout(() => {
          stopCameraAndComplete();
        }, 800);
      }
    } catch (error: any) {
      console.error('Camera capture error:', error);
      setStatus("error");
      setStatusMessage(error.message || t('common.error', 'Error'));
      
      if (mode === "codes") {
        setTimeout(() => {
          switchToProductMode(t('items.ocrFailed', 'OCR failed. Capture product name.'));
        }, 1500);
      } else {
        setTimeout(() => {
          stopCameraAndComplete();
        }, 1500);
      }
    }
  }, [isVideoReady, mode, t, onCodesExtracted, onProductInfoExtracted, switchToProductMode]);

  const stopCameraAndComplete = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsVideoReady(false);
    onComplete();
  }, [stream, onComplete]);

  const handleNoCodes = useCallback(() => {
    setStatus("idle");
    setStatusMessage("");
    setMode("product");
  }, []);

  const handleCancel = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsVideoReady(false);
    onClose();
  }, [stream, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] bg-black"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative w-full h-full">
        {cameraError ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white p-4">
              <X className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <p className="mb-4">{cameraError}</p>
              <Button onClick={handleCancel}>{t('common.close', 'Close')}</Button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            
            {/* Top instruction bar */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-1">
                  {mode === "codes" 
                    ? t('items.step1ScanCodes', 'Step 1: Scan Codes')
                    : t('items.step2CaptureProduct', 'Step 2: Capture Product Name')
                  }
                </h2>
                <p className="text-gray-300 text-sm">
                  {mode === "codes"
                    ? t('items.pointAtGtinPharmacode', 'Point camera at GTIN/Pharmacode barcode')
                    : t('items.pointAtProductName', 'Point camera at product name/label')
                  }
                </p>
              </div>
            </div>

            {/* Status message overlay */}
            {statusMessage && (
              <div className="absolute top-24 left-1/2 -translate-x-1/2">
                <div className={`px-6 py-3 rounded-lg text-center ${
                  status === "success" ? "bg-green-600/90 text-white" :
                  status === "error" ? "bg-red-600/90 text-white" :
                  status === "processing" ? "bg-blue-600/90 text-white" :
                  "bg-gray-700/90 text-white"
                }`}>
                  {isProcessing && <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />}
                  {statusMessage}
                </div>
              </div>
            )}

            {/* Bottom controls - positioned higher to account for mobile browser chrome */}
            <div className="absolute bottom-0 left-0 right-0 pt-6 px-3 pb-24 bg-gradient-to-t from-black via-black/70 to-transparent">
              {/* Large Capture button on top */}
              <div className="mb-3 px-2">
                <Button
                  size="lg"
                  onClick={captureAndProcess}
                  disabled={isProcessing || !isVideoReady}
                  className="w-full h-14 bg-primary text-primary-foreground text-lg font-semibold"
                  data-testid="button-camera-capture"
                >
                  {isProcessing ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : !isVideoReady ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mr-2" />
                      {t('items.capture', 'Capture')}
                    </>
                  )}
                </Button>
              </div>
              {/* Secondary buttons below */}
              <div className="flex gap-2 px-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    if (stream) {
                      stream.getTracks().forEach(track => track.stop());
                      setStream(null);
                    }
                    setIsVideoReady(false);
                    onComplete();
                  }}
                  disabled={isProcessing}
                  className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20 text-sm"
                  data-testid="button-camera-manual-entry"
                >
                  <X className="w-4 h-4 mr-1" />
                  {t('items.manualEntry', 'Manual Entry')}
                </Button>

                {mode === "codes" && (
                  <Button
                    variant="outline"
                    size="default"
                    onClick={handleNoCodes}
                    disabled={isProcessing}
                    className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20 text-sm"
                    data-testid="button-no-codes"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    {t('items.noCodes', 'No Codes')}
                  </Button>
                )}
              </div>
            </div>

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
