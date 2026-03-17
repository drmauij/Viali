import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreateOutput, useSetUrineMode, type OutputParamKey } from "@/hooks/useOutputQuery";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { UrineMode } from "@/hooks/useOutputState";

interface PendingOutputValue {
  paramKey: OutputParamKey;
  time: number;
  label: string;
}

interface OutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingOutputValue: PendingOutputValue | null;
  onOutputCreated?: () => void;
  readOnly?: boolean;
  urineMode?: UrineMode;
  onUrineModeChange?: (mode: UrineMode) => void;
}

export function OutputDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingOutputValue,
  onOutputCreated,
  readOnly = false,
  urineMode,
  onUrineModeChange,
}: OutputDialogProps) {
  const { t } = useTranslation();
  const [outputValueInput, setOutputValueInput] = useState("");
  const { toast } = useToast();

  const createOutput = useCreateOutput(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (!open) {
      setOutputValueInput("");
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingOutputValue || !outputValueInput.trim()) return;
    if (!anesthesiaRecordId) return;

    const { paramKey, time, label } = pendingOutputValue;
    const value = parseFloat(outputValueInput.trim());

    if (isNaN(value)) {
      toast({
        title: t('dialogs.invalidValue'),
        description: t('dialogs.enterValidNumber'),
        variant: "destructive",
      });
      return;
    }

    createOutput.mutate(
      {
        anesthesiaRecordId,
        paramKey,
        value,
        timestamp: new Date(time).toISOString(),
      },
      {
        onSuccess: () => {
          onOutputCreated?.();
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    setOutputValueInput("");
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.addOutputValue')}
      description={pendingOutputValue ? `${pendingOutputValue.label}` : t('dialogs.addOutputValueDesc')}
      testId="dialog-output-value"
      time={pendingOutputValue?.time}
      onTimeChange={(newTime) => {
        // This is a controlled component update - parent should handle this
        // For now, we'll just accept the prop update from parent
      }}
      showDelete={false}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!outputValueInput.trim() || readOnly}
      saveLabel={t('common.add')}
    >
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label htmlFor="output-value">{t('dialogs.volumeMl')}</Label>
          <Input
            id="output-value"
            data-testid="input-output-value"
            type="number"
            step="1"
            value={outputValueInput}
            onChange={(e) => setOutputValueInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !readOnly) {
                handleSave();
              }
            }}
            placeholder="e.g., 50, 100, 200"
            autoFocus
            disabled={readOnly}
          />
        </div>
        {/* Urine mode toggle - only show for urine parameter */}
        {pendingOutputValue?.paramKey === 'urine' && urineMode && onUrineModeChange && (
          <div className="flex items-center gap-3 pt-2 border-t">
            <Label className="text-sm text-muted-foreground">{t('anesthesia.timeline.output.urineReadingMode', 'Reading mode')}:</Label>
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  urineMode === 'partial'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
                onClick={() => onUrineModeChange('partial')}
                disabled={readOnly}
                data-testid="btn-urine-mode-partial"
              >
                {t('anesthesia.timeline.output.urometer', 'Urometer')}
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  urineMode === 'total'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80'
                }`}
                onClick={() => onUrineModeChange('total')}
                disabled={readOnly}
                data-testid="btn-urine-mode-total"
              >
                {t('anesthesia.timeline.output.bag', 'Bag')}
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {urineMode === 'partial'
                ? t('anesthesia.timeline.output.urometerHint', 'Values are incremental')
                : t('anesthesia.timeline.output.bagHint', 'Values are cumulative totals')}
            </span>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
