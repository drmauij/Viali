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
  itemValue?: string;
  sortOrder: number;
  config?: Record<string, any>;
};

type PendingTechnique = {
  itemType: string;
  itemValue: string;
  metadata: Record<string, any>;
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
  medicationConfigId?: string;
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

const TECHNIQUE_CATEGORIES = [
  { 
    type: 'peripheral_venous', 
    label: 'Peripheral Venous Access',
    category: 'installation',
    fields: [
      { key: 'location', label: 'Location', type: 'select', options: ['right-hand', 'left-hand', 'right-forearm', 'left-forearm', 'right-ac-fossa', 'left-ac-fossa'] },
      { key: 'gauge', label: 'Gauge', type: 'select', options: ['14G', '16G', '18G', '20G', '22G', '24G'] },
    ]
  },
  { 
    type: 'arterial_line', 
    label: 'Arterial Line',
    category: 'installation',
    fields: [
      { key: 'location', label: 'Location', type: 'select', options: ['radial-left', 'radial-right', 'femoral-left', 'femoral-right', 'brachial'] },
      { key: 'gauge', label: 'Gauge', type: 'select', options: ['18G', '20G', '22G'] },
      { key: 'technique', label: 'Technique', type: 'select', options: ['direct', 'transfixion', 'ultrasound'] },
    ]
  },
  { 
    type: 'central_venous', 
    label: 'Central Venous Catheter',
    category: 'installation',
    fields: [
      { key: 'location', label: 'Location', type: 'select', options: ['right-ijv', 'left-ijv', 'right-subclavian', 'left-subclavian', 'right-femoral', 'left-femoral'] },
      { key: 'lumens', label: 'Lumens', type: 'select', options: ['1', '2', '3', '4'] },
      { key: 'depth', label: 'Depth (cm)', type: 'number' },
      { key: 'technique', label: 'Technique', type: 'select', options: ['landmark', 'ultrasound'] },
    ]
  },
  { 
    type: 'bladder_catheter', 
    label: 'Bladder Catheter',
    category: 'installation',
    fields: [
      { key: 'bladderType', label: 'Type', type: 'select', options: ['foley', 'suprapubic', 'three-way'] },
      { key: 'size', label: 'Size (Fr)', type: 'select', options: ['12', '14', '16', '18', '20', '22'] },
    ]
  },
  { 
    type: 'general_anesthesia', 
    label: 'General Anesthesia',
    category: 'anesthesia',
    fields: [
      { key: 'approach', label: 'Maintenance Type', type: 'select', options: ['tiva', 'tci', 'balanced-gas', 'sedation'] },
      { key: 'rsi', label: 'RSI', type: 'checkbox' },
    ]
  },
  { 
    type: 'airway_management', 
    label: 'Airway Management',
    category: 'anesthesia',
    fields: [
      { key: 'device', label: 'Device', type: 'select', options: ['ett', 'spiral-tube', 'rae-tube', 'dlt-left', 'dlt-right', 'lma', 'lma-auragain', 'facemask', 'tracheostomy'] },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'depth', label: 'Depth (cm)', type: 'select', options: ['19', '20', '21', '22', '23', '24', '25'] },
      { key: 'cuffPressure', label: 'Cuff Pressure (cmH₂O)', type: 'select', options: ['15', '20', '22', '24', '25', '26', '28', '30'] },
    ]
  },
  { 
    type: 'spinal', 
    label: 'Spinal Anesthesia',
    category: 'neuraxial',
    fields: [
      { key: 'level', label: 'Level', type: 'text', placeholder: 'e.g., L3-L4' },
      { key: 'needleGauge', label: 'Needle', type: 'text', placeholder: 'e.g., 25G Pencil Point' },
      { key: 'sensoryLevel', label: 'Sensory Level', type: 'text', placeholder: 'e.g., T4' },
    ]
  },
  { 
    type: 'epidural', 
    label: 'Epidural Anesthesia',
    category: 'neuraxial',
    fields: [
      { key: 'level', label: 'Level', type: 'text', placeholder: 'e.g., L3-L4' },
      { key: 'needleGauge', label: 'Needle', type: 'text', placeholder: 'e.g., 18G Tuohy' },
      { key: 'catheterDepth', label: 'Catheter Depth (cm)', type: 'number' },
      { key: 'sensoryLevel', label: 'Sensory Level', type: 'text', placeholder: 'e.g., T6' },
    ]
  },
  { 
    type: 'cse', 
    label: 'Combined Spinal-Epidural',
    category: 'neuraxial',
    fields: [
      { key: 'level', label: 'Level', type: 'text', placeholder: 'e.g., L3-L4' },
      { key: 'spinalNeedle', label: 'Spinal Needle', type: 'text' },
      { key: 'epiduralNeedle', label: 'Epidural Needle', type: 'text' },
      { key: 'catheterDepth', label: 'Catheter Depth (cm)', type: 'number' },
    ]
  },
  { 
    type: 'peripheral_block', 
    label: 'Peripheral Nerve Block',
    category: 'regional',
    fields: [
      { key: 'blockType', label: 'Block Type', type: 'select', options: ['interscalene', 'supraclavicular', 'infraclavicular', 'axillary', 'femoral', 'sciatic', 'popliteal', 'adductor-canal', 'ankle-block', 'tap', 'ql', 'pecs', 'serratus', 'erector-spinae', 'intercostal', 'paravertebral'] },
      { key: 'laterality', label: 'Side', type: 'select', options: ['left', 'right', 'bilateral'] },
      { key: 'guidance', label: 'Guidance', type: 'select', options: ['ultrasound', 'nerve-stimulator', 'both', 'landmark'] },
      { key: 'needleType', label: 'Needle Type', type: 'text', placeholder: 'e.g., 22G 50mm' },
      { key: 'catheter', label: 'Catheter Placed', type: 'checkbox' },
    ]
  },
  { 
    type: 'asa_status', 
    label: 'ASA Status',
    category: 'assessment',
    fields: [
      { key: 'status', label: 'ASA Class', type: 'select', options: ['1', '2', '3', '4', '5', '6'] },
      { key: 'emergency', label: 'Emergency (E)', type: 'checkbox' },
    ]
  },
  { 
    type: 'mallampati', 
    label: 'Mallampati Score',
    category: 'assessment',
    fields: [
      { key: 'score', label: 'Score', type: 'select', options: ['1', '2', '3', '4'] },
    ]
  },
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
  
  const [pendingTechniques, setPendingTechniques] = useState<PendingTechnique[]>([]);
  const [currentTechniqueMetadata, setCurrentTechniqueMetadata] = useState<Record<string, any>>({});
  const [pendingMedications, setPendingMedications] = useState<Array<{ medicationConfigId: string; itemName: string; customDose: string | null; defaultDose: string | null; unit: string | null }>>([]);
  const [pendingInventory, setPendingInventory] = useState<Array<{ itemId: string; itemName: string; quantity: number }>>([]);
  
  const [techniqueType, setTechniqueType] = useState<string>("");
  const [medSearchQuery, setMedSearchQuery] = useState("");
  const [invSearchQuery, setInvSearchQuery] = useState("");
  const [editingMedIdx, setEditingMedIdx] = useState<number | null>(null);
  const [editDoseValue, setEditDoseValue] = useState("");
  const [editingInvIdx, setEditingInvIdx] = useState<number | null>(null);
  const [editQtyValue, setEditQtyValue] = useState("");

  const { data: sets = [], isLoading: isLoadingSets } = useQuery<AnesthesiaSetWithDetails[]>({
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
        id: item.id,
        itemId: item.id,
        itemName: item.name,
        medicationConfigId: item.medicationConfigId,
        defaultDose: item.defaultDose,
        administrationUnit: item.administrationUnit,
        administrationRoute: item.administrationRoute,
        administrationGroup: item.administrationGroup,
      })).filter((item: any) => item.itemName && item.medicationConfigId);
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
    setCurrentTechniqueMetadata({});
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
      setPendingTechniques(setWithDetails.items.map(item => {
        const category = TECHNIQUE_CATEGORIES.find(c => c.type === item.itemType);
        return {
          itemType: item.itemType,
          itemValue: item.itemValue || category?.label || item.itemType,
          metadata: item.config || {},
        };
      }));
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
    if (!techniqueType) return;
    const category = TECHNIQUE_CATEGORIES.find(c => c.type === techniqueType);
    if (!category) return;
    setPendingTechniques([...pendingTechniques, { 
      itemType: techniqueType, 
      itemValue: category.label,
      metadata: { ...currentTechniqueMetadata }
    }]);
    setTechniqueType("");
    setCurrentTechniqueMetadata({});
  };

  const handleAddMedication = (med: AvailableMedication) => {
    // Use medicationConfigId (from medicationConfigs.id), not med.id (which is items.id)
    const configId = med.medicationConfigId || med.id;
    if (pendingMedications.some(m => m.medicationConfigId === configId)) return;
    setPendingMedications([...pendingMedications, {
      medicationConfigId: configId,
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
        config: t.metadata,
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
          config: t.metadata,
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
    !pendingMedications.some(m => m.medicationConfigId === med.medicationConfigId)
  );

  const filteredInventory = inventoryItems.filter(item =>
    (item.name || '').toLowerCase().includes(invSearchQuery.toLowerCase()) &&
    !pendingInventory.some(i => i.itemId === item.id)
  );

  const selectedTechniqueCategory = TECHNIQUE_CATEGORIES.find(c => c.type === techniqueType);

  const renderTechniqueFields = () => {
    if (!selectedTechniqueCategory) return null;
    
    return (
      <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-3">
        <div className="text-sm font-medium">{selectedTechniqueCategory.label} - Template Fields</div>
        <div className="grid grid-cols-2 gap-3">
          {selectedTechniqueCategory.fields.map((field: any) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
              {field.type === 'select' ? (
                <select
                  className="w-full border rounded-md p-2 text-sm bg-background"
                  value={currentTechniqueMetadata[field.key] || ""}
                  onChange={(e) => setCurrentTechniqueMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt: string) => (
                    <option key={opt} value={opt}>
                      {opt.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentTechniqueMetadata[field.key] || false}
                    onChange={(e) => setCurrentTechniqueMetadata(prev => ({ ...prev, [field.key]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Yes</span>
                </label>
              ) : field.type === 'number' ? (
                <Input
                  type="number"
                  placeholder={field.placeholder || ""}
                  value={currentTechniqueMetadata[field.key] || ""}
                  onChange={(e) => setCurrentTechniqueMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              ) : (
                <Input
                  placeholder={field.placeholder || ""}
                  value={currentTechniqueMetadata[field.key] || ""}
                  onChange={(e) => setCurrentTechniqueMetadata(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="h-8 text-sm"
                />
              )}
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('anesthesia.documentation.notes', 'Notes')}</label>
          <Textarea
            rows={2}
            placeholder={t('anesthesia.sets.notesPlaceholder', 'Notes to apply with this item...')}
            value={currentTechniqueMetadata.notes || ""}
            onChange={(e) => setCurrentTechniqueMetadata(prev => ({ ...prev, notes: e.target.value }))}
            className="text-sm"
            data-testid="textarea-technique-notes"
          />
        </div>
      </div>
    );
  };

  const formatTechniqueMetadata = (metadata: Record<string, any>) => {
    const parts: string[] = [];
    Object.entries(metadata).forEach(([key, value]) => {
      if (key === 'notes') return;
      if (value && value !== "") {
        if (typeof value === 'boolean') {
          if (value) parts.push(key);
        } else {
          parts.push(String(value).replace(/-/g, ' '));
        }
      }
    });
    return parts.length > 0 ? parts.join(', ') : '';
  };

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
            <div className="space-y-3">
              <div className="flex gap-2">
                <Select value={techniqueType} onValueChange={(v) => { setTechniqueType(v); setCurrentTechniqueMetadata({}); }}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t("anesthesia.sets.selectType", "Select technique type...")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__header_install" disabled className="font-semibold text-muted-foreground">Installations</SelectItem>
                    {TECHNIQUE_CATEGORIES.filter(c => c.category === 'installation').map(cat => (
                      <SelectItem key={cat.type} value={cat.type}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="__header_anesthesia" disabled className="font-semibold text-muted-foreground">Anesthesia</SelectItem>
                    {TECHNIQUE_CATEGORIES.filter(c => c.category === 'anesthesia').map(cat => (
                      <SelectItem key={cat.type} value={cat.type}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="__header_neuraxial" disabled className="font-semibold text-muted-foreground">Neuraxial</SelectItem>
                    {TECHNIQUE_CATEGORIES.filter(c => c.category === 'neuraxial').map(cat => (
                      <SelectItem key={cat.type} value={cat.type}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="__header_regional" disabled className="font-semibold text-muted-foreground">Regional</SelectItem>
                    {TECHNIQUE_CATEGORIES.filter(c => c.category === 'regional').map(cat => (
                      <SelectItem key={cat.type} value={cat.type}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="__header_assessment" disabled className="font-semibold text-muted-foreground">Assessment</SelectItem>
                    {TECHNIQUE_CATEGORIES.filter(c => c.category === 'assessment').map(cat => (
                      <SelectItem key={cat.type} value={cat.type}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddTechnique} disabled={!techniqueType} size="icon" variant="outline" data-testid="button-add-technique">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {renderTechniqueFields()}
              
              <div className="space-y-2">
                {pendingTechniques.map((t, idx) => {
                  const metaDisplay = formatTechniqueMetadata(t.metadata);
                  return (
                    <div key={idx} className="flex items-start justify-between bg-muted/50 rounded p-2 gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{t.itemValue}</div>
                        {metaDisplay && (
                          <div className="text-xs text-muted-foreground truncate">{metaDisplay}</div>
                        )}
                        {t.metadata.notes && (
                          <div className="text-xs text-muted-foreground italic mt-0.5 truncate">📝 {t.metadata.notes}</div>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => setPendingTechniques(pendingTechniques.filter((_, i) => i !== idx))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
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
    <div className="flex gap-2 justify-end">
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <span className="font-medium">{set.name}</span>
                </div>
                {set.description && (
                  <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
                )}
                {((set.items && set.items.length > 0) || (set.medications && set.medications.length > 0) || (set.inventoryItems && set.inventoryItems.length > 0)) && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {set.items?.map((item) => {
                      const cat = TECHNIQUE_CATEGORIES.find(c => c.type === item.itemType);
                      const cfg = item.config || {};
                      const parts: string[] = [];
                      if (cat) {
                        const shortLabels: Record<string, string> = {
                          'peripheral_venous': 'PVL',
                          'arterial_line': 'Art',
                          'central_venous': 'CVC',
                          'bladder_catheter': 'BC',
                          'general_anesthesia': 'GA',
                          'airway_management': 'Airway',
                          'spinal': 'Spinal',
                          'epidural': 'Epidural',
                          'cse': 'CSE',
                          'peripheral_block': 'Block',
                          'asa_status': 'ASA',
                          'mallampati': 'Mallampati',
                        };
                        parts.push(shortLabels[item.itemType] || cat.label);
                      }
                      if (cfg.gauge) parts.push(cfg.gauge);
                      if (cfg.device) parts.push(cfg.device.toUpperCase());
                      if (cfg.size) parts.push(cfg.size);
                      if (cfg.location) parts.push(cfg.location);
                      if (cfg.approach) parts.push(cfg.approach.toUpperCase());
                      if (cfg.blockType) parts.push(cfg.blockType);
                      if (cfg.status) parts.push(cfg.status);
                      if (cfg.score) parts.push(cfg.score);
                      return (
                        <Badge key={item.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                          {parts.join(' ')}{cfg.notes ? ' 📝' : ''}
                        </Badge>
                      );
                    })}
                    {set.medications?.map((med) => (
                      <Badge key={med.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400">
                        {med.itemName}{med.customDose ? ` ${med.customDose}` : med.defaultDose ? ` ${med.defaultDose}` : ''}{med.administrationUnit ? med.administrationUnit : ''}
                      </Badge>
                    ))}
                    {set.inventoryItems?.map((inv) => (
                      <Badge key={inv.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-green-300 text-green-700 dark:border-green-600 dark:text-green-400">
                        {inv.itemName}{inv.quantity > 1 ? ` x${inv.quantity}` : ''}
                      </Badge>
                    ))}
                  </div>
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
              <div className="flex justify-end mb-4">
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
