import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import { formatDate } from '@/lib/dateUtils';
import { apiRequest } from '@/lib/queryClient';

type ContactOutcome = 'reached' | 'no_answer' | 'wants_callback' | 'will_call_back' | 'needs_time';

const OUTCOME_OPTIONS: { value: ContactOutcome; i18nKey: string }[] = [
  { value: 'reached',        i18nKey: 'leads.outcome.reached' },
  { value: 'no_answer',      i18nKey: 'leads.outcome.noAnswer' },
  { value: 'wants_callback', i18nKey: 'leads.outcome.wantsCallback' },
  { value: 'will_call_back', i18nKey: 'leads.outcome.willCallBack' },
  { value: 'needs_time',     i18nKey: 'leads.outcome.needsTime' },
];

interface FutureAppointment {
  id: string;
  appointmentDate: string;
  startTime: string;
  serviceId: string | null;
  serviceName: string | null;
}

interface ContactRow {
  id: string;
  outcome: ContactOutcome;
  note: string | null;
  createdAt: string;
  createdByName?: string | null;
}

interface Props {
  caseId: string | null;
  hospitalId: string;
  onClose: () => void;
}

export function RecoveryCaseDrawer({ caseId, hospitalId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === 'de' ? de : enUS;
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<ContactOutcome | ''>('');
  const [showMarkResched, setShowMarkResched] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['recovery-case', hospitalId, caseId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/business/${hospitalId}/recovery-cases/${caseId}`);
      return res.json();
    },
    enabled: !!caseId,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['recovery-case', hospitalId, caseId] });
    qc.invalidateQueries({ queryKey: ['recovery-cases', hospitalId] });
    qc.invalidateQueries({ queryKey: ['recovery-cases-stats', hospitalId] });
  };

  const logContact = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error('outcome required');
      const res = await apiRequest(
        'POST',
        `/api/business/${hospitalId}/recovery-cases/${caseId}/contacts`,
        { outcome, note: note.trim() || null },
      );
      return res.json();
    },
    onSuccess: () => {
      setNote('');
      setOutcome('');
      toast({ title: t('recovery.toast.contactLogged', 'Contact logged') });
      invalidateAll();
    },
    onError: () => {
      toast({ title: t('recovery.toast.errorLogging', 'Failed to log contact'), variant: 'destructive' });
    },
  });

  const closeCase = useMutation({
    mutationFn: async ({ status, closedReason }: { status: 'closed_lost' | 'closed_other'; closedReason: string }) => {
      const res = await apiRequest(
        'PATCH',
        `/api/business/${hospitalId}/recovery-cases/${caseId}/status`,
        { status, closedReason },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('recovery.toast.caseUpdated', 'Case updated') });
      onClose();
      invalidateAll();
    },
    onError: () => {
      toast({ title: t('recovery.toast.errorUpdating', 'Failed to update case'), variant: 'destructive' });
    },
  });

  const markRescheduled = useMutation({
    mutationFn: async (rescheduledAppointmentId: string) => {
      const res = await apiRequest(
        'PATCH',
        `/api/business/${hospitalId}/recovery-cases/${caseId}/status`,
        { status: 'rescheduled', rescheduledAppointmentId },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('recovery.toast.caseUpdated', 'Case updated') });
      onClose();
      invalidateAll();
    },
    onError: () => {
      toast({ title: t('recovery.toast.errorUpdating', 'Failed to update case'), variant: 'destructive' });
    },
  });

  const { data: futureAppts = [] } = useQuery<FutureAppointment[]>({
    queryKey: ['patient-future-appointments', data?.patientId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/business/${hospitalId}/patients/${data!.patientId}/future-appointments`);
      return res.json();
    },
    enabled: showMarkResched && !!data?.patientId,
  });

  const open = !!caseId;
  const canLogContact = data ? ['pending', 'to_verify', 'in_progress'].includes(data.status) : false;
  const canClose = canLogContact;
  const canMarkRescheduled = data ? ['pending', 'in_progress'].includes(data.status) : false;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('recovery.drawer.title', 'Recovery case')}</SheetTitle>
        </SheetHeader>

        {isLoading || !data ? (
          <p className="mt-4 text-sm text-muted-foreground">…</p>
        ) : (
          <div className="mt-4 space-y-6">
            <section className="space-y-1 text-sm">
              <p className="font-medium">{data.patientFirstName} {data.patientSurname}</p>
              {data.patientPhone && (
                <p>
                  <span className="text-muted-foreground">{t('recovery.drawer.phone', 'Phone')}: </span>
                  <a href={`tel:${data.patientPhone}`} className="text-primary underline">
                    {data.patientPhone}
                  </a>
                </p>
              )}
              {data.patientEmail && (
                <p>
                  <span className="text-muted-foreground">{t('recovery.drawer.email', 'Email')}: </span>
                  <a href={`mailto:${data.patientEmail}`} className="text-primary underline">
                    {data.patientEmail}
                  </a>
                </p>
              )}
              <p>
                <span className="text-muted-foreground">{t('recovery.drawer.originalAppointment', 'Original appointment')}: </span>
                {formatDate(data.appointmentDate)} · {data.appointmentStartTime}
              </p>
              <p>
                <span className="text-muted-foreground">{t('recovery.drawer.status', 'Status')}: </span>
                <Badge variant="outline">{String(t(`recovery.status.${data.status}`, data.status))}</Badge>
              </p>
              {data.appointmentCancellationReason && (
                <p>
                  <span className="text-muted-foreground">{t('recovery.drawer.cancellationReason', 'Cancellation reason')}: </span>
                  {data.appointmentCancellationReason}
                </p>
              )}
            </section>

            {canLogContact && (
              <section className="space-y-3 pt-2 border-t">
                <Label className="text-xs text-muted-foreground">{t('recovery.drawer.logCall', 'Log call')}</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as ContactOutcome)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('recovery.drawer.selectOutcome', 'Select outcome...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTCOME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {t(o.i18nKey, o.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('recovery.drawer.optionalNote', 'Optional note...')}
                  rows={2}
                />
                <Button
                  onClick={() => logContact.mutate()}
                  disabled={!outcome || logContact.isPending}
                  className="w-full"
                >
                  {t('recovery.drawer.logButton', 'Log')}
                </Button>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-sm font-medium">{t('recovery.drawer.contactHistory', 'Contact history')}</h4>
              {(data.contacts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('recovery.drawer.noContacts', 'No contacts logged yet.')}</p>
              ) : (
                <ul className="space-y-3">
                  {(data.contacts as ContactRow[]).map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">{t(`leads.outcome.${toLeadsOutcomeKey(c.outcome)}`, c.outcome.replace('_', ' '))}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: dateLocale })}
                          {c.createdByName ? ` · ${c.createdByName}` : ''}
                        </span>
                      </div>
                      {c.note && <p className="text-sm">{c.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {canMarkRescheduled && (
              <section>
                {!showMarkResched ? (
                  <Button variant="outline" className="w-full" onClick={() => setShowMarkResched(true)}>
                    {t('recovery.drawer.markRescheduled', 'Mark Rescheduled')}
                  </Button>
                ) : (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-medium">{t('recovery.drawer.pickAppointment', 'Pick the new appointment:')}</p>
                    {futureAppts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('recovery.drawer.noFuture', 'No future appointments found for this patient.')}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {futureAppts.map((a) => (
                          <li key={a.id}>
                            <Button
                              variant="ghost"
                              className="w-full justify-start"
                              onClick={() => markRescheduled.mutate(a.id)}
                              disabled={markRescheduled.isPending}
                            >
                              {formatDate(a.appointmentDate)} · {a.startTime}
                              {a.serviceName ? ` · ${a.serviceName}` : ''}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setShowMarkResched(false)}>
                      {t('recovery.drawer.cancel', 'Cancel')}
                    </Button>
                  </div>
                )}
              </section>
            )}

            {canClose && (
              <section className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const reason = window.prompt(t('recovery.drawer.promptLostReason', 'Reason for closing as Lost:')) ?? '';
                    if (reason) closeCase.mutate({ status: 'closed_lost', closedReason: reason });
                  }}
                >
                  {t('recovery.drawer.closeLost', 'Close as Lost')}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const reason = window.prompt(t('recovery.drawer.promptOtherReason', 'Reason for closing as Other:')) ?? '';
                    if (reason) closeCase.mutate({ status: 'closed_other', closedReason: reason });
                  }}
                >
                  {t('recovery.drawer.closeOther', 'Close as Other')}
                </Button>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function toLeadsOutcomeKey(outcome: string): string {
  switch (outcome) {
    case 'reached':         return 'reached';
    case 'no_answer':       return 'noAnswer';
    case 'wants_callback':  return 'wantsCallback';
    case 'will_call_back':  return 'willCallBack';
    case 'needs_time':      return 'needsTime';
    default:                return outcome;
  }
}
