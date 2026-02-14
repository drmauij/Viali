import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useUpdateMedication, useDeleteMedication } from "@/hooks/useMedicationQuery";

interface EditingInfusionStart {
  id: string;
  swimlaneId: string;
  time: number;
  dose: string;
  note?: string;
  medicationName: string;
  isFreeFlow: boolean;
  administrationUnit?: string | null;
  rateUnit?: string | null;
}

interface InfusionStartEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingInfusionStart: EditingInfusionStart | null;
  onInfusionUpdated?: () => void;
  onInfusionDeleted?: () => void;
}

export function InfusionStartEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingInfusionStart,
  onInfusionUpdated,
  onInfusionDeleted,
}: InfusionStartEditDialogProps) {
  const [doseInput, setDoseInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [editTime, setEditTime] = useState<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize mutation hooks
  const updateMedication = useUpdateMedication(anesthesiaRecordId || undefined);
  const deleteMedication = useDeleteMedication(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingInfusionStart) {
      setDoseInput(editingInfusionStart.dose);
      setNoteInput(editingInfusionStart.note || "");
      setEditTime(editingInfusionStart.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setDoseInput("");
      setNoteInput("");
      setEditTime(Date.now());
    }
  }, [editingInfusionStart]);

  const handleSave = () => {
    if (!editingInfusionStart || !doseInput.trim()) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingInfusionStart;

    // Call update mutation
    updateMedication.mutate(
      {
        id,
        timestamp: new Date(editTime),
        dose: doseInput.trim(),
        note: noteInput.trim() || undefined,
      },
      {
        onSuccess: () => {
          onInfusionUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingInfusionStart) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingInfusionStart;

    // Call delete mutation
    deleteMedication.mutate(id, {
      onSuccess: () => {
        onInfusionDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setDoseInput("");
    setNoteInput("");
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Infusion Start"
      description={`${editingInfusionStart?.medicationName || 'Edit or delete the infusion'} ${editingInfusionStart?.isFreeFlow ? ' (Free-flow)' : ' (Rate-controlled)'}`}
      testId="dialog-infusion-start-edit"
      time={editTime}
      onTimeChange={setEditTime}
      showDelete={true}
      onDelete={handleDelete}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!doseInput.trim()}
    >
      <div className="grid gap-4 py-4">
        {/* Dose Input - use rateUnit for rate-controlled infusions, administrationUnit for free-flow */}
        <div className="grid gap-2">
          {(() => {
            const displayUnit = editingInfusionStart?.isFreeFlow
              ? editingInfusionStart?.administrationUnit
              : editingInfusionStart?.rateUnit || editingInfusionStart?.administrationUnit;
            return (
              <>
                <Label htmlFor="infusion-dose-edit-value">
                  Starting {editingInfusionStart?.isFreeFlow ? 'Dose' : 'Rate'}{displayUnit ? ` (${displayUnit})` : ''}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    id="infusion-dose-edit-value"
                    data-testid="input-infusion-dose-edit-value"
                    value={doseInput}
                    onChange={(e) => setDoseInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave();
                      }
                    }}
                    placeholder="e.g., 5, 100, 500"
                    autoFocus
                  />
                  {displayUnit && (
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {displayUnit}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Note Input */}
        <div className="grid gap-2">
          <Label htmlFor="infusion-note-edit-value">Note (optional)</Label>
          <Input
            id="infusion-note-edit-value"
            data-testid="input-infusion-note-edit-value"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSave();
              }
            }}
            placeholder="e.g., Bolus 150mg"
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
