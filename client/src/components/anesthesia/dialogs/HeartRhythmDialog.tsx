import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
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
}

const PRESET_RHYTHMS = [
  'SR', 'SVES', 'VES', 'VHF', 'Vorhofflattern', 'Schrittmacher', 
  'AV Block III', 'Kammerflimmern', 'Torsade de pointes', 'Defibrillator'
];

export function HeartRhythmDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingHeartRhythm,
  pendingHeartRhythm,
  onHeartRhythmCreated,
  onHeartRhythmUpdated,
  onHeartRhythmDeleted,
}: HeartRhythmDialogProps) {
  const [heartRhythmInput, setHeartRhythmInput] = useState("");
  const [heartRhythmEditTime, setHeartRhythmEditTime] = useState<number>(0);

  // Initialize mutation hooks
  const addRhythmPoint = useAddRhythmPoint(anesthesiaRecordId || undefined);
  const updateRhythmPoint = useUpdateRhythmPoint(anesthesiaRecordId || undefined);
  const deleteRhythmPoint = useDeleteRhythmPoint(anesthesiaRecordId || undefined);

  // Sync editing data to form
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
      // Editing existing value - call update mutation
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
      // Adding new value - call add mutation
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-heart-rhythm">
        <DialogHeader>
          <DialogTitle>Heart Rhythm</DialogTitle>
          <DialogDescription>
            {editingHeartRhythm ? 'Edit or delete the rhythm' : 'Select a heart rhythm to add'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-2">
            <Label>Select Rhythm</Label>
            <div className="grid gap-1">
              {editingHeartRhythm ? (
                // When editing, show buttons to select new rhythm but require Save
                <>
                  {PRESET_RHYTHMS.map((rhythm) => (
                    <Button
                      key={rhythm}
                      variant={heartRhythmInput === rhythm ? 'default' : 'outline'}
                      className="justify-start h-12 text-left"
                      onClick={() => {
                        setHeartRhythmInput(rhythm);
                      }}
                      data-testid={`button-rhythm-${rhythm.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {rhythm}
                    </Button>
                  ))}
                  <Input
                    placeholder="Custom value..."
                    value={heartRhythmInput && !PRESET_RHYTHMS.includes(heartRhythmInput) ? heartRhythmInput : ''}
                    onChange={(e) => setHeartRhythmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && heartRhythmInput.trim()) {
                        handleSave();
                      }
                    }}
                    className="mt-2"
                    data-testid="input-heart-rhythm-custom"
                  />
                </>
              ) : (
                // When adding new, preset buttons immediately save
                <>
                  {PRESET_RHYTHMS.map((rhythm) => (
                    <Button
                      key={rhythm}
                      variant="outline"
                      className="justify-start h-12 text-left"
                      onClick={() => {
                        handleSave(rhythm);
                      }}
                      data-testid={`button-rhythm-${rhythm.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {rhythm}
                    </Button>
                  ))}
                  <Input
                    placeholder="Custom value..."
                    value={heartRhythmInput}
                    onChange={(e) => setHeartRhythmInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && heartRhythmInput.trim()) {
                        handleSave();
                      }
                    }}
                    className="mt-2"
                    data-testid="input-heart-rhythm-custom"
                  />
                </>
              )}
            </div>
          </div>
        </div>
        <DialogFooterWithTime
          time={editingHeartRhythm ? heartRhythmEditTime : pendingHeartRhythm?.time}
          onTimeChange={editingHeartRhythm ? setHeartRhythmEditTime : undefined}
          showDelete={!!editingHeartRhythm}
          onDelete={editingHeartRhythm ? handleDelete : undefined}
          onCancel={handleClose}
          onSave={() => handleSave()}
          saveDisabled={!heartRhythmInput.trim()}
          saveLabel={editingHeartRhythm ? 'Save' : 'Add'}
        />
      </DialogContent>
    </Dialog>
  );
}
