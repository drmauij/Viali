import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
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
  onRateSelection: (selectedRate: string) => void;
  onCustomRateEntry: (customRate: string) => void;
}

export function RateSelectionDialog({
  open,
  onOpenChange,
  pendingRateSelection,
  onRateSelection,
  onCustomRateEntry,
}: RateSelectionDialogProps) {
  const [customRateInput, setCustomRateInput] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setCustomRateInput("");
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
    onCustomRateEntry(rate);
    handleClose();
  };

  const handlePresetRate = (rate: string) => {
    onRateSelection(rate);
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setCustomRateInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-rate-selection">
        <DialogHeader>
          <DialogTitle>Select Rate</DialogTitle>
          <DialogDescription>
            {pendingRateSelection ? `${pendingRateSelection.label}` : 'Select a rate or enter a custom value'}
          </DialogDescription>
        </DialogHeader>
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
        </div>
        <DialogFooterWithTime
          time={pendingRateSelection?.time}
          onTimeChange={(newTime) => {
            // Time change handled externally in parent component
          }}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleCustomRate}
          saveDisabled={!customRateInput.trim()}
          saveLabel="Set Custom"
        />
      </DialogContent>
    </Dialog>
  );
}
