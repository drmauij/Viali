import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateOutput } from "@/hooks/useOutputQuery";

interface PendingOutputBulk {
  time: number;
}

interface OutputBulkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  pendingOutputBulk: PendingOutputBulk | null;
  onOutputBulkCreated?: () => void;
}

export function OutputBulkDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  pendingOutputBulk,
  onOutputBulkCreated,
}: OutputBulkDialogProps) {
  const [bulkOutputParams, setBulkOutputParams] = useState({
    gastricTube: "",
    drainage: "",
    vomit: "",
    urine: "",
    blood: "",
    bloodIrrigation: "",
  });

  const createOutput = useCreateOutput(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (!open) {
      setBulkOutputParams({
        gastricTube: "",
        drainage: "",
        vomit: "",
        urine: "",
        blood: "",
        bloodIrrigation: "",
      });
    }
  }, [open]);

  const handleSave = () => {
    if (!pendingOutputBulk) return;
    if (!anesthesiaRecordId) return;
    
    const { time } = pendingOutputBulk;
    const timestamp = new Date(time).toISOString();
    
    // Add all filled parameters using createOutput mutation
    const parameterMappings = [
      { key: 'gastricTube', paramKey: 'gastricTube' as const },
      { key: 'drainage', paramKey: 'drainage' as const },
      { key: 'vomit', paramKey: 'vomit' as const },
      { key: 'urine', paramKey: 'urine' as const },
      { key: 'blood', paramKey: 'blood' as const },
      { key: 'bloodIrrigation', paramKey: 'bloodIrrigation' as const },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]" data-testid="dialog-output-bulk">
        <DialogHeader>
          <DialogTitle>Output Bulk Entry</DialogTitle>
          <DialogDescription>
            Add output parameters to the timeline
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="bulk-gastrictube">Gastric Tube (ml)</Label>
              <Input
                id="bulk-gastrictube"
                type="number"
                step="1"
                value={bulkOutputParams.gastricTube}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, gastricTube: e.target.value }))}
                data-testid="input-bulk-gastrictube"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-drainage">Drainage (ml)</Label>
              <Input
                id="bulk-drainage"
                type="number"
                step="1"
                value={bulkOutputParams.drainage}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, drainage: e.target.value }))}
                data-testid="input-bulk-drainage"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-vomit">Vomit (ml)</Label>
              <Input
                id="bulk-vomit"
                type="number"
                step="1"
                value={bulkOutputParams.vomit}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, vomit: e.target.value }))}
                data-testid="input-bulk-vomit"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-urine">Urine (ml)</Label>
              <Input
                id="bulk-urine"
                type="number"
                step="1"
                value={bulkOutputParams.urine}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, urine: e.target.value }))}
                data-testid="input-bulk-urine"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-blood">Blood (ml)</Label>
              <Input
                id="bulk-blood"
                type="number"
                step="1"
                value={bulkOutputParams.blood}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, blood: e.target.value }))}
                data-testid="input-bulk-blood"
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2 col-span-2">
              <Label htmlFor="bulk-bloodirrigation">Blood and Irrigation in Suction (ml)</Label>
              <Input
                id="bulk-bloodirrigation"
                type="number"
                step="1"
                value={bulkOutputParams.bloodIrrigation}
                onChange={(e) => setBulkOutputParams(prev => ({ ...prev, bloodIrrigation: e.target.value }))}
                data-testid="input-bulk-bloodirrigation"
                placeholder="Optional"
              />
            </div>
          </div>
        </div>
        <DialogFooterWithTime
          time={pendingOutputBulk?.time}
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
