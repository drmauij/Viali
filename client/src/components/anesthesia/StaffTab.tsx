import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, X, User, UserCog, Stethoscope, Syringe, HeartPulse, Users, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCreateStaff, useUpdateStaff, useDeleteStaff, type StaffRole } from '@/hooks/useStaffQuery';
import type { SurgeryStaffEntry } from '@shared/schema';

interface StaffTabProps {
  anesthesiaRecordId: string | undefined;
  hospitalId: string | undefined;
  anesthesiaUnitId: string | undefined;
  readOnly?: boolean;
}

const ROLE_CONFIG: Record<StaffRole, { icon: typeof User; labelKey: string; colorClass: string }> = {
  surgeon: { icon: UserCog, labelKey: 'surgery.staff.surgeon', colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  surgicalAssistant: { icon: Users, labelKey: 'surgery.staff.surgicalAssistant', colorClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  instrumentNurse: { icon: Syringe, labelKey: 'surgery.staff.instrumentNurse', colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  circulatingNurse: { icon: HeartPulse, labelKey: 'surgery.staff.circulatingNurse', colorClass: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  anesthesiologist: { icon: Stethoscope, labelKey: 'surgery.staff.anesthesiologist', colorClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  anesthesiaNurse: { icon: User, labelKey: 'surgery.staff.anesthesiaNurse', colorClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
};

const ROLE_ORDER: StaffRole[] = [
  'surgeon',
  'surgicalAssistant',
  'instrumentNurse',
  'circulatingNurse',
  'anesthesiologist',
  'anesthesiaNurse',
];

export function StaffTab({
  anesthesiaRecordId,
  hospitalId,
  anesthesiaUnitId,
  readOnly = false,
}: StaffTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [openPopover, setOpenPopover] = useState<StaffRole | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [editingEntry, setEditingEntry] = useState<SurgeryStaffEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<SurgeryStaffEntry | null>(null);

  const { data: staffEntries = [], isLoading } = useQuery<SurgeryStaffEntry[]>({
    queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  const { data: unitUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/users`],
    enabled: !!hospitalId,
    select: (data) => data.filter((u: any) => u.hospitalId === hospitalId),
  });

  const createStaff = useCreateStaff(anesthesiaRecordId);
  const updateStaff = useUpdateStaff(anesthesiaRecordId);
  const deleteStaff = useDeleteStaff(anesthesiaRecordId);

  const staffByRole = useMemo(() => {
    const grouped: Record<StaffRole, SurgeryStaffEntry[]> = {
      surgeon: [],
      surgicalAssistant: [],
      instrumentNurse: [],
      circulatingNurse: [],
      anesthesiologist: [],
      anesthesiaNurse: [],
    };

    staffEntries.forEach((entry) => {
      if (grouped[entry.role as StaffRole]) {
        grouped[entry.role as StaffRole].push(entry);
      }
    });

    return grouped;
  }, [staffEntries]);

  const handleAddStaff = async (role: StaffRole, name: string, userId?: string | null) => {
    if (!anesthesiaRecordId || !name.trim()) return;

    try {
      await createStaff.mutateAsync({
        anesthesiaRecordId,
        role,
        name: name.trim(),
        userId: userId || null,
        createdBy: user?.id || null,
      });
      setOpenPopover(null);
      setSearchInput('');
      toast({
        title: t('common.success'),
        description: t('surgery.staff.added'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('surgery.staff.addError'),
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStaff = async () => {
    if (!editingEntry || !editName.trim()) return;

    try {
      await updateStaff.mutateAsync({
        id: editingEntry.id,
        name: editName.trim(),
      });
      setEditingEntry(null);
      setEditName('');
      toast({
        title: t('common.success'),
        description: t('surgery.staff.updated'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('surgery.staff.updateError'),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteStaff = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteStaff.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({
        title: t('common.success'),
        description: t('surgery.staff.deleted'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('surgery.staff.deleteError'),
        variant: 'destructive',
      });
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchInput.trim()) return unitUsers;
    const search = searchInput.toLowerCase();
    return unitUsers.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return fullName.includes(search) || (u.email || '').toLowerCase().includes(search);
    });
  }, [unitUsers, searchInput]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ROLE_ORDER.map((role) => {
        const config = ROLE_CONFIG[role];
        const Icon = config.icon;
        const entries = staffByRole[role];

        return (
          <Card key={role} className="border-l-4" style={{ borderLeftColor: role.includes('anesthesi') ? '#10b981' : '#3b82f6' }}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {t(config.labelKey, role)}
                </CardTitle>
                {!readOnly && (
                  <Popover open={openPopover === role} onOpenChange={(open) => {
                    setOpenPopover(open ? role : null);
                    if (!open) setSearchInput('');
                  }}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1" data-testid={`button-add-staff-${role}`}>
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('common.add')}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <Command>
                        <CommandInput
                          placeholder={t('surgery.staff.searchOrEnter')}
                          value={searchInput}
                          onValueChange={setSearchInput}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && searchInput.trim()) {
                              e.preventDefault();
                              handleAddStaff(role, searchInput.trim());
                            }
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {searchInput.trim() && (
                              <Button
                                variant="ghost"
                                className="w-full justify-start text-left"
                                onClick={() => handleAddStaff(role, searchInput.trim())}
                                data-testid={`button-add-custom-staff-${role}`}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                {t('surgery.staff.addCustom', { name: searchInput.trim() })}
                              </Button>
                            )}
                          </CommandEmpty>
                          {searchInput.trim() && (
                            <CommandGroup heading={t('surgery.staff.addAsNew')}>
                              <CommandItem
                                onSelect={() => handleAddStaff(role, searchInput.trim())}
                                className="cursor-pointer"
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                <span className="font-medium">{searchInput.trim()}</span>
                              </CommandItem>
                            </CommandGroup>
                          )}
                          {filteredUsers.length > 0 && (
                            <CommandGroup heading={t('surgery.staff.systemUsers')}>
                              {filteredUsers.map((u) => {
                                const fullName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email;
                                return (
                                  <CommandItem
                                    key={u.id}
                                    onSelect={() => handleAddStaff(role, fullName, u.id)}
                                    className="cursor-pointer"
                                  >
                                    <User className="h-4 w-4 mr-2" />
                                    <div className="flex flex-col">
                                      <span>{fullName}</span>
                                      {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardHeader>
            <CardContent className="py-2 px-4">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t('surgery.staff.noEntries')}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {entries.map((entry) => (
                    <Badge
                      key={entry.id}
                      variant="secondary"
                      className={`${config.colorClass} flex items-center gap-1 px-2 py-1 text-sm`}
                    >
                      <span>{entry.name}</span>
                      {entry.userId && (
                        <span title={t('surgery.staff.linkedUser')}>
                          <User className="h-3 w-3 opacity-60" />
                        </span>
                      )}
                      {!readOnly && (
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            onClick={() => {
                              setEditingEntry(entry);
                              setEditName(entry.name);
                            }}
                            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
                            data-testid={`button-edit-staff-${entry.id}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(entry)}
                            className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-destructive"
                            data-testid={`button-delete-staff-${entry.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('surgery.staff.editEntry')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t('surgery.staff.name')}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('surgery.staff.enterName')}
                data-testid="input-edit-staff-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleUpdateStaff} disabled={!editName.trim() || updateStaff.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('surgery.staff.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('surgery.staff.deleteConfirmDescription', { name: deleteConfirm?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStaff} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
