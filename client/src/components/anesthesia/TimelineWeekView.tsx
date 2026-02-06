import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import "moment/locale/de";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

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
}

interface DragState {
  isDragging: boolean;
  dayIdx: number;
  startHour: number;
  endHour: number;
}

// Business hours
const BUSINESS_HOUR_START = 7;
const BUSINESS_HOUR_END = 22;
const HOUR_HEIGHT = 60; // pixels per hour

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
}: TimelineWeekViewProps) {
  const { t, i18n } = useTranslation();
  
  // Drag selection state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const isDraggingRef = useRef(false);
  
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

  const handleCanvasClick = (day: moment.Moment, hour: number) => {
    if (!onCanvasClick) return;
    const clickTime = day.clone().hour(hour).minute(0).toDate();
    // Use first room as default
    const roomId = surgeryRooms[0]?.id || '';
    onCanvasClick(roomId, clickTime);
  };

  // Drag selection handlers
  const handleMouseDown = useCallback((dayIdx: number, hour: number) => {
    isDraggingRef.current = true;
    setDragState({
      isDragging: true,
      dayIdx,
      startHour: hour,
      endHour: hour + 1, // At least 1 hour selection
    });
  }, []);

  const handleMouseEnter = useCallback((dayIdx: number, hour: number) => {
    if (!isDraggingRef.current || !dragState) return;
    // Only allow dragging within the same day
    if (dayIdx !== dragState.dayIdx) return;
    
    setDragState(prev => {
      if (!prev) return null;
      const newEndHour = Math.max(hour + 1, prev.startHour + 1);
      return { ...prev, endHour: newEndHour };
    });
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current || !dragState) {
      isDraggingRef.current = false;
      setDragState(null);
      return;
    }
    
    isDraggingRef.current = false;
    
    // Calculate time range
    const day = weekDays[dragState.dayIdx];
    const startTime = day.clone().hour(dragState.startHour).minute(0).toDate();
    const endTime = day.clone().hour(dragState.endHour).minute(0).toDate();
    const roomId = surgeryRooms[0]?.id || '';
    
    // Only trigger if dragged more than 1 hour (otherwise it's a click)
    if (dragState.endHour - dragState.startHour > 1 && onSlotSelect) {
      onSlotSelect(roomId, startTime, endTime);
    } else if (onCanvasClick) {
      // Single click behavior
      onCanvasClick(roomId, startTime);
    }
    
    setDragState(null);
  }, [dragState, weekDays, surgeryRooms, onSlotSelect, onCanvasClick]);

  // Check if an hour slot is within the current drag selection
  const isHourInDragSelection = (dayIdx: number, hour: number): boolean => {
    if (!dragState || dragState.dayIdx !== dayIdx) return false;
    return hour >= dragState.startHour && hour < dragState.endHour;
  };

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
                className="border-b text-xs text-muted-foreground text-right pr-2 pt-1"
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
                {/* Hour grid lines */}
                {timeSlots.map((hour) => (
                  <div
                    key={hour}
                    className={cn(
                      "border-b cursor-pointer select-none",
                      isHourInDragSelection(dayIdx, hour)
                        ? "bg-primary/30"
                        : "hover:bg-muted/30"
                    )}
                    style={{ height: HOUR_HEIGHT }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleMouseDown(dayIdx, hour);
                    }}
                    onMouseEnter={() => handleMouseEnter(dayIdx, hour)}
                    onMouseUp={handleMouseUp}
                    data-testid={`time-slot-${day.format('YYYY-MM-DD')}-${hour}`}
                  />
                ))}

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
                      title={`${startTime} - ${procedureName}\n${patientName}\n${roomName}${pacuBedName ? `\nAWR: ${pacuBedName}` : ''}`}
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
                      {pacuBedName && surgery.status !== 'cancelled' && height > 40 && (
                        <div className="text-[8px] font-medium text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/50 px-0.5 rounded mt-0.5 truncate" data-testid={`badge-pacu-bed-week-${surgery.id}`}>
                          AWR: {pacuBedName}
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
