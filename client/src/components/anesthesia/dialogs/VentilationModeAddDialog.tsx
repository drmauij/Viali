import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PendingVentilationMode {
  time: number;
}

interface VentilationModeAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingVentilationMode: PendingVentilationMode | null;
  ventilationModeData: any[];
  onVentilationModeCreated?: () => void;
  readOnly?: boolean;
}

const VENTILATION_MODES = [
  { value: "Präoxygenierung", label: "Preoxygenation" },
  { value: "Assistierte Spontanatmung", label: "Assisted Spontaneous Breathing" },
  { value: "Spontanatmung am Gerät", label: "Spontaneous Breathing on Device" },
  { value: "PCV - druckkontrolliert", label: "PCV - Pressure Controlled" },
  { value: "VCV - volumenkontrolliert", label: "VCV - Volume Controlled" },
  { value: "CPAP - PSV", label: "CPAP - PSV" },
];

export function VentilationModeAddDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingVentilationMode,
  ventilationModeData,
  onVentilationModeCreated,
  readOnly = false,
}: VentilationModeAddDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [ventilationMode, setVentilationMode] = useState("PCV - druckkontrolliert");
  const [isSpontaneousBreathing, setIsSpontaneousBreathing] = useState(false);
  const [oxygenFlowRate, setOxygenFlowRate] = useState("");
  const [etCO2, setEtCO2] = useState("");
  const [dialogTime, setDialogTime] = useState<number>(Date.now());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setVentilationMode("PCV - druckkontrolliert");
      setIsSpontaneousBreathing(false);
      setOxygenFlowRate("");
      setEtCO2("");
      setIsSaving(false);
    } else if (pendingVentilationMode) {
      setDialogTime(pendingVentilationMode.time);
    }
  }, [open, pendingVentilationMode]);

  const handleSave = async () => {
    if (readOnly || isSaving) return;
    if (!anesthesiaRecordId) return;
    
    setIsSaving(true);
    const timestamp = new Date(dialogTime).toISOString();
    
    try {
      let modeValue: string;
      if (isSpontaneousBreathing) {
        modeValue = oxygenFlowRate 
          ? `Spontaneous: ${oxygenFlowRate} l/min O₂` 
          : "Spontaneous Breathing";
      } else {
        modeValue = ventilationMode;
      }
      
      const parameters: any = {};
      if (isSpontaneousBreathing && etCO2) {
        parameters.etco2 = parseFloat(etCO2);
      }
      
      const requestData = {
        anesthesiaRecordId,
        timestamp,
        ventilationMode: modeValue,
        parameters,
      };
      
      await apiRequest('POST', '/api/anesthesia/ventilation/bulk', requestData);
      
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`] 
      });
      
      toast({
        title: t('anesthesia.timeline.modeAdded', 'Ventilation mode added'),
        description: modeValue,
      });
      
      onVentilationModeCreated?.();
      handleClose();
    } catch (error) {
      console.error('[VENTILATION-MODE-ADD] Error:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('anesthesia.timeline.modeAddError', 'Failed to add ventilation mode'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('anesthesia.timeline.addMode', 'Add Ventilation Mode')}
      description={t('anesthesia.timeline.addModeDescription', 'Select ventilation mode or spontaneous breathing')}
      testId="dialog-ventilation-mode-add"
      time={dialogTime}
      onTimeChange={setDialogTime}
      showDelete={false}
      onCancel={handleClose}
      onSave={!readOnly ? handleSave : undefined}
      saveDisabled={readOnly || isSaving}
      saveLabel={t('common.add', 'Add')}
    >
      <div className="grid gap-4 py-4">
        {!isSpontaneousBreathing && (
          <div className="grid gap-2">
            <Label htmlFor="ventilation-mode">
              {t('anesthesia.timeline.mode', 'Ventilation Mode')}
            </Label>
            <Select
              value={ventilationMode}
              onValueChange={setVentilationMode}
              disabled={readOnly}
            >
              <SelectTrigger id="ventilation-mode" data-testid="select-ventilation-mode">
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
        )}

        <div className="flex items-center space-x-2">
          <Checkbox
            id="spontaneous-breathing"
            checked={isSpontaneousBreathing}
            onCheckedChange={(checked) => setIsSpontaneousBreathing(checked === true)}
            disabled={readOnly}
            data-testid="checkbox-spontaneous-breathing"
          />
          <Label htmlFor="spontaneous-breathing" className="font-medium">
            {t('anesthesia.timeline.spontaneousBreathing', 'Spontaneous Breathing')}
          </Label>
        </div>

        {isSpontaneousBreathing && (
          <div className="space-y-4 pl-6 border-l-2 border-muted">
            <div className="grid gap-2">
              <Label htmlFor="oxygen-flow">
                {t('anesthesia.timeline.oxygenFlow', 'O₂ Flow Rate (l/min)')}
              </Label>
              <Input
                id="oxygen-flow"
                type="number"
                step="0.5"
                min="0"
                value={oxygenFlowRate}
                onChange={(e) => setOxygenFlowRate(e.target.value)}
                placeholder="e.g., 2, 4, 6"
                disabled={readOnly}
                data-testid="input-oxygen-flow"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="etco2-spontaneous">
                {t('anesthesia.timeline.etCO2', 'etCO₂ (mmHg)')}
              </Label>
              <Input
                id="etco2-spontaneous"
                type="number"
                step="1"
                min="0"
                value={etCO2}
                onChange={(e) => setEtCO2(e.target.value)}
                placeholder="e.g., 38"
                disabled={readOnly}
                data-testid="input-etco2-spontaneous"
              />
            </div>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
