import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, X, Pencil, Check, Layers, Search, PackagePlus } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MedicationSet = {
  id: string;
  name: string;
  description: string | null;
  hospitalId: string;
  unitId: string | null;
  sortOrder: number;
  createdAt: string;
};

type MedicationSetItem = {
  id: string;
  medicationConfigId: string;
  customDose: string | null;
  sortOrder: number;
  itemId: string;
  itemName: string;
  defaultDose: string | null;
  administrationUnit: string | null;
  administrationRoute: string | null;
  administrationGroup: string | null;
};

type MedicationSetWithItems = MedicationSet & {
  items: MedicationSetItem[];
};

type AvailableMedication = {
  id: string;
  itemId: string;
  itemName: string;
  defaultDose: string | null;
  administrationUnit: string | null;
  administrationRoute: string | null;
  administrationGroup: string | null;
};

interface MedicationSetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  recordId?: string;
  isAdmin: boolean;
  onSetApplied?: () => void;
}

export function MedicationSetsDialog({
  open,
  onOpenChange,
  hospitalId,
  recordId,
  isAdmin,
  onSetApplied,
}: MedicationSetsDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"apply" | "manage">(isAdmin ? "manage" : "apply");
  const [editingSet, setEditingSet] = useState<MedicationSetWithItems | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingItems, setPendingItems] = useState<Array<{ medicationConfigId: string; itemName: string; customDose: string | null; defaultDose: string | null; unit: string | null }>>([]);
  const [applyingSetId, setApplyingSetId] = useState<string | null>(null);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [editDoseValue, setEditDoseValue] = useState("");

  const { data: sets = [], isLoading: isLoadingSets } = useQuery<MedicationSet[]>({
    queryKey: ['/api/anesthesia/medication-sets', hospitalId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/medication-sets/${hospitalId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch medication sets');
      return response.json();
    },
    enabled: open && !!hospitalId,
  });

  const { data: availableMedications = [], isLoading: isLoadingMeds } = useQuery<AvailableMedication[]>({
    queryKey: ['/api/anesthesia/items', hospitalId, 'configured'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/items/${hospitalId}?configured=true`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch medications');
      const data = await response.json();
      // Map AnesthesiaItem to AvailableMedication format
      return data.map((item: { id: string; medicationConfigId?: string; name: string; defaultDose?: string | null; administrationUnit?: string | null; administrationRoute?: string | null; administrationGroup?: string | null }) => ({
        id: item.medicationConfigId || item.id,
        itemId: item.id,
        itemName: item.name,
        defaultDose: item.defaultDose || null,
        administrationUnit: item.administrationUnit || null,
        administrationRoute: item.administrationRoute || null,
        administrationGroup: item.administrationGroup || null,
      }));
    },
    enabled: open && !!hospitalId && (showCreateForm || editingSet !== null),
  });

  const createSetMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; items: Array<{ medicationConfigId: string; customDose: string | null }> }) => {
      return apiRequest('POST', '/api/anesthesia/medication-sets', {
        hospitalId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/medication-sets', hospitalId] });
      setShowCreateForm(false);
      setNewSetName("");
      setNewSetDescription("");
      setPendingItems([]);
      toast({
        title: t("anesthesia.sets.created", "Set Created"),
        description: t("anesthesia.sets.createdDescription", "The medication set has been created"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.createError", "Failed to create medication set"),
        variant: "destructive",
      });
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: async ({ setId, data }: { setId: string; data: { name: string; description: string; items: Array<{ medicationConfigId: string; customDose: string | null }> } }) => {
      return apiRequest('PATCH', `/api/anesthesia/medication-sets/${setId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/medication-sets', hospitalId] });
      setEditingSet(null);
      setPendingItems([]);
      toast({
        title: t("anesthesia.sets.updated", "Set Updated"),
        description: t("anesthesia.sets.updatedDescription", "The medication set has been updated"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.updateError", "Failed to update medication set"),
        variant: "destructive",
      });
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/medication-sets/${setId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/medication-sets', hospitalId] });
      toast({
        title: t("anesthesia.sets.deleted", "Set Deleted"),
        description: t("anesthesia.sets.deletedDescription", "The medication set has been deleted"),
      });
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.deleteError", "Failed to delete medication set"),
        variant: "destructive",
      });
    },
  });

  const applySetMutation = useMutation({
    mutationFn: async (setId: string) => {
      if (!recordId) throw new Error('No record ID');
      return apiRequest('POST', `/api/anesthesia/medications/${recordId}/apply-set`, { setId });
    },
    onSuccess: (data: any) => {
      setApplyingSetId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/medications', recordId] });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/record-medications', recordId] });
      onOpenChange(false);
      onSetApplied?.();
      toast({
        title: t("anesthesia.sets.applied", "Set Applied"),
        description: data.message || t("anesthesia.sets.appliedDescription", "Medications have been added to the record"),
      });
    },
    onError: () => {
      setApplyingSetId(null);
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.applyError", "Failed to apply medication set"),
        variant: "destructive",
      });
    },
  });

  const handleAddMedication = (med: AvailableMedication) => {
    if (pendingItems.some(item => item.medicationConfigId === med.id)) return;
    setPendingItems([...pendingItems, {
      medicationConfigId: med.id,
      itemName: med.itemName,
      customDose: null,
      defaultDose: med.defaultDose,
      unit: med.administrationUnit,
    }]);
    setSearchQuery("");
  };

  const handleRemovePendingItem = (idx: number) => {
    setPendingItems(pendingItems.filter((_, i) => i !== idx));
  };

  const handleCreateSet = () => {
    if (!newSetName.trim()) return;
    createSetMutation.mutate({
      name: newSetName.trim(),
      description: newSetDescription.trim(),
      items: pendingItems.map(item => ({
        medicationConfigId: item.medicationConfigId,
        customDose: item.customDose,
      })),
    });
  };

  const handleUpdateSet = () => {
    if (!editingSet || !newSetName.trim()) return;
    updateSetMutation.mutate({
      setId: editingSet.id,
      data: {
        name: newSetName.trim(),
        description: newSetDescription.trim(),
        items: pendingItems.map(item => ({
          medicationConfigId: item.medicationConfigId,
          customDose: item.customDose,
        })),
      },
    });
  };

  const handleStartEdit = async (set: MedicationSet) => {
    const response = await fetch(`/api/anesthesia/medication-sets/${hospitalId}/${set.id}`, {
      credentials: 'include'
    });
    if (response.ok) {
      const setWithItems: MedicationSetWithItems = await response.json();
      setEditingSet(setWithItems);
      setNewSetName(setWithItems.name);
      setNewSetDescription(setWithItems.description || "");
      setPendingItems(setWithItems.items.map(item => ({
        medicationConfigId: item.medicationConfigId,
        itemName: item.itemName,
        customDose: item.customDose,
        defaultDose: item.defaultDose,
        unit: item.administrationUnit,
      })));
    }
  };

  const handleStartEditDose = (idx: number) => {
    setEditingItemIdx(idx);
    setEditDoseValue(pendingItems[idx].customDose || pendingItems[idx].defaultDose || "");
  };

  const handleSaveDose = (idx: number) => {
    const newItems = [...pendingItems];
    newItems[idx] = { ...newItems[idx], customDose: editDoseValue.trim() || null };
    setPendingItems(newItems);
    setEditingItemIdx(null);
    setEditDoseValue("");
  };

  const filteredMedications = availableMedications.filter(med => 
    (med.itemName || '').toLowerCase().includes(searchQuery.toLowerCase()) &&
    !pendingItems.some(item => item.medicationConfigId === med.id)
  );

  const renderSetItemForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          placeholder={t("anesthesia.sets.setName", "Set Name")}
          value={newSetName}
          onChange={(e) => setNewSetName(e.target.value)}
          data-testid="input-set-name"
        />
        <Input
          placeholder={t("anesthesia.sets.description", "Description (optional)")}
          value={newSetDescription}
          onChange={(e) => setNewSetDescription(e.target.value)}
          data-testid="input-set-description"
        />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">{t("anesthesia.sets.medications", "Medications in Set")}</div>
        {pendingItems.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            {t("anesthesia.sets.noMedications", "No medications added yet")}
          </div>
        ) : (
          <ScrollArea className="h-[150px] border rounded-md p-2">
            <div className="space-y-2">
              {pendingItems.map((item, idx) => (
                <div key={item.medicationConfigId} className="flex items-center justify-between gap-2 py-1 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.itemName}</div>
                    {editingItemIdx === idx ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          value={editDoseValue}
                          onChange={(e) => setEditDoseValue(e.target.value)}
                          placeholder={item.defaultDose || "Dose"}
                          className="h-6 text-xs w-24"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveDose(idx);
                            if (e.key === 'Escape') setEditingItemIdx(null);
                          }}
                          data-testid={`input-custom-dose-${idx}`}
                        />
                        <span className="text-xs text-muted-foreground">{item.unit || ''}</span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleSaveDose(idx)}>
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingItemIdx(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleStartEditDose(idx)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                        data-testid={`button-edit-dose-${idx}`}
                      >
                        {item.customDose ? (
                          <span className="text-primary">{item.customDose} {item.unit} <Badge variant="outline" className="text-[10px] py-0 px-1">custom</Badge></span>
                        ) : (
                          <span>{item.defaultDose || '?'} {item.unit}</span>
                        )}
                      </button>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 w-6 p-0 shrink-0"
                    onClick={() => handleRemovePendingItem(idx)}
                    data-testid={`button-remove-item-${idx}`}
                  >
                    <X className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("anesthesia.sets.searchMedications", "Search medications to add...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search-medications"
          />
        </div>
        {searchQuery && (
          <ScrollArea className="h-[120px] border rounded-md">
            {isLoadingMeds ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : filteredMedications.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                {t("anesthesia.sets.noResults", "No medications found")}
              </div>
            ) : (
              <div className="p-1">
                {filteredMedications.slice(0, 10).map(med => (
                  <button
                    key={med.id}
                    onClick={() => handleAddMedication(med)}
                    className="w-full text-left px-2 py-1.5 hover:bg-muted rounded-sm flex items-center justify-between"
                    data-testid={`button-add-med-${med.id}`}
                  >
                    <span className="text-sm font-medium">{med.itemName}</span>
                    <span className="text-xs text-muted-foreground">{med.defaultDose} {med.administrationUnit}</span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setShowCreateForm(false);
            setEditingSet(null);
            setNewSetName("");
            setNewSetDescription("");
            setPendingItems([]);
            setSearchQuery("");
          }}
          data-testid="button-cancel-set"
        >
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          onClick={editingSet ? handleUpdateSet : handleCreateSet}
          disabled={!newSetName.trim() || pendingItems.length === 0 || createSetMutation.isPending || updateSetMutation.isPending}
          data-testid="button-save-set"
        >
          {(createSetMutation.isPending || updateSetMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editingSet ? t("common.save", "Save") : t("anesthesia.sets.create", "Create Set")}
        </Button>
      </div>
    </div>
  );

  const renderSetsList = (forApply: boolean) => (
    <div className="space-y-2">
      {isLoadingSets ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <div>{t("anesthesia.sets.noSets", "No medication sets configured")}</div>
          {isAdmin && !forApply && (
            <Button 
              className="mt-4" 
              onClick={() => setShowCreateForm(true)}
              data-testid="button-create-first-set"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("anesthesia.sets.createFirst", "Create First Set")}
            </Button>
          )}
        </div>
      ) : (
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 pr-4">
            {sets.map(set => (
              <div 
                key={set.id} 
                className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                data-testid={`set-item-${set.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{set.name}</div>
                    {set.description && (
                      <div className="text-sm text-muted-foreground">{set.description}</div>
                    )}
                  </div>
                  {forApply ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setApplyingSetId(set.id);
                        applySetMutation.mutate(set.id);
                      }}
                      disabled={!recordId || applySetMutation.isPending}
                      data-testid={`button-apply-set-${set.id}`}
                    >
                      {applyingSetId === set.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <PackagePlus className="w-4 h-4 mr-1" />
                          {t("anesthesia.sets.apply", "Apply")}
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStartEdit(set)}
                        data-testid={`button-edit-set-${set.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(t("anesthesia.sets.confirmDelete", "Are you sure you want to delete this set?"))) {
                            deleteSetMutation.mutate(set.id);
                          }
                        }}
                        disabled={deleteSetMutation.isPending}
                        data-testid={`button-delete-set-${set.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            {t("anesthesia.sets.title", "Medication Sets")}
          </DialogTitle>
          <DialogDescription>
            {isAdmin 
              ? t("anesthesia.sets.adminDescription", "Create and manage pre-defined medication bundles")
              : t("anesthesia.sets.userDescription", "Quickly add a group of medications to the record")}
          </DialogDescription>
        </DialogHeader>

        {isAdmin ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "apply" | "manage")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="apply" data-testid="tab-apply">
                {t("anesthesia.sets.apply", "Apply")}
              </TabsTrigger>
              <TabsTrigger value="manage" data-testid="tab-manage">
                {t("anesthesia.sets.manage", "Manage")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="apply" className="mt-4">
              {renderSetsList(true)}
            </TabsContent>
            <TabsContent value="manage" className="mt-4">
              {showCreateForm || editingSet ? (
                renderSetItemForm()
              ) : (
                <div className="space-y-4">
                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => setShowCreateForm(true)}
                    data-testid="button-create-new-set"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t("anesthesia.sets.createNew", "Create New Set")}
                  </Button>
                  {renderSetsList(false)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mt-4">
            {renderSetsList(true)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
