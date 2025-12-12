import { useState, useMemo, useCallback, useEffect } from "react";
import { Calendar, momentLocalizer, View, SlotInfo, CalendarProps, EventProps, EventPropGetter } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/en-gb";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor, useDroppable } from "@dnd-kit/core";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Users, User, X, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
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

// Configure moment for European format (British English locale for DD/MM/YYYY, 24-hour time, English labels)
moment.locale('en-gb');
const localizer = momentLocalizer(moment);

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
  onRemoveStaff
}: { 
  resource: CalendarResource; 
  label: string;
  roomStaff: RoomStaffAssignment[];
  onRemoveStaff: (assignmentId: string) => void;
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
            Drop staff here
          </div>
        )}
      </div>
    </div>
  );
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
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

  // Fetch surgery rooms for the active hospital
  const { data: surgeryRooms = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

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

  // Transform surgeries into calendar events
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return surgeries.map((surgery: any) => {
      const patient = allPatients.find((p: any) => p.id === surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "Unknown Patient";
      const patientBirthday = patient?.birthday 
        ? new Date(patient.birthday).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : "";
      
      const plannedDate = new Date(surgery.plannedDate);
      const endTime = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime)
        : new Date(plannedDate.getTime() + 3 * 60 * 60 * 1000); // Default 3 hours
      
      const isCancelled = surgery.status === "cancelled";
      const title = `${surgery.plannedSurgery || 'No surgery specified'} - ${patientName}`;
      
      return {
        id: surgery.id,
        title,
        start: plannedDate,
        end: endTime,
        resource: surgery.surgeryRoomId || (surgeryRooms[0]?.id || "unassigned"),
        surgeryId: surgery.id,
        patientId: surgery.patientId,
        plannedSurgery: surgery.plannedSurgery || 'No surgery specified',
        patientName,
        patientBirthday,
        isCancelled,
        timeMarkers: surgery.timeMarkers || null,
      };
    });
  }, [surgeries, allPatients, surgeryRooms]);

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

  // Generate PDF for the current day's surgeries
  const generateDayPdf = useCallback(() => {
    // Filter surgeries for the selected day
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
        title: "No surgeries",
        description: "There are no surgeries planned for this day.",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape' });
    
    // Format date for display
    const displayDate = format(selectedDate, 'dd.MM.yyyy');
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    
    // Header
    doc.setFontSize(16);
    doc.text(`OP-TAG ${displayDate}`, 14, 15);
    doc.setFontSize(10);
    doc.text(activeHospital?.name || '', 14, 22);
    
    // Group surgeries by room
    const surgeriesByRoom = new Map<string, any[]>();
    daySurgeries.forEach((surgery: any) => {
      const roomId = surgery.surgeryRoomId || 'unassigned';
      const roomSurgeries = surgeriesByRoom.get(roomId) || [];
      roomSurgeries.push(surgery);
      surgeriesByRoom.set(roomId, roomSurgeries);
    });
    
    // Sort rooms: assigned rooms first (sorted by name), then unassigned
    const sortedRoomIds = Array.from(surgeriesByRoom.keys()).sort((a, b) => {
      if (a === 'unassigned') return 1;
      if (b === 'unassigned') return -1;
      const nameA = roomMap.get(a) || '';
      const nameB = roomMap.get(b) || '';
      return nameA.localeCompare(nameB);
    });
    
    // Helper to format surgery row for table
    const formatSurgeryRow = (surgery: any) => {
      const patient = patientMap.get(surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : '-';
      const patientBirthday = patient?.birthday 
        ? `(${format(new Date(patient.birthday), 'dd.MM.yyyy')})`
        : '';
      
      const admissionTime = surgery.admissionTime 
        ? format(new Date(surgery.admissionTime), 'HH:mm')
        : '-';
      const startTime = surgery.plannedDate 
        ? format(new Date(surgery.plannedDate), 'HH:mm')
        : '-';
      
      const datumText = [
        displayDate,
        `• Eintritt: ${admissionTime} Uhr`,
        `• Schnitt: ${startTime}`
      ].join('\n');
      
      return [
        datumText,
        surgery.surgeon || '-',
        `${patientName}\n${patientBirthday}`,
        surgery.plannedSurgery || '-',
        surgery.notes || '-'
      ];
    };
    
    let currentY = 28;
    
    // Generate a table for each room
    sortedRoomIds.forEach((roomId, index) => {
      const roomSurgeries = surgeriesByRoom.get(roomId) || [];
      const roomName = roomId === 'unassigned' 
        ? 'Ohne Saal' 
        : (roomMap.get(roomId) || `Saal ${roomId}`);
      
      // Sort surgeries within the room by planned begin time (ascending - earliest first)
      const sortedRoomSurgeries = [...roomSurgeries].sort((a: any, b: any) => {
        const dateA = a.plannedDate ? new Date(a.plannedDate) : null;
        const dateB = b.plannedDate ? new Date(b.plannedDate) : null;
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.getTime() - dateB.getTime();
      });
      
      // Add room header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${roomName}`, 14, currentY);
      currentY += 6;
      
      // Table data for this room
      const tableData = sortedRoomSurgeries.map(formatSurgeryRow);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Datum', 'Operator', 'Patient', 'Eingriff', 'Note']],
        body: tableData,
        theme: 'grid',
        styles: { 
          fontSize: 9, 
          cellPadding: 2,
          overflow: 'linebreak',
          valign: 'top'
        },
        headStyles: {
          fillColor: [66, 66, 66],
          fontSize: 10,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 30 },  // Datum
          1: { cellWidth: 30 },  // Operator
          2: { cellWidth: 40 },  // Patient
          3: { cellWidth: 80 },  // Eingriff
          4: { cellWidth: 80 }   // Note
        },
        margin: { left: 10, right: 10 },
      });
      
      // Get final Y position from autoTable
      const finalY = (doc as any).lastAutoTable?.finalY || currentY;
      currentY = finalY + 10;
      
      // Check if we need a new page for the next room
      if (index < sortedRoomIds.length - 1 && currentY > 180) {
        doc.addPage();
        currentY = 20;
      }
    });
    
    // Save the PDF
    doc.save(`OP-Tag_${dateKey}.pdf`);
  }, [selectedDate, surgeries, activeHospital, roomMap, patientMap, toast]);

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
        title: "Staff Assigned to Room",
        description: "Staff member has been assigned to the operating room.",
      });
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to assign staff to room';
      toast({
        title: "Assignment Failed",
        description: message.includes('already assigned') ? 'This staff is already assigned to this room.' : message,
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
        title: "Staff Removed",
        description: "Staff member has been removed from the room.",
      });
    },
    onError: () => {
      toast({
        title: "Removal Failed",
        description: "Failed to remove staff from room.",
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
        title: "Surgery Rescheduled",
        description: "Surgery has been successfully rescheduled.",
      });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Reschedule Failed",
        description: "Failed to reschedule surgery. Please try again.",
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
      <div className="flex flex-col h-full p-1" data-testid={`event-${event.surgeryId}`}>
        <div className={`font-bold text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.plannedSurgery}
        </div>
        <div className={`text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.patientName}
          {event.patientBirthday && ` ${event.patientBirthday}`}
        </div>
        {event.isCancelled && (
          <div className="text-xs font-semibold mt-0.5">CANCELLED</div>
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
    if (currentView === "month") {
      return moment(selectedDate).format('MMMM YYYY');
    }
    if (currentView === "week") {
      const start = moment(selectedDate).startOf('week');
      const end = moment(selectedDate).endOf('week');
      return `${start.format('DD/MM/YYYY')} - ${end.format('DD/MM/YYYY')}`;
    }
    return moment(selectedDate).format('DD/MM/YYYY');
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
            Today
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
            <span className="hidden sm:inline">Day</span>
          </Button>
          <Button
            variant={currentView === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("week")}
            data-testid="button-view-week"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">Week</span>
          </Button>
          <Button
            variant={currentView === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("month")}
            data-testid="button-view-month"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">Month</span>
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
              <span className="hidden sm:inline">PDF</span>
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
              <span className="hidden sm:inline">Plan Staff</span>
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
              <h3 className="text-lg font-semibold mb-2">No Hospital Selected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please select a hospital from the top bar to view the OP Schedule.
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
              <h3 className="text-lg font-semibold mb-2">No Surgery Rooms Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                To use the OP Schedule calendar, you need to configure surgery rooms first.
              </p>
              <Button 
                onClick={() => setLocation("/anesthesia/settings")}
                data-testid="button-configure-rooms"
              >
                <i className="fas fa-cog mr-2"></i>
                Configure Rooms
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
                    title: "Surgery Rescheduled",
                    description: "Surgery has been successfully rescheduled.",
                  });
                } catch (error) {
                  console.error('Failed to update surgery:', error);
                  queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
                  toast({
                    title: "Error",
                    description: "Failed to reschedule surgery. Please try again.",
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
                  />
                ),
              }}
              selectable
              resizable
              step={10}
              timeslots={6}
              min={new Date(0, 0, 0, 6, 0, 0)}
              max={new Date(0, 0, 0, 20, 0, 0)}
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
