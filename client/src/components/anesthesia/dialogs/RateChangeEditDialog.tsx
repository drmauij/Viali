import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";

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
  const [editTime, setEditTime] = useState<number>(Date.now());

  useEffect(() => {
    if (rateChangeData) {
      setRateValue(rateChangeData.currentRate);
      setEditTime(rateChangeData.currentTime);
    } else {
      setRateValue("");
      setEditTime(Date.now());
    }
  }, [rateChangeData]);

  const handleSave = () => {
    if (!rateChangeData || !rateValue.trim()) return;
    onSave(rateChangeData.medicationId, rateValue.trim(), new Date(editTime));
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Rate Change"
      description={rateChangeData.medicationName}
      className="sm:max-w-md"
      testId="dialog-rate-change-edit"
      time={editTime}
      onTimeChange={setEditTime}
      showDelete={true}
      onDelete={handleDelete}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!rateValue.trim()}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="rate-value">Rate ({rateChangeData.rateUnit})</Label>
          <Input
            id="rate-value"
            type="number"
            value={rateValue}
            onChange={(e) => setRateValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
              }
            }}
            placeholder="Enter rate"
            data-testid="input-rate-value"
            autoFocus
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
