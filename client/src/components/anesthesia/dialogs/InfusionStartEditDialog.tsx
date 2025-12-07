import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-infusion-start-edit">
        <DialogHeader>
          <DialogTitle>Edit Infusion Start</DialogTitle>
          <DialogDescription>
            {editingInfusionStart?.medicationName || 'Edit or delete the infusion'} 
            {editingInfusionStart?.isFreeFlow ? ' (Free-flow)' : ' (Rate-controlled)'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Dose Input */}
          <div className="grid gap-2">
            <Label htmlFor="infusion-dose-edit-value">
              Starting Dose{editingInfusionStart?.administrationUnit ? ` (${editingInfusionStart.administrationUnit})` : ''}
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
              {editingInfusionStart?.administrationUnit && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {editingInfusionStart.administrationUnit}
                </span>
              )}
            </div>
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
        <DialogFooterWithTime
          time={editTime}
          onTimeChange={setEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!doseInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
