import { useQuery } from "@tanstack/react-query";
import { useRef, useMemo } from "react";
import { useActiveHospital } from "./useActiveHospital";

/**
 * Hook to manage inventory commit state for anesthesia timeline
 * Provides pending commits detection and related helpers
 * Now filtered by current unit/module for proper access control
 */
export function useInventoryCommitState(anesthesiaRecordId: string | null) {
  // Ref to track if X2 reminder has been shown (persists across renders)
  const x2ReminderShownRef = useRef(false);
  const activeHospital = useActiveHospital();

  // Fetch inventory usage data
  const {
    data: inventoryUsage = [],
    isLoading: inventoryLoading,
    isError: inventoryError,
  } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch existing commits (filtered by current unit/module)
  const {
    data: existingCommits = [],
    isLoading: commitsLoading,
    isError: commitsError,
  } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits', activeHospital?.unitId],
    queryFn: async () => {
      if (!anesthesiaRecordId) return [];
      const url = activeHospital?.unitId
        ? `/api/anesthesia/inventory/${anesthesiaRecordId}/commits?unitId=${activeHospital.unitId}`
        : `/api/anesthesia/inventory/${anesthesiaRecordId}/commits`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch commits');
      return response.json();
    },
    enabled: !!anesthesiaRecordId,
  });

  // Calculate hasPendingCommits
  // Conservative: treat loading/error states as "pending" to prevent silent bypasses
  const hasPendingCommits = useMemo(() => {
    // Conservative: treat loading/error states as "yes there are pending commits"
    // This prevents users from bypassing the check when data fails to load
    if (inventoryLoading || commitsLoading || inventoryError || commitsError) {
      return true;
    }

    // If there's no inventory usage, there's nothing to commit
    if (!inventoryUsage || inventoryUsage.length === 0) {
      return false;
    }

    // Check each inventory item for uncommitted quantities
    return inventoryUsage.some((item) => {
      const finalQty = parseFloat(item.finalQty || '0');
      
      // Find all commits for this item
      const itemCommits = existingCommits.filter(c => c.itemId === item.itemId);
      const totalCommitted = itemCommits.reduce((sum, c) => sum + parseFloat(c.quantity || '0'), 0);
      
      // Calculate uncommitted quantity
      const uncommitted = finalQty - totalCommitted;
      
      const hasPending = uncommitted > 0;
      
      return hasPending;
    });
  }, [inventoryUsage, existingCommits, inventoryLoading, commitsLoading, inventoryError, commitsError]);

  return {
    inventoryUsage,
    existingCommits,
    inventoryLoading,
    commitsLoading,
    inventoryError,
    commitsError,
    hasPendingCommits,
    x2ReminderShownRef,
  };
}

export type UseInventoryCommitStateReturn = ReturnType<typeof useInventoryCommitState>;
