import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BaseTimelineDialog } from "@/components/anesthesia/BaseTimelineDialog";
import { useCreateStaff, useUpdateStaff, useDeleteStaff } from "@/hooks/useStaffQuery";
import { useTranslation } from "react-i18next";

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
  hospitalId: string | null;
  anesthesiaUnitId: string | null;
  editingStaff: EditingStaff | null;
  pendingStaff: PendingStaff | null;
  onStaffCreated?: () => void;
  onStaffUpdated?: () => void;
  onStaffDeleted?: () => void;
  readOnly?: boolean;
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
  readOnly = false,
}: StaffDialogProps) {
  const { t } = useTranslation();
  const [staffInput, setStaffInput] = useState("");
  const [staffEditTime, setStaffEditTime] = useState<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // Get the current role (from editing or pending)
  const currentRole = editingStaff?.role || pendingStaff?.role;

  // Fetch users from the hospital using non-admin endpoint (accessible by all authenticated users)
  const { data: allModuleUsers = [] } = useQuery<Array<{
    id: string;
    name: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
    unitId: string;
    unitName: string;
  }>>({
    queryKey: [`/api/hospitals/${hospitalId}/users-by-module?module=anesthesia&role=${currentRole}`],
    enabled: !!hospitalId && !!open && currentRole !== 'assistant',
  });

  // Filter by anesthesiaUnitId to scope to the specific unit
  const filteredUsers = anesthesiaUnitId 
    ? allModuleUsers.filter(user => user.unitId === anesthesiaUnitId)
    : allModuleUsers;

  // Initialize mutation hooks
  const createStaff = useCreateStaff(anesthesiaRecordId || undefined);
  const updateStaff = useUpdateStaff(anesthesiaRecordId || undefined);
  const deleteStaff = useDeleteStaff(anesthesiaRecordId || undefined);

  // Sync editing data to form
  useEffect(() => {
    if (editingStaff) {
      setStaffInput(editingStaff.name);
      setStaffEditTime(editingStaff.time);
      // Autoselect text for immediate editing
      setTimeout(() => inputRef.current?.select(), 0);
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
    <BaseTimelineDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dialogs.staffEntry')}
      description={editingStaff ? t('dialogs.staffEditDesc', { role: editingStaff.role }) : t('dialogs.staffAddDesc')}
      testId="dialog-staff"
      time={editingStaff ? staffEditTime : pendingStaff?.time}
      onTimeChange={editingStaff ? setStaffEditTime : undefined}
      showDelete={!!editingStaff && !readOnly}
      onDelete={editingStaff && !readOnly ? handleDelete : undefined}
      onCancel={handleClose}
      onSave={handleSave}
      saveDisabled={!staffInput.trim() || readOnly}
      saveLabel={editingStaff ? t('common.save') : t('common.add')}
    >
      <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
        {currentRole === 'assistant' ? (
          // For assistant role, show free text input
          <div className="grid gap-2">
            <Label htmlFor="staff-name">{t('common.name')}</Label>
            <Input
              ref={inputRef}
              id="staff-name"
              data-testid="input-staff-name"
              placeholder={t('dialogs.staffEnterName')}
              value={staffInput}
              onChange={(e) => setStaffInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && staffInput.trim() && !readOnly) {
                  handleSave();
                }
              }}
              autoFocus
              disabled={readOnly}
            />
          </div>
        ) : (
          // For doctor/nurse roles, show selectable user list
          <div className="grid gap-2">
            <Label>{t('dialogs.staffSelectRole', { role: currentRole })}</Label>
            <div className="grid grid-cols-1 gap-2">
              {filteredUsers.map((hospitalUser) => {
                // Use name from endpoint (already formatted as "lastName firstName") or fallback
                const displayName = hospitalUser.name ||
                  [hospitalUser.firstName, hospitalUser.lastName].filter(Boolean).join(' ') ||
                  hospitalUser.email;

                return (
                  <Button
                    key={hospitalUser.id}
                    variant={staffInput === displayName ? 'default' : 'outline'}
                    className="justify-start h-auto py-3 text-left"
                    disabled={readOnly}
                    onClick={() => {
                      if (!anesthesiaRecordId || readOnly) return;

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
                    data-testid={`button-staff-${hospitalUser.id}`}
                  >
                    {displayName}
                  </Button>
                );
              })}
            </div>
            {filteredUsers.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">
                {t('dialogs.staffNoUsersFound', { role: currentRole })}
              </div>
            )}
            {/* Custom input for other names */}
            <div className="mt-2 pt-2 border-t">
              <Label htmlFor="staff-name-custom">{t('dialogs.staffOrEnterCustom')}</Label>
              <Input
                id="staff-name-custom"
                data-testid="input-staff-name-custom"
                placeholder={t('dialogs.staffEnterCustomName')}
                value={staffInput}
                onChange={(e) => setStaffInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && staffInput.trim() && !readOnly) {
                    handleSave();
                  }
                }}
                disabled={readOnly}
              />
            </div>
          </div>
        )}
      </div>
    </BaseTimelineDialog>
  );
}
