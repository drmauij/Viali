import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  format,
  startOfISOWeek,
  addDays,
  startOfDay,
  endOfDay,
  isSameDay,
  isWithinInterval,
  getDay,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Video } from "lucide-react";
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
  approvalStatus?: string;
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
  onDragSelectRange,
}: AppointmentsWeekViewProps) {
  const { t, i18n } = useTranslation();

  const weekDays = useMemo(() => {
    const weekStart = startOfISOWeek(selectedDate);
    const days: Date[] = [];
    for (let i = 0; i < 5; i++) {
      days.push(addDays(weekStart, i));
    }
    return days;
  }, [selectedDate]);

  // Drag selection state for multi-day off-time
  const [dragState, setDragState] = useState<{
    providerId: string;
    startIdx: number;
    currentIdx: number;
  } | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Long-press refs for touch: delay drag activation so swipes aren't misinterpreted
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; providerId: string; dayIdx: number } | null>(null);

  const handleDragStart = useCallback((providerId: string, dayIdx: number) => {
    setDragState({ providerId, startIdx: dayIdx, currentIdx: dayIdx });
  }, []);

  const handleDragEnter = useCallback((providerId: string, dayIdx: number) => {
    setDragState(prev => {
      if (!prev || prev.providerId !== providerId) return prev;
      return { ...prev, currentIdx: dayIdx };
    });
  }, []);

  // Global mouseup/touchend to finalize or cancel drag
  useEffect(() => {
    const handleDragEnd = () => {
      // Cancel any pending long-press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;

      const ds = dragStateRef.current;
      if (!ds) return;
      setDragState(null);
      if (ds.startIdx !== ds.currentIdx && onDragSelectRange) {
        const minIdx = Math.min(ds.startIdx, ds.currentIdx);
        const maxIdx = Math.max(ds.startIdx, ds.currentIdx);
        onDragSelectRange(
          ds.providerId,
          weekDays[minIdx],
          weekDays[maxIdx],
        );
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];

      // If long-press is pending (timer running), check if finger moved too much
      if (touchStartRef.current && !dragStateRef.current) {
        const dx = touch.clientX - touchStartRef.current.x;
        const dy = touch.clientY - touchStartRef.current.y;
        if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
          // It's a swipe — cancel long press, allow native scroll
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          touchStartRef.current = null;
        }
        return; // Don't preventDefault — let browser scroll naturally
      }

      if (!dragStateRef.current) return;
      e.preventDefault();
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el?.closest('[data-provider-id][data-day-idx]') as HTMLElement | null;
      if (!cell) return;
      const providerId = cell.dataset.providerId;
      const dayIdx = cell.dataset.dayIdx !== undefined ? parseInt(cell.dataset.dayIdx, 10) : NaN;
      if (providerId && !isNaN(dayIdx)) {
        handleDragEnter(providerId, dayIdx);
      }
    };
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    window.addEventListener('touchcancel', handleDragEnd);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
      window.removeEventListener('touchcancel', handleDragEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [onDragSelectRange, weekDays, handleDragEnter]);

  const isDayInDragRange = useCallback((providerId: string, dayIdx: number) => {
    if (!dragState || dragState.providerId !== providerId) return false;
    const minIdx = Math.min(dragState.startIdx, dragState.currentIdx);
    const maxIdx = Math.max(dragState.startIdx, dragState.currentIdx);
    return dayIdx >= minIdx && dayIdx <= maxIdx;
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

  const getAppointmentsForProviderDay = (providerId: string, day: Date) => {
    const dayStartDate = startOfDay(day);
    const dayEndDate = endOfDay(day);

    return appointments.filter(appt => {
      if (appt.providerId !== providerId) return false;
      const apptDate = new Date(appt.appointmentDate);
      return isWithinInterval(apptDate, { start: dayStartDate, end: dayEndDate });
    }).sort((a, b) => {
      const timeA = a.startTime || '00:00';
      const timeB = b.startTime || '00:00';
      return timeA.localeCompare(timeB);
    });
  };

  const getAbsenceForProviderDay = (providerId: string, day: Date): { type: string; notes?: string | null; isPartial?: boolean; startTime?: string | null; endTime?: string | null; approvalStatus?: string } | null => {
    const dayDate = format(day, 'yyyy-MM-dd');

    const absence = providerAbsences.find(a => {
      if (a.providerId !== providerId) return false;
      return dayDate >= a.startDate && dayDate <= a.endDate;
    });

    if (absence) {
      return { type: absence.absenceType, notes: absence.notes };
    }

    const timeOff = providerTimeOffs.find(t => {
      if (t.providerId !== providerId) return false;
      if (t.approvalStatus === 'declined') return false;
      return dayDate >= t.startDate && dayDate <= t.endDate;
    });

    if (timeOff) {
      const isPartial = !!(timeOff.startTime && timeOff.endTime);
      return { type: timeOff.reason || 'default', notes: timeOff.notes, isPartial, startTime: timeOff.startTime, endTime: timeOff.endTime, approvalStatus: timeOff.approvalStatus };
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

  const isToday = (day: Date) => {
    return isSameDay(day, new Date());
  };

  const formatDayHeader = (day: Date) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[getDay(day)];
    const translatedDay = t(`opCalendar.weekView.days.${dayKey}`);
    return `${translatedDay} ${format(day, 'dd.MM')}`;
  };

  const handleCanvasClick = (providerId: string, day: Date) => {
    if (!onCanvasClick) return;
    const clickTime = new Date(startOfDay(day).getTime() + 9 * 3600000);
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
            onClick={() => onDayClick?.(day)}
            data-testid={`day-header-${format(day, 'yyyy-MM-dd')}`}
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
                const dayStr = format(day, 'yyyy-MM-dd');

                const inDragRange = isDayInDragRange(provider.id, dayIdx);

                return (
                  <div
                    key={dayIdx}
                    className={cn(
                      "flex-1 border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors relative select-none",
                      isToday(day) && "bg-primary/5",
                      absence && !absence.isPartial && absence.approvalStatus !== 'pending' && (ABSENCE_COLORS[absence.type] || ABSENCE_COLORS.default),
                      absence && !absence.isPartial && absence.approvalStatus === 'pending' && "bg-orange-50 dark:bg-orange-950/30 border border-dashed border-orange-300 dark:border-orange-700",
                      inDragRange && "ring-2 ring-orange-400 bg-orange-100/50 dark:bg-orange-900/30"
                    )}
                    style={{ minHeight: MIN_ROW_HEIGHT, minWidth: MIN_COL_WIDTH }}
                    onClick={() => {
                      // Only fire click if there was no drag; full-day absences block
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
                    onTouchStart={(e) => {
                      if (onDragSelectRange) {
                        const touch = e.touches[0];
                        touchStartRef.current = { x: touch.clientX, y: touch.clientY, providerId: provider.id, dayIdx };
                        longPressTimerRef.current = setTimeout(() => {
                          longPressTimerRef.current = null;
                          if (touchStartRef.current) {
                            handleDragStart(touchStartRef.current.providerId, touchStartRef.current.dayIdx);
                          }
                        }, 400);
                      }
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    data-provider-id={provider.id}
                    data-day-idx={String(dayIdx)}
                    data-testid={`day-cell-${provider.id}-${dayStr}`}
                  >
                    {absence && !absence.isPartial ? (
                      <div className={cn(
                        "flex items-center justify-center h-full text-muted-foreground text-sm",
                        absence.approvalStatus === 'pending' && "opacity-60"
                      )}>
                        <span className="mr-1">{ABSENCE_ICONS[absence.type] || ABSENCE_ICONS.default}</span>
                        <span>{getAbsenceLabel(absence.type)}</span>
                        {absence.approvalStatus === 'pending' && <span className="ml-1">{'\u2753'}</span>}
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
                                "border-l-4 px-1.5 py-1 rounded text-xs cursor-pointer transition-all hover:shadow-md overflow-hidden",
                                getStatusClass(item.appt!.status),
                                item.appt!.isVideoAppointment && "!border-l-indigo-500 dark:!border-l-indigo-400"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                onEventClick?.(item.appt!);
                              }}
                              title={`${item.appt!.startTime} - ${item.appt!.endTime}\n${getPatientName(item.appt!)}\n${item.appt!.service?.name || ''}`}
                              data-testid={`appointment-event-${item.appt!.id}`}
                            >
                              <div className="font-semibold truncate flex items-center gap-1">
                                {item.appt!.isVideoAppointment && <Video className="w-4 h-4 flex-shrink-0 text-indigo-600 dark:text-indigo-300" />}
                                {item.appt!.startTime} {getPatientName(item.appt!)}
                              </div>
                              {item.appt!.service?.name && (
                                <div className="truncate opacity-80">
                                  {item.appt!.service.name}
                                </div>
                              )}
                              {item.appt!.notes && (
                                <div className="truncate opacity-60 text-[10px]">
                                  {item.appt!.notes}
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
