import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
      title={t('dialogs.editInfusionRate')}
      description={t('dialogs.editInfusionRateDesc')}
      testId="dialog-infusion-edit"
      time={infusionEditTime}
      onTimeChange={setInfusionEditTime}
      showDelete={true}
      onDelete={handleDelete}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!infusionEditInput.trim()}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="infusion-edit-value">{t('common.rate')}</Label>
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
    </BaseTimelineDialog>
  );
}
