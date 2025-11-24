import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useMutation } from "@tanstack/react-query";
import { saveMedication } from "@/services/timelinePersistence";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface PendingMedicationDose {
  swimlaneId: string;
  time: number;
  label: string;
  defaultDose?: string | null;
  itemId: string;
}

interface AnesthesiaItem {
  id: string;
  name: string;
}

interface MedicationDoseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingMedicationDose: PendingMedicationDose | null;
  anesthesiaItems: AnesthesiaItem[];
  onTimeChange?: (newTime: number) => void;
  onMedicationDoseCreated?: () => void;
  onLocalStateUpdate?: (swimlaneId: string, time: number, doseValue: string) => void;
}

export function MedicationDoseDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingMedicationDose,
  anesthesiaItems,
  onTimeChange,
  onMedicationDoseCreated,
  onLocalStateUpdate,
}: MedicationDoseDialogProps) {
  const [medicationDoseInput, setMedicationDoseInput] = useState("");
  const { toast } = useToast();

  // Mutation for saving medication doses
  const saveMedicationMutation = useMutation({
    mutationFn: saveMedication,
    onSuccess: (data, variables) => {
      console.log('[MEDICATION] Save successful', { data, variables });
      // Invalidate medication cache to trigger refetch and sync
      if (anesthesiaRecordId) {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`] 
        });
      }
    },
    onError: (error) => {
      console.error('[MEDICATION] Save failed', error);
      toast({
        title: "Error saving medication",
        description: error instanceof Error ? error.message : "Failed to save medication",
        variant: "destructive",
      });
    },
  });

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setMedicationDoseInput("");
    }
  }, [open]);

  const handleSave = async () => {
    console.log('[MED] handleMedicationDoseEntry called', { 
      pendingMedicationDose, 
      medicationDoseInput, 
      anesthesiaRecordId 
    });
    
    if (!pendingMedicationDose || !medicationDoseInput.trim() || !anesthesiaRecordId) {
      console.log('[MED] Early return - missing data');
      return;
    }
    
    const { swimlaneId, time, label, itemId } = pendingMedicationDose;
    
    console.log('[MED] Using itemId from pending dose:', itemId);
    
    const doseValue = medicationDoseInput.trim();
    
    // Save to database
    try {
      console.log('[MED] Calling mutation with:', {
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: "bolus",
        dose: doseValue,
      });
      
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: "bolus",
        dose: doseValue,
      });
      
      console.log('[MED] Mutation successful - updating local state');
      
      // Manually update local state so the dose appears immediately
      onLocalStateUpdate?.(swimlaneId, time, doseValue);
      
      toast({
        title: "Dose saved",
        description: `${label}: ${doseValue}`,
      });

      onMedicationDoseCreated?.();
      handleClose();
    } catch (error) {
      console.error('[MED] Mutation error:', error);
      // Error toast is already shown by mutation's onError
      return;
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setMedicationDoseInput("");
  };

  const handleQuickSelect = async (value: string) => {
    const trimmedValue = value.trim();
    
    if (!pendingMedicationDose || !anesthesiaRecordId) {
      return;
    }
    
    const { swimlaneId, time, label, itemId } = pendingMedicationDose;
    
    // Save immediately
    try {
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: "bolus",
        dose: trimmedValue,
      });
      
      onLocalStateUpdate?.(swimlaneId, time, trimmedValue);
      
      toast({
        title: "Dose saved",
        description: `${label}: ${trimmedValue}`,
      });

      onMedicationDoseCreated?.();
      handleClose();
    } catch (error) {
      console.error('[QUICK-SELECT] Mutation error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      console.log('[DIALOG] Medication dose dialog open changed:', open);
      if (!open) {
        handleClose();
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-medication-dose">
        <DialogHeader>
          <DialogTitle>Add Dose</DialogTitle>
          <DialogDescription>
            {pendingMedicationDose ? `${pendingMedicationDose.label}` : 'Add a new medication dose'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Quick-select buttons for range default doses */}
          {pendingMedicationDose?.defaultDose?.includes('-') && (
            <div className="grid gap-2">
              <Label>Quick Select</Label>
              <div className="flex gap-2 flex-wrap">
                {pendingMedicationDose.defaultDose.split('-').map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickSelect(value)}
                    data-testid={`button-quick-select-${value.trim()}`}
                    className="min-w-[60px]"
                  >
                    {value.trim()}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="dose-value">Dose {pendingMedicationDose?.defaultDose?.includes('-') ? '(or enter custom)' : ''}</Label>
            <Input
              id="dose-value"
              data-testid="input-dose-value"
              value={medicationDoseInput}
              onChange={(e) => setMedicationDoseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
              placeholder="e.g., 5, 100, 2"
              autoFocus
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={pendingMedicationDose?.time}
          onTimeChange={onTimeChange}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!medicationDoseInput.trim()}
          saveLabel="Add"
        />
      </DialogContent>
    </Dialog>
  );
}
