import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { apiRequest } from '@/lib/queryClient';
import { RecoveryCaseCard, type RecoveryCaseRow, type RecoveryStatus } from './RecoveryCaseCard';
import { RecoveryCaseDrawer } from './RecoveryCaseDrawer';

interface Props {
  hospitalId: string;
  /**
   * compact = side-panel mode on /clinic Appointments: only open columns
   * (pending / to_verify / in_progress), stacked vertically. The full
   * 6-column kanban (with closed columns) renders only on the standalone
   * /business/recovery page.
   */
  compact?: boolean;
}

const ALL_STATUSES: RecoveryStatus[] = [
  'pending', 'to_verify', 'in_progress', 'rescheduled', 'closed_lost', 'closed_other',
];
const OPEN_STATUSES: RecoveryStatus[] = ['pending', 'to_verify', 'in_progress'];

export function RecoveryPanel({ hospitalId, compact = false }: Props) {
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
      <div className="p-3">
        <Tabs defaultValue="pending" className="space-y-3">
          {/* h-auto + flex-wrap lets the tab strip break onto two rows on
              narrow side-panel widths instead of clipping. Each trigger keeps
              its full label + count visible. */}
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
          {OPEN_STATUSES.map((s) => {
            const rows = data.filter((r) => r.status === s);
            return (
              <TabsContent key={s} value={s} className="space-y-2">
                {/* Per-tab one-liner describing what populates this column. Shown
                    whether the list is empty or full so the user always knows
                    what to expect. */}
                <p className="text-xs leading-snug text-muted-foreground">
                  {t(`recovery.compactHelp.${s}`, '')}
                </p>
                {rows.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {t(`recovery.compactEmpty.${s}`, 'No cases in this column.')}
                  </p>
                ) : (
                  rows.map((row) => (
                    <RecoveryCaseCard key={row.id} row={row} hospitalId={hospitalId} onClick={setOpenCaseId} />
                  ))
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <RecoveryCaseDrawer
          caseId={openCaseId}
          hospitalId={hospitalId}
          onClose={() => setOpenCaseId(null)}
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
