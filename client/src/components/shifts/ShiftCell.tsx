import { cn } from "@/lib/utils";
import { absenceBgClass, type AbsenceInput } from "@/lib/absenceConstants";
import type { ShiftType } from "@shared/schema";
import {
  Sun, Moon, SunMoon, Phone, BedDouble, Stethoscope,
  Clock, AlarmClock, Calendar, Zap,
  type LucideIcon,
} from "lucide-react";

interface Props {
  shift?: ShiftType | null;
  role?: string | null;
  absence?: AbsenceInput | null;
  variant: "week" | "month";
  onClick?: () => void;
  disabled?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  surgeon: "Surgeon",
  surgicalAssistant: "Surg. Asst.",
  instrumentNurse: "Instr. Nurse",
  circulatingNurse: "Circ. Nurse",
  anesthesiologist: "Anesthesiol.",
  anesthesiaNurse: "Anesth. Nurse",
  pacuNurse: "PACU Nurse",
};

const ICON_MAP: Record<string, LucideIcon> = {
  "sun": Sun,
  "moon": Moon,
  "sun-moon": SunMoon,
  "phone": Phone,
  "bed-double": BedDouble,
  "stethoscope": Stethoscope,
  "clock": Clock,
  "alarm-clock": AlarmClock,
  "calendar": Calendar,
  "zap": Zap,
};

export default function ShiftCell({ shift, role, absence, variant, onClick, disabled }: Props) {
  const ShiftIcon = shift?.icon ? ICON_MAP[shift.icon] : null;
  const shiftTooltip = shift ? `${shift.name} (${shift.code}) ${shift.startTime}–${shift.endTime}` : undefined;
  const roleTooltip = role ? (ROLE_LABELS[role] ?? role) : undefined;
  const tooltip = [roleTooltip, shiftTooltip].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "h-full w-full p-1 space-y-0.5",
        absenceBgClass(absence ?? null),
        !disabled && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={disabled ? undefined : onClick}
      title={tooltip || undefined}
    >
      {role && (
        <div className="rounded-sm bg-muted/60 border border-muted-foreground/20 px-1.5 py-0.5 flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
          {variant === "week" && (ROLE_LABELS[role] ?? role)}
        </div>
      )}
      {shift && (
        <div
          className="rounded-sm text-white font-semibold px-2 py-0.5 flex items-center gap-1 text-[11px]"
          style={{ backgroundColor: shift.color }}
        >
          {variant === "month" ? (
            ShiftIcon ? <ShiftIcon className="h-3 w-3" /> : <span>{shift.code}</span>
          ) : (
            <>
              <span>{shift.code}</span>
              <span className="text-[10px] opacity-90 ml-auto">
                {shift.startTime}–{shift.endTime}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
