import {
  User,
  Clock,
  Video,
  CheckCircle2,
  Circle,
  MapPin,
  Activity,
  CircleCheck,
  X,
  UserX,
  Scissors,
  Lock,
  NotebookPen,
  Hourglass,
  Tag,
  Ban,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const STATUS_ICONS: Record<string, IconType> = {
  scheduled: Circle,
  confirmed: CheckCircle2,
  arrived: MapPin,
  in_progress: Activity,
  completed: CircleCheck,
  cancelled: X,
  no_show: UserX,
};

function Row({ Icon, children }: { Icon: IconType; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs leading-snug">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
      <span className="text-slate-100 break-words">{children}</span>
    </div>
  );
}

export interface AppointmentInfoCardProps {
  variant: "appointment" | "timeOff" | "absence" | "surgeryBlock" | "availability";
  // appointment
  patientName?: string | null;
  serviceName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  statusLabel?: string | null;
  status?: string | null;
  notes?: string | null;
  isVideoAppointment?: boolean;
  isCancelled?: boolean;
  // timeOff
  ReasonIcon?: IconType;
  isPending?: boolean;
  // absence / surgeryBlock
  title?: string | null;
  surgeryName?: string | null;
}

export function AppointmentInfoCard(props: AppointmentInfoCardProps) {
  if (props.variant === "surgeryBlock") {
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <Row Icon={Scissors}>{props.surgeryName || props.title || "Surgery"}</Row>
        {props.startTime && props.endTime && (
          <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
        )}
        <Row Icon={Lock}>{"Blocked"}</Row>
      </div>
    );
  }

  if (props.variant === "absence") {
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <Row Icon={Ban}>{props.title || "Absent"}</Row>
        {props.startTime && props.endTime && (
          <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
        )}
      </div>
    );
  }

  if (props.variant === "timeOff") {
    const ReasonIcon = props.ReasonIcon ?? Ban;
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <Row Icon={ReasonIcon}>{props.serviceName || "Time Off"}</Row>
        {props.startTime && props.endTime && (
          <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
        )}
        {props.isPending && <Row Icon={Hourglass}>{"Pending approval"}</Row>}
        {props.notes && <Row Icon={NotebookPen}>{props.notes}</Row>}
      </div>
    );
  }

  if (props.variant === "availability") {
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <Row Icon={Tag}>{props.title || "Available"}</Row>
        {props.startTime && props.endTime && (
          <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
        )}
      </div>
    );
  }

  // variant === "appointment"
  const StatusIcon = STATUS_ICONS[props.status ?? ""] ?? Circle;
  return (
    <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
      {props.isVideoAppointment && <Row Icon={Video}>{"Video Appointment"}</Row>}
      {props.serviceName && <Row Icon={Tag}>{props.serviceName}</Row>}
      {props.patientName && <Row Icon={User}>{props.patientName}</Row>}
      {props.startTime && props.endTime && (
        <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
      )}
      {props.statusLabel && <Row Icon={StatusIcon}>{props.statusLabel}</Row>}
      {props.notes && <Row Icon={NotebookPen}>{props.notes}</Row>}
    </div>
  );
}
