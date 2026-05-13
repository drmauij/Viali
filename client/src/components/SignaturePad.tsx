import { useRef, useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signature: string) => void;
  title?: string;
}

export default function SignaturePad({ isOpen, onClose, onSave, title = "Your Signature" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const ratioRef = useRef<number>(1);
  // Track the last drawn point so each new pointer sample can be joined with
  // a quadratic curve through the midpoint — produces fluid strokes instead
  // of the jagged polyline `lineTo` per mousemove would yield.
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Reset any prior transform — the dialog open animation triggers ResizeObserver
    // before settling, so setupCanvas runs multiple times and each ctx.scale call
    // would otherwise stack on top of the previous one, shifting coordinates.
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Get the device pixel ratio for high-DPI screens
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ratioRef.current = ratio;

    // Get the display size from CSS
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Set the canvas internal size to match display size * pixel ratio
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    lastSizeRef.current = { w: rect.width, h: rect.height };

    // Scale the context so drawing operations use CSS pixels
    ctx.scale(ratio, ratio);

    // Fill canvas with white background for print-ready signatures
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Use black stroke for signature (print-ready format)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initial setup — this often runs mid-dialog-animation so dimensions may
    // not be final yet. The ResizeObserver below catches the post-animation
    // size and re-initializes the canvas at the correct dimensions.
    setupCanvas();

    const observer = new ResizeObserver(() => {
      setupCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isOpen, setupCanvas]);

  const getCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    // Get the canvas bounding rect - this gives us the position and size in CSS pixels
    const rect = canvas.getBoundingClientRect();
    
    // Get client coordinates (relative to viewport)
    let clientX: number, clientY: number;
    
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('changedTouches' in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return { x: 0, y: 0 };
    }
    
    // Convert to coordinates relative to the canvas element in CSS pixels
    // This works because ctx.scale(ratio, ratio) was applied, so we draw in CSS pixel space
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return { x, y };
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scrolling
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsDrawing(true);
    setHasSignature(true);

    const { x, y } = getCoordinates(e);

    ctx.beginPath();
    ctx.moveTo(x, y);
    lastPointRef.current = { x, y };
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling while drawing

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    const last = lastPointRef.current;
    if (!last) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastPointRef.current = { x, y };
      return;
    }

    // Quadratic curve through the midpoint of (last, current): standard
    // technique for smoothing freehand strokes — see signature_pad.js. Each
    // sample becomes a control point and we draw to the midpoint, then start
    // a fresh subpath from that midpoint for the next segment.
    const midX = (last.x + x) / 2;
    const midY = (last.y + y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    lastPointRef.current = { x, y };
  };

  const stopDrawing = () => {
    if (isDrawing) {
      const canvas = canvasRef.current;
      const last = lastPointRef.current;
      if (canvas && last) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Close out the final segment so the stroke reaches the last sample.
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
      }
    }
    setIsDrawing(false);
    lastPointRef.current = null;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get the display size
    const rect = canvas.getBoundingClientRect();
    
    // Clear and reset
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Reset stroke style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    setHasSignature(false);
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    clearSignature();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogPortal>
        {/* Custom overlay with higher z-index to appear above modal-overlay (z-100) */}
        <DialogOverlay className="z-[150]" />
        
        {/* Custom content with higher z-index */}
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[150] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
          data-testid="dialog-signature-pad"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <canvas
                ref={canvasRef}
                className="w-full h-56 sm:h-48 border-2 border-dashed border-border rounded-lg bg-white cursor-crosshair touch-none"
                style={{ touchAction: 'none' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                onTouchCancel={stopDrawing}
                data-testid="signature-canvas"
              />
              <p className="text-sm text-muted-foreground mt-2 text-center">
                Draw your signature above
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={clearSignature}
                disabled={!hasSignature}
                data-testid="signature-clear"
              >
                Clear
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="signature-cancel"
              >
                Cancel
              </Button>
              <Button
                onClick={saveSignature}
                disabled={!hasSignature}
                className="flex-1"
                data-testid="signature-save"
              >
                Done
              </Button>
            </div>
          </div>

          {/* Close button */}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
