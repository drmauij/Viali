import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/dateUtils';

// to_verify stays in the union because legacy DB rows from the pre-removal
// period may still carry it. New cases never land in to_verify — successor
// detection auto-closes to rescheduled directly.
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
}

interface Props {
  row: RecoveryCaseRow;
  hospitalId: string;
  onClick: (caseId: string) => void;
}

export function RecoveryCaseCard({ row, onClick }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  // Maps the existing lead_contact_outcome enum to the same i18n keys leads uses.
  const outcomeLabel = row.lastContactOutcome
    ? t(`leads.outcome.${toLeadsOutcomeKey(row.lastContactOutcome)}`, row.lastContactOutcome.replace('_', ' '))
    : null;

  return (
    <button
      type="button"
      onClick={() => onClick(row.id)}
      className="block w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:opacity-90"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium">{row.patientFirstName} {row.patientSurname}</span>
        <Badge variant={row.trigger === 'no_show' ? 'destructive' : 'secondary'}>
          {t(`recovery.trigger.${row.trigger}`, row.trigger)}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDate(row.appointmentDate)} · {row.appointmentStartTime}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(row.appointmentDate), { addSuffix: true, locale: dateLocale })}
      </p>

      {outcomeLabel && (
        <p className="mt-2 text-xs">
          {outcomeLabel}
          {row.lastContactAt && ` · ${formatDistanceToNow(new Date(row.lastContactAt), { addSuffix: true, locale: dateLocale })}`}
        </p>
      )}
    </button>
  );
}

// snake_case DB enum → camelCase i18n key (leads.outcome.*)
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
