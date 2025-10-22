import { useState, useMemo } from "react";
import { DayPilot, DayPilotCalendar, DayPilotMonth } from "@daypilot/daypilot-lite-react";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDays, CalendarRange } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type ViewType = "day" | "week" | "month";

interface OPCalendarProps {
  onEventClick?: (caseId: string) => void;
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
  const [currentView, setCurrentView] = useState<ViewType>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Fetch surgery rooms
  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/test-hospital-1`],
  });

  // Mock events data - will be replaced with real data
  const mockEvents = useMemo(() => {
    const formatDateTime = (hours: number, minutes: number) => {
      const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hours, minutes);
      return date.toISOString();
    };

    return [
      {
        id: "case-1",
        text: "Rossi, Maria - Cholecystectomy",
        start: formatDateTime(8, 0),
        end: formatDateTime(11, 0),
        resource: surgeryRooms[0]?.id || "or1",
        barColor: "#10b981",
        backColor: "#d1fae5",
        borderColor: "#10b981",
        fontColor: "#065f46",
      },
      {
        id: "case-2",
        text: "Bianchi, Giovanni - Hip Replacement",
        start: formatDateTime(9, 30),
        end: formatDateTime(14, 0),
        resource: surgeryRooms[1]?.id || "or2",
        barColor: "#3b82f6",
        backColor: "#dbeafe",
        borderColor: "#3b82f6",
        fontColor: "#1e40af",
      },
    ];
  }, [selectedDate, surgeryRooms]);

  // Convert surgery rooms to resources format
  const resources = useMemo(() => {
    return surgeryRooms.map((room: any) => ({
      id: room.id,
      name: room.name,
    }));
  }, [surgeryRooms]);

  const handleEventClick = (args: any) => {
    if (onEventClick) {
      onEventClick(args.e.id());
    }
  };

  const handleDayClick = (args: any) => {
    // Zoom to day view when clicking a day in month or week view
    if (currentView === "month" || currentView === "week") {
      // DayPilot passes the date in args.start - need to convert DayPilot.Date to JS Date
      const selectedDay = args.start.toDate ? args.start.toDate() : new Date(args.start);
      setSelectedDate(selectedDay);
      setCurrentView("day");
    }
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const navigatePrevious = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") {
      newDate.setDate(newDate.getDate() - 1);
    } else if (currentView === "week") {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setSelectedDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(selectedDate);
    if (currentView === "day") {
      newDate.setDate(newDate.getDate() + 1);
    } else if (currentView === "week") {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };

  const formatDateHeader = () => {
    const options: Intl.DateTimeFormatOptions = 
      currentView === "month" 
        ? { year: "numeric", month: "long" }
        : currentView === "week"
        ? { year: "numeric", month: "long", day: "numeric" }
        : { year: "numeric", month: "long", day: "numeric" };
    
    return selectedDate.toLocaleDateString("en-US", options);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with view switcher and navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 p-4 bg-background border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={navigatePrevious}
            data-testid="button-calendar-prev"
          >
            ←
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            data-testid="button-calendar-today"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={navigateNext}
            data-testid="button-calendar-next"
          >
            →
          </Button>
          <span className="ml-4 font-semibold text-lg" data-testid="text-calendar-date">
            {formatDateHeader()}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant={currentView === "day" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("day")}
            data-testid="button-view-day"
          >
            <Calendar className="h-4 w-4 mr-1" />
            Day
          </Button>
          <Button
            variant={currentView === "week" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("week")}
            data-testid="button-view-week"
          >
            <CalendarDays className="h-4 w-4 mr-1" />
            Week
          </Button>
          <Button
            variant={currentView === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("month")}
            data-testid="button-view-month"
          >
            <CalendarRange className="h-4 w-4 mr-1" />
            Month
          </Button>
        </div>
      </div>

      {/* Calendar views */}
      <div className="flex-1 px-4 pb-4">
        {currentView === "day" && (
          <DayPilotCalendar
            viewType="Resources"
            startDate={selectedDate.toISOString().split('T')[0]}
            days={1}
            businessBeginsHour={6}
            businessEndsHour={20}
            heightSpec="BusinessHoursNoScroll"
            headerHeight={30}
            hourWidth={60}
            cellHeight={40}
            columns={resources}
            events={mockEvents}
            onEventClick={handleEventClick}
            theme="calendar_white"
          />
        )}

        {currentView === "week" && (
          <DayPilotCalendar
            viewType="Week"
            startDate={selectedDate.toISOString().split('T')[0]}
            days={7}
            businessBeginsHour={6}
            businessEndsHour={20}
            heightSpec="BusinessHoursNoScroll"
            headerHeight={30}
            hourWidth={60}
            cellHeight={30}
            events={mockEvents}
            onEventClick={handleEventClick}
            onTimeRangeSelected={handleDayClick}
            theme="calendar_white"
          />
        )}

        {currentView === "month" && (
          <DayPilotMonth
            startDate={selectedDate.toISOString().split('T')[0]}
            events={mockEvents}
            onEventClick={handleEventClick}
            onTimeRangeSelected={handleDayClick}
            eventBarVisible={false}
            cellHeight={80}
            theme="month_white"
          />
        )}
      </div>

      {/* Custom styles to match UI */}
      <style>{`
        /* Apply Poppins font to calendar */
        .calendar_white_main,
        .month_white_main,
        .calendar_white_cell,
        .calendar_white_event,
        .month_white_cell,
        .month_white_event {
          font-family: 'Poppins', sans-serif !important;
        }

        /* Theme adjustments */
        .calendar_white_event {
          border-radius: 6px;
          padding: 4px 8px;
          font-size: 13px;
        }

        .month_white_event {
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 12px;
          margin: 1px 0;
        }

        .calendar_white_corner {
          background: var(--background);
          border-color: var(--border);
        }

        .calendar_white_header {
          background: var(--muted);
          border-color: var(--border);
          font-weight: 600;
        }

        .calendar_white_cell {
          border-color: var(--border);
        }

        .month_white_cell {
          border-color: var(--border);
        }

        .month_white_cell_business {
          background: var(--background);
        }

        .month_white_cell_other {
          background: var(--muted);
          opacity: 0.6;
        }
      `}</style>
    </div>
  );
}
