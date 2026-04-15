import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface PrnAdminInput {
  anesthesiaRecordId: string;
  itemId: string;        // postop order item id (the PRN item being administered)
  medicationRef: string; // display name, e.g. "Paracetamol"
  dose: string;          // dose amount string, e.g. "1000"
  route: "po" | "iv" | "sc" | "im";
  administeredAt: string; // ISO datetime string
  note?: string;
}

export function useAdministerPrn(anesthesiaRecordId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, PrnAdminInput>({
    mutationFn: async (body) => {
      const res = await apiRequest("POST", "/api/anesthesia/postop-orders/prn-admin", body);
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PRN admin failed: ${res.status} ${t}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // PRN admins write to postop_planned_events — only the order set query needs invalidating
      qc.invalidateQueries({
        queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}/postop-orders`],
      });
    },
  });
}

export function useMarkPostopEventDone(anesthesiaRecordId: string) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { eventId: string; doneValue?: unknown }>({
    mutationFn: async ({ eventId, doneValue }) => {
      const res = await apiRequest(
        "POST",
        `/api/anesthesia/postop-orders/events/${eventId}/done`,
        { doneValue },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Mark done failed: ${res.status} ${t}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Key format from usePostopOrderSet.ts:8
      qc.invalidateQueries({
        queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}/postop-orders`],
      });
    },
  });
}
