import { useState, useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  onManualEntry: () => void;
}

export default function BarcodeScanner({ isOpen, onClose, onScan, onManualEntry }: BarcodeScannerProps) {
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const readerIdRef = useRef(`reader-${Date.now()}`);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const startScanner = async () => {
    if (scanning || scannerRef.current) return;

    try {
      setScanning(true);
      const html5QrCode = new Html5Qrcode(readerIdRef.current);
      scannerRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => {
          handleScanResult(decodedText);
        },
        (errorMessage) => {
        }
      );
    } catch (error) {
      console.error("Error starting scanner:", error);
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (error) {
        console.error("Error stopping scanner:", error);
      }
    }
    setScanning(false);
  };

  const handleScanResult = (result: string) => {
    stopScanner();
    onScan(result);
    onClose();
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
        <h2 className="text-white font-semibold">Scan Barcode</h2>
        <div className="w-10"></div>
      </div>

      <div className="scanner-frame relative">
        <div id={readerIdRef.current} className="w-full h-full"></div>
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
