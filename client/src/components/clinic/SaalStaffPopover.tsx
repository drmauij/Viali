import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plus, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type StaffRole =
  | 'surgeon'
  | 'surgicalAssistant'
  | 'instrumentNurse'
  | 'circulatingNurse'
  | 'anesthesiologist'
  | 'anesthesiaNurse'
  | 'pacuNurse';

const STAFF_ROLES: StaffRole[] = [
  'surgeon',
  'surgicalAssistant',
  'instrumentNurse',
  'circulatingNurse',
  'anesthesiologist',
  'anesthesiaNurse',
  'pacuNurse',
];

interface SaalStaffPopoverProps {
  providerId: string;
  providerName: string;
  dateStr: string;
  hospitalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
  children: React.ReactNode;
}

interface UnitData {
  id: string;
  name: string;
  type: string | null;
  isSurgeryModule?: boolean;
  isAnesthesiaModule?: boolean;
}

interface StaffOption {
  id: string;
  name: string;
  staffRole: string;
  baseRole: 'doctor' | 'nurse';
}

const SURGERY_ROLES: StaffRole[] = ['surgeon', 'surgicalAssistant', 'instrumentNurse', 'circulatingNurse'];
const ANESTHESIA_ROLES: StaffRole[] = ['anesthesiologist', 'anesthesiaNurse', 'pacuNurse'];

function getValidRolesForUser(staffOption: StaffOption): StaffRole[] {
  const isSurgery = SURGERY_ROLES.includes(staffOption.staffRole as StaffRole);
  if (isSurgery) {
    return staffOption.baseRole === 'doctor'
      ? ['surgeon', 'surgicalAssistant']
      : ['surgicalAssistant', 'instrumentNurse', 'circulatingNurse'];
  }
  // anesthesia
  return staffOption.baseRole === 'doctor'
    ? ['anesthesiologist']
    : ['anesthesiaNurse', 'pacuNurse'];
}

export default function SaalStaffPopover({
  providerId,
  providerName,
  dateStr,
  hospitalId,
  open,
  onOpenChange,
  onAdded,
  children,
}: SaalStaffPopoverProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [role, setRole] = useState<StaffRole | ''>('');
  const [unitId, setUnitId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole | ''>('');
  const [newStaffUnitId, setNewStaffUnitId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { data: units = [] } = useQuery<UnitData[]>({
    queryKey: [`/api/units/${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  const { data: staffOptions = [] } = useQuery<StaffOption[]>({
    queryKey: [`/api/anesthesia/all-staff-options/${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  const filteredUnits = units.filter(u => u.isSurgeryModule || u.isAnesthesiaModule);

  // Pre-fill role from staff options if available, and filter to valid roles
  const existingStaff = staffOptions.find(s => s.id === providerId);
  const providerRoles = existingStaff ? getValidRolesForUser(existingStaff) : STAFF_ROLES;
  const effectiveRole = role || (existingStaff?.staffRole as StaffRole) || '';

  const handleAddExisting = async () => {
    if (!effectiveRole) return;
    setIsSubmitting(true);
    try {
      await apiRequest('POST', '/api/staff-pool', {
        hospitalId,
        date: dateStr,
        userId: providerId,
        name: providerName,
        role: effectiveRole,
      });
      toast({ title: t('appointments.saalAdded') });
      onAdded();
      onOpenChange(false);
      resetForm();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNew = async () => {
    if (!newStaffName.trim() || !newStaffRole || !newStaffUnitId) return;
    setIsCreating(true);
    try {
      const res = await apiRequest('POST', `/api/anesthesia/staff-user/${hospitalId}`, {
        name: newStaffName.trim(),
        staffRole: newStaffRole,
        unitId: newStaffUnitId,
      });
      const newUser = await res.json();

      await apiRequest('POST', '/api/staff-pool', {
        hospitalId,
        date: dateStr,
        userId: newUser.id,
        name: newUser.name,
        role: newStaffRole,
      });

      toast({ title: t('appointments.saalAdded') });
      onAdded();
      onOpenChange(false);
      resetForm();
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setRole('');
    setUnitId('');
    setShowCreateNew(false);
    setNewStaffName('');
    setNewStaffRole('');
    setNewStaffUnitId('');
  };

  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-3">
          <h4 className="font-medium text-sm">{t('appointments.saalAddTitle')}</h4>
          <p className="text-xs text-muted-foreground">{providerName}</p>

          {/* Role picker — filtered to valid roles for this provider */}
          <div className="space-y-1">
            <Label className="text-xs">{t('appointments.selectRole')}</Label>
            <Select value={effectiveRole} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t('appointments.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {providerRoles.map(r => (
                  <SelectItem key={r} value={r} className="text-xs">
                    {t(`surgery.staff.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Add existing provider button */}
          <Button
            size="sm"
            className="w-full h-8 text-xs"
            disabled={!effectiveRole || isSubmitting}
            onClick={handleAddExisting}
          >
            {isSubmitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {t('appointments.addToSaal')}
          </Button>

          {/* Create new staff section */}
          <Collapsible open={showCreateNew} onOpenChange={setShowCreateNew}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
              <ChevronDown className={`h-3 w-3 transition-transform ${showCreateNew ? 'rotate-180' : ''}`} />
              <Plus className="h-3 w-3" />
              {t('appointments.createNewStaff')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('appointments.staffName')}</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder={t('appointments.staffNamePlaceholder')}
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('appointments.selectRole')}</Label>
                <Select value={newStaffRole} onValueChange={(v) => setNewStaffRole(v as StaffRole)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('appointments.selectRole')} />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map(r => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {t(`surgery.staff.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('appointments.selectUnit')}</Label>
                <Select value={newStaffUnitId} onValueChange={setNewStaffUnitId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t('appointments.selectUnit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUnits.map(u => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="w-full h-8 text-xs"
                disabled={!newStaffName.trim() || !newStaffRole || !newStaffUnitId || isCreating}
                onClick={handleCreateNew}
              >
                {isCreating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {t('appointments.createNewStaff')}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </PopoverContent>
    </Popover>
  );
}
