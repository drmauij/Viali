import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, Minus, Plus, Folder, RotateCcw } from "lucide-react";

interface InventoryUsageTabProps {
  anesthesiaRecordId: string;
}

interface InventoryUsage {
  id: string;
  itemId: string;
  calculatedQty: number;
  overrideQty: number | null;
}

interface Item {
  id: string;
  name: string;
  folderId: string;
}

interface FolderType {
  id: string;
  name: string;
}

export function InventoryUsageTab({ anesthesiaRecordId }: InventoryUsageTabProps) {
  const { toast } = useToast();
  const activeHospital = useActiveHospital();

  // Fetch ALL inventory items from the hospital
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: [`/api/anesthesia/items/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch folders
  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: [`/api/folders/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch auto-calculated usage
  const { data: inventoryUsage = [] } = useQuery<InventoryUsage[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Create a map of itemId -> auto-calculated quantity
  const autoCalcMap = useMemo(() => {
    const map: Record<string, number> = {};
    inventoryUsage.forEach(u => {
      map[u.itemId] = u.calculatedQty;
    });
    return map;
  }, [inventoryUsage]);

  // Create a map of itemId -> manual override quantity
  const overrideMap = useMemo(() => {
    const map: Record<string, { qty: number | null; usageId: string }> = {};
    inventoryUsage.forEach(u => {
      map[u.itemId] = { qty: u.overrideQty, usageId: u.id };
    });
    return map;
  }, [inventoryUsage]);

  // Group items by folder
  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = {};
    items.forEach(item => {
      const folderId = item.folderId || 'uncategorized';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(item);
    });
    return groups;
  }, [items]);

  // Get folder name
  const getFolderName = (folderId: string) => {
    if (folderId === 'uncategorized') return 'Uncategorized';
    const folder = folders.find(f => f.id === folderId);
    return folder?.name || 'Uncategorized';
  };

  // Get final quantity for an item
  const getFinalQty = (itemId: string) => {
    const override = overrideMap[itemId];
    if (override && override.qty !== null) {
      return override.qty;
    }
    return autoCalcMap[itemId] || 0;
  };

  // Mutation to create or update inventory usage quantity
  const overrideMutation = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) => {
      const usage = inventoryUsage.find(u => u.itemId === itemId);
      if (usage) {
        // Update existing usage record
        return apiRequest('PATCH', `/api/anesthesia/inventory/${usage.id}/override`, {
          overrideQty: qty,
          overrideReason: "Manual adjustment",
        });
      } else {
        // Create new manual usage record
        return apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/manual`, {
          itemId,
          qty,
          reason: "Manual adjustment",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update quantity",
        variant: "destructive",
      });
    },
  });

  // Clear override mutation
  const clearOverrideMutation = useMutation({
    mutationFn: async (usageId: string) => {
      const response = await apiRequest('DELETE', `/api/anesthesia/inventory/${usageId}/override`);
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] });
      toast({
        title: "Reset to calculated value",
        description: "Quantity has been reset to the auto-calculated value",
      });
    },
  });

  const handleQuantityChange = (itemId: string, delta: number) => {
    const currentQty = Math.round(getFinalQty(itemId));
    const newQty = Math.max(0, currentQty + delta);
    overrideMutation.mutate({ itemId, qty: newQty });
  };

  const handleReset = (itemId: string) => {
    const override = overrideMap[itemId];
    if (override && override.qty !== null) {
      clearOverrideMutation.mutate(override.usageId);
    }
  };

  // Get folders with used items (auto-expand)
  const foldersWithUsedItems = useMemo(() => {
    const folderIds: string[] = [];
    Object.keys(groupedItems).forEach(folderId => {
      const hasUsedItems = groupedItems[folderId].some(item => getFinalQty(item.id) > 0);
      if (hasUsedItems) {
        folderIds.push(folderId);
      }
    });
    return folderIds;
  }, [groupedItems, autoCalcMap, overrideMap]);

  if (!anesthesiaRecordId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">Create an anesthesia record first</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Medication & Supply Usage</h3>
        <Badge variant="outline" className="text-xs">
          Auto-calculated from timeline
        </Badge>
      </div>

      {Object.keys(groupedItems).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No inventory items available</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2 w-full" defaultValue={foldersWithUsedItems}>
          {Object.keys(groupedItems).map((folderId) => (
            <AccordionItem key={folderId} value={folderId}>
              <Card>
                <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-folder-${folderId}`}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{getFolderName(folderId)}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {groupedItems[folderId].length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="pt-0 space-y-2">
                    {groupedItems[folderId].map((item) => {
                      const finalQty = getFinalQty(item.id);
                      const autoCalc = autoCalcMap[item.id] || 0;
                      const hasOverride = overrideMap[item.id]?.qty !== null;
                      const isUsed = finalQty > 0;

                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                            isUsed 
                              ? 'bg-amber-500/20 hover:bg-amber-500/30 dark:bg-amber-400/25 dark:hover:bg-amber-400/35' 
                              : 'bg-muted/50 hover:bg-muted'
                          }`}
                          data-testid={`inventory-item-${item.id}`}
                        >
                          <div className="flex-1 flex items-center gap-3">
                            <p className="font-medium text-sm">{item.name}</p>
                            {autoCalc > 0 && (
                              <span className="text-xs text-muted-foreground">
                                (calc: {Math.round(autoCalc)})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuantityChange(item.id, -1);
                              }}
                              disabled={overrideMutation.isPending || finalQty === 0}
                              title="Decrease quantity"
                              data-testid={`button-decrease-${item.id}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-12 text-center font-semibold" data-testid={`quantity-${item.id}`}>
                              {Math.round(finalQty)}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuantityChange(item.id, 1);
                              }}
                              disabled={overrideMutation.isPending}
                              title="Increase quantity"
                              data-testid={`button-increase-${item.id}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 ml-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReset(item.id);
                              }}
                              disabled={!hasOverride || clearOverrideMutation.isPending}
                              title={hasOverride ? "Reset to calculated value" : "No manual override"}
                              data-testid={`button-reset-${item.id}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
