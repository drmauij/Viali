import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface PendingVentilationBulk {
  time: number;
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
}: VentilationBulkDialogProps) {
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
      }
      
      // Use provided weight or default to 70 kg
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
      
      // Determine ventilation mode
      let modeValue = null;
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
      
      // Single API call to save everything atomically
      await apiRequest('POST', '/api/anesthesia/ventilation/bulk', {
        anesthesiaRecordId,
        timestamp,
        ventilationMode: modeValue,
        parameters,
      });
      
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

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="dialog-ventilation-bulk">
        <DialogHeader>
          <DialogTitle>Ventilation Bulk Entry</DialogTitle>
          <DialogDescription>
            Add ventilation parameters to the timeline
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {isSpontaneousBreathing ? (
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

          {/* Spontaneous Breathing Checkbox - at the end */}
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
        </div>
        <DialogFooterWithTime
          time={dialogTime}
          onTimeChange={setDialogTime}
          showDelete={false}
          onCancel={handleClose}
          onSave={!readOnly ? handleSave : undefined}
          saveLabel="Add All"
          saveDisabled={readOnly}
        />
      </DialogContent>
    </Dialog>
  );
}
