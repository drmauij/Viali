import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { DayPilot, DayPilotCalendar, DayPilotMonth } from "@daypilot/daypilot-lite-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CalendarDays, CalendarRange, Building2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useLocation } from "wouter";
import { formatDateHeader as formatDateHeaderUtil, formatMonthYear } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuickCreateSurgeryDialog from "./QuickCreateSurgeryDialog";
import { EditSurgeryDialog } from "./EditSurgeryDialog";

type ViewType = "day" | "week" | "month";

interface OPCalendarProps {
  onEventClick?: (caseId: string) => void;
}

export default function OPCalendar({ onEventClick }: OPCalendarProps) {
  const [currentView, setCurrentView] = useState<ViewType>("day");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const activeHospital = useActiveHospital();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Refs for DayPilot calendar instances to prevent remounting during updates
  const dayCalendarRef = useRef<DayPilot.Calendar | null>(null);
  const weekCalendarRef = useRef<DayPilot.Calendar | null>(null);
  const monthCalendarRef = useRef<DayPilot.Month | null>(null);
  
  // Refs for caching latest events and resources (uncontrolled component pattern)
  const latestEventsRef = useRef<any[]>([]);
  const latestResourcesRef = useRef<any[]>([]);
  const previousEventsSnapshotRef = useRef<string>("");
  const previousResourcesSnapshotRef = useRef<string>("");
  
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
      // Same day
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (currentView === "week") {
      // Week range (Monday to Sunday)
      const dayOfWeek = start.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust so Monday is first day
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // Month range
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

  // Fetch all patients for the hospital (we'll filter by ID in the frontend)
  const { data: allPatients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id && patientIds.length > 0,
  });

  // Fetch preop assessments for surgeries
  const surgeryIds = useMemo(() => surgeries.map((s: any) => s.id), [surgeries]);
  const { data: preopAssessments = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/preop-assessments`, activeHospital?.id, surgeryIds],
    queryFn: async () => {
      if (surgeryIds.length === 0) return [];
      const params = new URLSearchParams({
        surgeryIds: surgeryIds.join(','),
      });
      const response = await fetch(`/api/anesthesia/preop-assessments/bulk?${params}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && surgeryIds.length > 0,
  });

  // Helper function to escape HTML to prevent injection
  const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  };

  // State for edit dialog
  const [editingSurgeryId, setEditingSurgeryId] = useState<string | null>(null);

  // Transform surgeries into calendar events
  const calendarEvents = useMemo(() => {
    // Single unified color scheme
    const defaultColors = {
      barColor: "#3b82f6",
      backColor: "#3b82f6",
      borderColor: "#2563eb",
      fontColor: "#ffffff",
    };

    const cancelledColors = {
      barColor: "#9ca3af",
      backColor: "#9ca3af",
      borderColor: "#6b7280",
      fontColor: "#ffffff",
    };

    return surgeries.map((surgery: any) => {
      const patient = allPatients.find((p: any) => p.id === surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "Unknown Patient";
      const patientBirthday = patient?.birthday ? new Date(patient.birthday).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : "";
      const plannedDate = new Date(surgery.plannedDate);
      
      // Calculate duration in minutes
      const endTime = surgery.actualEndTime ? new Date(surgery.actualEndTime) : (() => {
        const defaultEnd = new Date(plannedDate);
        defaultEnd.setHours(defaultEnd.getHours() + 3);
        return defaultEnd;
      })();
      
      const isCancelled = surgery.status === "cancelled";
      const colorScheme = isCancelled ? cancelledColors : defaultColors;
      
      // Clean, simple display: Surgery name (bold) + Patient name & birthday
      const displayHtml = `
        <div style="padding: 8px 4px 30px 4px; font-size: 13px; line-height: 1.4; ${isCancelled ? 'opacity: 0.7;' : ''}">
          <div style="font-weight: 700; margin-bottom: 3px; ${isCancelled ? 'text-decoration: line-through;' : ''}">
            ${escapeHtml(surgery.plannedSurgery || 'No surgery specified')}
          </div>
          <div style="font-size: 12px; ${isCancelled ? 'text-decoration: line-through;' : ''}">
            ${escapeHtml(patientName)}${patientBirthday ? `, ${escapeHtml(patientBirthday)}` : ''}
          </div>
          ${isCancelled ? '<div style="font-size: 11px; font-weight: 600; margin-top: 4px;">CANCELLED</div>' : ''}
        </div>
      `;
      
      // Add clickable buttons using Active Areas - positioned at bottom
      const areas = [];
      
      // Pre-OP button (using Font Awesome clipboard-list icon, centered with horizontal alignment)
      areas.push({
        bottom: 4,
        right: 42, // Position from right edge for better centering
        width: 28,
        height: 22,
        html: '<i class="fas fa-clipboard-list" style="font-size: 16px;"></i>',
        cssClass: "event-button-icon",
        onClick: (areaArgs: any) => {
          areaArgs.preventDefault();
          // Navigate to patient detail page and auto-open Pre-OP dialog for this surgery
          setLocation(`/anesthesia/patients/${surgery.patientId}?openPreOp=${surgery.id}`);
        },
        visibility: "Visible" as const,
      });
      
      // OP button (using Font Awesome heartbeat icon, centered with horizontal alignment)
      areas.push({
        bottom: 4,
        right: 10, // Position from right edge
        width: 28,
        height: 22,
        html: '<i class="fas fa-heartbeat" style="font-size: 16px;"></i>',
        cssClass: "event-button-icon",
        onClick: (areaArgs: any) => {
          areaArgs.preventDefault();
          if (onEventClick) {
            onEventClick(surgery.id);
          }
        },
        visibility: "Visible" as const,
      });
      
      // Format dates for DayPilot (local timezone, not UTC)
      const formatForDayPilot = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      };
      
      return {
        id: surgery.id,
        text: displayHtml,
        html: displayHtml,
        start: formatForDayPilot(plannedDate),
        end: formatForDayPilot(endTime),
        resource: surgery.surgeryRoomId || (surgeryRooms[0]?.id || "unassigned"),
        areas: areas,
        barHidden: true, // Hide the left bar to make the entire event single-colored
        ...colorScheme,
      };
    });
  }, [surgeries, allPatients, surgeryRooms]);

  // Convert surgery rooms to resources format
  const resources = useMemo(() => {
    return surgeryRooms.map((room: any) => ({
      id: room.id,
      name: room.name,
    }));
  }, [surgeryRooms]);
  
  // Update refs when data changes
  useEffect(() => {
    latestEventsRef.current = calendarEvents;
    latestResourcesRef.current = resources;
  }, [calendarEvents, resources]);
  
  // Sync calendar data when events or resources change (uncontrolled component pattern)
  useEffect(() => {
    const eventsSnapshot = JSON.stringify(calendarEvents);
    const resourcesSnapshot = JSON.stringify(resources);
    
    // Only update if data actually changed
    const eventsChanged = eventsSnapshot !== previousEventsSnapshotRef.current;
    const resourcesChanged = resourcesSnapshot !== previousResourcesSnapshotRef.current;
    
    if (eventsChanged || resourcesChanged) {
      // Update all calendar instances via ref
      if (dayCalendarRef.current && eventsChanged) {
        dayCalendarRef.current.update({ events: calendarEvents });
      }
      if (dayCalendarRef.current && resourcesChanged) {
        dayCalendarRef.current.update({ columns: resources });
      }
      
      if (weekCalendarRef.current && eventsChanged) {
        weekCalendarRef.current.update({ events: calendarEvents });
      }
      if (weekCalendarRef.current && resourcesChanged) {
        weekCalendarRef.current.update({ columns: resources });
      }
      
      if (monthCalendarRef.current && eventsChanged) {
        monthCalendarRef.current.update({ events: calendarEvents });
      }
      
      // Save snapshots for next comparison
      previousEventsSnapshotRef.current = eventsSnapshot;
      previousResourcesSnapshotRef.current = resourcesSnapshot;
    }
  }, [calendarEvents, resources]);

  const handleEventClick = useCallback((args: any) => {
    // Open edit dialog when clicking on event
    setEditingSurgeryId(args.e.id());
  }, []);

  // Mutation for rescheduling surgery
  const rescheduleMutation = useMutation({
    mutationFn: async ({ id, plannedDate, surgeryRoomId }: { id: string; plannedDate: Date; surgeryRoomId: string }) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, {
        plannedDate: plannedDate.toISOString(),
        surgeryRoomId,
      });
      return response.json();
    },
    onSuccess: () => {
      // Delay invalidation to allow DayPilot to complete its internal cleanup
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      }, 500);
      toast({
        title: "Surgery Rescheduled",
        description: "Surgery has been successfully rescheduled.",
      });
    },
    onError: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      }, 500);
      toast({
        title: "Reschedule Failed",
        description: "Failed to reschedule surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation for cancelling surgery
  const cancelSurgeryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, {
        status: "cancelled",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Surgery Cancelled",
        description: "Surgery has been cancelled successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Cancellation Failed",
        description: "Failed to cancel surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Mutation for reactivating cancelled surgery
  const reactivateSurgeryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, {
        status: "planned",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Surgery Reactivated",
        description: "Surgery has been reactivated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Reactivation Failed",
        description: "Failed to reactivate surgery. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEventMove = useCallback((args: any) => {
    const surgeryId = args.e.id();
    const newStart = args.newStart.toDate ? args.newStart.toDate() : new Date(args.newStart);
    const newRoomId = args.newResource || args.e.resource();
    
    // Make the API call silently - DO NOT invalidate queries to prevent re-renders
    apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
      plannedDate: newStart.toISOString(),
      surgeryRoomId: newRoomId,
    }).then(() => {
      // Success - event is already visually moved by DayPilot
      // Data will refresh when user navigates away or on next data fetch
    }).catch(() => {
      // On error, force refresh to revert the visual change
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Reschedule Failed",
        description: "Failed to reschedule surgery. Please try again.",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleEventResize = useCallback((args: any) => {
    const surgeryId = args.e.id();
    const newStart = args.newStart.toDate ? args.newStart.toDate() : new Date(args.newStart);
    const newEnd = args.newEnd.toDate ? args.newEnd.toDate() : new Date(args.newEnd);
    
    // Make the API call silently - DO NOT invalidate queries to prevent re-renders
    apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
      plannedDate: newStart.toISOString(),
      actualEndTime: newEnd.toISOString(),
    }).then(() => {
      // Success - event is already visually resized by DayPilot
      // Data will refresh when user navigates away or on next data fetch
    }).catch(() => {
      // On error, force refresh to revert the visual change
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      toast({
        title: "Update Failed",
        description: "Failed to update surgery duration. Please try again.",
        variant: "destructive",
      });
    });
  }, [toast]);

  const handleDayClick = useCallback((args: any) => {
    // Zoom to day view when clicking a day in month or week view
    if (currentView === "month" || currentView === "week") {
      // DayPilot passes the date in args.start - need to convert DayPilot.Date to JS Date
      const selectedDay = args.start.toDate ? args.start.toDate() : new Date(args.start);
      setSelectedDate(selectedDay);
      setCurrentView("day");
    }
  }, [currentView]);

  const handleTimeRangeSelect = useCallback((args: any) => {
    if (currentView === "day") {
      // DayPilot passes dates in local timezone as "YYYY-MM-DDTHH:mm:ss"
      // We need to parse this as local time, not UTC
      const startDateStr = args.start.value || args.start.toString();
      const endDateStr = args.end.value || args.end.toString();
      
      // Parse as local time by replacing 'T' with space to avoid UTC interpretation
      // Then create Date object which will use local timezone
      const startDate = new Date(startDateStr.replace('T', ' '));
      const endDate = new Date(endDateStr.replace('T', ' '));
      
      const roomId = args.resource;
      setQuickCreateData({ date: startDate, endDate, roomId });
      setQuickCreateOpen(true);
    }
  }, [currentView]);


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
      return formatMonthYear(selectedDate);
    }
    return formatDateHeaderUtil(selectedDate);
  };

  // Format time labels using DOM manipulation
  useEffect(() => {
    const formatTimeLabels = () => {
      const rowHeaders = document.querySelectorAll('.calendar_white_rowheader_inner');
      let formatted = 0;
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
          formatted++;
        }
      });
      return formatted;
    };

    // Try multiple times with increasing delays to catch DayPilot rendering
    const timers: NodeJS.Timeout[] = [];
    
    // Immediate attempt
    formatTimeLabels();
    
    // Retry after short delays to catch async rendering
    timers.push(setTimeout(formatTimeLabels, 50));
    timers.push(setTimeout(formatTimeLabels, 150));
    timers.push(setTimeout(formatTimeLabels, 300));
    timers.push(setTimeout(formatTimeLabels, 500));
    
    return () => timers.forEach(t => clearTimeout(t));
  }, [currentView, selectedDate, resources, surgeryRooms]);

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
          <div style={{ touchAction: 'pan-y' }}>
            <DayPilotCalendar
              controlRef={(ref) => {
                dayCalendarRef.current = ref;
                // Hydrate calendar immediately on mount (uncontrolled component pattern)
                if (ref) {
                  ref.update({ 
                    events: latestEventsRef.current,
                    columns: latestResourcesRef.current
                  });
                }
              }}
              viewType="Resources"
              startDate={selectedDate.toISOString().split('T')[0]}
              days={1}
              businessBeginsHour={6}
              businessEndsHour={20}
              heightSpec="BusinessHoursNoScroll"
              headerHeight={30}
              hourWidth={60}
              cellHeight={40}
              onEventClick={handleEventClick}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onTimeRangeSelected={handleTimeRangeSelect}
              timeRangeSelectedHandling="Enabled"
              eventMoveHandling="Update"
              eventResizeHandling="Update"
              theme="calendar_white"
              timeFormat="Clock24Hours"
              locale="en-us"
            />
          </div>
        )}

        {currentView === "week" && (
          <DayPilotCalendar
            controlRef={(ref) => {
              weekCalendarRef.current = ref;
              // Hydrate calendar immediately on mount (uncontrolled component pattern)
              if (ref) {
                ref.update({ 
                  events: latestEventsRef.current,
                  columns: latestResourcesRef.current
                });
              }
            }}
            viewType="Week"
            startDate={selectedDate.toISOString().split('T')[0]}
            days={7}
            businessBeginsHour={6}
            businessEndsHour={20}
            heightSpec="BusinessHoursNoScroll"
            headerHeight={30}
            hourWidth={60}
            cellHeight={30}
            onEventClick={handleEventClick}
            onEventMove={handleEventMove}
            onEventResize={handleEventResize}
            onTimeRangeSelected={handleDayClick}
            eventMoveHandling="Update"
            eventResizeHandling="Update"
            theme="calendar_white"
            timeFormat="Clock24Hours"
            locale="en-us"
            headerDateFormat="d/M"
          />
        )}

        {currentView === "month" && (
          <DayPilotMonth
            controlRef={(ref) => {
              monthCalendarRef.current = ref;
              // Hydrate calendar immediately on mount (uncontrolled component pattern)
              if (ref) {
                ref.update({ events: latestEventsRef.current });
              }
            }}
            startDate={selectedDate.toISOString().split('T')[0]}
            onEventClick={handleEventClick}
            onTimeRangeSelected={handleDayClick}
            eventBarVisible={false}
            cellHeight={80}
            theme="month_white"
          />
        )}
        </div>
      )}

      {/* Quick Create Surgery Dialog */}
      {quickCreateOpen && quickCreateData && (
        <QuickCreateSurgeryDialog
          open={quickCreateOpen}
          onOpenChange={setQuickCreateOpen}
          hospitalId={activeHospital?.id || ""}
          initialDate={quickCreateData.date}
          initialEndDate={quickCreateData.endDate}
          initialRoomId={quickCreateData.roomId}
          surgeryRooms={surgeryRooms}
        />
      )}

      {/* Edit Surgery Dialog */}
      <EditSurgeryDialog
        surgeryId={editingSurgeryId}
        onClose={() => setEditingSurgeryId(null)}
      />

      {/* Floating Action Button for mobile quick create */}
      {currentView === "day" && surgeryRooms.length > 0 && (
        <Button
          onClick={() => {
            const now = new Date();
            // Round to nearest 30 minutes
            const minutes = Math.round(now.getMinutes() / 30) * 30;
            now.setMinutes(minutes);
            now.setSeconds(0);
            now.setMilliseconds(0);
            setQuickCreateData({ date: now });
            setQuickCreateOpen(true);
          }}
          className="fixed bottom-20 right-4 rounded-full h-14 w-14 shadow-lg z-10"
          size="icon"
          data-testid="button-quick-create-surgery-fab"
        >
          <i className="fas fa-plus text-xl"></i>
        </Button>
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

        /* Fix time format - ensure hours display with colon */
        .calendar_white_rowheader_inner {
          font-variant-numeric: normal !important;
        }
        
        /* Format time labels to show colon separator */
        .calendar_white_rowheader {
          font-feature-settings: normal !important;
        }
      `}</style>
    </div>
  );
}
