import { useState } from "react";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FlowCanvas } from "./FlowCanvas";
import { StepConfigPanel } from "./StepConfigPanel";
import { POST_TREATMENT_FLOW } from "./postTreatmentFlow";

interface Props {
  onBack: () => void;
}

export function FlowBuilderDemo({ onBack }: Props) {
  // Default selection: SMS step (most interesting on entry)
  const [selectedId, setSelectedId] = useState("sms");
  const { toast } = useToast();
  const selected = POST_TREATMENT_FLOW.find((s) => s.id === selectedId);

  const onActivate = () => {
    toast({
      title: "Demo-Vorschau",
      description: "Multi-Step-Automatisierungen sind bald verfügbar.",
      duration: 4000,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-semibold">Nachsorge nach Behandlung</h2>
            <p className="text-xs text-muted-foreground">Vorschau — noch nicht aktiv</p>
          </div>
        </div>
        <Button onClick={onActivate} className="gap-2">
          <Zap className="h-4 w-4" />
          Automatisierung aktivieren
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <FlowCanvas
            steps={POST_TREATMENT_FLOW}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
        <div className="lg:col-span-2">
          {selected && <StepConfigPanel step={selected} />}
        </div>
      </div>
    </div>
  );
}
