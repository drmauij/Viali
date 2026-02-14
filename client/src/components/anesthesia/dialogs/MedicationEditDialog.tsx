import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useUpdateMedication, useDeleteMedication } from "@/hooks/useMedicationQuery";

interface EditingMedicationDose {
  swimlaneId: string;
  time: number;
  dose: string;
  note?: string;
  index: number;
  id: string;
}

interface SwimlaneConfig {
  id: string;
  label: string;
  defaultDose?: string | null;
  administrationUnit?: string | null;
}

interface MedicationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingMedicationDose: EditingMedicationDose | null;
  activeSwimlanes: SwimlaneConfig[];
  onMedicationDoseUpdated?: () => void;
  onMedicationDoseDeleted?: () => void;
  readOnly?: boolean;
}

export function MedicationEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingMedicationDose,
  activeSwimlanes,
  onMedicationDoseUpdated,
  onMedicationDoseDeleted,
  readOnly = false,
}: MedicationEditDialogProps) {
  const [medicationEditInput, setMedicationEditInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [medicationEditTime, setMedicationEditTime] = useState<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize mutation hooks
  const updateMedication = useUpdateMedication(anesthesiaRecordId || undefined);
  const deleteMedication = useDeleteMedication(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingMedicationDose) {
      setMedicationEditInput(editingMedicationDose.dose);
      setNoteInput(editingMedicationDose.note || "");
      setMedicationEditTime(editingMedicationDose.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setMedicationEditInput("");
      setNoteInput("");
      setMedicationEditTime(Date.now());
    }
  }, [editingMedicationDose]);

  const handleSave = () => {
    if (!editingMedicationDose || !medicationEditInput.trim()) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingMedicationDose;

    // Call update mutation
    updateMedication.mutate(
      {
        id,
        timestamp: new Date(medicationEditTime),
        dose: medicationEditInput.trim(),
        note: noteInput.trim() || undefined,
      },
      {
        onSuccess: () => {
          onMedicationDoseUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingMedicationDose) return;
    if (!anesthesiaRecordId) return;

    const { id } = editingMedicationDose;

    // Call delete mutation
    deleteMedication.mutate(id, {
      onSuccess: () => {
        onMedicationDoseDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setMedicationEditInput("");
    setNoteInput("");
  };

  // Get the swimlane to check for range defaults
  const swimlane = editingMedicationDose
    ? activeSwimlanes.find(lane => lane.id === editingMedicationDose.swimlaneId)
    : null;

  // Parse dose presets from defaultDose (e.g., "25-35-50")
  const dosePresets = swimlane?.defaultDose && swimlane.defaultDose.includes('-')
    ? swimlane.defaultDose.split('-').map(v => v.trim()).filter(v => v)
    : [];

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Dose"
      description={swimlane?.label || 'Edit or delete the medication dose'}
      testId="dialog-medication-edit"
      time={medicationEditTime}
      onTimeChange={setMedicationEditTime}
      showDelete={!readOnly}
      onDelete={!readOnly ? handleDelete : undefined}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!medicationEditInput.trim() || readOnly}
    >
      <div className="grid gap-4 py-4">
        {/* Preset Buttons if available */}
        {dosePresets.length > 0 && (
          <>
            <div className="text-sm font-medium">Quick doses:</div>
            <div className="grid grid-cols-3 gap-2">
              {dosePresets.map((dose, idx) => (
                <Button
                  key={idx}
                  onClick={() => {
                    if (readOnly) return;
                    setMedicationEditInput(dose);
                  }}
                  variant="outline"
                  className="h-12"
                  data-testid={`button-dose-preset-${dose}`}
                  disabled={readOnly}
                >
                  {dose}{swimlane?.administrationUnit ? ` ${swimlane.administrationUnit}` : ''}
                </Button>
              ))}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or custom
                </span>
              </div>
            </div>
          </>
        )}

        {/* Dose Input */}
        <div className="grid gap-2">
          <Label htmlFor="dose-edit-value">
            Dose{swimlane?.administrationUnit ? ` (${swimlane.administrationUnit})` : ''}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              id="dose-edit-value"
              data-testid="input-dose-edit-value"
              value={medicationEditInput}
              onChange={(e) => setMedicationEditInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !readOnly) {
                  handleSave();
                }
              }}
              placeholder="e.g., 5, 100, 2"
              autoFocus
              disabled={readOnly}
            />
            {swimlane?.administrationUnit && (
              <span className="text-sm text-muted-foreground min-w-fit">
                {swimlane.administrationUnit}
              </span>
            )}
          </div>
        </div>

        {/* Note Input */}
        <div className="grid gap-2">
          <Label htmlFor="dose-note-value">Note (optional)</Label>
          <Input
            id="dose-note-value"
            data-testid="input-dose-note-value"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !readOnly) {
                handleSave();
              }
            }}
            placeholder="e.g., Bolus 150mg"
            disabled={readOnly}
          />
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
