import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDistanceToNow } from 'date-fns';
import { formatDate, formatTime } from '@/lib/dateUtils';
import { apiRequest } from '@/lib/queryClient';

type ContactOutcome = 'reached' | 'no_answer' | 'wants_callback' | 'will_call_back' | 'needs_time';

const OUTCOME_LABELS: Record<ContactOutcome, string> = {
  reached: 'Reached',
  no_answer: 'No answer',
  wants_callback: 'Wants callback',
  will_call_back: 'Will call back',
  needs_time: 'Needs time',
};

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
  const qc = useQueryClient();
  const [note, setNote] = useState('');
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
    mutationFn: async (outcome: ContactOutcome) => {
      const res = await apiRequest(
        'POST',
        `/api/business/${hospitalId}/recovery-cases/${caseId}/contacts`,
        { outcome, note: note.trim() || null },
      );
      return res.json();
    },
    onSuccess: () => { setNote(''); invalidateAll(); },
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
    onSuccess: () => { onClose(); invalidateAll(); },
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
    onSuccess: () => { onClose(); invalidateAll(); },
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
          <SheetTitle>Recovery case</SheetTitle>
        </SheetHeader>

        {isLoading || !data ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="mt-4 space-y-6">
            <section className="space-y-1 text-sm">
              <p className="font-medium">{data.patientFirstName} {data.patientSurname}</p>
              {data.patientPhone && (
                <p>
                  <span className="text-muted-foreground">Phone: </span>
                  <a href={`tel:${data.patientPhone}`} className="text-primary underline">
                    {data.patientPhone}
                  </a>
                </p>
              )}
              {data.patientEmail && (
                <p>
                  <span className="text-muted-foreground">Email: </span>
                  <a href={`mailto:${data.patientEmail}`} className="text-primary underline">
                    {data.patientEmail}
                  </a>
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Original appointment: </span>
                {formatDate(data.appointmentDate)} · {formatTime(data.appointmentStartTime)}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                <Badge variant="outline">{data.status}</Badge>
              </p>
              {data.appointmentCancellationReason && (
                <p>
                  <span className="text-muted-foreground">Cancellation reason: </span>
                  {data.appointmentCancellationReason}
                </p>
              )}
            </section>

            {canLogContact && (
              <section>
                <h4 className="mb-2 text-sm font-medium">Log call</h4>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  className="mb-2"
                  rows={2}
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(Object.keys(OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
                    <Button
                      key={o}
                      variant="outline"
                      size="sm"
                      onClick={() => logContact.mutate(o)}
                      disabled={logContact.isPending}
                    >
                      {OUTCOME_LABELS[o]}
                    </Button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="mb-2 text-sm font-medium">Contact history</h4>
              {(data.contacts ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts logged yet.</p>
              ) : (
                <ul className="space-y-3">
                  {(data.contacts as ContactRow[]).map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="secondary">{c.outcome.replace('_', ' ')}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
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
                    Mark Rescheduled
                  </Button>
                ) : (
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-medium">Pick the new appointment:</p>
                    {futureAppts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No future appointments found for this patient.
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
                              {formatDate(a.appointmentDate)} · {formatTime(a.startTime)}
                              {a.serviceName ? ` · ${a.serviceName}` : ''}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setShowMarkResched(false)}>
                      Cancel
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
                    const reason = window.prompt('Reason for closing as Lost:') ?? '';
                    if (reason) closeCase.mutate({ status: 'closed_lost', closedReason: reason });
                  }}
                >
                  Close as Lost
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const reason = window.prompt('Reason for closing as Other:') ?? '';
                    if (reason) closeCase.mutate({ status: 'closed_other', closedReason: reason });
                  }}
                >
                  Close as Other
                </Button>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
