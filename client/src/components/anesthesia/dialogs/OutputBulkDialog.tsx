import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreateOutput } from "@/hooks/useOutputQuery";
import { useTranslation } from "react-i18next";

interface PendingOutputBulk {
  time: number;
}

interface OutputBulkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingOutputBulk: PendingOutputBulk | null;
  onOutputBulkCreated?: () => void;
  readOnly?: boolean;
}

export function OutputBulkDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingOutputBulk,
  onOutputBulkCreated,
  readOnly = false,
}: OutputBulkDialogProps) {
  const { t } = useTranslation();
  const [bulkOutputParams, setBulkOutputParams] = useState({
    urine: "",
    blood: "",
    gastricTube: "",
    drainage: "",
    vomit: "",
  });

  const createOutput = useCreateOutput(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (!open) {
      setBulkOutputParams({
        urine: "",
        blood: "",
        gastricTube: "",
        drainage: "",
        vomit: "",
      });
    }
  }, [open]);

  const handleSave = () => {
    if (readOnly) return;
    if (!pendingOutputBulk) return;
    if (!anesthesiaRecordId) return;

    const { time } = pendingOutputBulk;
    const timestamp = new Date(time).toISOString();

    // Add all filled parameters using createOutput mutation
    const parameterMappings = [
      { key: 'urine', paramKey: 'urine' as const },
      { key: 'blood', paramKey: 'blood' as const },
      { key: 'gastricTube', paramKey: 'gastricTube' as const },
      { key: 'drainage', paramKey: 'drainage' as const },
      { key: 'vomit', paramKey: 'vomit' as const },
    ];

    parameterMappings.forEach(({ key, paramKey }) => {
      const valueStr = bulkOutputParams[key as keyof typeof bulkOutputParams];
      if (valueStr) {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          createOutput.mutate({
            anesthesiaRecordId,
            timestamp,
            paramKey,
            value,
          });
        }
      }
    });

    onOutputBulkCreated?.();
    handleClose();
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.outputBulkEntry')}
      description={t('dialogs.outputBulkDesc')}
      className="sm:max-w-[550px]"
      testId="dialog-output-bulk"
      time={pendingOutputBulk?.time}
      onTimeChange={(newTime) => {
        // This is a controlled component update - parent should handle this
      }}
      showDelete={false}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveLabel={t('dialogs.addAll')}
      saveDisabled={readOnly}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="bulk-urine">{t('dialogs.outputUrine')}</Label>
            <Input
              id="bulk-urine"
              type="number"
              step="1"
              value={bulkOutputParams.urine}
              onChange={(e) => setBulkOutputParams(prev => ({ ...prev, urine: e.target.value }))}
              data-testid="input-bulk-urine"
              placeholder={t('common.optional')}
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-blood">{t('dialogs.outputBlood')}</Label>
            <Input
              id="bulk-blood"
              type="number"
              step="1"
              value={bulkOutputParams.blood}
              onChange={(e) => setBulkOutputParams(prev => ({ ...prev, blood: e.target.value }))}
              data-testid="input-bulk-blood"
              placeholder={t('common.optional')}
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-gastrictube">{t('dialogs.outputGastricTube')}</Label>
            <Input
              id="bulk-gastrictube"
              type="number"
              step="1"
              value={bulkOutputParams.gastricTube}
              onChange={(e) => setBulkOutputParams(prev => ({ ...prev, gastricTube: e.target.value }))}
              data-testid="input-bulk-gastrictube"
              placeholder={t('common.optional')}
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-drainage">{t('dialogs.outputDrainage')}</Label>
            <Input
              id="bulk-drainage"
              type="number"
              step="1"
              value={bulkOutputParams.drainage}
              onChange={(e) => setBulkOutputParams(prev => ({ ...prev, drainage: e.target.value }))}
              data-testid="input-bulk-drainage"
              placeholder={t('common.optional')}
              disabled={readOnly}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-vomit">{t('dialogs.outputVomit')}</Label>
            <Input
              id="bulk-vomit"
              type="number"
              step="1"
              value={bulkOutputParams.vomit}
              onChange={(e) => setBulkOutputParams(prev => ({ ...prev, vomit: e.target.value }))}
              data-testid="input-bulk-vomit"
              placeholder={t('common.optional')}
              disabled={readOnly}
            />
          </div>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
