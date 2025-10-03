import { useState, useEffect, useRef } from "react";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onManualEntry: () => void;
}

export default function BarcodeScanner({ isOpen, onClose, onScan, onManualEntry }: BarcodeScannerProps) {
  const [torchEnabled, setTorchEnabled] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Use back camera
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const toggleTorch = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;

      if (capabilities.torch) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: !torchEnabled } as any],
          });
          setTorchEnabled(!torchEnabled);
        } catch (error) {
          console.error("Error toggling torch:", error);
        }
      }
    }
  };

  const handleScanResult = (result: string) => {
    onScan(result);
    onClose();
  };

  // Mock barcode scanning for demo - in production, integrate with a barcode scanning library
  const simulateScan = () => {
    // Simulate successful scan
    setTimeout(() => {
      handleScanResult("1234567890123"); // Mock barcode
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <div className="scanner-overlay">
      <div className="p-4 flex items-center justify-between">
        <button
          className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white"
          onClick={onClose}
          data-testid="scanner-close"
        >
          <i className="fas fa-times"></i>
        </button>
        <h2 className="text-white font-semibold">Scan Item</h2>
        <button
          className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white"
          onClick={toggleTorch}
          data-testid="scanner-torch"
        >
          <i className={`fas ${torchEnabled ? "fa-lightbulb text-yellow-300" : "fa-lightbulb"}`}></i>
        </button>
      </div>

      <div className="scanner-frame">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover absolute inset-0"
        />
        
        <div className="scanner-box relative z-10" onClick={simulateScan}>
          <div className="scanner-line"></div>
          {/* Corner markers */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary"></div>
          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary"></div>
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary"></div>
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary"></div>
        </div>
      </div>

      <div className="p-4 bg-black/50">
        <p className="text-white text-center mb-4">Position barcode within frame</p>
        <button
          className="action-button btn-primary w-full"
          onClick={onManualEntry}
          data-testid="manual-entry-button"
        >
          <i className="fas fa-keyboard"></i>
          <span>Manual Entry</span>
        </button>
      </div>
    </div>
  );
}
