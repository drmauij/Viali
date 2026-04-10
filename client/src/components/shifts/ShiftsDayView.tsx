import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import StaffShiftPopover from "./StaffShiftPopover";
import type { AbsenceDetail } from "./AbsenceInfoBlock";
import { ABSENCE_COLORS } from "@/lib/absenceConstants";
import type { ShiftType, StaffShift } from "@shared/schema";

interface ProviderAbsence {
  id: string;
  providerId: string;
  absenceType: string;
  startDate: string;
  endDate: string;
  notes: string | null;
}

interface ProviderTimeOff {
  id: string;
  providerId: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  notes: string | null;
  approvalStatus?: string;
}

interface ShiftsDayViewProps {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  providers: Array<{ id: string; firstName: string; lastName: string }>;
  absences: ProviderAbsence[];
  timeOffs: ProviderTimeOff[];
  hospitalId: string;
  unitId: string;
  anchor: Date;
  onSaved?: () => void;
}

interface PopoverState {
  userId: string;
  userName: string;
  date: string;
}

const MIN_HOUR = 6;
const MAX_HOUR = 22;
const TOTAL_MIN = (MAX_HOUR - MIN_HOUR) * 60;
const LANE_HEIGHT = 56; // h-14

function timeToPct(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const minutes = h * 60 + m - MIN_HOUR * 60;
  return Math.max(0, Math.min(100, (minutes / TOTAL_MIN) * 100));
}

const HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR + 1 }, (_, i) => MIN_HOUR + i);

export default function ShiftsDayView({
  shiftTypes,
  staffShifts,
  providers,
  absences,
  timeOffs,
  hospitalId,
  anchor,
  onSaved,
}: ShiftsDayViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const dateStr = format(anchor, "yyyy-MM-dd");
  const isToday = isSameDay(anchor, new Date());

  const shiftByUser = useMemo(() => {
    const map = new Map<string, StaffShift>();
    for (const s of staffShifts) {
      if (s.date === dateStr) map.set(s.userId, s);
    }
    return map;
  }, [staffShifts, dateStr]);

  const typeById = useMemo(() => {
    const map = new Map<string, ShiftType>();
    for (const t of shiftTypes) map.set(t.id, t);
    return map;
  }, [shiftTypes]);

  function absenceFor(userId: string): AbsenceDetail | null {
    const absence = absences.find(
      (a) => a.providerId === userId && dateStr >= a.startDate && dateStr <= a.endDate
    );
    if (absence) {
      return {
        type: absence.absenceType,
        isPartial: false,
        startDate: absence.startDate,
        endDate: absence.endDate,
        notes: absence.notes,
      };
    }

    const timeOff = timeOffs.find((t) => {
      if (t.providerId !== userId) return false;
      if (t.approvalStatus === "declined") return false;
      return dateStr >= t.startDate && dateStr <= t.endDate;
    });
    if (timeOff) {
      const isPartial = !!(timeOff.startTime && timeOff.endTime);
      return {
        type: timeOff.reason || "default",
        isPartial,
        approvalStatus: timeOff.approvalStatus,
        startDate: timeOff.startDate,
        endDate: timeOff.endDate,
        startTime: timeOff.startTime,
        endTime: timeOff.endTime,
        notes: timeOff.notes,
      };
    }

    return null;
  }

  return (
    <div className="overflow-x-auto h-full flex flex-col">
      {/* Day header */}
      <div
        className={cn(
          "flex-shrink-0 px-4 py-2 border-b text-sm font-medium",
          isToday && "text-primary bg-primary/5"
        )}
      >
        {format(anchor, "EEEE, d MMMM yyyy")}
        {isToday && <span className="ml-2 text-xs text-primary font-normal">Today</span>}
      </div>

      <div className="flex flex-1 overflow-auto">
        {/* Provider name column */}
        <div className="flex-shrink-0 w-40 border-r">
          {/* Empty cell aligning with hour ticks header */}
          <div style={{ height: 28 }} className="border-b bg-muted/30" />
          {providers.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-muted-foreground text-sm">
              No providers.
            </div>
          ) : (
            providers.map((p) => {
              const name =
                `${p.lastName}, ${p.firstName}`
                  .replace(/^,\s*/, "")
                  .replace(/,\s*$/, "") ||
                p.firstName ||
                p.lastName ||
                "Unknown";

              return (
                <div
                  key={p.id}
                  className="border-b bg-muted/20 font-medium text-xs p-2 flex items-center"
                  style={{ height: LANE_HEIGHT }}
                >
                  {name}
                </div>
              );
            })
          )}
        </div>

        {/* Time grid */}
        <div className="flex-1 relative overflow-auto">
          {/* Hour ticks header */}
          <div className="relative border-b bg-muted/30" style={{ height: 28 }}>
            {HOURS.map((h) => {
              const pct = ((h - MIN_HOUR) / (MAX_HOUR - MIN_HOUR)) * 100;
              return (
                <div
                  key={h}
                  className="absolute top-0 text-[10px] text-muted-foreground leading-none pt-1"
                  style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                >
                  {String(h).padStart(2, "0")}
                </div>
              );
            })}
          </div>

          {/* Provider lanes */}
          {providers.map((p) => {
            const shift = shiftByUser.get(p.id) ?? null;
            const shiftType = shift?.shiftTypeId ? (typeById.get(shift.shiftTypeId) ?? null) : null;
            const absence = absenceFor(p.id);
            const isOpen = popover?.userId === p.id && popover?.date === dateStr;

            const name =
              `${p.lastName}, ${p.firstName}`
                .replace(/^,\s*/, "")
                .replace(/,\s*$/, "") ||
              p.firstName ||
              p.lastName ||
              "Unknown";

            // Determine absence block span
            let absenceLeft: number | null = null;
            let absenceWidth: number | null = null;
            if (absence) {
              if (absence.isPartial && absence.startTime && absence.endTime) {
                absenceLeft = timeToPct(absence.startTime);
                absenceWidth = timeToPct(absence.endTime) - absenceLeft;
              } else {
                absenceLeft = 0;
                absenceWidth = 100;
              }
            }

            // Shift block
            let shiftLeft: number | null = null;
            let shiftWidth: number | null = null;
            if (shiftType && shiftType.startTime && shiftType.endTime) {
              shiftLeft = timeToPct(shiftType.startTime);
              shiftWidth = timeToPct(shiftType.endTime) - shiftLeft;
            }

            return (
              <StaffShiftPopover
                key={p.id}
                hospitalId={hospitalId}
                userId={p.id}
                userName={name}
                date={dateStr}
                currentShiftTypeId={shift?.shiftTypeId ?? null}
                absence={absence}
                open={isOpen}
                onOpenChange={(v) =>
                  setPopover(v ? { userId: p.id, userName: name, date: dateStr } : null)
                }
                onSaved={() => {
                  setPopover(null);
                  onSaved?.();
                }}
              >
                <div
                  className={cn(
                    "relative border-b cursor-pointer hover:bg-muted/20 transition-colors",
                    // Hour grid lines
                    "bg-background"
                  )}
                  style={{ height: LANE_HEIGHT }}
                  onClick={() => setPopover({ userId: p.id, userName: name, date: dateStr })}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((h) => {
                    const pct = ((h - MIN_HOUR) / (MAX_HOUR - MIN_HOUR)) * 100;
                    return (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 border-l border-muted/40"
                        style={{ left: `${pct}%` }}
                      />
                    );
                  })}

                  {/* Absence block */}
                  {absence && absenceLeft !== null && absenceWidth !== null && absenceWidth > 0 && (
                    <div
                      className={cn(
                        "absolute top-1 bottom-1 rounded opacity-60",
                        ABSENCE_COLORS[absence.type] ?? ABSENCE_COLORS.default
                      )}
                      style={{ left: `${absenceLeft}%`, width: `${absenceWidth}%` }}
                      title={`${absence.type}${absence.isPartial ? ` ${absence.startTime}–${absence.endTime}` : ""}`}
                    />
                  )}

                  {/* Shift block */}
                  {shiftType && shiftLeft !== null && shiftWidth !== null && shiftWidth > 0 && (
                    <div
                      className="absolute top-2 bottom-2 rounded text-white text-[10px] font-semibold flex items-center px-1.5 overflow-hidden"
                      style={{
                        left: `${shiftLeft}%`,
                        width: `${shiftWidth}%`,
                        backgroundColor: shiftType.color,
                      }}
                      title={`${shiftType.name} ${shiftType.startTime}–${shiftType.endTime}`}
                    >
                      <span className="truncate">{shiftType.code}</span>
                      <span className="ml-auto text-[9px] opacity-80 whitespace-nowrap pl-1">
                        {shiftType.startTime}–{shiftType.endTime}
                      </span>
                    </div>
                  )}

                  {/* No shift placeholder */}
                  {!shiftType && !absence && (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground/40 select-none pointer-events-none">
                      click to assign
                    </div>
                  )}
                </div>
              </StaffShiftPopover>
            );
          })}
        </div>
      </div>
    </div>
  );
}
