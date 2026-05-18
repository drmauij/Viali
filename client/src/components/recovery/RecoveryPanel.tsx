import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RecoveryCaseCard, type RecoveryCaseRow, type RecoveryStatus } from './RecoveryCaseCard';
import { RecoveryCaseDrawer } from './RecoveryCaseDrawer';

interface Props {
  hospitalId: string;
}

const COLUMNS: { key: RecoveryStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'to_verify', label: 'To Verify' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'rescheduled', label: 'Rescheduled' },
  { key: 'closed_lost', label: 'Closed — Lost' },
  { key: 'closed_other', label: 'Closed — Other' },
];

export function RecoveryPanel({ hospitalId }: Props) {
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

  const grouped = COLUMNS.map((col) => ({
    ...col,
    rows: data.filter((r) => r.status === col.key),
  }));
  const totalOpen = grouped
    .filter((c) => c.key === 'pending' || c.key === 'to_verify' || c.key === 'in_progress')
    .reduce((acc, c) => acc + c.rows.length, 0);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No open recovery cases. Patients who no-show or cancel without rebooking will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {totalOpen} open · {data.length} total
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
