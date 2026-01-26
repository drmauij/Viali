import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, X, Pencil, Check, Layers, Search, Package, Pill, FileText, Play, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type AnesthesiaSet = {
  id: string;
  name: string;
  description: string | null;
  hospitalId: string;
  isActive: boolean;
  createdAt: string;
};

type TechniqueItem = {
  id: string;
  itemType: string;
  itemValue: string;
  sortOrder: number;
};

type MedicationItem = {
  id: string;
  medicationConfigId: string;
  customDose: string | null;
  sortOrder: number;
  itemName?: string;
  defaultDose?: string | null;
  administrationUnit?: string | null;
};

type InventoryItem = {
  id: string;
  itemId: string;
  quantity: number;
  sortOrder: number;
  itemName?: string;
};

type AnesthesiaSetWithDetails = AnesthesiaSet & {
  items: TechniqueItem[];
  medications: MedicationItem[];
  inventoryItems: InventoryItem[];
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

type InventoryItemOption = {
  id: string;
  name: string;
};

interface UnifiedAnesthesiaSetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  recordId?: string;
  isAdmin: boolean;
  onSetApplied?: () => void;
}

const TECHNIQUE_OPTIONS = [
  { type: 'installation', values: ['peripheral', 'arterial', 'central', 'bladder'], label: 'Installation' },
  { type: 'technique', values: ['general', 'sedation', 'regional', 'local', 'mac'], label: 'General Anesthesia' },
  { type: 'airway', values: ['lma', 'ett', 'mask', 'nasal', 'fiberoptic'], label: 'Airway Management' },
  { type: 'neuraxial', values: ['spinal', 'epidural', 'cse'], label: 'Neuraxial Anesthesia' },
  { type: 'peripheral_block', values: ['interscalene', 'supraclavicular', 'infraclavicular', 'axillary', 'femoral', 'adductor_canal', 'popliteal', 'ankle', 'tap', 'erector_spinae', 'pecs', 'serratus'], label: 'Peripheral Block' },
  { type: 'asa_status', values: ['1', '2', '3', '4', '5', '6'], label: 'ASA Status' },
  { type: 'mallampati', values: ['1', '2', '3', '4'], label: 'Mallampati' },
];

export function UnifiedAnesthesiaSetsDialog({
  open,
  onOpenChange,
  hospitalId,
  recordId,
  isAdmin,
  onSetApplied,
}: UnifiedAnesthesiaSetsDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"apply" | "manage">(isAdmin ? "manage" : "apply");
  const [editingSet, setEditingSet] = useState<AnesthesiaSetWithDetails | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [applyingSetId, setApplyingSetId] = useState<string | null>(null);
  
  const [pendingTechniques, setPendingTechniques] = useState<Array<{ itemType: string; itemValue: string }>>([]);
  const [pendingMedications, setPendingMedications] = useState<Array<{ medicationConfigId: string; itemName: string; customDose: string | null; defaultDose: string | null; unit: string | null }>>([]);
  const [pendingInventory, setPendingInventory] = useState<Array<{ itemId: string; itemName: string; quantity: number }>>([]);
  
  const [techniqueType, setTechniqueType] = useState<string>("");
  const [techniqueValue, setTechniqueValue] = useState<string>("");
  const [medSearchQuery, setMedSearchQuery] = useState("");
  const [invSearchQuery, setInvSearchQuery] = useState("");
  const [editingMedIdx, setEditingMedIdx] = useState<number | null>(null);
  const [editDoseValue, setEditDoseValue] = useState("");
  const [editingInvIdx, setEditingInvIdx] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  const { data: sets = [], isLoading: isLoadingSets } = useQuery<AnesthesiaSet[]>({
    queryKey: ['/api/anesthesia-sets', hospitalId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia-sets/${hospitalId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch sets');
      return response.json();
    },
    enabled: open && !!hospitalId,
  });

  const { data: availableMedications = [], isLoading: isLoadingMeds } = useQuery<AvailableMedication[]>({
    queryKey: ['/api/anesthesia/items', hospitalId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/items/${hospitalId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch medications');
      const data = await response.json();
      return data.map((item: any) => ({
        id: item.medicationConfigId || item.id,
        itemName: item.name,
        defaultDose: item.defaultDose,
        administrationUnit: item.administrationUnit,
      })).filter((item: any) => item.itemName);
    },
    enabled: open && !!hospitalId,
  });

  const { data: inventoryItems = [], isLoading: isLoadingInv } = useQuery<InventoryItemOption[]>({
    queryKey: ['/api/items', hospitalId, 'anesthesia'],
    queryFn: async () => {
      const response = await fetch(`/api/items/${hospitalId}?module=anesthesia`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch inventory items');
      return response.json();
    },
    enabled: open && !!hospitalId,
  });

  const createSetMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; items: any[]; medications: any[]; inventoryItems: any[] }) => {
      return apiRequest('POST', '/api/anesthesia-sets', {
        hospitalId,
        ...data,
      });
    },
    onSuccess: () => {
      toast({
        title: t("common.success", "Success"),
        description: t("anesthesia.sets.createSuccess", "Set created successfully"),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia-sets', hospitalId] });
      resetForm();
      setShowCreateForm(false);
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.createError", "Failed to create set"),
        variant: "destructive",
      });
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: async (data: { setId: string; payload: any }) => {
      return apiRequest('PATCH', `/api/anesthesia-sets/${data.setId}`, data.payload);
    },
    onSuccess: () => {
      toast({
        title: t("common.success", "Success"),
        description: t("anesthesia.sets.updateSuccess", "Set updated successfully"),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia-sets', hospitalId] });
      resetForm();
      setEditingSet(null);
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.updateError", "Failed to update set"),
        variant: "destructive",
      });
    },
  });

  const deleteSetMutation = useMutation({
    mutationFn: async (setId: string) => {
      return apiRequest('DELETE', `/api/anesthesia-sets/${setId}`);
    },
    onSuccess: () => {
      toast({
        title: t("common.success", "Success"),
        description: t("anesthesia.sets.deleteSuccess", "Set deleted successfully"),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia-sets', hospitalId] });
    },
    onError: () => {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.deleteError", "Failed to delete set"),
        variant: "destructive",
      });
    },
  });

  const applySetMutation = useMutation({
    mutationFn: async (setId: string) => {
      setApplyingSetId(setId);
      return apiRequest('POST', `/api/anesthesia-sets/${setId}/apply/${recordId}`);
    },
    onSuccess: () => {
      setApplyingSetId(null);
      toast({
        title: t("common.success", "Success"),
        description: t("anesthesia.sets.applySuccess", "Set applied successfully"),
      });
      onSetApplied?.();
      onOpenChange(false);
    },
    onError: () => {
      setApplyingSetId(null);
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.sets.applyError", "Failed to apply set"),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNewSetName("");
    setNewSetDescription("");
    setPendingTechniques([]);
    setPendingMedications([]);
    setPendingInventory([]);
    setTechniqueType("");
    setTechniqueValue("");
    setMedSearchQuery("");
    setInvSearchQuery("");
  };

  const handleStartEdit = async (set: AnesthesiaSet) => {
    const response = await fetch(`/api/anesthesia-sets/set/${set.id}`, {
      credentials: 'include'
    });
    if (response.ok) {
      const setWithDetails: AnesthesiaSetWithDetails = await response.json();
      setEditingSet(setWithDetails);
      setNewSetName(setWithDetails.name);
      setNewSetDescription(setWithDetails.description || "");
      setPendingTechniques(setWithDetails.items.map(item => ({
        itemType: item.itemType,
        itemValue: item.itemValue,
      })));
      setPendingMedications(setWithDetails.medications.map(med => ({
        medicationConfigId: med.medicationConfigId,
        itemName: med.itemName || 'Unknown',
        customDose: med.customDose,
        defaultDose: med.defaultDose || null,
        unit: med.administrationUnit || null,
      })));
      setPendingInventory(setWithDetails.inventoryItems.map(inv => ({
        itemId: inv.itemId,
        itemName: inv.itemName || 'Unknown',
        quantity: inv.quantity,
      })));
    }
  };

  const handleAddTechnique = () => {
    if (!techniqueType || !techniqueValue) return;
    if (pendingTechniques.some(t => t.itemType === techniqueType && t.itemValue === techniqueValue)) return;
    setPendingTechniques([...pendingTechniques, { itemType: techniqueType, itemValue: techniqueValue }]);
    setTechniqueType("");
    setTechniqueValue("");
  };

  const handleAddMedication = (med: AvailableMedication) => {
    if (pendingMedications.some(m => m.medicationConfigId === med.id)) return;
    setPendingMedications([...pendingMedications, {
      medicationConfigId: med.id,
      itemName: med.itemName,
      customDose: null,
      defaultDose: med.defaultDose,
      unit: med.administrationUnit,
    }]);
    setMedSearchQuery("");
  };

  const handleAddInventoryItem = (item: InventoryItemOption) => {
    if (pendingInventory.some(i => i.itemId === item.id)) return;
    setPendingInventory([...pendingInventory, {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
    }]);
    setInvSearchQuery("");
  };

  const handleCreateSet = () => {
    if (!newSetName.trim()) return;
    createSetMutation.mutate({
      name: newSetName.trim(),
      description: newSetDescription.trim(),
      items: pendingTechniques.map((t, idx) => ({
        itemType: t.itemType,
        itemValue: t.itemValue,
        sortOrder: idx,
      })),
      medications: pendingMedications.map((m, idx) => ({
        medicationConfigId: m.medicationConfigId,
        customDose: m.customDose,
        sortOrder: idx,
      })),
      inventoryItems: pendingInventory.map((i, idx) => ({
        itemId: i.itemId,
        quantity: i.quantity,
        sortOrder: idx,
      })),
    });
  };

  const handleUpdateSet = () => {
    if (!editingSet || !newSetName.trim()) return;
    updateSetMutation.mutate({
      setId: editingSet.id,
      payload: {
        name: newSetName.trim(),
        description: newSetDescription.trim(),
        items: pendingTechniques.map((t, idx) => ({
          itemType: t.itemType,
          itemValue: t.itemValue,
          sortOrder: idx,
        })),
        medications: pendingMedications.map((m, idx) => ({
          medicationConfigId: m.medicationConfigId,
          customDose: m.customDose,
          sortOrder: idx,
        })),
        inventoryItems: pendingInventory.map((i, idx) => ({
          itemId: i.itemId,
          quantity: i.quantity,
          sortOrder: idx,
        })),
      },
    });
  };

  const formatTechniqueLabel = (type: string, value: string) => {
    const typeLabel = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const valueLabel = value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `${typeLabel}: ${valueLabel}`;
  };

  const filteredMedications = availableMedications.filter(med =>
    (med.itemName || '').toLowerCase().includes(medSearchQuery.toLowerCase()) &&
    !pendingMedications.some(m => m.medicationConfigId === med.id)
  );

  const filteredInventory = inventoryItems.filter(item =>
    (item.name || '').toLowerCase().includes(invSearchQuery.toLowerCase()) &&
    !pendingInventory.some(i => i.itemId === item.id)
  );

  const selectedTechniqueOption = TECHNIQUE_OPTIONS.find(t => t.type === techniqueType);

  const renderSetForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          placeholder={t("anesthesia.sets.setName", "Set Name")}
          value={newSetName}
          onChange={(e) => setNewSetName(e.target.value)}
          data-testid="input-set-name"
        />
        <Textarea
          placeholder={t("anesthesia.sets.description", "Description (optional)")}
          value={newSetDescription}
          onChange={(e) => setNewSetDescription(e.target.value)}
          rows={2}
          data-testid="input-set-description"
        />
      </div>

      <Accordion type="multiple" defaultValue={["techniques", "medications", "inventory"]} className="w-full">
        <AccordionItem value="techniques">
          <AccordionTrigger className="text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {t("anesthesia.sets.techniques", "Documentation/Techniques")}
              {pendingTechniques.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingTechniques.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={techniqueType} onValueChange={(v) => { setTechniqueType(v); setTechniqueValue(""); }}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("anesthesia.sets.selectType", "Select type...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TECHNIQUE_OPTIONS.map(opt => (
                      <SelectItem key={opt.type} value={opt.type}>
                        {opt.label || opt.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={techniqueValue} onValueChange={setTechniqueValue} disabled={!techniqueType}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("anesthesia.sets.selectValue", "Select value...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTechniqueOption?.values.map(val => (
                      <SelectItem key={val} value={val}>
                        {val.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddTechnique} disabled={!techniqueType || !techniqueValue} size="icon" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {pendingTechniques.map((t, idx) => (
                  <Badge key={idx} variant="outline" className="flex items-center gap-1">
                    {formatTechniqueLabel(t.itemType, t.itemValue)}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setPendingTechniques(pendingTechniques.filter((_, i) => i !== idx))} />
                  </Badge>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="medications">
          <AccordionTrigger className="text-sm">
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4" />
              {t("anesthesia.sets.medications", "Medications")}
              {pendingMedications.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingMedications.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("anesthesia.sets.searchMedications", "Search medications...")}
                  value={medSearchQuery}
                  onChange={(e) => setMedSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-medications"
                />
              </div>
              {medSearchQuery && filteredMedications.length > 0 && (
                <ScrollArea className="h-32 border rounded-md p-2">
                  {filteredMedications.slice(0, 10).map(med => (
                    <div
                      key={med.id}
                      className="flex items-center justify-between p-1 hover:bg-muted rounded cursor-pointer"
                      onClick={() => handleAddMedication(med)}
                      data-testid={`medication-option-${med.id}`}
                    >
                      <span className="text-sm">{med.itemName}</span>
                      <span className="text-xs text-muted-foreground">{med.defaultDose} {med.administrationUnit}</span>
                    </div>
                  ))}
                </ScrollArea>
              )}
              <div className="space-y-1">
                {pendingMedications.map((med, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-muted/50 rounded p-2">
                    <span className="text-sm">{med.itemName}</span>
                    <div className="flex items-center gap-2">
                      {editingMedIdx === idx ? (
                        <>
                          <Input
                            value={editDoseValue}
                            onChange={(e) => setEditDoseValue(e.target.value)}
                            className="w-20 h-7 text-sm"
                            data-testid={`input-dose-${idx}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const newMeds = [...pendingMedications];
                              newMeds[idx] = { ...newMeds[idx], customDose: editDoseValue.trim() || null };
                              setPendingMedications(newMeds);
                              setEditingMedIdx(null);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="cursor-pointer" onClick={() => {
                            setEditingMedIdx(idx);
                            setEditDoseValue(med.customDose || med.defaultDose || "");
                          }}>
                            {med.customDose || med.defaultDose || '-'} {med.unit}
                            <Pencil className="h-3 w-3 ml-1" />
                          </Badge>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPendingMedications(pendingMedications.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="inventory">
          <AccordionTrigger className="text-sm">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              {t("anesthesia.sets.inventory", "Inventory Items")}
              {pendingInventory.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pendingInventory.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("anesthesia.sets.searchInventory", "Search inventory...")}
                  value={invSearchQuery}
                  onChange={(e) => setInvSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-inventory"
                />
              </div>
              {invSearchQuery && filteredInventory.length > 0 && (
                <ScrollArea className="h-32 border rounded-md p-2">
                  {filteredInventory.slice(0, 10).map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-1 hover:bg-muted rounded cursor-pointer"
                      onClick={() => handleAddInventoryItem(item)}
                      data-testid={`inventory-option-${item.id}`}
                    >
                      <span className="text-sm">{item.name}</span>
                    </div>
                  ))}
                </ScrollArea>
              )}
              <div className="space-y-1">
                {pendingInventory.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-muted/50 rounded p-2">
                    <span className="text-sm">{item.itemName}</span>
                    <div className="flex items-center gap-2">
                      {editingInvIdx === idx ? (
                        <>
                          <Input
                            type="number"
                            min="1"
                            value={editQtyValue}
                            onChange={(e) => setEditQtyValue(e.target.value)}
                            className="w-16 h-7 text-sm"
                            data-testid={`input-qty-${idx}`}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const newInv = [...pendingInventory];
                              newInv[idx] = { ...newInv[idx], quantity: parseInt(editQtyValue) || 1 };
                              setPendingInventory(newInv);
                              setEditingInvIdx(null);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="cursor-pointer" onClick={() => {
                            setEditingInvIdx(idx);
                            setEditQtyValue(String(item.quantity));
                          }}>
                            x{item.quantity}
                            <Pencil className="h-3 w-3 ml-1" />
                          </Badge>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setPendingInventory(pendingInventory.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );

  const renderFormFooter = () => (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => {
          resetForm();
          setShowCreateForm(false);
          setEditingSet(null);
        }}
        data-testid="button-cancel-set"
      >
        {t("common.cancel", "Cancel")}
      </Button>
      <Button
        onClick={editingSet ? handleUpdateSet : handleCreateSet}
        disabled={!newSetName.trim() || createSetMutation.isPending || updateSetMutation.isPending}
        data-testid="button-save-set"
      >
        {(createSetMutation.isPending || updateSetMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {editingSet ? t("common.save", "Save") : t("common.create", "Create")}
      </Button>
    </div>
  );

  const renderSetList = () => (
    <div className="space-y-2">
      {isLoadingSets ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : sets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("anesthesia.sets.noSets", "No sets available")}
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          {sets.map(set => (
            <div
              key={set.id}
              className="flex items-center justify-between p-3 border rounded-lg mb-2 hover:bg-muted/50"
              data-testid={`set-item-${set.id}`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-medium">{set.name}</span>
                </div>
                {set.description && (
                  <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {activeTab === "apply" && recordId ? (
                  <Button
                    size="sm"
                    onClick={() => applySetMutation.mutate(set.id)}
                    disabled={applyingSetId === set.id}
                    data-testid={`button-apply-set-${set.id}`}
                  >
                    {applyingSetId === set.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1" />
                        {t("anesthesia.sets.apply", "Apply")}
                      </>
                    )}
                  </Button>
                ) : isAdmin && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => handleStartEdit(set)} data-testid={`button-edit-set-${set.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteSetMutation.mutate(set.id)} data-testid={`button-delete-set-${set.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </ScrollArea>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        resetForm();
        setEditingSet(null);
        setShowCreateForm(false);
      }
      onOpenChange(o);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t("anesthesia.sets.title", "Anesthesia Sets")}
          </DialogTitle>
          <DialogDescription>
            {t("anesthesia.sets.description", "Pre-configured bundles of techniques, medications, and inventory items")}
          </DialogDescription>
        </DialogHeader>

        {isAdmin && !editingSet && !showCreateForm ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "apply" | "manage")} className="flex-1 flex flex-col overflow-hidden px-6 pb-6">
            <TabsList className="grid w-full grid-cols-2 mt-4">
              <TabsTrigger value="apply" disabled={!recordId} data-testid="tab-apply">
                <Play className="h-4 w-4 mr-2" />
                {t("anesthesia.sets.applyTab", "Apply to Record")}
              </TabsTrigger>
              <TabsTrigger value="manage" data-testid="tab-manage">
                <Settings className="h-4 w-4 mr-2" />
                {t("anesthesia.sets.manageTab", "Manage Sets")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="apply" className="flex-1 overflow-auto mt-4">
              {renderSetList()}
            </TabsContent>

            <TabsContent value="manage" className="flex-1 overflow-auto mt-4">
              <div className="mb-4">
                <Button onClick={() => setShowCreateForm(true)} data-testid="button-create-set">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("anesthesia.sets.createNew", "Create New Set")}
                </Button>
              </div>
              {renderSetList()}
            </TabsContent>
          </Tabs>
        ) : (editingSet || showCreateForm) ? (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {renderSetForm()}
            </div>
            <div className="px-6 py-4 border-t bg-background shrink-0">
              {renderFormFooter()}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto px-6 pb-6">
            {renderSetList()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
