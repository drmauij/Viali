import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface PendingVentilationBulk {
  time: number;
  existingParams?: {
    pip?: number;
    peep?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    fio2?: number;
    etco2?: number;
    minuteVolume?: number;
  };
}

interface VentilationBulkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingVentilationBulk: PendingVentilationBulk | null;
  ventilationModeData: any[];
  patientWeight?: number;
  onVentilationBulkCreated?: () => void;
  readOnly?: boolean;
  skipModeSelection?: boolean; // When true, only show parameter inputs (no ventilation mode selection)
  editingTimestamp?: number | null; // When set, indicates we're editing an existing entry at this timestamp
}

const VENTILATION_MODES = [
  { value: "Präoxygenierung", label: "Preoxygenation" },
  { value: "Assistierte Spontanatmung", label: "Assisted Spontaneous Breathing" },
  { value: "Spontanatmung am Gerät", label: "Spontaneous Breathing on Device" },
  { value: "PCV - druckkontrolliert", label: "PCV - Pressure Controlled" },
  { value: "VCV - volumenkontrolliert", label: "VCV - Volume Controlled" },
  { value: "CPAP - PSV", label: "CPAP - PSV" },
];

export function VentilationBulkDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingVentilationBulk,
  ventilationModeData,
  patientWeight,
  onVentilationBulkCreated,
  readOnly = false,
  skipModeSelection = false,
  editingTimestamp = null,
}: VentilationBulkDialogProps) {
  const { t } = useTranslation();
  const [ventilationMode, setVentilationMode] = useState("PCV - druckkontrolliert");
  const [isSpontaneousBreathing, setIsSpontaneousBreathing] = useState(false);
  const [oxygenFlowRate, setOxygenFlowRate] = useState("");
  const [dialogTime, setDialogTime] = useState<number>(Date.now());
  const [bulkVentilationParams, setBulkVentilationParams] = useState({
    peep: "",
    fiO2: "",
    tidalVolume: "",
    respiratoryRate: "",
    minuteVolume: "",
    etCO2: "",
    pip: "",
  });

  useEffect(() => {
    if (!open) {
      setVentilationMode("PCV - druckkontrolliert");
      setIsSpontaneousBreathing(false);
      setOxygenFlowRate("");
      setBulkVentilationParams({
        peep: "",
        fiO2: "",
        tidalVolume: "",
        respiratoryRate: "",
        minuteVolume: "",
        etCO2: "",
        pip: "",
      });
    } else {
      // Initialize time from pending data
      if (pendingVentilationBulk) {
        setDialogTime(pendingVentilationBulk.time);
        
        // If existing params are provided (editing), use those values
        if (pendingVentilationBulk.existingParams) {
          const params = pendingVentilationBulk.existingParams;
          // Check if at least one param has a value
          const hasAnyValue = Object.values(params).some(v => v !== undefined);
          if (hasAnyValue) {
            setBulkVentilationParams({
              pip: params.pip !== undefined ? params.pip.toString() : "",
              peep: params.peep !== undefined ? params.peep.toString() : "",
              tidalVolume: params.tidalVolume !== undefined ? params.tidalVolume.toString() : "",
              respiratoryRate: params.respiratoryRate !== undefined ? params.respiratoryRate.toString() : "",
              fiO2: params.fio2 !== undefined ? params.fio2.toString() : "",
              etCO2: params.etco2 !== undefined ? params.etco2.toString() : "",
              minuteVolume: params.minuteVolume !== undefined ? params.minuteVolume.toString() : "",
            });
            return; // Skip default calculation when editing with actual values
          }
          // If no values found at timestamp, fall through to defaults
        }
      }
      
      // Use provided weight or default to 70 kg for new entries
      const weightToUse = patientWeight || 70;
      const tidalVolumeCalc = Math.round(weightToUse * 6);
      const respiratoryRateDefault = 12;
      const minuteVolumeCalc = Math.round((tidalVolumeCalc * respiratoryRateDefault) / 1000 * 10) / 10; // Convert ml to L and round to 1 decimal
      
      setBulkVentilationParams(prev => ({
        ...prev,
        peep: "5",
        fiO2: "40",
        tidalVolume: tidalVolumeCalc.toString(),
        respiratoryRate: respiratoryRateDefault.toString(),
        minuteVolume: minuteVolumeCalc.toString(),
        etCO2: "38",
        pip: "15",
      }));
    }
  }, [open, patientWeight, pendingVentilationBulk]);

  const isEditing = editingTimestamp !== null;
  
  const handleSave = async () => {
    if (readOnly) return;
    if (!anesthesiaRecordId) return;
    
    const timestamp = new Date(dialogTime).toISOString();
    
    try {
      // Prepare parameters object with all valid values
      const parameters: any = {};
      if (bulkVentilationParams.peep) parameters.peep = parseFloat(bulkVentilationParams.peep);
      if (bulkVentilationParams.fiO2) parameters.fio2 = parseFloat(bulkVentilationParams.fiO2);
      if (bulkVentilationParams.tidalVolume) parameters.tidalVolume = parseFloat(bulkVentilationParams.tidalVolume);
      if (bulkVentilationParams.respiratoryRate) parameters.respiratoryRate = parseFloat(bulkVentilationParams.respiratoryRate);
      if (bulkVentilationParams.minuteVolume) parameters.minuteVolume = parseFloat(bulkVentilationParams.minuteVolume);
      if (bulkVentilationParams.etCO2) parameters.etco2 = parseFloat(bulkVentilationParams.etCO2);
      if (bulkVentilationParams.pip) parameters.pip = parseFloat(bulkVentilationParams.pip);
      
      // Determine ventilation mode (skip if skipModeSelection is true)
      let modeValue = null;
      if (!skipModeSelection) {
        if (isSpontaneousBreathing) {
          modeValue = oxygenFlowRate 
            ? `Spontaneous: ${oxygenFlowRate} l/min O₂` 
            : "Spontaneous Breathing";
        } else {
          const shouldAddMode = ventilationModeData.length === 0 || 
            ventilationModeData[ventilationModeData.length - 1][1] !== ventilationMode;
          if (shouldAddMode) {
            modeValue = ventilationMode;
          }
        }
      }
      
      // When editing, use PUT with originalTimestamp to update; otherwise POST to create
      if (isEditing) {
        const requestData = {
          anesthesiaRecordId,
          originalTimestamp: new Date(editingTimestamp).toISOString(),
          newTimestamp: timestamp,
          parameters,
        };
        console.log('[VENTILATION-BULK] Updating existing entry:', requestData);
        await apiRequest('PUT', '/api/anesthesia/ventilation/bulk', requestData);
      } else {
        const requestData = {
          anesthesiaRecordId,
          timestamp,
          ventilationMode: modeValue,
          parameters,
        };
        console.log('[VENTILATION-BULK] Creating new entry:', requestData);
        await apiRequest('POST', '/api/anesthesia/ventilation/bulk', requestData);
      }
      
      // Manually invalidate the cache once at the end to prevent flickering
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`] 
      });
      
      onVentilationBulkCreated?.();
      handleClose();
    } catch (error) {
      console.error('[VENTILATION-BULK] Error saving bulk entry:', error);
    }
  };
  
  const handleDelete = async () => {
    if (readOnly) return;
    if (!anesthesiaRecordId || !editingTimestamp) return;
    
    try {
      const timestamp = new Date(editingTimestamp).toISOString();
      console.log('[VENTILATION-BULK] Deleting entry at:', timestamp);
      await apiRequest('DELETE', `/api/anesthesia/ventilation/bulk?anesthesiaRecordId=${anesthesiaRecordId}&timestamp=${encodeURIComponent(timestamp)}`);
      
      // Invalidate cache
      await queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/vitals/snapshot/${anesthesiaRecordId}`] 
      });
      
      onVentilationBulkCreated?.();
      handleClose();
    } catch (error) {
      console.error('[VENTILATION-BULK] Error deleting entry:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={skipModeSelection ? t('anesthesia.timeline.ventParamsTitle') : t('anesthesia.timeline.ventBulkTitle')}
      description={skipModeSelection
        ? t('anesthesia.timeline.ventParamsDescription')
        : t('anesthesia.timeline.ventBulkDescription')}
      className="sm:max-w-[550px]"
      testId="dialog-ventilation-bulk"
      time={dialogTime}
      onTimeChange={setDialogTime}
      showDelete={isEditing}
      onDelete={handleDelete}
      onCancel={handleClose}
      onSave={handleSave}
      saveLabel={isEditing ? t('common.save', 'Save') : (skipModeSelection ? t('anesthesia.timeline.save') : t('anesthesia.timeline.addAll'))}
      saveDisabled={readOnly}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        {skipModeSelection ? (
          // Skip mode selection - show only parameters grid
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="bulk-peep">PEEP (cmH₂O)</Label>
              <Input
                id="bulk-peep"
                type="number"
                step="1"
                value={bulkVentilationParams.peep}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, peep: e.target.value }))}
                data-testid="input-bulk-peep"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-fio2">FiO₂ (%)</Label>
              <Input
                id="bulk-fio2"
                type="number"
                step="1"
                value={bulkVentilationParams.fiO2}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, fiO2: e.target.value }))}
                data-testid="input-bulk-fio2"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-vt">Tidal Volume (ml)</Label>
              <Input
                id="bulk-vt"
                type="number"
                step="10"
                value={bulkVentilationParams.tidalVolume}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, tidalVolume: e.target.value }))}
                data-testid="input-bulk-vt"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-rr">Resp. Rate (/min)</Label>
              <Input
                id="bulk-rr"
                type="number"
                step="1"
                value={bulkVentilationParams.respiratoryRate}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                data-testid="input-bulk-rr"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-mv">Minute Volume (l/min)</Label>
              <Input
                id="bulk-mv"
                type="number"
                step="0.1"
                value={bulkVentilationParams.minuteVolume}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, minuteVolume: e.target.value }))}
                placeholder="Optional"
                data-testid="input-bulk-mv"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-etco2">EtCO₂ (mmHg)</Label>
              <Input
                id="bulk-etco2"
                type="number"
                step="1"
                value={bulkVentilationParams.etCO2}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, etCO2: e.target.value }))}
                placeholder="Optional"
                data-testid="input-bulk-etco2"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-pip">P insp (cmH₂O)</Label>
              <Input
                id="bulk-pip"
                type="number"
                step="1"
                value={bulkVentilationParams.pip}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, pip: e.target.value }))}
                placeholder="Optional"
                data-testid="input-bulk-pip"
                disabled={readOnly}
              />
            </div>
          </div>
        ) : isSpontaneousBreathing ? (
          // Spontaneous breathing mode - only show O2 flow and etCO2
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="bulk-o2-flow">O₂ Flow (l/min)</Label>
              <Input
                id="bulk-o2-flow"
                type="number"
                step="0.5"
                value={oxygenFlowRate}
                onChange={(e) => setOxygenFlowRate(e.target.value)}
                placeholder="e.g., 2"
                data-testid="input-bulk-o2-flow"
                disabled={readOnly}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-etco2-spontaneous">EtCO₂ (mmHg)</Label>
              <Input
                id="bulk-etco2-spontaneous"
                type="number"
                step="1"
                value={bulkVentilationParams.etCO2}
                onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, etCO2: e.target.value }))}
                placeholder="Optional"
                data-testid="input-bulk-etco2"
                disabled={readOnly}
              />
            </div>
          </div>
        ) : (
          // Normal ventilation mode - show all parameters
          <>
            <div className="grid gap-2">
              <Label htmlFor="vent-mode">Ventilation Mode</Label>
              <Select value={ventilationMode} onValueChange={setVentilationMode} disabled={readOnly}>
                <SelectTrigger id="vent-mode" data-testid="select-vent-mode">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="bulk-peep">PEEP (cmH₂O)</Label>
                <Input
                  id="bulk-peep"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.peep}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, peep: e.target.value }))}
                  data-testid="input-bulk-peep"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-fio2">FiO₂ (%)</Label>
                <Input
                  id="bulk-fio2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.fiO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, fiO2: e.target.value }))}
                  data-testid="input-bulk-fio2"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-vt">Tidal Volume (ml)</Label>
                <Input
                  id="bulk-vt"
                  type="number"
                  step="10"
                  value={bulkVentilationParams.tidalVolume}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, tidalVolume: e.target.value }))}
                  data-testid="input-bulk-vt"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-rr">Resp. Rate (/min)</Label>
                <Input
                  id="bulk-rr"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.respiratoryRate}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, respiratoryRate: e.target.value }))}
                  data-testid="input-bulk-rr"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-mv">Minute Volume (l/min)</Label>
                <Input
                  id="bulk-mv"
                  type="number"
                  step="0.1"
                  value={bulkVentilationParams.minuteVolume}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, minuteVolume: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-mv"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-etco2">EtCO₂ (mmHg)</Label>
                <Input
                  id="bulk-etco2"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.etCO2}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, etCO2: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-etco2"
                  disabled={readOnly}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bulk-pip">P insp (cmH₂O)</Label>
                <Input
                  id="bulk-pip"
                  type="number"
                  step="1"
                  value={bulkVentilationParams.pip}
                  onChange={(e) => setBulkVentilationParams(prev => ({ ...prev, pip: e.target.value }))}
                  placeholder="Optional"
                  data-testid="input-bulk-pip"
                  disabled={readOnly}
                />
              </div>
            </div>
          </>
        )}

        {/* Spontaneous Breathing Checkbox - at the end (hide when skipModeSelection) */}
        {!skipModeSelection && (
          <div className="flex items-center space-x-2 pt-4 border-t">
            <Checkbox
              id="spontaneous-breathing"
              checked={isSpontaneousBreathing}
              onCheckedChange={(checked) => setIsSpontaneousBreathing(checked === true)}
              data-testid="checkbox-spontaneous-breathing"
              disabled={readOnly}
            />
            <Label
              htmlFor="spontaneous-breathing"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Spontaneous Breathing
            </Label>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
