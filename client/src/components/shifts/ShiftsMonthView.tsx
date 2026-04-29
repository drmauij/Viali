import React, { useMemo, useState, useRef, useCallback } from "react";
import { addDays, startOfMonth, endOfMonth, format, isSameDay, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import ShiftCell from "./ShiftCell";
import StaffShiftPopover from "./StaffShiftPopover";
import type { AbsenceDetail } from "./AbsenceInfoBlock";
import type { ShiftType, StaffShift } from "@shared/schema";
import { useCellDragSelection } from "@/hooks/useCellDragSelection";

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

interface StaffPoolEntry {
  id: string;
  date: string;
  userId: string | null;
  name: string;
  role: string;
}

interface ShiftsMonthViewProps {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  staffPool: StaffPoolEntry[];
  providers: Array<{ id: string; firstName: string; lastName: string }>;
  absences: ProviderAbsence[];
  timeOffs: ProviderTimeOff[];
  hospitalId: string;
  unitId: string;
  anchor: Date;
  onSaved?: () => void;
  readOnly?: boolean;
}

interface PopoverState {
  userId: string;
  userName: string;
  date: string;
  bulk?: boolean;
  bulkDates?: string[];
}

const MIN_COL_WIDTH = 42;

export default function ShiftsMonthView({
  shiftTypes,
  staffShifts,
  staffPool,
  providers,
  absences,
  timeOffs,
  hospitalId,
  anchor,
  onSaved,
  readOnly = false,
}: ShiftsMonthViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const weekdaysRef = useRef<Date[]>([]);
  const providersRef = useRef(providers);
  providersRef.current = providers;

  const handleFinalize = useCallback((providerId: string, startIdx: number, endIdx: number) => {
    const provider = providersRef.current.find((p) => p.id === providerId);
    if (!provider) return;
    const name =
      `${provider.lastName}, ${provider.firstName}`
        .replace(/^,\s*/, "")
        .replace(/,\s*$/, "") ||
      provider.firstName ||
      provider.lastName ||
      "Unknown";

    const selectedDates = weekdaysRef.current
      .slice(startIdx, endIdx + 1)
      .map((d) => format(d, "yyyy-MM-dd"));

    if (selectedDates.length === 0) return;
    if (selectedDates.length === 1) {
      setPopover({ userId: providerId, userName: name, date: selectedDates[0] });
    } else {
      setPopover({
        userId: providerId,
        userName: name,
        date: selectedDates[0],
        bulk: true,
        bulkDates: selectedDates,
      });
    }
  }, []);

  const { dragState, isInDragRange, getCellProps } = useCellDragSelection({
    readOnly,
    onFinalize: handleFinalize,
  });

  const weekdays = useMemo(() => {
    const monthStartDate = startOfMonth(anchor);
    const monthEndDate = endOfMonth(anchor);
    const wd: Date[] = [];
    let current = new Date(monthStartDate);
    while (current <= monthEndDate) {
      wd.push(new Date(current));
      current = addDays(current, 1);
    }
    weekdaysRef.current = wd;
    return wd;
  }, [anchor]);

  const shiftByKey = useMemo(() => {
    const map = new Map<string, StaffShift>();
    for (const s of staffShifts) {
      map.set(`${s.userId}|${s.date}`, s);
    }
    return map;
  }, [staffShifts]);

  const poolByKey = useMemo(() => {
    const map = new Map<string, StaffPoolEntry>();
    for (const e of staffPool) {
      if (e.userId) map.set(`${e.userId}|${e.date}`, e);
    }
    return map;
  }, [staffPool]);

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

  const totalGridWidth = `calc(9rem + ${weekdays.length * MIN_COL_WIDTH}px)`;

  return (
    <div className="overflow-x-auto h-full flex flex-col">
      {/* Header row */}
      <div className="flex border-b bg-muted/30 flex-shrink-0" style={{ minWidth: totalGridWidth }}>
        <div className="w-36 flex-shrink-0 p-1 border-r text-xs text-muted-foreground font-medium flex items-center">
          Staff
        </div>
        {weekdays.map((day, idx) => {
          const dow = getDay(day);
          const isWeekend = dow === 0 || dow === 6;
          return (
            <div
              key={idx}
              className={cn(
                "text-center text-[10px] leading-tight py-1 border-r",
                isWeekend && "bg-gray-300/40 dark:bg-gray-600/40",
                isToday(day) && "bg-primary/10 text-primary font-bold"
              )}
              style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH }}
            >
              <div>{format(day, "EEE")}</div>
              <div className="text-muted-foreground">{format(day, "d")}</div>
            </div>
          );
        })}
      </div>

      {/* Provider rows */}
      <div
        className={cn("flex-1 overflow-auto pb-6", dragState && "select-none")}
        style={{ minWidth: totalGridWidth }}
      >
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
                  const poolEntry = poolByKey.get(`${p.id}|${dateStr}`) ?? null;
                  const absence = absenceFor(p.id, day);
                  const inDragRange = isInDragRange(p.id, dayIdx);
                  const isOpen =
                    popover?.userId === p.id && popover?.date === dateStr;
                  const dow = getDay(day);
                  const isWeekend = dow === 0 || dow === 6;

                  return (
                    <React.Fragment key={dayIdx}>
                      <div
                        className={cn(
                          "border-r",
                          isWeekend && "bg-gray-300/40 dark:bg-gray-600/40",
                          isToday(day) && "bg-primary/5",
                          inDragRange && "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30"
                        )}
                        style={{ width: MIN_COL_WIDTH, minWidth: MIN_COL_WIDTH, minHeight: 40 }}
                        {...getCellProps(p.id, dayIdx)}
                      >
                        <StaffShiftPopover
                          hospitalId={hospitalId}
                          userId={p.id}
                          userName={name}
                          date={dateStr}
                          currentShiftTypeId={shift?.shiftTypeId ?? null}
                          currentRole={poolEntry?.role ?? null}
                          absence={absence}
                          open={isOpen}
                          onOpenChange={(v) => {
                            if (readOnly) return;
                            if (!v) setPopover(null);
                          }}
                          onSaved={() => {
                            setPopover(null);
                            onSaved?.();
                          }}
                          bulk={isOpen ? (popover?.bulk ?? false) : false}
                          bulkDates={isOpen ? popover?.bulkDates : undefined}
                          readOnly={readOnly}
                        >
                          <div className="h-full w-full" style={{ minHeight: 40 }}>
                            <ShiftCell
                              shift={shiftType}
                              role={poolEntry?.role}
                              absence={absence}
                              variant="month"
                              onClick={() => {
                                // Click handled via mousedown/mouseup drag logic
                              }}
                            />
                          </div>
                        </StaffShiftPopover>
                      </div>
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
