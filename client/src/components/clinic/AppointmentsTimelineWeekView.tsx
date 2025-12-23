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
import "moment/locale/de";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";

interface TimelineGroup extends TimelineGroupBase {
  title: string;
}

interface TimelineItem extends TimelineItemBase<number> {
  title: string;
}

type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
};

interface ProviderSurgery {
  id: string;
  patientId: string;
  surgeonId: string | null;
  surgeon: string | null;
  plannedDate: string;
  plannedSurgery: string;
  actualEndTime: string | null;
  status: string | null;
  surgeryRoomId: string | null;
  patientFirstName: string | null;
  patientSurname: string | null;
}

interface ProviderAbsence {
  id: string;
  providerId: string;
  hospitalId: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  externalId: string | null;
}

const ABSENCE_TYPE_ICONS: Record<string, string> = {
  vacation: '🏖️',
  sick: '🤒',
  training: '📚',
  parental: '👶',
  homeoffice: '🏠',
  sabbatical: '✈️',
  default: '🚫',
};

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  vacation: 'Vacation',
  sick: 'Sick Leave',
  training: 'Training',
  parental: 'Parental Leave',
  homeoffice: 'Home Office',
  sabbatical: 'Sabbatical',
  default: 'Absent',
};

interface AppointmentsTimelineWeekViewProps {
  providers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  appointments: AppointmentWithDetails[];
  providerSurgeries?: ProviderSurgery[];
  providerAbsences?: ProviderAbsence[];
  selectedDate: Date;
  onEventClick?: (appointment: AppointmentWithDetails) => void;
  onEventDrop?: (appointmentId: string, newStart: Date, newEnd: Date, newProviderId: string) => void;
  onCanvasClick?: (providerId: string, time: Date) => void;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'timeline-item-scheduled',
  confirmed: 'timeline-item-confirmed',
  in_progress: 'timeline-item-in-progress',
  completed: 'timeline-item-completed',
  cancelled: 'timeline-item-cancelled',
  no_show: 'timeline-item-no-show',
  surgery_block: 'timeline-item-surgery',
  absence_vacation: 'timeline-item-absence-vacation',
  absence_sick: 'timeline-item-absence-sick',
  absence_training: 'timeline-item-absence-training',
  absence_parental: 'timeline-item-absence-parental',
  absence_other: 'timeline-item-absence-other',
};

export default function AppointmentsTimelineWeekView({
  providers,
  appointments,
  providerSurgeries = [],
  providerAbsences = [],
  selectedDate,
  onEventClick,
  onEventDrop,
  onCanvasClick,
}: AppointmentsTimelineWeekViewProps) {
  const { i18n } = useTranslation();
  const currentStateRef = useRef<Map<string, { providerId: string; start: Date; end: Date }>>(new Map());

  const [visibleTimeStart, setVisibleTimeStart] = useState<number>(0);
  const [visibleTimeEnd, setVisibleTimeEnd] = useState<number>(0);

  useEffect(() => {
    moment.locale(i18n.language.startsWith('de') ? 'de' : 'en-gb');
  }, [i18n.language]);

  const weekRange = useMemo(() => {
    const start = moment(selectedDate).startOf('isoWeek');
    const end = moment(selectedDate).endOf('isoWeek');
    return { start, end };
  }, [selectedDate]);

  useEffect(() => {
    const start = weekRange.start.clone();
    const end = start.clone().add(2, 'days');
    setVisibleTimeStart(start.valueOf());
    setVisibleTimeEnd(end.valueOf());
  }, [weekRange]);

  const handleZoomIn = () => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const currentRange = visibleTimeEnd - visibleTimeStart;
    const newRange = currentRange * 0.7;
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

  useEffect(() => {
    appointments.forEach((appt) => {
      const providerId = appt.providerId;
      const appointmentDate = new Date(appt.appointmentDate);
      const [startHour, startMin] = (appt.startTime || "09:00").split(':').map(Number);
      const [endHour, endMin] = (appt.endTime || "09:30").split(':').map(Number);
      
      const start = new Date(appointmentDate);
      start.setHours(startHour, startMin, 0, 0);
      
      const end = new Date(appointmentDate);
      end.setHours(endHour, endMin, 0, 0);
      
      currentStateRef.current.set(appt.id, {
        providerId,
        start,
        end,
      });
    });
  }, [appointments]);

  const groups: TimelineGroup[] = useMemo(() => {
    return providers.map((provider) => ({
      id: provider.id,
      title: `${provider.firstName || ''} ${provider.lastName || ''}`.trim() || 'Provider',
    }));
  }, [providers]);

  const items: TimelineItem[] = useMemo(() => {
    // Appointment items
    const appointmentItems = appointments.map((appt) => {
      const appointmentDate = new Date(appt.appointmentDate);
      const [startHour, startMin] = (appt.startTime || "09:00").split(':').map(Number);
      const [endHour, endMin] = (appt.endTime || "09:30").split(':').map(Number);
      
      const start = new Date(appointmentDate);
      start.setHours(startHour, startMin, 0, 0);
      
      const end = new Date(appointmentDate);
      end.setHours(endHour, endMin, 0, 0);
      
      const patientName = appt.patient 
        ? `${appt.patient.surname}, ${appt.patient.firstName}` 
        : "Unknown Patient";
      const serviceName = appt.service?.name || "";
      
      const statusClass = STATUS_COLORS[appt.status] || 'timeline-item-scheduled';
      
      return {
        id: appt.id,
        group: appt.providerId,
        title: serviceName ? `${serviceName}\n${patientName}` : patientName,
        start_time: moment(start).valueOf(),
        end_time: moment(end).valueOf(),
        itemProps: {
          className: statusClass,
          onDoubleClick: () => onEventClick?.(appt),
          'data-testid': `timeline-event-${appt.id}`,
        },
      };
    });

    // Surgery block items (gray, non-draggable)
    // Only include surgeries where surgeonId is in the providers list
    const providerIdSet = new Set(providers.map(p => p.id));
    const surgeryItems = providerSurgeries
      .filter((surgery) => surgery.surgeonId && providerIdSet.has(surgery.surgeonId))
      .map((surgery) => {
        const start = new Date(surgery.plannedDate);
        
        // Calculate end time: use actualEndTime if available, otherwise default to 2 hours
        let end: Date;
        if (surgery.actualEndTime) {
          end = new Date(surgery.actualEndTime);
        } else {
          end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // Default 2 hours
        }
        
        return {
          id: `surgery-${surgery.id}`,
          group: surgery.surgeonId!,
          title: `🔒 ${surgery.plannedSurgery || 'Surgery'}`,
          start_time: moment(start).valueOf(),
          end_time: moment(end).valueOf(),
          canMove: false,
          canResize: false,
          itemProps: {
            className: 'timeline-item-surgery',
            style: { cursor: 'not-allowed' },
            'data-testid': `timeline-surgery-${surgery.id}`,
          },
        };
      });

    // Absence block items (colored by type, non-draggable)
    // Only include absences where providerId is in the providers list
    const absenceItems: TimelineItem[] = [];
    providerAbsences
      .filter((absence) => providerIdSet.has(absence.providerId))
      .forEach((absence) => {
        const absenceStart = new Date(absence.startDate);
        const absenceEnd = new Date(absence.endDate);
        
        // Create all-day items for each day in the absence range that falls within the week
        const currentDate = new Date(Math.max(absenceStart.getTime(), weekRange.start.valueOf()));
        currentDate.setHours(0, 0, 0, 0);
        
        const rangeEnd = new Date(Math.min(absenceEnd.getTime(), weekRange.end.valueOf()));
        rangeEnd.setHours(23, 59, 59, 999);
        
        while (currentDate <= rangeEnd) {
          const dayStart = new Date(currentDate);
          dayStart.setHours(8, 0, 0, 0);
          
          const dayEnd = new Date(currentDate);
          dayEnd.setHours(18, 0, 0, 0);
          
          const icon = ABSENCE_TYPE_ICONS[absence.absenceType] || ABSENCE_TYPE_ICONS.default;
          const label = ABSENCE_TYPE_LABELS[absence.absenceType] || ABSENCE_TYPE_LABELS.default;
          const absenceStatus = `absence_${absence.absenceType}`;
          const statusClass = STATUS_COLORS[absenceStatus] || 'timeline-item-absence-other';
          
          absenceItems.push({
            id: `absence-${absence.id}-${moment(currentDate).format('YYYY-MM-DD')}`,
            group: absence.providerId,
            title: `${icon} ${label}`,
            start_time: moment(dayStart).valueOf(),
            end_time: moment(dayEnd).valueOf(),
            canMove: false,
            canResize: false,
            itemProps: {
              className: statusClass,
              style: { cursor: 'not-allowed' },
            },
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

    return [...appointmentItems, ...surgeryItems, ...absenceItems];
  }, [appointments, providerSurgeries, providerAbsences, providers, weekRange, onEventClick]);

  const handleItemMove = (itemId: string | number, dragTime: number, newGroupOrder: number) => {
    if (!onEventDrop) return;
    
    const id = String(itemId);
    // Don't allow moving surgery or absence blocks
    if (id.startsWith('surgery-') || id.startsWith('absence-')) return;
    
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;

    const currentState = currentStateRef.current.get(id);
    const currentStart = currentState?.start || new Date();
    const currentEnd = currentState?.end || new Date();
    
    const duration = moment(currentEnd).diff(moment(currentStart));
    const newStart = moment(dragTime).toDate();
    const newEnd = moment(dragTime).add(duration).toDate();
    const newProviderId = String(groups[newGroupOrder]?.id);

    if (newProviderId) {
      currentStateRef.current.set(id, {
        providerId: newProviderId,
        start: newStart,
        end: newEnd,
      });
      onEventDrop(id, newStart, newEnd, newProviderId);
    }
  };

  const handleItemResize = (itemId: string | number, time: number, edge: 'left' | 'right') => {
    if (!onEventDrop) return;
    
    const id = String(itemId);
    // Don't allow resizing surgery or absence blocks
    if (id.startsWith('surgery-') || id.startsWith('absence-')) return;
    
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;

    const currentState = currentStateRef.current.get(id);
    const providerId = currentState?.providerId || appt.providerId;
    const currentStart = currentState?.start || new Date();
    const currentEnd = currentState?.end || new Date();

    let newStart = moment(currentStart);
    let newEnd = moment(currentEnd);

    if (edge === 'left') {
      newStart = moment(time);
    } else {
      newEnd = moment(time);
    }

    const finalStart = newStart.toDate();
    const finalEnd = newEnd.toDate();

    currentStateRef.current.set(id, {
      providerId,
      start: finalStart,
      end: finalEnd,
    });

    onEventDrop(id, finalStart, finalEnd, providerId);
  };

  const handleCanvasClick = (groupId: number | string, time: number) => {
    if (!onCanvasClick) return;
    
    const providerId = String(groupId);
    const clickedTime = new Date(time);
    
    onCanvasClick(providerId, clickedTime);
  };

  if (!visibleTimeStart || !visibleTimeEnd) {
    return <div className="timeline-week-view">Loading...</div>;
  }

  return (
    <div className="timeline-week-view-container">
      <div className="timeline-week-view appointments-timeline" data-testid="appointments-timeline-week-view">
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
          sidebarWidth={120}
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
