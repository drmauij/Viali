import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ItemWithStock } from "./types";
import type { Folder, Vendor } from "@shared/schema";

// Inline interfaces
interface RunwayItem {
  itemId: string;
  runwayDays: number | null;
  dailyUsage: number;
  status: 'stockout' | 'critical' | 'warning' | 'ok' | 'no_data';
}

interface RunwayData {
  items: RunwayItem[];
  targetRunway: number;
  warningDays: number;
}

interface UnitData {
  id: string;
  name: string;
  hospitalId: string;
}

export function useItemsQueries(params: {
  hospitalId: string | undefined;
  unitId: string | undefined;
  activeUnitId: string | undefined;
  activeFilter: string;
  transferTargetUnitId: string;
  transferDirection: 'to' | 'from';
}) {
  const { hospitalId, unitId, activeUnitId, activeFilter, transferTargetUnitId, transferDirection } = params;

  // Items query
  const { data: items = [], isLoading } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${hospitalId}?unitId=${unitId}${activeFilter === 'archived' ? '&includeArchived=true' : ''}`, unitId, activeFilter],
    enabled: !!hospitalId && !!unitId,
  });

  // Folders query
  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: [`/api/folders/${hospitalId}?unitId=${unitId}`, unitId],
    enabled: !!hospitalId && !!unitId,
  });

  // Runway data query
  const { data: runwayData } = useQuery<RunwayData>({
    queryKey: [`/api/items/${hospitalId}/runway?unitId=${unitId}`, unitId],
    enabled: !!hospitalId && !!unitId,
  });

  // Create a map for quick runway lookup
  const runwayMap = useMemo(() => {
    const map = new Map<string, RunwayItem>();
    if (runwayData?.items) {
      for (const item of runwayData.items) {
        map.set(item.itemId, item);
      }
    }
    return map;
  }, [runwayData]);

  // Fetch item codes for search by pharmacode/GTIN
  const { data: itemCodesData = [] } = useQuery<{ itemId: string; gtin: string | null; pharmacode: string | null }[]>({
    queryKey: [`/api/item-codes/${hospitalId}?unitId=${unitId}`, unitId],
    enabled: !!hospitalId && !!unitId,
  });

  // Fetch all units for transfer destination selection
  const { data: allUnits = [] } = useQuery<UnitData[]>({
    queryKey: [`/api/units/${hospitalId}`],
    enabled: !!hospitalId,
  });

  // Filter out current unit for destination selection
  const availableDestinationUnits = useMemo(() => {
    return allUnits.filter(u => u.id !== activeUnitId);
  }, [allUnits, activeUnitId]);

  // Fetch items from source unit when transferring FROM another unit
  const { data: sourceUnitItems = [], isLoading: isLoadingSourceItems } = useQuery<ItemWithStock[]>({
    queryKey: [`/api/items/${hospitalId}?unitId=${transferTargetUnitId}`, transferTargetUnitId],
    enabled: !!hospitalId && !!transferTargetUnitId && transferDirection === 'from',
  });

  // Fetch item codes for source unit when transferring FROM
  const { data: sourceUnitCodesData = [] } = useQuery<{ itemId: string; gtin: string | null; pharmacode: string | null }[]>({
    queryKey: [`/api/item-codes/${hospitalId}?unitId=${transferTargetUnitId}`, transferTargetUnitId],
    enabled: !!hospitalId && !!transferTargetUnitId && transferDirection === 'from',
  });

  // Create map of source unit item codes
  const sourceUnitCodesMap = useMemo(() => {
    const map = new Map<string, { gtin?: string; pharmacode?: string }>();
    for (const code of sourceUnitCodesData) {
      map.set(code.itemId, {
        gtin: code.gtin || undefined,
        pharmacode: code.pharmacode || undefined,
      });
    }
    return map;
  }, [sourceUnitCodesData]);

  // Create a map of itemId to codes for efficient lookup during search
  const itemCodesMap = useMemo(() => {
    const map = new Map<string, { gtin?: string; pharmacode?: string }>();
    for (const code of itemCodesData) {
      map.set(code.itemId, {
        gtin: code.gtin || undefined,
        pharmacode: code.pharmacode || undefined,
      });
    }
    return map;
  }, [itemCodesData]);

  // Get the appropriate items and codes based on transfer direction
  const transferSourceItems = transferDirection === 'from' ? sourceUnitItems : items;
  const transferSourceCodesMap = transferDirection === 'from' ? sourceUnitCodesMap : itemCodesMap;

  // Vendors query
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: [`/api/vendors/${hospitalId}`, unitId],
    enabled: !!hospitalId,
  });

  // Open order items query
  const { data: openOrderItems = {} } = useQuery<Record<string, { totalQty: number }>>({
    queryKey: [`/api/orders/open-items/${hospitalId}`, unitId],
    enabled: !!hospitalId,
  });

  return {
    items,
    isLoading,
    folders,
    runwayData,
    runwayMap,
    itemCodesData,
    itemCodesMap,
    allUnits,
    availableDestinationUnits,
    sourceUnitItems,
    isLoadingSourceItems,
    sourceUnitCodesData,
    sourceUnitCodesMap,
    transferSourceItems,
    transferSourceCodesMap,
    vendors,
    openOrderItems,
  };
}

export type ItemsQueries = ReturnType<typeof useItemsQueries>;
