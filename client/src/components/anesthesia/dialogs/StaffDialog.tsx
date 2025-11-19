import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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

interface HospitalUser {
  id: string;
  userId: string;
  hospitalId: string;
  unitId: string;
  role: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface StaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string | null;
  hospitalId: string | null;
  anesthesiaUnitId: string | null;
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
  hospitalId,
  anesthesiaUnitId,
  editingStaff,
  pendingStaff,
  onStaffCreated,
  onStaffUpdated,
  onStaffDeleted,
}: StaffDialogProps) {
  const [staffInput, setStaffInput] = useState("");
  const [staffEditTime, setStaffEditTime] = useState<number>(Date.now());

  // Get the current role (from editing or pending)
  const currentRole = editingStaff?.role || pendingStaff?.role;

  // Fetch users from the hospital
  const { data: allUsers = [] } = useQuery<HospitalUser[]>({
    queryKey: [`/api/admin/${hospitalId}/users`],
    enabled: !!hospitalId && !!open && currentRole !== 'assistant',
  });

  // Filter users by anesthesia unit and role, then sort by surname
  const filteredUsers = allUsers
    .filter(user => 
      user.unitId === anesthesiaUnitId && 
      user.role === currentRole
    )
    .sort((a, b) => {
      const lastNameA = a.user.lastName?.toLowerCase() || '';
      const lastNameB = b.user.lastName?.toLowerCase() || '';
      return lastNameA.localeCompare(lastNameB);
    });

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
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {currentRole === 'assistant' ? (
            // For assistant role, show free text input
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
          ) : (
            // For doctor/nurse roles, show selectable user list
            <div className="grid gap-2">
              <Label>Select {currentRole}</Label>
              <div className="grid grid-cols-1 gap-2">
                {filteredUsers.map((hospitalUser) => {
                  const displayName = [hospitalUser.user.firstName, hospitalUser.user.lastName]
                    .filter(Boolean)
                    .join(' ') || hospitalUser.user.email;
                  
                  return (
                    <Button
                      key={hospitalUser.id}
                      variant={staffInput === displayName ? 'default' : 'outline'}
                      className="justify-start h-auto py-3 text-left"
                      onClick={() => {
                        if (!anesthesiaRecordId) return;
                        
                        // Update staffInput for variant highlighting
                        setStaffInput(displayName);
                        
                        if (editingStaff) {
                          updateStaff.mutate(
                            {
                              id: editingStaff.id,
                              timestamp: new Date(staffEditTime),
                              name: displayName,
                            },
                            {
                              onSuccess: () => {
                                onStaffUpdated?.();
                                handleClose();
                              },
                            }
                          );
                        } else if (pendingStaff) {
                          createStaff.mutate(
                            {
                              anesthesiaRecordId,
                              timestamp: new Date(pendingStaff.time),
                              role: pendingStaff.role,
                              name: displayName,
                            },
                            {
                              onSuccess: () => {
                                onStaffCreated?.();
                                handleClose();
                              },
                            }
                          );
                        }
                      }}
                      data-testid={`button-staff-${hospitalUser.user.id}`}
                    >
                      {displayName}
                    </Button>
                  );
                })}
              </div>
              {filteredUsers.length === 0 && (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  No {currentRole}s found in this unit
                </div>
              )}
              {/* Custom input for other names */}
              <div className="mt-2 pt-2 border-t">
                <Label htmlFor="staff-name-custom">Or enter custom name</Label>
                <Input
                  id="staff-name-custom"
                  data-testid="input-staff-name-custom"
                  placeholder="Enter custom name..."
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
          )}
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
