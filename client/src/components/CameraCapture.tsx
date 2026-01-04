import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photo: string) => void;
  fullFrame?: boolean; // If true, captures the full video frame instead of cropping
}

export function CameraCapture({ isOpen, onClose, onCapture, fullFrame = false }: CameraCaptureProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        setStream(null);
      }
      return;
    }

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
        });
        
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
        setError(t('camera.errorAccessing'));
      }
    }

    startCamera();
  }, [isOpen]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (fullFrame) {
      // Full frame capture for documents
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    } else {
      // Define crop rectangle (horizontal, centered, signature-pad sized)
      const cropWidth = Math.min(videoWidth * 0.9, 800);
      const cropHeight = 200;
      const cropX = (videoWidth - cropWidth) / 2;
      const cropY = (videoHeight - cropHeight) / 2;

      // Set canvas size to crop size
      canvas.width = cropWidth;
      canvas.height = cropHeight;

      // Draw the cropped portion
      ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight,  // Source rectangle
        0, 0, cropWidth, cropHeight            // Destination rectangle
      );
    }

    // Convert to base64
    const photo = canvas.toDataURL("image/jpeg", 0.9);
    
    onCapture(photo);
    handleClose();
  };

  const handleClose = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <div className="relative w-full h-full">
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
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            
            {/* Rectangle guide overlay - only shown when not in fullFrame mode */}
            {!fullFrame && (
              <div className="absolute inset-0 pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {/* Dark overlay with cutout */}
                  <defs>
                    <mask id="guideMask">
                      <rect width="100" height="100" fill="white" />
                      <rect 
                        x="5" 
                        y="40" 
                        width="90" 
                        height="20" 
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect 
                    width="100" 
                    height="100" 
                    fill="rgba(0,0,0,0.5)" 
                    mask="url(#guideMask)"
                  />
                  {/* Guide rectangle border */}
                  <rect 
                    x="5" 
                    y="40" 
                    width="90" 
                    height="20" 
                    fill="none" 
                    stroke="white" 
                    strokeWidth="0.3"
                    strokeDasharray="2,1"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                
                {/* Instruction text */}
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center">
                  <p className="text-white text-lg font-medium bg-black/50 px-4 py-2 rounded">
                    {t('controlled.positionLabel')}
                  </p>
                </div>
              </div>
            )}
            
            {/* Full frame instruction */}
            {fullFrame && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                <p className="text-white text-lg font-medium bg-black/50 px-4 py-2 rounded">
                  {t('anesthesia.patientDetail.pointAtDocument', 'Point camera at document')}
                </p>
              </div>
            )}

            {/* Controls - Cancel left, Capture right for easy thumb access */}
            <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between">
              <Button
                variant="outline"
                onClick={handleClose}
                className="bg-white/10 text-white border-white hover:bg-white/20 px-6"
                data-testid="close-camera"
              >
                <i className="fas fa-times mr-2"></i>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={capturePhoto}
                className="bg-accent hover:bg-accent/90 px-6"
                data-testid="capture-photo"
              >
                <i className="fas fa-camera mr-2"></i>
                {t('controlled.capture')}
              </Button>
            </div>

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}
      </div>
    </div>
  );
}
