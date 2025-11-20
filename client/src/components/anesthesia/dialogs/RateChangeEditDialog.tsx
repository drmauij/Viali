import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

interface RateChangeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rateChangeData: {
    medicationId: string;
    currentRate: string;
    currentTime: number;
    rateUnit: string;
    medicationName: string;
  } | null;
  onSave: (medicationId: string, newRate: string, newTime: Date) => void;
  onDelete: (medicationId: string) => void;
  formatTime: (time: number) => string;
}

export function RateChangeEditDialog({
  open,
  onOpenChange,
  rateChangeData,
  onSave,
  onDelete,
  formatTime,
}: RateChangeEditDialogProps) {
  const [rateValue, setRateValue] = useState("");
  const [timeValue, setTimeValue] = useState("");

  useEffect(() => {
    if (rateChangeData) {
      setRateValue(rateChangeData.currentRate);
      setTimeValue(formatTime(rateChangeData.currentTime));
    } else {
      setRateValue("");
      setTimeValue("");
    }
  }, [rateChangeData, formatTime]);

  const handleSave = () => {
    if (!rateChangeData || !rateValue.trim()) return;

    // Parse time string back to epoch
    // Format is "HH:MM" - we need to convert to epoch based on the original date
    const originalDate = new Date(rateChangeData.currentTime);
    const [hours, minutes] = timeValue.split(':').map(Number);
    
    const newDate = new Date(originalDate);
    newDate.setHours(hours, minutes, 0, 0);

    onSave(rateChangeData.medicationId, rateValue.trim(), newDate);
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!rateChangeData) return;
    onDelete(rateChangeData.medicationId);
    onOpenChange(false);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!rateChangeData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-rate-change-edit">
        <DialogHeader>
          <DialogTitle>Edit Rate Change</DialogTitle>
          <DialogDescription>
            {rateChangeData.medicationName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="rate-value">Rate ({rateChangeData.rateUnit})</Label>
            <Input
              id="rate-value"
              type="number"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              placeholder="Enter rate"
              data-testid="input-rate-value"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="time-value">Time</Label>
            <Input
              id="time-value"
              type="time"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              data-testid="input-time-value"
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleDelete}
            variant="destructive"
            className="w-full sm:w-auto"
            data-testid="button-delete-rate-change"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
          <div className="flex gap-2 flex-1">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="flex-1"
              data-testid="button-save"
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
