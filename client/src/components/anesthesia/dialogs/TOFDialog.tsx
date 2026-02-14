import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddTOFPoint, useUpdateTOFPoint, useDeleteTOFPoint } from "@/hooks/useVitalsQuery";
import { useTranslation } from "react-i18next";

interface EditingTOF {
  id: string;
  time: number;
  value: string;
  percentage?: number;
  index: number;
}

interface PendingTOF {
  time: number;
}

interface TOFDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingTOF: EditingTOF | null;
  pendingTOF: PendingTOF | null;
  onTOFCreated?: () => void;
  onTOFUpdated?: () => void;
  onTOFDeleted?: () => void;
  readOnly?: boolean;
}

const TOF_FRACTIONS = ['0/4', '1/4', '2/4', '3/4', '4/4'];

export function TOFDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingTOF,
  pendingTOF,
  onTOFCreated,
  onTOFUpdated,
  onTOFDeleted,
  readOnly = false,
}: TOFDialogProps) {
  const { t } = useTranslation();
  const [fractionValue, setFractionValue] = useState("");
  const [percentageValue, setPercentageValue] = useState("");
  const [tofEditTime, setTofEditTime] = useState<number>(0);

  const addTOFPoint = useAddTOFPoint(anesthesiaRecordId || undefined);
  const updateTOFPoint = useUpdateTOFPoint(anesthesiaRecordId || undefined);
  const deleteTOFPoint = useDeleteTOFPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingTOF) {
      setFractionValue(editingTOF.value);
      setPercentageValue(editingTOF.percentage?.toString() || "");
      setTofEditTime(editingTOF.time);
    } else {
      setFractionValue("");
      setPercentageValue("");
      setTofEditTime(0);
    }
  }, [editingTOF]);

  const handleSave = (fraction?: string) => {
    const value = fraction || fractionValue;
    if (!value) return;
    if (!anesthesiaRecordId) return;

    const percentage = percentageValue ? parseFloat(percentageValue) : undefined;
    if (percentageValue && (isNaN(percentage!) || percentage! < 0 || percentage! > 100)) return;

    if (editingTOF) {
      updateTOFPoint.mutate(
        {
          pointId: editingTOF.id,
          value,
          percentage,
          timestamp: new Date(tofEditTime).toISOString(),
        },
        {
          onSuccess: () => {
            onTOFUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingTOF) {
      addTOFPoint.mutate(
        {
          timestamp: new Date(pendingTOF.time).toISOString(),
          value,
          percentage,
        },
        {
          onSuccess: () => {
            onTOFCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingTOF) return;
    if (!anesthesiaRecordId) return;

    deleteTOFPoint.mutate(editingTOF.id, {
      onSuccess: () => {
        onTOFDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setFractionValue("");
    setPercentageValue("");
  };

  const isValid = () => {
    if (!fractionValue) return false;
    if (percentageValue) {
      const pct = parseFloat(percentageValue);
      return !isNaN(pct) && pct >= 0 && pct <= 100;
    }
    return true;
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.tofTitle')}
      description={editingTOF ? t('dialogs.editOrDeleteValue') : t('dialogs.tofDesc')}
      testId="dialog-tof"
      time={editingTOF ? tofEditTime : pendingTOF?.time}
      onTimeChange={editingTOF ? setTofEditTime : undefined}
      showDelete={!!editingTOF && !readOnly}
      onDelete={editingTOF && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={() => handleSave()}
      saveDisabled={!isValid() || readOnly}
      saveLabel={editingTOF ? t('common.save') : t('common.add')}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid gap-2">
          <Label>{t('dialogs.tofCount')}</Label>
          <div className="grid grid-cols-5 gap-2">
            {editingTOF ? (
              TOF_FRACTIONS.map((fraction) => (
                <Button
                  key={fraction}
                  variant={fractionValue === fraction ? 'default' : 'outline'}
                  className="h-12 text-base font-semibold"
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    setFractionValue(fraction);
                  }}
                  data-testid={`button-tof-${fraction.replace('/', '-')}`}
                >
                  {fraction}
                </Button>
              ))
            ) : (
              TOF_FRACTIONS.map((fraction) => (
                <Button
                  key={fraction}
                  variant="outline"
                  className="h-12 text-base font-semibold"
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    if (!percentageValue) {
                      handleSave(fraction);
                    } else {
                      setFractionValue(fraction);
                    }
                  }}
                  data-testid={`button-tof-${fraction.replace('/', '-')}`}
                >
                  {fraction}
                </Button>
              ))
            )}
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tof-percentage">{t('dialogs.tofRatio')} - {t('common.optional')}</Label>
          <Input
            id="tof-percentage"
            type="number"
            placeholder="0-100"
            value={percentageValue}
            onChange={(e) => setPercentageValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid() && !readOnly) {
                handleSave();
              }
            }}
            min={0}
            max={100}
            step={1}
            data-testid="input-tof-percentage"
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
