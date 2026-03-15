import React, { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, ArrowLeft, ArrowRightLeft, Plus, Minus, Search, Loader2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/BarcodeScanner";
import { Spinner } from "@/components/ui/spinner";
import type { ItemWithStock } from "./types";

export interface TransferItem {
  itemId: string;
  name: string;
  packSize: number;
  trackExactQuantity: boolean;
  currentUnits: number;
  stockQty: number;
  transferType: "packs" | "units";
  transferQty: number;
  pharmacode?: string;
  gtin?: string;
}

interface UnitData {
  id: string;
  name: string;
  hospitalId: string;
}

interface TransferItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  hospitalId: string;
  /** Items from the current unit (used for 'to' direction and barcode scanning) */
  items: ItemWithStock[];
  /** Codes map for current unit items */
  itemCodesMap: Map<string, { gtin?: string; pharmacode?: string }>;
  /** Available destination/source units (current unit filtered out) */
  availableDestinationUnits: UnitData[];
  /** Called after a successful transfer for cache invalidation */
  onTransferComplete?: () => void;
}

export const TransferItemsDialog = React.memo(function TransferItemsDialog({
  open,
  onOpenChange,
  unitId,
  hospitalId,
  items,
  itemCodesMap,
  availableDestinationUnits,
  onTransferComplete,
}: TransferItemsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Transfer-specific state
  const [transferDirection, setTransferDirection] = useState<"to" | "from">("to");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [transferTargetUnitId, setTransferTargetUnitId] = useState<string>("");
  const [transferSearchTerm, setTransferSearchTerm] = useState("");
  const [transferScanner, setTransferScanner] = useState(false);

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
  const sourceUnitCodesMap = React.useMemo(() => {
    const map = new Map<string, { gtin?: string; pharmacode?: string }>();
    for (const code of sourceUnitCodesData) {
      map.set(code.itemId, {
        gtin: code.gtin || undefined,
        pharmacode: code.pharmacode || undefined,
      });
    }
    return map;
  }, [sourceUnitCodesData]);

  // Get the appropriate items and codes based on transfer direction
  const transferSourceItems = transferDirection === 'from' ? sourceUnitItems : items;
  const transferSourceCodesMap = transferDirection === 'from' ? sourceUnitCodesMap : itemCodesMap;

  // Transfer items mutation
  const transferItemsMutation = useMutation({
    mutationFn: async (data: {
      sourceUnitId: string;
      destinationUnitId: string;
      items: Array<{
        itemId: string;
        transferType: 'packs' | 'units';
        transferQty: number;
        pharmacode?: string;
        gtin?: string;
      }>;
    }) => {
      const response = await apiRequest("POST", "/api/items/transfer", {
        ...data,
        hospitalId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      handleClose();
      toast({
        title: t('items.transferSuccess', 'Transfer Complete'),
        description: t('items.transferSuccessDesc', `Successfully transferred ${data.transferredCount || transferItems.length} item(s)`),
      });
      onTransferComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.transferFailed', 'Failed to transfer items'),
        variant: "destructive",
      });
    },
  });

  const resetState = useCallback(() => {
    setTransferItems([]);
    setTransferTargetUnitId("");
    setTransferSearchTerm("");
    setTransferDirection('to');
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    resetState();
  }, [onOpenChange, resetState]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  }, [onOpenChange, resetState]);

  const handleConfirmTransfer = useCallback(() => {
    if (transferTargetUnitId && transferItems.length > 0 && unitId) {
      const sourceUnitId = transferDirection === 'to'
        ? unitId
        : transferTargetUnitId;
      const destinationUnitId = transferDirection === 'to'
        ? transferTargetUnitId
        : unitId;

      transferItemsMutation.mutate({
        sourceUnitId,
        destinationUnitId,
        items: transferItems.map(item => ({
          itemId: item.itemId,
          transferType: item.transferType,
          transferQty: item.transferQty,
          pharmacode: item.pharmacode,
          gtin: item.gtin,
        })),
      });
    }
  }, [transferTargetUnitId, transferItems, unitId, transferDirection, transferItemsMutation]);

  const handleBarcodeScan = useCallback((code: string) => {
    setTransferScanner(false);

    // Find item by pharmacode or GTIN
    let foundItem: ItemWithStock | undefined;
    let foundCodes: { gtin?: string; pharmacode?: string } | undefined;

    for (const item of items) {
      const codes = itemCodesMap.get(item.id);
      if (codes?.pharmacode === code || codes?.gtin === code) {
        foundItem = item;
        foundCodes = codes;
        break;
      }
    }

    if (foundItem && !transferItems.some(ti => ti.itemId === foundItem!.id)) {
      setTransferItems(prev => [...prev, {
        itemId: foundItem!.id,
        name: foundItem!.name,
        packSize: foundItem!.packSize || 1,
        trackExactQuantity: foundItem!.trackExactQuantity || false,
        currentUnits: foundItem!.currentUnits || 0,
        stockQty: foundItem!.stockLevel?.qtyOnHand || 0,
        transferType: 'packs',
        transferQty: 1,
        pharmacode: foundCodes?.pharmacode,
        gtin: foundCodes?.gtin,
      }]);
      toast({
        title: t('items.itemAdded', 'Item Added'),
        description: foundItem.name,
      });
    } else if (foundItem) {
      toast({
        title: t('items.itemAlreadyAdded', 'Item Already Added'),
        description: foundItem.name,
      });
    } else {
      toast({
        title: t('items.itemNotFound', 'Item Not Found'),
        description: t('items.noItemMatchesCode', 'No item matches this code'),
        variant: "destructive",
      });
    }
  }, [items, itemCodesMap, transferItems, toast, t]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('items.transferItems', 'Transfer Items')}</DialogTitle>
            <DialogDescription>
              {t('items.transferItemsDesc', 'Move items between hospital units. Items will be matched by pharmacode/GTIN at the destination.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Transfer Direction Selection */}
            <div className="space-y-2">
              <Label>{t('items.transferDirection', 'Transfer Direction')}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={transferDirection === 'to' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => {
                    setTransferDirection('to');
                    setTransferItems([]);
                  }}
                  data-testid="button-transfer-direction-to"
                >
                  <ArrowRight className="h-4 w-4 mr-2" />
                  {t('items.transferTo', 'Transfer To')}
                </Button>
                <Button
                  type="button"
                  variant={transferDirection === 'from' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => {
                    setTransferDirection('from');
                    setTransferItems([]);
                  }}
                  data-testid="button-transfer-direction-from"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t('items.transferFrom', 'Transfer From')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {transferDirection === 'to'
                  ? t('items.transferToDesc', 'Send items from this unit to the selected unit')
                  : t('items.transferFromDesc', 'Receive items from the selected unit to this unit')
                }
              </p>
            </div>

            {/* Target Unit Selection */}
            <div className="space-y-2">
              <Label>
                {transferDirection === 'to'
                  ? t('items.destinationUnit', 'Destination Unit')
                  : t('items.sourceUnit', 'Source Unit')
                }
              </Label>
              <Select value={transferTargetUnitId} onValueChange={(value) => {
                setTransferTargetUnitId(value);
                if (transferDirection === 'from') {
                  setTransferItems([]);
                }
              }}>
                <SelectTrigger data-testid="select-target-unit">
                  <SelectValue placeholder={
                    transferDirection === 'to'
                      ? t('items.selectDestinationUnit', 'Select destination unit...')
                      : t('items.selectSourceUnit', 'Select source unit...')
                  } />
                </SelectTrigger>
                <SelectContent>
                  {availableDestinationUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item Search/Add */}
            <div className="space-y-2">
              <Label>{t('items.addItemsToTransfer', 'Add Items to Transfer')}</Label>

              {/* Show message if 'from' direction but no source unit selected */}
              {transferDirection === 'from' && !transferTargetUnitId && (
                <div className="p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground">
                  {t('items.selectSourceFirst', 'Please select a source unit first')}
                </div>
              )}

              {/* Show loading state when fetching source unit items */}
              {transferDirection === 'from' && transferTargetUnitId && isLoadingSourceItems && (
                <div className="p-4 border rounded-lg text-center">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  {t('items.loadingItems', 'Loading items...')}
                </div>
              )}

              {/* Show search when ready */}
              {(transferDirection === 'to' || (transferDirection === 'from' && transferTargetUnitId && !isLoadingSourceItems)) && (
                <>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t('items.searchByNameOrCode', 'Search by name, pharmacode, or GTIN...')}
                        value={transferSearchTerm}
                        onChange={(e) => setTransferSearchTerm(e.target.value)}
                        className="pl-10"
                        data-testid="input-transfer-search"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setTransferScanner(true)}
                      data-testid="button-transfer-scan"
                    >
                      <i className="fas fa-barcode"></i>
                    </Button>
                  </div>

                  {/* Filtered Items List for Selection */}
                  {transferSearchTerm.trim() && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {transferSourceItems
                        .filter(item => {
                          const search = transferSearchTerm.toLowerCase();
                          const codes = transferSourceCodesMap.get(item.id);
                          const alreadyAdded = transferItems.some(ti => ti.itemId === item.id);
                          if (alreadyAdded) return false;

                          return (
                            item.name.toLowerCase().includes(search) ||
                            codes?.pharmacode?.toLowerCase().includes(search) ||
                            codes?.gtin?.toLowerCase().includes(search)
                          );
                        })
                        .slice(0, 10)
                        .map(item => {
                          const codes = transferSourceCodesMap.get(item.id);
                          const stockQty = item.stockLevel?.qtyOnHand || 0;

                          return (
                            <div
                              key={item.id}
                              className="p-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                              onClick={() => {
                                setTransferItems(prev => [...prev, {
                                  itemId: item.id,
                                  name: item.name,
                                  packSize: item.packSize || 1,
                                  trackExactQuantity: item.trackExactQuantity || false,
                                  currentUnits: item.currentUnits || 0,
                                  stockQty,
                                  transferType: 'packs',
                                  transferQty: 1,
                                  pharmacode: codes?.pharmacode,
                                  gtin: codes?.gtin,
                                }]);
                                setTransferSearchTerm("");
                              }}
                              data-testid={`transfer-item-option-${item.id}`}
                            >
                              <div>
                                <p className="font-medium">{item.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {codes?.pharmacode && `PC: ${codes.pharmacode}`}
                                  {codes?.pharmacode && codes?.gtin && ' | '}
                                  {codes?.gtin && `GTIN: ${codes.gtin}`}
                                </p>
                              </div>
                              <div className="text-right text-sm">
                                <p>{t('items.stock')}: {stockQty}</p>
                                {item.trackExactQuantity && (
                                  <p className="text-muted-foreground">{t('items.units')}: {item.currentUnits || 0}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      {transferSourceItems.filter(item => {
                        const search = transferSearchTerm.toLowerCase();
                        const codes = transferSourceCodesMap.get(item.id);
                        const alreadyAdded = transferItems.some(ti => ti.itemId === item.id);
                        if (alreadyAdded) return false;
                        return (
                          item.name.toLowerCase().includes(search) ||
                          codes?.pharmacode?.toLowerCase().includes(search) ||
                          codes?.gtin?.toLowerCase().includes(search)
                        );
                      }).length === 0 && (
                        <div className="p-4 text-center text-muted-foreground">
                          {t('items.noItemsFound', 'No items found')}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Selected Items for Transfer */}
            {transferItems.length > 0 && (
              <div className="space-y-2">
                <Label>{t('items.itemsToTransfer', 'Items to Transfer')} ({transferItems.length})</Label>
                <div className="space-y-2">
                  {transferItems.map((item, idx) => (
                    <div key={item.itemId} className="border rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.pharmacode && `PC: ${item.pharmacode}`}
                            {item.pharmacode && item.gtin && ' | '}
                            {item.gtin && `GTIN: ${item.gtin}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setTransferItems(prev => prev.filter((_, i) => i !== idx));
                          }}
                          data-testid={`remove-transfer-item-${item.itemId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Transfer Type Selection (for trackExactQuantity items) */}
                        {item.trackExactQuantity && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">{t('items.transferAs', 'Transfer as')}:</Label>
                            <Select
                              value={item.transferType}
                              onValueChange={(value: 'packs' | 'units') => {
                                setTransferItems(prev => prev.map((ti, i) =>
                                  i === idx ? { ...ti, transferType: value, transferQty: 1 } : ti
                                ));
                              }}
                            >
                              <SelectTrigger className="w-24 h-8" data-testid={`select-transfer-type-${item.itemId}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="packs">{t('items.packs', 'Packs')}</SelectItem>
                                <SelectItem value="units">{t('items.units', 'Units')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Quantity Input */}
                        <div className="flex items-center gap-2 flex-1">
                          <Label className="text-sm whitespace-nowrap">
                            {item.transferType === 'units' ? t('items.units', 'Units') : t('items.qty', 'Qty')}:
                          </Label>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setTransferItems(prev => prev.map((ti, i) =>
                                  i === idx ? { ...ti, transferQty: Math.max(1, ti.transferQty - 1) } : ti
                                ));
                              }}
                              data-testid={`decrease-qty-${item.itemId}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min="1"
                              max={item.transferType === 'units' ? item.currentUnits : item.stockQty}
                              value={item.transferQty}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1;
                                const max = item.transferType === 'units' ? item.currentUnits : item.stockQty;
                                setTransferItems(prev => prev.map((ti, i) =>
                                  i === idx ? { ...ti, transferQty: Math.min(Math.max(1, val), max) } : ti
                                ));
                              }}
                              className="w-16 h-8 text-center"
                              data-testid={`input-transfer-qty-${item.itemId}`}
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                const max = item.transferType === 'units' ? item.currentUnits : item.stockQty;
                                setTransferItems(prev => prev.map((ti, i) =>
                                  i === idx ? { ...ti, transferQty: Math.min(ti.transferQty + 1, max) } : ti
                                ));
                              }}
                              data-testid={`increase-qty-${item.itemId}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            / {item.transferType === 'units' ? item.currentUnits : item.stockQty} {t('items.available', 'available')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel-transfer"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConfirmTransfer}
              disabled={!transferTargetUnitId || transferItems.length === 0 || transferItemsMutation.isPending}
              data-testid="button-confirm-transfer"
            >
              {transferItemsMutation.isPending ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <ArrowRightLeft className="h-4 w-4 mr-2" />
              )}
              {t('items.confirmTransfer', 'Transfer Items')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transfer Items Barcode Scanner */}
      <BarcodeScanner
        isOpen={transferScanner}
        onClose={() => setTransferScanner(false)}
        onScan={handleBarcodeScan}
        onManualEntry={() => {
          setTransferScanner(false);
        }}
      />
    </>
  );
});
