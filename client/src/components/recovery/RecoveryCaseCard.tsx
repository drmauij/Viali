import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { de, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dateUtils';
import { setDraggedRecoveryCase } from './useRecoveryDrag';

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
  /** Card body click — opens the case detail drawer. */
  onClick: (caseId: string) => void;
  /**
   * "Schedule appointment" button — selects the case for the calendar-book
   * flow. Next calendar slot click opens BookingDialog with the patient
   * pre-filled. Mirrors the lead-panel pattern: card body for detail,
   * dedicated button for scheduling. When omitted (e.g., full kanban page
   * mode), the button is hidden.
   */
  onSchedule?: (row: RecoveryCaseRow) => void;
  isSelected?: boolean;
}

export function RecoveryCaseCard({ row, onClick, onSchedule, isSelected }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  // Maps the existing lead_contact_outcome enum to the same i18n keys leads uses.
  const outcomeLabel = row.lastContactOutcome
    ? t(`leads.outcome.${toLeadsOutcomeKey(row.lastContactOutcome)}`, row.lastContactOutcome.replace('_', ' '))
    : null;

  // Only open / pending / in_progress cases participate in drag-to-book.
  // Closed states (rescheduled / closed_*) are immutable history.
  const isOpen = row.status === 'pending' || row.status === 'in_progress';

  return (
    <div
      className={cn(
        'group relative w-full rounded-md border bg-card p-3 text-left transition-colors',
        isSelected ? 'border-amber-500 ring-2 ring-amber-500/40' : 'border-border',
      )}
      draggable={isOpen}
      onDragStart={(e) => {
        if (!isOpen) return;
        setDraggedRecoveryCase(row);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.id);
      }}
      onDragEnd={() => setDraggedRecoveryCase(null)}
    >
      <div className="flex items-start gap-2">
        {isOpen && (
          <GripVertical
            className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground opacity-50 group-hover:opacity-100"
            aria-hidden="true"
          />
        )}
        <button
          type="button"
          onClick={() => onClick(row.id)}
          className="flex-1 text-left hover:opacity-90"
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
      </div>

      {isOpen && onSchedule && (
        <div className="mt-2 pt-1.5 border-t">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs w-full"
            onClick={(e) => {
              e.stopPropagation();
              onSchedule(row);
            }}
          >
            <CalendarPlus className="h-3.5 w-3.5 mr-1" />
            {t('recovery.card.scheduleAppointment', 'Schedule appointment')}
          </Button>
        </div>
      )}
    </div>
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
