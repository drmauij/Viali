import { useMemo, useRef, useEffect, useState } from "react";
import Timeline, {
  TimelineHeaders,
  SidebarHeader,
  DateHeader,
  TimelineGroupBase,
  TimelineItemBase,
} from "react-calendar-timeline";
import "react-calendar-timeline/style.css";
import moment from "moment";
import "moment/locale/en-gb";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";

moment.locale('en-gb');

// Define custom types
interface TimelineGroup extends TimelineGroupBase {
  title: string;
}

interface TimelineItem extends TimelineItemBase<number> {
  title: string;
}

interface TimelineWeekViewProps {
  surgeryRooms: any[];
  surgeries: any[];
  patients?: any[];
  selectedDate: Date;
  onEventClick?: (surgeryId: string, patientId: string) => void;
  onEventDrop?: (surgeryId: string, newStart: Date, newEnd: Date, newRoomId: string) => void;
  onCanvasClick?: (groupId: string, time: Date) => void;
}

export default function TimelineWeekView({
  surgeryRooms,
  surgeries,
  patients = [],
  selectedDate,
  onEventClick,
  onEventDrop,
  onCanvasClick,
}: TimelineWeekViewProps) {
  // Track current state (room, times) to avoid race conditions
  const currentStateRef = useRef<Map<string, { roomId: string; start: Date; end: Date }>>(new Map());

  // Zoom state - start with 2 days visible
  const [visibleTimeStart, setVisibleTimeStart] = useState<number>(0);
  const [visibleTimeEnd, setVisibleTimeEnd] = useState<number>(0);

  // Calculate week start (Monday) and end (Sunday)
  const weekRange = useMemo(() => {
    const start = moment(selectedDate).startOf('isoWeek'); // Monday
    const end = moment(selectedDate).endOf('isoWeek'); // Sunday
    return { start, end };
  }, [selectedDate]);

  // Initialize visible time to show 7:00-22:00 on the selected day (15 hours)
  useEffect(() => {
    const dayStart = moment(selectedDate).startOf('day').add(7, 'hours'); // 7:00
    const dayEnd = moment(selectedDate).startOf('day').add(22, 'hours'); // 22:00
    setVisibleTimeStart(dayStart.valueOf());
    setVisibleTimeEnd(dayEnd.valueOf());
  }, [selectedDate]);

  // Zoom handlers
  const handleZoomIn = () => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const currentRange = visibleTimeEnd - visibleTimeStart;
    const newRange = currentRange * 0.7; // Zoom in by 30%
    setVisibleTimeStart(center - newRange / 2);
    setVisibleTimeEnd(center + newRange / 2);
  };

  const handleZoomOut = () => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const currentRange = visibleTimeEnd - visibleTimeStart;
    const newRange = Math.min(currentRange * 1.3, weekRange.end.valueOf() - weekRange.start.valueOf());
    const newStart = Math.max(center - newRange / 2, weekRange.start.valueOf());
    const newEnd = Math.min(center + newRange / 2, weekRange.end.valueOf());
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
  };

  const handleTimeChange = (visibleStart: number, visibleEnd: number) => {
    setVisibleTimeStart(visibleStart);
    setVisibleTimeEnd(visibleEnd);
  };

  // Initialize state from surgeries
  useEffect(() => {
    surgeries.forEach((surgery) => {
      const roomId = surgery.surgeryRoomId || surgeryRooms[0]?.id || "unassigned";
      const plannedDate = new Date(surgery.plannedDate);
      const endTime = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime)
        : new Date(plannedDate.getTime() + 3 * 60 * 60 * 1000);
      
      currentStateRef.current.set(surgery.id, {
        roomId,
        start: plannedDate,
        end: endTime,
      });
    });
  }, [surgeries, surgeryRooms]);

  // Transform surgery rooms into timeline groups
  const groups: TimelineGroup[] = useMemo(() => {
    return surgeryRooms.map((room) => ({
      id: room.id,
      title: room.name,
    }));
  }, [surgeryRooms]);

  // Transform surgeries into timeline items
  const items: TimelineItem[] = useMemo(() => {
    return surgeries.map((surgery) => {
      const plannedDate = new Date(surgery.plannedDate);
      const endTime = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime)
        : new Date(plannedDate.getTime() + 3 * 60 * 60 * 1000); // Default 3 hours
      
      // Look up patient name from patients array
      const patient = patients.find((p: any) => p.id === surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "Unknown Patient";
      
      // Determine status class based on time markers
      let statusClass = 'timeline-item-active'; // default blue
      
      if (surgery.status === "cancelled") {
        statusClass = 'timeline-item-cancelled';
      } else if (surgery.timeMarkers) {
        const hasA2 = surgery.timeMarkers.find((m: any) => m.code === 'A2' && m.time !== null);
        const hasX2 = surgery.timeMarkers.find((m: any) => m.code === 'X2' && m.time !== null);
        const hasO2 = surgery.timeMarkers.find((m: any) => m.code === 'O2' && m.time !== null);
        const hasO1 = surgery.timeMarkers.find((m: any) => m.code === 'O1' && m.time !== null);
        
        if (hasA2 || hasX2) {
          statusClass = 'timeline-item-completed'; // green
        } else if (hasO2) {
          statusClass = 'timeline-item-suture'; // yellow
        } else if (hasO1) {
          statusClass = 'timeline-item-running'; // red
        }
      }
      
      return {
        id: surgery.id,
        group: surgery.surgeryRoomId || surgeryRooms[0]?.id || "unassigned",
        title: `${surgery.plannedSurgery || 'Surgery'}\n${patientName}`,
        start_time: moment(plannedDate).valueOf(),
        end_time: moment(endTime).valueOf(),
        itemProps: {
          className: statusClass,
          onDoubleClick: () => onEventClick?.(surgery.id, surgery.patientId),
          'data-testid': `timeline-event-${surgery.id}`,
        },
      };
    });
  }, [surgeries, surgeryRooms, patients, onEventClick]);

  const handleItemMove = (itemId: string | number, dragTime: number, newGroupOrder: number) => {
    if (!onEventDrop) return;
    
    const id = String(itemId);
    const surgery = surgeries.find(s => s.id === id);
    if (!surgery) return;

    // Get current state to calculate duration
    const currentState = currentStateRef.current.get(id);
    const currentStart = currentState?.start || new Date(surgery.plannedDate);
    const currentEnd = currentState?.end || (surgery.actualEndTime 
      ? new Date(surgery.actualEndTime)
      : new Date(new Date(surgery.plannedDate).getTime() + 3 * 60 * 60 * 1000));
    
    const duration = moment(currentEnd).diff(moment(currentStart));
    const newStart = moment(dragTime).toDate();
    const newEnd = moment(dragTime).add(duration).toDate();
    const newRoomId = String(groups[newGroupOrder]?.id);

    if (newRoomId) {
      // Update local state immediately
      currentStateRef.current.set(id, {
        roomId: newRoomId,
        start: newStart,
        end: newEnd,
      });
      onEventDrop(id, newStart, newEnd, newRoomId);
    }
  };

  const handleItemResize = (itemId: string | number, time: number, edge: 'left' | 'right') => {
    if (!onEventDrop) return;
    
    const id = String(itemId);
    const surgery = surgeries.find(s => s.id === id);
    if (!surgery) return;

    // Get current state to avoid race conditions
    const currentState = currentStateRef.current.get(id);
    const roomId = currentState?.roomId || surgery.surgeryRoomId || surgeryRooms[0]?.id || "unassigned";
    const currentStart = currentState?.start || new Date(surgery.plannedDate);
    const currentEnd = currentState?.end || (surgery.actualEndTime 
      ? new Date(surgery.actualEndTime)
      : new Date(new Date(surgery.plannedDate).getTime() + 3 * 60 * 60 * 1000));

    let newStart = moment(currentStart);
    let newEnd = moment(currentEnd);

    if (edge === 'left') {
      newStart = moment(time);
    } else {
      newEnd = moment(time);
    }

    const finalStart = newStart.toDate();
    const finalEnd = newEnd.toDate();

    // Update local state immediately
    currentStateRef.current.set(id, {
      roomId,
      start: finalStart,
      end: finalEnd,
    });

    onEventDrop(id, finalStart, finalEnd, roomId);
  };

  const handleCanvasClick = (groupId: number | string, time: number) => {
    if (!onCanvasClick) return;
    
    const roomId = String(groupId);
    const clickedTime = new Date(time);
    
    onCanvasClick(roomId, clickedTime);
  };

  if (!visibleTimeStart || !visibleTimeEnd) {
    return <div className="timeline-week-view">Loading...</div>;
  }

  return (
    <div className="timeline-week-view-container">
      <div className="timeline-week-view" data-testid="timeline-week-view">
        <Timeline
          groups={groups}
          items={items}
          defaultTimeStart={weekRange.start.valueOf()}
          defaultTimeEnd={weekRange.end.valueOf()}
          visibleTimeStart={visibleTimeStart}
          visibleTimeEnd={visibleTimeEnd}
          onTimeChange={handleTimeChange}
          canMove={true}
          canResize="both"
          canChangeGroup={true}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onCanvasClick={handleCanvasClick}
          lineHeight={60}
          itemHeightRatio={0.8}
          minZoom={30 * 60 * 1000}
          maxZoom={7 * 24 * 60 * 60 * 1000}
          sidebarWidth={100}
          stackItems={true}
          buffer={1}
        >
        <TimelineHeaders>
          <SidebarHeader>
            {({ getRootProps }) => (
              <div {...getRootProps()} className="timeline-sidebar-header-with-controls">
                <div className="flex gap-2" data-testid="timeline-zoom-controls">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleZoomIn}
                    data-testid="button-zoom-in"
                    className="h-9 w-9"
                  >
                    <ZoomIn className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleZoomOut}
                    data-testid="button-zoom-out"
                    className="h-9 w-9"
                  >
                    <ZoomOut className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}
          </SidebarHeader>
          <DateHeader
            unit="day"
            labelFormat={(interval: any) => {
              const startTime = interval[0] || interval.startTime;
              return moment(startTime.toDate ? startTime.toDate() : startTime).format('DD.MM.YY');
            }}
            style={{ height: 50 }}
          />
          <DateHeader
            unit="hour"
            labelFormat={(interval: any) => {
              const startTime = interval[0] || interval.startTime;
              return moment(startTime.toDate ? startTime.toDate() : startTime).format('HH:mm');
            }}
            style={{ height: 40 }}
          />
        </TimelineHeaders>
      </Timeline>
      </div>
    </div>
  );
}
