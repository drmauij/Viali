import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const getLabel = () => {
    if (type === 'hr') return t('anesthesia.timeline.editValue.heartRate', 'Heart Rate (bpm)');
    if (type === 'sys') return t('anesthesia.timeline.editValue.systolicBP', 'Systolic BP (mmHg)');
    if (type === 'dia') return t('anesthesia.timeline.editValue.diastolicBP', 'Diastolic BP (mmHg)');
    return t('anesthesia.timeline.editValue.spo2', 'SpO\u2082 (%)');
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
          {t('common.delete', 'Delete')}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            data-testid="button-cancel-edit"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            data-testid="button-save-edit"
            disabled={!value || isNaN(parseInt(value))}
          >
            {t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
