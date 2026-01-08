import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  User, 
  Stethoscope, 
  Syringe, 
  Users,
  UserPlus,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface HospitalUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  role: string;
  unitId: string;
  unitName: string;
}

interface ClinicProvider {
  id: string;
  unitId: string;
  userId: string;
  isBookable: boolean;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
}

interface ManageProvidersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId: string;
}

const ROLE_ICONS: Record<string, { icon: typeof User; colorClass: string }> = {
  doctor: { icon: Stethoscope, colorClass: 'text-green-600 dark:text-green-400' },
  nurse: { icon: Syringe, colorClass: 'text-purple-600 dark:text-purple-400' },
  admin: { icon: Users, colorClass: 'text-blue-600 dark:text-blue-400' },
  default: { icon: User, colorClass: 'text-gray-600 dark:text-gray-400' },
};

export default function ManageProvidersDialog({ 
  open, 
  onOpenChange, 
  hospitalId,
  unitId,
}: ManageProvidersDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, boolean>>({});
  
  const { data: hospitalUsers = [], isLoading: usersLoading } = useQuery<HospitalUser[]>({
    queryKey: [`/api/hospitals/${hospitalId}/users-by-module`],
    enabled: !!hospitalId && open,
  });

  const { data: clinicProviders = [], isLoading: providersLoading } = useQuery<ClinicProvider[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/clinic-providers`],
    enabled: !!hospitalId && !!unitId && open,
  });

  useEffect(() => {
    if (open) {
      setPendingChanges({});
      setSearchQuery('');
    }
  }, [open]);

  const currentProviderMap = useMemo(() => {
    const map = new Map<string, boolean>();
    clinicProviders.forEach(cp => {
      map.set(cp.userId, cp.isBookable);
    });
    return map;
  }, [clinicProviders]);

  const isUserBookable = (userId: string): boolean => {
    if (userId in pendingChanges) {
      return pendingChanges[userId];
    }
    return currentProviderMap.get(userId) ?? false;
  };

  const sortedUsers = useMemo(() => {
    const seen = new Set<string>();
    const unique = hospitalUsers.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
    return unique.sort((a, b) => {
      const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim().toLowerCase();
      const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [hospitalUsers]);
  
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return sortedUsers;
    const query = searchQuery.toLowerCase();
    return sortedUsers.filter(u => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return fullName.includes(query) || (u.email && u.email.toLowerCase().includes(query));
    });
  }, [sortedUsers, searchQuery]);

  const toggleProviderMutation = useMutation({
    mutationFn: async ({ userId, isBookable }: { userId: string; isBookable: boolean }) => {
      return apiRequest('PUT', `/api/clinic/${hospitalId}/units/${unitId}/clinic-providers/${userId}`, {
        isBookable
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && (
            key.includes('/clinic-providers') || 
            key.includes('/bookable-providers') ||
            key.includes('/providers')
          );
        }
      });
    },
    onError: (error) => {
      toast({
        title: t('common.error'),
        description: t('appointments.providerUpdateError', 'Failed to update provider'),
        variant: 'destructive',
      });
    },
  });

  const toggleSelection = (userId: string) => {
    const currentValue = isUserBookable(userId);
    setPendingChanges(prev => ({
      ...prev,
      [userId]: !currentValue
    }));
  };

  const handleSave = async () => {
    const changes = Object.entries(pendingChanges);
    if (changes.length === 0) {
      onOpenChange(false);
      return;
    }

    try {
      for (const [userId, isBookable] of changes) {
        await toggleProviderMutation.mutateAsync({ userId, isBookable });
      }
      
      toast({
        title: t('common.success'),
        description: t('appointments.providersUpdated', 'Providers updated successfully'),
      });
      
      onOpenChange(false);
    } catch (error) {
    }
  };

  const handleClose = () => {
    setSearchQuery('');
    setPendingChanges({});
    onOpenChange(false);
  };

  const hasChanges = Object.keys(pendingChanges).length > 0;
  const isLoading = usersLoading || providersLoading;
  const isSaving = toggleProviderMutation.isPending;

  const selectedCount = filteredUsers.filter(u => isUserBookable(u.id)).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('appointments.manageProviders', 'Manage Providers')}
          </DialogTitle>
          <DialogDescription>
            {t('appointments.manageProvidersDescription', 'Select which staff members should appear as bookable providers in the calendar.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('common.search', 'Search...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-provider-search"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('appointments.noUsersFound', 'No users found')}</p>
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto overflow-x-hidden space-y-1 border rounded-lg p-2">
              {filteredUsers.map((user) => {
                const roleConfig = ROLE_ICONS[user.role] || ROLE_ICONS.default;
                const RoleIcon = roleConfig.icon;
                const isSelected = isUserBookable(user.id);
                const hasChange = user.id in pendingChanges;
                
                return (
                  <div
                    key={user.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors ${
                      isSelected ? 'bg-primary/10' : ''
                    } ${hasChange ? 'ring-2 ring-primary/30' : ''}`}
                    onClick={() => toggleSelection(user.id)}
                    data-testid={`provider-row-${user.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(user.id)}
                      data-testid={`checkbox-provider-${user.id}`}
                    />
                    <RoleIcon className={`h-4 w-4 ${roleConfig.colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {user.lastName || ''} {user.firstName || ''}
                      </div>
                      {user.email && (
                        <div className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {user.role}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            {t('appointments.providersSelected', '{{count}} provider(s) selected', { count: selectedCount })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            data-testid="button-cancel-providers"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            data-testid="button-save-providers"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
