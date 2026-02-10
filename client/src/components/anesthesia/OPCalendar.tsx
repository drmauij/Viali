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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import SignaturePad from "@/components/SignaturePad";
import type { ChecklistTemplate, ChecklistCompletion } from "@shared/schema";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Users, User, X, Download, Circle, Pencil, PauseCircle, CheckCircle2, XCircle, ClipboardCheck, FileSignature } from "lucide-react";
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
  isSuspended: boolean;
  suspendedReason?: string | null;
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

interface RoomPendingChecklist extends ChecklistTemplate {
  lastCompletion?: ChecklistCompletion;
  nextDueDate: Date;
  isOverdue: boolean;
}

function DroppableRoomHeader({ 
  resource, 
  label, 
  roomStaff,
  onRemoveStaff,
  dropStaffText,
  roomChecklists,
  onChecklistClick,
}: { 
  resource: CalendarResource; 
  label: string;
  roomStaff: RoomStaffAssignment[];
  onRemoveStaff: (assignmentId: string) => void;
  dropStaffText: string;
  roomChecklists?: RoomPendingChecklist[];
  onChecklistClick?: (roomId: string) => void;
}) {
  const checklists = roomChecklists || [];
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
      <div className="font-semibold text-sm p-2 pb-1 flex items-center justify-center relative">
        <span>{label}</span>
        {checklists.length > 0 && onChecklistClick && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onChecklistClick(resource.id);
            }}
            className={`absolute right-2 p-0 leading-none transition-colors ${
              checklists.some(c => c.isOverdue)
                ? 'text-destructive animate-pulse'
                : 'text-amber-500'
            }`}
            title={`${checklists.length} checklist(s) due`}
            data-testid={`button-room-checklist-${resource.id}`}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
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
  
  // Room checklist state
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [checklistRoomId, setChecklistRoomId] = useState<string | null>(null);
  const [selectedChecklist, setSelectedChecklist] = useState<RoomPendingChecklist | null>(null);
  const [checklistCheckedItems, setChecklistCheckedItems] = useState<Set<number>>(new Set());
  const [checklistSignature, setChecklistSignature] = useState("");
  const [checklistComment, setChecklistComment] = useState("");
  const [showChecklistSignaturePad, setShowChecklistSignaturePad] = useState(false);

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

  // Fetch room-specific pending checklists for the selected date
  const { data: roomPendingChecklists = [] } = useQuery<RoomPendingChecklist[]>({
    queryKey: ['/api/checklists/room-pending', activeHospital?.id, dateString],
    queryFn: async () => {
      const res = await fetch(`/api/checklists/room-pending/${activeHospital?.id}?date=${dateString}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch room checklists');
      return res.json();
    },
    enabled: !!activeHospital?.id,
  });

  const checklistsByRoom = useMemo(() => {
    const map = new Map<string, RoomPendingChecklist[]>();
    for (const cl of roomPendingChecklists) {
      if (cl.roomId) {
        const list = map.get(cl.roomId) || [];
        list.push(cl);
        map.set(cl.roomId, list);
      }
    }
    return map;
  }, [roomPendingChecklists]);

  // Get surgery IDs for pre-op assessment fetch
  const surgeryIds = useMemo(() => surgeries.map((s: any) => s.id), [surgeries]);

  const isSurgeryModule = activeHospital?.unitType === 'or';

  // Fetch anesthesia pre-op assessments for surgeries
  const { data: anesthesiaPreOpAssessments = [] } = useQuery<any[]>({
    queryKey: ["/api/anesthesia/preop-assessments/bulk", surgeryIds],
    queryFn: async () => {
      if (surgeryIds.length === 0) return [];
      const response = await fetch(`/api/anesthesia/preop-assessments/bulk?surgeryIds=${surgeryIds.join(",")}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: surgeryIds.length > 0 && !isSurgeryModule,
  });

  // Fetch surgery pre-op assessments (for surgery module units)
  const { data: surgeryPreOpAssessments = [] } = useQuery<any[]>({
    queryKey: ["/api/surgery/preop-assessments/bulk", surgeryIds],
    queryFn: async () => {
      if (surgeryIds.length === 0) return [];
      const response = await fetch(`/api/surgery/preop-assessments/bulk?surgeryIds=${surgeryIds.join(",")}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: surgeryIds.length > 0 && isSurgeryModule === true,
  });

  const preOpAssessments = isSurgeryModule ? surgeryPreOpAssessments : anesthesiaPreOpAssessments;

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
      const isSuspended = surgery.isSuspended === true;
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
        isSuspended,
        suspendedReason: surgery.suspendedReason || null,
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
      return date >= dayStart && date <= dayEnd && !s.isSuspended;
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

  // Checklist completion mutation
  const completeChecklistMutation = useMutation({
    mutationFn: async (data: {
      templateId: string;
      dueDate: Date;
      comment?: string;
      signature: string;
      templateSnapshot: Pick<ChecklistTemplate, 'name' | 'description' | 'recurrency' | 'items' | 'role'>;
    }) => {
      const response = await apiRequest("POST", `/api/checklists/complete`, {
        templateId: data.templateId,
        dueDate: new Date(data.dueDate).toISOString(),
        comment: data.comment,
        signature: data.signature,
        templateSnapshot: data.templateSnapshot,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/checklists/room-pending', activeHospital?.id, dateString] });
      toast({
        title: t("checklists.completed", "Checklist completed"),
        description: t("checklists.completionSuccess", "The checklist has been completed successfully."),
      });
      setSelectedChecklist(null);
      setChecklistDialogOpen(false);
      setChecklistSignature("");
      setChecklistComment("");
      setChecklistCheckedItems(new Set());
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("checklists.completionError", "Failed to complete the checklist."),
        variant: "destructive",
      });
    },
  });

  const handleRoomChecklistClick = useCallback((roomId: string) => {
    setChecklistRoomId(roomId);
    const checklists = checklistsByRoom.get(roomId) || [];
    if (checklists.length === 1) {
      setSelectedChecklist(checklists[0]);
      setChecklistCheckedItems(new Set());
    } else {
      setSelectedChecklist(null);
    }
    setChecklistDialogOpen(true);
  }, [checklistsByRoom]);

  const handleSelectChecklist = useCallback((cl: RoomPendingChecklist) => {
    setSelectedChecklist(cl);
    setChecklistCheckedItems(new Set());
    setChecklistSignature("");
    setChecklistComment("");
  }, []);

  const handleSubmitChecklistCompletion = useCallback(() => {
    if (!selectedChecklist || !checklistSignature) return;

    completeChecklistMutation.mutate({
      templateId: selectedChecklist.id,
      dueDate: selectedChecklist.nextDueDate,
      comment: checklistComment.trim() || undefined,
      signature: checklistSignature,
      templateSnapshot: {
        name: selectedChecklist.name,
        description: selectedChecklist.description,
        recurrency: selectedChecklist.recurrency,
        items: selectedChecklist.items,
        role: selectedChecklist.role,
      },
    });
  }, [selectedChecklist, checklistSignature, checklistComment, completeChecklistMutation]);

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
    
    if (event.isSuspended) {
      backgroundColor = '#f59e0b';
      borderColor = '#d97706';
    } else if (event.isCancelled) {
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
      opacity: (event.isCancelled || event.isSuspended) ? 0.7 : 1,
      border: event.isSuspended ? '2px dashed' : '1px solid',
      display: 'block',
      textDecoration: event.isCancelled ? 'line-through' : 'none',
    };
    
    return { style };
  }, []);

  // Derive pre-op assessment status for a surgery
  const getPreOpStatus = useCallback((surgeryId: string) => {
    const data = preOpMap.get(surgeryId);
    if (!data || !data.assessment) {
      return { key: 'planned', icon: Circle, color: 'text-muted-foreground', label: t('opCalendar.preOpStatus.planned', 'Planned') };
    }
    const a = data.assessment;
    if (a.standBy) {
      const reasonKey = a.standByReason || '';
      let reasonLabel = '';
      if (reasonKey === 'signature_missing') reasonLabel = t('opCalendar.preOpStatus.standByReasons.signatureMissing', 'Signature missing');
      else if (reasonKey === 'consent_required') reasonLabel = t('opCalendar.preOpStatus.standByReasons.consentRequired', 'Consent required');
      else if (reasonKey === 'waiting_exams') reasonLabel = t('opCalendar.preOpStatus.standByReasons.waitingExams', 'Waiting exams');
      else if (reasonKey === 'other') reasonLabel = a.standByReasonNote || t('opCalendar.preOpStatus.standByReasons.other', 'Other');
      else if (a.standByReasonNote) reasonLabel = a.standByReasonNote;
      return { key: 'standby', icon: PauseCircle, color: 'text-amber-500', label: `${t('opCalendar.preOpStatus.standBy', 'Stand-by')}${reasonLabel ? ` (${reasonLabel})` : ''}` };
    }
    const approval = isSurgeryModule ? a.surgicalApprovalStatus : a.surgicalApproval;
    if (data.status === 'completed' || a.status === 'completed') {
      if (approval === 'approved') {
        return { key: 'approved', icon: CheckCircle2, color: 'text-green-500', label: t('opCalendar.preOpStatus.approved', 'Approved') };
      }
      if (approval === 'not-approved') {
        return { key: 'not-approved', icon: XCircle, color: 'text-red-500', label: t('opCalendar.preOpStatus.notApproved', 'Not approved') };
      }
      return { key: 'approved', icon: CheckCircle2, color: 'text-green-500', label: t('opCalendar.preOpStatus.completed', 'Completed') };
    }
    return { key: 'started', icon: Pencil, color: 'text-muted-foreground', label: t('opCalendar.preOpStatus.started', 'Started') };
  }, [preOpMap, isSurgeryModule, t]);

  // Simplified event component for calendar display
  const EventComponent: React.FC<EventProps<CalendarEvent>> = useCallback(({ event }: EventProps<CalendarEvent>) => {
    const preOpStatus = getPreOpStatus(event.surgeryId);
    const StatusIcon = preOpStatus.icon;
    return (
      <div className="flex flex-col h-full p-0.5 sm:p-1 overflow-hidden relative" data-testid={`event-${event.surgeryId}`}>
        <div className={`font-bold text-[10px] sm:text-xs leading-tight truncate ${event.isCancelled ? 'line-through' : ''}`}>
          {event.plannedSurgery}
        </div>
        <div className={`text-[10px] sm:text-xs leading-tight truncate ${event.isCancelled ? 'line-through' : ''}`}>
          {event.patientName}
          {event.patientBirthday && ` ${event.patientBirthday}`}
        </div>
        {!event.isCancelled && !event.isSuspended && (
          <div className={`flex items-center gap-0.5 leading-tight mt-0.5 ${preOpStatus.color}`} data-testid={`preop-status-${event.surgeryId}`} title={preOpStatus.label}>
            <StatusIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
            <span className="hidden sm:inline text-[11px] truncate">{preOpStatus.label}</span>
          </div>
        )}
        {event.isSuspended && (
          <div className="text-[10px] sm:text-xs font-bold mt-0.5 truncate" data-testid={`badge-suspended-${event.surgeryId}`} title={event.suspendedReason || ''}>
            {t('opCalendar.suspended', 'ABGESETZT')}
            {event.suspendedReason && <span className="font-normal opacity-80"> – {event.suspendedReason}</span>}
          </div>
        )}
        {event.isCancelled && !event.isSuspended && (
          <div className="text-[10px] sm:text-xs font-semibold mt-0.5 truncate">{t('opCalendar.cancelled')}</div>
        )}
        {event.pacuBedName && !event.isCancelled && !event.isSuspended && (
          <div className="absolute bottom-0.5 right-0.5 sm:right-1 flex items-center gap-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-0.5 sm:px-1 py-0 rounded text-[8px] sm:text-[9px] font-medium leading-tight" data-testid={`badge-pacu-bed-${event.surgeryId}`}>
            {t('pacu.pacuBedShort', 'PACU')}: {event.pacuBedName}
          </div>
        )}
      </div>
    );
  }, [getPreOpStatus, t]);

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
              getPreOpStatus={getPreOpStatus}
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
                    roomChecklists={checklistsByRoom.get(resource.id) || []}
                    onChecklistClick={handleRoomChecklistClick}
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

      {/* Room Checklist Completion Dialog */}
      <Dialog
        open={checklistDialogOpen}
        onOpenChange={(open) => {
          setChecklistDialogOpen(open);
          if (!open) {
            setSelectedChecklist(null);
            setChecklistRoomId(null);
            setChecklistSignature("");
            setChecklistComment("");
            setChecklistCheckedItems(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-room-checklist">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle data-testid="text-room-checklist-title">
              {selectedChecklist
                ? `${t("checklists.complete", "Complete")} - ${selectedChecklist.name}`
                : t("checklists.roomChecklists", "Room Checklists")
              }
            </DialogTitle>
            <DialogDescription data-testid="text-room-checklist-description">
              {checklistRoomId && surgeryRooms.find((r: any) => r.id === checklistRoomId)?.name}
              {selectedChecklist
                ? ` — ${t("checklists.completionDescription", "Check all items and sign to complete.")}`
                : ` — ${t("checklists.selectChecklistToComplete", "Select a checklist to complete.")}`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 mt-4 pr-4">
            {!selectedChecklist && checklistRoomId && (
              <div className="space-y-2">
                {(checklistsByRoom.get(checklistRoomId) || []).map((cl) => (
                  <button
                    key={cl.id}
                    onClick={() => handleSelectChecklist(cl)}
                    className="w-full text-left p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                    data-testid={`button-select-checklist-${cl.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{cl.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {Array.isArray(cl.items) ? cl.items.length : 0} {t("checklists.items", "items")}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        cl.isOverdue
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {cl.isOverdue ? t("checklists.overdue", "Overdue") : t("checklists.dueToday", "Due today")}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedChecklist && (
              <>
                {checklistRoomId && (checklistsByRoom.get(checklistRoomId) || []).length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedChecklist(null);
                      setChecklistSignature("");
                      setChecklistComment("");
                      setChecklistCheckedItems(new Set());
                    }}
                    data-testid="button-back-to-list"
                  >
                    <span className="mr-1">←</span> {t("common.back", "Back")}
                  </Button>
                )}

                {Array.isArray(selectedChecklist.items) && selectedChecklist.items.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-3 block" data-testid="label-room-checklist-items">
                      {t("checklists.itemsToCheck", "Items to check")}
                    </Label>
                    <ul className="space-y-3" data-testid="list-room-checklist-items">
                      {selectedChecklist.items.map((item, index) => {
                        const isChecked = checklistCheckedItems.has(index);
                        return (
                          <li
                            key={index}
                            onClick={() => {
                              setChecklistCheckedItems(prev => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index);
                                else next.add(index);
                                return next;
                              });
                            }}
                            className="flex items-center gap-3 p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer active:scale-[0.98]"
                            data-testid={`room-checklist-item-${index}`}
                          >
                            <div
                              className={`min-w-6 w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${
                                isChecked
                                  ? 'bg-primary border-primary'
                                  : 'border-muted-foreground/40'
                              }`}
                            >
                              {isChecked && (
                                <svg className="w-4 h-4 text-primary-foreground" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                                  <path d="M5 13l4 4L19 7"></path>
                                </svg>
                              )}
                            </div>
                            <span className={`text-base ${isChecked ? 'line-through text-muted-foreground' : ''}`}>
                              {typeof item === 'string' ? item : (item as any).description}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                <div>
                  <Label htmlFor="room-checklist-comment" className="mb-2 block" data-testid="label-room-checklist-comment">
                    {t("checklists.comment", "Comment")} ({t("checklists.optional", "optional")})
                  </Label>
                  <Textarea
                    id="room-checklist-comment"
                    value={checklistComment}
                    onChange={(e) => setChecklistComment(e.target.value)}
                    placeholder={t("checklists.commentPlaceholder", "Add a comment...")}
                    className="min-h-24"
                    data-testid="input-room-checklist-comment"
                  />
                </div>

                <div>
                  <Label className="mb-2 block" data-testid="label-room-checklist-signature">
                    {t("checklists.signature", "Signature")} *
                  </Label>
                  <div
                    className="signature-pad cursor-pointer border-2 border-dashed border-border rounded-lg p-6 hover:bg-muted/50 transition-colors"
                    onClick={() => setShowChecklistSignaturePad(true)}
                    data-testid="room-checklist-signature-trigger"
                  >
                    {checklistSignature ? (
                      <div className="text-center">
                        <FileSignature className="w-8 h-8 text-green-600 mx-auto mb-2" />
                        <p className="text-sm font-medium text-green-600" data-testid="text-room-signature-added">
                          {t("checklists.signatureAdded", "Signature added")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("checklists.clickToChange", "Click to change")}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <FileSignature className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-medium" data-testid="text-room-signature-required">
                          {t("checklists.clickToSign", "Click to sign")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedChecklist && (
            <div className="flex gap-3 mt-6 flex-shrink-0 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setChecklistDialogOpen(false);
                  setSelectedChecklist(null);
                  setChecklistSignature("");
                  setChecklistComment("");
                  setChecklistCheckedItems(new Set());
                }}
                disabled={completeChecklistMutation.isPending}
                data-testid="button-room-checklist-cancel"
              >
                {t("common.cancel", "Cancel")}
              </Button>
              <Button
                onClick={handleSubmitChecklistCompletion}
                disabled={completeChecklistMutation.isPending || !checklistSignature}
                className="flex-1"
                data-testid="button-room-checklist-submit"
              >
                {completeChecklistMutation.isPending
                  ? t("checklists.completing", "Completing...")
                  : t("checklists.submitCompletion", "Complete Checklist")
                }
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SignaturePad
        isOpen={showChecklistSignaturePad}
        onClose={() => setShowChecklistSignaturePad(false)}
        onSave={(sig) => setChecklistSignature(sig)}
        title={t("checklists.yourSignature", "Your Signature")}
      />
      
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
