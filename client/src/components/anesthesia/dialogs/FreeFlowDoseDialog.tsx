import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface PendingFreeFlowDose {
  swimlaneId: string;
  time: number;
  label: string;
  administrationUnit?: string | null;
}

interface FreeFlowDoseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingFreeFlowDose: PendingFreeFlowDose | null;
  onFreeFlowDoseEntry: (swimlaneId: string, time: number, dose: string, label: string) => void;
}

export function FreeFlowDoseDialog({
  open,
  onOpenChange,
  pendingFreeFlowDose,
  onFreeFlowDoseEntry,
}: FreeFlowDoseDialogProps) {
  const { t } = useTranslation();
  const [freeFlowDoseInput, setFreeFlowDoseInput] = useState("");
  const { toast } = useToast();

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setFreeFlowDoseInput("");
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingFreeFlowDose) return;

    const { swimlaneId, time, label } = pendingFreeFlowDose;

    // Validate numeric input only
    const doseValue = freeFlowDoseInput.trim();
    if (!doseValue || isNaN(Number(doseValue)) || Number(doseValue) <= 0) {
      toast({
        title: t('dialogs.invalidDose'),
        description: t('dialogs.enterValidDose'),
        variant: "destructive",
      });
      return;
    }

    onFreeFlowDoseEntry(swimlaneId, time, doseValue, label);

    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setFreeFlowDoseInput("");
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
      title={t('dialogs.enterDose')}
      description={pendingFreeFlowDose ? `${pendingFreeFlowDose.label}` : t('dialogs.enterDoseDesc')}
      testId="dialog-freeflow-dose"
      time={pendingFreeFlowDose?.time}
      onTimeChange={(newTime) => {
        // Time change handled externally in parent component
      }}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!freeFlowDoseInput.trim()}
      saveLabel={t('dialogs.start')}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="freeflow-dose">
            {t('dialogs.dose')}{pendingFreeFlowDose?.administrationUnit ? ` (${pendingFreeFlowDose.administrationUnit})` : ''}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="freeflow-dose"
              type="number"
              inputMode="decimal"
              data-testid="input-freeflow-dose"
              value={freeFlowDoseInput}
              onChange={(e) => setFreeFlowDoseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              placeholder="e.g., 100"
              autoFocus
            />
            {pendingFreeFlowDose?.administrationUnit && (
              <span className="text-sm text-muted-foreground min-w-fit">
                {pendingFreeFlowDose.administrationUnit}
              </span>
            )}
          </div>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
