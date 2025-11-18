import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StopCircle, PlayCircle } from "lucide-react";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";

interface ManagingRate {
  swimlaneId: string;
  time: number;
  value: string;
  index: number;
  label: string;
  rateOptions?: string[];
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
}: RateManageDialogProps) {
  const [rateManageInput, setRateManageInput] = useState("");

  // Sync managing rate data to form
  useEffect(() => {
    if (managingRate) {
      onRateManageTimeChange(managingRate.time);
      setRateManageInput("");
    } else {
      setRateManageInput("");
      onRateManageTimeChange(0);
    }
  }, [managingRate]);

  const handleClose = () => {
    onOpenChange(false);
    setRateManageInput("");
    onRateManageTimeChange(0);
  };

  // Determine if infusion is running
  const isRunning = managingRate && (() => {
    const { swimlaneId } = managingRate;
    const existingData = infusionData[swimlaneId] || [];
    
    // Find the latest NON-EMPTY marker to determine running state
    const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
    
    const latestRateMarker = sortedData.find(([_, val]) => val !== "");
    const latestStopMarker = sortedData.find(([_, val]) => val === "");
    
    return latestRateMarker && 
      (!latestStopMarker || latestRateMarker[0] >= latestStopMarker[0]);
  })();

  // Get default rate for Start/Start New buttons
  const getDefaultRate = () => {
    if (rateManageInput.trim() && !isNaN(Number(rateManageInput)) && Number(rateManageInput) > 0) {
      return rateManageInput.trim();
    } else if (managingRate?.value && managingRate.value !== "") {
      return managingRate.value;
    } else if (managingRate?.rateOptions && managingRate.rateOptions.length > 0) {
      return managingRate.rateOptions[0];
    }
    return "";
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
          <DialogTitle>Manage Infusion</DialogTitle>
          <DialogDescription>
            {managingRate ? `${managingRate.label} - Current: ${managingRate.value}` : 'Manage this rate'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Conditional Stop/Start/Start New Actions */}
          <div className="grid grid-cols-2 gap-2">
            {/* Stop button - only visible for running infusions */}
            {isRunning && (
              <Button
                onClick={onRateStop}
                variant="outline"
                className="h-20 flex flex-col gap-2"
                data-testid="button-rate-stop"
              >
                <StopCircle className="w-6 h-6" />
                <span className="text-sm">Stop</span>
              </Button>
            )}
            
            {/* Start button - only visible for stopped infusions */}
            {!isRunning && (
              <Button
                onClick={() => {
                  const rate = getDefaultRate();
                  if (rate) onRateStart(rate);
                }}
                variant="outline"
                className="h-20 flex flex-col gap-2"
                data-testid="button-rate-start"
              >
                <PlayCircle className="w-6 h-6" />
                <span className="text-sm">Start</span>
              </Button>
            )}
            
            {/* Start New button - always visible */}
            <Button
              onClick={() => {
                const rate = getDefaultRate();
                if (rate) onRateStartNew(rate);
              }}
              variant="outline"
              className="h-20 flex flex-col gap-2"
              data-testid="button-rate-start-new"
            >
              <PlayCircle className="w-6 h-6" />
              <span className="text-sm">Start New</span>
            </Button>
          </div>
          
          {/* Separate Change Rate Section */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Change Rate
              </span>
            </div>
          </div>
          
          {managingRate?.rateOptions && managingRate.rateOptions.length > 0 && (
            <>
              <div className="text-sm font-medium">Preset rates:</div>
              <div className="grid grid-cols-3 gap-2">
                {managingRate.rateOptions.map((rate, idx) => (
                  <Button
                    key={idx}
                    onClick={() => onRateChange(rate)}
                    variant="outline"
                    className="h-12"
                    data-testid={`button-change-rate-${rate}`}
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
                    Or custom
                  </span>
                </div>
              </div>
            </>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="rate-manage-input">Custom Rate</Label>
            <Input
              id="rate-manage-input"
              type="number"
              inputMode="decimal"
              data-testid="input-rate-manage"
              value={rateManageInput}
              onChange={(e) => setRateManageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && rateManageInput.trim() && !isNaN(Number(rateManageInput)) && Number(rateManageInput) > 0) {
                  onRateChange(rateManageInput.trim());
                }
              }}
              placeholder="e.g., 10"
            />
            <Button
              onClick={() => onRateChange(rateManageInput.trim())}
              disabled={!rateManageInput.trim() || isNaN(Number(rateManageInput)) || Number(rateManageInput) <= 0}
              className="w-full"
              data-testid="button-change-rate-custom"
            >
              Change to {rateManageInput.trim() || "..."}
            </Button>
          </div>
        </div>
        <DialogFooterWithTime
          time={rateManageTime}
          onTimeChange={onRateManageTimeChange}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleClose}
          saveDisabled={false}
          saveLabel="Close"
        />
      </DialogContent>
    </Dialog>
  );
}
