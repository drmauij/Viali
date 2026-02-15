import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Calendar, momentLocalizer, View, SlotInfo, CalendarProps, EventProps, EventPropGetter } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Plus, User, Settings, Filter, Lock, Scissors, Cloud, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { de, enGB } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { ClinicAppointment, Patient, User as UserType, ClinicService, ClinicProvider } from "@shared/schema";
import AppointmentsWeekView from "./AppointmentsWeekView";
import ProviderFilterDialog from "./ProviderFilterDialog";
import EditTimeOffDialog from "./EditTimeOffDialog";

const CALENDAR_VIEW_KEY = "clinic_calendar_view";
const CALENDAR_DATE_KEY = "clinic_calendar_date";

type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
};

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: string;
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  serviceName: string;
  status: string;
  notes: string | null;
  isSurgeryBlock?: boolean;
  surgeryName?: string;
  isAbsenceBlock?: boolean;
  absenceType?: string;
  isTimeOffBlock?: boolean;
  timeOffReason?: string;
  isAvailabilityWindow?: boolean;
  windowId?: string;
}

interface ProviderSurgery {
  id: string;
  patientId: string;
  surgeonId: string | null;
  surgeon: string | null;
  plannedDate: string;
  plannedSurgery: string;
  actualEndTime: string | null;
  status: string | null;
  surgeryRoomId: string | null;
  patientFirstName: string | null;
  patientSurname: string | null;
}

interface ProviderAbsence {
  id: string;
  providerId: string;
  hospitalId: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  externalId: string | null;
  notes: string | null;
}

interface ProviderTimeOff {
  id: string;
  providerId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  notes: string | null;
}

interface ProviderAvailabilityWindowData {
  id: string;
  providerId: string;
  unitId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  notes: string | null;
}

type CalendarResource = {
  id: string;
  title: string;
};

function getMomentLocale(lang: string): string {
  return lang.startsWith('de') ? 'de' : 'en-gb';
}

const DragAndDropCalendar = withDragAndDrop<CalendarEvent, CalendarResource>(
  Calendar as React.ComponentType<CalendarProps<CalendarEvent, CalendarResource>>
);

const formats = {
  timeGutterFormat: 'HH:mm',
  eventTimeRangeFormat: () => '',
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

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  scheduled: { bg: '#3b82f6', border: '#2563eb' },
  confirmed: { bg: '#10b981', border: '#059669' },
  in_progress: { bg: '#f59e0b', border: '#d97706' },
  completed: { bg: '#6b7280', border: '#4b5563' },
  cancelled: { bg: '#ef4444', border: '#dc2626' },
  no_show: { bg: '#8b5cf6', border: '#7c3aed' },
  surgery_block: { bg: '#9ca3af', border: '#6b7280' },
  // Availability window (green, shows when provider IS available)
  availability_window: { bg: '#22c55e', border: '#16a34a' },
  // All absence types are red
  absence_vacation: { bg: '#dc2626', border: '#b91c1c' },
  absence_sick: { bg: '#dc2626', border: '#b91c1c' },
  absence_training: { bg: '#dc2626', border: '#b91c1c' },
  absence_parental: { bg: '#dc2626', border: '#b91c1c' },
  absence_homeoffice: { bg: '#dc2626', border: '#b91c1c' },
  absence_sabbatical: { bg: '#dc2626', border: '#b91c1c' },
  absence_other: { bg: '#dc2626', border: '#b91c1c' },
};

const ABSENCE_TYPE_LABEL_KEYS: Record<string, { key: string; fallback: string }> = {
  vacation: { key: 'appointments.absence.vacation', fallback: 'Vacation' },
  sick: { key: 'appointments.absence.sick', fallback: 'Sick Leave' },
  training: { key: 'appointments.absence.training', fallback: 'Training' },
  parental: { key: 'appointments.absence.parental', fallback: 'Parental Leave' },
  homeoffice: { key: 'appointments.absence.homeoffice', fallback: 'Home Office' },
  sabbatical: { key: 'appointments.absence.sabbatical', fallback: 'Sabbatical' },
  default: { key: 'appointments.absence.default', fallback: 'Absent' },
};

const ABSENCE_TYPE_ICONS: Record<string, string> = {
  vacation: '🏖️',
  sick: '🤒',
  training: '📚',
  parental: '👶',
  homeoffice: '🏠',
  sabbatical: '✈️',
  default: '🚫',
};

interface ClinicCalendarProps {
  hospitalId: string;
  unitId: string;
  onBookAppointment?: (data: { providerId: string; date: Date; endDate?: Date }) => void;
  onEventClick?: (appointment: AppointmentWithDetails) => void;
  onProviderClick?: (providerId: string) => void;
  statusLegend?: React.ReactNode;
}

export default function ClinicCalendar({ 
  hospitalId, 
  unitId, 
  onBookAppointment,
  onEventClick,
  onProviderClick,
  statusLegend,
}: ClinicCalendarProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  const momentLocale = getMomentLocale(i18n.language);
  moment.locale(momentLocale);
  const localizer = useMemo(() => momentLocalizer(moment), [momentLocale]);
  
  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = sessionStorage.getItem(CALENDAR_VIEW_KEY);
    return (saved as ViewType) || "day";
  });
  
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const saved = sessionStorage.getItem(CALENDAR_DATE_KEY);
    return saved ? new Date(saved) : new Date();
  });

  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());
  const [hasLoadedPreferences, setHasLoadedPreferences] = useState(false);
  const [editTimeOffOpen, setEditTimeOffOpen] = useState(false);
  const [selectedTimeOff, setSelectedTimeOff] = useState<ProviderTimeOff | null>(null);
  const [selectedTimeOffProviderName, setSelectedTimeOffProviderName] = useState<string>("");

  useEffect(() => {
    sessionStorage.setItem(CALENDAR_VIEW_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    sessionStorage.setItem(CALENDAR_DATE_KEY, selectedDate.toISOString());
  }, [selectedDate]);

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

  type BookableProvider = ClinicProvider & { user: { id: string; firstName: string | null; lastName: string | null; email: string | null } };
  
  const { data: bookableProviders = [], isLoading: providersLoading } = useQuery<BookableProvider[]>({
    queryKey: [`/api/clinic/${hospitalId}/bookable-providers`],
    enabled: !!hospitalId,
  });
  
  const providers = useMemo(() => {
    return bookableProviders.map(bp => ({
      id: bp.userId,
      firstName: bp.user.firstName || '',
      lastName: bp.user.lastName || '',
      email: bp.user.email || undefined,
      role: undefined,
    }));
  }, [bookableProviders]);

  const { data: userPreferences } = useQuery<{ clinicProviderFilter?: Record<string, string[]> }>({
    queryKey: ['/api/user/preferences'],
    staleTime: 1000 * 60 * 5,
  });

  const { data: appointments = [] } = useQuery<AppointmentWithDetails[]>({
    queryKey: [`/api/clinic/${hospitalId}/appointments?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`],
    enabled: !!hospitalId,
    refetchInterval: 30000,
  });

  // Fetch all surgeries for the hospital in the date range (to show surgery blocks)
  interface AllSurgery extends ProviderSurgery {
    surgeonFirstName: string | null;
    surgeonLastName: string | null;
  }
  
  const { data: allSurgeries = [] } = useQuery<AllSurgery[]>({
    queryKey: [`/api/clinic/${hospitalId}/all-surgeries`, format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(
        `/api/clinic/${hospitalId}/all-surgeries?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId,
    refetchInterval: 60000,
  });

  // Helper to derive consistent resource ID for a surgeon
  const getSurgeonResourceId = (surgery: AllSurgery): string | null => {
    if (surgery.surgeonId) return surgery.surgeonId;
    if (surgery.surgeon) {
      // Slugify the surgeon name to create a consistent ID
      return `surgeon-${surgery.surgeon.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
    }
    return null;
  };

  // Extract surgeons from surgeries and merge them into the resources list
  const surgeonsFromSurgeries = useMemo(() => {
    const providerIdSet = new Set(providers.map(p => p.id));
    const surgeonMap = new Map<string, { id: string; firstName: string; lastName: string }>();
    
    allSurgeries.forEach(surgery => {
      const resourceId = getSurgeonResourceId(surgery);
      if (resourceId && !providerIdSet.has(resourceId) && !surgeonMap.has(resourceId)) {
        surgeonMap.set(resourceId, {
          id: resourceId,
          firstName: surgery.surgeonFirstName || surgery.surgeon?.split(' ')[0] || '',
          lastName: surgery.surgeonLastName || surgery.surgeon?.split(' ').slice(1).join(' ') || '',
        });
      }
    });
    
    return Array.from(surgeonMap.values());
  }, [allSurgeries, providers]);

  // Merge base providers with surgeons from surgeries
  const allProviders = useMemo(() => {
    return [...providers, ...surgeonsFromSurgeries];
  }, [providers, surgeonsFromSurgeries]);

  useEffect(() => {
    if (allProviders.length > 0 && !hasLoadedPreferences) {
      const savedFilter = userPreferences?.clinicProviderFilter?.[hospitalId];
      if (savedFilter && savedFilter.length > 0) {
        const validIds = new Set(allProviders.map(p => p.id));
        const filteredIds = savedFilter.filter(id => validIds.has(id));
        // Include all providers by default (including surgeons from surgeries)
        const allIds = new Set(allProviders.map(p => p.id));
        // Merge saved filter with any new surgeons
        filteredIds.forEach(id => allIds.has(id));
        setSelectedProviderIds(allIds);
      } else {
        // Select all providers including surgeons from surgeries
        setSelectedProviderIds(new Set(allProviders.map(p => p.id)));
      }
      setHasLoadedPreferences(true);
    }
  }, [allProviders, userPreferences, hospitalId, hasLoadedPreferences]);

  const filteredProviders = useMemo(() => {
    if (selectedProviderIds.size === 0) return allProviders;
    return allProviders.filter(p => selectedProviderIds.has(p.id));
  }, [allProviders, selectedProviderIds]);

  const isFiltered = selectedProviderIds.size > 0 && selectedProviderIds.size < allProviders.length;

  // Filter surgeries based on selected providers
  const providerSurgeries = useMemo(() => {
    const selectedIds = selectedProviderIds.size > 0 ? selectedProviderIds : new Set(allProviders.map(p => p.id));
    return allSurgeries.filter(surgery => {
      const resourceId = getSurgeonResourceId(surgery);
      return resourceId && selectedIds.has(resourceId);
    });
  }, [allSurgeries, selectedProviderIds, allProviders]);

  // Fetch provider absences (Timebutler sync)
  const { data: providerAbsences = [] } = useQuery<ProviderAbsence[]>({
    queryKey: [`/api/clinic/${hospitalId}/absences`, format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(
        `/api/clinic/${hospitalId}/absences?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId,
    refetchInterval: 60000,
  });

  // Fetch provider time offs (manually created) - expanded for recurring entries
  const { data: providerTimeOffs = [] } = useQuery<ProviderTimeOff[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/time-off`, format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd'), 'expanded'],
    queryFn: async () => {
      const response = await fetch(
        `/api/clinic/${hospitalId}/units/${unitId}/time-off?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}&expand=true`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId && !!unitId,
    refetchInterval: 60000,
  });

  // Fetch provider availability windows (date-specific availability)
  const { data: availabilityWindows = [] } = useQuery<ProviderAvailabilityWindowData[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/availability-windows`, format(dateRange.start, 'yyyy-MM-dd'), format(dateRange.end, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await fetch(
        `/api/clinic/${hospitalId}/units/${unitId}/availability-windows?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`,
        { credentials: 'include' }
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId && !!unitId,
    refetchInterval: 60000,
  });

  // Get provider availability modes to determine which providers need windows displayed
  const providerModes = useMemo(() => {
    const modes: Record<string, string> = {};
    bookableProviders.forEach(bp => {
      modes[bp.userId] = bp.availabilityMode || 'always_available';
    });
    return modes;
  }, [bookableProviders]);

  // Fetch provider weekly schedules from the API
  interface ProviderScheduleEntry {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive?: boolean;
  }
  
  const { data: weeklySchedulesData = {} } = useQuery<Record<string, ProviderScheduleEntry[]>>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/weekly-schedules`],
    enabled: !!hospitalId && !!unitId,
    staleTime: 60000,
  });

  // Convert weekly schedules to lookup format: providerId -> dayOfWeek -> array of { start, end } slots
  // Supports multiple time slots per day (e.g., 07:00-13:00 and 15:00-17:00)
  const providerSchedules = useMemo(() => {
    const schedules: Record<string, Record<number, { start: string; end: string }[]>> = {};
    
    Object.entries(weeklySchedulesData).forEach(([providerId, availability]) => {
      if (Array.isArray(availability)) {
        schedules[providerId] = {};
        availability.forEach((entry) => {
          if (entry.isActive !== false) {
            if (!schedules[providerId][entry.dayOfWeek]) {
              schedules[providerId][entry.dayOfWeek] = [];
            }
            schedules[providerId][entry.dayOfWeek].push({
              start: entry.startTime,
              end: entry.endTime,
            });
          }
        });
        // Sort slots by start time for each day
        Object.keys(schedules[providerId]).forEach(day => {
          schedules[providerId][parseInt(day)].sort((a, b) => a.start.localeCompare(b.start));
        });
      }
    });
    
    return schedules;
  }, [weeklySchedulesData]);

  // Helper: Check if a time slot is blocked for a specific provider
  // Optional excludeAppointmentId allows excluding a specific appointment (for drag/drop)
  const isSlotBlocked = useCallback((date: Date, providerId: string, excludeAppointmentId?: string): boolean => {
    const slotStart = date.getTime();
    const slotEnd = slotStart + 15 * 60 * 1000; // 15-minute slots

    // Check surgeries
    const hasSurgery = providerSurgeries.some(surgery => {
      const resourceId = getSurgeonResourceId(surgery);
      if (resourceId !== providerId) return false;
      const surgeryStart = new Date(surgery.plannedDate).getTime();
      const surgeryEnd = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime).getTime()
        : surgeryStart + 2 * 60 * 60 * 1000;
      return slotStart < surgeryEnd && slotEnd > surgeryStart;
    });
    if (hasSurgery) return true;

    // Check absences (use proper day boundaries)
    const hasAbsence = providerAbsences.some(absence => {
      if (absence.providerId !== providerId) return false;
      
      // Normalize to day boundaries
      const absenceStart = new Date(absence.startDate);
      absenceStart.setHours(0, 0, 0, 0);
      const absenceEnd = new Date(absence.endDate);
      absenceEnd.setHours(23, 59, 59, 999);
      
      const slotDateOnly = new Date(date);
      slotDateOnly.setHours(0, 0, 0, 0);
      
      // Check if slot date falls within the absence range
      return slotDateOnly >= absenceStart && slotDateOnly <= absenceEnd;
    });
    if (hasAbsence) return true;

    // Check time offs (handle multi-day ranges)
    const hasTimeOff = providerTimeOffs.some(timeOff => {
      if (timeOff.providerId !== providerId) return false;
      
      // Parse start and end dates of the time off range
      const timeOffStart = new Date(timeOff.startDate);
      timeOffStart.setHours(0, 0, 0, 0);
      const timeOffEnd = new Date(timeOff.endDate);
      timeOffEnd.setHours(23, 59, 59, 999);
      
      const slotDate = new Date(date);
      slotDate.setHours(0, 0, 0, 0);
      
      // Check if slot date falls within time off range
      if (slotDate < timeOffStart || slotDate > timeOffEnd) return false;
      
      // Check time range if specified
      if (timeOff.startTime && timeOff.endTime) {
        const [toStartH, toStartM] = timeOff.startTime.split(':').map(Number);
        const [toEndH, toEndM] = timeOff.endTime.split(':').map(Number);
        const toStart = new Date(date);
        toStart.setHours(toStartH, toStartM, 0, 0);
        const toEnd = new Date(date);
        toEnd.setHours(toEndH, toEndM, 0, 0);
        return slotStart < toEnd.getTime() && slotEnd > toStart.getTime();
      }
      return true; // Full day time off
    });
    if (hasTimeOff) return true;

    // Check existing appointments (except cancelled/no_show and optionally excluded one)
    const hasAppointment = appointments.some(appt => {
      if (appt.providerId !== providerId) return false;
      if (appt.status === 'cancelled' || appt.status === 'no_show') return false;
      if (excludeAppointmentId && appt.id === excludeAppointmentId) return false;
      const apptDate = new Date(appt.appointmentDate);
      const [startH, startM] = (appt.startTime || '09:00').split(':').map(Number);
      const [endH, endM] = (appt.endTime || '09:30').split(':').map(Number);
      const apptStart = new Date(apptDate);
      apptStart.setHours(startH, startM, 0, 0);
      const apptEnd = new Date(apptDate);
      apptEnd.setHours(endH, endM, 0, 0);
      return slotStart < apptEnd.getTime() && slotEnd > apptStart.getTime();
    });
    if (hasAppointment) return true;

    // Check provider availability based on mode
    const mode = providerModes[providerId] || 'always_available';
    
    if (mode === 'windows_required') {
      // Must be within an availability window
      const dateStr = format(date, 'yyyy-MM-dd');
      const inWindow = availabilityWindows.some(window => {
        if (window.providerId !== providerId) return false;
        if (window.date !== dateStr) return false;
        const [winStartH, winStartM] = window.startTime.split(':').map(Number);
        const [winEndH, winEndM] = window.endTime.split(':').map(Number);
        const winStart = new Date(date);
        winStart.setHours(winStartH, winStartM, 0, 0);
        const winEnd = new Date(date);
        winEnd.setHours(winEndH, winEndM, 0, 0);
        return slotStart >= winStart.getTime() && slotEnd <= winEnd.getTime();
      });
      if (!inWindow) return true;
    } else {
      // always_available: bookable if within weekly schedule OR availability window
      const schedule = providerSchedules[providerId];
      const dayOfWeek = date.getDay();
      const dayScheduleSlots = schedule ? schedule[dayOfWeek] : undefined;

      const isWithinWeeklySchedule = dayScheduleSlots && dayScheduleSlots.length > 0 && dayScheduleSlots.some(slot => {
        const [schedStartH, schedStartM] = slot.start.split(':').map(Number);
        const [schedEndH, schedEndM] = slot.end.split(':').map(Number);
        const schedStart = new Date(date);
        schedStart.setHours(schedStartH, schedStartM, 0, 0);
        const schedEnd = new Date(date);
        schedEnd.setHours(schedEndH, schedEndM, 0, 0);
        return slotStart >= schedStart.getTime() && slotEnd <= schedEnd.getTime();
      });

      if (!isWithinWeeklySchedule) {
        // Check availability windows as fallback
        const dateStr = format(date, 'yyyy-MM-dd');
        const inWindow = availabilityWindows.some(window => {
          if (window.providerId !== providerId) return false;
          if (window.date !== dateStr) return false;
          const [winStartH, winStartM] = window.startTime.split(':').map(Number);
          const [winEndH, winEndM] = window.endTime.split(':').map(Number);
          const winStart = new Date(date);
          winStart.setHours(winStartH, winStartM, 0, 0);
          const winEnd = new Date(date);
          winEnd.setHours(winEndH, winEndM, 0, 0);
          return slotStart >= winStart.getTime() && slotEnd <= winEnd.getTime();
        });
        if (!inWindow) return true; // Not in schedule AND not in window = blocked
      }
    }

    return false;
  }, [providerSurgeries, providerAbsences, providerTimeOffs, appointments, availabilityWindows, providerModes, providerSchedules]);

  // Slot prop getter for visual unavailability
  const slotPropGetter = useCallback((date: Date, resourceId?: string | number) => {
    if (!resourceId || typeof resourceId !== 'string') return {};
    
    const blocked = isSlotBlocked(date, resourceId);
    if (blocked) {
      return {
        className: 'rbc-slot-unavailable',
        style: {
          backgroundColor: '#f1f5f9',
          cursor: 'not-allowed',
        },
      };
    }
    return {};
  }, [isSlotBlocked]);

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    // Appointment events
    const appointmentEvents = appointments.map((appt) => {
      const patientName = appt.patient
        ? `${appt.patient.surname}, ${appt.patient.firstName}`
        : t('appointments.unknownPatient', 'Unknown Patient');
      const serviceName = appt.service?.name || "";
      
      const appointmentDate = new Date(appt.appointmentDate);
      
      // Use actual times when available (for in_progress/completed appointments)
      let start: Date;
      let end: Date;
      
      const actualStart = (appt as any).actualStartTime;
      const actualEnd = (appt as any).actualEndTime;
      
      if (actualStart) {
        // Use actual start time
        start = new Date(actualStart);
      } else {
        // Fall back to scheduled time
        const [startHour, startMin] = (appt.startTime || "09:00").split(':').map(Number);
        start = new Date(appointmentDate);
        start.setHours(startHour, startMin, 0, 0);
      }
      
      if (actualEnd) {
        // Use actual end time
        end = new Date(actualEnd);
      } else {
        // Fall back to scheduled end time
        const [endHour, endMin] = (appt.endTime || "09:30").split(':').map(Number);
        end = new Date(appointmentDate);
        end.setHours(endHour, endMin, 0, 0);
      }
      
      return {
        id: appt.id,
        title: `${serviceName ? serviceName + ' - ' : ''}${patientName}`,
        start,
        end,
        resource: appt.providerId,
        appointmentId: appt.id,
        patientId: appt.patientId,
        patientName,
        serviceName,
        status: appt.status,
        notes: appt.notes,
        isSurgeryBlock: false,
      };
    });

    // Surgery block events (gray, non-editable)
    // Only include surgeries where resourceId is in the filtered providers list
    const providerIdSet = new Set(filteredProviders.map(p => p.id));
    const surgeryBlockEvents = providerSurgeries
      .filter((surgery) => {
        const resourceId = getSurgeonResourceId(surgery);
        return resourceId && providerIdSet.has(resourceId);
      })
      .map((surgery) => {
        const patientName = surgery.patientSurname && surgery.patientFirstName
          ? `${surgery.patientSurname}, ${surgery.patientFirstName}`
          : t('appointments.patient', 'Patient');
        
        const start = new Date(surgery.plannedDate);
        
        // Calculate end time: use actualEndTime if available, otherwise default to 2 hours
        let end: Date;
        if (surgery.actualEndTime) {
          end = new Date(surgery.actualEndTime);
        } else {
          end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours
        }
        
        const resourceId = getSurgeonResourceId(surgery);
        
        return {
          id: `surgery-${surgery.id}`,
          title: surgery.plannedSurgery || t('appointments.surgery', 'Surgery'),
          start,
          end,
          resource: resourceId!,
          appointmentId: surgery.id,
          patientId: surgery.patientId,
          patientName,
          serviceName: surgery.plannedSurgery || '',
          status: 'surgery_block',
          notes: null,
          isSurgeryBlock: true,
          surgeryName: surgery.plannedSurgery,
        };
      });

    // Absence block events (colored by type, non-editable)
    // Only include absences where providerId is in the filtered providers list
    const absenceBlockEvents: CalendarEvent[] = [];
    providerAbsences
      .filter((absence) => providerIdSet.has(absence.providerId))
      .forEach((absence) => {
        const absenceStart = new Date(absence.startDate);
        const absenceEnd = new Date(absence.endDate);
        
        // Create all-day events for each day in the absence range that falls within dateRange
        const currentDate = new Date(Math.max(absenceStart.getTime(), dateRange.start.getTime()));
        currentDate.setHours(0, 0, 0, 0);
        
        const rangeEnd = new Date(Math.min(absenceEnd.getTime(), dateRange.end.getTime()));
        rangeEnd.setHours(23, 59, 59, 999);
        
        while (currentDate <= rangeEnd) {
          const dayStart = new Date(currentDate);
          dayStart.setHours(8, 0, 0, 0); // Start at 8 AM
          
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(18, 0, 0, 0); // End at 6 PM
          
          const icon = ABSENCE_TYPE_ICONS[absence.absenceType] || ABSENCE_TYPE_ICONS.default;
          const labelConfig = ABSENCE_TYPE_LABEL_KEYS[absence.absenceType] || ABSENCE_TYPE_LABEL_KEYS.default;
          const defaultLabel = t(labelConfig.key, labelConfig.fallback);
          const displayLabel = absence.notes || defaultLabel;
          
          absenceBlockEvents.push({
            id: `absence-${absence.id}-${format(currentDate, 'yyyy-MM-dd')}`,
            title: `${icon} ${displayLabel}`,
            start: dayStart,
            end: dayEnd,
            resource: absence.providerId,
            appointmentId: absence.id,
            patientId: '',
            patientName: '',
            serviceName: displayLabel,
            status: `absence_${absence.absenceType}`,
            notes: null,
            isSurgeryBlock: false,
            isAbsenceBlock: true,
            absenceType: absence.absenceType,
          });
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

    // Time off block events (manually set via availability dialog)
    // Only include time offs where providerId is in the filtered providers list
    const timeOffBlockEvents: CalendarEvent[] = [];
    providerTimeOffs
      .filter((timeOff) => providerIdSet.has(timeOff.providerId))
      .forEach((timeOff) => {
        const timeOffStart = new Date(timeOff.startDate);
        const timeOffEnd = new Date(timeOff.endDate);
        
        // Create events for each day in the time off range that falls within dateRange
        const currentDate = new Date(Math.max(timeOffStart.getTime(), dateRange.start.getTime()));
        currentDate.setHours(0, 0, 0, 0);
        
        const rangeEnd = new Date(Math.min(timeOffEnd.getTime(), dateRange.end.getTime()));
        rangeEnd.setHours(23, 59, 59, 999);
        
        while (currentDate <= rangeEnd) {
          const dayStart = new Date(currentDate);
          const dayEnd = new Date(currentDate);
          
          // If specific times are set, use them; otherwise use full day (8-18)
          if (timeOff.startTime && timeOff.endTime) {
            const [startH, startM] = timeOff.startTime.split(':').map(Number);
            const [endH, endM] = timeOff.endTime.split(':').map(Number);
            dayStart.setHours(startH, startM, 0, 0);
            dayEnd.setHours(endH, endM, 0, 0);
          } else {
            dayStart.setHours(8, 0, 0, 0);
            dayEnd.setHours(18, 0, 0, 0);
          }
          
          const reason = timeOff.reason || t('appointments.timeOff', 'Time Off');
          
          timeOffBlockEvents.push({
            id: `timeoff-${timeOff.id}-${format(currentDate, 'yyyy-MM-dd')}`,
            title: `🚫 ${reason}`,
            start: dayStart,
            end: dayEnd,
            resource: timeOff.providerId,
            appointmentId: timeOff.id,
            patientId: '',
            patientName: '',
            serviceName: reason,
            status: 'time_off',
            notes: timeOff.notes,
            isSurgeryBlock: false,
            isAbsenceBlock: false,
            isTimeOffBlock: true,
            timeOffReason: reason,
          });
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

    // Availability window events (green, shows when provider IS available)
    // Only display windows for providers with "windows_required" mode
    const availabilityWindowEvents: CalendarEvent[] = [];
    availabilityWindows
      .filter((window) => providerIdSet.has(window.providerId))
      .forEach((window) => {
        const windowDate = new Date(window.date);
        const [startH, startM] = window.startTime.split(':').map(Number);
        const [endH, endM] = window.endTime.split(':').map(Number);
        
        const dayStart = new Date(windowDate);
        dayStart.setHours(startH, startM, 0, 0);
        
        const dayEnd = new Date(windowDate);
        dayEnd.setHours(endH, endM, 0, 0);
        
        const notes = window.notes || t('appointments.available', 'Available');
        
        availabilityWindowEvents.push({
          id: `window-${window.id}`,
          title: `✓ ${notes}`,
          start: dayStart,
          end: dayEnd,
          resource: window.providerId,
          appointmentId: '',
          patientId: '',
          patientName: '',
          serviceName: notes,
          status: 'availability_window',
          notes: window.notes,
          isSurgeryBlock: false,
          isAbsenceBlock: false,
          isTimeOffBlock: false,
          isAvailabilityWindow: true,
          windowId: window.id,
        });
      });

    return [...appointmentEvents, ...surgeryBlockEvents, ...absenceBlockEvents, ...timeOffBlockEvents, ...availabilityWindowEvents];
  }, [appointments, providerSurgeries, providerAbsences, providerTimeOffs, availabilityWindows, filteredProviders, dateRange, t]);

  const resources: CalendarResource[] = useMemo(() => {
    return filteredProviders.map((provider) => ({
      id: provider.id,
      title: `${provider.firstName} ${provider.lastName}`,
    }));
  }, [filteredProviders]);

  const rescheduleAppointmentMutation = useMutation({
    mutationFn: async ({ appointmentId, appointmentDate, startTime, endTime, providerId }: {
      appointmentId: string;
      appointmentDate: string;
      startTime: string;
      endTime: string;
      providerId?: string;
    }) => {
      const body: any = { appointmentDate, startTime, endTime };
      if (providerId) body.providerId = providerId;
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${appointmentId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.rescheduled', 'Appointment rescheduled successfully') });
    },
    onError: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.rescheduleFailed', 'Failed to reschedule appointment'), variant: "destructive" });
    },
  });


  const handleEventDrop = useCallback(async ({ event, start, end, resourceId }: any) => {
    // Don't allow dragging surgery, absence, time off, or availability window blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock || event.isTimeOffBlock || event.isAvailabilityWindow) return;
    
    const appointmentId = event.appointmentId;
    const newProviderId = resourceId || event.resource;
    
    // Check if the target slot is blocked (excluding the current appointment from overlap check)
    const startTime = start.getTime();
    const endTime = end.getTime();
    const slotDuration = 15 * 60 * 1000;
    
    for (let time = startTime; time < endTime; time += slotDuration) {
      const slotDate = new Date(time);
      // Pass appointmentId to exclude it from the overlap check
      const blocked = isSlotBlocked(slotDate, newProviderId, appointmentId);
      if (blocked) {
        toast({
          title: t('appointments.slotUnavailable', 'Time slot unavailable'),
          description: t('appointments.slotUnavailableDesc', 'This time slot is not available. Please select a different time.'),
          variant: 'destructive',
        });
        return;
      }
    }
    
    rescheduleAppointmentMutation.mutate({
      appointmentId,
      appointmentDate: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
      providerId: newProviderId !== event.resource ? newProviderId : undefined,
    });
  }, [rescheduleAppointmentMutation, isSlotBlocked, toast, t]);

  const handleEventResize = useCallback(async ({ event, start, end }: any) => {
    // Don't allow resizing surgery, absence, time off, or availability window blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock || event.isTimeOffBlock || event.isAvailabilityWindow) return;
    
    const appointmentId = event.appointmentId;
    const providerId = event.resource;
    
    // Validate the new time range doesn't overlap with blocked slots
    const startTime = start.getTime();
    const endTime = end.getTime();
    const slotDuration = 15 * 60 * 1000;
    
    for (let time = startTime; time < endTime; time += slotDuration) {
      const slotDate = new Date(time);
      const blocked = isSlotBlocked(slotDate, providerId, appointmentId);
      if (blocked) {
        toast({
          title: t('appointments.slotUnavailable', 'Time slot unavailable'),
          description: t('appointments.slotUnavailableDesc', 'This time slot is not available. Please select a different time.'),
          variant: 'destructive',
        });
        return;
      }
    }
    
    rescheduleAppointmentMutation.mutate({
      appointmentId,
      appointmentDate: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
    });
  }, [rescheduleAppointmentMutation, isSlotBlocked, toast, t]);

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if ((currentView === "day" || currentView === "week") && slotInfo.action === 'select') {
      const providerId = slotInfo.resourceId as string;
      
      // Check if any slot in the selection range is blocked
      if (providerId) {
        const startTime = slotInfo.start.getTime();
        const endTime = slotInfo.end.getTime();
        const slotDuration = 15 * 60 * 1000; // 15 minutes
        
        for (let time = startTime; time < endTime; time += slotDuration) {
          if (isSlotBlocked(new Date(time), providerId)) {
            toast({
              title: t('appointments.slotUnavailable', 'Time slot unavailable'),
              description: t('appointments.slotUnavailableDesc', 'This time slot is not available for booking. Please select a different time.'),
              variant: 'destructive',
            });
            return;
          }
        }
      }
      
      if (onBookAppointment) {
        onBookAppointment({
          providerId,
          date: slotInfo.start,
          endDate: slotInfo.end,
        });
      }
    }
  }, [currentView, onBookAppointment, isSlotBlocked, toast, t]);

  const handleSelectEvent = useCallback((event: CalendarEvent, _e: React.SyntheticEvent) => {
    // Don't allow clicking on surgery, absence, or availability window blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock || event.isAvailabilityWindow) return;
    
    // Handle time-off block clicks - open edit dialog
    if (event.isTimeOffBlock && event.appointmentId) {
      const timeOff = providerTimeOffs.find((to: ProviderTimeOff) => to.id === event.appointmentId);
      if (timeOff) {
        const provider = providers.find(p => p.id === timeOff.providerId);
        const providerName = provider ? `${provider.firstName} ${provider.lastName}`.trim() : '';
        setSelectedTimeOff(timeOff);
        setSelectedTimeOffProviderName(providerName);
        setEditTimeOffOpen(true);
      }
      return;
    }
    
    // Skip if no valid appointmentId
    if (!event.appointmentId) return;
    
    if (onEventClick) {
      const appointment = appointments.find(a => a.id === event.appointmentId);
      if (appointment) {
        onEventClick(appointment);
      }
    }
  }, [onEventClick, appointments, providerTimeOffs, providers]);

  const eventStyleGetter: EventPropGetter<CalendarEvent> = useCallback((event: CalendarEvent) => {
    // Surgery blocks: dark slate, non-interactive with better contrast
    if (event.isSurgeryBlock) {
      return {
        style: {
          backgroundColor: '#475569',
          borderColor: '#334155',
          color: '#f1f5f9',
          borderRadius: '4px',
          opacity: 0.8,
          border: '1px solid',
          display: 'block',
          cursor: 'not-allowed',
        },
      };
    }
    
    // Absence blocks: all red, non-interactive
    if (event.isAbsenceBlock) {
      return {
        style: {
          backgroundColor: '#dc2626',
          borderColor: '#b91c1c',
          color: '#ffffff',
          borderRadius: '4px',
          opacity: 0.9,
          border: '1px solid',
          display: 'block',
          cursor: 'not-allowed',
        },
      };
    }
    
    // Time off blocks: orange, clickable for editing
    if (event.isTimeOffBlock) {
      return {
        style: {
          backgroundColor: '#ea580c',
          borderColor: '#c2410c',
          color: '#ffffff',
          borderRadius: '4px',
          opacity: 0.9,
          border: '1px solid',
          display: 'block',
          cursor: 'pointer',
        },
      };
    }
    
    // Availability windows: green, shows when provider IS available
    if (event.isAvailabilityWindow) {
      return {
        style: {
          backgroundColor: '#22c55e',
          borderColor: '#16a34a',
          color: '#ffffff',
          borderRadius: '4px',
          opacity: 0.15,
          border: '2px dashed #22c55e',
          display: 'block',
          cursor: 'default',
          pointerEvents: 'none' as const,
        },
      };
    }
    
    const colors = STATUS_COLORS[event.status] || STATUS_COLORS.scheduled;
    const isCancelled = event.status === 'cancelled';
    
    const style: any = {
      backgroundColor: colors.bg,
      borderColor: colors.border,
      color: '#ffffff',
      borderRadius: '4px',
      opacity: isCancelled ? 0.7 : 1,
      border: '1px solid',
      display: 'block',
      textDecoration: isCancelled ? 'line-through' : 'none',
    };
    
    return { style };
  }, []);

  const EventComponent: React.FC<EventProps<CalendarEvent>> = useCallback(({ event }: EventProps<CalendarEvent>) => {
    // Surgery block display
    if (event.isSurgeryBlock) {
      return (
        <div className="flex flex-col h-full p-1" data-testid={`surgery-block-${event.appointmentId}`}>
          <div className="font-bold text-xs flex items-center gap-1">
            <Scissors className="w-3 h-3" />
            {t('appointments.surgery', 'Surgery')}
          </div>
          <div className="text-xs flex items-center gap-1">
            <Lock className="w-3 h-3" />
            {event.surgeryName || 'OP'}
          </div>
        </div>
      );
    }
    
    // Absence block display
    if (event.isAbsenceBlock) {
      return (
        <div className="flex flex-col h-full p-1" data-testid={`absence-block-${event.appointmentId}`}>
          <div className="font-bold text-xs">
            {event.title}
          </div>
        </div>
      );
    }
    
    // Time off block display
    if (event.isTimeOffBlock) {
      return (
        <div className="flex flex-col h-full p-1" data-testid={`timeoff-block-${event.appointmentId}`}>
          <div className="font-bold text-xs">
            {event.title}
          </div>
        </div>
      );
    }
    
    const isCancelled = event.status === 'cancelled';
    return (
      <div className="flex flex-col h-full p-1" data-testid={`appointment-event-${event.appointmentId}`}>
        <div className={`font-bold text-xs ${isCancelled ? 'line-through' : ''}`}>
          {event.serviceName || t('appointments.appointment', 'Appointment')}
        </div>
        <div className={`text-xs ${isCancelled ? 'line-through' : ''}`}>
          {event.patientName}
        </div>
      </div>
    );
  }, [t]);

  const MonthDateHeader = useCallback(({ date }: { date: Date }) => {
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
            <div className="w-2 h-2 rounded-full bg-primary" data-testid={`indicator-${date.toISOString()}`}></div>
          </div>
        )}
      </div>
    );
  }, [calendarEvents]);

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

  const goToToday = () => setSelectedDate(new Date());

  const navigatePrevious = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") newDate.setDate(newDate.getDate() - 1);
    else if (currentView === "week") newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") newDate.setDate(newDate.getDate() + 1);
    else if (currentView === "week") newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  const formatDateHeader = () => {
    const dateLocale = i18n.language.startsWith('de') ? de : enGB;
    if (currentView === "month") return format(selectedDate, 'MMMM yyyy', { locale: dateLocale });
    if (currentView === "week") {
      const start = new Date(selectedDate);
      start.setDate(start.getDate() - start.getDay() + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`;
    }
    return format(selectedDate, 'EEEE, dd/MM/yyyy', { locale: dateLocale });
  };

  if (!hospitalId || !unitId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{t('appointments.noHospitalSelected', 'No clinic selected')}</h3>
            <p className="text-muted-foreground">{t('appointments.selectClinic', 'Please select a clinic to view appointments')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="clinic-calendar">
      {/* Header with view switcher and navigation */}
      <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4 bg-background border-b">
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
            {t('opCalendar.today', 'Today')}
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

        <span className="font-semibold text-sm sm:text-base flex-shrink-0" data-testid="text-calendar-date">
          {formatDateHeader()}
        </span>

        <div className="flex gap-1.5 sm:gap-2 ml-auto flex-wrap">
          <Button
            variant={isFiltered ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterDialogOpen(true)}
            data-testid="button-filter-providers"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm relative"
          >
            <Filter className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('appointments.filter', 'Filter')}</span>
            {isFiltered && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {selectedProviderIds.size}
              </Badge>
            )}
          </Button>
          <Button
            variant={currentView === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("day")}
            data-testid="button-view-day"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.day', 'Day')}</span>
          </Button>
          <Button
            variant={currentView === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("week")}
            data-testid="button-view-week"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.week', 'Week')}</span>
          </Button>
          <Button
            variant={currentView === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("month")}
            data-testid="button-view-month"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('opCalendar.month', 'Month')}</span>
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 overflow-auto px-4 pb-4">
        <div className="h-full calendar-container">
        {providersLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : resources.length === 0 ? (
          <Card className="h-full flex items-center justify-center">
            <CardContent className="py-12 text-center">
              <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">{t('appointments.noProviders', 'No providers available')}</h3>
              <p className="text-muted-foreground mb-4">{t('appointments.addProviders', 'Add staff members to your hospital to schedule appointments')}</p>
            </CardContent>
          </Card>
        ) : currentView === "week" ? (
          <AppointmentsWeekView
            providers={filteredProviders}
            appointments={appointments}
            providerAbsences={providerAbsences}
            providerTimeOffs={providerTimeOffs}
            selectedDate={selectedDate}
            onEventClick={(appt) => onEventClick?.(appt)}
            onCanvasClick={(providerId, time) => {
              const endTime = new Date(time.getTime() + 30 * 60 * 1000);
              onBookAppointment?.({ providerId, date: time, endDate: endTime });
            }}
            onDayClick={(date) => {
              setSelectedDate(date);
              setCurrentView("day");
            }}
            onProviderClick={onProviderClick}
          />
        ) : (
          <DragAndDropCalendar
            localizer={localizer}
            events={currentView === "month" ? [] : calendarEvents}
            resources={currentView === "day" ? resources : undefined}
            resourceIdAccessor="id"
            resourceTitleAccessor="title"
            resourceAccessor="resource"
            startAccessor="start"
            endAccessor="end"
            view={currentView as View}
            onView={(view) => setCurrentView(view as ViewType)}
            date={selectedDate}
            onNavigate={setSelectedDate}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            selectable
            resizable
            draggableAccessor={(event: CalendarEvent) => !event.isSurgeryBlock && !event.isAbsenceBlock && !event.isTimeOffBlock}
            resizableAccessor={(event: CalendarEvent) => !event.isSurgeryBlock && !event.isAbsenceBlock && !event.isTimeOffBlock}
            toolbar={false}
            step={15}
            timeslots={4}
            min={new Date(2024, 0, 1, 6, 0, 0)}
            max={new Date(2024, 0, 1, 22, 0, 0)}
            formats={formats}
            eventPropGetter={eventStyleGetter}
            slotPropGetter={slotPropGetter}
            components={{
              event: EventComponent,
              month: {
                dateHeader: MonthDateHeader,
              },
              dateCellWrapper: DateCellWrapper,
              resourceHeader: ({ resource }: { resource: CalendarResource }) => (
                <button
                  onClick={() => onProviderClick?.(resource.id)}
                  className="w-full text-center py-2 px-1 hover:bg-muted/50 transition-colors cursor-pointer font-medium text-sm"
                  title={t('appointments.clickToManageAvailability', 'Click to manage availability')}
                  data-testid={`provider-header-${resource.id}`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <Settings className="h-3 w-3 opacity-50" />
                    {resource.title}
                  </span>
                </button>
              ),
            }}
            messages={{
              today: t('opCalendar.today', 'Today'),
              previous: t('opCalendar.previous', 'Back'),
              next: t('opCalendar.next', 'Next'),
              month: t('opCalendar.month', 'Month'),
              week: t('opCalendar.week', 'Week'),
              day: t('opCalendar.day', 'Day'),
              agenda: t('opCalendar.agenda', 'Agenda'),
              noEventsInRange: t('appointments.noAppointments', 'No appointments in this range'),
            }}
            style={{ minHeight: '600px' }}
            popup
          />
        )}
        </div>
      </div>

      {/* Status legend passed from parent */}
      {statusLegend}

      <ProviderFilterDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        hospitalId={hospitalId}
        providers={providers}
        selectedProviderIds={selectedProviderIds}
        onApplyFilter={(newSelectedIds) => {
          setSelectedProviderIds(newSelectedIds);
        }}
      />

      <EditTimeOffDialog
        open={editTimeOffOpen}
        onOpenChange={setEditTimeOffOpen}
        timeOff={selectedTimeOff}
        hospitalId={hospitalId}
        unitId={unitId}
        providerName={selectedTimeOffProviderName}
      />

    </div>
  );
}
