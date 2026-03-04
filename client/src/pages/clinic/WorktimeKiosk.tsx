import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateWorkHours } from "@/lib/worktimeUtils";
import { format } from "date-fns";
import { formatTime } from "@/lib/dateUtils";
import { ArrowLeft, Search, Clock, User, Play, Pause, Square, Timer } from "lucide-react";
import { useLocation } from "wouter";

interface StaffUser {
  id: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
    canLogin: boolean;
    staffType: string;
  };
  role: string;
  unitId: string;
  units: {
    id: string;
    name: string;
    type: string | null;
  };
}

function PauseCounter({ pauseStart }: { pauseStart: Date }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - pauseStart.getTime());
    }, 1000);
    setElapsed(Date.now() - pauseStart.getTime());
    return () => clearInterval(id);
  }, [pauseStart]);

  const totalSec = Math.max(0, Math.floor(elapsed / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;

  return (
    <div className="text-sm text-muted-foreground mt-1">
      {t("worktime.pauseDuration", "Pause")}: {m}:{s.toString().padStart(2, "0")}
    </div>
  );
}

function formatTimerDisplay(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function WorktimeKiosk() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const [formData, setFormData] = useState({
    workDate: today,
    timeStart: "08:00",
    timeEnd: "17:00",
    pauseMinutes: 30,
    notes: "",
  });

  // Timer state — default to timer mode in kiosk
  const [timerMode, setTimerMode] = useState(true);
  const [timerStatus, setTimerStatus] = useState<"idle" | "running" | "paused">("idle");
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  const [timerPauseStart, setTimerPauseStart] = useState<Date | null>(null);
  const [timerTotalPauseMs, setTimerTotalPauseMs] = useState(0);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerStatus("idle");
    setTimerStartTime(null);
    setTimerPauseStart(null);
    setTimerTotalPauseMs(0);
    setTimerElapsed(0);
  }, []);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const startTimerInterval = useCallback((startTime: Date, totalPauseMs: number) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimerElapsed(Date.now() - startTime.getTime() - totalPauseMs);
    }, 1000);
    setTimerElapsed(Date.now() - startTime.getTime() - totalPauseMs);
  }, []);

  const handleTimerStart = useCallback(() => {
    const now = new Date();
    setTimerStartTime(now);
    setTimerTotalPauseMs(0);
    setTimerPauseStart(null);
    setTimerStatus("running");
    startTimerInterval(now, 0);
  }, [startTimerInterval]);

  const handleTimerPause = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerPauseStart(new Date());
    setTimerStatus("paused");
  }, []);

  const handleTimerResume = useCallback(() => {
    if (!timerPauseStart || !timerStartTime) return;
    const additionalPause = Date.now() - timerPauseStart.getTime();
    const newTotalPause = timerTotalPauseMs + additionalPause;
    setTimerTotalPauseMs(newTotalPause);
    setTimerPauseStart(null);
    setTimerStatus("running");
    startTimerInterval(timerStartTime, newTotalPause);
  }, [timerPauseStart, timerStartTime, timerTotalPauseMs, startTimerInterval]);

  const handleTimerStop = useCallback(() => {
    const now = new Date();
    if (!timerStartTime) return;

    let finalPauseMs = timerTotalPauseMs;
    if (timerPauseStart) {
      finalPauseMs += now.getTime() - timerPauseStart.getTime();
    }

    setFormData({
      workDate: format(timerStartTime, "yyyy-MM-dd"),
      timeStart: formatTime(timerStartTime),
      timeEnd: formatTime(now),
      pauseMinutes: Math.round(finalPauseMs / 60000),
      notes: "",
    });

    resetTimer();
    setTimerMode(false);
  }, [timerStartTime, timerTotalPauseMs, timerPauseStart, resetTimer]);

  const hospitalId = activeHospital?.id;

  // Fetch staff list
  const { data: staffList = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: [`/api/admin/${hospitalId}/users`],
    enabled: !!hospitalId,
  });

  // Get unique units for filter
  const units = useMemo(() => {
    const unitMap = new Map<string, string>();
    staffList.forEach((s) => {
      if (s.units?.id && s.units?.name) {
        unitMap.set(s.units.id, s.units.name);
      }
    });
    return Array.from(unitMap.entries()).map(([id, name]) => ({ id, name }));
  }, [staffList]);

  // Deduplicate staff by user ID and apply filters
  const filteredStaff = useMemo(() => {
    const seen = new Map<string, StaffUser>();
    staffList.forEach((s) => {
      if (!seen.has(s.user.id)) {
        seen.set(s.user.id, s);
      }
    });
    let result = Array.from(seen.values());

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          (s.user.firstName || "").toLowerCase().includes(q) ||
          (s.user.lastName || "").toLowerCase().includes(q)
      );
    }

    if (unitFilter !== "all") {
      result = result.filter((s) => s.units?.id === unitFilter);
    }

    result.sort((a, b) => {
      const nameA = `${a.user.lastName || ""} ${a.user.firstName || ""}`.toLowerCase();
      const nameB = `${b.user.lastName || ""} ${b.user.firstName || ""}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [staffList, search, unitFilter]);

  const createMutation = useMutation({
    mutationFn: async (staffUserId: string) => {
      const res = await apiRequest("POST", `/api/hospitals/${hospitalId}/worktime-logs`, {
        userId: staffUserId,
        ...formData,
        pauseMinutes: Number(formData.pauseMinutes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("worktime.entrySaved", "Entry saved") });
      setEntryDialogOpen(false);
      setSelectedStaff(null);
      setFormData({
        workDate: today,
        timeStart: "08:00",
        timeEnd: "17:00",
        pauseMinutes: 30,
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitals", hospitalId, "worktime-logs"] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const handleStaffClick = (staff: StaffUser) => {
    setSelectedStaff(staff);
    setFormData({
      workDate: today,
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
    });
    resetTimer();
    setTimerMode(true);
    setEntryDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      if (timerStatus !== "idle") {
        if (!window.confirm(t("worktime.timerSwitchConfirm", "Timer is active. Switch to manual and discard timer?"))) return;
      }
      resetTimer();
      setTimerMode(true);
    }
    setEntryDialogOpen(open);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    createMutation.mutate(selectedStaff.user.id);
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "?";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      doctor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      nurse: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      staff: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
      manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    };
    return (
      <Badge variant="outline" className={`text-xs ${colors[role] || colors.staff}`}>
        {t(`admin.role_${role}`, role)}
      </Badge>
    );
  };

  const netHours = calculateWorkHours(formData.timeStart, formData.timeEnd, Number(formData.pauseMinutes) || 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{t("worktime.kioskTitle", "Staff Work Time")}</h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-3 border-b bg-card flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("worktime.searchStaff", "Search staff...")}
            className="pl-9"
          />
        </div>
        {units.length > 1 && (
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t("worktime.allUnits", "All units")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("worktime.allUnits", "All units")}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Staff grid */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("common.loading", "Loading...")}
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("worktime.noStaffFound", "No staff found")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredStaff.map((staff) => (
              <Card
                key={staff.user.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98]"
                onClick={() => handleStaffClick(staff)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
                    {staff.user.profileImageUrl ? (
                      <img
                        src={staff.user.profileImageUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(staff.user.firstName, staff.user.lastName)
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm leading-tight">
                      {staff.user.firstName} {staff.user.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {staff.units?.name}
                    </div>
                  </div>
                  {getRoleBadge(staff.role)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedStaff?.user.firstName} {selectedStaff?.user.lastName}
            </DialogTitle>
          </DialogHeader>

          {/* Mode toggle: Timer / Manual */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            <button
              type="button"
              className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                timerMode
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                if (!timerMode && timerStatus === "idle") setTimerMode(true);
                else if (!timerMode) setTimerMode(true);
              }}
            >
              <Timer className="h-3.5 w-3.5" />
              {t("worktime.timer", "Timer")}
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                !timerMode
                  ? "bg-background shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                if (timerStatus !== "idle") {
                  if (!window.confirm(t("worktime.timerSwitchConfirm", "Timer is active. Switch to manual and discard timer?"))) return;
                  resetTimer();
                }
                setTimerMode(false);
              }}
            >
              {t("worktime.manual", "Manual")}
            </button>
          </div>

          {timerMode ? (
            /* Timer UI */
            <div className="border rounded-lg p-6 flex flex-col items-center gap-4">
              <div className="text-center">
                <div className="text-4xl font-mono tabular-nums tracking-tight">
                  {formatTimerDisplay(timerElapsed)}
                  {timerStatus === "paused" && (
                    <span className="text-lg text-muted-foreground ml-2">
                      ({t("worktime.paused", "paused")})
                    </span>
                  )}
                </div>

                {timerStatus === "running" && timerStartTime && (
                  <div className="text-sm text-muted-foreground mt-1">
                    {t("worktime.startedAt", "Started at")} {formatTime(timerStartTime)}
                  </div>
                )}
                {timerStatus === "paused" && timerPauseStart && (
                  <PauseCounter pauseStart={timerPauseStart} />
                )}
              </div>

              <div className="flex gap-3 w-full">
                {timerStatus === "idle" && (
                  <Button
                    type="button"
                    className="flex-1 h-14 text-lg font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleTimerStart}
                  >
                    <Play className="h-5 w-5 mr-2" />
                    {t("worktime.start", "Start")}
                  </Button>
                )}

                {timerStatus === "running" && (
                  <>
                    <Button
                      type="button"
                      className="flex-1 h-14 text-lg font-semibold rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                      onClick={handleTimerPause}
                    >
                      <Pause className="h-5 w-5 mr-2" />
                      {t("worktime.pause", "Pause")}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 h-14 text-lg font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleTimerStop}
                    >
                      <Square className="h-5 w-5 mr-2" />
                      {t("worktime.stop", "Stop")}
                    </Button>
                  </>
                )}

                {timerStatus === "paused" && (
                  <>
                    <Button
                      type="button"
                      className="flex-1 h-14 text-lg font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white"
                      onClick={handleTimerResume}
                    >
                      <Play className="h-5 w-5 mr-2" />
                      {t("worktime.resume", "Resume")}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 h-14 text-lg font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleTimerStop}
                    >
                      <Square className="h-5 w-5 mr-2" />
                      {t("worktime.stop", "Stop")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Manual form */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-sm">{t("worktime.date", "Date")}</Label>
                  <DateInput
                    value={formData.workDate}
                    onChange={(v) => setFormData({ ...formData, workDate: v })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("worktime.start", "Start")}</Label>
                  <TimeInput
                    value={formData.timeStart}
                    onChange={(v) => setFormData({ ...formData, timeStart: v })}
                    required
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("worktime.end", "End")}</Label>
                  <TimeInput
                    value={formData.timeEnd}
                    onChange={(v) => setFormData({ ...formData, timeEnd: v })}
                    required
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm">{t("worktime.pauseMin", "Pause (min)")}</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.pauseMinutes}
                  onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div>
                <Label className="text-sm">{t("worktime.notes", "Notes")}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t("worktime.notesPlaceholder", "Optional notes...")}
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">
                  {t("worktime.netHours", "Net")}: <strong>{netHours}h</strong>
                </span>
                <Button type="submit" disabled={createMutation.isPending}>
                  {t("worktime.logTime", "Log Time")}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
