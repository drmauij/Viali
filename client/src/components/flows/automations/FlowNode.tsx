import { Calendar, Clock, MessageSquare, Mail, GitBranch, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DemoStep, DemoStepType } from "./postTreatmentFlow";

const ICON_BY_TYPE: Record<DemoStepType, typeof Calendar> = {
  trigger: Calendar,
  wait: Clock,
  send_sms: MessageSquare,
  send_email: Mail,
  condition: GitBranch,
  end: CheckCircle2,
};

interface Props {
  step: DemoStep;
  selected: boolean;
  onClick: () => void;
}

export function FlowNode({ step, selected, onClick }: Props) {
  const Icon = ICON_BY_TYPE[step.type];
  const isTrigger = step.type === "trigger";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all w-64",
        isTrigger
          ? "bg-purple-600 text-white border-purple-500 hover:bg-purple-500"
          : "bg-slate-800 text-slate-100 border-slate-700 hover:border-slate-500",
        selected && "ring-2 ring-purple-400 ring-offset-2 ring-offset-slate-950",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium">{step.label}</span>
    </button>
  );
}
