import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useUpdateVentilationMode, useDeleteVentilationMode } from "@/hooks/useVentilationModeQuery";

interface EditingVentilationMode {
  time: number;
  mode: string;
  index: number;
  id: string;
}

interface VentilationModeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingVentilationMode: EditingVentilationMode | null;
  onVentilationModeUpdated?: () => void;
  onVentilationModeDeleted?: () => void;
}

const VENTILATION_MODES = [
  { value: "Präoxygenierung", label: "Preoxygenation" },
  { value: "Assistierte Spontanatmung", label: "Assisted Spontaneous Breathing" },
  { value: "Spontanatmung am Gerät", label: "Spontaneous Breathing on Device" },
  { value: "PCV - druckkontrolliert", label: "PCV - Pressure Controlled" },
  { value: "VCV - volumenkontrolliert", label: "VCV - Volume Controlled" },
  { value: "CPAP - PSV", label: "CPAP - PSV" },
];

export function VentilationModeEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingVentilationMode,
  onVentilationModeUpdated,
  onVentilationModeDeleted,
}: VentilationModeEditDialogProps) {
  const [ventilationModeEditInput, setVentilationModeEditInput] = useState("");
  const [ventilationModeEditTime, setVentilationModeEditTime] = useState<number>(0);

  const updateVentilationMode = useUpdateVentilationMode(anesthesiaRecordId || undefined);
  const deleteVentilationMode = useDeleteVentilationMode(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingVentilationMode) {
      setVentilationModeEditInput(editingVentilationMode.mode);
      setVentilationModeEditTime(editingVentilationMode.time);
    } else {
      setVentilationModeEditInput("");
      setVentilationModeEditTime(0);
    }
  }, [editingVentilationMode]);

  const handleSave = () => {
    if (!editingVentilationMode || !ventilationModeEditInput.trim()) return;
    if (!anesthesiaRecordId) return;
    
    const newTimestamp = ventilationModeEditTime;
    
    updateVentilationMode.mutate(
      {
        pointId: editingVentilationMode.id,
        value: ventilationModeEditInput.trim(),
        timestamp: new Date(newTimestamp).toISOString(),
      },
      {
        onSuccess: () => {
          onVentilationModeUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingVentilationMode) return;
    if (!anesthesiaRecordId) return;
    
    deleteVentilationMode.mutate(editingVentilationMode.id, {
      onSuccess: () => {
        onVentilationModeDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setVentilationModeEditInput("");
    setVentilationModeEditTime(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-mode-edit">
        <DialogHeader>
          <DialogTitle>Edit Ventilation Mode</DialogTitle>
          <DialogDescription>
            Edit or delete the ventilation mode
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="mode-edit-value">Mode</Label>
            <Select value={ventilationModeEditInput} onValueChange={setVentilationModeEditInput}>
              <SelectTrigger id="mode-edit-value" data-testid="select-mode-edit-value">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENTILATION_MODES.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooterWithTime
          time={ventilationModeEditTime}
          onTimeChange={setVentilationModeEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!ventilationModeEditInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
