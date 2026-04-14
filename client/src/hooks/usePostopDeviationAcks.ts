import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface DeviationAck {
  id: string;
  anesthesiaRecordId: string;
  parameter: 'pulse' | 'BP' | 'spo2';
  recordedAt: string;
  recordedValue: number;
  boundKind: 'low' | 'high';
  resolvedBy: string;
  resolvedAt: string;
  note: string | null;
  createdAt: string;
}

export function useDeviationAcks(anesthesiaRecordId: string | undefined) {
  const key = [`/api/anesthesia/postop-deviation-acks/${anesthesiaRecordId}`];
  return useQuery<DeviationAck[]>({
    queryKey: key,
    enabled: !!anesthesiaRecordId,
    queryFn: async () => {
      if (!anesthesiaRecordId) return [];
      const res = await apiRequest('GET', key[0]);
      if (!res.ok) throw new Error('Failed to load deviation acks');
      return res.json();
    },
  });
}

export function useResolveDeviation(anesthesiaRecordId: string) {
  const qc = useQueryClient();
  const listKey = [`/api/anesthesia/postop-deviation-acks/${anesthesiaRecordId}`];
  return useMutation<
    DeviationAck,
    Error,
    {
      parameter: 'pulse' | 'BP' | 'spo2';
      recordedAt: string;
      recordedValue: number;
      boundKind: 'low' | 'high';
      note?: string;
    }
  >({
    mutationFn: async (body) => {
      const res = await apiRequest('POST', '/api/anesthesia/postop-deviation-acks', {
        ...body,
        anesthesiaRecordId,
      });
      if (!res.ok) throw new Error('Failed to resolve deviation');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey });
    },
  });
}
