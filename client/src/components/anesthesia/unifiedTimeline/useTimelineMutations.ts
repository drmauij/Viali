import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { saveMedication, saveTimeMarkers } from "@/services/timelinePersistence";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { FreeFlowSession } from "@/hooks/useMedicationState";
import type { AnesthesiaItem } from "./types";

interface UseTimelineMutationsParams {
  anesthesiaRecordId?: string;
  anesthesiaItems: AnesthesiaItem[];
  setFreeFlowSessions: React.Dispatch<React.SetStateAction<Record<string, FreeFlowSession[]>>>;
}

export function useTimelineMutations({
  anesthesiaRecordId,
  anesthesiaItems,
  setFreeFlowSessions,
}: UseTimelineMutationsParams) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();

  // Mutation for saving medication doses - using centralized persistence service
  const saveMedicationMutation = useMutation({
    mutationFn: saveMedication,
    onSuccess: (data, variables) => {
      console.log('[MEDICATION] Save successful', { data, variables });

      // Immediately update local state (don't wait for useEffect)
      // This makes infusions work like boluses
      if (variables.type === 'infusion_start' && variables.rate === 'free') {
        // Find the item and its swimlane
        const item = anesthesiaItems.find(i => i.id === variables.itemId);
        if (item && item.administrationGroup) {
          const swimlaneId = `admingroup-${item.administrationGroup}-item-${item.id}`;
          const newSession: FreeFlowSession = {
            id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            swimlaneId,
            startTime: new Date(variables.timestamp).getTime(),
            dose: variables.dose || '',
            label: item.name,
          };
          console.log('[MEDICATION] Adding free-flow session to local state:', newSession);
          setFreeFlowSessions(prev => ({
            ...prev,
            [swimlaneId]: [...(prev[swimlaneId] || []), newSession]
          }));
        }
      }

      // Still invalidate cache for consistency (but don't rely on useEffect)
      if (anesthesiaRecordId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`]
        });

        // Trigger inventory recalculation when medications change
        fetch(`/api/anesthesia/inventory/${anesthesiaRecordId}/calculate`, {
          method: 'POST',
          credentials: 'include',
        })
          .then(() => {
            queryClient.invalidateQueries({
              queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`]
            });
          })
          .catch(error => {
            console.error('[MEDICATION] Error recalculating inventory:', error);
          });
      }
    },
    onError: (error) => {
      console.error('[MEDICATION] Save failed', error);
      toast({
        title: t("anesthesia.timeline.toasts.errorSavingMedication", "Error saving medication"),
        description: error instanceof Error ? error.message : t("anesthesia.timeline.toasts.errorSavingMedicationDesc", "Failed to save medication"),
        variant: "destructive",
      });
    },
  });

  // Mutation for saving time markers
  const saveTimeMarkersMutation = useMutation({
    mutationFn: saveTimeMarkers,
    onSuccess: (data) => {
      console.log('[TIME_MARKERS] Save successful', data);
      // Invalidate both query keys to refetch with updated time markers and lock status
      if (anesthesiaRecordId) {
        // Invalidate record-specific query (for lock status) - use exact key format used by consumers
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        // Invalidate surgery-based query (for time markers)
        const surgeryId = data.surgeryId;
        if (surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
        }
      }
    },
    onError: (error) => {
      console.error('[TIME_MARKERS] Save failed', error);
      toast({
        title: t("anesthesia.timeline.toasts.errorSavingTimeMarkers", "Error saving time markers"),
        description: error instanceof Error ? error.message : t("anesthesia.timeline.toasts.errorSavingTimeMarkersDesc", "Failed to save time markers"),
        variant: "destructive",
      });
    },
  });

  // Mutation for locking the anesthesia record
  const lockRecordMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const response = await apiRequest('POST', `/api/anesthesia/records/${recordId}/lock`);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[RECORD_LOCK] Record locked successfully', data);
      if (anesthesiaRecordId) {
        // Use string template format to match consumer query keys
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        // Also invalidate surgery-based query
        if (data.surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${data.surgeryId}`] });
        }
      }
      toast({
        title: t('anesthesia.record.locked', 'Record Locked'),
        description: t('anesthesia.record.lockedDescription', 'The anesthesia record has been locked. Unlock to make changes.'),
      });
    },
    onError: (error) => {
      console.error('[RECORD_LOCK] Lock failed', error);
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('anesthesia.record.lockFailed', 'Failed to lock record'),
        variant: "destructive",
      });
    },
  });

  // Mutation for unlocking the anesthesia record
  const unlockRecordMutation = useMutation({
    mutationFn: async ({ recordId, reason }: { recordId: string; reason: string }) => {
      const response = await apiRequest('POST', `/api/anesthesia/records/${recordId}/unlock`, { reason });
      return response.json();
    },
    onSuccess: (data) => {
      console.log('[RECORD_UNLOCK] Record unlocked successfully', data);
      if (anesthesiaRecordId) {
        // Use string template format to match consumer query keys
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`] });
        if (data.surgeryId) {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${data.surgeryId}`] });
        }
      }
      toast({
        title: t('anesthesia.record.unlocked', 'Record Unlocked'),
        description: t('anesthesia.record.unlockedDescription', 'You can now make changes. Remember to lock when done.'),
      });
    },
    onError: (error) => {
      console.error('[RECORD_UNLOCK] Unlock failed', error);
      toast({
        title: t('common.error', 'Error'),
        description: error instanceof Error ? error.message : t('anesthesia.record.unlockFailed', 'Failed to unlock record'),
        variant: "destructive",
      });
    },
  });

  // Medication reorder mutation
  const reorderMedsMutation = useMutation({
    mutationFn: async (items: Array<{ itemId: string; sortOrder: number }>) => {
      if (!activeHospital?.id) throw new Error("No active hospital");
      await apiRequest('POST', '/api/anesthesia/items/reorder', { items });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospital?.id}`] });
      toast({
        title: t("common.success"),
        description: t("anesthesia.settings.reorderSuccess"),
      });
    },
    onError: (error) => {
      console.error('Failed to reorder items:', error);
      toast({
        title: t("common.error"),
        description: error instanceof Error ? error.message : t("anesthesia.settings.reorderError"),
        variant: "destructive",
      });
    },
  });

  return {
    saveMedicationMutation,
    saveTimeMarkersMutation,
    lockRecordMutation,
    unlockRecordMutation,
    reorderMedsMutation,
  };
}
