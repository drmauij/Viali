import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import type { Locale } from "date-fns";
import { ChevronLeft, ChevronRight, Info, Loader2, Plus, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { calculateWorkHours } from "@/lib/worktimeUtils";

interface PlannedShift {
  date: string;
  role: string;
  roomAssignments: { roomName: string }[];
}

interface WorklogEntry {
  id: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  status: "pending" | "countersigned" | "rejected";
}

interface PlanningCalendarProps {
  token: string;
  dateLocale: Locale;
  entries?: WorklogEntry[];
  onAddWorklog?: (date: string, role: string) => void;
  onAddWorklogForDay?: (date: string) => void;
  onDeleteEntry?: (entryId: string) => void;
  deletingId?: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  surgeon: "bg-blue-500",
  surgicalAssistant: "bg-indigo-500",
  instrumentNurse: "bg-purple-500",
  circulatingNurse: "bg-pink-500",
  anesthesiologist: "bg-green-500",
  anesthesiaNurse: "bg-teal-500",
  pacuNurse: "bg-orange-500",
};

export default function PlanningCalendar({
  token,
  dateLocale,
  entries = [],
  onAddWorklog,
  onAddWorklogForDay,
  onDeleteEntry,
  deletingId,
}: PlanningCalendarProps) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [shifts, setShifts] = useState<PlannedShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userLinked, setUserLinked] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const fetchShifts = useCallback(async (month: Date) => {
    setIsLoading(true);
    try {
      const monthParam = format(month, "yyyy-MM");
      const res = await fetch(`/api/worklog/${token}/planned-shifts?month=${monthParam}`);
      if (res.ok) {
        const data = await res.json();
        setShifts(data.shifts);
        setUserLinked(data.userLinked);
      }
    } catch {
      // silently fail — empty state shown
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchShifts(currentMonth);
  }, [currentMonth, fetchShifts]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Build weekday headers (Mon-Sun)
  const weekDays = eachDayOfInterval({
    start: calendarStart,
    end: new Date(calendarStart.getTime() + 6 * 24 * 60 * 60 * 1000),
  });

  const getShiftsForDay = (day: Date): PlannedShift[] => {
    const dateStr = format(day, "yyyy-MM-dd");
    return shifts.filter((s) => s.date === dateStr);
  };

  const getEntriesForDay = (day: Date): WorklogEntry[] => {
    const dateStr = format(day, "yyyy-MM-dd");
    return entries.filter((e) => e.workDate === dateStr);
  };

  const selectedDayShifts = selectedDay ? getShiftsForDay(selectedDay) : [];
  const selectedDayEntries = selectedDay ? getEntriesForDay(selectedDay) : [];

  const getRoleLabel = (role: string): string => {
    const key = `surgery.staff.${role}`;
    const translated = t(key);
    return translated === key ? role.replace(/([A-Z])/g, " $1").trim() : translated;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700 text-xs">{t("externalWorklog.pending")}</Badge>;
      case "countersigned":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700 text-xs">{t("externalWorklog.countersigned")}</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700 text-xs">{t("externalWorklog.rejected")}</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  if (!userLinked) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Info className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground max-w-md">
          {t("externalWorklog.planning.notLinked")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setSelectedDay(null);
            setCurrentMonth((m) => subMonths(m, 1));
          }}
          className="dark:border-gray-600"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h3 className="text-lg font-semibold dark:text-gray-100">
          {format(currentMonth, "MMMM yyyy", { locale: dateLocale })}
        </h3>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setSelectedDay(null);
            setCurrentMonth((m) => addMonths(m, 1));
          }}
          className="dark:border-gray-600"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            {/* Weekday headers */}
            {weekDays.map((day) => (
              <div
                key={day.toISOString()}
                className="bg-gray-50 dark:bg-gray-800 text-center text-xs font-medium text-muted-foreground py-2"
              >
                {format(day, "EEE", { locale: dateLocale })}
              </div>
            ))}

            {/* Day cells */}
            {calendarDays.map((day) => {
              const dayShifts = getShiftsForDay(day);
              const dayEntries = getEntriesForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isTodayDate = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => isCurrentMonth && setSelectedDay(isSelected ? null : day)}
                  className={`
                    relative min-h-[3rem] sm:min-h-[3.5rem] p-1 text-sm transition-colors
                    bg-white dark:bg-gray-900
                    ${!isCurrentMonth ? "text-gray-300 dark:text-gray-600" : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"}
                    ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                  `}
                >
                  <span
                    className={`
                      inline-flex items-center justify-center w-6 h-6 text-xs rounded-full
                      ${isTodayDate ? "bg-primary text-primary-foreground font-bold" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </span>
                  {/* Shift dots + entry indicator */}
                  {(dayShifts.length > 0 || dayEntries.length > 0) && isCurrentMonth && (
                    <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap">
                      {dayShifts.map((shift, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${ROLE_COLORS[shift.role] || "bg-gray-400"}`}
                        />
                      ))}
                      {dayEntries.length > 0 && (
                        <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (selectedDayShifts.length > 0 || selectedDayEntries.length > 0 || onAddWorklogForDay) && (
            <div className="space-y-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <h4 className="font-medium text-sm dark:text-gray-100">
                {format(selectedDay, "EEEE, d MMMM", { locale: dateLocale })}
              </h4>

              {/* Planned shifts */}
              {selectedDayShifts.map((shift, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${ROLE_COLORS[shift.role] || "bg-gray-400"}`}
                    />
                    <div>
                      <span className="font-medium dark:text-gray-200">
                        {getRoleLabel(shift.role)}
                      </span>
                      {shift.roomAssignments.length > 0 && (
                        <span className="text-muted-foreground ml-2">
                          {shift.roomAssignments.map((r) => r.roomName).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  {onAddWorklog && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-7 text-xs dark:border-gray-600"
                      onClick={() => onAddWorklog(format(selectedDay, "yyyy-MM-dd"), shift.role)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {t("externalWorklog.planning.logTime")}
                    </Button>
                  )}
                </div>
              ))}

              {/* Existing entries for this day */}
              {selectedDayEntries.length > 0 && (
                <div className="space-y-2 pt-1">
                  {selectedDayShifts.length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2" />
                  )}
                  {selectedDayEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="dark:text-gray-200">
                          {entry.timeStart} – {entry.timeEnd}
                        </span>
                        <span className="text-muted-foreground">
                          ({calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)}h)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(entry.status)}
                        {entry.status === "pending" && onDeleteEntry && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                disabled={deletingId === entry.id}
                              >
                                {deletingId === entry.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="dark:text-gray-100">{t("externalWorklog.confirmDeleteTitle")}</AlertDialogTitle>
                                <AlertDialogDescription className="dark:text-gray-400">
                                  {t("externalWorklog.confirmDeleteMessage")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600">{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => onDeleteEntry(entry.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {t("common.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Record Work Time button */}
              {onAddWorklogForDay && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2 dark:border-gray-600"
                  onClick={() => onAddWorklogForDay(format(selectedDay, "yyyy-MM-dd"))}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  {t("externalWorklog.planning.recordTime")}
                </Button>
              )}
            </div>
          )}

          {/* Empty state: no shifts this month */}
          {shifts.length === 0 && (
            <p className="text-center text-muted-foreground py-6 text-sm">
              {t("externalWorklog.planning.noShifts")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
