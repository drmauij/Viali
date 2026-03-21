import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreateOutput } from "@/hooks/useOutputQuery";
import { useTranslation } from "react-i18next";

interface DrainageInfo {
  id: string;
  type: string;
  typeOther?: string;
  size: string;
  position: string;
}

interface PendingOutputBulk {
  time: number;
}

interface OutputBulkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingOutputBulk: PendingOutputBulk | null;
  intraOpDrainages?: DrainageInfo[];
  onOutputBulkCreated?: () => void;
  readOnly?: boolean;
}

/** Get the display label for a drainage */
function getDrainageLabel(drainage: DrainageInfo): string {
  const typeName = drainage.type === 'Other' && drainage.typeOther
    ? drainage.typeOther
    : drainage.type;
  return drainage.position ? `${typeName} — ${drainage.position}` : typeName;
}

export function OutputBulkDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingOutputBulk,
  intraOpDrainages = [],
  onOutputBulkCreated,
  readOnly = false,
}: OutputBulkDialogProps) {
  const { t } = useTranslation();
  const [bulkOutputParams, setBulkOutputParams] = useState<Record<string, string>>({
    urine: "",
    blood: "",
    gastricTube: "",
    drainage: "",
    vomit: "",
  });

  const createOutput = useCreateOutput(anesthesiaRecordId || undefined);
  const hasDrainages = intraOpDrainages.length > 0;

  useEffect(() => {
    if (!open) {
      const initial: Record<string, string> = {
        urine: "",
        blood: "",
        gastricTube: "",
        vomit: "",
      };
      if (hasDrainages) {
        for (const drainage of intraOpDrainages) {
          initial[`drainage_${drainage.id}`] = "";
        }
      } else {
        initial.drainage = "";
      }
      setBulkOutputParams(initial);
    }
  }, [open, hasDrainages, intraOpDrainages]);

  const handleSave = () => {
    if (readOnly) return;
    if (!pendingOutputBulk) return;
    if (!anesthesiaRecordId) return;

    const { time } = pendingOutputBulk;
    const timestamp = new Date(time).toISOString();

    // Static params (always present)
    const staticMappings: Array<{ key: string; paramKey: string }> = [
      { key: 'urine', paramKey: 'urine' },
      { key: 'blood', paramKey: 'blood' },
      { key: 'gastricTube', paramKey: 'gastricTube' },
      { key: 'vomit', paramKey: 'vomit' },
    ];

    // Add drainage: either individual drainages or the single generic one
    if (hasDrainages) {
      for (const drainage of intraOpDrainages) {
        const key = `drainage_${drainage.id}`;
        staticMappings.push({ key, paramKey: key });
      }
    } else {
      staticMappings.push({ key: 'drainage', paramKey: 'drainage' });
    }

    staticMappings.forEach(({ key, paramKey }) => {
      const valueStr = bulkOutputParams[key];
      if (valueStr) {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          createOutput.mutate({
            anesthesiaRecordId,
            timestamp,
            paramKey: paramKey as any,
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
      onTimeChange={() => {}}
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

          {/* Drainage fields: individual per drainage or single generic */}
          {hasDrainages ? (
            intraOpDrainages.map((drainage) => {
              const key = `drainage_${drainage.id}`;
              const label = getDrainageLabel(drainage);
              return (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={`bulk-${key}`} className="text-xs leading-tight" title={label}>
                    {label} (ml)
                  </Label>
                  <Input
                    id={`bulk-${key}`}
                    type="number"
                    step="1"
                    value={bulkOutputParams[key] || ""}
                    onChange={(e) => setBulkOutputParams(prev => ({ ...prev, [key]: e.target.value }))}
                    data-testid={`input-bulk-${key}`}
                    placeholder={t('common.optional')}
                    disabled={readOnly}
                  />
                </div>
              );
            })
          ) : (
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
          )}

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
