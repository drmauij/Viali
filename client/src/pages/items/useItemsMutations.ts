import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ItemWithStock } from "./types";

interface UseItemsMutationsParams {
  hospitalId: string | undefined;
  unitId: string | undefined;
  t: any;
  toast: (props: { title: string; description?: string; variant?: "destructive" }) => void;
  // State setters needed by mutations
  setLicenseInfo: (info: any) => void;
  setUpgradeDialogOpen: (open: boolean) => void;
  setEditDialogOpen: (open: boolean) => void;
  setAddDialogOpen: (open: boolean) => void;
  setSaveAndCloseAdd: (v: boolean) => void;
  saveAndCloseAdd: boolean;
  resetForm: () => void;
  handleCloseEditDialog: () => void;
  setIsBulkDeleteMode: (v: boolean) => void;
  setSelectedItems: (v: Set<string>) => void;
  setShowDeleteConfirm: (v: boolean) => void;
  setBulkMoveDialogOpen: (v: boolean) => void;
  setBulkMoveTargetUnitId: (v: string) => void;
  setTransferDialogOpen: (v: boolean) => void;
  setTransferItems: (v: any[]) => void;
  setTransferTargetUnitId: (v: string) => void;
  setTransferDirection: (v: 'to' | 'from') => void;
  transferItems: any[];
  setBulkImportOpen: (v: boolean) => void;
  setImportJob: (v: any) => void;
  setBulkImages: (v: string[]) => void;
  setBulkItems: (v: any[]) => void;
  setIsBulkAnalyzing: (v: boolean) => void;
  setIsBulkEditMode: (v: boolean) => void;
  setBulkEditItems: (v: Record<string, any>) => void;
  setFolderDialogOpen: (v: boolean) => void;
  setEditingFolder: (v: any) => void;
  setFolderName: (v: string) => void;
}

export function useItemsMutations(params: UseItemsMutationsParams) {
  const {
    hospitalId,
    unitId,
    t,
    toast,
    setLicenseInfo,
    setUpgradeDialogOpen,
    setAddDialogOpen,
    saveAndCloseAdd,
    resetForm,
    handleCloseEditDialog,
    setIsBulkDeleteMode,
    setSelectedItems,
    setShowDeleteConfirm,
    setBulkMoveDialogOpen,
    setBulkMoveTargetUnitId,
    setTransferDialogOpen,
    setTransferItems,
    setTransferTargetUnitId,
    setTransferDirection,
    transferItems,
    setBulkImportOpen,
    setImportJob,
    setBulkImages,
    setBulkItems,
    setIsBulkEditMode,
    setBulkEditItems,
    setFolderDialogOpen,
    setEditingFolder,
    setFolderName,
  } = params;

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          hospitalId: hospitalId,
          unitId: unitId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "LICENSE_LIMIT_REACHED") {
          setLicenseInfo({
            currentCount: errorData.currentCount,
            limit: errorData.limit,
            licenseType: errorData.licenseType,
          });
          setUpgradeDialogOpen(true);
          return null;
        }
        throw new Error(errorData.message || t('items.failedToCreate'));
      }

      return await response.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      resetForm();
      if (saveAndCloseAdd) {
        setAddDialogOpen(false);
      }
      toast({
        title: t('common.success'),
        description: t('items.itemCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreate'),
        variant: "destructive",
      });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async (data: any) => {
      // Update item details - include active unitId for access control
      const response = await apiRequest("PATCH", `/api/items/${data.selectedItem?.id}`, {
        ...data.itemData,
        activeUnitId: unitId
      });
      const updatedItem = await response.json();

      // Update stock level if provided
      if (data.actualStock !== undefined && data.selectedItem) {
        const currentStock = data.selectedItem.stockLevel?.qtyOnHand || 0;
        const newStock = parseInt(data.actualStock);
        const delta = newStock - currentStock;

        await apiRequest("POST", "/api/stock/update", {
          itemId: data.selectedItem.id,
          qty: newStock,
          delta: delta,
          notes: "Stock updated via item edit",
          activeUnitId: unitId,
        });
      }

      return updatedItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}&includeArchived=true`, unitId] });
      toast({
        title: t('common.success'),
        description: t('items.itemUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToUpdate'),
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("DELETE", `/api/items/${itemId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      handleCloseEditDialog();
      toast({
        title: t('items.deleteItem'),
        description: t('items.itemDeletedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToDelete'),
        variant: "destructive",
      });
    },
  });

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
        hospitalId: hospitalId,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      setTransferDialogOpen(false);
      setTransferItems([]);
      setTransferTargetUnitId("");
      setTransferDirection('to');
      toast({
        title: t('items.transferSuccess', 'Transfer Complete'),
        description: t('items.transferSuccessDesc', `Successfully transferred ${data.transferredCount || transferItems.length} item(s)`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.transferFailed', 'Failed to transfer items'),
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const response = await apiRequest("POST", "/api/items/bulk-delete", { itemIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      toast({
        title: t('common.success'),
        description: `${data.deletedCount} items deleted successfully${data.failedCount > 0 ? ` (${data.failedCount} failed)` : ''}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || "Failed to delete items",
        variant: "destructive",
      });
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: async ({ itemIds, targetUnitId }: { itemIds: string[]; targetUnitId: string }) => {
      const response = await apiRequest("POST", "/api/items/bulk-move", {
        itemIds,
        targetUnitId,
        hospitalId: hospitalId
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      setBulkMoveDialogOpen(false);
      setBulkMoveTargetUnitId("");
      toast({
        title: t('common.success'),
        description: t('items.bulkMoveSuccess', `${data.movedCount || 0} item(s) moved successfully`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.bulkMoveFailed', 'Failed to move items'),
        variant: "destructive",
      });
    },
  });

  const bulkBillableMutation = useMutation({
    mutationFn: async ({ itemIds, isBillable }: { itemIds: string[]; isBillable: boolean }) => {
      const response = await apiRequest("PATCH", "/api/items/bulk-billable", {
        itemIds,
        isBillable,
        hospitalId: hospitalId
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      setIsBulkDeleteMode(false);
      setSelectedItems(new Set());
      toast({
        title: t('common.success'),
        description: t('items.bulkBillableSuccess', `${data.updatedCount || 0} item(s) updated successfully`),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.bulkBillableFailed', 'Failed to update items'),
        variant: "destructive",
      });
    },
  });

  const quickReduceMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("PATCH", `/api/items/${itemId}/reduce-unit`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      toast({
        title: t('common.success'),
        description: "Unit reduced successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || "Failed to reduce unit",
        variant: "destructive",
      });
    },
  });

  const quickOrderMutation = useMutation({
    mutationFn: async (data: { itemId: string; qty: number; packSize: number; vendorId?: string }) => {
      const response = await apiRequest("POST", "/api/orders/quick-add", {
        hospitalId: hospitalId,
        unitId: unitId,
        itemId: data.itemId,
        qty: data.qty,
        packSize: data.packSize,
        vendorId: data.vendorId || null,
      });
      return await response.json();
    },
    onSuccess: () => {
      // Invalidate orders query with the correct key format (matching Orders page)
      queryClient.invalidateQueries({ queryKey: [`/api/orders/${hospitalId}?unitId=${unitId}`, unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders/open-items/${hospitalId}`, unitId] });
      // Also invalidate logistic orders if applicable
      queryClient.invalidateQueries({ queryKey: [`/api/logistic/orders/${hospitalId}`] });
      toast({
        title: t('items.addedToOrder'),
        description: t('items.addedToDraftOrder'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreate'),
        variant: "destructive",
      });
    },
  });

  const createImportJobMutation = useMutation({
    mutationFn: async (images: string[]) => {
      const response = await apiRequest("POST", "/api/import-jobs", {
        images,
        hospitalId: hospitalId
      });
      return await response.json();
    },
    onSuccess: (data) => {
      // Close dialog and show notification
      setBulkImportOpen(false);

      // Set initial job state - BottomNav will handle polling
      const processingJob = {
        jobId: data.jobId,
        status: 'processing' as const,
        itemCount: data.totalImages
      };
      setImportJob(processingJob);
      localStorage.setItem(`import-job-${hospitalId}`, JSON.stringify(processingJob));
    },
    onError: (error: any) => {
      toast({
        title: t('items.analysisFailed'),
        description: error.message || t('items.failedToAnalyze'),
        variant: "destructive",
      });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await fetch("/api/items/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Active-Unit-Id": unitId || "",
        },
        body: JSON.stringify({
          items,
          hospitalId: hospitalId,
          unitId: unitId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === "LICENSE_LIMIT_REACHED") {
          setLicenseInfo({
            currentCount: errorData.currentCount,
            limit: errorData.limit,
            licenseType: errorData.licenseType,
          });
          setUpgradeDialogOpen(true);
          return null;
        }
        throw new Error(errorData.message || t('items.failedToImport'));
      }

      return await response.json();
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${hospitalId}?unitId=${unitId}`, unitId] });
      setBulkImportOpen(false);
      setBulkImages([]);
      setBulkItems([]);
      setImportJob(null);
      // Clear from localStorage so badge disappears
      if (hospitalId) {
        localStorage.removeItem(`import-job-${hospitalId}`);
      }
      toast({
        title: t('common.success'),
        description: t('items.itemsImportedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToImport'),
        variant: "destructive",
      });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async (items: any[]) => {
      const response = await apiRequest("PATCH", "/api/items/bulk-update", { items });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      setIsBulkEditMode(false);
      setBulkEditItems({});
      toast({
        title: t('common.success'),
        description: t('items.itemsUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToBulkUpdate'),
        variant: "destructive",
      });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async ({ name, hospitalId, unitId }: { name: string; hospitalId: string; unitId: string }) => {
      const response = await apiRequest("POST", "/api/folders", {
        name,
        hospitalId,
        unitId,
      });
      return await response.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${variables.hospitalId}?unitId=${variables.unitId}`, variables.unitId] });
      setFolderDialogOpen(false);
      setFolderName("");
      toast({
        title: t('common.success'),
        description: t('items.folderCreatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToCreateFolder'),
        variant: "destructive",
      });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const response = await apiRequest("PATCH", `/api/folders/${id}`, { name });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${hospitalId}?unitId=${unitId}`, unitId] });
      setFolderDialogOpen(false);
      setEditingFolder(null);
      setFolderName("");
      toast({
        title: t('common.success'),
        description: t('items.folderUpdatedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToUpdateFolder'),
        variant: "destructive",
      });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/folders/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${hospitalId}?unitId=${unitId}`, unitId] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
      toast({
        title: t('common.success'),
        description: t('items.folderDeletedSuccess'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToDeleteFolder'),
        variant: "destructive",
      });
    },
  });

  const updateFoldersSortMutation = useMutation({
    mutationFn: async (folders: { id: string; sortOrder: number }[]) => {
      const response = await apiRequest("PATCH", "/api/folders/bulk-sort", { folders });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/folders/${hospitalId}?unitId=${unitId}`, unitId] });
    },
  });

  const moveItemMutation = useMutation({
    mutationFn: async ({ itemId, folderId }: { itemId: string; folderId: string | null }) => {
      const response = await apiRequest("PATCH", `/api/items/${itemId}`, { folderId });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`, unitId] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('items.failedToMove'),
        variant: "destructive",
      });
    },
  });

  return {
    createItemMutation,
    updateItemMutation,
    deleteItemMutation,
    transferItemsMutation,
    bulkDeleteMutation,
    bulkMoveMutation,
    bulkBillableMutation,
    quickReduceMutation,
    quickOrderMutation,
    createImportJobMutation,
    bulkCreateMutation,
    bulkUpdateMutation,
    createFolderMutation,
    updateFolderMutation,
    deleteFolderMutation,
    updateFoldersSortMutation,
    moveItemMutation,
  };
}
