import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ABSENCE_ICONS, ABSENCE_TYPE_LABEL_KEYS } from "@/lib/absenceConstants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, ChevronRight, Clock, Calendar, User, CheckCircle2, HelpCircle, XCircle, CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";
import StaffWorktimeDialog from "./StaffWorktimeDialog";

interface TimeOffEntry {
  id: string;
  providerId: string;
  providerName: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  notes: string | null;
  approvalStatus: string;
  isRecurring: boolean;
  isExpanded?: boolean;
  originalRuleId?: string;
  expandedDate?: string;
}

interface StaffTimeOffTabProps {
  hospitalId: string;
}

type ViewMode = 'list' | 'calendar';

export default function StaffTimeOffTab({ hospitalId }: StaffTimeOffTabProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedEntry, setSelectedEntry] = useState<TimeOffEntry | null>(null);
  const [declineTarget, setDeclineTarget] = useState<TimeOffEntry | null>(null);
  const [worktimeStaff, setWorktimeStaff] = useState<{ id: string; name: string } | null>(null);

  const monthStart = useMemo(() => {
    return `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-01`;
  }, [currentMonth]);

  const monthEnd = useMemo(() => {
    const last = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  }, [currentMonth]);

  const { data: timeOffs = [], isLoading } = useQuery<TimeOffEntry[]>({
    queryKey: [`/api/business/${hospitalId}/time-off`, monthStart, monthEnd],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/time-off?startDate=${monthStart}&endDate=${monthEnd}&expand=true`);
      if (!res.ok) throw new Error('Failed to fetch time-off');
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ timeOffId, status }: { timeOffId: string; status: 'approved' | 'declined' }) => {
      return apiRequest('PATCH', `/api/business/${hospitalId}/time-off/${timeOffId}/approve`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/time-off`] });
      toast({ title: t('common.success'), description: t('business.staff.timeOffUpdated') });
      setSelectedEntry(null);
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const locale = i18n.language === 'de' ? 'de-DE' : 'en-US';

  // Deduplicate expanded entries for list view
  const sortedEntries = useMemo(() => {
    const groups = new Map<string, TimeOffEntry[]>();
    for (const entry of timeOffs) {
      const key = entry.originalRuleId || entry.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const merged: TimeOffEntry[] = [];
    for (const [, entries] of groups) {
      const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      merged.push({ ...first, startDate: first.startDate, endDate: last.endDate });
    }

    return merged.sort((a, b) => {
      if (a.approvalStatus === 'pending' && b.approvalStatus !== 'pending') return -1;
      if (a.approvalStatus !== 'pending' && b.approvalStatus === 'pending') return 1;
      return a.startDate.localeCompare(b.startDate);
    });
  }, [timeOffs]);

  // Calendar view data: weekdays + providers grouped with per-day entries
  const weekdays = useMemo(() => {
    const days: Date[] = [];
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const current = new Date(currentMonth);
    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  const providers = useMemo(() => {
    const map = new Map<string, { name: string; entries: TimeOffEntry[] }>();
    for (const entry of timeOffs) {
      if (!map.has(entry.providerId)) {
        map.set(entry.providerId, { name: entry.providerName, entries: [] });
      }
      map.get(entry.providerId)!.entries.push(entry);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [timeOffs]);

  const weekSeparators = useMemo(() => {
    const seps = new Set<number>();
    for (let i = 1; i < weekdays.length; i++) {
      if (weekdays[i].getDay() === 1) seps.add(i - 1);
    }
    return seps;
  }, [weekdays]);

  const formatDateStr = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getEntryForDay = (entries: TimeOffEntry[], day: Date): TimeOffEntry | null => {
    const dayStr = formatDateStr(day);
    return entries.find(e => dayStr >= e.startDate && dayStr <= e.endDate) || null;
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const monthLabel = useMemo(() => {
    return currentMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }, [currentMonth, locale]);

  const handleApprove = (entry: TimeOffEntry) => {
    const id = entry.originalRuleId || entry.id;
    approveMutation.mutate({ timeOffId: id, status: 'approved' });
  };

  const handleDeclineConfirm = () => {
    if (!declineTarget) return;
    const id = declineTarget.originalRuleId || declineTarget.id;
    approveMutation.mutate({ timeOffId: id, status: 'declined' });
    setDeclineTarget(null);
  };

  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    if (start === end) {
      return s.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
    }
    return `${s.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} – ${e.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  };

  const getReasonLabel = (reason: string | null) => {
    const key = reason || 'default';
    const entry = ABSENCE_TYPE_LABEL_KEYS[key] || ABSENCE_TYPE_LABEL_KEYS.default;
    return t(entry.key, entry.fallback);
  };

  const getReasonIcon = (reason: string | null) => {
    return ABSENCE_ICONS[reason || 'default'] || ABSENCE_ICONS.default;
  };

  const pendingCount = sortedEntries.filter(e => e.approvalStatus === 'pending').length;

  const dayLabels = i18n.language === 'de'
    ? ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', '', '']
    : ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', '', ''];

  const hasData = viewMode === 'list' ? sortedEntries.length > 0 : providers.length > 0;

  return (
    <div className="space-y-4">
      {/* Month navigation + view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center">{monthLabel}</h2>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center border rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('calendar')}
            className={cn(
              "p-2 transition-colors",
              viewMode === 'calendar' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
            title={t('business.staff.calendarView', 'Calendar view')}
          >
            <CalendarDays className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              "p-2 transition-colors",
              viewMode === 'list' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
            title={t('business.staff.listView', 'List view')}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-sm">
          <HelpCircle className="h-4 w-4 text-orange-500 shrink-0" />
          <span>
            {pendingCount === 1
              ? t('business.staff.onePendingRequest', '1 request pending approval')
              : t('business.staff.pendingRequests', '{{count}} requests pending approval', { count: pendingCount })}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : !hasData ? (
        <div className="text-center py-8 text-muted-foreground">{t('business.staff.noTimeOffRequests')}</div>
      ) : viewMode === 'calendar' ? (
        /* ===== CALENDAR VIEW ===== */
        <div className="overflow-x-auto border rounded-lg pb-2 scrollbar-hide">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="sticky left-0 z-20 bg-muted text-left px-3 py-2 min-w-[140px] border-r border-border font-medium">
                  {t('business.staff.name')}
                </th>
                {weekdays.map((day, idx) => (
                  <th
                    key={idx}
                    className={cn(
                      "px-1 py-1.5 text-center min-w-[44px] font-normal text-xs border-l border-border",
                      weekSeparators.has(idx) && "border-r-2 border-r-muted-foreground/30"
                    )}
                  >
                    <div className="text-muted-foreground">{dayLabels[day.getDay()]}</div>
                    <div className="font-medium">{day.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {providers.map(([providerId, { name, entries }]) => (
                <tr key={providerId} className="border-t border-border">
                  <td
                    className="sticky left-0 z-10 bg-background px-3 py-2 border-r border-border font-medium truncate max-w-[180px] cursor-pointer hover:text-primary hover:underline"
                    onClick={() => setWorktimeStaff({ id: providerId, name })}
                  >
                    {name}
                  </td>
                  {weekdays.map((day, idx) => {
                    const entry = getEntryForDay(entries, day);
                    const isPending = entry?.approvalStatus === 'pending';
                    const isApproved = entry?.approvalStatus === 'approved';
                    const isDeclined = entry?.approvalStatus === 'declined';

                    return (
                      <td
                        key={idx}
                        className={cn(
                          "px-0.5 py-1 text-center border-l border-border relative",
                          weekSeparators.has(idx) && "border-r-2 border-r-muted-foreground/30",
                          entry && !isDeclined && "cursor-pointer hover:brightness-110",
                          entry && isDeclined && "cursor-pointer"
                        )}
                        onClick={() => entry && setSelectedEntry(entry)}
                      >
                        {entry && (
                          <div
                            className={cn(
                              "mx-auto w-8 h-8 rounded-md flex flex-col items-center justify-center",
                              isPending && "bg-orange-500/20 ring-1 ring-orange-500/50",
                              isApproved && "bg-green-500/20 ring-1 ring-green-500/40",
                              isDeclined && "bg-red-500/10 ring-1 ring-red-500/30 opacity-50"
                            )}
                            title={`${name} – ${getReasonLabel(entry.reason)}${entry.startTime ? ` (${entry.startTime}–${entry.endTime})` : ''}`}
                          >
                            <span className="text-sm leading-none">{getReasonIcon(entry.reason)}</span>
                            {isPending && <span className="text-[8px] leading-none text-orange-500 font-bold">!</span>}
                            {isApproved && <span className="text-[8px] leading-none text-green-500">✓</span>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ===== LIST VIEW ===== */
        <div className="space-y-2">
          {sortedEntries.map((entry) => {
            const isPending = entry.approvalStatus === 'pending';
            const isApproved = entry.approvalStatus === 'approved';
            const isDeclined = entry.approvalStatus === 'declined';
            const isFullDay = !entry.startTime && !entry.endTime;

            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                  isPending && "border-orange-500/40 bg-orange-500/5",
                  isApproved && "border-border",
                  isDeclined && "border-border opacity-60"
                )}
                onClick={() => setSelectedEntry(entry)}
              >
                <span className="text-xl shrink-0">{getReasonIcon(entry.reason)}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{entry.providerName}</span>
                    {isPending && (
                      <Badge variant="outline" className="border-orange-500 text-orange-500 text-[10px] px-1.5 py-0">
                        {t('business.staff.pending', 'Pending')}
                      </Badge>
                    )}
                    {isApproved && (
                      <Badge variant="outline" className="border-green-500 text-green-500 text-[10px] px-1.5 py-0">
                        {t('business.staff.approved', 'Approved')}
                      </Badge>
                    )}
                    {isDeclined && (
                      <Badge variant="outline" className="border-red-500 text-red-500 text-[10px] px-1.5 py-0">
                        {t('business.staff.declined', 'Declined')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDateRange(entry.startDate, entry.endDate)}
                    {!isFullDay && <span className="ml-2">{entry.startTime} – {entry.endTime}</span>}
                    {isFullDay && <span className="ml-2">{t('business.staff.fullDay', 'Full day')}</span>}
                  </div>
                </div>

                <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                  {getReasonLabel(entry.reason)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      )}

      {/* Detail dialog (shared by both views) */}
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        {selectedEntry && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-xl">{getReasonIcon(selectedEntry.reason)}</span>
                {getReasonLabel(selectedEntry.reason)}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="flex items-center gap-1.5 pt-1">
                  {selectedEntry.approvalStatus === 'pending' && (
                    <Badge variant="outline" className="border-orange-500 text-orange-500 gap-1">
                      <HelpCircle className="h-3 w-3" />
                      {t('business.staff.pendingApproval', 'Pending approval')}
                    </Badge>
                  )}
                  {selectedEntry.approvalStatus === 'approved' && (
                    <Badge variant="outline" className="border-green-500 text-green-500 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('business.staff.approved', 'Approved')}
                    </Badge>
                  )}
                  {selectedEntry.approvalStatus === 'declined' && (
                    <Badge variant="outline" className="border-red-500 text-red-500 gap-1">
                      <XCircle className="h-3 w-3" />
                      {t('business.staff.declined', 'Declined')}
                    </Badge>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">{t('business.staff.provider', 'Provider')}</div>
                  <div className="text-sm font-medium">{selectedEntry.providerName}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">{t('common.date', 'Date')}</div>
                  <div className="text-sm">{formatDateRange(selectedEntry.startDate, selectedEntry.endDate)}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">{t('common.time', 'Time')}</div>
                  <div className="text-sm">
                    {selectedEntry.startTime && selectedEntry.endTime
                      ? `${selectedEntry.startTime} – ${selectedEntry.endTime}`
                      : t('business.staff.fullDay', 'Full day')}
                  </div>
                </div>
              </div>

              {selectedEntry.notes && (
                <div className="px-3 py-2 rounded bg-muted/50 text-sm">
                  {selectedEntry.notes}
                </div>
              )}
            </div>

            <DialogFooter>
              {selectedEntry.approvalStatus === 'pending' ? (
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => {
                      setDeclineTarget(selectedEntry);
                      setSelectedEntry(null);
                    }}
                    disabled={approveMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {t('business.staff.decline', 'Decline')}
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(selectedEntry)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('business.staff.approve', 'Approve')}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => setSelectedEntry(null)} className="w-full">
                  {t('common.close', 'Close')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Decline confirmation dialog */}
      <AlertDialog open={!!declineTarget} onOpenChange={(open) => !open && setDeclineTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('business.staff.declineTimeOff')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('business.staff.confirmDecline')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeclineConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('business.staff.declineTimeOff')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Staff worktime detail dialog */}
      {worktimeStaff && (
        <StaffWorktimeDialog
          open={!!worktimeStaff}
          onOpenChange={(open) => !open && setWorktimeStaff(null)}
          hospitalId={hospitalId}
          staffId={worktimeStaff.id}
          staffName={worktimeStaff.name}
        />
      )}
    </div>
  );
}
