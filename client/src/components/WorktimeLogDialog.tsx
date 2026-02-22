import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { formatDate, formatDateForInput } from "@/lib/dateUtils";
import { Pencil, Trash2, Plus, Clock, Key, Check } from "lucide-react";
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

export default function WorktimeLogDialog({ open, onOpenChange, hospitalId, hasKioskPin = false }: WorktimeLogDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = (user as any)?.id;

  const today = formatDateForInput(new Date());
  const fourteenDaysAgo = formatDateForInput(subDays(new Date(), 14));

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

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      workDate: today,
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
    });
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

        {/* Scrollable entry list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[280px] border rounded-lg mt-4">
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

        {/* Footer — always visible */}
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3 mt-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-medium">
              {editingId
                ? t("worktime.editEntry", "Edit Entry")
                : t("worktime.addEntry", "Add Entry")}
            </h4>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                {t("common.cancel", "Cancel")}
              </Button>
            )}
          </div>

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
              <Label className="text-xs">{t("worktime.pause", "Pause (min)")}</Label>
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

      </DialogContent>
    </Dialog>
  );
}
