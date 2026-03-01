import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { calculateWorkHours } from "@/lib/worktimeUtils";

interface WorktimeLog {
  id: string;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  notes: string | null;
}

interface WorktimeBalance {
  configured: boolean;
  weeklyTargetMinutes: number | null;
  thisWeekMinutes: number;
  thisMonthMinutes: number;
  totalOvertimeMinutes: number;
}

interface StaffWorktimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  staffId: string;
  staffName: string;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
}

export default function StaffWorktimeDialog({
  open,
  onOpenChange,
  hospitalId,
  staffId,
  staffName,
}: StaffWorktimeDialogProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "de" ? "de-DE" : "en-US";

  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const dateFrom = useMemo(() => {
    return `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-01`;
  }, [viewMonth]);

  const dateTo = useMemo(() => {
    const last = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  }, [viewMonth]);

  const monthLabel = useMemo(() => {
    return viewMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });
  }, [viewMonth, locale]);

  // Fetch balance
  const { data: balance } = useQuery<WorktimeBalance>({
    queryKey: ["/api/hospitals", hospitalId, "worktime-logs", "balance", staffId],
    queryFn: async () => {
      const res = await fetch(
        `/api/hospitals/${hospitalId}/worktime-logs/balance/${staffId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!staffId,
  });

  // Fetch logs for the selected month
  const { data: logs = [], isLoading } = useQuery<WorktimeLog[]>({
    queryKey: ["/api/hospitals", hospitalId, "worktime-logs", staffId, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(
        `/api/hospitals/${hospitalId}/worktime-logs?userId=${staffId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!staffId,
  });

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => a.workDate.localeCompare(b.workDate));
  }, [logs]);

  // Calculate month totals
  const monthTotalMinutes = useMemo(() => {
    let total = 0;
    for (const log of sortedLogs) {
      const [startH, startM] = log.timeStart.split(":").map(Number);
      const [endH, endM] = log.timeEnd.split(":").map(Number);
      let mins = (endH * 60 + endM) - (startH * 60 + startM);
      if (mins < 0) mins += 24 * 60;
      mins -= log.pauseMinutes;
      if (mins < 0) mins = 0;
      total += mins;
    }
    return total;
  }, [sortedLogs]);

  const prevMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const formatDayLabel = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {staffName}
          </DialogTitle>
        </DialogHeader>

        {/* Balance summary */}
        {balance && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {t("worktime.thisWeek")}
              </div>
              <div className="font-semibold text-sm">
                {formatMinutes(balance.thisWeekMinutes)}
                {balance.configured && balance.weeklyTargetMinutes && (
                  <span className="text-muted-foreground font-normal">
                    {" / "}{formatMinutes(balance.weeklyTargetMinutes)}
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {t("worktime.thisMonth")}
              </div>
              <div className="font-semibold text-sm">
                {formatMinutes(balance.thisMonthMinutes)}
              </div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {t("worktime.runningBalance")}
              </div>
              {balance.configured ? (
                <div
                  className={`font-semibold text-sm ${balance.totalOvertimeMinutes >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {balance.totalOvertimeMinutes >= 0 ? "+" : ""}
                  {formatMinutes(balance.totalOvertimeMinutes)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  {t("worktime.notConfigured")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">{monthLabel}</h3>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Logs table */}
        <ScrollArea className="flex-1 min-h-0 max-h-[340px] border rounded-lg mt-3">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Loading...
            </div>
          ) : sortedLogs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              {t("worktime.noEntries")}
            </div>
          ) : (
            <div className="divide-y">
              {sortedLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="font-medium min-w-[120px]">
                      {formatDayLabel(log.workDate)}
                    </span>
                    <span className="text-muted-foreground">
                      {log.timeStart}–{log.timeEnd}
                    </span>
                    {log.pauseMinutes > 0 && (
                      <span className="text-muted-foreground text-xs">
                        -{log.pauseMinutes}m
                      </span>
                    )}
                  </div>
                  <span className="font-medium text-sm">
                    {calculateWorkHours(log.timeStart, log.timeEnd, log.pauseMinutes)}h
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Month total footer */}
        {sortedLogs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 mt-1 rounded-lg bg-muted/50 text-sm">
            <span className="font-medium">
              {t("worktime.monthTotal", "Total")}
            </span>
            <span className="font-semibold">{formatMinutes(monthTotalMinutes)}h</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
