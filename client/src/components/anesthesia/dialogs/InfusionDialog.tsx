import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";

interface PendingInfusionValue {
  swimlaneId: string;
  time: number;
  label: string;
}

interface InfusionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingInfusionValue: PendingInfusionValue | null;
  onInfusionValueEntry: (swimlaneId: string, time: number, value: string) => void;
}

export function InfusionDialog({
  open,
  onOpenChange,
  pendingInfusionValue,
  onInfusionValueEntry,
}: InfusionDialogProps) {
  const [infusionInput, setInfusionInput] = useState("");

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setInfusionInput("");
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingInfusionValue || !infusionInput.trim()) return;
    
    const { swimlaneId, time } = pendingInfusionValue;
    onInfusionValueEntry(swimlaneId, time, infusionInput.trim());
    
    // Reset dialog state
    onOpenChange(false);
    setInfusionInput("");
  };

  const handleClose = () => {
    onOpenChange(false);
    setInfusionInput("");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-infusion-value">
        <DialogHeader>
          <DialogTitle>Add Infusion Rate</DialogTitle>
          <DialogDescription>
            {pendingInfusionValue ? `${pendingInfusionValue.label}` : 'Add a new infusion rate value'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="infusion-value">Rate</Label>
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
              placeholder="e.g., 100ml/h, 50ml/h"
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={pendingInfusionValue?.time}
          onTimeChange={(newTime) => {
            // Time change handled externally in parent component
          }}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!infusionInput.trim()}
          saveLabel="Add"
        />
      </DialogContent>
    </Dialog>
  );
}
