import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { deriveBolusUnit } from "@/lib/pharmacokinetics/rate-conversion";

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
  rateUnit?: string | null;
}

export function RateSelectionDialog({
  open,
  onOpenChange,
  pendingRateSelection,
  onRateSelection,
  onCustomRateEntry,
  administrationUnit,
  rateUnit,
}: RateSelectionDialogProps) {
  const [customRateInput, setCustomRateInput] = useState("");
  const [initialBolusInput, setInitialBolusInput] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

  const isTCI = rateUnit === "TCI";
  const bolusUnit = deriveBolusUnit(rateUnit, administrationUnit);

  // Reset inputs when dialog closes
  useEffect(() => {
    if (!open) {
      setCustomRateInput("");
      setInitialBolusInput("");
    }
  }, [open]);

  // Unified start handler for non-TCI
  const handleStart = () => {
    const rate = customRateInput.trim();
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      toast({
        title: t('dialogs.invalidRate'),
        description: t('dialogs.enterValidPositiveNumber'),
        variant: "destructive",
      });
      return;
    }
    const bolus = initialBolusInput.trim();
    if (bolus && (isNaN(Number(bolus)) || Number(bolus) <= 0)) {
      toast({
        title: t('dialogs.invalidBolus', 'Invalid bolus'),
        description: t('dialogs.enterValidPositiveNumber'),
        variant: "destructive",
      });
      return;
    }
    onRateSelection(rate, bolus || undefined);
    handleClose();
  };

  const handlePresetRate = (rate: string) => {
    if (isTCI) {
      // TCI: immediate start (current behavior) — pump manages everything
      onRateSelection(rate);
      handleClose();
    } else {
      // Non-TCI: fill custom field so user can review + optionally add bolus
      setCustomRateInput(rate);
    }
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
      title={t('dialogs.selectRate')}
      description={pendingRateSelection ? `${pendingRateSelection.label}` : t('dialogs.selectRateDesc')}
      testId="dialog-rate-selection"
      time={pendingRateSelection?.time}
      onTimeChange={(newTime) => {
        // Time change handled externally in parent component
      }}
      showDelete={false}
      onCancel={handleClose}
      onSave={handleStart}
      saveDisabled={!customRateInput.trim() || isNaN(Number(customRateInput)) || Number(customRateInput) <= 0}
      saveLabel={isTCI ? t('dialogs.setCustom') : t('anesthesia.timeline.startInfusion', 'Start Infusion')}
    >
      <div className="grid gap-4 py-4">
        <div className="text-sm font-medium">{t('dialogs.choosePresetRates')}</div>
        <div className="grid grid-cols-3 gap-2">
          {pendingRateSelection?.rateOptions.map((rate, idx) => (
            <Button
              key={idx}
              onClick={() => handlePresetRate(rate)}
              variant={!isTCI && customRateInput === rate ? "default" : "outline"}
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
          <Label htmlFor="custom-rate">{t('dialogs.customRate')}</Label>
          <Input
            id="custom-rate"
            type="number"
            inputMode="decimal"
            data-testid="input-custom-rate"
            value={customRateInput}
            onChange={(e) => setCustomRateInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleStart();
              }
            }}
            placeholder="e.g., 8"
          />
        </div>

        {/* Initial Bolus (optional) — hidden for TCI (pump manages boluses) */}
        {!isTCI && (
          <div className="grid gap-2 pt-2">
            <Label htmlFor="initial-bolus" className="text-sm">
              {t('dialogs.initialBolus')} ({bolusUnit}) <span className="text-muted-foreground">({t('common.optional')})</span>
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
              {t('dialogs.initialBolusHint')}
            </p>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
