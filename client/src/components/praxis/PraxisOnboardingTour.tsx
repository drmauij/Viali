import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    selector: '[data-tour="linked-room-column"]',
    title: "Pick a destination",
    body: "Click a room — each represents one of your referral partner hospitals. Free time slots will appear in white; busy slots are muted.",
  },
  {
    selector: '[data-tour="linked-room-column"]',
    title: "Pick a time",
    body: "Drag or click in a free slot. Busy zones are blocked — pick a time that's open at the destination.",
  },
  {
    selector: '[data-tour="quick-schedule-dialog"]',
    title: "Fill the surgery details",
    body: "Same fields you know. If the patient is new, use the + to add them inline.",
  },
  {
    selector: '[data-tour="submit-button"]',
    title: "Submit",
    body: "Review what gets sent to the destination, then submit.",
  },
];

export function PraxisOnboardingTour() {
  const [stepIdx, setStepIdx] = useState<number>(() => {
    if (typeof window === "undefined") return -1;
    if (localStorage.getItem("praxis-tour-completed") === "true") return -1;
    const stored = Number(localStorage.getItem("praxis-tour-step") ?? "0");
    return Number.isFinite(stored) ? stored : 0;
  });
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (stepIdx < 0 || stepIdx >= STEPS.length) {
      setPosition(null);
      return;
    }
    // Try to find the target element. If not in DOM yet, retry briefly.
    let cancelled = false;
    const attempt = (tries = 0) => {
      if (cancelled) return;
      const el = document.querySelector(STEPS[stepIdx].selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        setPosition({ top: rect.bottom + 8, left: rect.left });
      } else if (tries < 10) {
        setTimeout(() => attempt(tries + 1), 200);
      } else {
        setPosition(null);
      }
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [stepIdx]);

  if (stepIdx < 0 || stepIdx >= STEPS.length || !position) return null;
  const step = STEPS[stepIdx];

  return (
    <div
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 1000,
      }}
      className="bg-indigo-600 text-white p-3 rounded-lg shadow-xl max-w-xs"
      data-testid="praxis-tour-coachmark"
    >
      <div className="text-xs opacity-80 mb-1">
        Step {stepIdx + 1} of {STEPS.length}
      </div>
      <div className="font-semibold text-sm">{step.title}</div>
      <p className="text-xs mt-1">{step.body}</p>
      <div className="flex justify-between items-center mt-3">
        <button
          className="text-xs underline opacity-80 hover:opacity-100"
          onClick={() => {
            localStorage.setItem("praxis-tour-completed", "true");
            setStepIdx(-1);
          }}
          data-testid="praxis-tour-dismiss"
        >
          &times; Dismiss tour
        </button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const next = stepIdx + 1;
            localStorage.setItem("praxis-tour-step", String(next));
            if (next >= STEPS.length) {
              localStorage.setItem("praxis-tour-completed", "true");
              setStepIdx(-1);
            } else {
              setStepIdx(next);
            }
          }}
          data-testid="praxis-tour-next"
        >
          {stepIdx === STEPS.length - 1 ? "Done" : "Next →"}
        </Button>
      </div>
    </div>
  );
}
