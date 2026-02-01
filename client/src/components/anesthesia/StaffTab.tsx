import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, X, User, UserCog, Stethoscope, Syringe, HeartPulse, Users, ChevronDown, Edit2, Trash2, BedDouble, UserPlus, FileText, ClipboardCopy, CalendarClock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { useCreateStaff, useUpdateStaff, useDeleteStaff, type StaffRole } from '@/hooks/useStaffQuery';
import { apiRequest } from '@/lib/queryClient';
import type { SurgeryStaffEntry, PlannedSurgeryStaff } from '@shared/schema';

interface StaffTabProps {
  anesthesiaRecordId: string | undefined;
  hospitalId: string | undefined;
  anesthesiaUnitId: string | undefined;
  surgeryId?: string | undefined;
  readOnly?: boolean;
}

const ROLE_CONFIG: Record<StaffRole, { icon: typeof User; labelKey: string; colorClass: string }> = {
  surgeon: { icon: UserCog, labelKey: 'surgery.staff.surgeon', colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  surgicalAssistant: { icon: Users, labelKey: 'surgery.staff.surgicalAssistant', colorClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  instrumentNurse: { icon: Syringe, labelKey: 'surgery.staff.instrumentNurse', colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  circulatingNurse: { icon: HeartPulse, labelKey: 'surgery.staff.circulatingNurse', colorClass: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
  anesthesiologist: { icon: Stethoscope, labelKey: 'surgery.staff.anesthesiologist', colorClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  anesthesiaNurse: { icon: User, labelKey: 'surgery.staff.anesthesiaNurse', colorClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  pacuNurse: { icon: BedDouble, labelKey: 'surgery.staff.pacuNurse', colorClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
};

const ROLE_ORDER: StaffRole[] = [
  'surgeon',
  'surgicalAssistant',
  'instrumentNurse',
  'circulatingNurse',
  'anesthesiologist',
  'anesthesiaNurse',
  'pacuNurse',
];

interface CreateStaffChoice {
  name: string;
  role: StaffRole;
}

export function StaffTab({
  anesthesiaRecordId,
  hospitalId,
  anesthesiaUnitId,
  surgeryId,
  readOnly = false,
}: StaffTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const queryClient = useQueryClient();
  const isAdmin = activeHospital?.role === 'admin';

  const [openPopover, setOpenPopover] = useState<StaffRole | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [editingEntry, setEditingEntry] = useState<SurgeryStaffEntry | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<SurgeryStaffEntry | null>(null);
  const [createStaffChoice, setCreateStaffChoice] = useState<CreateStaffChoice | null>(null);

  const { data: staffEntries = [], isLoading } = useQuery<SurgeryStaffEntry[]>({
    queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  const { data: plannedStaff = [] } = useQuery<PlannedSurgeryStaff[]>({
    queryKey: ['/api/planned-staff', surgeryId],
    queryFn: async () => {
      const res = await fetch(`/api/planned-staff/${surgeryId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch planned staff');
      return res.json();
    },
    enabled: !!surgeryId,
  });

  const { data: staffOptions = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/staff-options/${hospitalId}`, { staffRole: openPopover }],
    queryFn: async () => {
      const res = await fetch(`/api/anesthesia/staff-options/${hospitalId}?staffRole=${openPopover}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff options');
      return res.json();
    },
    enabled: !!hospitalId && !!openPopover,
  });

  const createStaff = useCreateStaff(anesthesiaRecordId);
  const updateStaff = useUpdateStaff(anesthesiaRecordId);
  const deleteStaff = useDeleteStaff(anesthesiaRecordId);

  const createQuickStaffUser = useMutation({
    mutationFn: async (data: { name: string; staffRole: StaffRole }): Promise<{ id: string; name: string; email: string; role: string; unitId: string }> => {
      const res = await apiRequest('POST', `/api/anesthesia/staff-user/${hospitalId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith(`/api/anesthesia/staff-options/${hospitalId}`);
        },
      });
    },
  });

  const staffByRole = useMemo(() => {
    const grouped: Record<StaffRole, SurgeryStaffEntry[]> = {
      surgeon: [],
      surgicalAssistant: [],
      instrumentNurse: [],
      circulatingNurse: [],
      anesthesiologist: [],
      anesthesiaNurse: [],
      pacuNurse: [],
    };

    staffEntries.forEach((entry) => {
      if (grouped[entry.role as StaffRole]) {
        grouped[entry.role as StaffRole].push(entry);
      }
    });

    return grouped;
  }, [staffEntries]);

  const plannedByRole = useMemo(() => {
    const grouped: Record<StaffRole, PlannedSurgeryStaff[]> = {
      surgeon: [],
      surgicalAssistant: [],
      instrumentNurse: [],
      circulatingNurse: [],
      anesthesiologist: [],
      anesthesiaNurse: [],
      pacuNurse: [],
    };

    plannedStaff.forEach((entry) => {
      if (grouped[entry.role as StaffRole]) {
        grouped[entry.role as StaffRole].push(entry);
      }
    });

    return grouped;
  }, [plannedStaff]);

  const copyPlannedStaffMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        plannedStaff.map(entry =>
          apiRequest('POST', `/api/anesthesia/staff`, {
            anesthesiaRecordId,
            role: entry.role,
            name: entry.name,
            userId: entry.userId,
            createdBy: user?.id || null,
          })
        )
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      return { successful, failed, total: plannedStaff.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/staff/${anesthesiaRecordId}`] });
      
      if (data.failed === 0) {
        toast({ title: t('common.success'), description: t('staffPool.copiedToRecord', 'Planned staff copied to record') });
      } else if (data.successful > 0) {
        toast({ 
          title: t('common.warning', 'Warning'), 
          description: t('staffPool.partialCopy', `${data.successful} of ${data.total} staff copied. ${data.failed} may already exist.`),
          variant: 'default',
        });
      } else {
        toast({ 
          title: t('common.error'), 
          description: t('staffPool.copyError', 'Failed to copy planned staff - they may already exist in the record'), 
          variant: 'destructive' 
        });
      }
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('staffPool.copyError', 'Failed to copy planned staff'), variant: 'destructive' });
    },
  });

  const handleAddStaff = async (role: StaffRole, name: string, userId?: string | null) => {
    if (!anesthesiaRecordId || !name.trim()) return;

    // If no userId is provided (custom name not in system), automatically create as Staff User
    // This ensures all staff entries can have hourly rates for cost calculations
    if (!userId && isAdmin && hospitalId) {
      setOpenPopover(null);
      try {
        const result = await createQuickStaffUser.mutateAsync({
          name: name.trim(),
          staffRole: role,
        });
        await addStaffEntry(role, name.trim(), result.id);
        toast({
          title: t('common.success'),
          description: t('surgery.staff.createdAsUser'),
        });
      } catch (error) {
        toast({
          title: t('common.error'),
          description: t('surgery.staff.createUserError'),
          variant: 'destructive',
        });
      }
      return;
    }

    await addStaffEntry(role, name.trim(), userId || null);
  };

  const addStaffEntry = async (role: StaffRole, name: string, userId: string | null) => {
    if (!anesthesiaRecordId) return;

    try {
      await createStaff.mutateAsync({
        anesthesiaRecordId,
        role,
        name,
        userId,
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

  const handleCreateAsStaffUser = async () => {
    if (!createStaffChoice || !hospitalId) return;

    try {
      const result = await createQuickStaffUser.mutateAsync({
        name: createStaffChoice.name,
        staffRole: createStaffChoice.role,
      });

      await addStaffEntry(createStaffChoice.role, createStaffChoice.name, result.id);
      setCreateStaffChoice(null);
      toast({
        title: t('common.success'),
        description: t('surgery.staff.createdAsUser'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('surgery.staff.createUserError'),
        variant: 'destructive',
      });
    }
  };

  const handleCreateAsText = async () => {
    if (!createStaffChoice) return;
    await addStaffEntry(createStaffChoice.role, createStaffChoice.name, null);
    setCreateStaffChoice(null);
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
    if (!searchInput.trim()) return staffOptions;
    const search = searchInput.toLowerCase();
    return staffOptions.filter((u) => {
      const fullName = (u.name || '').toLowerCase();
      return fullName.includes(search) || (u.email || '').toLowerCase().includes(search);
    });
  }, [staffOptions, searchInput]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {plannedStaff.length > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-planned-staff">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                {t('staffPool.plannedStaff', 'Planned Staff')}
                <Badge variant="secondary" className="text-xs">{plannedStaff.length}</Badge>
              </CardTitle>
              {!readOnly && anesthesiaRecordId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyPlannedStaffMutation.mutate()}
                  disabled={copyPlannedStaffMutation.isPending}
                  data-testid="button-copy-planned-staff"
                >
                  <ClipboardCopy className="h-4 w-4 mr-1" />
                  {t('staffPool.copyToActual', 'Copy to Record')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="py-2 px-4">
            <div className="flex flex-wrap gap-2">
              {plannedStaff.map((entry) => {
                const config = ROLE_CONFIG[entry.role as StaffRole];
                const Icon = config?.icon || User;
                return (
                  <Badge
                    key={entry.id}
                    variant="secondary"
                    className={`${config?.colorClass || 'bg-gray-100 text-gray-800'} flex items-center gap-1`}
                    data-testid={`badge-planned-staff-${entry.id}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{entry.name}</span>
                    <span className="text-xs opacity-60">({t(config?.labelKey || entry.role)})</span>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                              {filteredUsers.map((u) => (
                                <CommandItem
                                  key={u.id}
                                  onSelect={() => handleAddStaff(role, u.name, u.id)}
                                  className="cursor-pointer"
                                >
                                  <User className="h-4 w-4 mr-2" />
                                  <div className="flex flex-col">
                                    <span>{u.name}</span>
                                    {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                                  </div>
                                </CommandItem>
                              ))}
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

      <Dialog open={!!createStaffChoice} onOpenChange={(open) => !open && setCreateStaffChoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('surgery.staff.createStaffChoice')}</DialogTitle>
            <DialogDescription>
              {t('surgery.staff.createStaffChoiceDesc', { name: createStaffChoice?.name })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start w-full"
              onClick={handleCreateAsStaffUser}
              disabled={createQuickStaffUser.isPending}
              data-testid="button-create-as-staff-user"
            >
              <UserPlus className="h-5 w-5 mr-3 flex-shrink-0 text-primary" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium">{t('surgery.staff.createAsStaffUser')}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {t('surgery.staff.createAsStaffUserDesc')}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start w-full"
              onClick={handleCreateAsText}
              disabled={createQuickStaffUser.isPending}
              data-testid="button-create-as-text"
            >
              <FileText className="h-5 w-5 mr-3 flex-shrink-0 text-muted-foreground" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium">{t('surgery.staff.createAsText')}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {t('surgery.staff.createAsTextDesc')}
                </div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateStaffChoice(null)} data-testid="button-cancel-create-staff">
              {t('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
