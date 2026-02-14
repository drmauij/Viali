import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useMutation } from "@tanstack/react-query";
import { saveMedication } from "@/services/timelinePersistence";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

interface PendingMedicationDose {
  swimlaneId: string;
  time: number;
  label: string;
  defaultDose?: string | null;
  administrationUnit?: string | null;
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
  onLocalStateUpdate?: (swimlaneId: string, time: number, doseValue: string, note?: string | null) => void;
  readOnly?: boolean;
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
  readOnly = false,
}: MedicationDoseDialogProps) {
  const [medicationDoseInput, setMedicationDoseInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const { toast } = useToast();
  const { t } = useTranslation();

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
        title: t('dialogs.errorSavingMedication'),
        description: error instanceof Error ? error.message : t('dialogs.failedToSaveMedication'),
        variant: "destructive",
      });
    },
  });

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setMedicationDoseInput("");
      setNoteInput("");
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
        note: noteInput.trim() || undefined,
      });

      console.log('[MED] Mutation successful - updating local state');

      // Manually update local state so the dose appears immediately
      onLocalStateUpdate?.(swimlaneId, time, doseValue, noteInput.trim() || null);

      const unit = pendingMedicationDose.administrationUnit || '';
      toast({
        title: t('dialogs.doseSaved'),
        description: `${label}: ${doseValue}${unit ? ` ${unit}` : ''}${noteInput.trim() ? ` (${noteInput.trim()})` : ''}`,
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
    setNoteInput("");
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

      const unit = pendingMedicationDose.administrationUnit || '';
      toast({
        title: t('dialogs.doseSaved'),
        description: `${label}: ${trimmedValue}${unit ? ` ${unit}` : ''}`,
      });

      onMedicationDoseCreated?.();
      handleClose();
    } catch (error) {
      console.error('[QUICK-SELECT] Mutation error:', error);
    }
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={(open) => {
        console.log('[DIALOG] Medication dose dialog open changed:', open);
        if (!open) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}
      title={t('dialogs.addDose')}
      description={pendingMedicationDose ? `${pendingMedicationDose.label}` : t('dialogs.addDoseDesc')}
      testId="dialog-medication-dose"
      time={pendingMedicationDose?.time}
      onTimeChange={onTimeChange}
      onSave={handleSave}
      onCancel={handleClose}
      saveDisabled={!medicationDoseInput.trim() || readOnly}
      saveLabel={t('common.add')}
    >
      <div className="grid gap-4 py-4">
        {/* Quick-select buttons for range default doses */}
        {pendingMedicationDose?.defaultDose?.includes('-') && !readOnly && (
          <div className="grid gap-2">
            <Label>{t('dialogs.quickSelect')}</Label>
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
                  {value.trim()}{pendingMedicationDose.administrationUnit ? ` ${pendingMedicationDose.administrationUnit}` : ''}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="dose-value">
            {pendingMedicationDose?.defaultDose?.includes('-') ? t('anesthesia.pdf.orEnterCustom') : t('anesthesia.pdf.dose')}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="dose-value"
              data-testid="input-dose-value"
              value={medicationDoseInput}
              onChange={(e) => setMedicationDoseInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !readOnly) {
                  handleSave();
                }
              }}
              placeholder="e.g., 5, 100, 2"
              autoFocus
              disabled={readOnly}
              className="flex-1"
            />
            {pendingMedicationDose?.administrationUnit && (
              <span className="text-sm text-muted-foreground font-medium min-w-fit">
                {pendingMedicationDose.administrationUnit}
              </span>
            )}
          </div>
        </div>

        {/* Note Input */}
        <div className="grid gap-2">
          <Label htmlFor="dose-note-value">{t('dialogs.noteOptional')}</Label>
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
