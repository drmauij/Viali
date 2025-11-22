import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useAddVitalPoint } from "@/hooks/useVitalsQuery";
import { useToast } from "@/hooks/use-toast";

interface BulkVitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  initialTime: number;
  onVitalsCreated?: () => void;
}

export function BulkVitalsDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  initialTime,
  onVitalsCreated,
}: BulkVitalsDialogProps) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [oxygen, setOxygen] = useState("");
  const [currentTime, setCurrentTime] = useState(initialTime);
  const { toast } = useToast();

  const systolicRef = useRef<HTMLInputElement>(null);
  const diastolicRef = useRef<HTMLInputElement>(null);
  const heartRateRef = useRef<HTMLInputElement>(null);
  const oxygenRef = useRef<HTMLInputElement>(null);

  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId || undefined);

  // Update time when initialTime changes
  useEffect(() => {
    setCurrentTime(initialTime);
  }, [initialTime]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSystolic("");
      setDiastolic("");
      setHeartRate("");
      setOxygen("");
    }
  }, [open]);

  // Auto-focus first field when dialog opens
  useEffect(() => {
    if (open && systolicRef.current) {
      setTimeout(() => systolicRef.current?.focus(), 100);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent, nextRef?: React.RefObject<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef?.current) {
        nextRef.current.focus();
      } else {
        handleSave();
      }
    }
  };

  const handleSave = async () => {
    if (!anesthesiaRecordId) return;

    const timestamp = new Date(currentTime).toISOString();
    const vitalsToAdd: Array<{ vitalType: string; value: number }> = [];

    // Collect all non-empty vitals
    if (systolic.trim()) {
      const sysValue = parseFloat(systolic.trim());
      if (!isNaN(sysValue)) {
        vitalsToAdd.push({ vitalType: 'sys', value: sysValue });
      }
    }

    if (diastolic.trim()) {
      const diaValue = parseFloat(diastolic.trim());
      if (!isNaN(diaValue)) {
        vitalsToAdd.push({ vitalType: 'dia', value: diaValue });
      }
    }

    if (heartRate.trim()) {
      const hrValue = parseFloat(heartRate.trim());
      if (!isNaN(hrValue)) {
        vitalsToAdd.push({ vitalType: 'hr', value: hrValue });
      }
    }

    if (oxygen.trim()) {
      const spo2Value = parseFloat(oxygen.trim());
      if (!isNaN(spo2Value)) {
        vitalsToAdd.push({ vitalType: 'spo2', value: spo2Value });
      }
    }

    if (vitalsToAdd.length === 0) {
      toast({
        title: "No Values Entered",
        description: "Please enter at least one vital sign value",
        variant: "destructive",
      });
      return;
    }

    // Save all vitals sequentially
    try {
      for (const vital of vitalsToAdd) {
        await addVitalPointMutation.mutateAsync({
          vitalType: vital.vitalType,
          value: vital.value,
          timestamp,
        });
      }

      toast({
        title: "Vitals Added",
        description: `Successfully added ${vitalsToAdd.length} vital sign${vitalsToAdd.length > 1 ? 's' : ''}`,
      });

      onVitalsCreated?.();
      handleClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save vital signs",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setSystolic("");
    setDiastolic("");
    setHeartRate("");
    setOxygen("");
  };

  const hasAnyValue = systolic.trim() || diastolic.trim() || heartRate.trim() || oxygen.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-bulk-vitals">
        <DialogHeader>
          <DialogTitle>Bulk Vitals Entry</DialogTitle>
          <DialogDescription>
            Enter vital signs - use Tab to move between fields, Enter to save
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="systolic">Systolic (mmHg)</Label>
              <Input
                ref={systolicRef}
                id="systolic"
                data-testid="input-systolic"
                type="number"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, diastolicRef)}
                placeholder="e.g., 120"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="diastolic">Diastolic (mmHg)</Label>
              <Input
                ref={diastolicRef}
                id="diastolic"
                data-testid="input-diastolic"
                type="number"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, heartRateRef)}
                placeholder="e.g., 80"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
              <Input
                ref={heartRateRef}
                id="heartRate"
                data-testid="input-heart-rate"
                type="number"
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, oxygenRef)}
                placeholder="e.g., 75"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="oxygen">Oxygen (%)</Label>
              <Input
                ref={oxygenRef}
                id="oxygen"
                data-testid="input-oxygen"
                type="number"
                value={oxygen}
                onChange={(e) => setOxygen(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e)}
                placeholder="e.g., 98"
              />
            </div>
          </div>
        </div>
        <DialogFooterWithTime
          time={currentTime}
          onTimeChange={setCurrentTime}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!hasAnyValue || addVitalPointMutation.isPending}
          saveLabel={addVitalPointMutation.isPending ? "Saving..." : "Save All"}
        />
      </DialogContent>
    </Dialog>
  );
}
