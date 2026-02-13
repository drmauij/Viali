import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Pencil, Layers, Search, Package, Play, Settings, X, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SurgerySetData = {
  id: string;
  name: string;
  description: string | null;
  hospitalId: string;
  intraOpData: Record<string, any> | null;
  isActive: boolean;
  createdAt: string;
  inventoryItems: { id: string; itemId: string; quantity: number; sortOrder: number; itemName: string }[];
};

type InventoryItemOption = {
  id: string;
  name: string;
};

interface SurgerySetsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  recordId?: string;
  isAdmin: boolean;
  onSetApplied?: () => void;
}

export function SurgerySetsDialog({
  open,
  onOpenChange,
  hospitalId,
  recordId,
  isAdmin,
  onSetApplied,
}: SurgerySetsDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(isAdmin ? "manage" : "apply");
  const [editingSet, setEditingSet] = useState<SurgerySetData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIntraOpData, setFormIntraOpData] = useState<Record<string, any>>({});
  const [formInventoryItems, setFormInventoryItems] = useState<{ itemId: string; quantity: number; itemName?: string }[]>([]);
  const [inventorySearch, setInventorySearch] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    positioning: true,
    disinfection: true,
    equipment: true,
    irrigation: false,
    infiltration: false,
    medications: false,
    dressing: false,
    drainage: false,
  });

  const { data: sets = [], isLoading: setsLoading } = useQuery<SurgerySetData[]>({
    queryKey: ['/api/surgery-sets', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/surgery-sets/${hospitalId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: open && !!hospitalId,
  });

  const { data: inventoryItems = [] } = useQuery<InventoryItemOption[]>({
    queryKey: ['/api/items', hospitalId, 'surgery'],
    queryFn: async () => {
      const res = await fetch(`/api/items/${hospitalId}?module=surgery`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: open && !!hospitalId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest('POST', '/api/surgery-sets', data),
    onSuccess: () => {
      toast({ title: t('surgery.sets.createSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/surgery-sets', hospitalId] });
      resetForm();
    },
    onError: () => {
      toast({ title: t('surgery.sets.createError'), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => apiRequest('PATCH', `/api/surgery-sets/${id}`, data),
    onSuccess: () => {
      toast({ title: t('surgery.sets.updateSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/surgery-sets', hospitalId] });
      resetForm();
    },
    onError: () => {
      toast({ title: t('surgery.sets.updateError'), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/surgery-sets/${id}`),
    onSuccess: () => {
      toast({ title: t('surgery.sets.deleteSuccess') });
      queryClient.invalidateQueries({ queryKey: ['/api/surgery-sets', hospitalId] });
    },
    onError: () => {
      toast({ title: t('surgery.sets.deleteError'), variant: "destructive" });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (setId: string) => apiRequest('POST', `/api/surgery-sets/${setId}/apply/${recordId}`),
    onSuccess: () => {
      toast({ title: t('surgery.sets.applySuccess') });
      onSetApplied?.();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t('surgery.sets.applyError'), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setEditingSet(null);
    setIsCreating(false);
    setFormName("");
    setFormDescription("");
    setFormIntraOpData({});
    setFormInventoryItems([]);
    setInventorySearch("");
  };

  const startEditing = (set: SurgerySetData) => {
    setEditingSet(set);
    setIsCreating(false);
    setFormName(set.name);
    setFormDescription(set.description || "");
    setFormIntraOpData(set.intraOpData || {});
    setFormInventoryItems(set.inventoryItems.map(i => ({ itemId: i.itemId, quantity: i.quantity, itemName: i.itemName })));
  };

  const startCreating = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return;

    const payload = {
      hospitalId,
      name: formName.trim(),
      description: formDescription.trim() || null,
      intraOpData: Object.keys(formIntraOpData).length > 0 ? formIntraOpData : null,
      inventoryItems: formInventoryItems.map(i => ({ itemId: i.itemId, quantity: i.quantity })),
    };

    if (editingSet) {
      updateMutation.mutate({ id: editingSet.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleIntraOpField = (section: string, field: string, value?: any) => {
    setFormIntraOpData(prev => {
      const sectionData = { ...(prev[section] || {}) };
      if (value !== undefined) {
        sectionData[field] = value;
      } else {
        sectionData[field] = !sectionData[field];
      }
      return { ...prev, [section]: sectionData };
    });
  };

  const toggleNestedField = (section: string, subsection: string, field: string) => {
    setFormIntraOpData(prev => {
      const sectionData = { ...(prev[section] || {}) };
      const subData = { ...(sectionData[subsection] || {}) };
      subData[field] = !subData[field];
      sectionData[subsection] = subData;
      return { ...prev, [section]: sectionData };
    });
  };

  const addInventoryItem = (item: InventoryItemOption) => {
    if (formInventoryItems.some(i => i.itemId === item.id)) return;
    setFormInventoryItems(prev => [...prev, { itemId: item.id, quantity: 1, itemName: item.name }]);
    setInventorySearch("");
  };

  const removeInventoryItem = (itemId: string) => {
    setFormInventoryItems(prev => prev.filter(i => i.itemId !== itemId));
  };

  const updateInventoryQty = (itemId: string, qty: number) => {
    setFormInventoryItems(prev => prev.map(i => i.itemId === itemId ? { ...i, quantity: Math.max(1, qty) } : i));
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const filteredInventoryItems = inventoryItems.filter(item =>
    item.name.toLowerCase().includes(inventorySearch.toLowerCase()) &&
    !formInventoryItems.some(fi => fi.itemId === item.id)
  );

  const isFormMode = isCreating || !!editingSet;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const renderIntraOpCheckbox = (section: string, field: string, label: string) => {
    const checked = !!formIntraOpData[section]?.[field];
    return (
      <div className="flex items-center gap-2" key={`${section}-${field}`}>
        <Checkbox
          id={`set-${section}-${field}`}
          checked={checked}
          onCheckedChange={() => toggleIntraOpField(section, field)}
          data-testid={`checkbox-set-${section}-${field}`}
        />
        <Label htmlFor={`set-${section}-${field}`} className="text-sm cursor-pointer">
          {label}
        </Label>
      </div>
    );
  };

  const renderSectionHeader = (section: string, label: string) => (
    <button
      className="flex items-center justify-between w-full py-2 text-sm font-medium text-left hover:bg-muted/50 rounded px-2"
      onClick={() => toggleSection(section)}
      type="button"
      data-testid={`toggle-section-${section}`}
    >
      <span>{label}</span>
      {expandedSections[section] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </button>
  );

  const renderSetForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('surgery.sets.name')}</Label>
        <Input
          value={formName}
          onChange={e => setFormName(e.target.value)}
          placeholder={t('surgery.sets.namePlaceholder')}
          data-testid="input-set-name"
        />
      </div>
      <div className="space-y-2">
        <Label>{t('surgery.sets.descriptionLabel')}</Label>
        <Textarea
          value={formDescription}
          onChange={e => setFormDescription(e.target.value)}
          placeholder={t('surgery.sets.descriptionPlaceholder')}
          rows={2}
          data-testid="input-set-description"
        />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('surgery.sets.intraOpSection')}</h4>
        <p className="text-xs text-muted-foreground">{t('surgery.sets.intraOpDescription')}</p>

        <div className="border rounded-md divide-y">
          <div className="px-2">
            {renderSectionHeader("positioning", t('surgery.intraop.positioning'))}
            {expandedSections.positioning && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("positioning", "RL", t('surgery.intraop.positions.supine'))}
                {renderIntraOpCheckbox("positioning", "SL", t('surgery.intraop.positions.lateral'))}
                {renderIntraOpCheckbox("positioning", "BL", t('surgery.intraop.positions.prone'))}
                {renderIntraOpCheckbox("positioning", "SSL", t('surgery.intraop.positions.lithotomy'))}
                {renderIntraOpCheckbox("positioning", "EXT", t('surgery.intraop.positions.extension'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("disinfection", t('surgery.intraop.disinfection'))}
            {expandedSections.disinfection && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("disinfection", "kodanColored", t('surgery.intraop.kodanColored'))}
                {renderIntraOpCheckbox("disinfection", "kodanColorless", t('surgery.intraop.kodanColorless'))}
                {renderIntraOpCheckbox("disinfection", "octanisept", t('surgery.intraop.octanisept'))}
                {renderIntraOpCheckbox("disinfection", "betadine", t('surgery.intraop.betadine'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("equipment", t('surgery.intraop.equipment'))}
            {expandedSections.equipment && (
              <div className="pb-3 pl-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {renderIntraOpCheckbox("equipment", "monopolar", t('surgery.intraop.koagulation') + " - Monopolar")}
                  {renderIntraOpCheckbox("equipment", "bipolar", t('surgery.intraop.koagulation') + " - Bipolar")}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('surgery.intraop.neutralElectrode')}</Label>
                  <Select
                    value={formIntraOpData.equipment?.neutralElectrodeLocation || ""}
                    onValueChange={v => toggleIntraOpField("equipment", "neutralElectrodeLocation", v)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-neutral-electrode">
                      <SelectValue placeholder={t('surgery.intraop.neutralElectrode')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shoulder">{t('surgery.intraop.shoulder')}</SelectItem>
                      <SelectItem value="abdomen">{t('surgery.intraop.abdomen')}</SelectItem>
                      <SelectItem value="thigh">{t('surgery.intraop.thigh')}</SelectItem>
                      <SelectItem value="back">{t('surgery.intraop.back')}</SelectItem>
                      <SelectItem value="forearm">{t('surgery.intraop.forearm')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('surgery.intraop.bodySide')}</Label>
                  <Select
                    value={formIntraOpData.equipment?.neutralElectrodeSide || ""}
                    onValueChange={v => toggleIntraOpField("equipment", "neutralElectrodeSide", v)}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid="select-body-side">
                      <SelectValue placeholder={t('surgery.intraop.bodySide')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">{t('surgery.intraop.left')}</SelectItem>
                      <SelectItem value="right">{t('surgery.intraop.right')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2" key="equipment-pathology-histology">
                    <Checkbox
                      id="set-equipment-pathology-histology"
                      checked={!!formIntraOpData.equipment?.pathology?.histology}
                      onCheckedChange={() => toggleNestedField("equipment", "pathology", "histology")}
                      data-testid="checkbox-set-equipment-pathology-histology"
                    />
                    <Label htmlFor="set-equipment-pathology-histology" className="text-sm cursor-pointer">
                      {t('surgery.intraop.histologie')}
                    </Label>
                  </div>
                  <div className="flex items-center gap-2" key="equipment-pathology-microbiology">
                    <Checkbox
                      id="set-equipment-pathology-microbiology"
                      checked={!!formIntraOpData.equipment?.pathology?.microbiology}
                      onCheckedChange={() => toggleNestedField("equipment", "pathology", "microbiology")}
                      data-testid="checkbox-set-equipment-pathology-microbiology"
                    />
                    <Label htmlFor="set-equipment-pathology-microbiology" className="text-sm cursor-pointer">
                      {t('surgery.intraop.mikrobio')}
                    </Label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("irrigation", t('surgery.intraop.irrigation'))}
            {expandedSections.irrigation && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("irrigation", "nacl", t('surgery.intraop.irrigationOptions.nacl'))}
                {renderIntraOpCheckbox("irrigation", "ringerSolution", t('surgery.intraop.irrigationOptions.ringerSolution'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("infiltration", t('surgery.intraop.infiltration'))}
            {expandedSections.infiltration && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("infiltration", "tumorSolution", t('surgery.intraop.infiltrationOptions.tumorSolution'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("medications", t('surgery.intraop.medications'))}
            {expandedSections.medications && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("medications", "rapidocain1", t('surgery.intraop.medicationOptions.rapidocain1'))}
                {renderIntraOpCheckbox("medications", "ropivacainEpinephrine", t('surgery.intraop.medicationOptions.ropivacainEpinephrine'))}
                {renderIntraOpCheckbox("medications", "ropivacain05", t('surgery.intraop.medicationOptions.ropivacain05'))}
                {renderIntraOpCheckbox("medications", "ropivacain075", t('surgery.intraop.medicationOptions.ropivacain075'))}
                {renderIntraOpCheckbox("medications", "ropivacain1", t('surgery.intraop.medicationOptions.ropivacain1'))}
                {renderIntraOpCheckbox("medications", "bupivacain", t('surgery.intraop.medicationOptions.bupivacain'))}
                {renderIntraOpCheckbox("medications", "vancomycinImplant", t('surgery.intraop.medicationOptions.vancomycinImplant'))}
                {renderIntraOpCheckbox("medications", "contrast", t('surgery.intraop.medicationOptions.contrast'))}
                {renderIntraOpCheckbox("medications", "ointments", t('surgery.intraop.medicationOptions.ointments'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("dressing", t('surgery.intraop.dressing'))}
            {expandedSections.dressing && (
              <div className="pb-3 pl-2 grid grid-cols-2 gap-2">
                {renderIntraOpCheckbox("dressing", "elasticBandage", t('surgery.intraop.dressingOptions.elasticBandage'))}
                {renderIntraOpCheckbox("dressing", "abdominalBelt", t('surgery.intraop.dressingOptions.abdominalBelt'))}
                {renderIntraOpCheckbox("dressing", "bra", t('surgery.intraop.dressingOptions.bra'))}
                {renderIntraOpCheckbox("dressing", "faceLiftMask", t('surgery.intraop.dressingOptions.faceLiftMask'))}
                {renderIntraOpCheckbox("dressing", "steristrips", t('surgery.intraop.dressingOptions.steristrips'))}
                {renderIntraOpCheckbox("dressing", "comfeel", t('surgery.intraop.dressingOptions.comfeel'))}
                {renderIntraOpCheckbox("dressing", "opsite", t('surgery.intraop.dressingOptions.opsite'))}
                {renderIntraOpCheckbox("dressing", "compresses", t('surgery.intraop.dressingOptions.compresses'))}
                {renderIntraOpCheckbox("dressing", "mefix", t('surgery.intraop.dressingOptions.mefix'))}
              </div>
            )}
          </div>

          <div className="px-2">
            {renderSectionHeader("drainage", t('surgery.intraop.drainage'))}
            {expandedSections.drainage && (
              <div className="pb-3 pl-2 space-y-2">
                {renderIntraOpCheckbox("drainage", "redon", t('surgery.intraop.drainageOptions.redonCH'))}
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">{t('surgery.intraop.drainageOptions.redonCount')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    className="h-7 w-16 text-xs"
                    value={formIntraOpData.drainage?.redonCount || ""}
                    onChange={e => toggleIntraOpField("drainage", "redonCount", parseInt(e.target.value) || undefined)}
                    data-testid="input-redon-count"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('surgery.sets.inventorySection')}</h4>
        <p className="text-xs text-muted-foreground">{t('surgery.sets.inventoryDescription')}</p>

        {formInventoryItems.length > 0 && (
          <div className="space-y-1">
            {formInventoryItems.map(item => (
              <div key={item.itemId} className="flex items-center gap-2 p-2 border rounded text-sm">
                <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{item.itemName || item.itemId}</span>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={e => updateInventoryQty(item.itemId, parseInt(e.target.value) || 1)}
                  className="h-7 w-16 text-xs"
                  data-testid={`input-qty-${item.itemId}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeInventoryItem(item.itemId)}
                  data-testid={`button-remove-item-${item.itemId}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={inventorySearch}
            onChange={e => setInventorySearch(e.target.value)}
            placeholder={t('surgery.sets.searchInventory')}
            className="pl-7 h-8 text-sm"
            data-testid="input-search-inventory"
          />
          {inventorySearch && filteredInventoryItems.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 border rounded-md bg-popover shadow-md">
              <ScrollArea className="max-h-40">
                <div className="p-1">
                  {filteredInventoryItems.slice(0, 20).map(item => (
                    <button
                      key={item.id}
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded flex items-center gap-2"
                      onClick={() => { addInventoryItem(item); setInventorySearch(""); }}
                      data-testid={`button-add-item-${item.id}`}
                    >
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.name}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
          {inventorySearch && filteredInventoryItems.length === 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 border rounded-md bg-popover shadow-md p-3 text-center text-sm text-muted-foreground">
              {t("common.noResults", "No items found")}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={resetForm} className="flex-1" data-testid="button-cancel-set">
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={!formName.trim() || isSaving}
          className="flex-1"
          data-testid="button-save-set"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {editingSet ? t('surgery.sets.save') : t('surgery.sets.create')}
        </Button>
      </div>
    </div>
  );

  const renderSetCard = (set: SurgerySetData, showApply: boolean) => {
    const intraOpSections = set.intraOpData ? Object.keys(set.intraOpData).filter(k => {
      const v = set.intraOpData![k];
      return v && typeof v === 'object' && Object.values(v).some(Boolean);
    }).length : 0;

    return (
      <Card key={set.id} className="overflow-hidden" data-testid={`card-surgery-set-${set.id}`}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{set.name}</h4>
              {set.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{set.description}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {showApply && recordId && (
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={() => applyMutation.mutate(set.id)}
                  disabled={applyMutation.isPending}
                  data-testid={`button-apply-set-${set.id}`}
                >
                  {applyMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      {t('surgery.sets.apply')}
                    </>
                  )}
                </Button>
              )}
              {isAdmin && !showApply && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => startEditing(set)}
                    data-testid={`button-edit-set-${set.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => deleteMutation.mutate(set.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-set-${set.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {intraOpSections > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5">
                {t('surgery.sets.sectionsConfigured', { count: intraOpSections })}
              </Badge>
            )}
            {set.inventoryItems.length > 0 && (
              <Badge variant="outline" className="text-[10px] h-5">
                <Package className="h-2.5 w-2.5 mr-0.5" />
                {t('surgery.sets.itemsCount', { count: set.inventoryItems.length })}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col" data-testid="dialog-surgery-sets">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t('surgery.sets.title')}
          </DialogTitle>
          <DialogDescription>{t('surgery.sets.description')}</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="apply" className="flex items-center gap-1" data-testid="tab-apply-sets">
              <Play className="h-3.5 w-3.5" />
              {t('surgery.sets.applyTab')}
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="manage" className="flex items-center gap-1" data-testid="tab-manage-sets">
                <Settings className="h-3.5 w-3.5" />
                {t('surgery.sets.manageTab')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="apply" className="flex-1 min-h-0 mt-3">
            <ScrollArea className="h-[55vh]">
              {setsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sets.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <Layers className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('surgery.sets.noSets')}</p>
                  <p className="text-xs text-muted-foreground">{t('surgery.sets.noSetsDescription')}</p>
                </div>
              ) : (
                <div className="space-y-2 pr-3">
                  {sets.map(set => renderSetCard(set, true))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {isAdmin && (
            <TabsContent value="manage" className="flex-1 min-h-0 mt-3">
              <ScrollArea className="h-[55vh]">
                {isFormMode ? (
                  <div className="pr-3">
                    {renderSetForm()}
                  </div>
                ) : (
                  <div className="space-y-2 pr-3">
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={startCreating}
                      data-testid="button-create-set"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t('surgery.sets.create')}
                    </Button>

                    {setsLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : sets.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <Layers className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{t('surgery.sets.noSets')}</p>
                      </div>
                    ) : (
                      sets.map(set => renderSetCard(set, false))
                    )}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}