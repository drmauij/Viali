import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Repeat, Trash2, CalendarDays } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatShortDate } from '@/lib/dateUtils';
import { ROLE_CONFIG, type StaffPoolEntry } from './PlannedStaffBox';

type StaffRole = StaffPoolEntry['role'];

interface StaffPoolRule {
  id: string;
  hospitalId: string;
  userId?: string | null;
  name: string;
  role: string;
  recurrencePattern: 'daily' | 'weekly' | 'monthly';
  recurrenceDaysOfWeek?: number[] | null;
  recurrenceDaysOfMonth?: number[] | null;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
}

interface StaffRecurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: StaffPoolEntry;
  hospitalId: string;
  selectedDate: Date;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function describeRule(rule: StaffPoolRule, dayLabels: string[]): string {
  if (rule.recurrencePattern === 'daily') return dayLabels === DAY_LABELS_DE ? 'Täglich' : 'Daily';
  if (rule.recurrencePattern === 'weekly' && rule.recurrenceDaysOfWeek) {
    const days = rule.recurrenceDaysOfWeek.sort().map(d => dayLabels[d]).join(', ');
    return days;
  }
  if (rule.recurrencePattern === 'monthly' && rule.recurrenceDaysOfMonth) {
    const days = rule.recurrenceDaysOfMonth.sort((a, b) => a - b).join(', ');
    return dayLabels === DAY_LABELS_DE ? `Monatstage: ${days}` : `Days: ${days}`;
  }
  return rule.recurrencePattern;
}

export default function StaffRecurrenceDialog({ open, onOpenChange, staff, hospitalId, selectedDate }: StaffRecurrenceDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDE = i18n.language?.startsWith('de');
  const dayLabels = isDE ? DAY_LABELS_DE : DAY_LABELS;

  const [pattern, setPattern] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([selectedDate.getDay()]);
  const [selectedMonthDays, setSelectedMonthDays] = useState<number[]>([selectedDate.getDate()]);
  const [startDate, setStartDate] = useState(formatDate(selectedDate));
  const [endDate, setEndDate] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const config = ROLE_CONFIG[staff.role as StaffRole];

  const { data: rules = [] } = useQuery<StaffPoolRule[]>({
    queryKey: ['/api/staff-pool-rules', hospitalId, staff.userId],
    queryFn: async () => {
      const url = staff.userId
        ? `/api/staff-pool-rules/${hospitalId}?userId=${staff.userId}`
        : `/api/staff-pool-rules/${hospitalId}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      const allRules: StaffPoolRule[] = await res.json();
      // For non-user staff, filter by name + role
      if (!staff.userId) {
        return allRules.filter(r => r.name === staff.name && r.role === staff.role);
      }
      return allRules;
    },
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        hospitalId,
        userId: staff.userId || null,
        name: staff.name,
        role: staff.role,
        recurrencePattern: pattern,
        startDate,
        endDate: endDate || null,
      };
      if (pattern === 'weekly') body.recurrenceDaysOfWeek = selectedDays;
      if (pattern === 'monthly') body.recurrenceDaysOfMonth = selectedMonthDays;

      const res = await apiRequest('POST', '/api/staff-pool-rules', body);
      if (!res.ok) throw new Error('Failed to create rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool-rules'] });
      toast({ title: t('common.success'), description: t('staffPool.ruleCreated') });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('staffPool.planError'), variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const res = await apiRequest('DELETE', `/api/staff-pool-rules/${ruleId}`);
      if (!res.ok) throw new Error('Failed to delete rule');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool'] });
      queryClient.invalidateQueries({ queryKey: ['/api/staff-pool-rules'] });
      toast({ title: t('common.success'), description: t('staffPool.ruleDeleted') });
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('staffPool.removeError'), variant: 'destructive' });
      setConfirmDeleteId(null);
    },
  });

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleMonthDay = (day: number) => {
    setSelectedMonthDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const previewText = useMemo(() => {
    let patternText = '';
    if (pattern === 'daily') patternText = t('staffPool.patternDaily').toLowerCase();
    else if (pattern === 'weekly') {
      const days = selectedDays.sort().map(d => dayLabels[d]).join(', ');
      patternText = days || t('staffPool.patternWeekly').toLowerCase();
    } else {
      const days = selectedMonthDays.sort((a, b) => a - b).join(', ');
      patternText = `${t('staffPool.daysOfMonth').toLowerCase()} ${days}`;
    }
    const dateObj = new Date(startDate + 'T12:00:00');
    const dateStr = formatShortDate(dateObj);
    return t('staffPool.rulePreview', { pattern: patternText, date: dateStr });
  }, [pattern, selectedDays, selectedMonthDays, startDate, t, dayLabels]);

  const canCreate = pattern === 'daily' ||
    (pattern === 'weekly' && selectedDays.length > 0) ||
    (pattern === 'monthly' && selectedMonthDays.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            {t('staffPool.recurringRule')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staff info */}
          <div className="flex items-center gap-2">
            <span className="font-medium">{staff.name}</span>
            <Badge variant="secondary" className={`text-xs ${config?.bgClass}`}>
              {t(config?.labelKey || '')}
            </Badge>
          </div>

          {/* Existing rules */}
          {rules.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('staffPool.existingRules')}</Label>
              {rules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{describeRule(rule, dayLabels)}</span>
                    {rule.endDate && (
                      <span className="text-xs text-muted-foreground">
                        → {formatShortDate(new Date(rule.endDate + 'T12:00:00'))}
                      </span>
                    )}
                  </div>
                  {confirmDeleteId === rule.id ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-6 text-xs px-2"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                      >
                        {t('common.confirm')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs px-2"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-1 text-destructive hover:text-destructive"
                      onClick={() => setConfirmDeleteId(rule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Create new rule */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t('staffPool.createRule')}</Label>

            {/* Pattern selection */}
            <div className="flex gap-1">
              {(['daily', 'weekly', 'monthly'] as const).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={pattern === p ? 'default' : 'outline'}
                  className="h-7 text-xs flex-1"
                  onClick={() => setPattern(p)}
                >
                  {t(`staffPool.pattern${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                </Button>
              ))}
            </div>

            {/* Weekly day toggles */}
            {pattern === 'weekly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('staffPool.daysOfWeek')}</Label>
                <div className="flex gap-1">
                  {dayLabels.map((label, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant={selectedDays.includes(i) ? 'default' : 'outline'}
                      className="h-7 w-9 text-xs p-0"
                      onClick={() => toggleDay(i)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly day selection */}
            {pattern === 'monthly' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('staffPool.daysOfMonth')}</Label>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <Button
                      key={day}
                      size="sm"
                      variant={selectedMonthDays.includes(day) ? 'default' : 'outline'}
                      className="h-7 text-xs p-0"
                      onClick={() => toggleMonthDay(day)}
                    >
                      {day}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('staffPool.startDate')}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('staffPool.endDate')}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="h-8 text-xs"
                  placeholder={t('staffPool.noEndDate')}
                />
              </div>
            </div>

            {/* Preview */}
            <p className="text-xs text-muted-foreground italic">{previewText}</p>

            {/* Create button */}
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
              className="w-full h-8 text-sm"
            >
              <Repeat className="h-3.5 w-3.5 mr-1.5" />
              {t('staffPool.createRule')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
