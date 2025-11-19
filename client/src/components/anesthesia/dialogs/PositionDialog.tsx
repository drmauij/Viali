import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreatePosition, useUpdatePosition, useDeletePosition } from "@/hooks/usePositionQuery";

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
}

const PRESET_POSITIONS = [
  { key: 'Supine', label: 'Supine (Back)' },
  { key: 'Prone', label: 'Prone (Belly)' },
  { key: 'Left Side', label: 'Left Side' },
  { key: 'Right Side', label: 'Right Side' },
  { key: 'Beach Chair', label: 'Beach Chair' },
  { key: 'Lithotomy', label: 'Lithotomy' },
  { key: 'Head Up', label: 'Head Up' },
  { key: 'Head Down', label: 'Head Down' },
  { key: 'Sitting for SPA/PDA', label: 'Sitting for SPA/PDA' },
  { key: 'Other', label: 'Other' },
];

const PRESET_POSITION_KEYS = PRESET_POSITIONS.map(p => p.key);

export function PositionDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingPosition,
  pendingPosition,
  onPositionCreated,
  onPositionUpdated,
  onPositionDeleted,
}: PositionDialogProps) {
  const [positionInput, setPositionInput] = useState("");
  const [positionEditTime, setPositionEditTime] = useState<number>(Date.now());

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-position">
        <DialogHeader>
          <DialogTitle>Patient Position</DialogTitle>
          <DialogDescription>
            {editingPosition ? 'Edit or delete the patient position' : 'Select a patient position'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-2">
            <Label>Select Position</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_POSITIONS.map((pos) => (
                <Button
                  key={pos.key}
                  variant={positionInput === pos.key ? 'default' : 'outline'}
                  className="justify-start h-12 text-left"
                  onClick={() => {
                    if (!anesthesiaRecordId) return;
                    
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
                placeholder="Custom position..."
                value={positionInput && !PRESET_POSITION_KEYS.includes(positionInput) ? positionInput : ''}
                onChange={(e) => setPositionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && positionInput.trim() && pendingPosition) {
                    handleSave();
                  }
                }}
                className="col-span-2"
                data-testid="input-position-custom"
              />
            </div>
          </div>
        </div>
        <DialogFooterWithTime
          time={editingPosition ? positionEditTime : pendingPosition?.time}
          onTimeChange={editingPosition ? setPositionEditTime : undefined}
          showDelete={!!editingPosition}
          onDelete={editingPosition ? handleDelete : undefined}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!positionInput.trim()}
          saveLabel={editingPosition ? 'Save' : 'Add'}
        />
      </DialogContent>
    </Dialog>
  );
}
