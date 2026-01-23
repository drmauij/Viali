import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditValueForm({
  type,
  initialValue,
  onSave,
  onDelete,
  onCancel,
}: {
  type: 'hr' | 'sys' | 'dia' | 'spo2';
  initialValue: number;
  onSave: (value: number) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue.toString());

  const getLabel = () => {
    if (type === 'hr') return 'Heart Rate (bpm)';
    if (type === 'sys') return 'Systolic BP (mmHg)';
    if (type === 'dia') return 'Diastolic BP (mmHg)';
    return 'SpO₂ (%)';
  };

  const handleSave = () => {
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;
    onSave(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor="edit-value">{getLabel()}</Label>
        <Input
          id="edit-value"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          data-testid="input-edit-value"
          autoFocus
        />
      </div>
      <div className="flex justify-between gap-2">
        <Button
          variant="destructive"
          onClick={onDelete}
          data-testid="button-delete-value"
        >
          Delete
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            data-testid="button-save-edit"
            disabled={!value || isNaN(parseInt(value))}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
