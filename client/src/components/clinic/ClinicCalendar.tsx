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
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2, Plus, User, Settings } from "lucide-react";
import { format } from "date-fns";
import { de, enGB } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";
import AppointmentsTimelineWeekView from "./AppointmentsTimelineWeekView";

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
};

interface ClinicCalendarProps {
  hospitalId: string;
  unitId: string;
  onBookAppointment?: (data: { providerId: string; date: Date; endDate?: Date }) => void;
  onEventClick?: (appointment: AppointmentWithDetails) => void;
}

export default function ClinicCalendar({ 
  hospitalId, 
  unitId, 
  onBookAppointment,
  onEventClick 
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

  const { data: providers = [], isLoading: providersLoading } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers`],
    enabled: !!hospitalId && !!unitId,
  });

  const { data: appointments = [] } = useQuery<AppointmentWithDetails[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/appointments?startDate=${format(dateRange.start, 'yyyy-MM-dd')}&endDate=${format(dateRange.end, 'yyyy-MM-dd')}`],
    enabled: !!hospitalId && !!unitId,
    refetchInterval: 30000,
  });

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return appointments.map((appt) => {
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
      };
    });
  }, [appointments]);

  const resources: CalendarResource[] = useMemo(() => {
    return providers.map((provider) => ({
      id: provider.id,
      title: `${provider.firstName} ${provider.lastName}`,
    }));
  }, [providers]);

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
    if (onEventClick) {
      const appointment = appointments.find(a => a.id === event.appointmentId);
      if (appointment) {
        onEventClick(appointment);
      }
    }
  }, [onEventClick, appointments]);

  const eventStyleGetter: EventPropGetter<CalendarEvent> = useCallback((event: CalendarEvent) => {
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
    <div className="flex flex-col min-h-[600px]" data-testid="clinic-calendar">
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
      <div className="flex-1 p-2 sm:p-4" style={{ minHeight: '500px' }}>
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
            providers={providers}
            appointments={appointments}
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
            toolbar={false}
            step={15}
            timeslots={4}
            min={new Date(2024, 0, 1, 7, 0, 0)}
            max={new Date(2024, 0, 1, 20, 0, 0)}
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
  );
}
