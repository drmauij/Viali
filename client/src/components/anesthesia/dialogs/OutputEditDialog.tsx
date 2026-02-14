import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
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
  readOnly?: boolean;
}

export function OutputEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingOutputValue,
  onOutputUpdated,
  onOutputDeleted,
  readOnly = false,
}: OutputEditDialogProps) {
  const [outputEditInput, setOutputEditInput] = useState("");
  const [outputEditTime, setOutputEditTime] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateOutput = useUpdateOutput(anesthesiaRecordId || undefined);
  const deleteOutput = useDeleteOutput(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (open && editingOutputValue) {
      setOutputEditInput(editingOutputValue.value);
      setOutputEditTime(editingOutputValue.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else if (!open) {
      setOutputEditInput("");
      setOutputEditTime(0);
    }
  }, [open, editingOutputValue]);

  const handleSave = () => {
    if (readOnly) return;
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
    if (readOnly) return;
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Output Value"
      description={editingOutputValue ? `Edit or delete the ${editingOutputValue.label} value` : 'Edit output value'}
      testId="dialog-output-edit"
      time={outputEditTime}
      onTimeChange={setOutputEditTime}
      showDelete={!readOnly}
      onDelete={!readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveDisabled={!outputEditInput.trim() || readOnly}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="output-edit-value">Value (ml)</Label>
          <Input
            ref={inputRef}
            id="output-edit-value"
            data-testid="input-output-edit-value"
            type="number"
            step="1"
            value={outputEditInput}
            onChange={(e) => setOutputEditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !readOnly) {
                handleSave();
              }
            }}
            placeholder="Enter value"
            autoFocus
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
