import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronUp, 
  X, 
  User, 
  UserCog, 
  Stethoscope, 
  Syringe, 
  HeartPulse, 
  Users, 
  BedDouble,
  GripVertical
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

type StaffRole = 
  | "surgeon"
  | "surgicalAssistant"
  | "instrumentNurse"
  | "circulatingNurse"
  | "anesthesiologist"
  | "anesthesiaNurse"
  | "pacuNurse";

interface PlannedStaffBoxProps {
  selectedDate: Date;
  hospitalId: string;
  isOpen: boolean;
  onToggle: () => void;
}

export interface StaffPoolEntry {
  id: string;
  name: string;
  role: StaffRole;
  userId?: string | null;
  assignedSurgeryIds: string[];
  isBooked: boolean;
}

export const ROLE_CONFIG: Record<StaffRole, { icon: typeof User; labelKey: string; colorClass: string; bgClass: string }> = {
  surgeon: { icon: UserCog, labelKey: 'surgery.staff.surgeon', colorClass: 'text-blue-700 dark:text-blue-300', bgClass: 'bg-blue-100 dark:bg-blue-900' },
  surgicalAssistant: { icon: Users, labelKey: 'surgery.staff.surgicalAssistant', colorClass: 'text-indigo-700 dark:text-indigo-300', bgClass: 'bg-indigo-100 dark:bg-indigo-900' },
  instrumentNurse: { icon: Syringe, labelKey: 'surgery.staff.instrumentNurse', colorClass: 'text-purple-700 dark:text-purple-300', bgClass: 'bg-purple-100 dark:bg-purple-900' },
  circulatingNurse: { icon: HeartPulse, labelKey: 'surgery.staff.circulatingNurse', colorClass: 'text-pink-700 dark:text-pink-300', bgClass: 'bg-pink-100 dark:bg-pink-900' },
  anesthesiologist: { icon: Stethoscope, labelKey: 'surgery.staff.anesthesiologist', colorClass: 'text-green-700 dark:text-green-300', bgClass: 'bg-green-100 dark:bg-green-900' },
  anesthesiaNurse: { icon: User, labelKey: 'surgery.staff.anesthesiaNurse', colorClass: 'text-teal-700 dark:text-teal-300', bgClass: 'bg-teal-100 dark:bg-teal-900' },
  pacuNurse: { icon: BedDouble, labelKey: 'surgery.staff.pacuNurse', colorClass: 'text-orange-700 dark:text-orange-300', bgClass: 'bg-orange-100 dark:bg-orange-900' },
};

function DraggableStaffChip({ staff, onRemove }: { staff: StaffPoolEntry; onRemove: (id: string) => void }) {
  const config = ROLE_CONFIG[staff.role as StaffRole];
  const Icon = config?.icon || User;
  
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: {
      type: 'staff',
      staff,
    },
    disabled: staff.isBooked,
  });
  
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: staff.isBooked ? 'not-allowed' : 'grab',
  };
  
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        staff.isBooked 
          ? 'bg-muted text-muted-foreground border border-dashed' 
          : `${config?.bgClass || 'bg-gray-100 dark:bg-gray-800'} border`
      } ${isDragging ? 'ring-2 ring-primary shadow-lg' : ''} ${!staff.isBooked ? 'touch-none' : ''}`}
      data-testid={`planned-staff-chip-${staff.id}`}
      {...(staff.isBooked ? {} : { ...attributes, ...listeners })}
    >
      {!staff.isBooked && (
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      )}
      <Icon className={`h-3 w-3 ${staff.isBooked ? 'text-muted-foreground' : config?.colorClass}`} />
      <span className={staff.isBooked ? 'line-through' : 'font-medium'}>
        {staff.name}
      </span>
      {staff.isBooked && (
        <span className="text-[10px]">({staff.assignedSurgeryIds.length})</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(staff.id);
        }}
        className="ml-0.5 p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
        data-testid={`button-remove-planned-staff-${staff.id}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function PlannedStaffBox({ selectedDate, hospitalId, isOpen, onToggle }: PlannedStaffBoxProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
  
  const handleRemoveStaff = (id: string) => {
    removeFromPoolMutation.mutate(id);
  };
  
  if (staffPool.length === 0 && !isLoading) {
    return null;
  }
  
  const availableCount = staffPool.filter(s => !s.isBooked).length;
  const bookedCount = staffPool.filter(s => s.isBooked).length;
  
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle} className="mx-4 mt-2">
      <CollapsibleTrigger asChild>
        <div 
          className="flex items-center justify-between p-2 px-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted/70 transition-colors border"
          data-testid="planned-staff-box-trigger"
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('staffPool.plannedStaff', 'Planned Staff')}
            </span>
            <Badge variant="secondary" className="text-xs">
              {staffPool.length}
            </Badge>
            {availableCount > 0 && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {availableCount} {t('staffPool.available', 'available')}
              </span>
            )}
            {bookedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                | {bookedCount} {t('staffPool.assigned', 'assigned')}
              </span>
            )}
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="p-3 border border-t-0 rounded-b-lg bg-background">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {staffPool.map((staff) => (
                <DraggableStaffChip 
                  key={staff.id} 
                  staff={staff} 
                  onRemove={handleRemoveStaff}
                />
              ))}
            </div>
          )}
          {!isLoading && availableCount > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {t('staffPool.dragHint', 'Drag staff onto surgeries to assign')}
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
