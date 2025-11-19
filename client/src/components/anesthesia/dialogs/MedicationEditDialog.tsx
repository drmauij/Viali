import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useUpdateMedication, useDeleteMedication } from "@/hooks/useMedicationQuery";

interface EditingMedicationDose {
  swimlaneId: string;
  time: number;
  dose: string;
  index: number;
  id: string;
}

interface SwimlaneConfig {
  id: string;
  label: string;
  defaultDose?: string | null;
}

interface MedicationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingMedicationDose: EditingMedicationDose | null;
  activeSwimlanes: SwimlaneConfig[];
  onMedicationDoseUpdated?: () => void;
  onMedicationDoseDeleted?: () => void;
}

export function MedicationEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingMedicationDose,
  activeSwimlanes,
  onMedicationDoseUpdated,
  onMedicationDoseDeleted,
}: MedicationEditDialogProps) {
  const [medicationEditInput, setMedicationEditInput] = useState("");
  const [medicationEditTime, setMedicationEditTime] = useState<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize mutation hooks
  const updateMedication = useUpdateMedication(anesthesiaRecordId || undefined);
  const deleteMedication = useDeleteMedication(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingMedicationDose) {
      setMedicationEditInput(editingMedicationDose.dose);
      setMedicationEditTime(editingMedicationDose.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setMedicationEditInput("");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-edit">
        <DialogHeader>
          <DialogTitle>Edit Dose</DialogTitle>
          <DialogDescription>
            Edit or delete the medication dose
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Preset Buttons if available */}
          {dosePresets.length > 0 && (
            <>
              <div className="text-sm font-medium">Quick doses:</div>
              <div className="grid grid-cols-3 gap-2">
                {dosePresets.map((dose, idx) => (
                  <Button
                    key={idx}
                    onClick={() => setMedicationEditInput(dose)}
                    variant="outline"
                    className="h-12"
                    data-testid={`button-dose-preset-${dose}`}
                  >
                    {dose}
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
            <Label htmlFor="dose-edit-value">Dose</Label>
            <Input
              ref={inputRef}
              id="dose-edit-value"
              data-testid="input-dose-edit-value"
              value={medicationEditInput}
              onChange={(e) => setMedicationEditInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              placeholder="e.g., 5mg, 100mg, 2ml"
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={medicationEditTime}
          onTimeChange={setMedicationEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!medicationEditInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
