import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateWorkHours } from "@/lib/worktimeUtils";
import { format, subDays } from "date-fns";
import { Pencil, Trash2, Plus, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface WorktimeLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
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

export default function WorktimeLogDialog({ open, onOpenChange, hospitalId }: WorktimeLogDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = (user as any)?.id;

  const today = format(new Date(), "yyyy-MM-dd");
  const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");

  const [editingId, setEditingId] = useState<string | null>(null);
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t("worktime.title", "Work Time")}
          </DialogTitle>
        </DialogHeader>

        {/* Balance Summary */}
        {balance && (
          <div className="grid grid-cols-3 gap-3">
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

        {/* Entry List */}
        <ScrollArea className="flex-1 min-h-0 max-h-[280px] border rounded-lg">
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
                      {format(new Date(entry.workDate + "T00:00:00"), "dd.MM.yyyy")}
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

        {/* Quick Add / Edit Form */}
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
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
              <Input
                type="date"
                value={formData.workDate}
                onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label className="text-xs">{t("worktime.start", "Start")}</Label>
              <Input
                type="time"
                value={formData.timeStart}
                onChange={(e) => setFormData({ ...formData, timeStart: e.target.value })}
                required
              />
            </div>
            <div>
              <Label className="text-xs">{t("worktime.end", "End")}</Label>
              <Input
                type="time"
                value={formData.timeEnd}
                onChange={(e) => setFormData({ ...formData, timeEnd: e.target.value })}
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
