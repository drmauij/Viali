import { useQuery } from "@tanstack/react-query";
import { useRef, useMemo } from "react";
import { useActiveHospital } from "./useActiveHospital";

/**
 * Hook to manage inventory commit state for anesthesia timeline
 * Provides pending commits detection and related helpers
 * 
 * IMPORTANT: For checking hasPendingCommits, we fetch ALL commits (no unit filter)
 * to correctly determine if items have been committed by ANY unit.
 * For display purposes (existingCommits), we filter by the current unit.
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

  // Fetch ALL commits (no unit filter) - used for checking pending status
  // This ensures we see commits from ALL units when determining if items need to be committed
  const {
    data: allCommits = [],
    isLoading: allCommitsLoading,
    isError: allCommitsError,
  } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits', 'all'],
    queryFn: async () => {
      if (!anesthesiaRecordId) return [];
      const response = await fetch(`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch commits');
      return response.json();
    },
    enabled: !!anesthesiaRecordId,
  });

  // Fetch commits filtered by current unit - used for display purposes
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

  // Calculate hasPendingCommits using ALL commits (not unit-filtered)
  // This correctly determines if items have been committed by ANY unit
  const hasPendingCommits = useMemo(() => {
    // Conservative: treat loading/error states as "yes there are pending commits"
    // This prevents users from bypassing the check when data fails to load
    if (inventoryLoading || allCommitsLoading || inventoryError || allCommitsError) {
      return true;
    }

    // If there's no inventory usage, there's nothing to commit
    if (!inventoryUsage || inventoryUsage.length === 0) {
      return false;
    }

    // Flatten all commit items from all commits (each commit has an items array)
    // Filter out rolled back commits
    const allCommitItems = allCommits
      .filter(c => !c.rolledBackAt) // Exclude rolled-back commits
      .flatMap(c => c.items || []);

    // Check each inventory item for uncommitted quantities using ALL commits
    return inventoryUsage.some((item) => {
      const finalQty = parseFloat(item.finalQty || '0');
      
      // Find all commit items for this inventory item from ANY unit
      const itemCommits = allCommitItems.filter((ci: any) => ci.itemId === item.itemId);
      const totalCommitted = itemCommits.reduce((sum: number, ci: any) => sum + parseFloat(ci.quantity || '0'), 0);
      
      // Calculate uncommitted quantity
      const uncommitted = finalQty - totalCommitted;
      
      const hasPending = uncommitted > 0;
      
      return hasPending;
    });
  }, [inventoryUsage, allCommits, inventoryLoading, allCommitsLoading, inventoryError, allCommitsError]);

  return {
    inventoryUsage,
    existingCommits,      // Unit-filtered commits (for display)
    allCommits,           // All commits from any unit (for calculations)
    inventoryLoading,
    commitsLoading,
    allCommitsLoading,
    inventoryError,
    commitsError,
    allCommitsError,
    hasPendingCommits,
    x2ReminderShownRef,
  };
}

export type UseInventoryCommitStateReturn = ReturnType<typeof useInventoryCommitState>;
