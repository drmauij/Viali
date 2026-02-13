import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface PreOpStatusInfo {
  key: string;
  icon: LucideIcon;
  color: string;
  label: string;
}

interface TimelineWeekViewProps {
  surgeryRooms: any[];
  allRooms?: any[];
  surgeries: any[];
  patients?: any[];
  selectedDate: Date;
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
  const getPatientName = (patientId: string) => {
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

  // Global mouseup listener for drag selection
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

  return (
    <div className="vertical-week-view h-full flex flex-col" data-testid="timeline-week-view">
      {/* Day headers */}
      <div className="flex border-b bg-muted/30">
        {/* Time gutter header */}
        <div className="w-16 flex-shrink-0 p-2 border-r text-xs text-muted-foreground font-medium">
          
        </div>
        {/* Day columns headers */}
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
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
            
            return (
              <div
                key={dayIdx}
                className={cn(
                  "flex-1 border-r relative",
                  isToday(day) && "bg-primary/5"
                )}
                data-testid={`day-column-${day.format('YYYY-MM-DD')}`}
              >
                {/* 15-minute slot grid */}
                {Array.from({ length: TOTAL_SLOTS }, (_, slotIdx) => {
                  const isHourBoundary = slotIdx % SLOTS_PER_HOUR === 0;
                  return (
                    <div
                      key={slotIdx}
                      className={cn(
                        "cursor-pointer select-none",
                        isHourBoundary ? "border-b border-border" : "border-b border-border/20"
                      )}
                      style={{ height: SLOT_HEIGHT }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleMouseDown(dayIdx, slotIdx);
                      }}
                      onMouseEnter={() => handleMouseEnter(dayIdx, slotIdx)}
                      onMouseUp={handleMouseUp}
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
                  const startTime = moment(displayStart).format('HH:mm');
                  const pacuBedName = getPacuBedName(surgery.pacuBedId);
                  
                  return (
                    <div
                      key={surgery.id}
                      className={cn(
                        "absolute border-l-4 px-1 py-0.5 overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-10",
                        getStatusClass(surgery),
                        isTruncatedStart ? "rounded-b" : "rounded-t",
                        isTruncatedEnd ? "rounded-t" : "rounded-b",
                        !isTruncatedStart && !isTruncatedEnd && "rounded"
                      )}
                      style={{ top, height: Math.max(height - 2, 28), left, right, width }}
                      onClick={() => onEventClick?.(surgery.id, surgery.patientId)}
                      title={`${startTime} - ${procedureName}\n${patientName}\n${roomName}${pacuBedName ? `\n${t('anesthesia.pacu.pacuBedShort', 'PACU')}: ${pacuBedName}` : ''}`}
                      data-testid={`surgery-event-${surgery.id}`}
                    >
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
                          <div className={`flex items-center gap-0.5 leading-tight mt-0.5 ${status.color}`} data-testid={`preop-status-week-${surgery.id}`} title={status.label}>
                            <StatusIcon className="w-3 h-3 sm:w-2.5 sm:h-2.5 shrink-0" />
                            <span className="hidden sm:inline text-[9px] truncate">{status.label}</span>
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
