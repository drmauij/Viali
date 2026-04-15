import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Approach (B): client must supply itemsId and groupId explicitly because
// MedicationItem only stores medicationRef (free text) + dose string — no
// inventory FK or administration group FK is embedded in the order-set item.
//
// The server adminSchema field for the dose amount is called "dose" (not "quantity"),
// so this interface mirrors that exactly.
export interface PrnAdminInput {
  anesthesiaRecordId: string;
  itemId: string;        // postop order item id (for PRN tracking client-side)
  itemsId: string;       // inventory items.id FK — resolved by the caller
  groupId: string;       // administration_groups.id FK — resolved by the caller
  medicationRef: string; // display name, e.g. "Paracetamol"
  dose: string;          // dose amount string, e.g. "1000"
  unit: string;          // e.g. "mg", "ml"
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
      // Invalidate postop order set (planned events + order items)
      // Key format from usePostopOrderSet.ts:8
      qc.invalidateQueries({
        queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}/postop-orders`],
      });
      // Invalidate or-medications so the new row appears on the swimlane/card
      // Key format from OrMedicationsCard.tsx:128
      qc.invalidateQueries({
        queryKey: [`/api/or-medications/${anesthesiaRecordId}`],
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
