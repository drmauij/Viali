import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useUpdateOutput, useDeleteOutput, type OutputParamKey } from "@/hooks/useOutputQuery";

interface EditingOutputValue {
  paramKey: OutputParamKey;
  time: number;
  value: string;
  index: number;
  label: string;
  id: string;
}

interface OutputEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingOutputValue: EditingOutputValue | null;
  onOutputUpdated?: () => void;
  onOutputDeleted?: () => void;
}

export function OutputEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingOutputValue,
  onOutputUpdated,
  onOutputDeleted,
}: OutputEditDialogProps) {
  const [outputEditInput, setOutputEditInput] = useState("");
  const [outputEditTime, setOutputEditTime] = useState<number>(0);

  const updateOutput = useUpdateOutput(anesthesiaRecordId || undefined);
  const deleteOutput = useDeleteOutput(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (open && editingOutputValue) {
      setOutputEditInput(editingOutputValue.value);
      setOutputEditTime(editingOutputValue.time);
    } else if (!open) {
      setOutputEditInput("");
      setOutputEditTime(0);
    }
  }, [open, editingOutputValue]);

  const handleSave = () => {
    if (!editingOutputValue || !outputEditInput.trim()) return;
    if (!anesthesiaRecordId) return;
    
    const { paramKey, id } = editingOutputValue;
    const value = parseFloat(outputEditInput.trim());
    
    if (isNaN(value)) {
      return;
    }
    
    updateOutput.mutate(
      {
        pointId: id,
        paramKey,
        value,
        timestamp: new Date(outputEditTime).toISOString(),
      },
      {
        onSuccess: () => {
          onOutputUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingOutputValue) return;
    if (!anesthesiaRecordId) return;
    
    const { paramKey, id } = editingOutputValue;
    
    deleteOutput.mutate(
      {
        pointId: id,
        paramKey,
      },
      {
        onSuccess: () => {
          onOutputDeleted?.();
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    setOutputEditInput("");
    setOutputEditTime(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-output-edit">
        <DialogHeader>
          <DialogTitle>Edit Output Value</DialogTitle>
          <DialogDescription>
            {editingOutputValue ? `Edit or delete the ${editingOutputValue.label} value` : 'Edit output value'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="output-edit-value">Value (ml)</Label>
            <Input
              id="output-edit-value"
              data-testid="input-output-edit-value"
              type="number"
              step="1"
              value={outputEditInput}
              onChange={(e) => setOutputEditInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              placeholder="Enter value"
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={outputEditTime}
          onTimeChange={setOutputEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!outputEditInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
