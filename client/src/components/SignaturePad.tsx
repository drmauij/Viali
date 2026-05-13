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
  // Last drawn point — used by `draw` to interpolate a quadratic curve
  // through the midpoint between consecutive pointer samples, producing
  // a fluid stroke instead of jagged per-sample `lineTo` segments.
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Get the device pixel ratio for high-DPI screens
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    ratioRef.current = ratio;
    
    // Get the display size from CSS
    const rect = canvas.getBoundingClientRect();
    
    // Set the canvas internal size to match display size * pixel ratio
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    
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
    if (isOpen) {
      // Small delay to ensure the dialog is fully rendered and sized
      const timer = setTimeout(() => {
        setupCanvas();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, setupCanvas]);

  const getCoordinatesFromPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  // Internal helper: add one (clientX, clientY) sample to the current stroke,
  // smoothing through the midpoint with the previous sample. Shared by both
  // the initial pointer down and every coalesced sample during pointer move,
  // so a single mid-frame draw call can absorb several queued samples without
  // dropping any.
  const drawPoint = (ctx: CanvasRenderingContext2D, clientX: number, clientY: number) => {
    const { x, y } = getCoordinatesFromPoint(clientX, clientY);
    const last = lastPointRef.current;
    if (!last) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      lastPointRef.current = { x, y };
      return;
    }
    const midX = (last.x + x) / 2;
    const midY = (last.y + y) / 2;
    ctx.quadraticCurveTo(last.x, last.y, midX, midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(midX, midY);
    lastPointRef.current = { x, y };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Capture the pointer so we keep receiving move/up even if the user's
    // hand wanders past the canvas edge — strokes won't get cut off.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers may refuse if already captured — safe to ignore */
    }

    setIsDrawing(true);
    setHasSignature(true);
    lastPointRef.current = null;
    drawPoint(ctx, e.clientX, e.clientY);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pointer events can deliver multiple samples per frame on high-rate
    // devices. getCoalescedEvents() exposes them so we draw the full trail
    // instead of just the latest position — gives strokes their snap on
    // fast strokes (Apple Pencil, Surface Pen, fast finger swipes).
    const coalesced =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    if (coalesced.length > 0) {
      for (const sample of coalesced) {
        drawPoint(ctx, sample.clientX, sample.clientY);
      }
    } else {
      drawPoint(ctx, e.clientX, e.clientY);
    }
  };

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
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
        if (e) {
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            /* no-op if already released */
          }
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
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
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
