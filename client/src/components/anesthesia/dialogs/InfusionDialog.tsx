import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useTranslation } from "react-i18next";

interface PendingInfusionValue {
  swimlaneId: string;
  time: number;
  label: string;
  administrationUnit?: string | null;
  itemId?: string;
  rateUnit?: string | null;
}

interface InfusionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingInfusionValue: PendingInfusionValue | null;
  onInfusionValueEntry: (swimlaneId: string, time: number, value: string, initialBolus?: string) => void;
}

export function InfusionDialog({
  open,
  onOpenChange,
  pendingInfusionValue,
  onInfusionValueEntry,
}: InfusionDialogProps) {
  const { t } = useTranslation();
  const [infusionInput, setInfusionInput] = useState("");
  const [initialBolusInput, setInitialBolusInput] = useState("");

  // Check if TCI mode
  const isTciMode = pendingInfusionValue?.rateUnit === "TCI";

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setInfusionInput("");
      setInitialBolusInput("");
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingInfusionValue || !infusionInput.trim()) return;

    const { swimlaneId, time } = pendingInfusionValue;
    const bolus = initialBolusInput.trim();
    onInfusionValueEntry(swimlaneId, time, infusionInput.trim(), bolus || undefined);

    // Reset dialog state
    onOpenChange(false);
    setInfusionInput("");
    setInitialBolusInput("");
  };

  const handleClose = () => {
    onOpenChange(false);
    setInfusionInput("");
    setInitialBolusInput("");
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
      title="Add Infusion Rate"
      description={pendingInfusionValue ? `${pendingInfusionValue.label}` : 'Add a new infusion rate value'}
      testId="dialog-infusion-value"
      time={pendingInfusionValue?.time}
      onTimeChange={(newTime) => {
        // Time change handled externally in parent component
      }}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!infusionInput.trim()}
      saveLabel="Add"
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="infusion-value">
            {isTciMode ? "Target Concentration (Tc)" : "Rate"}
          </Label>
          <Input
            id="infusion-value"
            data-testid="input-infusion-value"
            value={infusionInput}
            onChange={(e) => setInfusionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
              }
            }}
            placeholder={isTciMode ? "e.g., 3.0, 4.5" : "e.g., 100ml/h, 50ml/h"}
            autoFocus
          />
        </div>

        {/* Initial Bolus (optional) - Hidden for TCI mode */}
        {!isTciMode && (
          <div className="grid gap-2 pt-2">
            <Label htmlFor="initial-bolus" className="text-sm">
              Initial Bolus {pendingInfusionValue?.administrationUnit ? `(${pendingInfusionValue.administrationUnit})` : ''} <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="initial-bolus"
              type="number"
              inputMode="decimal"
              data-testid="input-initial-bolus"
              value={initialBolusInput}
              onChange={(e) => setInitialBolusInput(e.target.value)}
              placeholder="e.g., 150"
            />
            <p className="text-xs text-muted-foreground">
              Bolus dose given at infusion start (added to total medication count)
            </p>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
