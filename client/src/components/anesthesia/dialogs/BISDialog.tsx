import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useAddVitalPoint, useUpdateVitalPoint, useDeleteVitalPoint } from "@/hooks/useVitalsQuery";

interface EditingBIS {
  id: string;
  time: number;
  value: number;
  index: number;
}

interface PendingBIS {
  time: number;
}

interface BISDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingBIS: EditingBIS | null;
  pendingBIS: PendingBIS | null;
  onBISCreated?: () => void;
  onBISUpdated?: () => void;
  onBISDeleted?: () => void;
}

export function BISDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingBIS,
  pendingBIS,
  onBISCreated,
  onBISUpdated,
  onBISDeleted,
}: BISDialogProps) {
  const [bisValue, setBisValue] = useState("");
  const [bisEditTime, setBisEditTime] = useState<number>(0);

  const addVitalPoint = useAddVitalPoint(anesthesiaRecordId || undefined);
  const updateVitalPoint = useUpdateVitalPoint(anesthesiaRecordId || undefined);
  const deleteVitalPoint = useDeleteVitalPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingBIS) {
      setBisValue(editingBIS.value.toString());
      setBisEditTime(editingBIS.time);
    } else {
      setBisValue("");
      setBisEditTime(0);
    }
  }, [editingBIS]);

  const handleSave = () => {
    const value = parseFloat(bisValue);
    if (isNaN(value) || value < 0 || value > 100) return;
    if (!anesthesiaRecordId) return;

    if (editingBIS) {
      updateVitalPoint.mutate(
        {
          pointId: editingBIS.id,
          value,
          timestamp: new Date(bisEditTime).toISOString(),
        },
        {
          onSuccess: () => {
            onBISUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingBIS) {
      addVitalPoint.mutate(
        {
          vitalType: 'bis',
          timestamp: new Date(pendingBIS.time).toISOString(),
          value,
        },
        {
          onSuccess: () => {
            onBISCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingBIS) return;
    if (!anesthesiaRecordId) return;

    deleteVitalPoint.mutate(editingBIS.id, {
      onSuccess: () => {
        onBISDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setBisValue("");
  };

  const isValid = () => {
    const value = parseFloat(bisValue);
    return !isNaN(value) && value >= 0 && value <= 100;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-bis">
        <DialogHeader>
          <DialogTitle>BIS (Bispectral Index)</DialogTitle>
          <DialogDescription>
            {editingBIS ? 'Edit or delete the BIS value' : 'Enter BIS value (0-100)'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="bis-value">BIS Value</Label>
            <Input
              id="bis-value"
              type="number"
              placeholder="0-100"
              value={bisValue}
              onChange={(e) => setBisValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isValid()) {
                  handleSave();
                }
              }}
              min={0}
              max={100}
              step={1}
              autoFocus
              data-testid="input-bis-value"
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={editingBIS ? bisEditTime : pendingBIS?.time}
          onTimeChange={editingBIS ? setBisEditTime : undefined}
          showDelete={!!editingBIS}
          onDelete={editingBIS ? handleDelete : undefined}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!isValid()}
          saveLabel={editingBIS ? 'Save' : 'Add'}
        />
      </DialogContent>
    </Dialog>
  );
}
