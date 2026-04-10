import { useMemo, useState, useEffect, useRef, useCallback } from "react";
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

interface StaffPoolEntry {
  id: string;
  date: string;
  userId: string | null;
  name: string;
  role: string;
}

interface ShiftsWeekViewProps {
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  staffPool: StaffPoolEntry[];
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
  bulk?: boolean;
  bulkDates?: string[];
}

interface DragState {
  providerId: string;
  startIdx: number;
  currentIdx: number;
}

const MIN_COL_WIDTH = 120;
const MIN_ROW_HEIGHT = 72;

export default function ShiftsWeekView({
  shiftTypes,
  staffShifts,
  staffPool,
  providers,
  absences,
  timeOffs,
  hospitalId,
  anchor,
  onSaved,
}: ShiftsWeekViewProps) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const handleDragStart = useCallback((providerId: string, dayIdx: number) => {
    setDragState({ providerId, startIdx: dayIdx, currentIdx: dayIdx });
  }, []);

  const handleDragEnter = useCallback((providerId: string, dayIdx: number) => {
    setDragState((prev) => {
      if (!prev || prev.providerId !== providerId) return prev;
      return { ...prev, currentIdx: dayIdx };
    });
  }, []);

  // Global mouseup: finalize or cancel drag
  useEffect(() => {
    const handleDragEnd = () => {
      const ds = dragStateRef.current;
      if (!ds) return;
      setDragState(null);

      // Find the provider
      const provider = providers.find((p) => p.id === ds.providerId);
      if (!provider) return;
      const name =
        `${provider.lastName}, ${provider.firstName}`
          .replace(/^,\s*/, "")
          .replace(/,\s*$/, "") ||
        provider.firstName ||
        provider.lastName ||
        "Unknown";

      const minIdx = Math.min(ds.startIdx, ds.currentIdx);
      const maxIdx = Math.max(ds.startIdx, ds.currentIdx);
      // weekDays is captured via closure — we rebuild it from the ref below
      const selectedDates = weekDaysRef.current.slice(minIdx, maxIdx + 1).map((d) =>
        format(d, "yyyy-MM-dd")
      );

      // Delay to next tick so the popover opens AFTER the click event
      // (which would otherwise toggle the Radix PopoverTrigger closed).
      setTimeout(() => {
        if (selectedDates.length === 1) {
          setPopover({ userId: ds.providerId, userName: name, date: selectedDates[0] });
        } else {
          setPopover({
            userId: ds.providerId,
            userName: name,
            date: selectedDates[0],
            bulk: true,
            bulkDates: selectedDates,
          });
        }
      }, 0);
    };

    window.addEventListener("mouseup", handleDragEnd);
    return () => {
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [providers]);

  const weekDaysRef = useRef<Date[]>([]);

  const isDayInDragRange = useCallback(
    (providerId: string, dayIdx: number) => {
      if (!dragState || dragState.providerId !== providerId) return false;
      const minIdx = Math.min(dragState.startIdx, dragState.currentIdx);
      const maxIdx = Math.max(dragState.startIdx, dragState.currentIdx);
      return dayIdx >= minIdx && dayIdx <= maxIdx;
    },
    [dragState]
  );

  const weekDays = useMemo(() => {
    const weekStart = startOfISOWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    weekDaysRef.current = days;
    return days;
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
      <div
        className={cn(dragState && "select-none")}
        style={{ minWidth: `calc(10rem + ${weekDays.length * MIN_COL_WIDTH}px)` }}
      >
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
                  const poolEntry = poolByKey.get(`${p.id}|${dateStr}`) ?? null;
                  const absence = absenceFor(p.id, day);
                  const inDragRange = isDayInDragRange(p.id, dayIdx);
                  const isOpen =
                    popover?.userId === p.id && popover?.date === dateStr;

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "flex-1 border-r",
                        isToday(day) && "bg-primary/5",
                        inDragRange && "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-950/30"
                      )}
                      style={{ minHeight: MIN_ROW_HEIGHT, minWidth: MIN_COL_WIDTH }}
                      onMouseDown={(e) => {
                        if (e.button === 0) {
                          e.preventDefault();
                          handleDragStart(p.id, dayIdx);
                        }
                      }}
                      onMouseEnter={() => {
                        if (dragState) {
                          handleDragEnter(p.id, dayIdx);
                        }
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                      }}
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
                        onOpenChange={(v) =>
                          setPopover(v ? { userId: p.id, userName: name, date: dateStr } : null)
                        }
                        onSaved={() => {
                          setPopover(null);
                          onSaved?.();
                        }}
                        bulk={isOpen ? (popover?.bulk ?? false) : false}
                        bulkDates={isOpen ? popover?.bulkDates : undefined}
                      >
                        <div className="h-full w-full" style={{ minHeight: MIN_ROW_HEIGHT }}>
                          <ShiftCell
                            shift={shiftType}
                            role={poolEntry?.role}
                            absence={absence}
                            variant="week"
                            onClick={() => {
                              // Click is handled via mousedown/mouseup drag logic
                            }}
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
