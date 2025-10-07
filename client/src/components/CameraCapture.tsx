import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface CameraCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (photo: string) => void;
}

export function CameraCapture({ isOpen, onClose, onCapture }: CameraCaptureProps) {
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
        setError("Unable to access camera. Please check permissions.");
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
    <div className="fixed inset-0 z-50 bg-black">
      <div className="relative w-full h-full">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white p-4">
              <i className="fas fa-exclamation-triangle text-4xl mb-4"></i>
              <p className="mb-4">{error}</p>
              <Button onClick={handleClose}>Close</Button>
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
            
            {/* Rectangle guide overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full">
                {/* Dark overlay with cutout */}
                <defs>
                  <mask id="guideMask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect 
                      x="5%" 
                      y="calc(50% - 100px)" 
                      width="90%" 
                      height="200" 
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect 
                  width="100%" 
                  height="100%" 
                  fill="rgba(0,0,0,0.5)" 
                  mask="url(#guideMask)"
                />
                {/* Guide rectangle border */}
                <rect 
                  x="5%" 
                  y="calc(50% - 100px)" 
                  width="90%" 
                  height="200" 
                  fill="none" 
                  stroke="white" 
                  strokeWidth="2"
                  strokeDasharray="10,5"
                />
              </svg>
              
              {/* Instruction text */}
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 text-center">
                <p className="text-white text-lg font-medium bg-black/50 px-4 py-2 rounded">
                  Position patient label within the rectangle
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={handleClose}
                className="bg-white/10 text-white border-white hover:bg-white/20"
                data-testid="close-camera"
              >
                <i className="fas fa-times mr-2"></i>
                Cancel
              </Button>
              <Button
                onClick={capturePhoto}
                className="bg-accent hover:bg-accent/90"
                data-testid="capture-photo"
              >
                <i className="fas fa-camera mr-2"></i>
                Capture
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
