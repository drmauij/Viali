import {
  Scissors,
  User as UserIcon,
  Stethoscope,
  Clock,
  ClipboardList,
  Syringe,
  BedDouble,
  DoorOpen,
  Ban,
  X,
  NotebookPen,
  Lock as LockIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface SurgeryInfoCardProps {
  variant: "surgery" | "slotReservation" | "roomBlock";
  plannedSurgery?: string | null;
  patientName?: string | null;
  patientBirthday?: string | null;
  surgeonName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  preOpLabel?: string | null;
  noPreOpRequired?: boolean;
  pacuBedName?: string | null;
  clinicRoomName?: string | null;
  isSuspended?: boolean;
  suspendedReason?: string | null;
  isCancelled?: boolean;
  notes?: string | null;
  labels: {
    blocked: string;
    slotReserved: string;
    localAnesthesia: string;
    pacuBed: string;
    waiting: string;
    suspended: string;
    cancelled: string;
  };
}

function Row({ Icon, children }: { Icon: IconType; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs leading-snug">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
      <span className="text-slate-100 break-words">{children}</span>
    </div>
  );
}

export function SurgeryInfoCard(props: SurgeryInfoCardProps) {
  if (props.variant === "roomBlock") {
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <Row Icon={LockIcon}>{props.labels.blocked}</Row>
        {props.notes && <Row Icon={NotebookPen}>{props.notes}</Row>}
      </div>
    );
  }

  if (props.variant === "slotReservation") {
    return (
      <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
        <div className="text-xs font-semibold text-slate-400">{props.labels.slotReserved}</div>
        {props.surgeonName && <Row Icon={Stethoscope}>{props.surgeonName}</Row>}
        {props.plannedSurgery && props.plannedSurgery !== props.labels.slotReserved && (
          <Row Icon={Scissors}>{props.plannedSurgery}</Row>
        )}
        {props.notes && <Row Icon={NotebookPen}>{props.notes}</Row>}
      </div>
    );
  }

  const patientLine = [props.patientName, props.patientBirthday].filter(Boolean).join(" · ");
  return (
    <div className="w-72 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 p-3 shadow-xl space-y-1.5">
      {props.plannedSurgery && <Row Icon={Scissors}>{props.plannedSurgery}</Row>}
      {patientLine && <Row Icon={UserIcon}>{patientLine}</Row>}
      {props.surgeonName && <Row Icon={Stethoscope}>{props.surgeonName}</Row>}
      {props.startTime && props.endTime && (
        <Row Icon={Clock}>{`${props.startTime} – ${props.endTime}`}</Row>
      )}
      {props.noPreOpRequired ? (
        <Row Icon={Syringe}>{props.labels.localAnesthesia}</Row>
      ) : props.preOpLabel ? (
        <Row Icon={ClipboardList}>{props.preOpLabel}</Row>
      ) : null}
      {props.pacuBedName ? (
        <Row Icon={BedDouble}>{`${props.labels.pacuBed}: ${props.pacuBedName}`}</Row>
      ) : props.clinicRoomName ? (
        <Row Icon={DoorOpen}>{`${props.labels.waiting}: ${props.clinicRoomName}`}</Row>
      ) : null}
      {props.isSuspended && (
        <Row Icon={Ban}>
          {props.labels.suspended}
          {props.suspendedReason ? ` – ${props.suspendedReason}` : ""}
        </Row>
      )}
      {props.isCancelled && !props.isSuspended && <Row Icon={X}>{props.labels.cancelled}</Row>}
      {props.notes && <Row Icon={NotebookPen}>{props.notes}</Row>}
    </div>
  );
}
