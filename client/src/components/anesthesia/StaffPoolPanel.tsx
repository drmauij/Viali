import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { 
  Plus, 
  X, 
  User, 
  UserCog, 
  Stethoscope, 
  Syringe, 
  HeartPulse, 
  Users, 
  BedDouble,
  UserPlus,
  FileText,
  GripVertical,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { apiRequest } from '@/lib/queryClient';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { DailyStaffPool } from '@shared/schema';

type StaffRole = 
  | "surgeon"
  | "surgicalAssistant"
  | "instrumentNurse"
  | "circulatingNurse"
  | "anesthesiologist"
  | "anesthesiaNurse"
  | "pacuNurse";

interface StaffPoolPanelProps {
  selectedDate: Date;
  hospitalId: string | undefined;
}

interface StaffPoolEntry extends DailyStaffPool {
  assignedSurgeryIds: string[];
  assignedRooms: Array<{ roomId: string; roomName: string }>;
  isBooked: boolean;
}

const ROLE_CONFIG: Record<StaffRole, { icon: typeof User; labelKey: string; colorClass: string; bgClass: string }> = {
  surgeon: { 
    icon: UserCog, 
    labelKey: 'surgery.staff.surgeon', 
    colorClass: 'text-blue-800 dark:text-blue-200',
    bgClass: 'bg-blue-100 dark:bg-blue-900'
  },
  surgicalAssistant: { 
    icon: Users, 
    labelKey: 'surgery.staff.surgicalAssistant', 
    colorClass: 'text-indigo-800 dark:text-indigo-200',
    bgClass: 'bg-indigo-100 dark:bg-indigo-900'
  },
  instrumentNurse: { 
    icon: Syringe, 
    labelKey: 'surgery.staff.instrumentNurse', 
    colorClass: 'text-purple-800 dark:text-purple-200',
    bgClass: 'bg-purple-100 dark:bg-purple-900'
  },
  circulatingNurse: { 
    icon: HeartPulse, 
    labelKey: 'surgery.staff.circulatingNurse', 
    colorClass: 'text-pink-800 dark:text-pink-200',
    bgClass: 'bg-pink-100 dark:bg-pink-900'
  },
  anesthesiologist: { 
    icon: Stethoscope, 
    labelKey: 'surgery.staff.anesthesiologist', 
    colorClass: 'text-green-800 dark:text-green-200',
    bgClass: 'bg-green-100 dark:bg-green-900'
  },
  anesthesiaNurse: { 
    icon: User, 
    labelKey: 'surgery.staff.anesthesiaNurse', 
    colorClass: 'text-teal-800 dark:text-teal-200',
    bgClass: 'bg-teal-100 dark:bg-teal-900'
  },
  pacuNurse: { 
    icon: BedDouble, 
    labelKey: 'surgery.staff.pacuNurse', 
    colorClass: 'text-orange-800 dark:text-orange-200',
    bgClass: 'bg-orange-100 dark:bg-orange-900'
  },
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

interface DraggableStaffItemProps {
  staff: StaffPoolEntry;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}

function DraggableStaffItem({ staff, onRemove, readOnly = false }: DraggableStaffItemProps) {
  const { t } = useTranslation();
  const config = ROLE_CONFIG[staff.role as StaffRole];
  const Icon = config?.icon || User;
  const hasRoomAssignments = staff.assignedRooms && staff.assignedRooms.length > 0;
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: {
      type: 'staff',
      staff,
    },
    disabled: readOnly,
  });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-2 p-2 rounded-md border 
        ${staff.isBooked 
          ? 'bg-muted/50 border-dashed opacity-60' 
          : `${config?.bgClass || 'bg-gray-100 dark:bg-gray-800'} border-solid`
        }
        ${!readOnly && !staff.isBooked ? 'cursor-grab active:cursor-grabbing' : ''}
        transition-all duration-150
      `}
      data-testid={`staff-pool-item-${staff.id}`}
    >
      {!readOnly && !staff.isBooked && (
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      
      <Icon className={`h-4 w-4 flex-shrink-0 ${config?.colorClass || 'text-gray-600'}`} />
      
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate ${staff.isBooked ? 'line-through' : ''}`}>
          {staff.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {t(config?.labelKey || staff.role)}
          {staff.isBooked && ` (${staff.assignedSurgeryIds.length})`}
        </div>
      </div>
      
      {staff.userId && (
        <span title={t('surgery.staff.linkedUser')}>
          <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </span>
      )}
      
      {!readOnly && !hasRoomAssignments && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(staff.id);
          }}
          className="p-1 rounded hover:bg-destructive/10 text-destructive flex-shrink-0"
          data-testid={`button-remove-pool-staff-${staff.id}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

interface CreateStaffChoice {
  name: string;
  role: StaffRole;
}

export default function StaffPoolPanel({ selectedDate, hospitalId }: StaffPoolPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const queryClient = useQueryClient();
  const isAdmin = activeHospital?.role === 'admin';
  
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<StaffRole>('surgeon');
  const [searchInput, setSearchInput] = useState('');
  const [createStaffChoice, setCreateStaffChoice] = useState<CreateStaffChoice | null>(null);
  
  const dateString = useMemo(() => {
    const d = new Date(selectedDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);
  
  const { data: staffPool = [], isLoading } = useQuery<StaffPoolEntry[]>({
    queryKey: ['/api/staff-pool', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-pool/${hospitalId}/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff pool');
      return res.json();
    },
    enabled: !!hospitalId,
  });
  
  const { data: staffOptions = [] } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/staff-options', hospitalId, selectedRole],
    queryFn: async () => {
      const res = await fetch(`/api/anesthesia/staff-options/${hospitalId}?staffRole=${selectedRole}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff options');
      return res.json();
    },
    enabled: !!hospitalId && addPopoverOpen,
  });
  
  const addToPoolMutation = useMutation({
    mutationFn: async (data: { name: string; role: StaffRole; userId?: string | null }) => {
      const res = await apiRequest('POST', '/api/staff-pool', {
        hospitalId,
        date: dateString,
        name: data.name,
        role: data.role,
        userId: data.userId || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', hospitalId, dateString] });
      setAddPopoverOpen(false);
      setSearchInput('');
      toast({
        title: t('common.success'),
        description: t('staffPool.addedToPool', 'Staff added to daily pool'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('staffPool.addError', 'Failed to add staff to pool'),
        variant: 'destructive',
      });
    },
  });
  
  const removeFromPoolMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/staff-pool/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', hospitalId, dateString] });
      queryClient.invalidateQueries({ queryKey: ['/api/planned-staff'] });
      toast({
        title: t('common.success'),
        description: t('staffPool.removedFromPool', 'Staff removed from pool'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('staffPool.removeError', 'Failed to remove staff from pool'),
        variant: 'destructive',
      });
    },
  });
  
  const createQuickStaffUser = useMutation({
    mutationFn: async (data: { name: string; staffRole: StaffRole }) => {
      const res = await apiRequest('POST', `/api/anesthesia/staff-user/${hospitalId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/anesthesia/staff-options');
        },
      });
    },
  });
  
  const staffByRole = useMemo(() => {
    const grouped: Record<StaffRole, StaffPoolEntry[]> = {
      surgeon: [],
      surgicalAssistant: [],
      instrumentNurse: [],
      circulatingNurse: [],
      anesthesiologist: [],
      anesthesiaNurse: [],
      pacuNurse: [],
    };
    
    staffPool.forEach((entry) => {
      if (grouped[entry.role as StaffRole]) {
        grouped[entry.role as StaffRole].push(entry);
      }
    });
    
    return grouped;
  }, [staffPool]);
  
  const filteredUsers = useMemo(() => {
    if (!searchInput.trim()) return staffOptions;
    const search = searchInput.toLowerCase();
    return staffOptions.filter((u) => {
      const fullName = (u.name || '').toLowerCase();
      return fullName.includes(search) || (u.email || '').toLowerCase().includes(search);
    });
  }, [staffOptions, searchInput]);
  
  const handleAddStaff = async (name: string, userId?: string | null) => {
    if (!name.trim()) return;
    
    // If no userId is provided (custom name not in system), automatically create as Staff User
    // This ensures all staff entries can have hourly rates for cost calculations
    if (!userId && isAdmin) {
      setAddPopoverOpen(false);
      try {
        const result = await createQuickStaffUser.mutateAsync({
          name: name.trim(),
          staffRole: selectedRole,
        });
        await addToPoolMutation.mutateAsync({
          name: name.trim(),
          role: selectedRole,
          userId: result.id,
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
    
    await addToPoolMutation.mutateAsync({ name: name.trim(), role: selectedRole, userId });
  };
  
  const handleCreateAsStaffUser = async () => {
    if (!createStaffChoice) return;
    
    try {
      const result = await createQuickStaffUser.mutateAsync({
        name: createStaffChoice.name,
        staffRole: createStaffChoice.role,
      });
      
      await addToPoolMutation.mutateAsync({
        name: createStaffChoice.name,
        role: createStaffChoice.role,
        userId: result.id,
      });
      
      setCreateStaffChoice(null);
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
    await addToPoolMutation.mutateAsync({
      name: createStaffChoice.name,
      role: createStaffChoice.role,
      userId: null,
    });
    setCreateStaffChoice(null);
  };
  
  const handleRemoveStaff = (id: string) => {
    removeFromPoolMutation.mutate(id);
  };
  
  const availableCount = staffPool.filter(s => !s.isBooked).length;
  const bookedCount = staffPool.filter(s => s.isBooked).length;
  
  return (
    <Card className="h-full flex flex-col" data-testid="staff-pool-panel">
      <CardHeader className="py-3 px-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {t('staffPool.title', 'Staff Pool')}
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-400">{availableCount} {t('staffPool.available', 'available')}</span>
            {bookedCount > 0 && (
              <span className="text-muted-foreground">| {bookedCount} {t('staffPool.assigned', 'assigned')}</span>
            )}
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {selectedDate.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}
        </div>
      </CardHeader>
      
      <div className="px-4 pb-2 flex gap-2 flex-shrink-0">
        <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as StaffRole)}>
          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-staff-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_ORDER.map((role) => {
              const config = ROLE_CONFIG[role];
              const Icon = config.icon;
              return (
                <SelectItem key={role} value={role}>
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3 w-3 ${config.colorClass}`} />
                    <span>{t(config.labelKey, role)}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        
        <Popover open={addPopoverOpen} onOpenChange={(open) => {
          setAddPopoverOpen(open);
          if (!open) setSearchInput('');
        }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1" data-testid="button-add-to-pool">
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <Command>
              <CommandInput
                placeholder={t('surgery.staff.searchOrEnter', 'Search or enter name...')}
                value={searchInput}
                onValueChange={setSearchInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchInput.trim()) {
                    e.preventDefault();
                    handleAddStaff(searchInput.trim());
                  }
                }}
              />
              <CommandList>
                <CommandEmpty>
                  {searchInput.trim() && (
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-left"
                      onClick={() => handleAddStaff(searchInput.trim())}
                      data-testid="button-add-custom-pool-staff"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('surgery.staff.addCustom', { name: searchInput.trim() })}
                    </Button>
                  )}
                </CommandEmpty>
                {searchInput.trim() && (
                  <CommandGroup heading={t('surgery.staff.addAsNew', 'Add as new')}>
                    <CommandItem
                      onSelect={() => handleAddStaff(searchInput.trim())}
                      className="cursor-pointer"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      <span className="font-medium">{searchInput.trim()}</span>
                    </CommandItem>
                  </CommandGroup>
                )}
                {filteredUsers.length > 0 && (
                  <CommandGroup heading={t('surgery.staff.systemUsers', 'System Users')}>
                    {filteredUsers.map((u) => (
                      <CommandItem
                        key={u.id}
                        onSelect={() => handleAddStaff(u.name, u.id)}
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
      </div>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="p-4 pt-0 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : staffPool.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('staffPool.empty', 'No staff in pool for this day')}</p>
                <p className="text-xs mt-1">{t('staffPool.emptyHint', 'Add staff above to start planning')}</p>
              </div>
            ) : (
              ROLE_ORDER.map((role) => {
                const entries = staffByRole[role];
                if (entries.length === 0) return null;
                
                const config = ROLE_CONFIG[role];
                const Icon = config.icon;
                
                return (
                  <div key={role} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Icon className={`h-3 w-3 ${config.colorClass}`} />
                      <span>{t(config.labelKey, role)}</span>
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                        {entries.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {entries.map((staff) => (
                        <DraggableStaffItem
                          key={staff.id}
                          staff={staff}
                          onRemove={handleRemoveStaff}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
      
      <Dialog open={!!createStaffChoice} onOpenChange={(open) => !open && setCreateStaffChoice(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('surgery.staff.createStaffChoice', 'Create Staff Entry')}</DialogTitle>
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
              data-testid="button-create-pool-as-staff-user"
            >
              <UserPlus className="h-5 w-5 mr-3 flex-shrink-0 text-primary" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium">{t('surgery.staff.createAsStaffUser', 'Create as Staff User')}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {t('surgery.staff.createAsStaffUserDesc', 'Create a system user for tracking and reporting')}
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 px-4 justify-start w-full"
              onClick={handleCreateAsText}
              disabled={createQuickStaffUser.isPending}
              data-testid="button-create-pool-as-text"
            >
              <FileText className="h-5 w-5 mr-3 flex-shrink-0 text-muted-foreground" />
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium">{t('surgery.staff.createAsText', 'Add as Text Only')}</div>
                <div className="text-xs text-muted-foreground whitespace-normal">
                  {t('surgery.staff.createAsTextDesc', 'Just add the name without creating a user')}
                </div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateStaffChoice(null)} data-testid="button-cancel-create-pool-staff">
              {t('common.cancel', 'Cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
