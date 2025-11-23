import { useState, useEffect, useMemo, useRef } from "react";
import { InventoryUsageTab } from "./InventoryUsageTab";
import { CommitReminderDialog } from "./CommitReminderDialog";

interface OpInventoryProps {
  anesthesiaRecord: any;
  inventoryUsage: any[];
  inventoryCommits: any[];
  inventoryItems: any[];
  onNavigateToInventoryTab: () => void;
  onClearA3Marker: () => void;
}

export function OpInventory({
  anesthesiaRecord,
  inventoryUsage,
  inventoryCommits,
  inventoryItems,
  onNavigateToInventoryTab,
  onClearA3Marker,
}: OpInventoryProps) {
  // Commit reminder dialog state
  const [isCommitReminderOpen, setIsCommitReminderOpen] = useState(false);
  const [isBlockingCommitDialog, setIsBlockingCommitDialog] = useState(false);
  const prevA2TimeRef = useRef<number | null>(null);
  const a2ReminderShownRef = useRef(false);

  // Handler for commit button in CommitReminderDialog
  const handleCommitInventory = () => {
    // Navigate to inventory tab to allow user to commit
    onNavigateToInventoryTab();
    setIsCommitReminderOpen(false);
  };

  // Calculate uncommitted inventory items for commit reminder
  const uncommittedItemsCount = useMemo(() => {
    if (!inventoryUsage || !inventoryItems || !inventoryCommits) return 0;

    // Create map of committed quantities per item
    const committedQuantities: Record<string, number> = {};
    inventoryCommits
      .filter((c: any) => !c.rolledBackAt)
      .forEach((commit: any) => {
        commit.items.forEach((item: any) => {
          committedQuantities[item.itemId] = (committedQuantities[item.itemId] || 0) + parseFloat(item.quantity);
        });
      });

    // Calculate uncommitted quantities using precise decimal arithmetic
    let uncommittedCount = 0;
    inventoryUsage.forEach((usage: any) => {
      const finalQty = usage.overrideQty !== null ? parseFloat(usage.overrideQty) : parseFloat(usage.calculatedQty);
      const committed = committedQuantities[usage.itemId] || 0;
      const uncommitted = finalQty - committed;
      // Count items with any positive uncommitted quantity (even fractional)
      if (uncommitted > 0.01) {
        uncommittedCount++;
      }
    });

    return uncommittedCount;
  }, [inventoryUsage, inventoryItems, inventoryCommits]);

  // Monitor A2 time marker changes for non-blocking commit reminder
  useEffect(() => {
    if (!anesthesiaRecord?.timeMarkers) return;

    const markers = anesthesiaRecord.timeMarkers as any[];
    const a2Marker = markers.find((m: any) => m.code === 'A2');
    const currentA2Time = a2Marker?.time ? Number(a2Marker.time) : null;

    // Check if A2 just changed from null to a timestamp AND we haven't shown reminder for this timestamp yet
    if (currentA2Time !== null && currentA2Time !== prevA2TimeRef.current && !a2ReminderShownRef.current && uncommittedItemsCount > 0) {
      setIsBlockingCommitDialog(false);
      setIsCommitReminderOpen(true);
      a2ReminderShownRef.current = true; // Mark reminder as shown
    }

    // Reset reminder flag if A2 is cleared or uncommitted count reaches 0
    if (currentA2Time === null || uncommittedItemsCount === 0) {
      a2ReminderShownRef.current = false;
    }

    prevA2TimeRef.current = currentA2Time;
  }, [anesthesiaRecord?.timeMarkers, uncommittedItemsCount]);

  // Monitor A3 time marker changes for blocking commit reminder
  useEffect(() => {
    if (!anesthesiaRecord?.timeMarkers || !anesthesiaRecord?.id) return;

    const markers = anesthesiaRecord.timeMarkers as any[];
    const a3Marker = markers.find((m: any) => m.code === 'A3');
    const a3Time = a3Marker?.time ? Number(a3Marker.time) : null;

    // If A3 is set and there are uncommitted items, show blocking dialog and request parent to clear A3
    if (a3Time !== null && uncommittedItemsCount > 0 && !isCommitReminderOpen) {
      // First, show the blocking dialog
      setIsBlockingCommitDialog(true);
      setIsCommitReminderOpen(true);

      // Then, request parent to clear A3 time marker
      setTimeout(() => {
        onClearA3Marker();
      }, 100); // Small delay to ensure dialog state is set first
    }
  }, [anesthesiaRecord?.timeMarkers, uncommittedItemsCount, isCommitReminderOpen, onClearA3Marker]);

  return (
    <>
      {/* Inventory Usage Tab Content */}
      <InventoryUsageTab anesthesiaRecordId={anesthesiaRecord?.id || ''} />

      {/* Commit Reminder Dialog */}
      <CommitReminderDialog
        isOpen={isCommitReminderOpen}
        onClose={() => setIsCommitReminderOpen(false)}
        onCommit={handleCommitInventory}
        uncommittedCount={uncommittedItemsCount}
        isBlocking={isBlockingCommitDialog}
      />
    </>
  );
}
