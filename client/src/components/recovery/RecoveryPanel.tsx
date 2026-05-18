import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
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

const ALL_COLUMNS: { key: RecoveryStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'to_verify', label: 'To Verify' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'rescheduled', label: 'Rescheduled' },
  { key: 'closed_lost', label: 'Closed — Lost' },
  { key: 'closed_other', label: 'Closed — Other' },
];

const OPEN_COLUMNS = ALL_COLUMNS.filter(c =>
  c.key === 'pending' || c.key === 'to_verify' || c.key === 'in_progress'
);

export function RecoveryPanel({ hospitalId, compact = false }: Props) {
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const { data = [], isLoading, error } = useQuery<RecoveryCaseRow[]>({
    queryKey: ['recovery-cases', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/recovery-cases`);
      if (!res.ok) throw new Error('Failed to load recovery cases');
      return res.json();
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">Failed to load recovery cases.</p>;
  }

  const columns = compact ? OPEN_COLUMNS : ALL_COLUMNS;
  const grouped = columns.map((col) => ({
    ...col,
    rows: data.filter((r) => r.status === col.key),
  }));
  const totalOpen = ALL_COLUMNS
    .filter((c) => c.key === 'pending' || c.key === 'to_verify' || c.key === 'in_progress')
    .reduce((acc, c) => acc + data.filter((r) => r.status === c.key).length, 0);

  // Empty-state copy is the same in both modes — page hides if there are no
  // cases at all; compact hides if there are no OPEN cases (closed cases are
  // not shown here, so they shouldn't keep the panel populated).
  const visibleCount = compact ? totalOpen : data.length;
  if (visibleCount === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No open recovery cases. Patients who no-show or cancel without rebooking will appear here.
      </p>
    );
  }

  const gridClass = compact
    ? 'grid grid-cols-1 gap-3'
    : 'grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6';

  return (
    <div className={compact ? 'space-y-3 p-3' : 'space-y-4'}>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          {totalOpen} open · {data.length} total
        </p>
      )}
      <div className={gridClass}>
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
