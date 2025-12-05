import { useRef, useEffect, useState, useCallback } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(!!value);

  // Initialize canvas with proper size based on container
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get the actual displayed size
    const displayWidth = container.clientWidth - 16; // Account for padding
    const displayHeight = 150;
    
    // Set canvas internal resolution (2x for retina displays)
    const scale = window.devicePixelRatio || 1;
    canvas.width = displayWidth * scale;
    canvas.height = displayHeight * scale;
    
    // Set display size
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    // Scale the context for retina
    ctx.scale(scale, scale);
    
    // Set drawing style
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";
  }, []);

  useEffect(() => {
    initializeCanvas();
    
    // Re-initialize on resize
    const handleResize = () => {
      initializeCanvas();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initializeCanvas]);

  useEffect(() => {
    if (value && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = value;
        setHasSignature(true);
      }
    }
  }, [value]);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Calculate proper coordinates accounting for display scaling
    const scaleX = rect.width / canvas.width * (window.devicePixelRatio || 1);
    const scaleY = rect.height / canvas.height * (window.devicePixelRatio || 1);
    
    const x = (clientX - rect.left) / scaleX;
    const y = (clientY - rect.top) / scaleY;
    
    return { x, y };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);

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
      <div ref={containerRef} className="border rounded-md bg-white dark:bg-gray-900 p-2">
        <canvas
          ref={canvasRef}
          className="border rounded cursor-crosshair touch-none"
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
