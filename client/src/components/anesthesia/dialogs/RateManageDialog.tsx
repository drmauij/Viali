import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus, StopCircle, PlayCircle } from "lucide-react";

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
  onRateStartNew: (rate: string) => void;
  onRateChange: (newRate: string) => void;
  isRunning?: boolean;
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
  isRunning: isRunningProp,
}: RateManageDialogProps) {
  const [rateInput, setRateInput] = useState("");

  // Sync managing rate data to form
  useEffect(() => {
    if (managingRate) {
      setRateInput(managingRate.value || "");
    } else {
      setRateInput("");
    }
  }, [managingRate]);

  const handleClose = () => {
    onOpenChange(false);
    setRateInput("");
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
            {managingRate?.label ? managingRate.label.split('(')[0].trim() : 'Rate-Controlled Infusion'}
          </DialogTitle>
          <DialogDescription>
            {isRunning ? "Adjust or change infusion rate" : "This infusion is currently stopped"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Rate Adjustment Section - First */}
          <div className="grid gap-3">
            <Label htmlFor="rate-input" className="text-sm font-medium">
              {managingRate?.label ? `${managingRate.label.split(' ')[0]} Rate` : "Rate"}
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
              Save
            </Button>
          </div>

          {/* Action Buttons - Second */}
          <div className="grid gap-2 pt-2">
            {isRunning && (
              <Button
                onClick={handleStopInfusion}
                variant="outline"
                className="w-full"
                data-testid="button-rate-stop"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Stop Infusion
              </Button>
            )}
            
            <Button
              onClick={handleStartNewInfusion}
              variant="outline"
              className="w-full"
              data-testid="button-rate-start-new"
            >
              <PlayCircle className="w-4 h-4 mr-2" />
              Start New Infusion
            </Button>
          </div>
          
          {/* Cancel button - Small on bottom right */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleClose}
              variant="ghost"
              size="sm"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
