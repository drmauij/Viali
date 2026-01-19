import { useState, useRef, useEffect, useCallback } from "react";
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
  }) => void;
  onComplete: () => void;
  compressImage: (file: File) => Promise<string>;
}

type CameraMode = "codes" | "product";
type ProcessingStatus = "idle" | "capturing" | "processing" | "success" | "error";

export function DirectItemCamera({
  isOpen,
  onClose,
  onCodesExtracted,
  onProductInfoExtracted,
  onComplete,
  compressImage,
}: DirectItemCameraProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [mode, setMode] = useState<CameraMode>("codes");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setMode("codes");
      setStatus("idle");
      setStatusMessage("");
      setTimeout(() => {
        fileInputRef.current?.click();
      }, 100);
    }
  }, [isOpen]);

  const switchToProductMode = (message: string) => {
    setStatus("idle");
    setStatusMessage(message);
    setMode("product");
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 800);
  };

  const handleCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("processing");
    setStatusMessage(mode === "codes" ? t('items.analyzingCodes', 'Analyzing codes...') : t('items.analyzingProduct', 'Analyzing product...'));

    try {
      const compressedImage = await compressImage(file);

      if (mode === "codes") {
        const response = await fetch('/api/items/analyze-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: compressedImage }),
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
              onComplete();
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
          body: JSON.stringify({ image: compressedImage }),
        });
        
        if (!response.ok) throw new Error('Failed to analyze product');
        
        const result = await response.json();
        
        if (result.name) {
          onProductInfoExtracted({
            name: result.name,
            description: result.description,
          });
          setStatus("success");
          setStatusMessage(t('items.productNameExtracted', 'Product name extracted'));
        } else {
          setStatus("idle");
          setStatusMessage(t('items.couldNotExtractName', 'Could not extract name - opening form'));
        }
        
        setTimeout(() => {
          onComplete();
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
          onComplete();
        }, 1500);
      }
    } finally {
      e.target.value = '';
    }
  };

  const handleNoCodes = () => {
    setStatus("idle");
    setStatusMessage("");
    setMode("product");
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 100);
  };

  const handleCancel = () => {
    onClose();
  };

  if (!isOpen) return null;

  const isProcessing = status === "processing";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h2 className="text-xl font-semibold text-white mb-2">
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

        {statusMessage && (
          <div className={`mb-8 px-6 py-3 rounded-lg text-center ${
            status === "success" ? "bg-green-600/90 text-white" :
            status === "error" ? "bg-red-600/90 text-white" :
            status === "processing" ? "bg-blue-600/90 text-white" :
            "bg-gray-700/90 text-white"
          }`}>
            {isProcessing && <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />}
            {statusMessage}
          </div>
        )}

        <div className="w-48 h-48 border-4 border-white/30 rounded-2xl flex items-center justify-center mb-8">
          <Camera className="w-20 h-20 text-white/50" />
        </div>
      </div>

      <div className="p-6 pb-10 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex gap-3 max-w-md mx-auto">
          <Button
            variant="outline"
            size="lg"
            onClick={handleCancel}
            disabled={isProcessing}
            className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20"
            data-testid="button-camera-cancel"
          >
            <X className="w-5 h-5 mr-2" />
            {t('common.cancel', 'Cancel')}
          </Button>

          {mode === "codes" && (
            <Button
              variant="outline"
              size="lg"
              onClick={handleNoCodes}
              disabled={isProcessing}
              className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20"
              data-testid="button-no-codes"
            >
              <ArrowRight className="w-5 h-5 mr-2" />
              {t('items.noCodes', 'No Codes')}
            </Button>
          )}

          <Button
            size="lg"
            onClick={handleCapture}
            disabled={isProcessing}
            className="flex-1 bg-primary text-primary-foreground"
            data-testid="button-camera-capture"
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Camera className="w-5 h-5 mr-2" />
                {t('items.capture', 'Capture')}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
