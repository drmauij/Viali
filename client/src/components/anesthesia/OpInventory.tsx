import { InventoryUsageTab } from "./InventoryUsageTab";

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
}: OpInventoryProps) {
  return (
    <InventoryUsageTab anesthesiaRecordId={anesthesiaRecord?.id || ''} />
  );
}
