import { useQuery, useMutation } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  Users, 
  UserCog,
  Stethoscope,
  Syringe,
  HeartPulse,
  User,
  Plus,
  Check,
  X,
  Calendar,
  Clock
} from 'lucide-react';
import type { DailyStaffPool } from '@shared/schema';

type StaffRole = 
  | "surgeon"
  | "surgicalAssistant"
  | "instrumentNurse"
  | "circulatingNurse"
  | "anesthesiologist"
  | "anesthesiaNurse"
  | "pacuNurse";

interface StaffPoolEntry extends DailyStaffPool {
  assignedSurgeryIds: string[];
  isBooked: boolean;
}

const ROLE_ICONS: Record<StaffRole, typeof User> = {
  surgeon: UserCog,
  surgicalAssistant: Users,
  instrumentNurse: Syringe,
  circulatingNurse: HeartPulse,
  anesthesiologist: Stethoscope,
  anesthesiaNurse: User,
  pacuNurse: User,
};

const ROLE_COLORS: Record<StaffRole, string> = {
  surgeon: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  surgicalAssistant: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  instrumentNurse: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  circulatingNurse: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  anesthesiologist: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  anesthesiaNurse: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  pacuNurse: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const ROLE_LABELS: Record<StaffRole, string> = {
  surgeon: 'Surgeon',
  surgicalAssistant: 'Surgical Assistant',
  instrumentNurse: 'Scrub Nurse',
  circulatingNurse: 'Circulating Nurse',
  anesthesiologist: 'Anesthesiologist',
  anesthesiaNurse: 'Anesthesia Nurse',
  pacuNurse: 'PACU Nurse',
};

interface StaffAssignmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgeryId: string;
  surgeryTitle: string;
  patientName: string;
  surgeryTime: string;
  hospitalId: string;
  selectedDate: Date;
}

export default function StaffAssignmentSheet({
  open,
  onOpenChange,
  surgeryId,
  surgeryTitle,
  patientName,
  surgeryTime,
  hospitalId,
  selectedDate,
}: StaffAssignmentSheetProps) {
  const { toast } = useToast();
  
  const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  
  const { data: staffPool = [] } = useQuery<StaffPoolEntry[]>({
    queryKey: ['/api/staff-pool', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-pool/${hospitalId}/${dateString}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId && open,
  });

  const { data: assignedStaff = [] } = useQuery<any[]>({
    queryKey: ['/api/planned-staff', surgeryId],
    queryFn: async () => {
      const res = await fetch(`/api/planned-staff?surgeryId=${surgeryId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!surgeryId && open,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ dailyStaffPoolId }: { dailyStaffPoolId: string }) => {
      const res = await apiRequest('POST', '/api/planned-staff', {
        surgeryId,
        dailyStaffPoolId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', hospitalId, dateString] });
      queryClient.invalidateQueries({ queryKey: ['/api/planned-staff', surgeryId] });
      toast({
        title: "Staff Assigned",
        description: "Staff member has been assigned to this surgery.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Assignment Failed",
        description: error?.message || "Failed to assign staff",
        variant: "destructive",
      });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async ({ plannedStaffId }: { plannedStaffId: string }) => {
      await apiRequest('DELETE', `/api/planned-staff/${plannedStaffId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', hospitalId, dateString] });
      queryClient.invalidateQueries({ queryKey: ['/api/planned-staff', surgeryId] });
      toast({
        title: "Staff Removed",
        description: "Staff member has been removed from this surgery.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Removal Failed",
        description: error?.message || "Failed to remove staff",
        variant: "destructive",
      });
    },
  });

  const assignedStaffPoolIds = new Set(assignedStaff.map((a: any) => a.dailyStaffPoolId));
  const availableStaff = staffPool.filter(s => !assignedStaffPoolIds.has(s.id));

  const groupedAvailable = availableStaff.reduce((acc, staff) => {
    const role = staff.role as StaffRole;
    if (!acc[role]) acc[role] = [];
    acc[role].push(staff);
    return acc;
  }, {} as Record<StaffRole, StaffPoolEntry[]>);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-left">Assign Staff</SheetTitle>
          <div className="text-sm text-muted-foreground text-left">
            <div className="font-medium text-foreground">{surgeryTitle}</div>
            <div>{patientName}</div>
            <div className="flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              {surgeryTime}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100%-6rem)]">
          {assignedStaff.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Assigned ({assignedStaff.length})
              </h4>
              <div className="space-y-2">
                {assignedStaff.map((assigned: any) => {
                  const staffMember = staffPool.find(s => s.id === assigned.dailyStaffPoolId);
                  if (!staffMember) return null;
                  const Icon = ROLE_ICONS[staffMember.role as StaffRole] || User;
                  const colorClass = ROLE_COLORS[staffMember.role as StaffRole] || '';
                  
                  return (
                    <div 
                      key={assigned.id}
                      className={`flex items-center justify-between p-2 rounded-lg ${colorClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{staffMember.displayName}</span>
                        <span className="text-xs opacity-70">
                          {ROLE_LABELS[staffMember.role as StaffRole]}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unassignMutation.mutate({ plannedStaffId: assigned.id })}
                        disabled={unassignMutation.isPending}
                        className="h-7 w-7 p-0 hover:bg-destructive/20"
                        data-testid={`button-unassign-${assigned.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Separator className="my-3" />

          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Available Staff
            </h4>
            
            {Object.entries(groupedAvailable).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No available staff in today's pool
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedAvailable).map(([role, staff]) => (
                  <div key={role}>
                    <div className="text-xs text-muted-foreground mb-1.5">
                      {ROLE_LABELS[role as StaffRole]}
                    </div>
                    <div className="space-y-1.5">
                      {staff.map((s) => {
                        const Icon = ROLE_ICONS[s.role as StaffRole] || User;
                        const colorClass = ROLE_COLORS[s.role as StaffRole] || '';
                        
                        return (
                          <button
                            key={s.id}
                            onClick={() => assignMutation.mutate({ dailyStaffPoolId: s.id })}
                            disabled={assignMutation.isPending}
                            className={`w-full flex items-center justify-between p-2 rounded-lg ${colorClass} hover:opacity-90 transition-opacity`}
                            data-testid={`button-assign-${s.id}`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="text-sm font-medium">{s.displayName}</span>
                            </div>
                            <Plus className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
