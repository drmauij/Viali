import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ToggleRight, ToggleLeft } from "lucide-react";
import SaalStaffPopover from "./SaalStaffPopover";
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
  staffPoolByDateUser?: Map<string, Map<string, { id: string; role: string }>>;
  hospitalId?: string;
  onRemoveFromSaal?: (poolEntryId: string) => void;
  onSaalPopoverChange?: (state: { providerId: string; providerName: string; dateStr: string } | null) => void;
  saalPopoverState?: { providerId: string; providerName: string; dateStr: string } | null;
  onSaalAdded?: () => void;
  onDragSelectRange?: (providerId: string, startDate: Date, endDate: Date) => void;
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
  overtime: "bg-amber-100 dark:bg-amber-900/50",
  blocked: "bg-orange-100 dark:bg-orange-900/50",
  sabbatical: "bg-indigo-100 dark:bg-indigo-900/50",
  default: "bg-gray-100 dark:bg-gray-800/50",
};

const ABSENCE_ICONS: Record<string, string> = {
  vacation: "🏖️",
  sick: "🤒",
  training: "📚",
  parental: "👶",
  homeoffice: "🏠",
  overtime: "⏱️",
  blocked: "🚫",
  sabbatical: "✈️",
  default: "🚫",
};

const ABSENCE_TYPE_LABEL_KEYS: Record<string, { key: string; fallback: string }> = {
  vacation: { key: 'appointments.absence.vacation', fallback: 'Vacation' },
  sick: { key: 'appointments.absence.sick', fallback: 'Sick Leave' },
  training: { key: 'appointments.absence.training', fallback: 'Training' },
  parental: { key: 'appointments.absence.parental', fallback: 'Parental Leave' },
  homeoffice: { key: 'appointments.absence.homeoffice', fallback: 'Home Office' },
  overtime: { key: 'appointments.absence.overtime', fallback: 'Overtime Reduction' },
  blocked: { key: 'appointments.absence.blocked', fallback: 'Blocked / Other' },
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
  staffPoolByDateUser,
  hospitalId,
  onRemoveFromSaal,
  onSaalPopoverChange,
  saalPopoverState,
  onSaalAdded,
  onDragSelectRange,
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

  // Drag selection state for multi-day off-time
  const [dragState, setDragState] = useState<{
    providerId: string;
    startIdx: number;
    currentIdx: number;
  } | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const handleDragStart = useCallback((providerId: string, dayIdx: number) => {
    setDragState({ providerId, startIdx: dayIdx, currentIdx: dayIdx });
  }, []);

  const handleDragEnter = useCallback((providerId: string, dayIdx: number) => {
    setDragState(prev => {
      if (!prev || prev.providerId !== providerId) return prev;
      return { ...prev, currentIdx: dayIdx };
    });
  }, []);

  // Global mouseup to finalize or cancel drag
  useEffect(() => {
    const handleMouseUp = () => {
      const ds = dragStateRef.current;
      if (!ds) return;
      setDragState(null);
      if (ds.startIdx !== ds.currentIdx && onDragSelectRange) {
        const minIdx = Math.min(ds.startIdx, ds.currentIdx);
        const maxIdx = Math.max(ds.startIdx, ds.currentIdx);
        onDragSelectRange(
          ds.providerId,
          weekDays[minIdx].toDate(),
          weekDays[maxIdx].toDate(),
        );
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [onDragSelectRange, weekDays]);

  const isDayInDragRange = useCallback((providerId: string, dayIdx: number) => {
    if (!dragState || dragState.providerId !== providerId) return false;
    const minIdx = Math.min(dragState.startIdx, dragState.currentIdx);
    const maxIdx = Math.max(dragState.startIdx, dragState.currentIdx);
    return dayIdx >= minIdx && dayIdx <= maxIdx && dragState.startIdx !== dragState.currentIdx;
  }, [dragState]);

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

  const getAbsenceForProviderDay = (providerId: string, day: moment.Moment): { type: string; notes?: string | null; isPartial?: boolean; startTime?: string | null; endTime?: string | null } | null => {
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
      const isPartial = !!(timeOff.startTime && timeOff.endTime);
      return { type: timeOff.reason || 'default', notes: timeOff.notes, isPartial, startTime: timeOff.startTime, endTime: timeOff.endTime };
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

  const MIN_COL_WIDTH = 140;

  return (
    <div className="appointments-week-view h-full flex flex-col overflow-x-auto" data-testid="appointments-week-view">
      <div className="flex border-b bg-muted/30" style={{ minWidth: `calc(10rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}>
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
            style={{ minWidth: MIN_COL_WIDTH }}
            onClick={() => onDayClick?.(day.toDate())}
            data-testid={`day-header-${day.format('YYYY-MM-DD')}`}
          >
            {formatDayHeader(day)}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto pb-6" style={{ minWidth: `calc(10rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}>
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
                const dayStr = day.format('YYYY-MM-DD');
                const poolEntry = staffPoolByDateUser?.get(dayStr)?.get(provider.id);
                const isSaalPlanned = !!poolEntry;

                const inDragRange = isDayInDragRange(provider.id, dayIdx);

                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex-1 border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors relative select-none",
                      isToday(day) && "bg-primary/5",
                      absence && !absence.isPartial && (ABSENCE_COLORS[absence.type] || ABSENCE_COLORS.default),
                      inDragRange && "ring-2 ring-orange-400 bg-orange-100/50 dark:bg-orange-900/30"
                    )}
                    style={{ minHeight: MIN_ROW_HEIGHT, minWidth: MIN_COL_WIDTH }}
                    onClick={() => {
                      // Only fire click if there was no drag
                      if (!dragState && (!absence || absence.isPartial)) {
                        handleCanvasClick(provider.id, day);
                      }
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 0 && onDragSelectRange) {
                        e.preventDefault();
                        handleDragStart(provider.id, dayIdx);
                      }
                    }}
                    onMouseEnter={() => {
                      if (dragState) {
                        handleDragEnter(provider.id, dayIdx);
                      }
                    }}
                    data-testid={`day-cell-${provider.id}-${dayStr}`}
                  >
                    {/* Saal toggle in top-right corner — always visible */}
                    <div className="absolute top-0.5 right-0.5 z-10">
                      {isSaalPlanned ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(t('appointments.saalRemoveConfirm'))) {
                              onRemoveFromSaal?.(poolEntry.id);
                            }
                          }}
                          className="p-1 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
                          title={t('appointments.saalPlanned')}
                        >
                          <ToggleRight className="h-5 w-5" />
                        </button>
                      ) : hospitalId ? (
                        <SaalStaffPopover
                          providerId={provider.id}
                          providerName={getProviderName(provider)}
                          dateStr={dayStr}
                          hospitalId={hospitalId}
                          open={saalPopoverState?.providerId === provider.id && saalPopoverState?.dateStr === dayStr}
                          onOpenChange={(open) => {
                            if (open) {
                              onSaalPopoverChange?.({ providerId: provider.id, providerName: getProviderName(provider), dateStr: dayStr });
                            } else {
                              onSaalPopoverChange?.(null);
                            }
                          }}
                          onAdded={() => {
                            onSaalPopoverChange?.(null);
                            onSaalAdded?.();
                          }}
                        >
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                            title={t('appointments.saalNotPlanned')}
                          >
                            <ToggleLeft className="h-5 w-5" />
                          </button>
                        </SaalStaffPopover>
                      ) : (
                        <span className="p-1 text-muted-foreground/20">
                          <ToggleLeft className="h-5 w-5" />
                        </span>
                      )}
                    </div>
                    {absence && !absence.isPartial ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        <span className="mr-1">{ABSENCE_ICONS[absence.type] || ABSENCE_ICONS.default}</span>
                        <span>{getAbsenceLabel(absence.type)}</span>
                      </div>
                    ) : (() => {
                      // Build a merged list of appointments and partial time-off, sorted by start time
                      const items: { key: string; startTime: string; type: 'appointment' | 'timeoff'; appt?: typeof dayAppointments[0]; absence?: typeof absence }[] = [];
                      dayAppointments.forEach(appt => {
                        items.push({ key: appt.id, startTime: appt.startTime || '00:00', type: 'appointment', appt });
                      });
                      if (absence?.isPartial && absence.startTime) {
                        items.push({ key: 'timeoff', startTime: absence.startTime, type: 'timeoff', absence });
                      }
                      items.sort((a, b) => a.startTime.localeCompare(b.startTime));

                      return (
                        <div className="space-y-1">
                          {items.map(item => item.type === 'timeoff' ? (
                            <div key={item.key} className="border-l-4 border-orange-500 bg-orange-500/10 px-1.5 py-1 rounded text-xs text-muted-foreground">
                              <span className="mr-1">{ABSENCE_ICONS[item.absence!.type] || ABSENCE_ICONS.default}</span>
                              {item.absence!.startTime}–{item.absence!.endTime} {getAbsenceLabel(item.absence!.type)}
                            </div>
                          ) : (
                            <div
                              key={item.key}
                              className={cn(
                                "border-l-4 px-1.5 py-1 rounded text-xs cursor-pointer transition-all hover:shadow-md",
                                getStatusClass(item.appt!.status)
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick?.(item.appt!);
                              }}
                              title={`${item.appt!.startTime} - ${item.appt!.endTime}\n${getPatientName(item.appt!)}\n${item.appt!.service?.name || ''}`}
                              data-testid={`appointment-event-${item.appt!.id}`}
                            >
                              <div className="font-semibold truncate">
                                {item.appt!.startTime} {getPatientName(item.appt!)}
                              </div>
                              {item.appt!.service?.name && (
                                <div className="truncate opacity-80">
                                  {item.appt!.service.name}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
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
