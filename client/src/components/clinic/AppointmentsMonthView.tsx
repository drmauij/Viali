import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  addDays,
  startOfDay,
  endOfDay,
  isSameDay,
  isWithinInterval,
  isBefore,
  getDay,
  getDate,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ABSENCE_COLORS, ABSENCE_ICONS, ABSENCE_TYPE_LABEL_KEYS } from "@/lib/absenceConstants";
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

interface AppointmentsMonthViewProps {
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  appointments: AppointmentWithDetails[];
  providerAbsences?: ProviderAbsence[];
  providerTimeOffs?: ProviderTimeOff[];
  selectedDate: Date;
  onDayClick?: (date: Date) => void;
  onProviderClick?: (providerId: string) => void;
  onDragSelectRange?: (providerId: string, startDate: Date, endDate: Date) => void;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  scheduled: "bg-blue-500",
  confirmed: "bg-green-500",
  in_progress: "bg-yellow-500",
  completed: "bg-gray-400",
  cancelled: "bg-red-500",
  no_show: "bg-orange-500",
};


const MIN_COL_WIDTH = 58;
const MAX_DOTS = 3;

export default function AppointmentsMonthView({
  providers,
  appointments,
  providerAbsences = [],
  providerTimeOffs = [],
  selectedDate,
  onDayClick,
  onProviderClick,
  onDragSelectRange,
}: AppointmentsMonthViewProps) {
  const { t, i18n } = useTranslation();
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

  // Generate every day of the month with separator positions between weeks.
  // Patients sometimes can only come on Saturday/Sunday, so all 7 weekdays
  // are included; the separator before each Monday visually splits weeks.
  const { weekdays, separatorAfter } = useMemo(() => {
    const monthStartDate = startOfMonth(selectedDate);
    const monthEndDate = endOfMonth(selectedDate);
    const wd: Date[] = [];
    const seps = new Set<number>();
    let current = new Date(monthStartDate);
    while (!isBefore(monthEndDate, startOfDay(current))) {
      const dow = getDay(current);
      if (dow === 1 && wd.length > 0) {
        seps.add(wd.length - 1);
      }
      wd.push(new Date(current));
      current = addDays(current, 1);
    }
    return { weekdays: wd, separatorAfter: seps };
  }, [selectedDate]);

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
          weekdays[minIdx],
          weekdays[maxIdx],
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
  }, [onDragSelectRange, weekdays, handleDragEnter]);

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

    const timeOff = providerTimeOffs.find(to => {
      if (to.providerId !== providerId) return false;
      if (to.approvalStatus === 'declined') return false;
      return dayDate >= to.startDate && dayDate <= to.endDate;
    });

    if (timeOff) {
      const isPartial = !!(timeOff.startTime && timeOff.endTime);
      return { type: timeOff.reason || 'default', notes: timeOff.notes, isPartial, startTime: timeOff.startTime, endTime: timeOff.endTime, approvalStatus: timeOff.approvalStatus };
    }

    return null;
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  const formatDayAbbrev = (day: Date) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[getDay(day)];
    return t(`opCalendar.weekView.days.${dayKey}`);
  };

  const buildTooltip = (providerId: string, day: Date): string => {
    const parts: string[] = [];
    const dayAppts = getAppointmentsForProviderDay(providerId, day);
    const absence = getAbsenceForProviderDay(providerId, day);

    if (absence && !absence.isPartial) {
      parts.push(getAbsenceLabel(absence.type));
    }
    if (absence?.isPartial) {
      parts.push(`${absence.startTime}–${absence.endTime} ${getAbsenceLabel(absence.type)}`);
    }
    if (dayAppts.length > 0) {
      parts.push(`${dayAppts.length} ${t('appointments.appointment', 'Appointment')}${dayAppts.length > 1 ? 's' : ''}`);
    }

    const dayStr = format(day, 'yyyy-MM-dd');
    return parts.join('\n') || format(day, 'dd.MM.yyyy');
  };

  const SEP_WIDTH = 8;
  const totalGridWidth = `calc(9rem + ${weekdays.length * MIN_COL_WIDTH + separatorAfter.size * SEP_WIDTH}px)`;

  return (
    <div className="appointments-month-view h-full flex flex-col overflow-x-auto" data-testid="appointments-month-view">
      {/* Single header row: day abbreviations with gray separators between weeks */}
      <div className="flex border-b bg-muted/30" style={{ minWidth: totalGridWidth }}>
        <div className="w-36 flex-shrink-0 p-1 border-r text-xs text-muted-foreground font-medium flex items-center justify-center">
          {t('clinic.appointments.provider')}
        </div>
        {weekdays.map((day, idx) => (
          <React.Fragment key={idx}>
            <div
              className={cn(
                "text-center text-[10px] leading-tight py-1 border-r cursor-pointer hover:bg-primary/20 transition-colors",
                isToday(day) && "bg-primary/10 text-primary font-bold"
              )}
              style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH }}
              onClick={() => onDayClick?.(day)}
            >
              {formatDayAbbrev(day)}
            </div>
            {separatorAfter.has(idx) && (
              <div className="bg-gray-300 dark:bg-gray-600" style={{ width: SEP_WIDTH, minWidth: SEP_WIDTH }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Provider rows */}
      <div className="flex-1 overflow-auto pb-6" style={{ minWidth: totalGridWidth }}>
        {providers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            {t('clinic.appointments.noProviders')}
          </div>
        ) : (
          providers.map((provider) => (
            <div key={provider.id} className="flex border-b" data-testid={`provider-row-${provider.id}`}>
              {/* Sticky provider name */}
              <div
                className="w-36 flex-shrink-0 p-1.5 border-r bg-muted/20 font-medium text-xs cursor-pointer hover:bg-muted/40 transition-colors sticky left-0 z-10 flex items-center"
                onClick={() => onProviderClick?.(provider.id)}
                style={{ minHeight: 40 }}
                data-testid={`provider-cell-${provider.id}`}
              >
                {getProviderName(provider)}
              </div>

              {/* Day cells */}
              {weekdays.map((day, dayIdx) => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayAppointments = getAppointmentsForProviderDay(provider.id, day);
                const absence = getAbsenceForProviderDay(provider.id, day);
                const tooltip = buildTooltip(provider.id, day);

                const inDragRange = isDayInDragRange(provider.id, dayIdx);

                return (
                  <React.Fragment key={dayIdx}>
                    <div
                      className={cn(
                        "border-r cursor-pointer hover:bg-muted/30 transition-colors relative select-none",
                        isToday(day) && "bg-primary/5",
                        absence && !absence.isPartial && (ABSENCE_COLORS[absence.type] || ABSENCE_COLORS.default),
                        inDragRange && "ring-2 ring-orange-400 bg-orange-100/50 dark:bg-orange-900/30"
                      )}
                      style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH, minHeight: 58 }}
                      onClick={() => {
                        if (!dragState) {
                          onDayClick?.(day);
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
                      title={tooltip}
                      data-provider-id={provider.id}
                      data-day-idx={String(dayIdx)}
                      data-testid={`month-cell-${provider.id}-${dayStr}`}
                    >

                      {/* Cell content */}
                      {absence && !absence.isPartial ? (
                        <div className="flex items-center justify-center h-full relative">
                          <span className="text-xs leading-none" title={getAbsenceLabel(absence.type)}>
                            {ABSENCE_ICONS[absence.type] || ABSENCE_ICONS.default}
                          </span>
                          {absence.approvalStatus === 'pending' && (
                            <span className="absolute bottom-0.5 left-1 text-[10px] leading-none" title={t('business.staff.pending')}>
                              {'\u2753'}
                            </span>
                          )}
                          {absence.approvalStatus === 'approved' && (
                            <span className="absolute bottom-0.5 left-1 text-[10px] leading-none" title={t('business.staff.approved')}>
                              {'\u2705'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          {/* Partial time-off indicator */}
                          {absence?.isPartial && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l" title={`${absence.startTime}–${absence.endTime} ${getAbsenceLabel(absence.type)}`} />
                          )}

                          {/* Day number — bottom left */}
                          <span className="absolute bottom-0.5 left-1 text-[11px] leading-none text-muted-foreground">
                            {getDate(day)}
                          </span>

                          {/* Appointment dots — center */}
                          {dayAppointments.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 justify-center items-center absolute inset-0 m-auto w-fit h-fit">
                              {dayAppointments.slice(0, MAX_DOTS).map(appt => (
                                <div
                                  key={appt.id}
                                  className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    STATUS_DOT_COLORS[appt.status || 'scheduled'] || STATUS_DOT_COLORS.scheduled
                                  )}
                                />
                              ))}
                              {dayAppointments.length > MAX_DOTS && (
                                <span className="text-[7px] text-muted-foreground leading-none">
                                  +{dayAppointments.length - MAX_DOTS}
                                </span>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {separatorAfter.has(dayIdx) && (
                      <div className="bg-gray-300 dark:bg-gray-600" style={{ width: SEP_WIDTH, minWidth: SEP_WIDTH }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
