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
  selectedDate: Date;
  onEventClick?: (surgeryId: string) => void;
  onEventDrop?: (surgeryId: string, newStart: Date, newEnd: Date, newRoomId: string) => void;
}

export default function TimelineWeekView({
  surgeryRooms,
  surgeries,
  selectedDate,
  onEventClick,
  onEventDrop,
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

  // Initialize visible time to show 2 days centered on today
  useEffect(() => {
    const start = weekRange.start.clone();
    const end = start.clone().add(2, 'days');
    setVisibleTimeStart(start.valueOf());
    setVisibleTimeEnd(end.valueOf());
  }, [weekRange]);

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
      
      return {
        id: surgery.id,
        group: surgery.surgeryRoomId || surgeryRooms[0]?.id || "unassigned",
        title: `${surgery.plannedSurgery || 'Surgery'}\n${surgery.patientName || 'Unknown'}`,
        start_time: moment(plannedDate).valueOf(),
        end_time: moment(endTime).valueOf(),
        itemProps: {
          className: surgery.status === "cancelled" ? 'timeline-item-cancelled' : 'timeline-item-active',
          onDoubleClick: () => onEventClick?.(surgery.id),
          'data-testid': `timeline-event-${surgery.id}`,
        },
      };
    });
  }, [surgeries, surgeryRooms, onEventClick]);

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
          lineHeight={60}
          itemHeightRatio={0.8}
          minZoom={30 * 60 * 1000}
          maxZoom={7 * 24 * 60 * 60 * 1000}
          sidebarWidth={180}
          stackItems={true}
          buffer={1}
        >
        <TimelineHeaders>
          <SidebarHeader>
            {({ getRootProps }) => (
              <div {...getRootProps()} className="timeline-sidebar-header-with-controls">
                <div className="text-sm font-semibold mb-2">Surgery Rooms</div>
                <div className="flex gap-1" data-testid="timeline-zoom-controls">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleZoomIn}
                    data-testid="button-zoom-in"
                    className="gap-1 h-7 px-2 text-xs"
                  >
                    <ZoomIn className="h-3 w-3" />
                    Zoom In
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleZoomOut}
                    data-testid="button-zoom-out"
                    className="gap-1 h-7 px-2 text-xs"
                  >
                    <ZoomOut className="h-3 w-3" />
                    Zoom Out
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
