import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface PendingRateSelection {
  swimlaneId: string;
  time: number;
  label: string;
  rateOptions: string[];
}

interface RateSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingRateSelection: PendingRateSelection | null;
  onRateSelection: (selectedRate: string, initialBolus?: string) => void;
  onCustomRateEntry: (customRate: string, initialBolus?: string) => void;
  administrationUnit?: string | null;
}

export function RateSelectionDialog({
  open,
  onOpenChange,
  pendingRateSelection,
  onRateSelection,
  onCustomRateEntry,
  administrationUnit,
}: RateSelectionDialogProps) {
  const [customRateInput, setCustomRateInput] = useState("");
  const [initialBolusInput, setInitialBolusInput] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

  // Reset inputs when dialog closes
  useEffect(() => {
    if (!open) {
      setCustomRateInput("");
      setInitialBolusInput("");
    }
  }, [open]);

  const handleCustomRate = () => {
    const rate = customRateInput.trim();
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      toast({
        title: "Invalid rate",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    const bolus = initialBolusInput.trim();
    onCustomRateEntry(rate, bolus || undefined);
    handleClose();
  };

  const handlePresetRate = (rate: string) => {
    const bolus = initialBolusInput.trim();
    onRateSelection(rate, bolus || undefined);
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setCustomRateInput("");
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
      title="Select Rate"
      description={pendingRateSelection ? `${pendingRateSelection.label}` : 'Select a rate or enter a custom value'}
      testId="dialog-rate-selection"
      time={pendingRateSelection?.time}
      onTimeChange={(newTime) => {
        // Time change handled externally in parent component
      }}
      showDelete={false}
      onCancel={handleClose}
      onSave={handleCustomRate}
      saveDisabled={!customRateInput.trim()}
      saveLabel="Set Custom"
    >
      <div className="grid gap-4 py-4">
        <div className="text-sm font-medium">Choose from preset rates:</div>
        <div className="grid grid-cols-3 gap-2">
          {pendingRateSelection?.rateOptions.map((rate, idx) => (
            <Button
              key={idx}
              onClick={() => handlePresetRate(rate)}
              variant="outline"
              className="h-12"
              data-testid={`button-rate-option-${rate}`}
            >
              {rate}
            </Button>
          ))}
        </div>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              {t('anesthesia.pdf.orEnterCustom')}
            </span>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="custom-rate">Custom Rate</Label>
          <Input
            id="custom-rate"
            type="number"
            inputMode="decimal"
            data-testid="input-custom-rate"
            value={customRateInput}
            onChange={(e) => setCustomRateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCustomRate();
              }
            }}
            placeholder="e.g., 8"
          />
        </div>

        {/* Initial Bolus (optional) */}
        <div className="grid gap-2 pt-2">
          <Label htmlFor="initial-bolus" className="text-sm">
            Initial Bolus {administrationUnit ? `(${administrationUnit})` : ''} <span className="text-muted-foreground">(optional)</span>
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
      </div>
    </BaseTimelineDialog>
  );
}
