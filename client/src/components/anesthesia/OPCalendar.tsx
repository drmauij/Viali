import { useState, useMemo, useCallback, useEffect } from "react";
import { Calendar, momentLocalizer, View, SlotInfo, CalendarProps, EventProps, EventPropGetter } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDroppable } from "@dnd-kit/core";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Users, User, X, Download } from "lucide-react";
import { format } from "date-fns";
import { de, enGB } from "date-fns/locale";
import { generateDayPlanPdf, defaultColumns, DayPlanPdfColumn, RoomStaffInfo } from "@/lib/dayPlanPdf";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuickCreateSurgeryDialog from "./QuickCreateSurgeryDialog";
import TimelineWeekView from "./TimelineWeekView";
import PlanStaffDialog from "./PlanStaffDialog";
import PlannedStaffBox, { StaffPoolEntry, ROLE_CONFIG } from "./PlannedStaffBox";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const CALENDAR_VIEW_KEY = "oplist_calendar_view";
const CALENDAR_DATE_KEY = "oplist_calendar_date";

// Define CalendarEvent and CalendarResource types
interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: string;
  surgeryId: string;
  patientId: string;
  plannedSurgery: string;
  patientName: string;
  patientBirthday: string;
  isCancelled: boolean;
  pacuBedName?: string | null;
  timeMarkers?: Array<{
    id: string;
    code: string;
    label: string;
    time: number | null;
  }> | null;
}

type CalendarResource = {
  id: string;
  title: string;
};

// Helper to get moment locale from i18n language
function getMomentLocale(lang: string): string {
  return lang.startsWith('de') ? 'de' : 'en-gb';
}

// Explicitly type DragAndDropCalendar with CalendarEvent and CalendarResource
const DragAndDropCalendar = withDragAndDrop<CalendarEvent, CalendarResource>(
  Calendar as React.ComponentType<CalendarProps<CalendarEvent, CalendarResource>>
);

// Custom formats for European date/time display
const formats = {
  timeGutterFormat: 'HH:mm',
  eventTimeRangeFormat: () => '', // Hide time from events
  selectRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`,
  agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${moment(start).format('HH:mm')} - ${moment(end).format('HH:mm')}`,
  dayHeaderFormat: 'dddd DD/MM/YYYY',
  dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${moment(start).format('DD/MM/YYYY')} - ${moment(end).format('DD/MM/YYYY')}`,
  agendaDateFormat: 'DD/MM/YYYY',
  agendaHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
    `${moment(start).format('DD/MM/YYYY')} - ${moment(end).format('DD/MM/YYYY')}`,
};

type ViewType = "day" | "week" | "month";

interface OPCalendarProps {
  onEventClick?: (surgeryId: string, patientId: string) => void;
}

interface RoomStaffAssignment {
  id: string;
  surgeryRoomId: string;
  dailyStaffPoolId: string;
  date: string;
  name: string;
  role: string;
}

function DroppableRoomHeader({ 
  resource, 
  label, 
  roomStaff,
  onRemoveStaff,
  dropStaffText
}: { 
  resource: CalendarResource; 
  label: string;
  roomStaff: RoomStaffAssignment[];
  onRemoveStaff: (assignmentId: string) => void;
  dropStaffText: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `room-${resource.id}`,
    data: {
      type: 'room',
      roomId: resource.id,
      roomName: resource.title,
    },
  });
  
  const assignedStaff = roomStaff.filter(s => s.surgeryRoomId === resource.id);
  
  return (
    <div 
      ref={setNodeRef} 
      className={`h-full w-full transition-colors ${
        isOver 
          ? 'bg-primary/20 ring-2 ring-primary ring-inset rounded' 
          : 'hover:bg-muted/30'
      }`}
      data-testid={`room-header-${resource.id}`}
    >
      <div className="font-semibold text-sm p-2 pb-1">{label}</div>
      <div className={`min-h-[28px] px-2 pb-1 border-t border-border/30 ${assignedStaff.length > 0 ? 'bg-muted/20' : ''}`}>
        {assignedStaff.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {assignedStaff.map((staff) => {
              const config = ROLE_CONFIG[staff.role as keyof typeof ROLE_CONFIG];
              const Icon = config?.icon || User;
              return (
                <span 
                  key={staff.id}
                  className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${config?.bgClass || 'bg-gray-100'} ${config?.colorClass || ''} group`}
                  title={`${staff.name} - Click to remove`}
                  data-testid={`room-staff-chip-${staff.id}`}
                >
                  <Icon className="h-2.5 w-2.5" />
                  <span className="max-w-[60px] truncate">{staff.name.split(' ')[0]}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveStaff(staff.id);
                    }}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-destructive/20 text-current hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                    data-testid={`button-remove-room-staff-${staff.id}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground pt-1 italic">
            {dropStaffText}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
  const { t, i18n } = useTranslation();
  
  // Set moment locale based on i18n language and create localizer
  const momentLocale = getMomentLocale(i18n.language);
  moment.locale(momentLocale);
  const localizer = useMemo(() => momentLocalizer(moment), [momentLocale]);
  
  // Restore calendar view and date from sessionStorage
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = sessionStorage.getItem(CALENDAR_VIEW_KEY);
    return (saved as ViewType) || "day";
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem(CALENDAR_DATE_KEY);
    return saved ? new Date(saved) : new Date();
  });
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  
  // Active drag state for overlay
  const [activeDragStaff, setActiveDragStaff] = useState<StaffPoolEntry | null>(null);

  // Save calendar view and date to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem(CALENDAR_VIEW_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    sessionStorage.setItem(CALENDAR_DATE_KEY, selectedDate.toISOString());
  }, [selectedDate]);
  
  // Quick create dialog state
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateData, setQuickCreateData] = useState<{
    date: Date;
    endDate?: Date;
    roomId?: string;
  } | null>(null);
  
  // Plan Staff dialog state
  const [planStaffDialogOpen, setPlanStaffDialogOpen] = useState(false);
  
  // Planned staff box collapsed state
  const [staffBoxOpen, setStaffBoxOpen] = useState(() => {
    const saved = sessionStorage.getItem('oplist_staff_box_open');
    return saved ? saved === 'true' : true;
  });
  
  // Save staff box state
  useEffect(() => {
    sessionStorage.setItem('oplist_staff_box_open', String(staffBoxOpen));
  }, [staffBoxOpen]);
  
  // Date string for staff pool queries
  const dateString = useMemo(() => {
    const d = new Date(selectedDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [selectedDate]);

  // Fetch surgery rooms for the active hospital (only OP type rooms for calendar)
  const { data: allSurgeryRooms = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
  
  // Filter to only show OP rooms in the calendar (PACU rooms are for post-op tracking)
  const surgeryRooms = useMemo(() => {
    return allSurgeryRooms.filter((room: any) => !room.type || room.type === 'OP');
  }, [allSurgeryRooms]);

  // Calculate date range based on current view
  const dateRange = useMemo(() => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);
    
    if (currentView === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (currentView === "week") {
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  }, [selectedDate, currentView]);

  // Fetch surgeries for the date range with background polling every 30 seconds
  const { data: surgeries = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/surgeries`, activeHospital?.id, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        hospitalId: activeHospital?.id || '',
        dateFrom: dateRange.start.toISOString(),
        dateTo: dateRange.end.toISOString(),
      });
      const response = await fetch(`/api/anesthesia/surgeries?${params}`);
      if (!response.ok) throw new Error('Failed to fetch surgeries');
      return response.json();
    },
    enabled: !!activeHospital?.id,
    refetchInterval: 30000, // Poll every 30 seconds for updates
  });

  // Fetch patients for surgeries
  const patientIds = useMemo(() => 
    Array.from(new Set(surgeries.map((s: any) => s.patientId))),
    [surgeries]
  );

  const { data: allPatients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id && patientIds.length > 0,
  });

  // Fetch room staff assignments for the selected date
  const { data: roomStaff = [] } = useQuery<RoomStaffAssignment[]>({
    queryKey: ['/api/room-staff/all', activeHospital?.id, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/room-staff/all/${activeHospital?.id}/${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch room staff');
      return res.json();
    },
    enabled: !!activeHospital?.id,
  });

  // Get surgery IDs for pre-op assessment fetch
  const surgeryIds = useMemo(() => surgeries.map((s: any) => s.id), [surgeries]);

  // Fetch pre-op assessments for surgeries (for PDF generation)
  const { data: preOpAssessments = [] } = useQuery<any[]>({
    queryKey: ["/api/anesthesia/preop-assessments/bulk", surgeryIds],
    queryFn: async () => {
      if (surgeryIds.length === 0) return [];
      const response = await fetch(`/api/anesthesia/preop-assessments/bulk?surgeryIds=${surgeryIds.join(",")}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: surgeryIds.length > 0,
  });

  // Map pre-op assessments by surgery ID
  const preOpMap = useMemo(() => {
    const map = new Map<string, any>();
    preOpAssessments.forEach((item) => {
      if (item.surgeryId) {
        map.set(item.surgeryId, { assessment: item, status: item.status });
      }
    });
    return map;
  }, [preOpAssessments]);

  // Transform surgeries into calendar events
  // Uses actual O1 (Surgical Incision) time as start and O2-O1 for duration when available
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return surgeries.map((surgery: any) => {
      const patient = allPatients.find((p: any) => p.id === surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "Unknown Patient";
      const patientBirthday = patient?.birthday 
        ? new Date(patient.birthday).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : "";
      
      const plannedDate = new Date(surgery.plannedDate);
      
      // Check for O1 (Surgical Incision) and O2 (Surgical Suture) times from anesthesia record
      const timeMarkers = surgery.timeMarkers || [];
      const o1Marker = timeMarkers.find((m: any) => m.code === 'O1' && m.time !== null);
      const o2Marker = timeMarkers.find((m: any) => m.code === 'O2' && m.time !== null);
      
      // Safely parse marker time (handles both ISO strings and timestamps)
      const parseMarkerTime = (time: any): Date | null => {
        if (!time) return null;
        const parsed = new Date(time);
        return isNaN(parsed.getTime()) ? null : parsed;
      };
      
      const o1Time = o1Marker ? parseMarkerTime(o1Marker.time) : null;
      const o2Time = o2Marker ? parseMarkerTime(o2Marker.time) : null;
      
      // Use O1 time as start if available, otherwise use planned date
      let displayStart = plannedDate;
      if (o1Time) {
        displayStart = o1Time;
      }
      
      // Calculate end time:
      // 1. If O1 and O2 both exist: use O2 as end time (actual surgery duration)
      // 2. If only O1 exists: use O1 + planned duration (surgery started but not finished)
      // 3. Otherwise: use planned date + planned duration (or actualEndTime if available)
      let displayEnd: Date;
      const plannedDurationMs = surgery.duration 
        ? surgery.duration * 60 * 1000 
        : 3 * 60 * 60 * 1000; // Default 3 hours
      
      if (o1Time && o2Time) {
        // Both O1 and O2 available - use actual surgery end
        displayEnd = o2Time;
      } else if (o1Time) {
        // Only O1 available - use planned duration from O1 start
        // (surgery has started but not yet finished, show expected end based on plan)
        displayEnd = new Date(displayStart.getTime() + plannedDurationMs);
      } else {
        // No O1 - use original logic with planned date
        displayEnd = surgery.actualEndTime 
          ? new Date(surgery.actualEndTime)
          : new Date(plannedDate.getTime() + plannedDurationMs);
      }
      
      const isCancelled = surgery.status === "cancelled";
      const title = `${surgery.plannedSurgery || 'No surgery specified'} - ${patientName}`;
      
      const pacuBedRoom = surgery.pacuBedId ? allSurgeryRooms.find((r: any) => r.id === surgery.pacuBedId) : null;
      
      return {
        id: surgery.id,
        title,
        start: displayStart,
        end: displayEnd,
        resource: surgery.surgeryRoomId || (surgeryRooms[0]?.id || "unassigned"),
        surgeryId: surgery.id,
        patientId: surgery.patientId,
        plannedSurgery: surgery.plannedSurgery || 'No surgery specified',
        patientName,
        patientBirthday,
        isCancelled,
        pacuBedName: pacuBedRoom?.name || null,
        timeMarkers: surgery.timeMarkers || null,
      };
    });
  }, [surgeries, allPatients, surgeryRooms, allSurgeryRooms]);

  // Convert surgery rooms to resources
  const resources = useMemo(() => {
    return surgeryRooms.map((room: any) => ({
      id: room.id,
      title: room.name,
    }));
  }, [surgeryRooms]);

  // Build roomMap for PDF generation
  const roomMap = useMemo(() => {
    const map = new Map<string, string>();
    surgeryRooms.forEach((room: any) => {
      map.set(room.id, room.name);
    });
    return map;
  }, [surgeryRooms]);

  // Build patientMap for PDF generation
  const patientMap = useMemo(() => {
    const map = new Map<string, any>();
    allPatients.forEach((patient: any) => {
      map.set(patient.id, patient);
    });
    return map;
  }, [allPatients]);

  // Helper function to format pre-op summary for PDF
  const formatPreOpSummaryForPdf = useCallback((surgeryId: string): string => {
    const preOpData = preOpMap.get(surgeryId);
    if (!preOpData || !preOpData.assessment) return '-';
    
    const assessment = preOpData.assessment;
    const parts: string[] = [];
    
    // ASA classification
    if (assessment.asa != null && assessment.asa !== '') {
      parts.push(`ASA ${assessment.asa}`);
    }
    
    // Weight and height
    if (assessment.weight != null && assessment.weight !== '' && assessment.weight !== 0) {
      parts.push(`${assessment.weight}kg`);
    }
    if (assessment.height != null && assessment.height !== '' && assessment.height !== 0) {
      parts.push(`${assessment.height}cm`);
    }
    
    // Anesthesia techniques
    if (assessment.anesthesiaTechniques) {
      const techniques: string[] = [];
      const at = assessment.anesthesiaTechniques;
      
      if (at.general) {
        const generalSubs = at.generalOptions ? Object.entries(at.generalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.toUpperCase())
          : [];
        techniques.push(generalSubs.length > 0 ? `ITN (${generalSubs.join(', ')})` : 'ITN');
      }
      if (at.spinal) techniques.push('SPA');
      if (at.epidural) techniques.push('PDA');
      if (at.regional) {
        const regionalSubs = at.regionalOptions ? Object.entries(at.regionalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
          : [];
        techniques.push(regionalSubs.length > 0 ? `Regional (${regionalSubs.join(', ')})` : 'Regional');
      }
      if (at.sedation) techniques.push('Sedierung');
      if (at.combined) techniques.push('Kombiniert');
      
      if (techniques.length > 0) {
        parts.push(techniques.join(', '));
      }
    }
    
    // Installations (airway management)
    if (assessment.installations && Object.keys(assessment.installations).length > 0) {
      const installations = Object.entries(assessment.installations)
        .filter(([_, value]) => value)
        .map(([key]) => {
          if (key === 'ett') return 'ETT';
          if (key === 'lma') return 'LMA';
          if (key === 'mask') return 'Maske';
          return key.replace(/([A-Z])/g, ' $1').trim();
        })
        .join(', ');
      if (installations) {
        parts.push(installations);
      }
    }
    
    // Post-op ICU
    if (assessment.postOpICU) {
      parts.push('IMC geplant');
    }
    
    // CAVE (important warnings)
    if (assessment.cave != null && assessment.cave !== '') {
      parts.push(`CAVE: ${assessment.cave}`);
    }
    
    return parts.length > 0 ? parts.join('\n') : '-';
  }, [preOpMap]);

  // Generate PDF for the current day's surgeries
  const generateDayPdf = useCallback(() => {
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    const daySurgeries = surgeries.filter((s: any) => {
      const date = new Date(s.plannedDate);
      return date >= dayStart && date <= dayEnd;
    });

    if (daySurgeries.length === 0) {
      toast({
        title: t('opCalendar.noSurgeries'),
        description: t('opCalendar.noSurgeriesDesc'),
        variant: "destructive",
      });
      return;
    }

    // Build room staff data for PDF
    const roomStaffByRoom = new Map<string, RoomStaffInfo>();
    roomStaff.forEach((staff: RoomStaffAssignment) => {
      let roomInfo = roomStaffByRoom.get(staff.surgeryRoomId);
      if (!roomInfo) {
        roomInfo = { roomId: staff.surgeryRoomId, staffByRole: new Map() };
        roomStaffByRoom.set(staff.surgeryRoomId, roomInfo);
      }
      const names = roomInfo.staffByRole.get(staff.role) || [];
      names.push(staff.name);
      roomInfo.staffByRole.set(staff.role, names);
    });

    const displayDate = format(selectedDate, 'dd.MM.yyyy');
    const columns: DayPlanPdfColumn[] = [
      { ...defaultColumns.datum(displayDate), width: 30 },
      { ...defaultColumns.patient(), width: 40 },
      { ...defaultColumns.eingriff(), width: 80 },
      { ...defaultColumns.note(), width: 60 },
      { ...defaultColumns.preOp(formatPreOpSummaryForPdf), width: 50 },
    ];

    generateDayPlanPdf({
      date: selectedDate,
      hospitalName: activeHospital?.name || '',
      surgeries: daySurgeries,
      patientMap,
      roomMap,
      columns,
      roomStaffByRoom,
    });
  }, [selectedDate, surgeries, activeHospital, roomMap, patientMap, toast, roomStaff, formatPreOpSummaryForPdf]);

  // Helper to invalidate all room staff related queries
  const invalidateRoomStaffQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/room-staff/all', activeHospital?.id, dateString] });
    queryClient.invalidateQueries({ queryKey: ['/api/room-staff'] });
    queryClient.invalidateQueries({ queryKey: ['/api/staff-pool', activeHospital?.id, dateString] });
  }, [activeHospital?.id, dateString]);

  // Assign staff to room mutation
  const assignRoomStaffMutation = useMutation({
    mutationFn: async ({ surgeryRoomId, dailyStaffPoolId, date }: { surgeryRoomId: string; dailyStaffPoolId: string; date: string }) => {
      const res = await apiRequest('POST', '/api/room-staff', {
        surgeryRoomId,
        dailyStaffPoolId,
        date,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateRoomStaffQueries();
      toast({
        title: t('opCalendar.staffAssignedToRoom'),
        description: t('opCalendar.staffAssignedToRoomDesc'),
      });
    },
    onError: (error: any) => {
      const message = error?.message || '';
      let description = t('opCalendar.assignmentFailed');
      if (message.includes('already assigned')) {
        description = t('opCalendar.staffAlreadyAssigned');
      } else if (message) {
        description = message;
      }
      toast({
        title: t('opCalendar.assignmentFailed'),
        description,
        variant: "destructive",
      });
    },
  });

  // Remove staff from room mutation
  const removeRoomStaffMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest('DELETE', `/api/room-staff/${assignmentId}`);
    },
    onSuccess: () => {
      invalidateRoomStaffQueries();
      toast({
        title: t('opCalendar.staffRemoved'),
        description: t('opCalendar.staffRemovedDesc'),
      });
    },
    onError: () => {
      toast({
        title: t('opCalendar.removalFailed'),
        description: t('opCalendar.removalFailedDesc'),
        variant: "destructive",
      });
    },
  });

  // Handle removing staff from a room
  const handleRemoveRoomStaff = useCallback((assignmentId: string) => {
    removeRoomStaffMutation.mutate(assignmentId);
  }, [removeRoomStaffMutation]);

  // Handle staff drag start
  const handleDragStart = (event: any) => {
    const { active } = event;
    if (active.data.current?.type === 'staff') {
      setActiveDragStaff(active.data.current.staff);
    }
  };

  // Handle staff drag end - drop on room to assign
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragStaff(null);
    
    const { active, over } = event;
    
    if (!over) return;
    
    const activeData = active.data.current;
    const overData = over.data.current;
    
    // Check if we're dropping staff onto a room
    if (activeData?.type === 'staff' && overData?.type === 'room') {
      const staffPoolId = activeData.staff.id;
      const roomId = overData.roomId;
      
      assignRoomStaffMutation.mutate({
        surgeryRoomId: roomId,
        dailyStaffPoolId: staffPoolId,
        date: dateString,
      });
    }
  };

  // Handle event drop (drag and drop)
  const handleEventDrop = useCallback(async ({ event, start, end, resourceId }: any) => {
    const surgeryId = event.surgeryId;
    const newRoomId = resourceId || event.resource;
    
    try {
      await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: start.toISOString(),
        actualEndTime: end.toISOString(),
        surgeryRoomId: newRoomId,
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      
      toast({
        title: t('opCalendar.surgeryRescheduled'),
        description: t('opCalendar.surgeryRescheduledDesc'),
      });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: t('opCalendar.rescheduleFailed'),
        description: t('opCalendar.rescheduleFailedDesc'),
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle event resize
  const handleEventResize = useCallback(async ({ event, start, end }: any) => {
    const surgeryId = event.surgeryId;
    
    try {
      await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: start.toISOString(),
        actualEndTime: end.toISOString(),
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      
      toast({
        title: "Surgery Duration Updated",
        description: "Surgery duration has been updated successfully.",
      });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Update Failed",
        description: "Failed to update surgery duration. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle time slot selection (for quick create)
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    // Only open quick create for actual time range selections, not when clicking/dragging events
    // SlotInfo.action can be 'select', 'click', or 'doubleClick'
    // We only want to open quick create on 'select' (drag selection) in day/week views
    if ((currentView === "day" || currentView === "week") && slotInfo.action === 'select') {
      setQuickCreateData({
        date: slotInfo.start,
        endDate: slotInfo.end,
        roomId: slotInfo.resourceId as string | undefined,
      });
      setQuickCreateOpen(true);
    }
  }, [currentView]);

  // Handle event click
  const handleSelectEvent = useCallback((event: CalendarEvent, _e: React.SyntheticEvent) => {
    if (onEventClick) {
      onEventClick(event.surgeryId, event.patientId);
    }
  }, [onEventClick]);

  // Custom event style getter
  const eventStyleGetter: EventPropGetter<CalendarEvent> = useCallback((event: CalendarEvent) => {
    let backgroundColor = '#3b82f6'; // Default blue
    let borderColor = '#2563eb';
    
    // If cancelled, use gray
    if (event.isCancelled) {
      backgroundColor = '#9ca3af';
      borderColor = '#6b7280';
    } else if (event.timeMarkers) {
      // Check time markers for surgery status
      const hasA2 = event.timeMarkers.find(m => m.code === 'A2' && m.time !== null);
      const hasX2 = event.timeMarkers.find(m => m.code === 'X2' && m.time !== null);
      const hasO2 = event.timeMarkers.find(m => m.code === 'O2' && m.time !== null);
      const hasO1 = event.timeMarkers.find(m => m.code === 'O1' && m.time !== null);
      
      if (hasA2 || hasX2) {
        // Completed - green
        backgroundColor = '#10b981'; // emerald-500
        borderColor = '#059669'; // emerald-600
      } else if (hasO2) {
        // Suture phase - yellow/amber
        backgroundColor = '#f59e0b'; // amber-500
        borderColor = '#d97706'; // amber-600
      } else if (hasO1) {
        // Surgery running - red
        backgroundColor = '#ef4444'; // red-500
        borderColor = '#dc2626'; // red-600
      }
    }
    
    const style: any = {
      backgroundColor,
      borderColor,
      color: '#ffffff',
      borderRadius: '4px',
      opacity: event.isCancelled ? 0.7 : 1,
      border: '1px solid',
      display: 'block',
      textDecoration: event.isCancelled ? 'line-through' : 'none',
    };
    
    return { style };
  }, []);

  // Simplified event component for calendar display
  const EventComponent: React.FC<EventProps<CalendarEvent>> = useCallback(({ event }: EventProps<CalendarEvent>) => {
    return (
      <div className="flex flex-col h-full p-1 relative" data-testid={`event-${event.surgeryId}`}>
        <div className={`font-bold text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.plannedSurgery}
        </div>
        <div className={`text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.patientName}
          {event.patientBirthday && ` ${event.patientBirthday}`}
        </div>
        {event.isCancelled && (
          <div className="text-xs font-semibold mt-0.5">{t('opCalendar.cancelled')}</div>
        )}
        {event.pacuBedName && !event.isCancelled && (
          <div className="absolute bottom-0.5 right-1 flex items-center gap-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1 py-0 rounded text-[9px] font-medium leading-tight" data-testid={`badge-pacu-bed-${event.surgeryId}`}>
            {t('pacu.pacuBedShort', 'PACU')}: {event.pacuBedName}
          </div>
        )}
      </div>
    );
  }, []);

  // Custom month date cell component - show indicator dots instead of event details
  const MonthDateHeader = useCallback(({ date, drilldownView }: { date: Date; drilldownView?: string }) => {
    const dayEvents = calendarEvents.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate.toDateString() === date.toDateString();
    });

    const hasEvents = dayEvents.length > 0;

    return (
      <div className="rbc-date-cell">
        <button
          type="button"
          className="rbc-button-link"
          onClick={() => {
            setSelectedDate(date);
            setCurrentView("day");
          }}
        >
          {date.getDate()}
        </button>
        {hasEvents && (
          <div className="flex justify-center mt-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" data-testid={`indicator-${date.toISOString()}`}></div>
          </div>
        )}
      </div>
    );
  }, [calendarEvents]);

  // Custom date cell wrapper to make entire month cell clickable
  const DateCellWrapper = useCallback(({ value, children }: { value: Date; children: React.ReactNode }) => {
    return (
      <div 
        className="rbc-day-bg cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => {
          if (currentView === "month") {
            setSelectedDate(value);
            setCurrentView("day");
          }
        }}
        data-testid={`day-cell-${value.toISOString()}`}
      >
        {children}
      </div>
    );
  }, [currentView]);

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const navigatePrevious = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (currentView === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setSelectedDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (currentView === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };

  const formatDateHeader = () => {
    const dateLocale = i18n.language.startsWith('de') ? de : enGB;
    if (currentView === "month") {
      return format(selectedDate, 'MMMM yyyy', { locale: dateLocale });
    }
    if (currentView === "week") {
      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay() + 1); // Monday
      const end = new Date(start);
      end.setDate(end.getDate() + 6); // Sunday
      return `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;
    }
    // Day view: show day name followed by date
    return format(selectedDate, 'EEEE, dd/MM/yyyy', { locale: dateLocale });
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <>
      <div className="flex flex-col min-h-screen">
      {/* Header with view switcher and navigation */}
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4 bg-background border-b">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={navigatePrevious}
            data-testid="button-calendar-prev"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 p-0"
          >
            ←
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            data-testid="button-calendar-today"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            {t('opCalendar.today')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={navigateNext}
            data-testid="button-calendar-next"
            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3 p-0"
          >
            →
          </Button>
        </div>

        {/* Date label */}
        <span className="font-semibold text-sm sm:text-base flex-shrink-0" data-testid="text-calendar-date">
          {formatDateHeader()}
        </span>

        {/* View buttons - wrapped on small screens */}
        <div className="flex gap-1.5 sm:gap-2 ml-auto flex-wrap">
          <Button
            variant={currentView === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("day")}
            data-testid="button-view-day"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.day')}</span>
          </Button>
          <Button
            variant={currentView === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("week")}
            data-testid="button-view-week"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.week')}</span>
          </Button>
          <Button
            variant={currentView === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("month")}
            data-testid="button-view-month"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.month')}</span>
          </Button>
          {activeHospital && currentView === "day" && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateDayPdf}
              data-testid="button-download-pdf"
              className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
            >
              <Download className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('opCalendar.pdf')}</span>
            </Button>
          )}
          {activeHospital && currentView === "day" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlanStaffDialogOpen(true)}
              data-testid="button-plan-staff"
              className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
            >
              <Users className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('opCalendar.planStaff')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Empty state when no hospital selected */}
      {!activeHospital && (
        <div className="flex-1 px-4 pb-4 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="py-12 text-center">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('opCalendar.noHospitalSelected')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('opCalendar.selectHospitalToViewSchedule')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state when no surgery rooms */}
      {activeHospital && !isLoading && surgeryRooms.length === 0 && (
        <div className="flex-1 px-4 pb-4 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="py-12 text-center">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('opCalendar.noSurgeryRooms')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('opCalendar.noSurgeryRoomsDesc')}
              </p>
              <Button 
                onClick={() => setLocation("/anesthesia/settings")}
                data-testid="button-configure-rooms"
              >
                <i className="fas fa-cog mr-2"></i>
                {t('opCalendar.configureRooms')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Planned Staff Box - only show in day view */}
      {surgeryRooms.length > 0 && activeHospital && currentView === "day" && (
        <PlannedStaffBox
          selectedDate={selectedDate}
          hospitalId={activeHospital.id}
          isOpen={staffBoxOpen}
          onToggle={() => setStaffBoxOpen(!staffBoxOpen)}
        />
      )}

      {/* Calendar */}
      {surgeryRooms.length > 0 && (
        <div className="flex-1 min-h-0 px-4 pb-4">
          <div className="h-full calendar-container">
          {currentView === "week" ? (
            <TimelineWeekView
              surgeryRooms={surgeryRooms}
              allRooms={allSurgeryRooms}
              surgeries={surgeries}
              patients={allPatients}
              selectedDate={selectedDate}
              onEventClick={(surgeryId) => {
                const surgery = surgeries.find(s => s.id === surgeryId);
                if (surgery && onEventClick) {
                  onEventClick(surgery.id, surgery.patientId);
                }
              }}
              onEventDrop={async (surgeryId, newStart, newEnd, newRoomId) => {
                try {
                  await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
                    plannedDate: newStart.toISOString(),
                    actualEndTime: newEnd.toISOString(),
                    surgeryRoomId: newRoomId,
                  });
                  queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
                  toast({
                    title: t('opCalendar.surgeryRescheduled'),
                    description: t('opCalendar.surgeryRescheduledDesc'),
                  });
                } catch (error) {
                  console.error('Failed to update surgery:', error);
                  queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
                  toast({
                    title: t('common.error'),
                    description: t('opCalendar.rescheduleFailedDesc'),
                    variant: "destructive",
                  });
                }
              }}
              onCanvasClick={(roomId, time) => {
                // Set default 3-hour duration for new surgeries
                const endTime = new Date(time.getTime() + 3 * 60 * 60 * 1000);
                setQuickCreateData({
                  date: time,
                  endDate: endTime,
                  roomId: roomId,
                });
                setQuickCreateOpen(true);
              }}
              onSlotSelect={(roomId, start, end) => {
                // Drag selection - use actual selected time range
                setQuickCreateData({
                  date: start,
                  endDate: end,
                  roomId: roomId,
                });
                setQuickCreateOpen(true);
              }}
              onDayClick={(date) => {
                setSelectedDate(date);
                setCurrentView("day");
              }}
            />
          ) : (
            <DragAndDropCalendar
              localizer={localizer}
              events={currentView === "month" ? [] : calendarEvents}
              resources={currentView === "day" ? resources : undefined}
              resourceIdAccessor="id"
              resourceTitleAccessor="title"
              startAccessor="start"
              endAccessor="end"
              resourceAccessor="resource"
              view={currentView}
              date={selectedDate}
              onNavigate={setSelectedDate}
              onView={(view: View) => setCurrentView(view as ViewType)}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              eventPropGetter={eventStyleGetter}
              formats={formats}
              components={{
                event: EventComponent,
                toolbar: () => null,
                month: {
                  dateHeader: MonthDateHeader,
                },
                dateCellWrapper: DateCellWrapper,
                resourceHeader: ({ resource, label }: { resource: CalendarResource; label: React.ReactNode }) => (
                  <DroppableRoomHeader 
                    resource={resource} 
                    label={String(label)} 
                    roomStaff={roomStaff}
                    onRemoveStaff={handleRemoveRoomStaff}
                    dropStaffText={t('opCalendar.dropStaffHere')}
                  />
                ),
              }}
              selectable
              resizable
              step={10}
              timeslots={6}
              min={new Date(0, 0, 0, 7, 0, 0)}
              max={new Date(0, 0, 0, 22, 0, 0)}
              style={{ minHeight: '600px' }}
              popup
              data-testid="calendar-main"
            />
          )}
          </div>
        </div>
      )}

      {/* Plan Staff Dialog */}
      {activeHospital && (
        <PlanStaffDialog
          open={planStaffDialogOpen}
          onOpenChange={setPlanStaffDialogOpen}
          selectedDate={selectedDate}
          hospitalId={activeHospital.id}
        />
      )}

      {/* Quick Create Surgery Dialog */}
      {quickCreateOpen && quickCreateData && activeHospital && (
        <QuickCreateSurgeryDialog
          open={quickCreateOpen}
          onOpenChange={(open) => {
            setQuickCreateOpen(open);
            if (!open) setQuickCreateData(null);
          }}
          hospitalId={activeHospital.id}
          initialDate={quickCreateData.date}
          initialEndDate={quickCreateData.endDate}
          initialRoomId={quickCreateData.roomId}
          surgeryRooms={surgeryRooms}
        />
      )}

      </div>
      
      {/* Drag Overlay - shows visual feedback during drag */}
      <DragOverlay>
        {activeDragStaff && (
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg ${ROLE_CONFIG[activeDragStaff.role as keyof typeof ROLE_CONFIG]?.bgClass || 'bg-gray-100'} border-2 border-primary`}>
            {(() => {
              const config = ROLE_CONFIG[activeDragStaff.role as keyof typeof ROLE_CONFIG];
              const Icon = config?.icon || User;
              return <Icon className={`h-4 w-4 ${config?.colorClass}`} />;
            })()}
            <span>{activeDragStaff.name}</span>
          </div>
        )}
      </DragOverlay>
      </>
    </DndContext>
  );
}
