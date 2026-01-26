import { useMemo } from "react";
import moment from "moment";
import "moment/locale/en-gb";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

moment.locale('en-gb');

interface TimelineWeekViewProps {
  surgeryRooms: any[];
  surgeries: any[];
  patients?: any[];
  selectedDate: Date;
  onEventClick?: (surgeryId: string, patientId: string) => void;
  onEventDrop?: (surgeryId: string, newStart: Date, newEnd: Date, newRoomId: string) => void;
  onCanvasClick?: (groupId: string, time: Date) => void;
}

// Business hours
const BUSINESS_HOUR_START = 7;
const BUSINESS_HOUR_END = 22;
const HOUR_HEIGHT = 60; // pixels per hour

export default function TimelineWeekView({
  surgeryRooms,
  surgeries,
  patients = [],
  selectedDate,
  onEventClick,
  onCanvasClick,
}: TimelineWeekViewProps) {
  const { i18n } = useTranslation();
  
  // Calculate week days (Monday to Sunday)
  const weekDays = useMemo(() => {
    const weekStart = moment(selectedDate).startOf('isoWeek');
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(moment(weekStart).add(i, 'days'));
    }
    return days;
  }, [selectedDate]);

  // Generate time slots (hours)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
      slots.push(hour);
    }
    return slots;
  }, []);

  // Get surgeries for a specific day
  const getSurgeriesForDay = (day: moment.Moment) => {
    const dayStart = day.clone().startOf('day');
    const dayEnd = day.clone().endOf('day');
    
    return surgeries.filter(surgery => {
      const surgeryDate = moment(surgery.plannedDate);
      return surgeryDate.isBetween(dayStart, dayEnd, 'day', '[]');
    });
  };

  // Get patient name
  const getPatientName = (patientId: string) => {
    const patient = patients.find((p: any) => p.id === patientId);
    return patient ? `${patient.surname}, ${patient.firstName}` : "Unknown";
  };

  // Get room name
  const getRoomName = (roomId: string) => {
    const room = surgeryRooms.find((r: any) => r.id === roomId);
    return room ? room.name : "?";
  };

  // Get status color for surgery
  const getStatusClass = (surgery: any) => {
    if (surgery.status === "cancelled") {
      return "bg-gray-300 border-gray-400 text-gray-600 line-through";
    }
    
    if (surgery.timeMarkers) {
      const hasA2 = surgery.timeMarkers.find((m: any) => m.code === 'A2' && m.time !== null);
      const hasX2 = surgery.timeMarkers.find((m: any) => m.code === 'X2' && m.time !== null);
      const hasO2 = surgery.timeMarkers.find((m: any) => m.code === 'O2' && m.time !== null);
      const hasO1 = surgery.timeMarkers.find((m: any) => m.code === 'O1' && m.time !== null);
      
      if (hasA2 || hasX2) {
        return "bg-green-100 border-green-500 text-green-800";
      } else if (hasO2) {
        return "bg-yellow-100 border-yellow-500 text-yellow-800";
      } else if (hasO1) {
        return "bg-red-100 border-red-500 text-red-800";
      }
    }
    
    return "bg-primary/10 border-primary text-primary";
  };

  // Calculate surgery position and height
  const getSurgeryStyle = (surgery: any) => {
    const startTime = moment(surgery.plannedDate);
    const endTime = surgery.actualEndTime 
      ? moment(surgery.actualEndTime)
      : moment(surgery.plannedDate).add(3, 'hours');
    
    const startHour = startTime.hour() + startTime.minute() / 60;
    const endHour = endTime.hour() + endTime.minute() / 60;
    
    // Clamp to business hours
    const clampedStart = Math.max(startHour, BUSINESS_HOUR_START);
    const clampedEnd = Math.min(endHour, BUSINESS_HOUR_END);
    
    const top = (clampedStart - BUSINESS_HOUR_START) * HOUR_HEIGHT;
    const height = Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 30);
    
    return { top, height };
  };

  const isToday = (day: moment.Moment) => {
    return day.isSame(moment(), 'day');
  };

  const formatDayHeader = (day: moment.Moment) => {
    const locale = i18n.language.startsWith('de') ? 'de' : 'en-gb';
    return day.locale(locale).format('ddd DD.MM');
  };

  const handleCanvasClick = (day: moment.Moment, hour: number) => {
    if (!onCanvasClick) return;
    const clickTime = day.clone().hour(hour).minute(0).toDate();
    // Use first room as default
    const roomId = surgeryRooms[0]?.id || '';
    onCanvasClick(roomId, clickTime);
  };

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
              "flex-1 p-2 text-center border-r text-sm font-medium",
              isToday(day) && "bg-primary/10 text-primary"
            )}
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
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => handleCanvasClick(day, hour)}
                    data-testid={`time-slot-${day.format('YYYY-MM-DD')}-${hour}`}
                  />
                ))}

                {/* Surgery events */}
                {daySurgeries.map((surgery) => {
                  const { top, height } = getSurgeryStyle(surgery);
                  const roomName = getRoomName(surgery.surgeryRoomId);
                  const patientName = getPatientName(surgery.patientId);
                  const procedureName = surgery.plannedSurgery || 'Surgery';
                  const startTime = moment(surgery.plannedDate).format('HH:mm');
                  
                  return (
                    <div
                      key={surgery.id}
                      className={cn(
                        "absolute left-1 right-1 rounded border-l-4 px-1 py-0.5 overflow-hidden cursor-pointer transition-all hover:shadow-md hover:z-10",
                        getStatusClass(surgery)
                      )}
                      style={{ top, height: Math.max(height - 2, 28) }}
                      onClick={() => onEventClick?.(surgery.id, surgery.patientId)}
                      title={`${startTime} - ${procedureName}\n${patientName}\n${roomName}`}
                      data-testid={`surgery-event-${surgery.id}`}
                    >
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
