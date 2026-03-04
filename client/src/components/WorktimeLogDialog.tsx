import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateWorkHours } from "@/lib/worktimeUtils";
import { subDays } from "date-fns";
import { formatDate, formatDateForInput, formatTime } from "@/lib/dateUtils";
import { Pencil, Trash2, Plus, Clock, Key, Check, Play, Pause, Square, Timer } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface WorktimeLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  hasKioskPin?: boolean;
}

interface WorktimeLog {
  id: string;
  userId: string;
  hospitalId: string;
  enteredById: string | null;
  workDate: string;
  timeStart: string;
  timeEnd: string;
  pauseMinutes: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorktimeBalance {
  configured: boolean;
  weeklyTargetMinutes: number | null;
  thisWeekMinutes: number;
  thisMonthMinutes: number;
  totalOvertimeMinutes: number;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
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

export default function WorktimeLogDialog({ open, onOpenChange, hospitalId, hasKioskPin = false }: WorktimeLogDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = (user as any)?.id;

  const today = formatDateForInput(new Date());
  const fourteenDaysAgo = formatDateForInput(subDays(new Date(), 14));

  const [activeTab, setActiveTab] = useState("add");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPinInput, setShowPinInput] = useState(false);
  const [kioskPin, setKioskPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [formData, setFormData] = useState({
    workDate: today,
    timeStart: "08:00",
    timeEnd: "17:00",
    pauseMinutes: 30,
    notes: "",
  });

  // Timer state
  const [timerMode, setTimerMode] = useState(false);
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

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  const startTimerInterval = useCallback((startTime: Date, totalPauseMs: number) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimerElapsed(Date.now() - startTime.getTime() - totalPauseMs);
    }, 1000);
    // Immediate update
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

    // Finalize pause if currently paused
    let finalPauseMs = timerTotalPauseMs;
    if (timerPauseStart) {
      finalPauseMs += now.getTime() - timerPauseStart.getTime();
    }

    // Populate form
    setFormData({
      workDate: formatDateForInput(timerStartTime),
      timeStart: formatTime(timerStartTime),
      timeEnd: formatTime(now),
      pauseMinutes: Math.round(finalPauseMs / 60000),
      notes: "",
    });

    resetTimer();
    setTimerMode(false);
  }, [timerStartTime, timerTotalPauseMs, timerPauseStart, resetTimer]);

  function formatTimerDisplay(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      workDate: today,
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
    });
    resetTimer();
  };

  // Fetch entries (last 14 days)
  const { data: entries = [] } = useQuery<WorktimeLog[]>({
    queryKey: ["/api/hospitals", hospitalId, "worktime-logs", userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/hospitals/${hospitalId}/worktime-logs?userId=${userId}&dateFrom=${fourteenDaysAgo}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!hospitalId && !!userId,
  });

  // Fetch balance
  const { data: balance } = useQuery<WorktimeBalance>({
    queryKey: ["/api/hospitals", hospitalId, "worktime-logs", "balance", userId],
    queryFn: async () => {
      const res = await fetch(
        `/api/hospitals/${hospitalId}/worktime-logs/balance/${userId}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!hospitalId && !!userId,
  });

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/hospitals", hospitalId, "worktime-logs"] });
  };

  const handleSetPin = async () => {
    if (kioskPin.length !== 4) return;
    setPinSaving(true);
    try {
      await apiRequest("POST", "/api/user/kiosk-pin", { pin: kioskPin });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: t("common.success"), description: t("settings.kioskPinSet", "Kiosk PIN set") });
      setShowPinInput(false);
      setKioskPin("");
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || "Failed to set PIN", variant: "destructive" });
    } finally {
      setPinSaving(false);
    }
  };

  const handleClearPin = async () => {
    if (!window.confirm(t("settings.clearKioskPinConfirm", "Clear your kiosk PIN? You won't be able to use the kiosk until you set a new one."))) return;
    setPinSaving(true);
    try {
      await apiRequest("DELETE", "/api/user/kiosk-pin");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: t("common.success"), description: t("settings.kioskPinCleared", "Kiosk PIN cleared") });
    } catch (error: any) {
      toast({ title: t("common.error"), description: error.message || "Failed to clear PIN", variant: "destructive" });
    } finally {
      setPinSaving(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", `/api/hospitals/${hospitalId}/worktime-logs`, {
        ...data,
        userId,
        pauseMinutes: Number(data.pauseMinutes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("worktime.entrySaved", "Entry saved") });
      resetForm();
      setActiveTab("history");
      invalidateQueries();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const res = await apiRequest("PATCH", `/api/hospitals/${hospitalId}/worktime-logs/${id}`, {
        ...data,
        pauseMinutes: Number(data.pauseMinutes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("worktime.entryUpdated", "Entry updated") });
      resetForm();
      setActiveTab("history");
      invalidateQueries();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/hospitals/${hospitalId}/worktime-logs/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("worktime.entryDeleted", "Entry deleted") });
      invalidateQueries();
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (entry: WorktimeLog) => {
    setEditingId(entry.id);
    setFormData({
      workDate: entry.workDate,
      timeStart: entry.timeStart,
      timeEnd: entry.timeEnd,
      pauseMinutes: entry.pauseMinutes,
      notes: entry.notes || "",
    });
    setActiveTab("add");
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t("worktime.confirmDelete", "Delete this entry?"))) {
      deleteMutation.mutate(id);
    }
  };

  const netHours = calculateWorkHours(formData.timeStart, formData.timeEnd, Number(formData.pauseMinutes) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden">
        {/* Header — always visible */}
        <div className="flex items-center justify-between">
          <DialogHeader className="flex-1">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("worktime.title", "Work Time")}
            </DialogTitle>
          </DialogHeader>

          {/* Kiosk PIN — compact, top right */}
          <div className="flex items-center gap-2 mr-6">
            {showPinInput ? (
              <>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={kioskPin}
                  onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN"
                  className="w-16 h-7 text-center text-xs tracking-[0.2em] font-mono"
                />
                <Button type="button" size="sm" variant="default" className="h-7 text-xs px-2" onClick={handleSetPin} disabled={pinSaving || kioskPin.length !== 4}>
                  <Check className="h-3 w-3" />
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setShowPinInput(false); setKioskPin(""); }}>
                  {t("common.cancel", "Cancel")}
                </Button>
              </>
            ) : (
              <>
                {hasKioskPin && (
                  <span className="text-green-600 flex items-center gap-1 text-xs">
                    <Check className="h-3 w-3" />
                    PIN
                  </span>
                )}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setShowPinInput(true)}>
                  <Key className="h-3 w-3 mr-1" />
                  {hasKioskPin ? t("settings.changePin", "Change") : t("settings.setKioskPin", "Set PIN")}
                </Button>
                {hasKioskPin && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-1 text-destructive" onClick={handleClearPin} disabled={pinSaving}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Balance Summary */}
        {balance && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {t("worktime.thisWeek", "This Week")}
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
                {t("worktime.thisMonth", "This Month")}
              </div>
              <div className="font-semibold text-sm">
                {formatMinutes(balance.thisMonthMinutes)}
              </div>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {t("worktime.runningBalance", "Balance")}
              </div>
              {balance.configured ? (
                <div className={`font-semibold text-sm ${balance.totalOvertimeMinutes >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {balance.totalOvertimeMinutes >= 0 ? "+" : ""}{formatMinutes(balance.totalOvertimeMinutes)}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground italic">
                  {t("worktime.notConfigured", "Not configured")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs: Add Entry / History */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="add" className="flex-1 relative">
              {editingId
                ? t("worktime.editEntry", "Edit Entry")
                : t("worktime.addEntry", "Add Entry")}
              {timerStatus !== "idle" && activeTab !== "add" && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              {t("worktime.history", "History")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="add" className="mt-3 flex-1">
            {/* Mode toggle: Manual / Timer */}
            {!editingId && (
              <div className="flex gap-1 mb-3 bg-muted rounded-lg p-1 w-fit">
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
                <button
                  type="button"
                  className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1 ${
                    timerMode
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setTimerMode(true)}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {t("worktime.timer", "Timer")}
                </button>
              </div>
            )}

            {timerMode && !editingId ? (
              /* Timer UI */
              <div className="border rounded-lg p-6 flex flex-col items-center gap-4">
                {/* Clock display */}
                <div className="text-center">
                  <div className="text-4xl font-mono tabular-nums tracking-tight">
                    {formatTimerDisplay(timerElapsed)}
                    {timerStatus === "paused" && (
                      <span className="text-lg text-muted-foreground ml-2">
                        ({t("worktime.paused", "paused")})
                      </span>
                    )}
                  </div>

                  {/* Sub-info */}
                  {timerStatus === "running" && timerStartTime && (
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("worktime.startedAt", "Started at")} {formatTime(timerStartTime)}
                    </div>
                  )}
                  {timerStatus === "paused" && timerPauseStart && (
                    <PauseCounter pauseStart={timerPauseStart} />
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 w-full max-w-sm">
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
              <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
                {editingId && (
                  <div className="flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                      {t("common.cancel", "Cancel")}
                    </Button>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">{t("worktime.date", "Date")}</Label>
                    <DateInput
                      value={formData.workDate}
                      onChange={(v) => setFormData({ ...formData, workDate: v })}
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("worktime.start", "Start")}</Label>
                    <TimeInput
                      value={formData.timeStart}
                      onChange={(v) => setFormData({ ...formData, timeStart: v })}
                      placeholder="08:00"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("worktime.end", "End")}</Label>
                    <TimeInput
                      value={formData.timeEnd}
                      onChange={(v) => setFormData({ ...formData, timeEnd: v })}
                      placeholder="17:00"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t("worktime.pauseMin", "Pause (min)")}</Label>
                    <Input
                      type="number"
                      min="0"
                      value={formData.pauseMinutes}
                      onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">{t("worktime.notes", "Notes")}</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={t("worktime.notesPlaceholder", "Optional notes...")}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("worktime.netHours", "Net")}: <strong>{netHours}h</strong>
                  </span>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {editingId
                      ? t("common.save", "Save")
                      : t("worktime.addEntry", "Add Entry")}
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-3 flex-1 min-h-0">
            <ScrollArea className="max-h-[320px] border rounded-lg">
              <div className="divide-y">
                {entries.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    {t("worktime.noEntries", "No entries yet")}
                  </div>
                ) : (
                  entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-medium w-24">
                          {formatDate(new Date(entry.workDate + "T00:00:00"))}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.timeStart}–{entry.timeEnd}
                        </span>
                        <span className="text-muted-foreground">
                          {entry.pauseMinutes > 0 && `${entry.pauseMinutes}m`}
                        </span>
                        <span className="font-medium">
                          {calculateWorkHours(entry.timeStart, entry.timeEnd, entry.pauseMinutes)}h
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(entry)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
