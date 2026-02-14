import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useUpdateVentilationMode, useDeleteVentilationMode } from "@/hooks/useVentilationModeQuery";
import { useTranslation } from "react-i18next";

interface EditingVentilationMode {
  time: number;
  mode: string;
  index: number;
  id: string;
}

interface VentilationModeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingVentilationMode: EditingVentilationMode | null;
  onVentilationModeUpdated?: () => void;
  onVentilationModeDeleted?: () => void;
  readOnly?: boolean;
}

const VENTILATION_MODES = [
  { value: "Präoxygenierung", label: "Preoxygenation" },
  { value: "Assistierte Spontanatmung", label: "Assisted Spontaneous Breathing" },
  { value: "Spontanatmung am Gerät", label: "Spontaneous Breathing on Device" },
  { value: "PCV - druckkontrolliert", label: "PCV - Pressure Controlled" },
  { value: "VCV - volumenkontrolliert", label: "VCV - Volume Controlled" },
  { value: "CPAP - PSV", label: "CPAP - PSV" },
];

export function VentilationModeEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingVentilationMode,
  onVentilationModeUpdated,
  onVentilationModeDeleted,
  readOnly = false,
}: VentilationModeEditDialogProps) {
  const [ventilationModeEditInput, setVentilationModeEditInput] = useState("");
  const [ventilationModeEditTime, setVentilationModeEditTime] = useState<number>(0);

  const updateVentilationMode = useUpdateVentilationMode(anesthesiaRecordId || undefined);
  const deleteVentilationMode = useDeleteVentilationMode(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingVentilationMode) {
      setVentilationModeEditInput(editingVentilationMode.mode);
      setVentilationModeEditTime(editingVentilationMode.time);
    } else {
      setVentilationModeEditInput("");
      setVentilationModeEditTime(0);
    }
  }, [editingVentilationMode]);

  const handleSave = () => {
    if (readOnly) return;
    if (!editingVentilationMode || !ventilationModeEditInput.trim()) return;
    if (!anesthesiaRecordId) return;
    
    const newTimestamp = ventilationModeEditTime;
    
    updateVentilationMode.mutate(
      {
        pointId: editingVentilationMode.id,
        value: ventilationModeEditInput.trim(),
        timestamp: new Date(newTimestamp).toISOString(),
      },
      {
        onSuccess: () => {
          onVentilationModeUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (readOnly) return;
    if (!editingVentilationMode) return;
    if (!anesthesiaRecordId) return;
    
    deleteVentilationMode.mutate(editingVentilationMode.id, {
      onSuccess: () => {
        onVentilationModeDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setVentilationModeEditInput("");
    setVentilationModeEditTime(0);
  };

  const { t } = useTranslation();
  
  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.editVentilationMode')}
      description={t('dialogs.editVentilationModeDesc')}
      testId="dialog-ventilation-mode-edit"
      time={ventilationModeEditTime}
      onTimeChange={setVentilationModeEditTime}
      showDelete={!readOnly}
      onDelete={!readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveDisabled={!ventilationModeEditInput.trim() || readOnly}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="mode-edit-value">{t('common.mode')}</Label>
          <Select value={ventilationModeEditInput} onValueChange={setVentilationModeEditInput} disabled={readOnly}>
            <SelectTrigger id="mode-edit-value" data-testid="select-mode-edit-value">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VENTILATION_MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
