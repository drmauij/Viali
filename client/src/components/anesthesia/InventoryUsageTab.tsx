import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, Minus, Plus, Folder, RotateCcw, CheckCircle, History, Undo } from "lucide-react";
import { ControlledItemsCommitDialog } from "./ControlledItemsCommitDialog";
import { formatDate } from "@/lib/dateUtils";

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
  controlled: boolean;
  trackExactQuantity: boolean;
}

interface FolderType {
  id: string;
  name: string;
}

interface CommitItem {
  itemId: string;
  itemName: string;
  quantity: number;
  isControlled: boolean;
}

interface InventoryCommit {
  id: string;
  committedAt: string;
  committedBy: string;
  items: CommitItem[];
  rolledBackAt: string | null;
  rollbackReason: string | null;
}

export function InventoryUsageTab({ anesthesiaRecordId }: InventoryUsageTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  
  // State for controlling accordion expansion
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [showCommitDialog, setShowCommitDialog] = useState(false);

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
  const { data: inventoryUsage = [], refetch: refetchInventory } = useQuery<InventoryUsage[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch commit history
  const { data: commits = [] } = useQuery<InventoryCommit[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch medications to detect running infusions
  const { data: medications = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/medications/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch anesthesia record to get surgery info
  const { data: anesthesiaRecord } = useQuery<any>({
    queryKey: [`/api/anesthesia/records/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch surgery to get patient info
  const { data: surgery } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${anesthesiaRecord?.surgeryId}`],
    enabled: !!anesthesiaRecord?.surgeryId,
  });

  // Fetch patient data
  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId,
  });

  // Debug logging for patient data chain
  useEffect(() => {
    console.log('[PATIENT-DEBUG] Query chain:', {
      anesthesiaRecordId,
      anesthesiaRecord: anesthesiaRecord ? { id: anesthesiaRecord.id, surgeryId: anesthesiaRecord.surgeryId } : null,
      surgery: surgery ? { id: surgery.id, patientId: surgery.patientId } : null,
      patient: patient ? { id: patient.id, firstName: patient.firstName, surname: patient.surname, birthday: patient.birthday } : null,
    });
  }, [anesthesiaRecordId, anesthesiaRecord, surgery, patient]);
  
  // Trigger inventory calculation on mount and periodically for running infusions
  useEffect(() => {
    if (!anesthesiaRecordId) return;
    
    // Call the calculate endpoint to recalculate inventory based on timeline medications
    const calculateInventory = () => {
      apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/calculate`)
        .then(() => {
          // Refetch inventory data after calculation
          refetchInventory();
        })
        .catch(error => {
          console.error('Error calculating inventory:', error);
        });
    };
    
    // Initial calculation
    calculateInventory();
    
    // Check if there are any running rate-controlled infusions
    const hasRunningInfusions = medications.some(
      (med: any) => med.type === 'infusion_start' && !med.endTimestamp
    );
    
    // If there are running infusions, update calculation every 60 seconds
    if (hasRunningInfusions) {
      const interval = setInterval(calculateInventory, 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [anesthesiaRecordId, medications, refetchInventory]);

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
      // Check if folderId exists in the folders list
      const folderExists = item.folderId && folders.some(f => f.id === item.folderId);
      const folderId = folderExists ? item.folderId : 'uncategorized';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(item);
    });
    return groups;
  }, [items, folders]);

  // Get folder name
  const getFolderName = (folderId: string) => {
    if (folderId === 'uncategorized') return t('anesthesia.op.uncategorized');
    const folder = folders.find(f => f.id === folderId);
    return folder?.name || t('anesthesia.op.uncategorized');
  };

  // Check if an item has a running rate-controlled infusion
  const isRunningInfusion = (itemId: string) => {
    return medications.some(
      (med: any) => 
        med.itemId === itemId && 
        med.type === 'infusion_start' && 
        !med.endTimestamp
    );
  };

  // Get final quantity for an item
  const getFinalQty = (itemId: string) => {
    const override = overrideMap[itemId];
    if (override && override.qty !== null) {
      return override.qty;
    }
    return autoCalcMap[itemId] || 0;
  };

  // Get uncommitted quantity
  // Note: The server already filters medications by timestamp, so getFinalQty 
  // already represents only post-commit usage (not cumulative)
  const getUncommittedQty = (itemId: string) => {
    return Math.max(0, Math.round(getFinalQty(itemId)));
  };

  // Get items to commit (uncommitted quantities)
  const itemsToCommit = useMemo(() => {
    const toCommit: CommitItem[] = [];
    Object.keys(groupedItems).forEach(folderId => {
      groupedItems[folderId].forEach(item => {
        const qty = getUncommittedQty(item.id);
        if (qty > 0) {
          toCommit.push({
            itemId: item.id,
            itemName: item.name,
            quantity: qty,
            isControlled: item.controlled || false,
          });
        }
      });
    });
    return toCommit;
  }, [groupedItems, autoCalcMap, overrideMap]);

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

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (signature: string | null) => {
      const response = await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/commit`, {
        signature,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`] });
      toast({
        title: t('anesthesia.op.commitSuccess'),
        description: `${itemsToCommit.length} items committed`,
      });
      setShowCommitDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('anesthesia.op.commitError'),
        description: error.message || "Failed to commit inventory",
        variant: "destructive",
      });
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (commitId: string) => {
      const response = await apiRequest('POST', `/api/anesthesia/inventory/commits/${commitId}/rollback`, {
        reason: "Manual rollback",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`] });
      toast({
        title: t('anesthesia.op.rollbackSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('anesthesia.op.rollbackError'),
        description: error.message,
        variant: "destructive",
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

  const handleCommit = (signature: string | null) => {
    commitMutation.mutate(signature);
  };

  const handleRollback = (commitId: string) => {
    if (confirm(t('anesthesia.op.rollbackConfirm'))) {
      rollbackMutation.mutate(commitId);
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
  
  // Update openFolders when foldersWithUsedItems changes
  useEffect(() => {
    setOpenFolders(prev => {
      // Only update if the folders actually changed to prevent infinite loops
      const prevSet = new Set(prev);
      const newSet = new Set(foldersWithUsedItems);
      const hasChanged = 
        prevSet.size !== newSet.size ||
        foldersWithUsedItems.some(f => !prevSet.has(f));
      
      return hasChanged ? foldersWithUsedItems : prev;
    });
  }, [foldersWithUsedItems]);

  if (!anesthesiaRecordId) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">{t('anesthesia.op.createRecordFirst')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">{t('anesthesia.op.medicationSupplyUsage')}</h3>
        <Button
          onClick={() => setShowCommitDialog(true)}
          disabled={itemsToCommit.length === 0 || commitMutation.isPending}
          size="sm"
          data-testid="button-commit-inventory"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          {t('anesthesia.op.commitUsedItems')}
        </Button>
      </div>

      {/* Commit History */}
      {commits.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4" />
              <h4 className="font-semibold text-sm">{t('anesthesia.op.commitHistory')}</h4>
            </div>
            <div className="space-y-2">
              {commits.map(commit => (
                <div
                  key={commit.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    commit.rolledBackAt 
                      ? 'bg-muted/50 opacity-60' 
                      : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                  }`}
                  data-testid={`commit-${commit.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {commit.items.length} items committed
                      </span>
                      {commit.rolledBackAt && (
                        <Badge variant="destructive" className="text-xs">
                          {t('anesthesia.op.rolledBack')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(new Date(commit.committedAt))}
                    </p>
                  </div>
                  {!commit.rolledBackAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRollback(commit.id)}
                      disabled={rollbackMutation.isPending}
                      data-testid={`button-rollback-${commit.id}`}
                    >
                      <Undo className="h-4 w-4 mr-1" />
                      {t('anesthesia.op.rollback')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {Object.keys(groupedItems).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('anesthesia.op.noInventoryItems')}</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2 w-full" value={openFolders} onValueChange={setOpenFolders}>
          {Object.keys(groupedItems).map((folderId) => (
            <AccordionItem key={folderId} value={folderId}>
              <Card>
                <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-folder-${folderId}`}>
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{getFolderName(folderId)}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {groupedItems[folderId].filter(item => getFinalQty(item.id) > 0).length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="pt-0 space-y-2">
                    {groupedItems[folderId].map((item) => {
                      const finalQty = getFinalQty(item.id);
                      const uncommittedQty = getUncommittedQty(item.id);
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
                                ({t('anesthesia.op.calc')}: ~{Math.round(autoCalc)})
                              </span>
                            )}
                            {isRunningInfusion(item.id) && (
                              <Badge variant="outline" className="bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/50 text-xs animate-pulse">
                                {t('anesthesia.op.running')}
                              </Badge>
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

      <ControlledItemsCommitDialog
        isOpen={showCommitDialog}
        onClose={() => setShowCommitDialog(false)}
        onCommit={handleCommit}
        items={itemsToCommit}
        isCommitting={commitMutation.isPending}
        patientId={patient?.id}
        patientName={patient ? `${patient.surname}, ${patient.firstName}` : null}
        patientBirthday={patient?.birthday}
      />
    </div>
  );
}
