import { useState, useMemo, useCallback } from "react";
import { Calendar, momentLocalizer, View, SlotInfo } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/en-gb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuickCreateSurgeryDialog from "./QuickCreateSurgeryDialog";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

// Configure moment for European format (British English locale for DD/MM/YYYY, 24-hour time, English labels)
moment.locale('en-gb');
const localizer = momentLocalizer(moment);
const DragAndDropCalendar = withDragAndDrop(Calendar);

type ViewType = "day" | "week" | "month" | "agenda";

interface OPCalendarProps {
  onEventClick?: (caseId: string) => void;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource?: string;
  surgeryId: string;
  patientId: string;
  plannedSurgery: string;
  patientName: string;
  patientBirthday: string;
  isCancelled: boolean;
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
  const [currentView, setCurrentView] = useState<ViewType>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Quick create dialog state
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateData, setQuickCreateData] = useState<{
    date: Date;
    endDate?: Date;
    roomId?: string;
  } | null>(null);

  // Fetch surgery rooms for the active hospital
  const { data: surgeryRooms = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Calculate date range based on current view
  const dateRange = useMemo(() => {
    const start = new Date(selectedDate);
    const end = new Date(selectedDate);
    
    if (currentView === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (currentView === "week") {
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  }, [selectedDate, currentView]);

  // Fetch surgeries for the date range
  const { data: surgeries = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/surgeries`, activeHospital?.id, dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams({
        hospitalId: activeHospital?.id || '',
        dateFrom: dateRange.start.toISOString(),
        dateTo: dateRange.end.toISOString(),
      });
      const response = await fetch(`/api/anesthesia/surgeries?${params}`);
      if (!response.ok) throw new Error('Failed to fetch surgeries');
      return response.json();
    },
    enabled: !!activeHospital?.id,
  });

  // Fetch patients for surgeries
  const patientIds = useMemo(() => 
    Array.from(new Set(surgeries.map((s: any) => s.patientId))),
    [surgeries]
  );

  const { data: allPatients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id && patientIds.length > 0,
  });

  // Transform surgeries into calendar events
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    return surgeries.map((surgery: any) => {
      const patient = allPatients.find((p: any) => p.id === surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "Unknown Patient";
      const patientBirthday = patient?.birthday 
        ? new Date(patient.birthday).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : "";
      
      const plannedDate = new Date(surgery.plannedDate);
      const endTime = surgery.actualEndTime 
        ? new Date(surgery.actualEndTime)
        : new Date(plannedDate.getTime() + 3 * 60 * 60 * 1000); // Default 3 hours
      
      const isCancelled = surgery.status === "cancelled";
      const title = `${surgery.plannedSurgery || 'No surgery specified'} - ${patientName}`;
      
      return {
        id: surgery.id,
        title,
        start: plannedDate,
        end: endTime,
        resource: surgery.surgeryRoomId || (surgeryRooms[0]?.id || "unassigned"),
        surgeryId: surgery.id,
        patientId: surgery.patientId,
        plannedSurgery: surgery.plannedSurgery || 'No surgery specified',
        patientName,
        patientBirthday,
        isCancelled,
      };
    });
  }, [surgeries, allPatients, surgeryRooms]);

  // Convert surgery rooms to resources
  const resources = useMemo(() => {
    return surgeryRooms.map((room: any) => ({
      id: room.id,
      title: room.name,
    }));
  }, [surgeryRooms]);

  // Handle event drop (drag and drop)
  const handleEventDrop = useCallback(async ({ event, start, end, resourceId }: any) => {
    const surgeryId = event.surgeryId;
    const newRoomId = resourceId || event.resource;
    
    try {
      await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: start.toISOString(),
        actualEndTime: end.toISOString(),
        surgeryRoomId: newRoomId,
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      
      toast({
        title: "Surgery Rescheduled",
        description: "Surgery has been successfully rescheduled.",
      });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Reschedule Failed",
        description: "Failed to reschedule surgery. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle event resize
  const handleEventResize = useCallback(async ({ event, start, end }: any) => {
    const surgeryId = event.surgeryId;
    
    try {
      await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: start.toISOString(),
        actualEndTime: end.toISOString(),
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      
      toast({
        title: "Surgery Duration Updated",
        description: "Surgery duration has been updated successfully.",
      });
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Update Failed",
        description: "Failed to update surgery duration. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Handle time slot selection (for quick create)
  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    // Only open quick create for actual time range selections, not when clicking/dragging events
    // SlotInfo.action can be 'select', 'click', or 'doubleClick'
    // We only want to open quick create on 'select' (drag selection) in day/week views
    if ((currentView === "day" || currentView === "week") && slotInfo.action === 'select') {
      setQuickCreateData({
        date: slotInfo.start,
        endDate: slotInfo.end,
        roomId: slotInfo.resourceId as string | undefined,
      });
      setQuickCreateOpen(true);
    }
  }, [currentView]);

  // Handle event click
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (onEventClick) {
      onEventClick(event.surgeryId);
    }
  }, [onEventClick]);

  // Custom event style getter
  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const style: any = {
      backgroundColor: event.isCancelled ? '#9ca3af' : '#3b82f6',
      borderColor: event.isCancelled ? '#6b7280' : '#2563eb',
      color: '#ffffff',
      borderRadius: '4px',
      opacity: event.isCancelled ? 0.7 : 1,
      border: '1px solid',
      display: 'block',
      textDecoration: event.isCancelled ? 'line-through' : 'none',
    };
    
    return { style };
  }, []);

  // Custom event component with action buttons
  const EventComponent = useCallback(({ event }: { event: CalendarEvent }) => {
    return (
      <div className="flex flex-col h-full p-1 relative" data-testid={`event-${event.surgeryId}`}>
        <div className={`font-bold text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.plannedSurgery}
        </div>
        <div className={`text-xs ${event.isCancelled ? 'line-through' : ''}`}>
          {event.patientName}
          {event.patientBirthday && `, ${event.patientBirthday}`}
        </div>
        {event.isCancelled && (
          <div className="text-xs font-semibold mt-0.5">CANCELLED</div>
        )}
        <div className="absolute bottom-1 right-1 flex gap-1">
          <button
            className="bg-white/20 hover:bg-white/30 rounded p-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/anesthesia/patients/${event.patientId}?openPreOp=${event.surgeryId}`);
            }}
            data-testid={`button-preop-${event.surgeryId}`}
          >
            <i className="fas fa-clipboard-list"></i>
          </button>
          <button
            className="bg-white/20 hover:bg-white/30 rounded p-1 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              if (onEventClick) {
                onEventClick(event.surgeryId);
              }
            }}
            data-testid={`button-op-${event.surgeryId}`}
          >
            <i className="fas fa-heartbeat"></i>
          </button>
        </div>
      </div>
    );
  }, [onEventClick, setLocation]);

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
    if (currentView === "month") {
      return moment(selectedDate).format('MMMM YYYY');
    }
    return moment(selectedDate).format('dddd, D. MMMM YYYY');
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
            <CalendarIcon className="h-4 w-4 mr-1" />
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
          <Button
            variant={currentView === "agenda" ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentView("agenda")}
            data-testid="button-view-agenda"
          >
            <i className="fas fa-list mr-1"></i>
            Agenda
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

      {/* Calendar */}
      {surgeryRooms.length > 0 && (
        <div className="flex-1 px-4 pb-4 calendar-container">
          <DragAndDropCalendar
            localizer={localizer}
            events={calendarEvents}
            resources={currentView === "day" || currentView === "week" ? resources : undefined}
            resourceIdAccessor="id"
            resourceTitleAccessor="title"
            startAccessor="start"
            endAccessor="end"
            resourceAccessor="resource"
            view={currentView}
            date={selectedDate}
            onNavigate={setSelectedDate}
            onView={(view: View) => setCurrentView(view as ViewType)}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
            eventPropGetter={eventStyleGetter}
            components={{
              event: EventComponent,
              toolbar: () => null,
            }}
            selectable
            resizable
            step={15}
            timeslots={4}
            min={new Date(0, 0, 0, 6, 0, 0)}
            max={new Date(0, 0, 0, 20, 0, 0)}
            style={{ height: 'calc(100vh - 200px)' }}
            popup
            data-testid="calendar-main"
          />
        </div>
      )}

      {/* Quick Create Surgery Dialog */}
      {quickCreateOpen && quickCreateData && activeHospital && (
        <QuickCreateSurgeryDialog
          open={quickCreateOpen}
          onOpenChange={(open) => {
            setQuickCreateOpen(open);
            if (!open) setQuickCreateData(null);
          }}
          hospitalId={activeHospital.id}
          initialDate={quickCreateData.date}
          initialEndDate={quickCreateData.endDate}
          initialRoomId={quickCreateData.roomId}
          surgeryRooms={surgeryRooms}
        />
      )}
    </div>
  );
}
