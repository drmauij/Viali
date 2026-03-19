import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddVitalPoint, useUpdateVitalPoint, useDeleteVitalPoint } from "@/hooks/useVitalsQuery";
import { useTranslation } from "react-i18next";

interface EditingTemperatur {
  id: string;
  time: number;
  value: number;
  index: number;
}

interface PendingTemperatur {
  time: number;
}

interface TemperaturDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingTemperatur: EditingTemperatur | null;
  pendingTemperatur: PendingTemperatur | null;
  onTemperaturCreated?: () => void;
  onTemperaturUpdated?: () => void;
  onTemperaturDeleted?: () => void;
  readOnly?: boolean;
}

export function TemperaturDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingTemperatur,
  pendingTemperatur,
  onTemperaturCreated,
  onTemperaturUpdated,
  onTemperaturDeleted,
  readOnly = false,
}: TemperaturDialogProps) {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState("");
  const [tempEditTime, setTempEditTime] = useState<number>(0);

  const addVitalPoint = useAddVitalPoint(anesthesiaRecordId || undefined);
  const updateVitalPoint = useUpdateVitalPoint(anesthesiaRecordId || undefined);
  const deleteVitalPoint = useDeleteVitalPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingTemperatur) {
      setTempValue(editingTemperatur.value.toString());
      setTempEditTime(editingTemperatur.time);
    } else {
      setTempValue("");
      setTempEditTime(0);
    }
  }, [editingTemperatur]);

  const handleSave = () => {
    const value = parseFloat(tempValue);
    if (isNaN(value) || value < 20 || value > 45) return;
    if (!anesthesiaRecordId) return;

    if (editingTemperatur) {
      updateVitalPoint.mutate(
        {
          pointId: editingTemperatur.id,
          value,
          timestamp: new Date(tempEditTime).toISOString(),
        },
        {
          onSuccess: () => {
            onTemperaturUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingTemperatur) {
      addVitalPoint.mutate(
        {
          vitalType: 'temp',
          timestamp: new Date(pendingTemperatur.time).toISOString(),
          value,
        },
        {
          onSuccess: () => {
            onTemperaturCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingTemperatur) return;
    if (!anesthesiaRecordId) return;

    deleteVitalPoint.mutate(editingTemperatur.id, {
      onSuccess: () => {
        onTemperaturDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTempValue("");
  };

  const isValid = () => {
    const value = parseFloat(tempValue);
    return !isNaN(value) && value >= 20 && value <= 45;
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('anesthesia.timeline.temperature.dialogTitle', 'Temperature')}
      description={editingTemperatur ? t('dialogs.editOrDeleteValue') : t('anesthesia.timeline.temperature.dialogDesc', 'Enter temperature value in °C')}
      testId="dialog-temperatur"
      time={editingTemperatur ? tempEditTime : pendingTemperatur?.time}
      onTimeChange={editingTemperatur ? setTempEditTime : undefined}
      showDelete={!!editingTemperatur && !readOnly}
      onDelete={editingTemperatur && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!isValid() || readOnly}
      saveLabel={editingTemperatur ? t('common.save') : t('common.add')}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="temp-value">{t('anesthesia.timeline.temperature.valueLabel', 'Temperature (°C)')}</Label>
          <Input
            id="temp-value"
            type="number"
            placeholder="36.5"
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid() && !readOnly) {
                handleSave();
              }
            }}
            min={20}
            max={45}
            step={0.1}
            autoFocus
            data-testid="input-temperatur-value"
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
