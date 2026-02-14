import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreatePosition, useUpdatePosition, useDeletePosition } from "@/hooks/usePositionQuery";
import { useTranslation } from "react-i18next";

interface EditingPosition {
  id: string;
  time: number;
  position: string;
  index: number;
}

interface PendingPosition {
  time: number;
}

interface PositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingPosition: EditingPosition | null;
  pendingPosition: PendingPosition | null;
  onPositionCreated?: () => void;
  onPositionUpdated?: () => void;
  onPositionDeleted?: () => void;
  readOnly?: boolean;
}

const PRESET_POSITION_KEYS = ['Supine', 'Prone', 'Left Side', 'Right Side', 'Beach Chair', 'Lithotomy', 'Head Up', 'Head Down', 'Sitting for SPA/PDA', 'Other'];

export function PositionDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingPosition,
  pendingPosition,
  onPositionCreated,
  onPositionUpdated,
  onPositionDeleted,
  readOnly = false,
}: PositionDialogProps) {
  const { t } = useTranslation();
  const [positionInput, setPositionInput] = useState("");
  const [positionEditTime, setPositionEditTime] = useState<number>(Date.now());

  const PRESET_POSITIONS = [
    { key: 'Supine', label: t('anesthesia.timeline.positionDialog.positions.supine') },
    { key: 'Prone', label: t('anesthesia.timeline.positionDialog.positions.prone') },
    { key: 'Left Side', label: t('anesthesia.timeline.positionDialog.positions.leftSide') },
    { key: 'Right Side', label: t('anesthesia.timeline.positionDialog.positions.rightSide') },
    { key: 'Beach Chair', label: t('anesthesia.timeline.positionDialog.positions.beachChair') },
    { key: 'Lithotomy', label: t('anesthesia.timeline.positionDialog.positions.lithotomy') },
    { key: 'Head Up', label: t('anesthesia.timeline.positionDialog.positions.headUp') },
    { key: 'Head Down', label: t('anesthesia.timeline.positionDialog.positions.headDown') },
    { key: 'Sitting for SPA/PDA', label: t('anesthesia.timeline.positionDialog.positions.sittingSpaPda') },
    { key: 'Other', label: t('anesthesia.timeline.positionDialog.positions.other') },
  ];

  // Initialize mutation hooks
  const createPosition = useCreatePosition(anesthesiaRecordId || undefined);
  const updatePosition = useUpdatePosition(anesthesiaRecordId || undefined);
  const deletePosition = useDeletePosition(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingPosition) {
      setPositionInput(editingPosition.position);
      setPositionEditTime(editingPosition.time);
    } else {
      setPositionInput("");
      setPositionEditTime(Date.now());
    }
  }, [editingPosition]);

  const handleSave = () => {
    const position = positionInput.trim();
    if (!position) return;
    if (!anesthesiaRecordId) return;

    if (editingPosition) {
      // Editing existing value - call update mutation
      const { id } = editingPosition;

      updatePosition.mutate(
        {
          id,
          timestamp: new Date(positionEditTime),
          position,
        },
        {
          onSuccess: () => {
            onPositionUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingPosition) {
      // Adding new value - call create mutation
      createPosition.mutate(
        {
          anesthesiaRecordId,
          timestamp: new Date(pendingPosition.time),
          position,
        },
        {
          onSuccess: () => {
            onPositionCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingPosition) return;
    if (!anesthesiaRecordId) return;

    deletePosition.mutate(editingPosition.id, {
      onSuccess: () => {
        onPositionDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setPositionInput("");
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('anesthesia.timeline.positionDialog.title')}
      description={editingPosition ? t('anesthesia.timeline.positionDialog.editDescription') : t('anesthesia.timeline.positionDialog.selectDescription')}
      className="sm:max-w-[500px]"
      testId="dialog-position"
      time={editingPosition ? positionEditTime : pendingPosition?.time}
      onTimeChange={editingPosition ? setPositionEditTime : undefined}
      showDelete={!!editingPosition && !readOnly}
      onDelete={editingPosition && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!positionInput.trim() || readOnly}
      saveLabel={editingPosition ? t('common.save') : t('anesthesia.timeline.add')}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid gap-2">
          <Label>{t('anesthesia.timeline.positionDialog.selectLabel')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_POSITIONS.map((pos) => (
              <Button
                key={pos.key}
                variant={positionInput === pos.key ? 'default' : 'outline'}
                className="justify-start h-12 text-left"
                disabled={readOnly}
                onClick={() => {
                  if (!anesthesiaRecordId || readOnly) return;

                  if (editingPosition) {
                    updatePosition.mutate(
                      {
                        id: editingPosition.id,
                        timestamp: new Date(positionEditTime),
                        position: pos.key,
                      },
                      {
                        onSuccess: () => {
                          onPositionUpdated?.();
                          handleClose();
                        },
                      }
                    );
                  } else if (pendingPosition) {
                    createPosition.mutate(
                      {
                        anesthesiaRecordId,
                        timestamp: new Date(pendingPosition.time),
                        position: pos.key,
                      },
                      {
                        onSuccess: () => {
                          onPositionCreated?.();
                          handleClose();
                        },
                      }
                    );
                  }
                }}
                data-testid={`button-position-${pos.key.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')}`}
              >
                {pos.label}
              </Button>
            ))}
            <Input
              placeholder={t('anesthesia.timeline.positionDialog.customPlaceholder')}
              value={positionInput && !PRESET_POSITION_KEYS.includes(positionInput) ? positionInput : ''}
              onChange={(e) => setPositionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && positionInput.trim() && pendingPosition && !readOnly) {
                  handleSave();
                }
              }}
              className="col-span-2"
              data-testid="input-position-custom"
              disabled={readOnly}
            />
          </div>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
