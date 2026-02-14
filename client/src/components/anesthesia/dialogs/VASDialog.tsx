import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useAddVASPoint, useUpdateVASPoint, useDeleteVASPoint } from "@/hooks/useVitalsQuery";

interface EditingVAS {
  id: string;
  time: number;
  value: number;
  index: number;
}

interface PendingVAS {
  time: number;
}

interface VASDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingVAS: EditingVAS | null;
  pendingVAS: PendingVAS | null;
  onVASCreated?: () => void;
  onVASUpdated?: () => void;
  onVASDeleted?: () => void;
  readOnly?: boolean;
}

const VAS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function getVASButtonColor(value: number, isSelected: boolean): string {
  if (isSelected) {
    if (value <= 3) return 'bg-green-500 text-white hover:bg-green-600';
    if (value <= 6) return 'bg-yellow-500 text-white hover:bg-yellow-600';
    return 'bg-red-500 text-white hover:bg-red-600';
  }
  return '';
}

function getVASLabel(value: number): string {
  if (value === 0) return 'No pain';
  if (value <= 3) return 'Mild';
  if (value <= 6) return 'Moderate';
  if (value <= 9) return 'Severe';
  return 'Worst pain';
}

export function VASDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingVAS,
  pendingVAS,
  onVASCreated,
  onVASUpdated,
  onVASDeleted,
  readOnly = false,
}: VASDialogProps) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [vasEditTime, setVasEditTime] = useState<number>(0);

  const addVASPoint = useAddVASPoint(anesthesiaRecordId || undefined);
  const updateVASPoint = useUpdateVASPoint(anesthesiaRecordId || undefined);
  const deleteVASPoint = useDeleteVASPoint(anesthesiaRecordId || undefined);

  useEffect(() => {
    if (editingVAS) {
      setSelectedValue(editingVAS.value);
      setVasEditTime(editingVAS.time);
    } else {
      setSelectedValue(null);
      setVasEditTime(0);
    }
  }, [editingVAS]);

  const handleSave = (value?: number) => {
    const vasValue = value ?? selectedValue;
    if (vasValue === null) return;
    if (!anesthesiaRecordId) return;

    if (editingVAS) {
      updateVASPoint.mutate(
        {
          pointId: editingVAS.id,
          value: vasValue,
          timestamp: new Date(vasEditTime).toISOString(),
        },
        {
          onSuccess: () => {
            onVASUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingVAS) {
      addVASPoint.mutate(
        {
          timestamp: new Date(pendingVAS.time).toISOString(),
          value: vasValue,
        },
        {
          onSuccess: () => {
            onVASCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingVAS) return;
    if (!anesthesiaRecordId) return;

    deleteVASPoint.mutate(editingVAS.id, {
      onSuccess: () => {
        onVASDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setSelectedValue(null);
  };

  return (
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title="VAS (Visual Analog Scale)"
      description={editingVAS ? 'Edit or delete the pain score' : 'Select current pain level (0-10)'}
      className="sm:max-w-[500px]"
      testId="dialog-vas"
      time={editingVAS ? vasEditTime : pendingVAS?.time}
      onTimeChange={editingVAS ? setVasEditTime : undefined}
      showDelete={!!editingVAS && !readOnly}
      onDelete={editingVAS && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={() => handleSave()}
      saveDisabled={selectedValue === null || readOnly}
      saveLabel={editingVAS ? 'Save' : 'Add'}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        <div className="grid gap-2">
          <Label>Pain Level (0 = No pain, 10 = Worst pain)</Label>
          <div className="grid grid-cols-11 gap-1">
            {editingVAS ? (
              VAS_VALUES.map((value) => (
                <Button
                  key={value}
                  variant={selectedValue === value ? 'default' : 'outline'}
                  className={`h-12 text-base font-semibold ${getVASButtonColor(value, selectedValue === value)}`}
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    setSelectedValue(value);
                  }}
                  data-testid={`button-vas-${value}`}
                >
                  {value}
                </Button>
              ))
            ) : (
              VAS_VALUES.map((value) => (
                <Button
                  key={value}
                  variant="outline"
                  className={`h-12 text-base font-semibold hover:${getVASButtonColor(value, true)}`}
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;
                    handleSave(value);
                  }}
                  data-testid={`button-vas-${value}`}
                >
                  {value}
                </Button>
              ))
            )}
          </div>
          {selectedValue !== null && (
            <p className="text-sm text-muted-foreground text-center mt-2">
              {getVASLabel(selectedValue)}
            </p>
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="text-green-600">0-3: Mild</span>
          <span className="text-yellow-600">4-6: Moderate</span>
          <span className="text-red-600">7-10: Severe</span>
        </div>
      </div>
    </BaseTimelineDialog>
  );
}
