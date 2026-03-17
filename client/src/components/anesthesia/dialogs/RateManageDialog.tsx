import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, StopCircle, PlayCircle, Syringe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { deriveBolusUnit } from "@/lib/pharmacokinetics/rate-conversion";

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
  onGiveBolus?: (dose: string, unit: string) => void;
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
  onGiveBolus,
  isRunning: isRunningProp,
  administrationUnit,
  ampuleUnit,
}: RateManageDialogProps) {
  const { t } = useTranslation();
  const [rateInput, setRateInput] = useState("");
  const [tciAmountInput, setTciAmountInput] = useState("");
  const [midBolusInput, setMidBolusInput] = useState("");

  const isTciMode = managingRate?.rateUnit === "TCI";
  const bolusUnit = deriveBolusUnit(managingRate?.rateUnit, administrationUnit);

  useEffect(() => {
    if (managingRate) {
      setRateInput(managingRate.value || "");
    } else {
      setRateInput("");
    }
  }, [managingRate]);

  useEffect(() => {
    if (!open) {
      setTciAmountInput("");
      setMidBolusInput("");
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    setRateInput("");
    setTciAmountInput("");
    setMidBolusInput("");
  };

  const isRunning = isRunningProp !== undefined ? isRunningProp : managingRate && (() => {
    const { swimlaneId } = managingRate;
    const existingData = infusionData[swimlaneId] || [];
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

  const handleGiveBolus = () => {
    const dose = midBolusInput.trim();
    if (!dose || isNaN(Number(dose)) || Number(dose) <= 0) return;
    onGiveBolus?.(dose, bolusUnit);
    setMidBolusInput("");
    handleClose();
  };

  // Smart increment/decrement: step size adapts to current value
  const getStep = (value: number): number => {
    if (value < 1) return 0.1;
    if (value <= 10) return 0.5;
    return 1;
  };

  const incrementRate = () => {
    const currentValue = Number(rateInput) || 0;
    const step = getStep(currentValue);
    setRateInput(String(Math.round((currentValue + step) * 100) / 100));
  };

  const decrementRate = () => {
    const currentValue = Number(rateInput) || 0;
    const step = getStep(currentValue);
    const newValue = Math.round((currentValue - step) * 100) / 100;
    if (newValue >= 0) {
      setRateInput(String(newValue));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) handleClose();
      else onOpenChange(true);
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-rate-manage">
        <DialogHeader>
          <DialogTitle>
            {managingRate?.label ? managingRate.label.split('(')[0].trim() : t('anesthesia.timeline.rateControlledInfusion', 'Rate-Controlled Infusion')}
          </DialogTitle>
          <DialogDescription>
            {isTciMode
              ? (isRunning ? t("anesthesia.timeline.tciManageDescription", "Adjust target concentration or stop infusion") : t("anesthesia.timeline.tciStopped", "TCI infusion stopped"))
              : (isRunning ? t("anesthesia.timeline.adjustInfusionRate", "Adjust rate, give bolus, or stop infusion") : t("anesthesia.timeline.infusionStopped", "This infusion is currently stopped"))
            }
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* ─── TCI Mode ─── */}
          {isTciMode && isRunning ? (
            <>
              <div className="grid gap-3">
                <Label htmlFor="rate-input" className="text-sm font-medium">
                  {t("anesthesia.timeline.tciTargetConcentration", "Target Concentration")} (Tc)
                </Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={decrementRate} data-testid="button-decrement-tc">
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="rate-input" type="number" inputMode="decimal"
                    className="text-center text-2xl font-bold h-14"
                    data-testid="input-tc-manage"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRate(); }}
                    placeholder="0" autoFocus
                  />
                  <Button variant="outline" size="icon" onClick={incrementRate} data-testid="button-increment-tc">
                    <Plus className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground min-w-[40px]">Tc</span>
                </div>
                <Button
                  onClick={handleSaveRate}
                  disabled={!rateInput.trim() || isNaN(Number(rateInput)) || Number(rateInput) <= 0 || rateInput === managingRate?.value}
                  className="w-full" data-testid="button-save-tc"
                >
                  {t("anesthesia.timeline.tciChangeTc", "Change Target")}
                </Button>
              </div>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">{t("common.or", "or")}</span>
                </div>
              </div>

              <div className="grid gap-3">
                <Label htmlFor="tci-amount-input" className="text-sm font-medium">
                  {t("anesthesia.timeline.tciActualAmountUsed")} {ampuleUnit ? `(${ampuleUnit})` : (administrationUnit ? `(${administrationUnit})` : '')}
                </Label>
                <Input
                  id="tci-amount-input" type="number" inputMode="decimal"
                  className="text-center text-2xl font-bold h-14"
                  data-testid="input-tci-amount"
                  value={tciAmountInput}
                  onChange={(e) => setTciAmountInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTciStopInfusion(); }}
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">{t("anesthesia.timeline.tciAmountHelp")}</p>
              </div>

              <Button
                onClick={handleTciStopInfusion}
                disabled={!tciAmountInput.trim() || isNaN(Number(tciAmountInput)) || Number(tciAmountInput) <= 0}
                variant="destructive" className="w-full" data-testid="button-tci-stop"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                {t("anesthesia.timeline.tciStopInfusion")}
              </Button>
            </>

          /* ─── Non-TCI Running: Tabbed Rate / Bolus ─── */
          ) : !isTciMode && isRunning ? (
            <>
              <Tabs defaultValue="rate" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="rate" data-testid="tab-rate">
                    {t("anesthesia.timeline.rate", "Rate")}
                  </TabsTrigger>
                  {onGiveBolus && (
                    <TabsTrigger value="bolus" data-testid="tab-bolus">
                      <Syringe className="w-3.5 h-3.5 mr-1.5" />
                      {t("anesthesia.timeline.giveBolus", "Give Bolus")}
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Rate Tab */}
                <TabsContent value="rate" className="mt-4">
                  <div className="grid gap-3">
                    <Label htmlFor="rate-input" className="text-sm font-medium">
                      {managingRate?.label ? `${managingRate.label.split(' ')[0]} ${t("anesthesia.timeline.rate", "Rate")}` : t("anesthesia.timeline.rate", "Rate")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={decrementRate} data-testid="button-decrement-rate">
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Input
                        id="rate-input" type="number" inputMode="decimal"
                        className="text-center text-2xl font-bold h-14"
                        data-testid="input-rate-manage"
                        value={rateInput}
                        onChange={(e) => setRateInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRate(); }}
                        placeholder="0"
                      />
                      <Button variant="outline" size="icon" onClick={incrementRate} data-testid="button-increment-rate">
                        <Plus className="w-4 h-4" />
                      </Button>
                      {managingRate?.rateUnit && (
                        <span className="text-sm text-muted-foreground min-w-[80px]">{managingRate.rateUnit}</span>
                      )}
                    </div>
                    <Button
                      onClick={handleSaveRate}
                      disabled={!rateInput.trim() || isNaN(Number(rateInput)) || Number(rateInput) <= 0}
                      className="w-full" data-testid="button-save-rate"
                    >
                      {t('common.save', 'Save')}
                    </Button>
                  </div>
                </TabsContent>

                {/* Bolus Tab */}
                {onGiveBolus && (
                  <TabsContent value="bolus" className="mt-4">
                    <div className="grid gap-3">
                      <Label htmlFor="mid-bolus" className="text-sm font-medium">
                        {t("anesthesia.timeline.bolusAmount", "Bolus Amount")} ({bolusUnit})
                      </Label>
                      <Input
                        id="mid-bolus" type="number" inputMode="decimal"
                        className="text-center text-2xl font-bold h-14"
                        data-testid="input-mid-bolus"
                        value={midBolusInput}
                        onChange={(e) => setMidBolusInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleGiveBolus(); }}
                        placeholder="e.g., 50"
                        autoFocus
                      />
                      <Button
                        onClick={handleGiveBolus}
                        disabled={!midBolusInput.trim() || isNaN(Number(midBolusInput)) || Number(midBolusInput) <= 0}
                        className="w-full" data-testid="button-give-bolus"
                      >
                        <Syringe className="w-4 h-4 mr-2" />
                        {t("anesthesia.timeline.giveBolus", "Give Bolus")}
                      </Button>
                    </div>
                  </TabsContent>
                )}
              </Tabs>

              {/* Action Buttons — below tabs */}
              <div className="grid gap-2 pt-2 border-t">
                <Button onClick={handleStopInfusion} variant="outline" className="w-full" data-testid="button-rate-stop">
                  <StopCircle className="w-4 h-4 mr-2" />
                  {t('anesthesia.timeline.stopInfusion', 'Stop Infusion')}
                </Button>
                <Button onClick={handleStartNewInfusion} variant="outline" className="w-full" data-testid="button-rate-start-new">
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {t('anesthesia.timeline.startNewInfusion', 'Start New Infusion')}
                </Button>
              </div>
            </>

          /* ─── Non-TCI Stopped ─── */
          ) : !isTciMode ? (
            <>
              <div className="grid gap-3">
                <Label htmlFor="rate-input" className="text-sm font-medium">
                  {managingRate?.label ? `${managingRate.label.split(' ')[0]} ${t("anesthesia.timeline.rate", "Rate")}` : t("anesthesia.timeline.rate", "Rate")}
                </Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={decrementRate} data-testid="button-decrement-rate">
                    <Minus className="w-4 h-4" />
                  </Button>
                  <Input
                    id="rate-input" type="number" inputMode="decimal"
                    className="text-center text-2xl font-bold h-14"
                    data-testid="input-rate-manage"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRate(); }}
                    placeholder="0"
                  />
                  <Button variant="outline" size="icon" onClick={incrementRate} data-testid="button-increment-rate">
                    <Plus className="w-4 h-4" />
                  </Button>
                  {managingRate?.rateUnit && (
                    <span className="text-sm text-muted-foreground min-w-[80px]">{managingRate.rateUnit}</span>
                  )}
                </div>
              </div>
              <div className="grid gap-2 pt-2">
                <Button onClick={handleStartNewInfusion} variant="outline" className="w-full" data-testid="button-rate-start-new">
                  <PlayCircle className="w-4 h-4 mr-2" />
                  {t('anesthesia.timeline.startNewInfusion', 'Start New Infusion')}
                </Button>
              </div>
            </>
          ) : null}

          <div className="flex justify-end pt-2">
            <Button onClick={handleClose} variant="ghost" size="sm" data-testid="button-cancel">
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
