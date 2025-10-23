import { useState, useMemo, useEffect } from "react";
import { DayPilot, DayPilotCalendar, DayPilotMonth } from "@daypilot/daypilot-lite-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CalendarDays, CalendarRange, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";

type ViewType = "day" | "week" | "month";

interface OPCalendarProps {
  onEventClick?: (caseId: string) => void;
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
  const [currentView, setCurrentView] = useState<ViewType>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();

  // Fetch surgery rooms for the active hospital
  const { data: surgeryRooms = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Mock events data - will be replaced with real data
  const mockEvents = useMemo(() => {
    const formatDateTime = (hours: number, minutes: number) => {
      const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hours, minutes);
      return date.toISOString();
    };

    // Using app's color scheme: primary (blue) and accent (orange)
    return [
      {
        id: "case-1",
        text: "Rossi, Maria - Cholecystectomy",
        start: formatDateTime(8, 0),
        end: formatDateTime(11, 0),
        resource: surgeryRooms[0]?.id || "or1",
        barColor: "#2563eb", // Primary blue
        backColor: "#eff6ff", // Very light blue
        borderColor: "#93c5fd", // Light blue border
        fontColor: "#1e40af", // Dark blue text
      },
      {
        id: "case-2",
        text: "Bianchi, Giovanni - Hip Replacement",
        start: formatDateTime(9, 30),
        end: formatDateTime(14, 0),
        resource: surgeryRooms[1]?.id || "or2",
        barColor: "#ea580c", // Accent orange
        backColor: "#fff7ed", // Very light orange
        borderColor: "#fdba74", // Light orange border
        fontColor: "#9a3412", // Dark orange text
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

  // Format time labels using DOM manipulation
  useEffect(() => {
    const formatTimeLabels = () => {
      const rowHeaders = document.querySelectorAll('.calendar_white_rowheader_inner');
      rowHeaders.forEach((header: Element) => {
        const text = (header as HTMLElement).innerText.trim();
        // Check if it's a time label like "600", "700", etc.
        if (/^\d{3,4}$/.test(text)) {
          // Parse the time (e.g., "600" -> 6, "1300" -> 13)
          const timeNum = parseInt(text, 10);
          const hour = Math.floor(timeNum / 100);
          const minute = timeNum % 100;
          // Format as "H:mm" (e.g., "6:00", "13:00")
          (header as HTMLElement).innerText = `${hour}:${minute.toString().padStart(2, '0')}`;
        }
      });
    };

    // Run immediately and also after a short delay to catch any dynamic updates
    formatTimeLabels();
    const timer = setTimeout(formatTimeLabels, 100);
    
    return () => clearTimeout(timer);
  }, [currentView, selectedDate, resources]);

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

      {/* Empty state when no hospital selected */}
      {!activeHospital && (
        <div className="flex-1 px-4 pb-4 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="py-12 text-center">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Hospital Selected</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please select a hospital from the top bar to view the OP Schedule.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state when no surgery rooms */}
      {activeHospital && !isLoading && surgeryRooms.length === 0 && (
        <div className="flex-1 px-4 pb-4 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="py-12 text-center">
              <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Surgery Rooms Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                To use the OP Schedule calendar, you need to configure surgery rooms first.
              </p>
              <Button 
                onClick={() => setLocation("/anesthesia/settings")}
                data-testid="button-configure-rooms"
              >
                <i className="fas fa-cog mr-2"></i>
                Configure Rooms
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendar views */}
      {surgeryRooms.length > 0 && (
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
            timeFormat="Clock24Hours"
            locale="en-us"
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
            timeFormat="Clock24Hours"
            locale="en-us"
            headerDateFormat="d/M"
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
      )}

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
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 500;
          opacity: 0.95;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }

        .calendar_white_event:hover {
          opacity: 1;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transform: translateY(-1px);
        }

        .month_white_event {
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 500;
          margin: 2px 0;
          opacity: 0.95;
          transition: opacity 0.2s ease;
        }

        .month_white_event:hover {
          opacity: 1;
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
