import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useUpdateVitalPoint, useDeleteVitalPoint } from "@/hooks/useVitalsQuery";
import { useToast } from "@/hooks/use-toast";

interface EditingVentilationValue {
  paramKey: string;
  time: number;
  value: string;
  index: number;
  label: string;
  id: string;
}

interface VentilationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingVentilationValue: EditingVentilationValue | null;
  onVentilationUpdated?: () => void;
  onVentilationDeleted?: () => void;
}

export function VentilationEditDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingVentilationValue,
  onVentilationUpdated,
  onVentilationDeleted,
}: VentilationEditDialogProps) {
  const [ventilationEditInput, setVentilationEditInput] = useState("");
  const [ventilationEditTime, setVentilationEditTime] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const updateVitalPointMutation = useUpdateVitalPoint(anesthesiaRecordId || undefined);
  const deleteVitalPointMutation = useDeleteVitalPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingVentilationValue) {
      setVentilationEditInput(editingVentilationValue.value);
      setVentilationEditTime(editingVentilationValue.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
    } else {
      setVentilationEditInput("");
      setVentilationEditTime(0);
    }
  }, [editingVentilationValue]);

  const handleSave = () => {
    if (!editingVentilationValue || !ventilationEditInput.trim()) return;
    if (!anesthesiaRecordId) return;
    
    const { id } = editingVentilationValue;
    const value = parseFloat(ventilationEditInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    const newTimestamp = ventilationEditTime;
    
    updateVitalPointMutation.mutate(
      {
        pointId: id,
        value,
        timestamp: new Date(newTimestamp).toISOString(),
      },
      {
        onSuccess: () => {
          onVentilationUpdated?.();
          handleClose();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!editingVentilationValue) return;
    if (!anesthesiaRecordId) return;
    
    const { id } = editingVentilationValue;
    
    deleteVitalPointMutation.mutate(id, {
      onSuccess: () => {
        onVentilationDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setVentilationEditInput("");
    setVentilationEditTime(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-edit">
        <DialogHeader>
          <DialogTitle>Edit {editingVentilationValue?.label}</DialogTitle>
          <DialogDescription>
            Edit or delete the ventilation value
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="ventilation-edit-value">Value</Label>
            <Input
              ref={inputRef}
              id="ventilation-edit-value"
              data-testid="input-ventilation-edit-value"
              type="number"
              step="any"
              value={ventilationEditInput}
              onChange={(e) => setVentilationEditInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              placeholder="Enter value"
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={ventilationEditTime}
          onTimeChange={setVentilationEditTime}
          showDelete={true}
          onDelete={handleDelete}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!ventilationEditInput.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
