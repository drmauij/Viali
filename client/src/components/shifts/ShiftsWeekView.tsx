import { useMemo, useState } from "react";
import { addDays, startOfISOWeek, format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import ShiftCell from "./ShiftCell";
import StaffShiftPopover from "./StaffShiftPopover";
import type { AbsenceDetail } from "./AbsenceInfoBlock";
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

interface ShiftsWeekViewProps {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  providers: Array<{ id: string; firstName: string; lastName: string }>;
  absences: ProviderAbsence[];
  timeOffs: ProviderTimeOff[];
  hospitalId: string;
  anchor: Date;
  onSaved?: () => void;
}

interface PopoverState {
  userId: string;
  userName: string;
  date: string;
}

const MIN_COL_WIDTH = 120;
const MIN_ROW_HEIGHT = 72;

export default function ShiftsWeekView({
  shiftTypes,
  staffShifts,
  providers,
  absences,
  timeOffs,
  hospitalId,
  anchor,
  onSaved,
}: ShiftsWeekViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const weekDays = useMemo(() => {
    const weekStart = startOfISOWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [anchor]);

  const shiftByKey = useMemo(() => {
    const map = new Map<string, StaffShift>();
    for (const s of staffShifts) {
      map.set(`${s.userId}|${s.date}`, s);
    }
    return map;
  }, [staffShifts]);

  const typeById = useMemo(() => {
    const map = new Map<string, ShiftType>();
    for (const t of shiftTypes) {
      map.set(t.id, t);
    }
    return map;
  }, [shiftTypes]);

  function absenceFor(userId: string, day: Date): AbsenceDetail | null {
    const dateStr = format(day, "yyyy-MM-dd");

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

  const isToday = (day: Date) => isSameDay(day, new Date());

  const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div className="overflow-x-auto">
      {/* Header row */}
      <div
        className="flex border-b bg-muted/30"
        style={{ minWidth: `calc(10rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}
      >
        <div className="w-40 flex-shrink-0 p-2 border-r text-xs text-muted-foreground font-medium">
          Staff
        </div>
        {weekDays.map((day, idx) => (
          <div
            key={idx}
            className={cn(
              "flex-1 p-2 text-center border-r text-sm font-medium",
              isToday(day) && "bg-primary/10 text-primary"
            )}
            style={{ minWidth: MIN_COL_WIDTH }}
          >
            <div>{DAY_HEADERS[idx]}</div>
            <div className="text-xs text-muted-foreground font-normal">
              {format(day, "d MMM")}
            </div>
          </div>
        ))}
      </div>

      {/* Provider rows */}
      <div style={{ minWidth: `calc(10rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}>
        {providers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No providers found.
          </div>
        ) : (
          providers.map((p) => {
            const name = `${p.lastName}, ${p.firstName}`.replace(/^,\s*/, "").replace(/,\s*$/, "") || p.firstName || p.lastName || "Unknown";
            return (
              <div key={p.id} className="flex border-b">
                <div
                  className="w-40 flex-shrink-0 p-2 border-r bg-muted/20 font-medium text-sm"
                  style={{ minHeight: MIN_ROW_HEIGHT }}
                >
                  {name}
                </div>

                {weekDays.map((day, dayIdx) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const shift = shiftByKey.get(`${p.id}|${dateStr}`) ?? null;
                  const shiftType = shift?.shiftTypeId ? (typeById.get(shift.shiftTypeId) ?? null) : null;
                  const absence = absenceFor(p.id, day);
                  const isOpen =
                    popover?.userId === p.id && popover?.date === dateStr;

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "flex-1 border-r",
                        isToday(day) && "bg-primary/5"
                      )}
                      style={{ minHeight: MIN_ROW_HEIGHT, minWidth: MIN_COL_WIDTH }}
                    >
                      <StaffShiftPopover
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
                        <div className="h-full w-full" style={{ minHeight: MIN_ROW_HEIGHT }}>
                          <ShiftCell
                            shift={shiftType}
                            absence={absence}
                            variant="week"
                            onClick={() => setPopover({ userId: p.id, userName: name, date: dateStr })}
                          />
                        </div>
                      </StaffShiftPopover>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
