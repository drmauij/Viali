import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateVentilationMode } from "@/hooks/useVentilationModeQuery";
import { useAddVitalPoint } from "@/hooks/useVitalsQuery";

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
}: VentilationBulkDialogProps) {
  const [ventilationMode, setVentilationMode] = useState("PCV - druckkontrolliert");
  const [isSpontaneousBreathing, setIsSpontaneousBreathing] = useState(false);
  const [oxygenFlowRate, setOxygenFlowRate] = useState("");
  const [bulkVentilationParams, setBulkVentilationParams] = useState({
    peep: "",
    fiO2: "",
    tidalVolume: "",
    respiratoryRate: "",
    minuteVolume: "",
    etCO2: "",
    pip: "",
  });

  const createVentilationMode = useCreateVentilationMode(anesthesiaRecordId || undefined);
  const addVitalPointMutation = useAddVitalPoint(anesthesiaRecordId || undefined);

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
  }, [open, patientWeight]);

  const handleSave = async () => {
    if (!pendingVentilationBulk) return;
    if (!anesthesiaRecordId) return;
    
    const { time } = pendingVentilationBulk;
    const timestamp = new Date(time).toISOString();
    
    try {
      if (isSpontaneousBreathing) {
        // For spontaneous breathing, save mode with O2 flow rate
        const spontaneousModeValue = oxygenFlowRate 
          ? `Spontaneous: ${oxygenFlowRate} l/min O₂` 
          : "Spontaneous Breathing";
        
        await createVentilationMode.mutateAsync({
          anesthesiaRecordId,
          timestamp,
          value: spontaneousModeValue,
        });
        
        // Only save etCO2 if provided
        if (bulkVentilationParams.etCO2) {
          const etCO2Value = parseFloat(bulkVentilationParams.etCO2);
          if (!isNaN(etCO2Value)) {
            await addVitalPointMutation.mutateAsync({
              vitalType: 'etCO2',
              timestamp,
              value: etCO2Value,
            });
          }
        }
      } else {
        // Regular ventilation mode handling
        const shouldAddMode = ventilationModeData.length === 0 || 
          ventilationModeData[ventilationModeData.length - 1][1] !== ventilationMode;
        
        // Create ventilation mode first if needed
        if (shouldAddMode) {
          await createVentilationMode.mutateAsync({
            anesthesiaRecordId,
            timestamp,
            value: ventilationMode,
          });
        }
        
        // Collect all valid vital parameters
        const parameterMappings = [
          { key: 'peep', vitalType: 'peep' },
          { key: 'fiO2', vitalType: 'fiO2' },
          { key: 'tidalVolume', vitalType: 'tidalVolume' },
          { key: 'respiratoryRate', vitalType: 'respiratoryRate' },
          { key: 'minuteVolume', vitalType: 'minuteVolume' },
          { key: 'etCO2', vitalType: 'etCO2' },
          { key: 'pip', vitalType: 'pip' },
        ];
        
        // Batch all vital point mutations and wait for all to complete
        const mutations = parameterMappings
          .map(({ key, vitalType }) => {
            const valueStr = bulkVentilationParams[key as keyof typeof bulkVentilationParams];
            if (valueStr) {
              const value = parseFloat(valueStr);
              if (!isNaN(value)) {
                return addVitalPointMutation.mutateAsync({
                  vitalType,
                  timestamp,
                  value,
                }).catch(error => {
                  console.error(`[VENTILATION-BULK] Failed to save ${vitalType}:`, error);
                  return null;
                });
              }
            }
            return null;
          })
          .filter(Boolean);
        
        // Wait for all mutations to complete (ignoring individual failures)
        await Promise.all(mutations);
      }
      
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
          {/* Spontaneous Breathing Checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="spontaneous-breathing" 
              checked={isSpontaneousBreathing}
              onCheckedChange={(checked) => setIsSpontaneousBreathing(checked === true)}
              data-testid="checkbox-spontaneous-breathing"
            />
            <Label 
              htmlFor="spontaneous-breathing" 
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Spontaneous Breathing
            </Label>
          </div>

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
                />
              </div>
            </div>
          ) : (
            // Normal ventilation mode - show all parameters
            <>
              <div className="grid gap-2">
                <Label htmlFor="vent-mode">Ventilation Mode</Label>
                <Select value={ventilationMode} onValueChange={setVentilationMode}>
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
              />
            </div>
          </div>
            </>
          )}
        </div>
        <DialogFooterWithTime
          time={pendingVentilationBulk?.time}
          onTimeChange={(newTime) => {
            // This is a controlled component update - parent should handle this
          }}
          showDelete={false}
          onCancel={handleClose}
          onSave={handleSave}
          saveLabel="Add All"
        />
      </DialogContent>
    </Dialog>
  );
}
