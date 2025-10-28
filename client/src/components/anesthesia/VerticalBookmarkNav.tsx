import { useLocation } from "wouter";
import { FileText, Activity, Bed } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerticalBookmarkNavProps {
  caseId: string;
  patientName: string;
}

export function VerticalBookmarkNav({ caseId, patientName }: VerticalBookmarkNavProps) {
  const [location, navigate] = useLocation();

  const stages = [
    {
      id: "preop",
      label: "Pre-op",
      icon: FileText,
      path: `/anesthesia/cases/${caseId}/preop`,
      color: "bg-blue-500 hover:bg-blue-600",
      activeColor: "bg-blue-600",
    },
    {
      id: "op",
      label: "OP",
      icon: Activity,
      path: `/anesthesia/cases/${caseId}/op`,
      color: "bg-green-500 hover:bg-green-600",
      activeColor: "bg-green-600",
    },
    {
      id: "pacu",
      label: "PACU",
      icon: Bed,
      path: `/anesthesia/cases/${caseId}/pacu`,
      color: "bg-orange-500 hover:bg-orange-600",
      activeColor: "bg-orange-600",
    },
  ];

  const isActive = (path: string) => {
    return location === path || location.startsWith(path);
  };

  return (
    <div className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2" data-testid="vertical-bookmark-nav">
      {stages.map((stage) => {
        const active = isActive(stage.path);
        const Icon = stage.icon;

        return (
          <button
            key={stage.id}
            onClick={() => navigate(stage.path)}
            className={cn(
              "group relative flex items-center justify-center",
              "h-28 min-w-[48px] rounded-l-xl shadow-lg",
              "transition-all duration-200 ease-in-out",
              "border-r-0",
              active ? [stage.activeColor, "min-w-[56px] shadow-xl"] : stage.color,
              "text-white",
              "hover:min-w-[56px]",
              "focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
            )}
            data-testid={`bookmark-${stage.id}`}
            aria-label={`Navigate to ${stage.label}`}
            title={`${stage.label} - ${patientName}`}
          >
            {/* Icon at top */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2">
              <Icon className={cn(
                "h-5 w-5 transition-all",
                active ? "h-6 w-6" : ""
              )} />
            </div>
            
            {/* Vertical text */}
            <span
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
                "text-sm font-semibold tracking-wide whitespace-nowrap",
                "transition-all",
                active ? "text-base" : ""
              )}
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                transform: "translateX(-50%) translateY(-50%) rotate(180deg)",
              }}
            >
              {stage.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
