import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, StopCircle, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ManagingRate {
  swimlaneId: string;
  time: number;
  value: string;
  index: number;
  label: string;
  rateOptions?: string[];
  rateUnit?: string | null;
}

interface RateManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managingRate: ManagingRate | null;
  infusionData: Record<string, [number, string][]>;
  rateManageTime: number;
  onRateManageTimeChange: (time: number) => void;
  onRateStop: () => void;
  onRateStart: (rate: string) => void;
  onRateStartNew: (rate: string, initialBolus?: string) => void;
  onRateChange: (newRate: string) => void;
  onTciStop?: (amountUsed: string) => void;
  isRunning?: boolean;
  administrationUnit?: string | null;
  ampuleUnit?: string | null;
}

export function RateManageDialog({
  open,
  onOpenChange,
  managingRate,
  infusionData,
  rateManageTime,
  onRateManageTimeChange,
  onRateStop,
  onRateStart,
  onRateStartNew,
  onRateChange,
  onTciStop,
  isRunning: isRunningProp,
  administrationUnit,
  ampuleUnit,
}: RateManageDialogProps) {
  const { t } = useTranslation();
  const [rateInput, setRateInput] = useState("");
  const [tciAmountInput, setTciAmountInput] = useState("");
  
  // Check if TCI mode
  const isTciMode = managingRate?.rateUnit === "TCI";

  // Sync managing rate data to form
  useEffect(() => {
    if (managingRate) {
      setRateInput(managingRate.value || "");
    } else {
      setRateInput("");
    }
  }, [managingRate]);
  
  // Reset TCI amount when dialog closes
  useEffect(() => {
    if (!open) {
      setTciAmountInput("");
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    setRateInput("");
    setTciAmountInput("");
  };

  // Use the prop if provided, otherwise calculate from infusionData (legacy behavior)
  const isRunning = isRunningProp !== undefined ? isRunningProp : managingRate && (() => {
    const { swimlaneId } = managingRate;
    const existingData = infusionData[swimlaneId] || [];
    
    // Find the latest NON-EMPTY marker to determine running state
    const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
    
    const latestRateMarker = sortedData.find(([_, val]) => val !== "");
    const latestStopMarker = sortedData.find(([_, val]) => val === "");
    
    return latestRateMarker && 
      (!latestStopMarker || latestRateMarker[0] >= latestStopMarker[0]);
  })();

  const handleSaveRate = () => {
    if (rateInput.trim() && !isNaN(Number(rateInput)) && Number(rateInput) > 0) {
      onRateChange(rateInput.trim());
    }
  };

  const handleStopInfusion = () => {
    onRateStop();
    handleClose();
  };
  
  const handleTciStopInfusion = () => {
    if (onTciStop && tciAmountInput.trim()) {
      onTciStop(tciAmountInput.trim());
      handleClose();
    }
  };

  const handleStartNewInfusion = () => {
    const rate = rateInput.trim() || managingRate?.value || "";
    if (rate) {
      onRateStartNew(rate);
      handleClose();
    }
  };

  const incrementRate = () => {
    const currentValue = Number(rateInput) || 0;
    setRateInput(String(currentValue + 1));
  };

  const decrementRate = () => {
    const currentValue = Number(rateInput) || 0;
    if (currentValue > 0) {
      setRateInput(String(currentValue - 1));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-rate-manage">
        <DialogHeader>
          <DialogTitle>
            {managingRate?.label ? managingRate.label.split('(')[0].trim() : t('anesthesia.timeline.rateControlledInfusion', 'Rate-Controlled Infusion')}
          </DialogTitle>
          <DialogDescription>
            {isTciMode 
              ? (isRunning ? t("anesthesia.timeline.tciManageDescription", "Adjust target concentration or stop infusion") : t("anesthesia.timeline.tciStopped", "TCI infusion stopped"))
              : (isRunning ? t("anesthesia.timeline.adjustInfusionRate", "Adjust or change infusion rate") : t("anesthesia.timeline.infusionStopped", "This infusion is currently stopped"))
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* TCI Mode - Show Tc adjustment AND stop with amount */}
          {isTciMode && isRunning ? (
            <>
              {/* Target Concentration Adjustment */}
              <div className="grid gap-3">
                <Label htmlFor="rate-input" className="text-sm font-medium">
                  {t("anesthesia.timeline.tciTargetConcentration", "Target Concentration")} (Tc)
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={decrementRate}
                    data-testid="button-decrement-tc"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="rate-input"
                    type="number"
                    inputMode="decimal"
                    className="text-center text-2xl font-bold h-14"
                    data-testid="input-tc-manage"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveRate();
                      }
                    }}
                    placeholder="0"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={incrementRate}
                    data-testid="button-increment-tc"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[40px]">
                    Tc
                  </span>
                </div>
                <Button
                  onClick={handleSaveRate}
                  disabled={!rateInput.trim() || isNaN(Number(rateInput)) || Number(rateInput) <= 0 || rateInput === managingRate?.value}
                  className="w-full"
                  data-testid="button-save-tc"
                >
                  {t("anesthesia.timeline.tciChangeTc", "Change Target")}
                </Button>
              </div>

              {/* Divider */}
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t("common.or", "or")}
                  </span>
                </div>
              </div>

              {/* Stop TCI with amount */}
              <div className="grid gap-3">
                <Label htmlFor="tci-amount-input" className="text-sm font-medium">
                  {t("anesthesia.timeline.tciActualAmountUsed")} {ampuleUnit ? `(${ampuleUnit})` : (administrationUnit ? `(${administrationUnit})` : '')}
                </Label>
                <Input
                  id="tci-amount-input"
                  type="number"
                  inputMode="decimal"
                  className="text-center text-2xl font-bold h-14"
                  data-testid="input-tci-amount"
                  value={tciAmountInput}
                  onChange={(e) => setTciAmountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleTciStopInfusion();
                    }
                  }}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  {t("anesthesia.timeline.tciAmountHelp")}
                </p>
              </div>
              
              <Button
                onClick={handleTciStopInfusion}
                disabled={!tciAmountInput.trim() || isNaN(Number(tciAmountInput)) || Number(tciAmountInput) <= 0}
                variant="destructive"
                className="w-full"
                data-testid="button-tci-stop"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                {t("anesthesia.timeline.tciStopInfusion")}
              </Button>
            </>
          ) : !isTciMode ? (
            <>
              {/* Rate Adjustment Section - For non-TCI mode */}
              <div className="grid gap-3">
                <Label htmlFor="rate-input" className="text-sm font-medium">
                  {managingRate?.label ? `${managingRate.label.split(' ')[0]} ${t("anesthesia.timeline.rate", "Rate")}` : t("anesthesia.timeline.rate", "Rate")}
                </Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={decrementRate}
                    data-testid="button-decrement-rate"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="rate-input"
                    type="number"
                    inputMode="decimal"
                    className="text-center text-2xl font-bold h-14"
                    data-testid="input-rate-manage"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveRate();
                      }
                    }}
                    placeholder="0"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={incrementRate}
                    data-testid="button-increment-rate"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  {managingRate?.rateUnit && (
                    <span className="text-sm text-muted-foreground min-w-[80px]">
                      {managingRate.rateUnit}
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleSaveRate}
                  disabled={!rateInput.trim() || isNaN(Number(rateInput)) || Number(rateInput) <= 0}
                  className="w-full"
                  data-testid="button-save-rate"
                >
                  {t('common.save', 'Save')}
                </Button>
              </div>

              {/* Action Buttons - For non-TCI mode */}
              <div className="grid gap-2 pt-2">
                {isRunning && (
                  <Button
                    onClick={handleStopInfusion}
                    variant="outline"
                    className="w-full"
                    data-testid="button-rate-stop"
                  >
                    <StopCircle className="w-4 h-4 mr-2" />
                    {t('anesthesia.timeline.stopInfusion', 'Stop Infusion')}
                  </Button>
                )}
                
                <Button
                  onClick={handleStartNewInfusion}
                  variant="outline"
                  className="w-full"
                  data-testid="button-rate-start-new"
                >
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {t('anesthesia.timeline.startNewInfusion', 'Start New Infusion')}
                </Button>
              </div>
            </>
          ) : null}
          
          {/* Cancel button - Small on bottom right */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleClose}
              variant="ghost"
              size="sm"
              data-testid="button-cancel"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
