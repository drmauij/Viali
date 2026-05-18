import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate, formatTime } from '@/lib/dateUtils';

export type RecoveryStatus =
  | 'pending' | 'to_verify' | 'in_progress'
  | 'rescheduled' | 'closed_lost' | 'closed_other';

export interface RecoveryCaseRow {
  id: string;
  status: RecoveryStatus;
  trigger: 'no_show' | 'cancelled';
  createdAt: string;
  appointmentId: string;
  appointmentDate: string;
  appointmentStartTime: string;
  appointmentServiceId: string | null;
  appointmentProviderId: string;
  patientId: string;
  patientFirstName: string;
  patientSurname: string;
  patientPhone: string | null;
  patientEmail: string | null;
  rescheduledAppointmentId: string | null;
  contactCount: number;
  lastContactOutcome: string | null;
  lastContactAt: string | null;
  successor?: {
    id: string;
    appointmentDate: string;
    startTime: string;
    serviceId: string | null;
    providerId: string;
  };
  verifyConfidence?: 'high' | 'medium' | 'low';
}

const CONFIDENCE_STYLE: Record<'high' | 'medium' | 'low', { label: string; className: string }> = {
  high:   { label: 'Likely rebook',                          className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200' },
  medium: { label: 'Probable rebook',                        className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200' },
  low:    { label: 'Verify carefully — different service',   className: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200' },
};

interface Props {
  row: RecoveryCaseRow;
  hospitalId: string;
  onClick: (caseId: string) => void;
}

export function RecoveryCaseCard({ row, hospitalId, onClick }: Props) {
  const qc = useQueryClient();
  const verifyMutation = useMutation({
    mutationFn: async (newStatus: 'rescheduled' | 'pending') => {
      const res = await fetch(`/api/business/${hospitalId}/recovery-cases/${row.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recovery-cases', hospitalId] });
      qc.invalidateQueries({ queryKey: ['recovery-cases-stats', hospitalId] });
    },
  });

  const isVerify = row.status === 'to_verify';
  const confidence = row.verifyConfidence;

  return (
    <div className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors">
      <button
        type="button"
        onClick={() => onClick(row.id)}
        className="block w-full text-left hover:opacity-90"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-medium">{row.patientFirstName} {row.patientSurname}</span>
          <Badge variant={row.trigger === 'no_show' ? 'destructive' : 'secondary'}>
            {row.trigger === 'no_show' ? 'No-show' : 'Cancelled'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDate(row.appointmentDate)} · {formatTime(row.appointmentStartTime)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(row.appointmentDate), { addSuffix: true })}
        </p>

        {isVerify && row.successor && confidence && (
          <div className="mt-3 rounded-md border border-dashed border-border p-2">
            <p className="text-xs font-medium text-muted-foreground">New appointment:</p>
            <p className="text-sm">
              {formatDate(row.successor.appointmentDate)} · {formatTime(row.successor.startTime)}
            </p>
            <span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs ${CONFIDENCE_STYLE[confidence].className}`}>
              {CONFIDENCE_STYLE[confidence].label}
            </span>
          </div>
        )}

        {row.lastContactOutcome && (
          <p className="mt-2 text-xs">
            {row.lastContactOutcome.replace('_', ' ')}
            {row.lastContactAt && ` · ${formatDistanceToNow(new Date(row.lastContactAt), { addSuffix: true })}`}
          </p>
        )}
      </button>

      {isVerify && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); verifyMutation.mutate('rescheduled'); }}
            disabled={verifyMutation.isPending}
          >
            ✓ Confirm rebook
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); verifyMutation.mutate('pending'); }}
            disabled={verifyMutation.isPending}
          >
            ↻ Re-open
          </Button>
        </div>
      )}
    </div>
  );
}
