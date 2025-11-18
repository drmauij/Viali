import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooterWithTime } from "@/components/anesthesia/DialogFooterWithTime";
import { useCreateStaff, useUpdateStaff, useDeleteStaff } from "@/hooks/useStaffQuery";

interface EditingStaff {
  id: string;
  time: number;
  name: string;
  role: 'doctor' | 'nurse' | 'assistant';
  index: number;
}

interface PendingStaff {
  time: number;
  role: 'doctor' | 'nurse' | 'assistant';
}

interface StaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  editingStaff: EditingStaff | null;
  pendingStaff: PendingStaff | null;
  onStaffCreated?: () => void;
  onStaffUpdated?: () => void;
  onStaffDeleted?: () => void;
}

export function StaffDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  editingStaff,
  pendingStaff,
  onStaffCreated,
  onStaffUpdated,
  onStaffDeleted,
}: StaffDialogProps) {
  const [staffInput, setStaffInput] = useState("");
  const [staffEditTime, setStaffEditTime] = useState<number>(Date.now());

  // Initialize mutation hooks
  const createStaff = useCreateStaff(anesthesiaRecordId || undefined);
  const updateStaff = useUpdateStaff(anesthesiaRecordId || undefined);
  const deleteStaff = useDeleteStaff(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingStaff) {
      setStaffInput(editingStaff.name);
      setStaffEditTime(editingStaff.time);
    } else {
      setStaffInput("");
      setStaffEditTime(Date.now());
    }
  }, [editingStaff]);

  const handleSave = () => {
    const name = staffInput.trim();
    if (!name) return;
    if (!anesthesiaRecordId) return;

    if (editingStaff) {
      // Editing existing value - call update mutation
      const { id, role } = editingStaff;

      updateStaff.mutate(
        {
          id,
          timestamp: new Date(staffEditTime),
          name,
        },
        {
          onSuccess: () => {
            onStaffUpdated?.();
            handleClose();
          },
        }
      );
    } else if (pendingStaff) {
      // Adding new value - call create mutation
      const { time, role } = pendingStaff;

      createStaff.mutate(
        {
          anesthesiaRecordId,
          timestamp: new Date(time),
          role,
          name,
        },
        {
          onSuccess: () => {
            onStaffCreated?.();
            handleClose();
          },
        }
      );
    }
  };

  const handleDelete = () => {
    if (!editingStaff) return;
    if (!anesthesiaRecordId) return;

    deleteStaff.mutate(editingStaff.id, {
      onSuccess: () => {
        onStaffDeleted?.();
        handleClose();
      },
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setStaffInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-staff">
        <DialogHeader>
          <DialogTitle>Staff Entry</DialogTitle>
          <DialogDescription>
            {editingStaff ? `Edit or delete the ${editingStaff.role} entry` : 'Add staff member to the timeline'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="staff-name">Name</Label>
            <Input
              id="staff-name"
              data-testid="input-staff-name"
              placeholder="Enter name..."
              value={staffInput}
              onChange={(e) => setStaffInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && staffInput.trim()) {
                  handleSave();
                }
              }}
            />
          </div>
        </div>
        <DialogFooterWithTime
          time={editingStaff ? staffEditTime : pendingStaff?.time}
          onTimeChange={editingStaff ? setStaffEditTime : undefined}
          showDelete={!!editingStaff}
          onDelete={editingStaff ? handleDelete : undefined}
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={!staffInput.trim()}
          saveLabel={editingStaff ? 'Save' : 'Add'}
        />
      </DialogContent>
    </Dialog>
  );
}
