import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
  GripVertical,
  Filter,
  AlertTriangle,
  Repeat
} from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import StaffRecurrenceDialog from './StaffRecurrenceDialog';
import StaffManagementDialog from './StaffManagementDialog';
import type { ShiftType, StaffShift } from '@shared/schema';

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
  isOpen?: boolean;
  onToggle?: () => void;
  isAdmin?: boolean;
}

export interface StaffPoolEntry {
  id: string;
  name: string;
  role: StaffRole;
  userId?: string | null;
  ruleId?: string | null;
  assignedSurgeryIds: string[];
  assignedRooms: Array<{ roomId: string; roomName: string }>;
  isBooked: boolean;
  canLogin?: boolean | null;
  email?: string | null;
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

interface StaffAvailability {
  busyMinutes: number;
  busyPercentage: number;
  status: 'available' | 'warning' | 'busy' | 'absent';
  absenceType?: string;
  appointments?: Array<{ startTime: string; endTime: string; status: string }>;
  timeOffBlocks?: Array<{ startTime: string; endTime: string; reason: string }>;
}

function DraggableStaffChip({ staff, onRemove, availability, onClick, readOnly, shiftType }: { staff: StaffPoolEntry; onRemove: (id: string) => void; availability?: StaffAvailability; onClick?: (staff: StaffPoolEntry) => void; readOnly?: boolean; shiftType?: ShiftType | null }) {
  const { t } = useTranslation();
  const config = ROLE_CONFIG[staff.role as StaffRole];
  const Icon = config?.icon || User;
  const hasRoomAssignments = staff.assignedRooms && staff.assignedRooms.length > 0;
  const hasSurgeryAssignments = staff.assignedSurgeryIds && staff.assignedSurgeryIds.length > 0;
  const hasClinicAppointments = (availability?.appointments && availability.appointments.length > 0) || (availability?.timeOffBlocks && availability.timeOffBlocks.length > 0);

  const wasDraggingRef = useRef(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: {
      type: 'staff',
      staff,
    },
    disabled: readOnly,
  });

  // Track drag state so we can suppress click after a drag ends
  useEffect(() => {
    if (isDragging) {
      wasDraggingRef.current = true;
    }
  }, [isDragging]);

  const handleClick = useCallback(() => {
    // After a drag ends, isDragging flips false and then click fires — suppress it
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    onClick?.(staff);
  }, [onClick, staff]);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: readOnly ? 'default' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        config?.bgClass || 'bg-gray-100 dark:bg-gray-800'
      } border ${isDragging ? 'ring-2 ring-primary shadow-lg' : ''} ${readOnly ? '' : 'touch-none'}`}
      data-testid={`planned-staff-chip-${staff.id}`}
      {...(readOnly ? {} : { ...attributes, ...listeners })}
      onClick={onClick ? handleClick : undefined}
    >
      {!readOnly && <GripVertical className="h-3 w-3 text-muted-foreground" />}
      {staff.ruleId && <Repeat className="h-3 w-3 text-muted-foreground" />}
      <Icon className={`h-3 w-3 ${config?.colorClass}`} />
      <span className="font-medium">
        {staff.name}
      </span>
      {shiftType && (
        <span
          className="text-[9px] px-1 py-0.5 rounded text-white font-semibold"
          style={{ backgroundColor: shiftType.color }}
          title={`${shiftType.name} ${shiftType.startTime}–${shiftType.endTime}`}
        >
          {shiftType.code}
        </span>
      )}
      {hasClinicAppointments && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-0.5 text-yellow-500 hover:text-yellow-600"
              title={t('staffPool.hasClinicAppointments')}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="bottom">
            {availability?.appointments && availability.appointments.length > 0 && (
              <>
                <div className="text-xs font-medium mb-1">{t('staffPool.clinicAppointments')}</div>
                <div className="space-y-0.5 mb-1.5">
                  {availability.appointments.map((apt, i) => (
                    <div key={i} className="text-xs text-blue-600 dark:text-blue-400">
                      {apt.startTime}–{apt.endTime}
                    </div>
                  ))}
                </div>
              </>
            )}
            {availability?.timeOffBlocks && availability.timeOffBlocks.length > 0 && (
              <>
                <div className="text-xs font-medium mb-1">{t('staffPool.timeOff')}</div>
                <div className="space-y-0.5">
                  {availability.timeOffBlocks.map((block, i) => (
                    <div key={i} className="text-xs text-orange-600 dark:text-orange-400">
                      {block.startTime}–{block.endTime}
                    </div>
                  ))}
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
      )}
      {hasRoomAssignments && (
        <div className="flex gap-0.5">
          {staff.assignedRooms.map((room) => (
            <span 
              key={room.roomId}
              className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-semibold"
              title={room.roomName}
              data-testid={`room-badge-${staff.id}-${room.roomId}`}
            >
              {room.roomName}
            </span>
          ))}
        </div>
      )}
      {hasSurgeryAssignments && !hasRoomAssignments && (
        <span className="text-[10px]">({staff.assignedSurgeryIds.length})</span>
      )}
      {!hasRoomAssignments && !readOnly && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(staff.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="ml-0.5 p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
          data-testid={`button-remove-planned-staff-${staff.id}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

const STAFF_FILTER_KEY = 'oplist_staff_filter_unassigned';

export default function PlannedStaffBox({ selectedDate, hospitalId, isOpen, onToggle, isAdmin }: PlannedStaffBoxProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [recurrenceDialogStaff, setRecurrenceDialogStaff] = useState<StaffPoolEntry | null>(null);
  const [managementDialogStaff, setManagementDialogStaff] = useState<StaffPoolEntry | null>(null);

  const handleStaffClick = useCallback((staff: StaffPoolEntry) => {
    if (staff.userId) {
      setManagementDialogStaff(staff);
    } else {
      setRecurrenceDialogStaff(staff);
    }
  }, []);

  const [showUnassignedOnly, setShowUnassignedOnly] = useState(() => {
    const saved = sessionStorage.getItem(STAFF_FILTER_KEY);
    return saved === 'true';
  });
  
  useEffect(() => {
    sessionStorage.setItem(STAFF_FILTER_KEY, String(showUnassignedOnly));
  }, [showUnassignedOnly]);
  
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

  // Fetch shift types and staff shifts for the selected date
  const { data: shiftTypes = [] } = useQuery<ShiftType[]>({
    queryKey: ['shift-types', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/shift-types/${hospitalId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: staffShiftsForDay = [] } = useQuery<StaffShift[]>({
    queryKey: ['staff-shifts', hospitalId, dateString, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-shifts/${hospitalId}?from=${dateString}&to=${dateString}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const shiftTypeById = useMemo(() => {
    const map = new Map<string, ShiftType>();
    for (const t of shiftTypes) map.set(t.id, t);
    return map;
  }, [shiftTypes]);

  const shiftByUserId = useMemo(() => {
    const map = new Map<string, StaffShift>();
    for (const s of staffShiftsForDay) map.set(s.userId, s);
    return map;
  }, [staffShiftsForDay]);

  // Fetch clinic appointment availability for staff with userIds
  const staffUserIds = useMemo(() => {
    return staffPool.filter(s => s.userId).map(s => s.userId!).join(',');
  }, [staffPool]);

  const { data: staffAvailability = {} } = useQuery<Record<string, StaffAvailability>>({
    queryKey: ['/api/clinic/staff-availability', hospitalId, dateString, staffUserIds],
    queryFn: async () => {
      if (!staffUserIds) return {};
      const res = await fetch(`/api/clinic/${hospitalId}/staff-availability?date=${dateString}&staffIds=${staffUserIds}`, {
        credentials: 'include',
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!hospitalId && staffPool.length > 0 && !!staffUserIds,
    staleTime: 30000,
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
  
  const filteredStaffPool = showUnassignedOnly 
    ? staffPool.filter(s => !s.isBooked) 
    : staffPool;
  
  const staffContent = (
    <div className="p-3 border border-t-0 rounded-b-lg bg-background">
      {bookedCount > 0 && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <Label
            htmlFor="unassigned-filter"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            {t('staffPool.showUnassignedOnly', 'Show unassigned only')}
          </Label>
          <Switch
            id="unassigned-filter"
            checked={showUnassignedOnly}
            onCheckedChange={setShowUnassignedOnly}
            className="scale-75"
            data-testid="switch-unassigned-filter"
          />
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
        </div>
      ) : filteredStaffPool.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">
          {showUnassignedOnly
            ? t('staffPool.noUnassignedStaff', 'All staff are assigned to rooms')
            : t('staffPool.noStaff', 'No staff in pool')}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filteredStaffPool.map((staff) => (
            <DraggableStaffChip
              key={staff.id}
              staff={staff}
              onRemove={handleRemoveStaff}
              availability={staffAvailability[staff.userId || '']}
              onClick={isAdmin ? handleStaffClick : undefined}
              readOnly={!isAdmin}
              shiftType={staff.userId ? (shiftTypeById.get(shiftByUserId.get(staff.userId)?.shiftTypeId ?? '') ?? null) : null}
            />
          ))}
        </div>
      )}
      {!isLoading && availableCount > 0 && !showUnassignedOnly && (
        <p className="text-xs text-muted-foreground mt-2">
          {t('staffPool.dragHint', 'Drag staff onto room headers to assign')}
        </p>
      )}
    </div>
  );

  const dialogs = (
    <>
      {recurrenceDialogStaff && (
        <StaffRecurrenceDialog
          open={!!recurrenceDialogStaff}
          onOpenChange={(open) => { if (!open) setRecurrenceDialogStaff(null); }}
          staff={recurrenceDialogStaff}
          hospitalId={hospitalId}
          selectedDate={selectedDate}
        />
      )}
      {managementDialogStaff && (
        <StaffManagementDialog
          open={!!managementDialogStaff}
          onOpenChange={(open) => { if (!open) setManagementDialogStaff(null); }}
          staff={managementDialogStaff}
          hospitalId={hospitalId}
          selectedDate={selectedDate}
        />
      )}
    </>
  );

  return (
    <>
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
        {staffContent}
      </CollapsibleContent>
    </Collapsible>
    {dialogs}
    </>
  );
}
