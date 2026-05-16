import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface Props {
  destinationName: string;
  onClose?: () => void;
}

export function PraxisDiscoveryPanel({ destinationName, onClose }: Props) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("praxis-discovery-dismissed") !== "true";
  });

  if (!open) return null;

  const dismiss = () => {
    localStorage.setItem("praxis-discovery-dismissed", "true");
    setOpen(false);
    onClose?.();
  };

  return (
    <>
      <DiscoveryToast destinationName={destinationName} />

      <div
        className="fixed right-4 top-20 w-72 bg-card border rounded-lg shadow-lg z-40 p-4"
        data-testid="praxis-discovery-panel"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">Suggested next steps</div>
          <button
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="Dismiss"
            data-testid="praxis-discovery-dismiss"
          >
            &times;
          </button>
        </div>
        <div
          className="p-3 bg-muted/50 hover:bg-muted rounded mb-2 cursor-pointer"
          onClick={() => setLocation("/appointments")}
          data-testid="praxis-discovery-appointments"
        >
          <div className="text-xs font-semibold">Appointments</div>
          <div className="text-xs text-muted-foreground mt-1">
            Manage consultations and follow-ups in your own calendar.
          </div>
        </div>
        <div
          className="p-3 bg-muted/50 hover:bg-muted rounded cursor-pointer"
          onClick={() => setLocation("/admin/links")}
          data-testid="praxis-discovery-links"
        >
          <div className="text-xs font-semibold">Sharable booking &amp; questionnaire links</div>
          <div className="text-xs text-muted-foreground mt-1">
            Share your booking link and questionnaire with your patients.
          </div>
        </div>
      </div>
    </>
  );
}

function DiscoveryToast({ destinationName }: { destinationName: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(id);
  }, []);
  if (!visible) return null;
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-2 rounded shadow-lg z-50 text-sm"
      data-testid="praxis-discovery-toast"
    >
      ✓ Surgery submitted to {destinationName}
    </div>
  );
}
