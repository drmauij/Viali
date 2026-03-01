import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ABSENCE_COLORS, ABSENCE_ICONS } from "@/lib/absenceConstants";
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
import { ChevronLeft, ChevronRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function StaffTimeOffTab({ hospitalId }: StaffTimeOffTabProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [declineTarget, setDeclineTarget] = useState<TimeOffEntry | null>(null);

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
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  // Generate weekdays for the month
  const weekdays = useMemo(() => {
    const days: Date[] = [];
    const start = new Date(currentMonth);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) {
        days.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  // Group time-offs by provider
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

  const formatDate = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getEntryForDay = (entries: TimeOffEntry[], day: Date): TimeOffEntry | null => {
    const dayStr = formatDate(day);
    return entries.find(e => dayStr >= e.startDate && dayStr <= e.endDate) || null;
  };

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  const monthLabel = useMemo(() => {
    return currentMonth.toLocaleDateString(i18n.language === 'de' ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric' });
  }, [currentMonth, i18n.language]);

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

  // Find week boundaries for separators
  const weekSeparators = useMemo(() => {
    const seps = new Set<number>();
    for (let i = 1; i < weekdays.length; i++) {
      if (weekdays[i].getDay() === 1) {
        seps.add(i - 1);
      }
    }
    return seps;
  }, [weekdays]);

  const dayLabels = ['', 'Mo', 'Tu', 'We', 'Th', 'Fr', '', ''];
  const deDayLabels = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', '', ''];

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[200px] text-center">{monthLabel}</h2>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">{t('business.staff.noTimeOffRequests')}</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 text-left px-3 py-2 min-w-[140px] border-r font-medium">
                  {t('business.staff.name')}
                </th>
                {weekdays.map((day, idx) => {
                  const labels = i18n.language === 'de' ? deDayLabels : dayLabels;
                  return (
                    <th
                      key={idx}
                      className={cn(
                        "px-1 py-1 text-center min-w-[36px] font-normal text-xs",
                        weekSeparators.has(idx) && "border-r-2 border-muted-foreground/20"
                      )}
                    >
                      <div>{labels[day.getDay()]}</div>
                      <div className="text-muted-foreground">{day.getDate()}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {providers.map(([providerId, { name, entries }]) => (
                <tr key={providerId} className="border-t hover:bg-muted/30">
                  <td className="sticky left-0 z-10 bg-background px-3 py-1.5 border-r font-medium truncate max-w-[180px]">
                    {name}
                  </td>
                  {weekdays.map((day, idx) => {
                    const entry = getEntryForDay(entries, day);
                    const isPending = entry?.approvalStatus === 'pending';
                    const isApproved = entry?.approvalStatus === 'approved';

                    return (
                      <td
                        key={idx}
                        className={cn(
                          "px-0.5 py-0.5 text-center relative",
                          weekSeparators.has(idx) && "border-r-2 border-muted-foreground/20",
                          entry && (ABSENCE_COLORS[entry.reason || 'default'] || ABSENCE_COLORS.default)
                        )}
                      >
                        {entry && (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-xs leading-none">
                              {ABSENCE_ICONS[entry.reason || 'default'] || ABSENCE_ICONS.default}
                            </span>
                            {isPending && (
                              <div className="flex gap-0.5">
                                <button
                                  onClick={() => handleApprove(entry)}
                                  className="text-green-600 hover:text-green-800 rounded p-0.5 hover:bg-green-100 dark:hover:bg-green-900/30"
                                  title={t('business.staff.approveTimeOff')}
                                  disabled={approveMutation.isPending}
                                >
                                  <Check className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => setDeclineTarget(entry)}
                                  className="text-red-600 hover:text-red-800 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30"
                                  title={t('business.staff.declineTimeOff')}
                                  disabled={approveMutation.isPending}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            {isApproved && (
                              <span className="text-[10px] leading-none">{'\u2705'}</span>
                            )}
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
      )}

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
    </div>
  );
}
