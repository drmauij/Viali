import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiRequest } from '@/lib/queryClient';
import { RecoveryCaseCard, type RecoveryCaseRow, type RecoveryStatus } from './RecoveryCaseCard';
import { RecoveryCaseDrawer } from './RecoveryCaseDrawer';

interface Props {
  hospitalId: string;
  /**
   * compact = side-panel mode on /clinic Appointments: only open columns
   * (pending / in_progress), stacked vertically. The full kanban (with
   * closed columns) renders only on the standalone /business/recovery
   * page.
   */
  compact?: boolean;
  /**
   * Tap-to-select wiring for the calendar-book flow on Appointments. When
   * the user taps a card, this row becomes the active selection; the next
   * calendar slot click opens BookingDialog with the patient pre-filled.
   * Omit when the panel is used standalone (e.g., /business/recovery).
   */
  selectedCaseId?: string | null;
  onCaseTap?: (row: RecoveryCaseRow) => void;
  /**
   * Forwarded to RecoveryCaseDrawer's Book Appointment button. Receives
   * `{ patientId, patientName }` so the parent can open BookingDialog
   * pre-filled.
   */
  onBookForPatient?: (patient: { patientId: string; patientName: string }) => void;
}

// to_verify exists as a legacy enum value but is no longer surfaced — when a
// patient is detected to have a future appointment, the case is auto-closed
// to 'rescheduled' directly. The single review step that used to live here
// added confusion without enough value.
const ALL_STATUSES: RecoveryStatus[] = [
  'pending', 'in_progress', 'rescheduled', 'closed_lost', 'closed_other',
];
const OPEN_STATUSES: RecoveryStatus[] = ['pending', 'in_progress'];

export function RecoveryPanel({ hospitalId, compact = false, selectedCaseId, onCaseTap, onBookForPatient }: Props) {
  const { t } = useTranslation();
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery<RecoveryCaseRow[]>({
    queryKey: ['recovery-cases', hospitalId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/business/${hospitalId}/recovery-cases`);
      return res.json();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{t('recovery.loadFailed', 'Failed to load recovery cases.')}</p>;
  }

  const totalOpen = OPEN_STATUSES.reduce(
    (acc, s) => acc + data.filter((r) => r.status === s).length,
    0,
  );

  const visibleCount = compact ? totalOpen : data.length;
  if (visibleCount === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        {t('recovery.empty', 'No open recovery cases. Patients who no-show or cancel without rebooking will appear here.')}
      </p>
    );
  }

  // Compact (side-panel) mode: tabs strip + flat list, matching the Leads
  // side-panel UX. Page (kanban) mode renders all 6 status columns side by side.
  if (compact) {
    return (
      <div className="flex h-full flex-col">
        <Tabs defaultValue="pending" className="flex h-full flex-col">
          {/* Fixed header — the tab strip — does NOT scroll. h-auto +
              flex-wrap lets it break onto two rows on narrow widths
              instead of clipping. */}
          <div className="border-b border-border px-3 pt-3 pb-2">
            <TabsList className="flex h-auto w-full flex-wrap gap-1 p-1">
              {OPEN_STATUSES.map((s) => {
                const count = data.filter((r) => r.status === s).length;
                return (
                  <TabsTrigger
                    key={s}
                    value={s}
                    className="flex-1 whitespace-nowrap text-xs min-w-0"
                  >
                    {t(`recovery.column.${s}`, s)}
                    {count > 0 && <span className="ml-1 text-muted-foreground">({count})</span>}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          {/* ScrollArea (Radix) gives the same thin themed scrollbar the
              leads panel uses, instead of the OS default. flex-1 makes it
              consume remaining vertical space inside the panel. */}
          <ScrollArea className="flex-1">
            {OPEN_STATUSES.map((s) => {
              const rows = data.filter((r) => r.status === s);
              return (
                <TabsContent key={s} value={s} className="m-0 space-y-2 p-3">
                  <p className="text-xs leading-snug text-muted-foreground">
                    {t(`recovery.compactHelp.${s}`, '')}
                  </p>
                  {rows.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      {t(`recovery.compactEmpty.${s}`, 'No cases in this column.')}
                    </p>
                  ) : (
                    rows.map((row) => (
                      <RecoveryCaseCard
                        key={row.id}
                        row={row}
                        hospitalId={hospitalId}
                        onClick={setOpenCaseId}
                        onTap={onCaseTap}
                        isSelected={selectedCaseId === row.id}
                      />
                    ))
                  )}
                </TabsContent>
              );
            })}
          </ScrollArea>
        </Tabs>

        <RecoveryCaseDrawer
          caseId={openCaseId}
          hospitalId={hospitalId}
          onClose={() => setOpenCaseId(null)}
          onBookForPatient={onBookForPatient}
        />
      </div>
    );
  }

  // Full kanban — used on /business/recovery.
  const grouped = ALL_STATUSES.map((key) => ({
    key,
    label: t(`recovery.column.${key}`, key),
    rows: data.filter((r) => r.status === key),
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('recovery.openTotal', '{{open}} open · {{total}} total', { open: totalOpen, total: data.length })}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {grouped.map((col) => (
          <div key={col.key} className="rounded-md border border-border bg-muted/40 p-3">
            <h2 className="mb-3 flex items-center justify-between text-sm font-medium">
              <span>{col.label}</span>
              <span className="text-muted-foreground">({col.rows.length})</span>
            </h2>
            <div className="space-y-2">
              {col.rows.map((row) => (
                <RecoveryCaseCard key={row.id} row={row} hospitalId={hospitalId} onClick={setOpenCaseId} />
              ))}
              {col.rows.length === 0 && (
                <p className="text-xs text-muted-foreground">—</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <RecoveryCaseDrawer
        caseId={openCaseId}
        hospitalId={hospitalId}
        onClose={() => setOpenCaseId(null)}
      />
    </div>
  );
}
