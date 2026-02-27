import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
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

interface AppointmentsMonthViewProps {
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  appointments: AppointmentWithDetails[];
  providerAbsences?: ProviderAbsence[];
  providerTimeOffs?: ProviderTimeOff[];
  selectedDate: Date;
  onDayClick?: (date: Date) => void;
  onProviderClick?: (providerId: string) => void;
  staffPoolByDateUser?: Map<string, Map<string, { id: string; role: string }>>;
  hospitalId?: string;
  onRemoveFromSaal?: (poolEntryId: string) => void;
  onSaalAdded?: () => void;
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
  vacation: "\u{1F3D6}\u{FE0F}",
  sick: "\u{1F912}",
  training: "\u{1F4DA}",
  parental: "\u{1F476}",
  homeoffice: "\u{1F3E0}",
  overtime: "\u{23F1}\u{FE0F}",
  blocked: "\u{1F6AB}",
  sabbatical: "\u{2708}\u{FE0F}",
  default: "\u{1F6AB}",
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
  staffPoolByDateUser,
  hospitalId,
  onRemoveFromSaal,
  onSaalAdded,
  onDragSelectRange,
}: AppointmentsMonthViewProps) {
  const { t, i18n } = useTranslation();
  const [saalPopoverKey, setSaalPopoverKey] = useState<string | null>(null);

  // Drag selection state for multi-day off-time
  const [dragState, setDragState] = useState<{
    providerId: string;
    startIdx: number;
    currentIdx: number;
  } | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const momentLocale = i18n.language.startsWith('de') ? 'de' : 'en-gb';
  moment.locale(momentLocale);

  // Generate weekdays only (no Sat/Sun), with separator positions between weeks
  const { weekdays, separatorAfter } = useMemo(() => {
    const monthStart = moment(selectedDate).startOf('month');
    const monthEnd = moment(selectedDate).endOf('month');
    const wd: moment.Moment[] = [];
    const seps = new Set<number>(); // indices after which to insert a gray separator
    const current = monthStart.clone();
    while (current.isSameOrBefore(monthEnd, 'day')) {
      const dow = current.day();
      if (dow !== 0 && dow !== 6) {
        // If this is a Monday and there are already days in the list, add separator before it
        if (dow === 1 && wd.length > 0) {
          seps.add(wd.length - 1);
        }
        wd.push(current.clone().locale(momentLocale));
      }
      current.add(1, 'day');
    }
    return { weekdays: wd, separatorAfter: seps };
  }, [selectedDate, momentLocale]);

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
      const ds = dragStateRef.current;
      if (!ds) return;
      setDragState(null);
      if (ds.startIdx !== ds.currentIdx && onDragSelectRange) {
        const minIdx = Math.min(ds.startIdx, ds.currentIdx);
        const maxIdx = Math.max(ds.startIdx, ds.currentIdx);
        onDragSelectRange(
          ds.providerId,
          weekdays[minIdx].toDate(),
          weekdays[maxIdx].toDate(),
        );
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStateRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
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
    };
  }, [onDragSelectRange, weekdays, handleDragEnter]);

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

    const timeOff = providerTimeOffs.find(to => {
      if (to.providerId !== providerId) return false;
      return dayDate >= to.startDate && dayDate <= to.endDate;
    });

    if (timeOff) {
      const isPartial = !!(timeOff.startTime && timeOff.endTime);
      return { type: timeOff.reason || 'default', notes: timeOff.notes, isPartial, startTime: timeOff.startTime, endTime: timeOff.endTime };
    }

    return null;
  };

  const isToday = (day: moment.Moment) => day.isSame(moment(), 'day');

  const formatDayAbbrev = (day: moment.Moment) => {
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[day.day()];
    return t(`opCalendar.weekView.days.${dayKey}`);
  };

  const buildTooltip = (providerId: string, day: moment.Moment): string => {
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

    const dayStr = day.format('YYYY-MM-DD');
    const poolEntry = staffPoolByDateUser?.get(dayStr)?.get(providerId);
    if (poolEntry) {
      parts.push(t('appointments.saalPlanned', 'Saal planned'));
    }

    return parts.join('\n') || day.format('DD.MM.YYYY');
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
              onClick={() => onDayClick?.(day.toDate())}
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
                const dayStr = day.format('YYYY-MM-DD');
                const dayAppointments = getAppointmentsForProviderDay(provider.id, day);
                const absence = getAbsenceForProviderDay(provider.id, day);
                const poolEntry = staffPoolByDateUser?.get(dayStr)?.get(provider.id);
                const isSaalPlanned = !!poolEntry;
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
                      style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH, minHeight: 58, touchAction: onDragSelectRange ? 'none' : undefined }}
                      onClick={() => {
                        if (!dragState) {
                          onDayClick?.(day.toDate());
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
                      onTouchStart={() => {
                        if (onDragSelectRange) {
                          handleDragStart(provider.id, dayIdx);
                        }
                      }}
                      title={tooltip}
                      data-provider-id={provider.id}
                      data-day-idx={String(dayIdx)}
                      data-testid={`month-cell-${provider.id}-${dayStr}`}
                    >
                      {/* Saal toggle top-right — always visible */}
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
                            open={saalPopoverKey === `${provider.id}-${dayStr}`}
                            onOpenChange={(open) => {
                              setSaalPopoverKey(open ? `${provider.id}-${dayStr}` : null);
                            }}
                            onAdded={() => {
                              setSaalPopoverKey(null);
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

                      {/* Cell content */}
                      {absence && !absence.isPartial ? (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-xs leading-none" title={getAbsenceLabel(absence.type)}>
                            {ABSENCE_ICONS[absence.type] || ABSENCE_ICONS.default}
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* Partial time-off indicator */}
                          {absence?.isPartial && (
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500 rounded-l" title={`${absence.startTime}–${absence.endTime} ${getAbsenceLabel(absence.type)}`} />
                          )}

                          {/* Day number — bottom left */}
                          <span className="absolute bottom-0.5 left-1 text-[11px] leading-none text-muted-foreground">
                            {day.date()}
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
