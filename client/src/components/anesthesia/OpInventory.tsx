import { InventoryUsageTab } from "./InventoryUsageTab";
import type { Module } from "@/contexts/ModuleContext";

interface OpInventoryProps {
  anesthesiaRecord: any;
  inventoryUsage: any[];
  inventoryCommits: any[];
  inventoryItems: any[];
  onNavigateToInventoryTab: () => void;
  onClearA3Marker: () => void;
  activeModule?: Module;
}

export function OpInventory({
  anesthesiaRecord,
  activeModule,
}: OpInventoryProps) {
  return (
    <InventoryUsageTab 
      anesthesiaRecordId={anesthesiaRecord?.id || ''} 
      activeModule={activeModule}
    />
  );
}
