import { cn } from "@/lib/utils";
import { absenceBgClass, type AbsenceInput } from "@/lib/absenceConstants";
import type { ShiftType } from "@shared/schema";

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

export default function ShiftCell({ shift, role, absence, variant, onClick, disabled }: Props) {
  return (
    <div
      className={cn(
        "h-full w-full p-1",
        absenceBgClass(absence ?? null),
        !disabled && "cursor-pointer hover:bg-muted/30 transition-colors",
      )}
      onClick={disabled ? undefined : onClick}
    >
      {shift ? (
        <div
          className="rounded-sm text-white font-semibold px-2 py-1 flex items-center gap-1 text-[11px]"
          style={{ backgroundColor: shift.color }}
        >
          <span>{shift.code}</span>
          {variant === "week" && (
            <span className="text-[10px] opacity-90 ml-auto">
              {shift.startTime}–{shift.endTime}
            </span>
          )}
        </div>
      ) : role ? (
        <div className="rounded-sm bg-muted/60 border border-muted-foreground/20 px-2 py-1 flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
          <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
          {variant === "week" ? (ROLE_LABELS[role] ?? role) : "Saal"}
        </div>
      ) : null}
    </div>
  );
}
