import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { PostopOrderItem } from '@shared/postopOrderItems';

export interface TemplateRow {
  id: string;
  hospitalId: string;
  name: string;
  description: string | null;
  items: PostopOrderItem[];
  sortOrder: number;
  procedureCode: string | null;
}

export function usePostopOrderTemplates(hospitalId: string | undefined) {
  const qc = useQueryClient();
  const key = [`/api/anesthesia/postop-orders/templates`, hospitalId];

  const query = useQuery<TemplateRow[]>({
    queryKey: key,
    enabled: !!hospitalId,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/anesthesia/postop-orders/templates?hospitalId=${hospitalId}`);
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<TemplateRow, 'id' | 'sortOrder'> & { sortOrder?: number }) => {
      const res = await apiRequest('POST', '/api/anesthesia/postop-orders/templates', input);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TemplateRow> }) => {
      const res = await apiRequest('PATCH', `/api/anesthesia/postop-orders/templates/${id}`, patch);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/anesthesia/postop-orders/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { ...query, create, update, remove };
}
