import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddRhythmPoint, useUpdateRhythmPoint, useDeleteRhythmPoint } from "@/hooks/useRhythmQuery";

interface EditingHeartRhythm {
  id: string;
  time: number;
  rhythm: string;
  index: number;
}

interface PendingHeartRhythm {
  time: number;
}

interface HeartRhythmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingHeartRhythm: EditingHeartRhythm | null;
  pendingHeartRhythm: PendingHeartRhythm | null;
  onHeartRhythmCreated?: () => void;
  onHeartRhythmUpdated?: () => void;
  onHeartRhythmDeleted?: () => void;
  readOnly?: boolean;
}

const RHYTHM_KEYS = [
  'sr', 'sves', 'ves', 'af', 'afl', 'pacemaker', 
  'avBlock3', 'vf', 'torsade', 'defibrillator'
] as const;

export function HeartRhythmDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingHeartRhythm,
  pendingHeartRhythm,
  onHeartRhythmCreated,
  onHeartRhythmUpdated,
  onHeartRhythmDeleted,
  readOnly = false,
}: HeartRhythmDialogProps) {
  const { t } = useTranslation();
  const [heartRhythmInput, setHeartRhythmInput] = useState("");
  const [heartRhythmEditTime, setHeartRhythmEditTime] = useState<number>(0);

  const addRhythmPoint = useAddRhythmPoint(anesthesiaRecordId || undefined);
  const updateRhythmPoint = useUpdateRhythmPoint(anesthesiaRecordId || undefined);
  const deleteRhythmPoint = useDeleteRhythmPoint(anesthesiaRecordId || undefined);

  const rhythmOptions = RHYTHM_KEYS.map(key => ({
    key,
    label: t(`anesthesia.timeline.heartRhythmDialog.rhythms.${key}`)
  }));

  useEffect(() => {
    if (editingHeartRhythm) {
      setHeartRhythmInput(editingHeartRhythm.rhythm);
      setHeartRhythmEditTime(editingHeartRhythm.time);
    } else {
      setHeartRhythmInput("");
      setHeartRhythmEditTime(0);
    }
  }, [editingHeartRhythm]);

  const handleSave = (rhythmValue?: string) => {
    const rhythm = (rhythmValue || heartRhythmInput).trim();
    if (!rhythm) return;
    if (!anesthesiaRecordId) return;

    if (editingHeartRhythm) {
      const newTimestamp = heartRhythmEditTime;

      updateRhythmPoint.mutate(
        {
          pointId: editingHeartRhythm.id,
          value: rhythm,
          timestamp: new Date(newTimestamp).toISOString(),
        },
        {
          onSuccess: () => {
            onHeartRhythmUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingHeartRhythm) {
      addRhythmPoint.mutate(
        {
          timestamp: new Date(pendingHeartRhythm.time).toISOString(),
          value: rhythm,
        },
        {
          onSuccess: () => {
            onHeartRhythmCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingHeartRhythm) return;
    if (!anesthesiaRecordId) return;

    deleteRhythmPoint.mutate(editingHeartRhythm.id, {
      onSuccess: () => {
        onHeartRhythmDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setHeartRhythmInput("");
  };

  const isPresetRhythm = (value: string) => {
    return rhythmOptions.some(opt => opt.label === value);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('anesthesia.timeline.heartRhythmDialog.title')}
      description={editingHeartRhythm
        ? t('anesthesia.timeline.heartRhythmDialog.editRhythm')
        : t('anesthesia.timeline.heartRhythmDialog.selectRhythm')}
      testId="dialog-heart-rhythm"
      time={editingHeartRhythm ? heartRhythmEditTime : pendingHeartRhythm?.time}
      onTimeChange={editingHeartRhythm ? setHeartRhythmEditTime : undefined}
      showDelete={!!editingHeartRhythm && !readOnly}
      onDelete={editingHeartRhythm && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={() => handleSave()}
      saveDisabled={!heartRhythmInput.trim() || readOnly}
      saveLabel={editingHeartRhythm ? t('anesthesia.timeline.heartRhythmDialog.save', 'Save') : t('anesthesia.timeline.heartRhythmDialog.add', 'Add')}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid gap-2">
          <Label>{t('anesthesia.timeline.heartRhythmDialog.selectLabel')}</Label>
          <div className="grid gap-1">
            {editingHeartRhythm ? (
              <>
                {rhythmOptions.map((rhythm) => (
                  <Button
                    key={rhythm.key}
                    variant={heartRhythmInput === rhythm.label ? 'default' : 'outline'}
                    className="justify-start h-12 text-left"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      setHeartRhythmInput(rhythm.label);
                    }}
                    data-testid={`button-rhythm-${rhythm.key}`}
                  >
                    {rhythm.label}
                  </Button>
                ))}
                <Input
                  placeholder={t('anesthesia.timeline.heartRhythmDialog.customPlaceholder')}
                  value={heartRhythmInput && !isPresetRhythm(heartRhythmInput) ? heartRhythmInput : ''}
                  onChange={(e) => setHeartRhythmInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && heartRhythmInput.trim() && !readOnly) {
                      handleSave();
                    }
                  }}
                  className="mt-2"
                  data-testid="input-heart-rhythm-custom"
                  disabled={readOnly}
                />
              </>
            ) : (
              <>
                {rhythmOptions.map((rhythm) => (
                  <Button
                    key={rhythm.key}
                    variant="outline"
                    className="justify-start h-12 text-left"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return;
                      handleSave(rhythm.label);
                    }}
                    data-testid={`button-rhythm-${rhythm.key}`}
                  >
                    {rhythm.label}
                  </Button>
                ))}
                <Input
                  placeholder={t('anesthesia.timeline.heartRhythmDialog.customPlaceholder')}
                  value={heartRhythmInput}
                  onChange={(e) => setHeartRhythmInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && heartRhythmInput.trim() && !readOnly) {
                      handleSave();
                    }
                  }}
                  className="mt-2"
                  data-testid="input-heart-rhythm-custom"
                  disabled={readOnly}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
