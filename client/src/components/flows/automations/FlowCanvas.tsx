import { FlowNode } from "./FlowNode";
import type { DemoStep } from "./postTreatmentFlow";

interface Props {
  steps: DemoStep[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function Connector() {
  return <div className="h-6 w-px bg-slate-600" aria-hidden />;
}

export function FlowCanvas({ steps, selectedId, onSelect }: Props) {
  // Linear steps before the condition + the condition itself + branch ends
  const conditionIndex = steps.findIndex((s) => s.type === "condition");
  const linearSteps = steps.slice(0, conditionIndex + 1);
  const branches = steps.slice(conditionIndex + 1);
  const yesBranch = branches.find((s) => s.branch === "yes");
  const noBranch = branches.find((s) => s.branch === "no");

  return (
    <div className="bg-slate-950 rounded-lg p-8 flex flex-col items-center min-h-full">
      {linearSteps.map((step, i) => (
        <div key={step.id} className="flex flex-col items-center">
          <FlowNode
            step={step}
            selected={step.id === selectedId}
            onClick={() => onSelect(step.id)}
          />
          {i < linearSteps.length - 1 && <Connector />}
        </div>
      ))}

      {/* Y-fork */}
      {yesBranch && noBranch && (
        <>
          <div className="h-6 w-px bg-slate-600" aria-hidden />
          <div className="relative w-full max-w-md flex justify-between items-start">
            {/* Horizontal connector */}
            <div className="absolute top-0 left-1/4 right-1/4 h-px bg-slate-600" aria-hidden />
            <div className="flex flex-col items-center gap-2 pt-6">
              <span className="text-xs text-emerald-400 font-medium">Ja</span>
              <FlowNode
                step={yesBranch}
                selected={yesBranch.id === selectedId}
                onClick={() => onSelect(yesBranch.id)}
              />
            </div>
            <div className="flex flex-col items-center gap-2 pt-6">
              <span className="text-xs text-orange-400 font-medium">Nein</span>
              <FlowNode
                step={noBranch}
                selected={noBranch.id === selectedId}
                onClick={() => onSelect(noBranch.id)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
