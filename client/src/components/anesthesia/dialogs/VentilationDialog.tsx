import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useAddVitalPoint } from "@/hooks/useVitalsQuery";
import { useToast } from "@/hooks/use-toast";

interface PendingVentilationValue {
  paramKey: string;
  time: number;
  label: string;
}

interface VentilationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingVentilationValue: PendingVentilationValue | null;
  onVentilationCreated?: () => void;
  readOnly?: boolean;
}

export function VentilationDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingVentilationValue,
  onVentilationCreated,
  readOnly = false,
}: VentilationDialogProps) {
  const [ventilationValueInput, setVentilationValueInput] = useState("");
  const { toast } = useToast();

  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (!open) {
      setVentilationValueInput("");
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingVentilationValue || !ventilationValueInput.trim()) return;
    if (!anesthesiaRecordId) return;
    
    const { paramKey, time, label } = pendingVentilationValue;
    const value = parseFloat(ventilationValueInput.trim());
    
    if (isNaN(value)) {
      toast({
        title: "Invalid Value",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }
    
    addVitalPointMutation.mutate(
      {
        vitalType: paramKey,
        value,
        timestamp: new Date(time).toISOString(),
      },
      {
        onSuccess: () => {
          onVentilationCreated?.();
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    setVentilationValueInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-ventilation-value">
        <DialogHeader>
          <DialogTitle>Add Value</DialogTitle>
          <DialogDescription>
            {pendingVentilationValue ? `${pendingVentilationValue.label}` : 'Add a new ventilation parameter value'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="ventilation-value">Value</Label>
            <Input
              id="ventilation-value"
              data-testid="input-ventilation-value"
              type="number"
              step="0.1"
              value={ventilationValueInput}
              onChange={(e) => setVentilationValueInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !readOnly) {
                  handleSave();
                }
              }}
              placeholder="e.g., 35, 12.5, 98"
              autoFocus
              disabled={readOnly}
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={pendingVentilationValue?.time}
          onTimeChange={(newTime) => {
            // This is a controlled component update - parent should handle this
            // For now, we'll just accept the prop update from parent
          }}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!ventilationValueInput.trim() || readOnly}
          saveLabel="Add"
        />
      </DialogContent>
    </Dialog>
  );
}
