import { useState, useEffect, useMemo } from "react";

interface UseInventoryTrackingProps {
  medicationsData: any[];
  groupedItems: Record<string, any[]>;
}

export function useInventoryTracking({ medicationsData, groupedItems }: UseInventoryTrackingProps) {
  const [inventoryQuantities, setInventoryQuantities] = useState<Record<string, number>>({});

  // Get folder IDs with used items
  const usedFolderIds = useMemo(() => {
    const folderIds: string[] = [];
    Object.keys(groupedItems).forEach(folderId => {
      const hasUsedItems = groupedItems[folderId].some((item: any) => 
        (inventoryQuantities[item.id] || 0) > 0
      );
      if (hasUsedItems) {
        folderIds.push(folderId);
      }
    });
    return folderIds;
  }, [groupedItems, inventoryQuantities]);

  // Initialize quantities from medication data only once
  useEffect(() => {
    if (!medicationsData || Object.keys(inventoryQuantities).length > 0) return;

    const computedQuantities: Record<string, number> = {};
    
    medicationsData.forEach((med: any) => {
      if (med.itemId && med.dose) {
        const quantity = parseFloat(med.dose) || 0;
        computedQuantities[med.itemId] = (computedQuantities[med.itemId] || 0) + quantity;
      }
    });
    
    setInventoryQuantities(computedQuantities);
  }, [medicationsData, inventoryQuantities]);

  const handleQuantityChange = (itemId: string, delta: number) => {
    setInventoryQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta),
    }));
  };

  return {
    inventoryQuantities,
    usedFolderIds,
    handleQuantityChange,
  };
}
