import { useQuery } from "@tanstack/react-query";
import { useRef, useMemo } from "react";

/**
 * Hook to manage inventory commit state for anesthesia timeline
 * Provides pending commits detection and related helpers
 */
export function useInventoryCommitState(anesthesiaRecordId: string | null) {
  // Ref to track if X2 reminder has been shown (persists across renders)
  const x2ReminderShownRef = useRef(false);

  // Fetch inventory usage data
  const {
    data: inventoryUsage = [],
    isLoading: inventoryLoading,
    isError: inventoryError,
  } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch existing commits
  const {
    data: existingCommits = [],
    isLoading: commitsLoading,
    isError: commitsError,
  } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits'],
    enabled: !!anesthesiaRecordId,
  });

  // Calculate hasPendingCommits
  // Conservative: treat loading/error states as "pending" to prevent silent bypasses
  const hasPendingCommits = useMemo(() => {
    console.log('[PENDING_COMMITS_CHECK]', {
      inventoryLoading,
      commitsLoading,
      inventoryError,
      commitsError,
      inventoryUsageLength: inventoryUsage?.length || 0,
      commitsLength: existingCommits?.length || 0,
    });

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
      if (hasPending) {
        console.log('[PENDING_COMMITS_CHECK] Item check:', {
          itemId: item.itemId,
          finalQty: item.finalQty,
          committed: totalCommitted,
          uncommitted,
          hasPending,
        });
      }
      
      return hasPending;
    });
  }, [inventoryUsage, existingCommits, inventoryLoading, commitsLoading, inventoryError, commitsError]);

  console.log('[PENDING_COMMITS_CHECK] Final result:', hasPendingCommits);

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
