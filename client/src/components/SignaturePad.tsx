import { useRef, useEffect, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Dialog, DialogHeader, DialogTitle, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
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

// Resizes the canvas's backing store to match its CSS size × dpr and re-applies
// any existing strokes. signature_pad handles the coordinate math internally
// once the canvas is sized — we just have to keep the size in sync with what
// CSS says the canvas should be.
function resizeCanvas(canvas: HTMLCanvasElement, pad: SignaturePadLib) {
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  // signature_pad's recommended resize: snapshot strokes, resize backing
  // store, restore. fromData() replays the vectors at the new resolution
  // so no quality is lost.
  const data = pad.toData();
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  canvas.getContext("2d")?.scale(ratio, ratio);
  pad.clear();
  if (data && data.length > 0) {
    pad.fromData(data);
  }
}

export default function SignaturePad({ isOpen, onClose, onSave, title = "Your Signature" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
      minWidth: 1,
      maxWidth: 2.5,
    });
    padRef.current = pad;

    pad.addEventListener("endStroke", () => {
      setHasSignature(!pad.isEmpty());
    });

    // Initial sizing — and again on resize. Dialog open animations end up
    // firing a window resize event indirectly via the layout reflow that
    // follows; we also schedule a one-off settle to be safe.
    resizeCanvas(canvas, pad);
    const settleTimer = window.setTimeout(() => resizeCanvas(canvas, pad), 220);

    const observer = new ResizeObserver(() => {
      resizeCanvas(canvas, pad);
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      window.clearTimeout(settleTimer);
      pad.off();
      padRef.current = null;
    };
  }, [isOpen]);

  const clearSignature = () => {
    padRef.current?.clear();
    setHasSignature(false);
  };

  const saveSignature = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    onSave(pad.toDataURL("image/png"));
    pad.clear();
    setHasSignature(false);
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
              {/* Border on the wrapper so the canvas itself has no border —
                  signature_pad needs the canvas's bounding rect to coincide
                  exactly with its bitmap area for coordinates to land under
                  the finger. */}
              <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  className="block w-full h-56 sm:h-48 bg-white cursor-crosshair touch-none"
                  style={{ touchAction: "none" }}
                  data-testid="signature-canvas"
                />
              </div>
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
