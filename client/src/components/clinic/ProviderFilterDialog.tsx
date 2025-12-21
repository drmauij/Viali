import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { 
  Search, 
  Check, 
  User, 
  Stethoscope, 
  Syringe, 
  Users,
  Filter
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Provider {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email?: string;
  role?: string;
}

interface ProviderFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  providers: Provider[];
  selectedProviderIds: Set<string>;
  onApplyFilter: (selectedIds: Set<string>) => void;
}

const ROLE_ICONS: Record<string, { icon: typeof User; colorClass: string }> = {
  doctor: { icon: Stethoscope, colorClass: 'text-green-600 dark:text-green-400' },
  nurse: { icon: Syringe, colorClass: 'text-purple-600 dark:text-purple-400' },
  admin: { icon: Users, colorClass: 'text-blue-600 dark:text-blue-400' },
  default: { icon: User, colorClass: 'text-gray-600 dark:text-gray-400' },
};

export default function ProviderFilterDialog({ 
  open, 
  onOpenChange, 
  hospitalId,
  providers,
  selectedProviderIds,
  onApplyFilter 
}: ProviderFilterDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selectedProviderIds));
  const [saveToProfile, setSaveToProfile] = useState(false);
  
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(selectedProviderIds));
    }
  }, [open, selectedProviderIds]);

  const sortedProviders = useMemo(() => {
    const seen = new Set<string>();
    const unique = providers.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return unique.sort((a, b) => {
      const nameA = `${a.lastName || ''} ${a.firstName || ''}`.trim().toLowerCase();
      const nameB = `${b.lastName || ''} ${b.firstName || ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [providers]);
  
  const filteredProviders = useMemo(() => {
    if (!searchQuery.trim()) return sortedProviders;
    const query = searchQuery.toLowerCase();
    return sortedProviders.filter(p => {
      const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
      return fullName.includes(query) || (p.email && p.email.toLowerCase().includes(query));
    });
  }, [sortedProviders, searchQuery]);

  const savePreferenceMutation = useMutation({
    mutationFn: async (providerIds: string[]) => {
      return apiRequest('PATCH', '/api/user/preferences', {
        clinicProviderFilter: {
          [hospitalId]: providerIds
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/preferences'] });
      toast({
        title: t('common.success'),
        description: t('appointments.filterSaved', 'Provider filter saved to your profile'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('appointments.filterSaveError', 'Failed to save filter preference'),
        variant: 'destructive',
      });
    },
  });
  
  const handleClose = () => {
    setSearchQuery('');
    setSaveToProfile(false);
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

  const selectAll = () => {
    setSelectedIds(new Set(sortedProviders.map(p => p.id)));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };
  
  const handleApply = async () => {
    onApplyFilter(selectedIds);
    
    if (saveToProfile) {
      await savePreferenceMutation.mutateAsync(Array.from(selectedIds));
    }
    
    handleClose();
  };
  
  const selectedCount = selectedIds.size;
  const totalCount = sortedProviders.length;
  
  return (
    <Dialog open={open} onOpenChange={(newOpen) => !newOpen && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {t('appointments.filterProviders', 'Filter Providers')}
          </DialogTitle>
          <DialogDescription>
            {t('appointments.selectProvidersToShow', 'Select which providers to show on the calendar')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('appointments.searchProviders', 'Search providers...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search-providers"
          />
        </div>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
            {t('common.selectAll', 'Select All')}
          </Button>
          <Button variant="outline" size="sm" onClick={selectNone} data-testid="button-select-none">
            {t('common.selectNone', 'Select None')}
          </Button>
          <span className="ml-auto text-sm text-muted-foreground self-center">
            {selectedCount} / {totalCount}
          </span>
        </div>
        
        <ScrollArea className="flex-1 min-h-[200px] max-h-[50vh] border rounded-md">
          <div className="p-2 space-y-1">
            {filteredProviders.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('appointments.noProvidersFound', 'No providers found')}</p>
              </div>
            ) : (
              filteredProviders.map((provider) => {
                const isSelected = selectedIds.has(provider.id);
                const roleConfig = ROLE_ICONS[provider.role || 'default'] || ROLE_ICONS.default;
                const Icon = roleConfig.icon;
                const fullName = `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || 'Unknown';
                
                return (
                  <div
                    key={provider.id}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-primary/10 border border-primary' 
                        : 'hover:bg-accent'
                    }`}
                    onClick={() => toggleSelection(provider.id)}
                    data-testid={`provider-option-${provider.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      className="pointer-events-none"
                    />
                    <Icon className={`h-4 w-4 flex-shrink-0 ${roleConfig.colorClass}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{fullName}</div>
                      {provider.email && (
                        <div className="text-xs text-muted-foreground truncate">{provider.email}</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 shrink-0 pt-2 border-t">
          <Checkbox
            id="save-to-profile"
            checked={saveToProfile}
            onCheckedChange={(checked) => setSaveToProfile(checked === true)}
            data-testid="checkbox-save-to-profile"
          />
          <Label htmlFor="save-to-profile" className="text-sm cursor-pointer">
            {t('appointments.saveFilterToProfile', 'Save this selection to my profile')}
          </Label>
        </div>
        
        <DialogFooter className="shrink-0 flex-row gap-2 sm:gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-filter">
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button 
            onClick={handleApply}
            disabled={savePreferenceMutation.isPending}
            data-testid="button-apply-filter"
          >
            <Check className="h-4 w-4 mr-1" />
            {t('common.apply', 'Apply')} {selectedCount > 0 && `(${selectedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
