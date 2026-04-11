import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { OrderSetResponse } from '@/types/postopOrders';
import type { PostopOrderItem } from '@shared/postopOrderItems';

export function usePostopOrderSet(anesthesiaRecordId: string | undefined) {
  const qc = useQueryClient();
  const key = [`/api/anesthesia/records/${anesthesiaRecordId}/postop-orders`];

  const query = useQuery<OrderSetResponse | null>({
    queryKey: key,
    enabled: !!anesthesiaRecordId,
    queryFn: async () => {
      const res = await apiRequest('GET', key[0]);
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async (payload: { items: PostopOrderItem[]; templateId: string | null; sign?: boolean }) => {
      const res = await apiRequest('PUT', key[0], payload);
      return res.json() as Promise<OrderSetResponse>;
    },
    onSuccess: (data) => qc.setQueryData(key, data),
  });

  const markDone = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest('POST', `/api/anesthesia/postop-orders/events/${eventId}/done`, {});
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { ...query, save, markDone };
}
