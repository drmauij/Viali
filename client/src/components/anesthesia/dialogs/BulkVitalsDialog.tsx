import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddVitalPoint, useAddBPPoint } from "@/hooks/useVitalsQuery";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface BulkVitalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  initialTime: number;
  onVitalsCreated?: () => void;
  readOnly?: boolean;
}

export function BulkVitalsDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  initialTime,
  onVitalsCreated,
  readOnly = false,
}: BulkVitalsDialogProps) {
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [oxygen, setOxygen] = useState("");
  const [currentTime, setCurrentTime] = useState(initialTime);
  const { toast } = useToast();
  const { t } = useTranslation();

  const systolicRef = useRef<HTMLInputElement>(null);
  const diastolicRef = useRef<HTMLInputElement>(null);
  const heartRateRef = useRef<HTMLInputElement>(null);
  const oxygenRef = useRef<HTMLInputElement>(null);

  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId || undefined);
  const addBPPointMutation = useAddBPPoint(anesthesiaRecordId || undefined);

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
      if (readOnly) return;
      if (nextRef?.current) {
        nextRef.current.focus();
      } else {
        handleSave();
      }
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!anesthesiaRecordId) return;

    const timestamp = new Date(currentTime).toISOString();
    const vitalsToAdd: Array<{ vitalType: string; value: number }> = [];

    // Parse blood pressure values
    const sysValue = systolic.trim() ? parseFloat(systolic.trim()) : null;
    const diaValue = diastolic.trim() ? parseFloat(diastolic.trim()) : null;

    // Validate BP - both or neither must be provided
    if ((sysValue !== null && diaValue === null) || (sysValue === null && diaValue !== null)) {
      toast({
        title: t('dialogs.incompleteBloodPressure'),
        description: t('dialogs.enterBothBPValues'),
        variant: "destructive",
      });
      return;
    }

    // Collect other vitals
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

    // Check if at least one value is entered
    if (vitalsToAdd.length === 0 && sysValue === null && diaValue === null) {
      toast({
        title: t('dialogs.noValuesEntered'),
        description: t('dialogs.enterAtLeastOneVital'),
        variant: "destructive",
      });
      return;
    }

    // Save all vitals sequentially
    try {
      // Save blood pressure if both values provided
      if (sysValue !== null && diaValue !== null && !isNaN(sysValue) && !isNaN(diaValue)) {
        await addBPPointMutation.mutateAsync({
          timestamp,
          sys: sysValue,
          dia: diaValue,
        });
      }

      // Save other vitals
      for (const vital of vitalsToAdd) {
        await addVitalPointMutation.mutateAsync({
          vitalType: vital.vitalType,
          value: vital.value,
          timestamp,
        });
      }

      // Count total vitals added (BP counts as 1, plus individual vitals)
      const bpAdded = (sysValue !== null && diaValue !== null && !isNaN(sysValue) && !isNaN(diaValue)) ? 1 : 0;
      const totalAdded = bpAdded + vitalsToAdd.length;

      toast({
        title: t('dialogs.vitalsAdded'),
        description: t('dialogs.successfullyAddedVitals', { count: totalAdded }),
      });

      onVitalsCreated?.();
      handleClose();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('dialogs.failedToSaveVitals'),
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.bulkVitalsEntry')}
      description={t('dialogs.bulkVitalsEntryDesc')}
      testId="dialog-bulk-vitals"
      time={currentTime}
      onTimeChange={setCurrentTime}
      showDelete={false}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveDisabled={!hasAnyValue || addVitalPointMutation.isPending || readOnly}
      saveLabel={addVitalPointMutation.isPending ? t('common.saving') : t('dialogs.saveAll')}
    >
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="systolic">{t('dialogs.systolic')}</Label>
            <Input
              ref={systolicRef}
              id="systolic"
              data-testid="input-systolic"
              type="number"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, diastolicRef)}
              placeholder="e.g., 120"
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="diastolic">{t('dialogs.diastolic')}</Label>
            <Input
              ref={diastolicRef}
              id="diastolic"
              data-testid="input-diastolic"
              type="number"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, heartRateRef)}
              placeholder="e.g., 80"
              disabled={readOnly}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="heartRate">{t('dialogs.heartRate')}</Label>
            <Input
              ref={heartRateRef}
              id="heartRate"
              data-testid="input-heart-rate"
              type="number"
              value={heartRate}
              onChange={(e) => setHeartRate(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, oxygenRef)}
              placeholder="e.g., 75"
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="oxygen">{t('dialogs.spo2')}</Label>
            <Input
              ref={oxygenRef}
              id="oxygen"
              data-testid="input-oxygen"
              type="number"
              value={oxygen}
              onChange={(e) => setOxygen(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e)}
              placeholder="e.g., 98"
              disabled={readOnly}
            />
          </div>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
