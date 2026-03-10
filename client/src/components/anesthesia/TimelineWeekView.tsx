import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getMomentTimeFormat } from "@/lib/dateUtils";
import type { LucideIcon } from "lucide-react";

export interface PreOpStatusInfo {
  key: string;
  icon: LucideIcon;
  color: string;
  badgeClass: string;
  label: string;
}

export interface ClinicClosureInfo {
  startDate: string;
  endDate: string;
  name: string;
}

interface TimelineWeekViewProps {
  surgeryRooms: any[];
  allRooms?: any[];
  surgeries: any[];
  patients?: any[];
  selectedDate: Date;
  closures?: ClinicClosureInfo[];
  onEventClick?: (surgeryId: string, patientId: string) => void;
  onEventDrop?: (surgeryId: string, newStart: Date, newEnd: Date, newRoomId: string) => void;
  onCanvasClick?: (groupId: string, time: Date) => void;
  onSlotSelect?: (roomId: string, start: Date, end: Date) => void;
  onDayClick?: (date: Date) => void;
  getPreOpStatus?: (surgeryId: string) => PreOpStatusInfo;
}

interface DragState {
  isDragging: boolean;
  dayIdx: number;
  startSlot: number;
  endSlot: number;
}

// Business hours
const BUSINESS_HOUR_START = 7;
const BUSINESS_HOUR_END = 22;
const HOUR_HEIGHT = 60; // pixels per hour
const SLOT_MINUTES = 15; // snap interval in minutes
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const SLOT_HEIGHT = HOUR_HEIGHT / SLOTS_PER_HOUR; // 15px per 15-min slot
const TOTAL_SLOTS = (BUSINESS_HOUR_END - BUSINESS_HOUR_START) * SLOTS_PER_HOUR;

// Convert slot index to fractional hour
const slotToHour = (slot: number) => BUSINESS_HOUR_START + slot / SLOTS_PER_HOUR;
// Format a slot index as HH:mm
const formatSlotTime = (slot: number) => {
  const totalMinutes = BUSINESS_HOUR_START * 60 + slot * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function TimelineWeekView({
  surgeryRooms,
  allRooms = [],
  surgeries,
  patients = [],
  selectedDate,
  closures = [],
  onEventClick,
  onCanvasClick,
  onSlotSelect,
  onDayClick,
  getPreOpStatus,
}: TimelineWeekViewProps) {
  const { t, i18n } = useTranslation();
  
  // Drag selection state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const isDraggingRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  
  // Set moment locale based on current language
  const momentLocale = i18n.language.startsWith('de') ? 'de' : 'en-gb';
  moment.locale(momentLocale);
  
  // Questionnaire status dot config
  // Hidden when pre-op assessment is stand-by/approved/not-approved/completed.
  // Shows empty outline dot when no questionnaire link sent, colored dot for actual statuses.
  const getQuestionnaireDot = useCallback((status: string | null | undefined, preOpKey: string) => {
    if (preOpKey === 'standby' || preOpKey === 'approved' || preOpKey === 'not-approved') return null;

    if (!status) {
      return { color: 'bg-transparent border border-gray-400', label: t('opCalendar.questionnaire.notSent', 'Questionnaire not sent') };
    }
    const config: Record<string, { color: string; label: string }> = {
      pending: { color: 'bg-gray-400', label: t('opCalendar.questionnaire.sent', 'Questionnaire sent') },
      started: { color: 'bg-amber-400', label: t('opCalendar.questionnaire.started', 'Questionnaire started') },
      submitted: { color: 'bg-green-500', label: t('opCalendar.questionnaire.submitted', 'Questionnaire submitted') },
      reviewed: { color: 'bg-green-500', label: t('opCalendar.questionnaire.reviewed', 'Questionnaire reviewed') },
    };
    return config[status] || null;
  }, [t]);

  // Check if a day falls within any closure
  const getClosureForDay = useCallback((day: moment.Moment): ClinicClosureInfo | null => {
    const dateStr = day.format('YYYY-MM-DD');
    return closures.find(c => dateStr >= c.startDate && dateStr <= c.endDate) || null;
  }, [closures]);

  // Calculate week days (Monday to Friday - excluding weekends)
  const weekDays = useMemo(() => {
    const weekStart = moment(selectedDate).startOf('isoWeek');
    const days = [];
    for (let i = 0; i < 5; i++) {
      days.push(moment(weekStart).add(i, 'days').locale(momentLocale));
    }
    return days;
  }, [selectedDate, momentLocale]);

  // Generate time slots (hours)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
      slots.push(hour);
    }
    return slots;
  }, []);

  // Helper to parse marker time (handles both ISO strings and timestamps)
  const parseMarkerTime = (markerTime: string | number): Date | null => {
    if (!markerTime) return null;
    if (typeof markerTime === 'number') {
      return new Date(markerTime);
    }
    const parsed = new Date(markerTime);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Calculate display times using O1/O2 markers (matching OPCalendar logic)
  const getDisplayTimes = (surgery: any): { displayStart: Date; displayEnd: Date } => {
    const plannedDate = new Date(surgery.plannedDate);
    const timeMarkers = surgery.timeMarkers || [];
    
    const o1Marker = timeMarkers.find((m: any) => m.code === 'O1' && m.time !== null);
    const o2Marker = timeMarkers.find((m: any) => m.code === 'O2' && m.time !== null);
    
    const o1Time = o1Marker ? parseMarkerTime(o1Marker.time) : null;
    const o2Time = o2Marker ? parseMarkerTime(o2Marker.time) : null;
    
    // Use O1 time as start if available, otherwise use planned date
    let displayStart = plannedDate;
    if (o1Time) {
      displayStart = o1Time;
    }
    
    // Calculate planned duration
    const plannedDurationMs = surgery.duration 
      ? surgery.duration * 60 * 1000 
      : 3 * 60 * 60 * 1000; // default 3 hours
    
    // Calculate end time based on available markers
    let displayEnd: Date;
    if (o1Time && o2Time) {
      // Both O1 and O2 available - use actual surgery end
      displayEnd = o2Time;
    } else if (o1Time) {
      // Only O1 available - use planned duration from O1 start
      displayEnd = new Date(displayStart.getTime() + plannedDurationMs);
    } else {
      // No O1 - use original logic with planned date
      displayEnd = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime)
        : new Date(plannedDate.getTime() + plannedDurationMs);
    }
    
    return { displayStart, displayEnd };
  };

  // Get surgeries for a specific day (uses displayStart for accurate placement)
  const getSurgeriesForDay = (day: moment.Moment) => {
    const dayStart = day.clone().startOf('day');
    const dayEnd = day.clone().endOf('day');
    
    return surgeries.filter(surgery => {
      // Use the same logic as display to determine which day the surgery belongs to
      const { displayStart } = getDisplayTimes(surgery);
      const surgeryDate = moment(displayStart);
      return surgeryDate.isBetween(dayStart, dayEnd, 'day', '[]');
    });
  };

  // Calculate horizontal position for surgeries based on room to show them side-by-side
  const getSurgeryHorizontalPosition = (surgery: any, daySurgeries: any[]) => {
    // Get all unique rooms for surgeries on this day
    const roomIds = Array.from(new Set(daySurgeries.map(s => s.surgeryRoomId))).sort();
    const roomIndex = roomIds.indexOf(surgery.surgeryRoomId);
    const totalRooms = roomIds.length;
    
    if (totalRooms <= 1) {
      // Only one room, use full width
      return { left: '4px', right: '4px', width: undefined };
    }
    
    // Calculate width percentage for each room column
    const widthPercent = 100 / totalRooms;
    const leftPercent = roomIndex * widthPercent;
    
    return {
      left: `calc(${leftPercent}% + 2px)`,
      right: undefined,
      width: `calc(${widthPercent}% - 4px)`
    };
  };

  // Get patient name
  const getPatientName = (patientId: string | null) => {
    if (!patientId) return t('opCalendar.slotReserved', 'SLOT RESERVED');
    const patient = patients.find((p: any) => p.id === patientId);
    return patient ? `${patient.surname}, ${patient.firstName}` : t('opCalendar.weekView.unknownPatient');
  };

  // Get room name
  const getRoomName = (roomId: string) => {
    const room = surgeryRooms.find((r: any) => r.id === roomId);
    return room ? room.name : t('opCalendar.weekView.unknownRoom');
  };
  
  // Get PACU bed name
  const getPacuBedName = (pacuBedId: string | null | undefined) => {
    if (!pacuBedId) return null;
    const bed = allRooms.find((r: any) => r.id === pacuBedId);
    return bed?.name || null;
  };

  // Get status color for surgery - using theme-aware backgrounds
  const getStatusClass = (surgery: any) => {
    const isRoomBlock = surgery.plannedSurgery === '__ROOM_BLOCK__';
    const isSlotReservation = !surgery.patientId && !isRoomBlock;

    if (isRoomBlock && !surgery.isSuspended && surgery.status !== "cancelled") {
      return "bg-red-800 dark:bg-red-900 border-red-900 dark:border-red-950 text-white border-[3px]";
    }
    if (isSlotReservation && !surgery.isSuspended && surgery.status !== "cancelled") {
      return "bg-violet-500 dark:bg-violet-700 border-violet-700 dark:border-violet-800 text-white border-dashed border-2";
    }
    if (surgery.isSuspended) {
      return "bg-amber-200 dark:bg-amber-900 border-amber-500 text-amber-900 dark:text-amber-100 border-dashed border-2";
    }
    if (surgery.status === "cancelled") {
      return "bg-gray-200 dark:bg-gray-700 border-gray-500 text-gray-700 dark:text-gray-300 line-through";
    }

    if (surgery.timeMarkers) {
      const hasA2 = surgery.timeMarkers.find((m: any) => m.code === 'A2' && m.time !== null);
      const hasX2 = surgery.timeMarkers.find((m: any) => m.code === 'X2' && m.time !== null);
      const hasO2 = surgery.timeMarkers.find((m: any) => m.code === 'O2' && m.time !== null);
      const hasO1 = surgery.timeMarkers.find((m: any) => m.code === 'O1' && m.time !== null);

      if (hasA2 || hasX2) {
        // Completed - green
        return "bg-green-200 dark:bg-green-900 border-green-600 text-green-900 dark:text-green-100";
      } else if (hasO2) {
        // Suturing - yellow
        return "bg-yellow-200 dark:bg-yellow-900 border-yellow-600 text-yellow-900 dark:text-yellow-100";
      } else if (hasO1) {
        // Running - red
        return "bg-red-200 dark:bg-red-900 border-red-600 text-red-900 dark:text-red-100";
      }
    }

    // Planned - blue/primary
    return "bg-blue-200 dark:bg-blue-900 border-blue-600 text-blue-900 dark:text-blue-100";
  };

  // Get inline style for room block diagonal stripes (can't do this with Tailwind alone)
  const getRoomBlockStyle = (surgery: any): React.CSSProperties | undefined => {
    if (surgery.plannedSurgery !== '__ROOM_BLOCK__' || surgery.isSuspended || surgery.status === "cancelled") return undefined;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      backgroundImage: isDark
        ? 'repeating-linear-gradient(135deg, #991b1b, #991b1b 6px, #7f1d1d 6px, #7f1d1d 12px)'
        : 'repeating-linear-gradient(135deg, #b91c1c, #b91c1c 6px, #7f1d1d 6px, #7f1d1d 12px)',
    };
  };

  // Calculate surgery position and height
  const getSurgeryStyle = (surgery: any) => {
    const { displayStart, displayEnd } = getDisplayTimes(surgery);
    
    const startHour = displayStart.getHours() + displayStart.getMinutes() / 60;
    const endHour = displayEnd.getHours() + displayEnd.getMinutes() / 60;
    
    // Clamp to business hours
    const clampedStart = Math.max(startHour, BUSINESS_HOUR_START);
    const clampedEnd = Math.min(endHour, BUSINESS_HOUR_END);
    
    const top = (clampedStart - BUSINESS_HOUR_START) * HOUR_HEIGHT;
    const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 30);
    
    // Determine if event is truncated (for visual indicator)
    const isTruncatedStart = startHour < BUSINESS_HOUR_START;
    const isTruncatedEnd = endHour > BUSINESS_HOUR_END;
    
    return { top, height, isTruncatedStart, isTruncatedEnd, displayStart };
  };

  const isToday = (day: moment.Moment) => {
    return day.isSame(moment(), 'day');
  };

  const formatDayHeader = (day: moment.Moment) => {
    // Use translation keys for day names instead of moment locale
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const dayKey = dayKeys[day.day()];
    const translatedDay = t(`opCalendar.weekView.days.${dayKey}`);
    return `${translatedDay} ${day.format('DD.MM')}`;
  };

  // Track whether mouse actually moved to a different slot (true drag vs click)
  const hasDraggedRef = useRef(false);

  // Drag selection handlers - use refs to avoid stale closures
  const handleMouseDown = useCallback((dayIdx: number, slotIdx: number) => {
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    const newState: DragState = {
      isDragging: true,
      dayIdx,
      startSlot: slotIdx,
      endSlot: slotIdx + 1,
    };
    dragStateRef.current = newState;
    setDragState(newState);
  }, []);

  const handleMouseEnter = useCallback((dayIdx: number, slotIdx: number) => {
    if (!isDraggingRef.current || !dragStateRef.current) return;
    if (dayIdx !== dragStateRef.current.dayIdx) return;

    if (slotIdx !== dragStateRef.current.startSlot) {
      hasDraggedRef.current = true;
    }
    
    const newEndSlot = Math.max(slotIdx + 1, dragStateRef.current.startSlot + 1);
    const newState = { ...dragStateRef.current, endSlot: newEndSlot };
    dragStateRef.current = newState;
    setDragState(newState);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current || !dragStateRef.current) {
      isDraggingRef.current = false;
      dragStateRef.current = null;
      setDragState(null);
      return;
    }
    
    isDraggingRef.current = false;
    const currentDrag = dragStateRef.current;
    const wasDragged = hasDraggedRef.current;
    dragStateRef.current = null;
    hasDraggedRef.current = false;
    
    const day = weekDays[currentDrag.dayIdx];
    const roomId = surgeryRooms[0]?.id || '';

    const startMinutes = currentDrag.startSlot * SLOT_MINUTES;
    const endMinutes = currentDrag.endSlot * SLOT_MINUTES;

    if (wasDragged && onSlotSelect) {
      const startTime = day.clone()
        .hour(BUSINESS_HOUR_START).minute(0).second(0)
        .add(startMinutes, 'minutes').toDate();
      const endTime = day.clone()
        .hour(BUSINESS_HOUR_START).minute(0).second(0)
        .add(endMinutes, 'minutes').toDate();
      onSlotSelect(roomId, startTime, endTime);
    } else if (onCanvasClick) {
      const clickTime = day.clone()
        .hour(BUSINESS_HOUR_START).minute(0).second(0)
        .add(startMinutes, 'minutes').toDate();
      onCanvasClick(roomId, clickTime);
    }
    
    setDragState(null);
  }, [weekDays, surgeryRooms, onSlotSelect, onCanvasClick]);

  // Touch handling via native event listeners (NOT React synthetic events).
  // React registers touch events as passive, so preventDefault() is silently ignored.
  // Native listeners with { passive: false } give us actual control over scrolling.
  const isTouchDeviceRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Store callbacks in refs so the native listener always sees the latest version
  const handleMouseDownRef = useRef(handleMouseDown);
  const handleMouseEnterRef = useRef(handleMouseEnter);
  const handleMouseUpRef = useRef(handleMouseUp);
  const onCanvasClickRef = useRef(onCanvasClick);
  const weekDaysRef = useRef(weekDays);
  const surgeryRoomsRef = useRef(surgeryRooms);
  handleMouseDownRef.current = handleMouseDown;
  handleMouseEnterRef.current = handleMouseEnter;
  handleMouseUpRef.current = handleMouseUp;
  onCanvasClickRef.current = onCanvasClick;
  weekDaysRef.current = weekDays;
  surgeryRoomsRef.current = surgeryRooms;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const LONG_PRESS_MS = 200;
    const MOVE_CANCEL_PX = 10;
    const AUTO_SCROLL_EDGE = 50;
    const AUTO_SCROLL_SPEED = 6;

    let touchStart: { x: number; y: number; dayIdx: number; slotIdx: number } | null = null;
    let dragActive = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const resolveSlot = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const testId = el.getAttribute('data-testid');
      if (!testId || !testId.startsWith('time-slot-')) return null;
      const parts = testId.split('-');
      const slotIdx = parseInt(parts[parts.length - 1], 10);
      const dateStr = parts.slice(2, 5).join('-');
      const dayIdx = weekDaysRef.current.findIndex(d => d.format('YYYY-MM-DD') === dateStr);
      if (dayIdx < 0 || isNaN(slotIdx)) return null;
      return { dayIdx, slotIdx };
    };

    const clearTimer = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };

    const onTouchStart = (e: TouchEvent) => {
      isTouchDeviceRef.current = true;
      const touch = e.touches[0];
      const slot = resolveSlot(touch.clientX, touch.clientY);
      if (!slot) return; // touch on non-slot area — let browser handle normally

      touchStart = { x: touch.clientX, y: touch.clientY, ...slot };
      dragActive = false;

      clearTimer();
      longPressTimer = setTimeout(() => {
        if (!touchStart) return;
        dragActive = true;
        try { navigator.vibrate?.(30); } catch (_) {}
        handleMouseDownRef.current(touchStart.dayIdx, touchStart.slotIdx);
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStart) return;
      const touch = e.touches[0];

      // Before drag: check if finger moved (= scroll intent)
      if (!dragActive) {
        const dx = Math.abs(touch.clientX - touchStart.x);
        const dy = Math.abs(touch.clientY - touchStart.y);
        if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
          clearTimer();
          touchStart = null;
          // Don't preventDefault — let browser scroll naturally
        }
        return;
      }

      // Drag is active — PREVENT SCROLL (this works because { passive: false })
      e.preventDefault();

      // Auto-scroll near edges
      const rect = container.getBoundingClientRect();
      if (touch.clientY > rect.bottom - AUTO_SCROLL_EDGE) {
        container.scrollTop += AUTO_SCROLL_SPEED;
      } else if (touch.clientY < rect.top + AUTO_SCROLL_EDGE) {
        container.scrollTop -= AUTO_SCROLL_SPEED;
      }

      // Update slot selection
      const slot = resolveSlot(touch.clientX, touch.clientY);
      if (slot) {
        handleMouseEnterRef.current(slot.dayIdx, slot.slotIdx);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      clearTimer();

      if (dragActive && isDraggingRef.current) {
        e.preventDefault();
        handleMouseUpRef.current();
      } else if (touchStart) {
        // Short tap — quick create
        e.preventDefault();
        const { dayIdx, slotIdx } = touchStart;
        if (onCanvasClickRef.current) {
          const day = weekDaysRef.current[dayIdx];
          const startMinutes = slotIdx * SLOT_MINUTES;
          const clickTime = day.clone()
            .hour(BUSINESS_HOUR_START).minute(0).second(0)
            .add(startMinutes, 'minutes').toDate();
          onCanvasClickRef.current(surgeryRoomsRef.current[0]?.id || '', clickTime);
        }
      }
      touchStart = null;
      dragActive = false;
    };

    // passive: true for touchstart (we don't need to prevent it — scroll should work)
    // passive: false for touchmove/touchend (we NEED preventDefault to stop scroll during drag)
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });

    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      clearTimer();
    };
  }, []); // stable — uses refs for all changing values

  // Global mouseup listener for desktop drag selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        handleMouseUp();
      }
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleMouseUp]);

  const MIN_COL_WIDTH = 140;

  return (
    <div className="vertical-week-view h-full flex flex-col overflow-x-auto" data-testid="timeline-week-view">
      {/* Day headers */}
      <div className="flex border-b bg-muted/30" style={{ minWidth: `calc(4rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}>
        {/* Time gutter header */}
        <div className="w-16 flex-shrink-0 p-2 border-r text-xs text-muted-foreground font-medium">

        </div>
        {/* Day columns headers */}
        {weekDays.map((day, idx) => {
          const dayClosure = getClosureForDay(day);
          return (
            <div
              key={idx}
              className={cn(
                "flex-1 p-2 text-center border-r text-sm font-medium cursor-pointer hover:bg-primary/20 transition-colors",
                isToday(day) && "bg-primary/10 text-primary",
                dayClosure && "bg-amber-100 dark:bg-amber-900/30"
              )}
              style={{ minWidth: MIN_COL_WIDTH }}
              onClick={() => onDayClick?.(day.toDate())}
              data-testid={`day-header-${day.format('YYYY-MM-DD')}`}
            >
              {formatDayHeader(day)}
              {dayClosure && (
                <div className="text-[10px] text-amber-700 dark:text-amber-400 font-normal truncate">{dayClosure.name}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto pb-6" style={{ minWidth: `calc(4rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}>
        <div className="flex">
          {/* Time gutter */}
          <div className="w-16 flex-shrink-0 border-r bg-muted/20">
            {timeSlots.map((hour) => (
              <div
                key={hour}
                className="border-b text-xs text-muted-foreground text-right pr-2 pt-1 relative"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const daySurgeries = getSurgeriesForDay(day);
            const dayClosure = getClosureForDay(day);

            return (
              <div
                key={dayIdx}
                className={cn(
                  "flex-1 border-r relative",
                  isToday(day) && "bg-primary/5",
                  dayClosure && "bg-amber-50/60 dark:bg-amber-900/10"
                )}
                style={{ minWidth: MIN_COL_WIDTH }}
                data-testid={`day-column-${day.format('YYYY-MM-DD')}`}
              >
                {/* Closure overlay */}
                {dayClosure && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                    <div className="bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-2 text-center">
                      <i className="fas fa-calendar-xmark text-amber-600 dark:text-amber-400 text-lg mb-1"></i>
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("opCalendar.clinicClosed", "Clinic Closed")}</div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-500">{dayClosure.name}</div>
                    </div>
                  </div>
                )}

                {/* 15-minute slot grid */}
                {Array.from({ length: TOTAL_SLOTS }, (_, slotIdx) => {
                  const isHourBoundary = slotIdx % SLOTS_PER_HOUR === 0;
                  return (
                    <div
                      key={slotIdx}
                      className={cn(
                        dayClosure ? "cursor-not-allowed select-none" : "cursor-pointer select-none",
                        isHourBoundary ? "border-b border-border" : "border-b border-border/20"
                      )}
                      style={{ height: SLOT_HEIGHT }}
                      onMouseDown={(e) => {
                        if (isTouchDeviceRef.current || dayClosure) return;
                        e.preventDefault();
                        handleMouseDown(dayIdx, slotIdx);
                      }}
                      onMouseEnter={() => {
                        if (isTouchDeviceRef.current || dayClosure) return;
                        handleMouseEnter(dayIdx, slotIdx);
                      }}
                      onMouseUp={() => {
                        if (isTouchDeviceRef.current || dayClosure) return;
                        handleMouseUp();
                      }}
                      data-testid={`time-slot-${day.format('YYYY-MM-DD')}-${slotIdx}`}
                    />
                  );
                })}

                {/* Drag selection preview overlay */}
                {dragState && dragState.dayIdx === dayIdx && (
                  <div
                    className="absolute left-1 right-1 bg-primary/25 border-2 border-primary/60 rounded-md pointer-events-none z-10 flex flex-col justify-between"
                    style={{
                      top: dragState.startSlot * SLOT_HEIGHT + 2,
                      height: (dragState.endSlot - dragState.startSlot) * SLOT_HEIGHT - 4,
                    }}
                  >
                    <div className="text-[10px] font-semibold text-primary px-1.5 pt-0.5">
                      {formatSlotTime(dragState.startSlot)}
                    </div>
                    {(dragState.endSlot - dragState.startSlot) > 1 && (
                      <div className="text-[10px] font-semibold text-primary px-1.5 pb-0.5 text-right">
                        {formatSlotTime(dragState.endSlot)}
                      </div>
                    )}
                  </div>
                )}

                {/* Surgery events */}
                {daySurgeries.map((surgery) => {
                  const { top, height, isTruncatedStart, isTruncatedEnd, displayStart } = getSurgeryStyle(surgery);
                  const { left, right, width } = getSurgeryHorizontalPosition(surgery, daySurgeries);
                  const roomName = getRoomName(surgery.surgeryRoomId);
                  const patientName = getPatientName(surgery.patientId);
                  const procedureName = surgery.plannedSurgery || 'Surgery';
                  const startTime = moment(displayStart).format(getMomentTimeFormat());
                  const pacuBedName = getPacuBedName(surgery.pacuBedId);
                  const preOpKey = getPreOpStatus ? getPreOpStatus(surgery.id).key : 'planned';
                  const qDot = getQuestionnaireDot(surgery.questionnaireStatus, preOpKey);
                  const isRoomBlock = surgery.plannedSurgery === '__ROOM_BLOCK__';
                  const isSlotReservation = !surgery.patientId && !isRoomBlock;

                  return (
                    <div
                      key={surgery.id}
                      className={cn(
                        "absolute px-1 py-0.5 overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-10",
                        // Room blocks and slot reservations: no left border accent (use full border from getStatusClass)
                        !isRoomBlock && !isSlotReservation && "border-l-4",
                        getStatusClass(surgery),
                        isTruncatedStart ? "rounded-b" : "rounded-t",
                        isTruncatedEnd ? "rounded-t" : "rounded-b",
                        !isTruncatedStart && !isTruncatedEnd && "rounded",
                        qDot && !isRoomBlock && !isSlotReservation && "pr-3"
                      )}
                      style={{ top, height: Math.max(height - 2, 28), left, right, width, ...getRoomBlockStyle(surgery) }}
                      onClick={() => onEventClick?.(surgery.id, surgery.patientId)}
                      title={
                        isRoomBlock
                          ? `${startTime} - ${t('opCalendar.roomBlocked', 'BLOCKED')}\n${roomName}${surgery.notes ? `\n${surgery.notes}` : ''}`
                          : isSlotReservation
                            ? `${startTime} - ${t('opCalendar.slotReserved', 'SLOT RESERVED')}\n${roomName}${surgery.surgeonName ? `\n${surgery.surgeonName}` : ''}`
                            : `${startTime} - ${procedureName}\n${patientName}\n${roomName}${pacuBedName ? `\n${t('anesthesia.pacu.pacuBedShort', 'PACU')}: ${pacuBedName}` : ''}`
                      }
                      data-testid={`surgery-event-${surgery.id}`}
                    >
                      {isRoomBlock ? (
                        <>
                          {isTruncatedStart && (
                            <div className="text-[8px] text-center opacity-60">▲ {t('opCalendar.weekView.earlier')}</div>
                          )}
                          <div className="text-[10px] font-bold truncate uppercase">
                            {t('opCalendar.roomBlocked', 'BLOCKED')}
                          </div>
                          {height > 40 && (
                            <div className="text-[10px] truncate opacity-90">
                              {startTime} {roomName}
                            </div>
                          )}
                          {height > 55 && surgery.notes && (
                            <div className="text-[10px] truncate opacity-80">
                              {surgery.notes}
                            </div>
                          )}
                        </>
                      ) : isSlotReservation ? (
                        <>
                          {isTruncatedStart && (
                            <div className="text-[8px] text-center opacity-60">▲ {t('opCalendar.weekView.earlier')}</div>
                          )}
                          <div className="text-[10px] font-bold truncate">
                            {t('opCalendar.slotReserved', 'SLOT RESERVED')}
                          </div>
                          {height > 40 && (
                            <div className="text-[10px] truncate opacity-90">
                              {startTime} {roomName}
                            </div>
                          )}
                          {height > 55 && surgery.surgeonName && (
                            <div className="text-[10px] truncate opacity-80">
                              {surgery.surgeonName}
                            </div>
                          )}
                          {height > 70 && surgery.notes && (
                            <div className="text-[10px] truncate opacity-80 italic">
                              {surgery.notes}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {qDot && (
                            <div
                              className={`absolute top-1 right-1 w-2 h-2 rounded-full ${qDot.color} ring-1 ring-white/50`}
                              title={qDot.label}
                              data-testid={`questionnaire-dot-week-${surgery.id}`}
                            />
                          )}
                          {isTruncatedStart && (
                            <div className="text-[8px] text-center opacity-60">▲ {t('opCalendar.weekView.earlier')}</div>
                          )}
                          <div className="text-[10px] font-semibold truncate">
                            {startTime} {roomName}
                          </div>
                          {height > 40 && (
                            <div className="text-[10px] truncate opacity-80">
                              {procedureName}
                            </div>
                          )}
                          {height > 55 && (
                            <div className="text-[10px] truncate opacity-70">
                              {patientName}
                            </div>
                          )}
                          {surgery.isSuspended && height > 30 && (
                            <div className="text-[9px] font-bold truncate text-amber-800 dark:text-amber-200" data-testid={`badge-suspended-week-${surgery.id}`}>
                              {t('opCalendar.suspended', 'ABGESETZT')}
                            </div>
                          )}
                          {getPreOpStatus && surgery.status !== 'cancelled' && !surgery.isSuspended && height > 40 && (() => {
                            const status = getPreOpStatus(surgery.id);
                            const StatusIcon = status.icon;
                            return (
                              <div className={`flex items-center gap-0.5 leading-tight mt-0.5 ${status.badgeClass} px-1 py-0.5 rounded w-fit max-w-full`} data-testid={`preop-status-week-${surgery.id}`} title={status.label}>
                                <StatusIcon className="w-2.5 h-2.5 shrink-0" />
                                <span className="hidden sm:inline text-[9px] font-medium truncate">{status.label}</span>
                              </div>
                            );
                          })()}
                          {pacuBedName && surgery.status !== 'cancelled' && !surgery.isSuspended && height > 40 && (
                            <div className="text-[8px] font-medium text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/50 px-0.5 rounded mt-0.5 truncate" data-testid={`badge-pacu-bed-week-${surgery.id}`}>
                              {t('anesthesia.pacu.pacuBedShort', 'PACU')}: {pacuBedName}
                            </div>
                          )}
                          {isTruncatedEnd && height > 40 && (
                            <div className="text-[8px] text-center opacity-60 absolute bottom-0 left-0 right-0">▼ {t('opCalendar.weekView.later')}</div>
                          )}
                        </>
                      )}
                      {/* Suspended/cancelled badges for all types */}
                      {(isRoomBlock || isSlotReservation) && surgery.isSuspended && height > 30 && (
                        <div className="text-[9px] font-bold truncate text-amber-800 dark:text-amber-200" data-testid={`badge-suspended-week-${surgery.id}`}>
                          {t('opCalendar.suspended', 'ABGESETZT')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
