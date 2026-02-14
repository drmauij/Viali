import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Package, Minus, Plus, Folder, RotateCcw, CheckCircle, History, Undo, ChevronDown, ChevronRight, Search, X, Loader2 } from "lucide-react";
import { ControlledItemsCommitDialog } from "./ControlledItemsCommitDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDate } from "@/lib/dateUtils";
import type { Module } from "@/contexts/ModuleContext";

interface InventoryUsageTabProps {
  anesthesiaRecordId: string;
  activeModule?: Module;
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
  unit?: string | null;
}

interface FolderType {
  id: string;
  name: string;
  sortOrder: number;
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


export function InventoryUsageTab({ anesthesiaRecordId, activeModule }: InventoryUsageTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  
  // State for controlling folder expansion (using Set for instant lookups)
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set());
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // State for tracking which commits are expanded to show details
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(() => new Set());
  
  const isAdmin = activeHospital?.role === 'admin';

  // Toggle folder expansion
  const toggleFolder = (folderId: string) => {
    setOpenFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  // Toggle commit details expansion
  const toggleCommitDetails = (commitId: string) => {
    setExpandedCommits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commitId)) {
        newSet.delete(commitId);
      } else {
        newSet.add(commitId);
      }
      return newSet;
    });
  };

  // Determine module type for API filtering
  const moduleType = activeModule === 'surgery' ? 'surgery' : 'anesthesia';

  // Fetch ALL inventory items from the hospital based on module type
  // The backend will find the correct unit based on the module flag
  const { data: items = [] } = useQuery<Item[]>({
    queryKey: [`/api/items/${activeHospital?.id}?module=${moduleType}`, moduleType],
    enabled: !!activeHospital?.id,
  });

  // Fetch folders based on module type
  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: [`/api/folders/${activeHospital?.id}?module=${moduleType}`, moduleType],
    enabled: !!activeHospital?.id,
  });

  // Fetch auto-calculated usage
  const { data: inventoryUsage = [], refetch: refetchInventory } = useQuery<InventoryUsage[]>({
    queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Fetch commit history (filtered by current unit/module)
  const { data: commits = [] } = useQuery<InventoryCommit[]>({
    queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits', activeHospital?.unitId],
    queryFn: async () => {
      const url = activeHospital?.unitId
        ? `/api/anesthesia/inventory/${anesthesiaRecordId}/commits?unitId=${activeHospital.unitId}`
        : `/api/anesthesia/inventory/${anesthesiaRecordId}/commits`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch commits');
      return response.json();
    },
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

  // Filter items: exclude pack items without trackExactQuantity
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const normalizedUnit = item.unit?.toLowerCase() || '';
      // Check if it's a pack-type unit (covers 'pack', 'pack/box', etc.)
      const isPack = normalizedUnit.startsWith('pack');
      // If it's a pack item without trackExactQuantity, filter it out
      if (isPack && !item.trackExactQuantity) {
        return false;
      }
      return true;
    });
  }, [items]);

  // Apply search filter
  const searchFilteredItems = useMemo(() => {
    if (!searchTerm) return filteredItems;
    const lowerSearch = searchTerm.toLowerCase();
    return filteredItems.filter(item => 
      item.name.toLowerCase().includes(lowerSearch)
    );
  }, [filteredItems, searchTerm]);

  // Group items by folder
  const groupedItems = useMemo(() => {
    const groups: Record<string, Item[]> = {};
    searchFilteredItems.forEach(item => {
      // Use the item's folderId if it exists, otherwise 'uncategorized'
      // Don't validate against folders list to avoid race conditions
      const folderId = item.folderId || 'uncategorized';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(item);
    });
    return groups;
  }, [searchFilteredItems]);

  // Get sorted folder IDs (by sortOrder, then by name) to match inventory list order
  const sortedFolderIds = useMemo(() => {
    // Get all folder IDs that have items
    const folderIdsWithItems = Object.keys(groupedItems);
    
    // Sort them according to the folders array's sortOrder
    return folderIdsWithItems.sort((a, b) => {
      // Handle uncategorized folder - always put it last
      if (a === 'uncategorized') return 1;
      if (b === 'uncategorized') return -1;
      
      const folderA = folders.find(f => f.id === a);
      const folderB = folders.find(f => f.id === b);
      
      // If both folders exist, sort by sortOrder then by name
      if (folderA && folderB) {
        if (folderA.sortOrder !== folderB.sortOrder) {
          return folderA.sortOrder - folderB.sortOrder;
        }
        return folderA.name.localeCompare(folderB.name);
      }
      
      // Fallback to alphabetical if folder not found
      return a.localeCompare(b);
    });
  }, [groupedItems, folders]);

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

  // Get items to commit (uncommitted quantities) - based on filteredItems, not affected by search
  const itemsToCommit = useMemo(() => {
    const toCommit: CommitItem[] = [];
    filteredItems.forEach(item => {
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
    return toCommit;
  }, [filteredItems, autoCalcMap, overrideMap]);

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

  // Commit mutation (module-scoped - only commits items from the current module's unit)
  const commitMutation = useMutation({
    mutationFn: async (signature: string | null) => {
      const response = await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/commit`, {
        signature,
        module: moduleType, // Pass module type (anesthesia/surgery) to scope the commit
      });
      return response.json();
    },
    onSuccess: async () => {
      // Invalidate both commits and inventory usage queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] }),
      ]);
      // Also invalidate the hook's query keys (uses array-based keys)
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits'] });
      
      // CRITICAL: Invalidate items queries to update stock in Items page
      // Use predicate to match any items query for this hospital
      if (activeHospital?.id) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.startsWith(`/api/items/${activeHospital.id}`);
          },
        });
      }
      
      // Trigger recalculation to get fresh data
      await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/calculate`);
      refetchInventory();
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
    onSuccess: async () => {
      // Invalidate both commits and inventory usage queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}/commits`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/inventory/${anesthesiaRecordId}`] }),
      ]);
      // Also invalidate the hook's query keys (uses array-based keys)
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecordId, 'commits'] });
      
      // CRITICAL: Invalidate items queries to update stock in Items page
      // Use predicate to match any items query for this hospital
      if (activeHospital?.id) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.startsWith(`/api/items/${activeHospital.id}`);
          },
        });
      }
      
      // Trigger recalculation to get fresh data
      await apiRequest('POST', `/api/anesthesia/inventory/${anesthesiaRecordId}/calculate`);
      refetchInventory();
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
  // Only auto-expand on initial load, preserve manual user interactions after
  useEffect(() => {
    setOpenFolders(prev => {
      // If user hasn't manually interacted (prev is empty), auto-expand folders with used items
      if (prev.size === 0 && foldersWithUsedItems.length > 0) {
        return new Set(foldersWithUsedItems);
      }
      
      // Otherwise, add any NEW folders with used items to the existing expansion state
      const newFoldersToAdd = foldersWithUsedItems.filter(f => !prev.has(f));
      
      if (newFoldersToAdd.length > 0) {
        const newSet = new Set(prev);
        newFoldersToAdd.forEach(f => newSet.add(f));
        return newSet;
      }
      
      return prev;
    });
  }, [foldersWithUsedItems]);

  // Auto-expand folders containing search results
  useEffect(() => {
    if (searchTerm) {
      // When searching, expand all folders that have matching items
      const foldersWithResults = Object.keys(groupedItems).filter(
        folderId => groupedItems[folderId].length > 0
      );
      setOpenFolders(new Set(foldersWithResults));
    }
  }, [searchTerm, groupedItems]);

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

      {/* Commit History with Expandable Details */}
      {commits.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4" />
              <h4 className="font-semibold text-sm">{t('anesthesia.op.commitHistory')}</h4>
            </div>
            <div className="space-y-2">
              {commits.map(commit => {
                const isExpanded = expandedCommits.has(commit.id);
                return (
                  <div
                    key={commit.id}
                    className={`rounded-lg border ${
                      commit.rolledBackAt 
                        ? 'bg-muted/50 opacity-60' 
                        : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                    }`}
                    data-testid={`commit-${commit.id}`}
                  >
                    {/* Header - Clickable to expand */}
                    <div 
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => toggleCommitDetails(commit.id)}
                      data-testid={`commit-header-${commit.id}`}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {commit.items.length} {t('anesthesia.op.itemsCommitted')}
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
                      </div>
                      {!commit.rolledBackAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRollback(commit.id);
                          }}
                          disabled={rollbackMutation.isPending}
                          data-testid={`button-rollback-${commit.id}`}
                        >
                          <Undo className="h-4 w-4 mr-1" />
                          {t('anesthesia.op.rollback')}
                        </Button>
                      )}
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="border-t px-4 py-3 bg-white/50 dark:bg-black/20" data-testid={`commit-details-${commit.id}`}>
                        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                          {t('anesthesia.op.committedItems')}
                        </div>
                        <div className="space-y-1.5">
                          {commit.items.map((item: CommitItem, idx: number) => (
                            <div 
                              key={`${commit.id}-${item.itemId}-${idx}`}
                              className="flex items-center justify-between py-1.5 border-b last:border-0"
                              data-testid={`commit-item-${commit.id}-${idx}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{item.itemName}</span>
                                {item.isControlled && (
                                  <Badge variant="outline" className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700">
                                    {t('anesthesia.op.controlled')}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-sm font-medium tabular-nums">
                                x{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                        {commit.rolledBackAt && (
                          <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
                            <span className="font-medium">{t('anesthesia.op.rolledBackOn')}:</span>{' '}
                            {formatDate(new Date(commit.rolledBackAt))}
                            {commit.rollbackReason && (
                              <span className="ml-2">- {commit.rollbackReason}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Field */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('anesthesia.op.searchItems')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 pr-8"
          data-testid="inventory-search"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
            data-testid="inventory-search-clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {sortedFolderIds.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('anesthesia.op.noInventoryItems')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedFolderIds.map((folderId) => {
            const isExpanded = openFolders.has(folderId);
            
            return (
              <Card key={folderId}>
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleFolder(folderId)}
                  data-testid={`accordion-folder-${folderId}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{getFolderName(folderId)}</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {groupedItems[folderId].filter(item => getFinalQty(item.id) > 0).length}
                  </Badge>
                </div>
                {isExpanded && (
                  <CardContent className="pt-0 pb-4 space-y-2">
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
                              title={t('inventory.decreaseQuantity', 'Decrease quantity')}
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
                              title={t('inventory.increaseQuantity', 'Increase quantity')}
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
                              title={hasOverride ? t('inventory.resetToCalculated', 'Reset to calculated value') : t('inventory.noManualOverride', 'No manual override')}
                              data-testid={`button-reset-${item.id}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
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
