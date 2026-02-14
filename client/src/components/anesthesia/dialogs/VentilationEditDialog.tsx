import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useUpdateVitalPoint, useDeleteVitalPoint } from "@/hooks/useVitalsQuery";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface EditingVentilationValue {
  paramKey: string;
  time: number;
  value: string;
  index: number;
  label: string;
  id: string;
}

interface VentilationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingVentilationValue: EditingVentilationValue | null;
  onVentilationUpdated?: () => void;
  onVentilationDeleted?: () => void;
  readOnly?: boolean;
}

export function VentilationEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingVentilationValue,
  onVentilationUpdated,
  onVentilationDeleted,
  readOnly = false,
}: VentilationEditDialogProps) {
  const { t } = useTranslation();
  const [ventilationEditInput, setVentilationEditInput] = useState("");
  const [ventilationEditTime, setVentilationEditTime] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const updateVitalPointMutation = useUpdateVitalPoint(anesthesiaRecordId || undefined);
  const deleteVitalPointMutation = useDeleteVitalPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingVentilationValue) {
      setVentilationEditInput(editingVentilationValue.value);
      setVentilationEditTime(editingVentilationValue.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setVentilationEditInput("");
      setVentilationEditTime(0);
    }
  }, [editingVentilationValue]);

  const handleSave = () => {
    if (readOnly) return;
    if (!editingVentilationValue || !ventilationEditInput.trim()) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingVentilationValue;
    const value = parseFloat(ventilationEditInput.trim());

    if (isNaN(value)) {
      toast({
        title: t('dialogs.invalidValue'),
        description: t('dialogs.enterValidNumber'),
        variant: "destructive",
      });
      return;
    }

    const newTimestamp = ventilationEditTime;

    updateVitalPointMutation.mutate(
      {
        pointId: id,
        value,
        timestamp: new Date(newTimestamp).toISOString(),
      },
      {
        onSuccess: () => {
          onVentilationUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (readOnly) return;
    if (!editingVentilationValue) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingVentilationValue;

    deleteVitalPointMutation.mutate(id, {
      onSuccess: () => {
        onVentilationDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setVentilationEditInput("");
    setVentilationEditTime(0);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.editParam', { param: editingVentilationValue?.label })}
      description={t('dialogs.editOrDeleteVentilationValue')}
      testId="dialog-ventilation-edit"
      time={ventilationEditTime}
      onTimeChange={setVentilationEditTime}
      showDelete={!readOnly}
      onDelete={!readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveDisabled={!ventilationEditInput.trim() || readOnly}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="ventilation-edit-value">{t('common.value')}</Label>
          <Input
            ref={inputRef}
            id="ventilation-edit-value"
            data-testid="input-ventilation-edit-value"
            type="number"
            step="any"
            value={ventilationEditInput}
            onChange={(e) => setVentilationEditInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !readOnly) {
                handleSave();
              }
            }}
            placeholder={t('dialogs.enterValue')}
            autoFocus
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
