import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { 
  Users, 
  ChevronDown, 
  ChevronUp,
  UserCog,
  Stethoscope,
  Syringe,
  HeartPulse,
  User
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
  surgeon: 'bg-blue-500',
  surgicalAssistant: 'bg-indigo-500',
  instrumentNurse: 'bg-purple-500',
  circulatingNurse: 'bg-pink-500',
  anesthesiologist: 'bg-green-500',
  anesthesiaNurse: 'bg-teal-500',
  pacuNurse: 'bg-orange-500',
};

interface MobileStaffStripProps {
  selectedDate: Date;
  hospitalId: string;
  onStaffSelect?: (staff: StaffPoolEntry) => void;
  selectedStaffId?: string | null;
}

export default function MobileStaffStrip({ 
  selectedDate, 
  hospitalId,
  onStaffSelect,
  selectedStaffId
}: MobileStaffStripProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const dateString = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
  
  const { data: staffPool = [] } = useQuery<StaffPoolEntry[]>({
    queryKey: ['/api/staff-pool', hospitalId, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/staff-pool/${hospitalId}/${dateString}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const availableStaff = staffPool.filter(s => !s.isBooked);
  
  if (staffPool.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border-b md:hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Staff Pool</span>
          <Badge variant="secondary" className="text-xs">
            {availableStaff.length} available
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 w-7 p-0"
          data-testid="button-toggle-staff-strip"
        >
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>
      
      {isExpanded && (
        <ScrollArea className="w-full">
          <div className="flex gap-2 px-3 pb-3">
            {staffPool.map((staff) => {
              const Icon = ROLE_ICONS[staff.role as StaffRole] || User;
              const colorClass = ROLE_COLORS[staff.role as StaffRole] || 'bg-gray-500';
              const isSelected = selectedStaffId === staff.id;
              const isAvailable = !staff.isBooked;
              
              return (
                <button
                  key={staff.id}
                  onClick={() => onStaffSelect?.(staff)}
                  disabled={!isAvailable}
                  className={`
                    flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium whitespace-nowrap
                    transition-all
                    ${isAvailable 
                      ? `${colorClass} text-white hover:opacity-90` 
                      : 'bg-muted text-muted-foreground opacity-50'
                    }
                    ${isSelected ? 'ring-2 ring-offset-2 ring-primary' : ''}
                  `}
                  data-testid={`staff-chip-${staff.id}`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{staff.displayName}</span>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
