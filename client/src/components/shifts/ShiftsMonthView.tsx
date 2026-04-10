import React, { useMemo, useState } from "react";
import { addDays, startOfMonth, endOfMonth, format, isSameDay, getDay } from "date-fns";
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

interface ShiftsMonthViewProps {
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

const SEP_WIDTH = 6;
const MIN_COL_WIDTH = 42;

export default function ShiftsMonthView({
  shiftTypes,
  staffShifts,
  providers,
  absences,
  timeOffs,
  hospitalId,
  anchor,
  onSaved,
}: ShiftsMonthViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const { weekdays, separatorAfter } = useMemo(() => {
    const monthStartDate = startOfMonth(anchor);
    const monthEndDate = endOfMonth(anchor);
    const wd: Date[] = [];
    const seps = new Set<number>();
    let current = new Date(monthStartDate);
    while (current <= monthEndDate) {
      const dow = getDay(current);
      if (dow !== 0 && dow !== 6) {
        if (dow === 1 && wd.length > 0) seps.add(wd.length - 1);
        wd.push(new Date(current));
      }
      current = addDays(current, 1);
    }
    return { weekdays: wd, separatorAfter: seps };
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

  const totalGridWidth = `calc(9rem + ${weekdays.length * MIN_COL_WIDTH + separatorAfter.size * SEP_WIDTH}px)`;

  return (
    <div className="overflow-x-auto h-full flex flex-col">
      {/* Header row */}
      <div className="flex border-b bg-muted/30 flex-shrink-0" style={{ minWidth: totalGridWidth }}>
        <div className="w-36 flex-shrink-0 p-1 border-r text-xs text-muted-foreground font-medium flex items-center">
          Staff
        </div>
        {weekdays.map((day, idx) => (
          <React.Fragment key={idx}>
            <div
              className={cn(
                "text-center text-[10px] leading-tight py-1 border-r",
                isToday(day) && "bg-primary/10 text-primary font-bold"
              )}
              style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH }}
            >
              <div>{format(day, "EEE")}</div>
              <div className="text-muted-foreground">{format(day, "d")}</div>
            </div>
            {separatorAfter.has(idx) && (
              <div
                className="bg-gray-300 dark:bg-gray-600"
                style={{ width: SEP_WIDTH, minWidth: SEP_WIDTH }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Provider rows */}
      <div className="flex-1 overflow-auto pb-6" style={{ minWidth: totalGridWidth }}>
        {providers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No providers found.
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
              <div key={p.id} className="flex border-b">
                <div className="w-36 flex-shrink-0 p-1.5 border-r bg-muted/20 font-medium text-xs sticky left-0 z-10 flex items-center">
                  {name}
                </div>

                {weekdays.map((day, dayIdx) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const shift = shiftByKey.get(`${p.id}|${dateStr}`) ?? null;
                  const shiftType = shift?.shiftTypeId
                    ? (typeById.get(shift.shiftTypeId) ?? null)
                    : null;
                  const absence = absenceFor(p.id, day);
                  const isOpen =
                    popover?.userId === p.id && popover?.date === dateStr;

                  return (
                    <React.Fragment key={dayIdx}>
                      <div
                        className={cn(
                          "border-r",
                          isToday(day) && "bg-primary/5"
                        )}
                        style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH, minHeight: 40 }}
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
                            setPopover(
                              v ? { userId: p.id, userName: name, date: dateStr } : null
                            )
                          }
                          onSaved={() => {
                            setPopover(null);
                            onSaved?.();
                          }}
                        >
                          <div className="h-full w-full" style={{ minHeight: 40 }}>
                            <ShiftCell
                              shift={shiftType}
                              absence={absence}
                              variant="month"
                              onClick={() =>
                                setPopover({ userId: p.id, userName: name, date: dateStr })
                              }
                            />
                          </div>
                        </StaffShiftPopover>
                      </div>
                      {separatorAfter.has(dayIdx) && (
                        <div
                          className="bg-gray-300 dark:bg-gray-600"
                          style={{ width: SEP_WIDTH, minWidth: SEP_WIDTH }}
                        />
                      )}
                    </React.Fragment>
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
