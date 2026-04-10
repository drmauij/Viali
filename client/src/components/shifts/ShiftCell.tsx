import { cn } from "@/lib/utils";
import { absenceBgClass, type AbsenceInput } from "@/lib/absenceConstants";
import type { ShiftType } from "@shared/schema";

interface Props {
  shift?: ShiftType | null;
  absence?: AbsenceInput | null;
  variant: "week" | "month";
  onClick?: () => void;
  disabled?: boolean;
}

export default function ShiftCell({ shift, absence, variant, onClick, disabled }: Props) {
  return (
    <div
      className={cn(
        "h-full w-full p-1",
        absenceBgClass(absence ?? null),
        !disabled && !shift && "cursor-pointer hover:bg-muted/30 transition-colors",
        !disabled && shift && "cursor-pointer",
      )}
      onClick={disabled ? undefined : onClick}
    >
      {shift && (
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
      )}
    </div>
  );
}
