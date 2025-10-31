import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Check } from "lucide-react";

interface SignatureCanvasProps {
  value?: string;
  onChange: (signature: string) => void;
  label?: string;
  className?: string;
}

export function SignatureCanvas({ value, onChange, label, className = "" }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);

  useEffect(() => {
    if (value && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
        };
        img.src = value;
        setHasSignature(true);
      }
    }
  }, [value]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL("image/png");
        onChange(dataUrl);
        setHasSignature(true);
      }
      setIsDrawing(false);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
    setHasSignature(false);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="border rounded-md bg-white dark:bg-gray-900 p-2">
        <canvas
          ref={canvasRef}
          width={400}
          height={150}
          className="border rounded cursor-crosshair touch-none w-full"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          data-testid={`canvas-${label?.toLowerCase().replace(/\s+/g, "-")}`}
        />
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clear}
            disabled={!hasSignature}
            data-testid={`button-clear-${label?.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
          {hasSignature && (
            <span className="flex items-center text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4 mr-1" />
              Signed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
