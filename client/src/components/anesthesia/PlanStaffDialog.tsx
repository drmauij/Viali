import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Plus, 
  Check, 
  User, 
  UserCog, 
  Stethoscope, 
  Syringe, 
  HeartPulse, 
  Users, 
  BedDouble,
  UserPlus,
  FileText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { apiRequest } from '@/lib/queryClient';

type StaffRole = 
  | "surgeon"
  | "surgicalAssistant"
  | "instrumentNurse"
  | "circulatingNurse"
  | "anesthesiologist"
  | "anesthesiaNurse"
  | "pacuNurse";

interface PlanStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date;
  hospitalId: string;
}

interface StaffOption {
  id: string;
  name: string;
  email?: string;
  staffRole?: StaffRole;
}

const ROLE_CONFIG: Record<StaffRole, { icon: typeof User; labelKey: string; colorClass: string }> = {
  surgeon: { icon: UserCog, labelKey: 'surgery.staff.surgeon', colorClass: 'text-blue-600 dark:text-blue-400' },
  surgicalAssistant: { icon: Users, labelKey: 'surgery.staff.surgicalAssistant', colorClass: 'text-indigo-600 dark:text-indigo-400' },
  instrumentNurse: { icon: Syringe, labelKey: 'surgery.staff.instrumentNurse', colorClass: 'text-purple-600 dark:text-purple-400' },
  circulatingNurse: { icon: HeartPulse, labelKey: 'surgery.staff.circulatingNurse', colorClass: 'text-pink-600 dark:text-pink-400' },
  anesthesiologist: { icon: Stethoscope, labelKey: 'surgery.staff.anesthesiologist', colorClass: 'text-green-600 dark:text-green-400' },
  anesthesiaNurse: { icon: User, labelKey: 'surgery.staff.anesthesiaNurse', colorClass: 'text-teal-600 dark:text-teal-400' },
  pacuNurse: { icon: BedDouble, labelKey: 'surgery.staff.pacuNurse', colorClass: 'text-orange-600 dark:text-orange-400' },
};

export default function PlanStaffDialog({ open, onOpenChange, selectedDate, hospitalId }: PlanStaffDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const queryClient = useQueryClient();
  const isAdmin = activeHospital?.role === 'admin';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newStaffName, setNewStaffName] = useState('');
  const [showCreateOptions, setShowCreateOptions] = useState(false);
  
  const dateString = useMemo(() => {
    const d = new Date(selectedDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);
  
  const { data: staffOptions = [], isLoading: loadingOptions } = useQuery<StaffOption[]>({
    queryKey: ['/api/anesthesia/all-staff-options', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/anesthesia/all-staff-options/${hospitalId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff options');
      return res.json();
    },
    enabled: open && !!hospitalId,
  });
  
  const { data: currentStaffPool = [] } = useQuery<any[]>({
    queryKey: ['/api/staff-pool', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-pool/${hospitalId}/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch staff pool');
      return res.json();
    },
    enabled: open && !!hospitalId,
  });
  
  const alreadyPlannedUserIds = useMemo(() => {
    return new Set(currentStaffPool.map(s => s.userId).filter(Boolean));
  }, [currentStaffPool]);
  
  const alreadyPlannedNames = useMemo(() => {
    return new Set(currentStaffPool.filter(s => !s.userId).map(s => s.name.toLowerCase()));
  }, [currentStaffPool]);
  
  const sortedStaffOptions = useMemo(() => {
    // Deduplicate by user ID - keep first instance only
    const seen = new Set<string>();
    const unique = staffOptions.filter(s => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }, [staffOptions]);
  
  const filteredStaffOptions = useMemo(() => {
    if (!searchQuery.trim()) return sortedStaffOptions;
    const query = searchQuery.toLowerCase();
    return sortedStaffOptions.filter(s => 
      s.name.toLowerCase().includes(query) || 
      (s.email && s.email.toLowerCase().includes(query))
    );
  }, [sortedStaffOptions, searchQuery]);
  
  const addToPoolMutation = useMutation({
    mutationFn: async (staffList: Array<{ name: string; role: StaffRole; userId?: string | null }>) => {
      const results = [];
      for (const staff of staffList) {
        const res = await apiRequest('POST', '/api/staff-pool', {
          hospitalId,
          date: dateString,
          name: staff.name,
          role: staff.role,
          userId: staff.userId || null,
        });
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', hospitalId, dateString] });
      toast({
        title: t('common.success'),
        description: t('staffPool.staffPlanned', 'Staff has been planned for this day'),
      });
      handleClose();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('staffPool.planError', 'Failed to plan staff'),
        variant: 'destructive',
      });
    },
  });
  
  const createQuickStaffUser = useMutation({
    mutationFn: async (data: { name: string; staffRole: StaffRole }) => {
      const res = await apiRequest('POST', `/api/anesthesia/staff-user/${hospitalId}`, data);
      return res.json();
    },
  });
  
  const handleClose = () => {
    setSearchQuery('');
    setSelectedIds(new Set());
    setNewStaffName('');
    setShowCreateOptions(false);
    onOpenChange(false);
  };
  
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };
  
  const handlePlanSelected = async () => {
    const staffToAdd = sortedStaffOptions
      .filter(s => selectedIds.has(s.id))
      .map(s => ({
        name: s.name,
        role: s.staffRole || 'anesthesiaNurse' as StaffRole,
        userId: s.id,
      }));
    
    if (staffToAdd.length === 0) {
      toast({
        title: t('staffPool.noSelection', 'No staff selected'),
        description: t('staffPool.selectStaff', 'Please select at least one staff member'),
        variant: 'destructive',
      });
      return;
    }
    
    await addToPoolMutation.mutateAsync(staffToAdd);
  };
  
  const handleCreateNewStaff = () => {
    if (!newStaffName.trim()) return;
    setShowCreateOptions(true);
  };
  
  const handleCreateAsStaffUser = async () => {
    if (!newStaffName.trim()) return;
    
    try {
      const result = await createQuickStaffUser.mutateAsync({
        name: newStaffName.trim(),
        staffRole: 'anesthesiaNurse',
      });
      
      await addToPoolMutation.mutateAsync([{
        name: newStaffName.trim(),
        role: 'anesthesiaNurse',
        userId: result.id,
      }]);
      
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/all-staff-options', hospitalId] });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('surgery.staff.createUserError'),
        variant: 'destructive',
      });
    }
  };
  
  const handleCreateAsText = async () => {
    if (!newStaffName.trim()) return;
    
    await addToPoolMutation.mutateAsync([{
      name: newStaffName.trim(),
      role: 'anesthesiaNurse',
      userId: null,
    }]);
  };
  
  const selectedCount = selectedIds.size;
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleClose();
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('staffPool.planStaff', 'Plan Staff')}
          </DialogTitle>
          <DialogDescription>
            {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('staffPool.searchStaff', 'Search staff...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-staff"
          />
        </div>
        
        <ScrollArea className="flex-1 min-h-[150px] max-h-[50vh] border rounded-md overflow-y-auto">
          <div className="p-2 space-y-1">
            {loadingOptions ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : filteredStaffOptions.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('staffPool.noStaffFound', 'No staff found')}</p>
              </div>
            ) : (
              filteredStaffOptions.map((staff) => {
                const isAlreadyPlanned = alreadyPlannedUserIds.has(staff.id);
                const isSelected = selectedIds.has(staff.id);
                const roleConfig = staff.staffRole ? ROLE_CONFIG[staff.staffRole] : null;
                const Icon = roleConfig?.icon || User;
                
                return (
                  <div
                    key={staff.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                      isAlreadyPlanned 
                        ? 'bg-muted/50 opacity-60 cursor-not-allowed' 
                        : isSelected 
                          ? 'bg-primary/10 border border-primary' 
                          : 'hover:bg-accent'
                    }`}
                    onClick={() => !isAlreadyPlanned && toggleSelection(staff.id)}
                    data-testid={`staff-option-${staff.id}`}
                  >
                    <Checkbox
                      checked={isSelected || isAlreadyPlanned}
                      disabled={isAlreadyPlanned}
                      className="pointer-events-none"
                    />
                    <Icon className={`h-4 w-4 flex-shrink-0 ${roleConfig?.colorClass || 'text-muted-foreground'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{staff.name}</div>
                      {staff.email && (
                        <div className="text-xs text-muted-foreground truncate">{staff.email}</div>
                      )}
                    </div>
                    {isAlreadyPlanned && (
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {t('staffPool.alreadyPlanned', 'Planned')}
                      </Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        
        {isAdmin && (
          <>
            <Separator />
            {!showCreateOptions ? (
              <div className="flex gap-2">
                <Input
                  placeholder={t('staffPool.newStaffName', 'New staff name...')}
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateNewStaff()}
                  data-testid="input-new-staff-name"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateNewStaff}
                  disabled={!newStaffName.trim()}
                  data-testid="button-create-new-staff"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t('staffPool.createChoice', { name: newStaffName })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCreateAsStaffUser}
                    disabled={addToPoolMutation.isPending}
                    data-testid="button-create-as-user"
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    {t('staffPool.createAsUser', 'As User')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCreateAsText}
                    disabled={addToPoolMutation.isPending}
                    data-testid="button-create-as-text"
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    {t('staffPool.createAsText', 'Text Only')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowCreateOptions(false);
                      setNewStaffName('');
                    }}
                    data-testid="button-cancel-create"
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-plan-staff">
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handlePlanSelected}
            disabled={selectedCount === 0 || addToPoolMutation.isPending}
            data-testid="button-confirm-plan-staff"
          >
            <Check className="h-4 w-4 mr-1" />
            {t('staffPool.planSelected', 'Plan')} {selectedCount > 0 && `(${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
