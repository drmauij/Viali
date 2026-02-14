import { useMemo } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";

type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
};

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

interface AppointmentsWeekViewProps {
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  appointments: AppointmentWithDetails[];
  providerAbsences?: ProviderAbsence[];
  providerTimeOffs?: ProviderTimeOff[];
  selectedDate: Date;
  onEventClick?: (appointment: AppointmentWithDetails) => void;
  onCanvasClick?: (providerId: string, time: Date) => void;
  onDayClick?: (date: Date) => void;
  onProviderClick?: (providerId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-200 dark:bg-blue-900 border-blue-600 text-blue-900 dark:text-blue-100",
  confirmed: "bg-green-200 dark:bg-green-900 border-green-600 text-green-900 dark:text-green-100",
  in_progress: "bg-yellow-200 dark:bg-yellow-900 border-yellow-600 text-yellow-900 dark:text-yellow-100",
  completed: "bg-gray-200 dark:bg-gray-700 border-gray-500 text-gray-700 dark:text-gray-300",
  cancelled: "bg-red-200 dark:bg-red-900 border-red-600 text-red-900 dark:text-red-100 line-through",
  no_show: "bg-orange-200 dark:bg-orange-900 border-orange-600 text-orange-900 dark:text-orange-100",
};

const ABSENCE_COLORS: Record<string, string> = {
  vacation: "bg-purple-100 dark:bg-purple-900/50",
  sick: "bg-red-100 dark:bg-red-900/50",
  training: "bg-blue-100 dark:bg-blue-900/50",
  parental: "bg-pink-100 dark:bg-pink-900/50",
  homeoffice: "bg-teal-100 dark:bg-teal-900/50",
  default: "bg-gray-100 dark:bg-gray-800/50",
};

const ABSENCE_ICONS: Record<string, string> = {
  vacation: "🏖️",
  sick: "🤒",
  training: "📚",
  parental: "👶",
  homeoffice: "🏠",
  default: "🚫",
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

const MIN_ROW_HEIGHT = 80;

export default function AppointmentsWeekView({
  providers,
  appointments,
  providerAbsences = [],
  providerTimeOffs = [],
  selectedDate,
  onEventClick,
  onCanvasClick,
  onDayClick,
  onProviderClick,
}: AppointmentsWeekViewProps) {
  const { t, i18n } = useTranslation();
  
  const momentLocale = i18n.language.startsWith('de') ? 'de' : 'en-gb';
  moment.locale(momentLocale);
  
  const weekDays = useMemo(() => {
    const weekStart = moment(selectedDate).startOf('isoWeek');
    const days = [];
    for (let i = 0; i < 5; i++) {
      days.push(moment(weekStart).add(i, 'days').locale(momentLocale));
    }
    return days;
  }, [selectedDate, momentLocale]);

  const getAbsenceLabel = (type: string): string => {
    const cfg = ABSENCE_TYPE_LABEL_KEYS[type] || ABSENCE_TYPE_LABEL_KEYS.default;
    return t(cfg.key, cfg.fallback);
  };

  const getProviderName = (provider: { firstName: string | null; lastName: string | null }) => {
    const firstName = provider.firstName || '';
    const lastName = provider.lastName || '';
    return `${lastName}, ${firstName}`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '') || t('common.unknown');
  };

  const getAppointmentsForProviderDay = (providerId: string, day: moment.Moment) => {
    const dayStart = day.clone().startOf('day');
    const dayEnd = day.clone().endOf('day');
    
    return appointments.filter(appt => {
      if (appt.providerId !== providerId) return false;
      const apptDate = moment(appt.appointmentDate);
      return apptDate.isBetween(dayStart, dayEnd, 'day', '[]');
    }).sort((a, b) => {
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });
  };

  const getAbsenceForProviderDay = (providerId: string, day: moment.Moment): { type: string; notes?: string | null } | null => {
    const dayDate = day.format('YYYY-MM-DD');
    
    const absence = providerAbsences.find(a => {
      if (a.providerId !== providerId) return false;
      return dayDate >= a.startDate && dayDate <= a.endDate;
    });
    
    if (absence) {
      return { type: absence.absenceType, notes: absence.notes };
    }
    
    const timeOff = providerTimeOffs.find(t => {
      if (t.providerId !== providerId) return false;
      return dayDate >= t.startDate && dayDate <= t.endDate;
    });
    
    if (timeOff) {
      return { type: timeOff.reason || 'default', notes: timeOff.notes };
    }
    
    return null;
  };

  const getPatientName = (appt: AppointmentWithDetails) => {
    if (appt.patient) {
      return `${appt.patient.surname || ''}, ${appt.patient.firstName || ''}`.trim().replace(/^,\s*/, '');
    }
    return t('clinic.appointments.unknownPatient');
  };

  const getStatusClass = (status: string | null) => {
    return STATUS_COLORS[status || 'scheduled'] || STATUS_COLORS.scheduled;
  };

  const isToday = (day: moment.Moment) => {
    return day.isSame(moment(), 'day');
  };

  const formatDayHeader = (day: moment.Moment) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[day.day()];
    const translatedDay = t(`opCalendar.weekView.days.${dayKey}`);
    return `${translatedDay} ${day.format('DD.MM')}`;
  };

  const handleCanvasClick = (providerId: string, day: moment.Moment) => {
    if (!onCanvasClick) return;
    const clickTime = day.clone().hour(9).minute(0).toDate();
    onCanvasClick(providerId, clickTime);
  };

  return (
    <div className="appointments-week-view h-full flex flex-col" data-testid="appointments-week-view">
      <div className="flex border-b bg-muted/30">
        <div className="w-40 flex-shrink-0 p-2 border-r text-xs text-muted-foreground font-medium">
          {t('clinic.appointments.provider')}
        </div>
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className={cn(
              "flex-1 p-2 text-center border-r text-sm font-medium cursor-pointer hover:bg-primary/20 transition-colors",
              isToday(day) && "bg-primary/10 text-primary"
            )}
            onClick={() => onDayClick?.(day.toDate())}
            data-testid={`day-header-${day.format('YYYY-MM-DD')}`}
          >
            {formatDayHeader(day)}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {providers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            {t('clinic.appointments.noProviders')}
          </div>
        ) : (
          providers.map((provider) => (
            <div key={provider.id} className="flex border-b" data-testid={`provider-row-${provider.id}`}>
              <div 
                className="w-40 flex-shrink-0 p-2 border-r bg-muted/20 font-medium text-sm cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => onProviderClick?.(provider.id)}
                style={{ minHeight: MIN_ROW_HEIGHT }}
                data-testid={`provider-cell-${provider.id}`}
              >
                {getProviderName(provider)}
              </div>
              
              {weekDays.map((day, dayIdx) => {
                const dayAppointments = getAppointmentsForProviderDay(provider.id, day);
                const absence = getAbsenceForProviderDay(provider.id, day);
                
                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex-1 border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                      isToday(day) && "bg-primary/5",
                      absence && ABSENCE_COLORS[absence.type] || (absence && ABSENCE_COLORS.default)
                    )}
                    style={{ minHeight: MIN_ROW_HEIGHT }}
                    onClick={() => !absence && handleCanvasClick(provider.id, day)}
                    data-testid={`day-cell-${provider.id}-${day.format('YYYY-MM-DD')}`}
                  >
                    {absence ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        <span className="mr-1">{ABSENCE_ICONS[absence.type] || ABSENCE_ICONS.default}</span>
                        <span>{getAbsenceLabel(absence.type)}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {dayAppointments.map((appt) => (
                          <div
                            key={appt.id}
                            className={cn(
                              "border-l-4 px-1.5 py-1 rounded text-xs cursor-pointer transition-all hover:shadow-md",
                              getStatusClass(appt.status)
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick?.(appt);
                            }}
                            title={`${appt.startTime} - ${appt.endTime}\n${getPatientName(appt)}\n${appt.service?.name || ''}`}
                            data-testid={`appointment-event-${appt.id}`}
                          >
                            <div className="font-semibold truncate">
                              {appt.startTime} {getPatientName(appt)}
                            </div>
                            {appt.service?.name && (
                              <div className="truncate opacity-80">
                                {appt.service.name}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
