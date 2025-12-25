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
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Plus, User, Settings, Filter, Lock, Scissors } from "lucide-react";
import { format } from "date-fns";
import { de, enGB } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";
import AppointmentsTimelineWeekView from "./AppointmentsTimelineWeekView";
import ProviderFilterDialog from "./ProviderFilterDialog";

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
  patientId: string;
  patientName: string;
  serviceName: string;
  status: string;
  notes: string | null;
  isSurgeryBlock?: boolean;
  surgeryName?: string;
  isAbsenceBlock?: boolean;
  absenceType?: string;
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
  // All absence types are red
  absence_vacation: { bg: '#dc2626', border: '#b91c1c' },
  absence_sick: { bg: '#dc2626', border: '#b91c1c' },
  absence_training: { bg: '#dc2626', border: '#b91c1c' },
  absence_parental: { bg: '#dc2626', border: '#b91c1c' },
  absence_homeoffice: { bg: '#dc2626', border: '#b91c1c' },
  absence_sabbatical: { bg: '#dc2626', border: '#b91c1c' },
  absence_other: { bg: '#dc2626', border: '#b91c1c' },
};

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  sick: 'Sick Leave',
  training: 'Training',
  parental: 'Parental Leave',
  homeoffice: 'Home Office',
  sabbatical: 'Sabbatical',
  default: 'Absent',
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
  statusLegend?: React.ReactNode;
}

export default function ClinicCalendar({ 
  hospitalId, 
  unitId, 
  onBookAppointment,
  onEventClick,
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

  const { data: providers = [], isLoading: providersLoading } = useQuery<{ id: string; firstName: string; lastName: string; email?: string; role?: string }[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers`],
    enabled: !!hospitalId && !!unitId,
  });

  const { data: userPreferences } = useQuery<{ clinicProviderFilter?: Record<string, string[]> }>({
    queryKey: ['/api/user/preferences'],
    staleTime: 1000 * 60 * 5,
  });

  const { data: appointments = [] } = useQuery<AppointmentWithDetails[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/appointments?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`],
    enabled: !!hospitalId && !!unitId,
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

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    // Appointment events
    const appointmentEvents = appointments.map((appt) => {
      const patientName = appt.patient 
        ? `${appt.patient.surname}, ${appt.patient.firstName}` 
        : "Unknown Patient";
      const serviceName = appt.service?.name || "";
      
      const appointmentDate = new Date(appt.appointmentDate);
      const [startHour, startMin] = (appt.startTime || "09:00").split(':').map(Number);
      const [endHour, endMin] = (appt.endTime || "09:30").split(':').map(Number);
      
      const start = new Date(appointmentDate);
      start.setHours(startHour, startMin, 0, 0);
      
      const end = new Date(appointmentDate);
      end.setHours(endHour, endMin, 0, 0);
      
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
          : 'Patient';
        
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
          title: surgery.plannedSurgery || 'Surgery',
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
          const label = ABSENCE_TYPE_LABELS[absence.absenceType] || ABSENCE_TYPE_LABELS.default;
          
          absenceBlockEvents.push({
            id: `absence-${absence.id}-${format(currentDate, 'yyyy-MM-dd')}`,
            title: `${icon} ${label}`,
            start: dayStart,
            end: dayEnd,
            resource: absence.providerId,
            appointmentId: absence.id,
            patientId: '',
            patientName: '',
            serviceName: label,
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

    return [...appointmentEvents, ...surgeryBlockEvents, ...absenceBlockEvents];
  }, [appointments, providerSurgeries, providerAbsences, filteredProviders, dateRange]);

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
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/appointments`] });
      toast({ title: t('appointments.rescheduled', 'Appointment rescheduled successfully') });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/appointments`] });
      toast({ title: t('appointments.rescheduleFailed', 'Failed to reschedule appointment'), variant: "destructive" });
    },
  });

  const handleEventDrop = useCallback(async ({ event, start, end, resourceId }: any) => {
    // Don't allow dragging surgery or absence blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock) return;
    
    const appointmentId = event.appointmentId;
    const newProviderId = resourceId || event.resource;
    
    rescheduleAppointmentMutation.mutate({
      appointmentId,
      appointmentDate: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
      providerId: newProviderId !== event.resource ? newProviderId : undefined,
    });
  }, [rescheduleAppointmentMutation]);

  const handleEventResize = useCallback(async ({ event, start, end }: any) => {
    // Don't allow resizing surgery or absence blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock) return;
    
    rescheduleAppointmentMutation.mutate({
      appointmentId: event.appointmentId,
      appointmentDate: format(start, 'yyyy-MM-dd'),
      startTime: format(start, 'HH:mm'),
      endTime: format(end, 'HH:mm'),
    });
  }, [rescheduleAppointmentMutation]);

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    if ((currentView === "day" || currentView === "week") && slotInfo.action === 'select') {
      if (onBookAppointment) {
        onBookAppointment({
          providerId: slotInfo.resourceId as string,
          date: slotInfo.start,
          endDate: slotInfo.end,
        });
      }
    }
  }, [currentView, onBookAppointment]);

  const handleSelectEvent = useCallback((event: CalendarEvent, _e: React.SyntheticEvent) => {
    // Don't allow clicking on surgery or absence blocks
    if (event.isSurgeryBlock || event.isAbsenceBlock) return;
    
    if (onEventClick) {
      const appointment = appointments.find(a => a.id === event.appointmentId);
      if (appointment) {
        onEventClick(appointment);
      }
    }
  }, [onEventClick, appointments]);

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
    <div className="flex flex-col min-h-screen" data-testid="clinic-calendar">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation('/clinic/availability')}
            data-testid="button-manage-availability"
            className="h-8 px-2 sm:h-9 sm:px-3 text-xs sm:text-sm"
          >
            <Settings className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t('appointments.availability', 'Availability')}</span>
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex-1 min-h-0 px-4 pb-4">
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
          <AppointmentsTimelineWeekView
            providers={filteredProviders}
            appointments={appointments}
            providerSurgeries={providerSurgeries}
            providerAbsences={providerAbsences}
            selectedDate={selectedDate}
            onEventClick={(appt) => onEventClick?.(appt)}
            onEventDrop={(appointmentId, newStart, newEnd, newProviderId) => {
              rescheduleAppointmentMutation.mutate({
                appointmentId,
                appointmentDate: format(newStart, 'yyyy-MM-dd'),
                startTime: format(newStart, 'HH:mm'),
                endTime: format(newEnd, 'HH:mm'),
                providerId: newProviderId,
              });
            }}
            onCanvasClick={(providerId, time) => {
              const endTime = new Date(time.getTime() + 30 * 60 * 1000);
              onBookAppointment?.({ providerId, date: time, endDate: endTime });
            }}
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
            draggableAccessor={(event: CalendarEvent) => !event.isSurgeryBlock && !event.isAbsenceBlock}
            resizableAccessor={(event: CalendarEvent) => !event.isSurgeryBlock && !event.isAbsenceBlock}
            toolbar={false}
            step={15}
            timeslots={4}
            min={new Date(2024, 0, 1, 6, 0, 0)}
            max={new Date(2024, 0, 1, 22, 0, 0)}
            formats={formats}
            eventPropGetter={eventStyleGetter}
            components={{
              event: EventComponent,
              month: {
                dateHeader: MonthDateHeader,
              },
              dateCellWrapper: DateCellWrapper,
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
    </div>
  );
}
