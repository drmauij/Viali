import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      setBulkVentilationParams({
        peep: "",
        fiO2: "",
        tidalVolume: "",
        respiratoryRate: "",
        minuteVolume: "",
        etCO2: "",
        pip: "",
      });
    } else if (patientWeight) {
      const tidalVolumeCalc = Math.round(patientWeight * 6);
      setBulkVentilationParams(prev => ({
        ...prev,
        peep: "5",
        fiO2: "40",
        tidalVolume: tidalVolumeCalc.toString(),
        respiratoryRate: "12",
      }));
    }
  }, [open, patientWeight]);

  const handleSave = () => {
    if (!pendingVentilationBulk) return;
    if (!anesthesiaRecordId) return;
    
    const { time } = pendingVentilationBulk;
    const timestamp = new Date(time).toISOString();
    
    const shouldAddMode = ventilationModeData.length === 0 || 
      ventilationModeData[ventilationModeData.length - 1][1] !== ventilationMode;
    
    if (shouldAddMode) {
      createVentilationMode.mutate({
        anesthesiaRecordId,
        timestamp,
        value: ventilationMode,
      });
    }
    
    const parameterMappings = [
      { key: 'peep', vitalType: 'peep' },
      { key: 'fiO2', vitalType: 'fiO2' },
      { key: 'tidalVolume', vitalType: 'tidalVolume' },
      { key: 'respiratoryRate', vitalType: 'respiratoryRate' },
      { key: 'minuteVolume', vitalType: 'minuteVolume' },
      { key: 'etCO2', vitalType: 'etCO2' },
      { key: 'pip', vitalType: 'pip' },
    ];
    
    parameterMappings.forEach(({ key, vitalType }) => {
      const valueStr = bulkVentilationParams[key as keyof typeof bulkVentilationParams];
      if (valueStr) {
        const value = parseFloat(valueStr);
        if (!isNaN(value)) {
          addVitalPointMutation.mutate({
            vitalType,
            timestamp,
            value,
          });
        }
      }
    });
    
    onVentilationBulkCreated?.();
    handleClose();
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
