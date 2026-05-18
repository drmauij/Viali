import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface RecoveryStats {
  pending: number;
  to_verify: number;
  in_progress: number;
  rescheduled: number;
  closed_lost: number;
  closed_other: number;
  open_total: number;
}

/**
 * Small inline badge showing the count of open recovery cases (pending +
 * to_verify + in_progress) for the active hospital. Mirrors LeadsBadge.
 * Returns null when the count is 0 or hospital is not loaded.
 */
export function RecoveryBadge() {
  const { user } = useAuth();
  const hospitalId = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    const savedKey = localStorage.getItem('activeHospital');
    if (savedKey) {
      const saved = userHospitals.find((h: any) => `${h.id}-${h.unitId}-${h.role}` === savedKey);
      if (saved) return saved.id;
    }
    return userHospitals[0]?.id ?? null;
  }, [user]);

  const { data } = useQuery<RecoveryStats>({
    queryKey: ['recovery-cases-stats', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/business/${hospitalId}/recovery-cases-stats`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!hospitalId,
    refetchInterval: 60_000,
  });

  if (!data || data.open_total === 0) return null;
  return (
    <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
      {data.open_total}
    </Badge>
  );
}
