import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";

interface EditingInfusionValue {
  swimlaneId: string;
  time: number;
  value: string;
  index: number;
}

interface InfusionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingInfusionValue: EditingInfusionValue | null;
  onInfusionValueEditSave: (swimlaneId: string, index: number, newTime: number, value: string) => void;
  onInfusionValueDelete: (swimlaneId: string, index: number) => void;
}

export function InfusionEditDialog({
  open,
  onOpenChange,
  editingInfusionValue,
  onInfusionValueEditSave,
  onInfusionValueDelete,
}: InfusionEditDialogProps) {
  const [infusionEditInput, setInfusionEditInput] = useState("");
  const [infusionEditTime, setInfusionEditTime] = useState<number>(0);

  // Sync editing data to form
  useEffect(() => {
    if (editingInfusionValue) {
      setInfusionEditInput(editingInfusionValue.value);
      setInfusionEditTime(editingInfusionValue.time);
    } else {
      setInfusionEditInput("");
      setInfusionEditTime(0);
    }
  }, [editingInfusionValue]);

  const handleSave = () => {
    if (!editingInfusionValue || !infusionEditInput.trim()) return;
    
    const { swimlaneId, index } = editingInfusionValue;
    onInfusionValueEditSave(swimlaneId, index, infusionEditTime, infusionEditInput.trim());
    
    handleClose();
  };

  const handleDelete = () => {
    if (!editingInfusionValue) return;
    
    const { swimlaneId, index } = editingInfusionValue;
    onInfusionValueDelete(swimlaneId, index);
    
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
    setInfusionEditInput("");
    setInfusionEditTime(0);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        handleClose();
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-infusion-edit">
        <DialogHeader>
          <DialogTitle>Edit Infusion Rate</DialogTitle>
          <DialogDescription>
            Edit or delete the infusion rate
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="infusion-edit-value">Rate</Label>
            <Input
              id="infusion-edit-value"
              data-testid="input-infusion-edit-value"
              value={infusionEditInput}
              onChange={(e) => setInfusionEditInput(e.target.value)}
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
          time={infusionEditTime}
          onTimeChange={setInfusionEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!infusionEditInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
