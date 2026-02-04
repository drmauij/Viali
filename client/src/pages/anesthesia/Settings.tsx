import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ItemTransferList } from "@/components/anesthesia/ItemTransferList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, X, ChevronUp, ChevronDown, Pencil, Trash2, Languages, Database, CheckCircle2, AlertCircle } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";

type MedicationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  createdAt: string;
};

type AdministrationGroup = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

type SurgeryRoom = {
  id: string;
  name: string;
  hospitalId: string;
  sortOrder: number;
  createdAt: string;
};

type Item = {
  id: string;
  name: string;
  medicationGroup?: string;
  administrationGroup?: string;
  defaultDose?: string;
  administrationUnit?: string;
  ampuleTotalContent?: string;
  administrationRoute?: string;
  rateUnit?: string | null;
};

// System Settings Tab Component for CHOP import and other system-wide settings
function SystemSettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  // Check CHOP import status
  const { data: chopStatus, isLoading: chopStatusLoading, isError: chopStatusError, refetch: refetchChopStatus } = useQuery<{
    imported: boolean;
    count: number;
  }>({
    queryKey: ['/api/admin/chop-status'],
    retry: false,
  });
  
  // CHOP import mutation
  const importChopMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/import-chop');
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: t('settings.system.chopImportSuccess', 'CHOP Import Successful'),
        description: data.message,
      });
      refetchChopStatus();
    },
    onError: (error: any) => {
      toast({
        title: t('settings.system.chopImportError', 'CHOP Import Failed'),
        description: error.message || 'Failed to import CHOP procedures',
        variant: 'destructive',
      });
    },
  });
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t('settings.integrations.title', 'Integrations')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('settings.integrations.description', 'External data sources and system integrations')}
        </p>
      </div>
      
      {/* CHOP Procedures Import Section */}
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h4 className="font-medium">{t('settings.system.chopProcedures', 'CHOP 2026 Procedures')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('settings.system.chopDescription', 'Swiss procedure codes for billing and documentation')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {chopStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : chopStatusError ? (
              <>
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-600">
                  {t('settings.system.accessDenied', 'Admin access required')}
                </span>
              </>
            ) : chopStatus?.imported ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {chopStatus.count.toLocaleString()} {t('settings.system.proceduresImported', 'procedures imported')}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">
                  {t('settings.system.chopNotImported', 'Not yet imported')}
                </span>
              </>
            )}
          </div>
          
          <Button
            onClick={() => importChopMutation.mutate()}
            disabled={importChopMutation.isPending || chopStatus?.imported || chopStatusError}
            data-testid="button-import-chop"
          >
            {importChopMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('settings.system.importing', 'Importing...')}
              </>
            ) : chopStatus?.imported ? (
              t('settings.system.alreadyImported', 'Already Imported')
            ) : (
              t('settings.system.importChop', 'Import CHOP Codes')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AnesthesiaSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const { data: anesthesiaSettings, isLoading: settingsLoading } = useHospitalAnesthesiaSettings();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [selectedItemForConfig, setSelectedItemForConfig] = useState<Item | null>(null);
  
  // Configuration form state
  const [itemName, setItemName] = useState('');
  const [anesthesiaType, setAnesthesiaType] = useState<'medication' | 'infusion'>('medication');
  const [medicationGroup, setMedicationGroup] = useState('');
  const [administrationGroup, setAdministrationGroup] = useState('');
  const [defaultDose, setDefaultDose] = useState('');
  const [administrationUnit, setAdministrationUnit] = useState('mg');
  const [ampuleContent, setAmpuleContent] = useState(''); // e.g., "50 mg", "1000 ml", "0.1 mg"
  const [administrationRoute, setAdministrationRoute] = useState('i.v.');
  const [isRateControlled, setIsRateControlled] = useState(false);
  const [rateUnit, setRateUnit] = useState('ml/h');

  // Fetch all items for the hospital's anesthesia units
  const { data: allItems = [], isLoading } = useQuery<Item[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId && activeHospital?.unitType === 'anesthesia',
  });

  // Fetch anesthesia-configured items
  const { data: anesthesiaItems = [] } = useQuery<Item[]>({
    queryKey: [`/api/anesthesia/items/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch medication groups for this hospital
  const { data: medicationGroups = [] } = useQuery<MedicationGroup[]>({
    queryKey: [`/api/medication-groups/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch administration groups for this hospital
  const { data: administrationGroups = [] } = useQuery<AdministrationGroup[]>({
    queryKey: [`/api/administration-groups/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // State for inline group management
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newAdminGroupName, setNewAdminGroupName] = useState('');
  const [showNewAdminGroupInput, setShowNewAdminGroupInput] = useState(false);

  // State for Groups management tab
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AdministrationGroup | null>(null);
  const [groupFormName, setGroupFormName] = useState('');

  // State for editing settings
  const [newItemInput, setNewItemInput] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  // State for editing list items (allergies, medications, illnesses, checklists)
  const [listItemDialogOpen, setListItemDialogOpen] = useState(false);
  const [editingListItem, setEditingListItem] = useState<{
    type: 'allergy' | 'medication' | 'illness' | 'checklist';
    category?: string;
    oldValue: string;
    oldId?: string;
    patientVisible?: boolean;
    patientLabel?: string;
    patientHelpText?: string;
  } | null>(null);
  const [listItemFormValue, setListItemFormValue] = useState('');
  const [patientVisibleForm, setPatientVisibleForm] = useState(true);
  const [patientLabelForm, setPatientLabelForm] = useState('');
  const [patientHelpTextForm, setPatientHelpTextForm] = useState('');

  // State for translation
  const [isTranslating, setIsTranslating] = useState<string | null>(null);

  // Split items into available and selected
  const anesthesiaItemIds = new Set(anesthesiaItems.map(item => item.id));
  const availableItems = allItems.filter((item: Item) => !anesthesiaItemIds.has(item.id));
  const selectedItems = anesthesiaItems;

  // Mutation to update anesthesia config
  const updateConfigMutation = useMutation({
    mutationFn: async ({ itemId, config }: { itemId: string; config: any }) => {
      return apiRequest('PATCH', `/api/items/${itemId}/anesthesia-config`, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`] });
      toast({
        title: t('anesthesia.settings.configurationUpdated'),
        description: t('anesthesia.settings.configurationUpdatedDescription'),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('anesthesia.settings.failedToUpdateConfiguration'),
      });
    },
  });

  // Mutation to create medication group
  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', '/api/medication-groups', {
        hospitalId: activeHospital?.id,
        name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/medication-groups/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.groupCreated'),
        description: t('anesthesia.settings.medicationGroupAdded'),
      });
    },
  });

  // Mutation to delete medication group
  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest('DELETE', `/api/medication-groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/medication-groups/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.groupDeleted'),
        description: t('anesthesia.settings.medicationGroupRemoved'),
      });
    },
  });

  // Mutation to create administration group
  const createAdminGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', '/api/administration-groups', {
        hospitalId: activeHospital?.id,
        name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.groupCreated'),
        description: t('anesthesia.settings.administrationGroupAdded'),
      });
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupFormName('');
    },
  });

  // Mutation to update administration group
  const updateAdminGroupMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      return apiRequest('PUT', `/api/administration-groups/${groupId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.groupUpdated'),
        description: t('anesthesia.settings.administrationGroupUpdated'),
      });
      setGroupDialogOpen(false);
      setEditingGroup(null);
      setGroupFormName('');
    },
  });

  // Mutation to delete administration group
  const deleteAdminGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest('DELETE', `/api/administration-groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.groupDeleted'),
        description: t('anesthesia.settings.administrationGroupRemoved'),
      });
    },
  });

  // Reorder administration groups
  const reorderGroupsMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      return apiRequest('PUT', `/api/administration-groups/reorder`, { groupIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${activeHospital?.id}`] });
    },
  });

  // Mutation to update hospital anesthesia settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (updates: any) => {
      return apiRequest('PATCH', `/api/anesthesia/settings/${activeHospital?.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/settings/${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.settings.settingsUpdated'),
        description: t('anesthesia.settings.anesthesiaSettingsUpdated'),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('anesthesia.settings.failedToUpdateSettings'),
      });
    },
  });

  // Helper functions for managing settings lists
  const addAllergy = () => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentList = anesthesiaSettings.allergyList || [];
    const autoId = generateIdFromLabel(newItemInput);
    const newItem = { id: autoId, label: newItemInput.trim() };
    if (!currentList.find((item) => item.id === newItem.id)) {
      updateSettingsMutation.mutate({
        allergyList: [...currentList, newItem],
      });
      setNewItemInput('');
    }
  };

  const removeAllergy = (allergyId: string) => {
    if (!anesthesiaSettings) return;
    updateSettingsMutation.mutate({
      allergyList: (anesthesiaSettings.allergyList || []).filter(a => a.id !== allergyId),
    });
  };

  const editAllergy = (oldId: string, newLabel: string) => {
    if (!anesthesiaSettings || !newLabel.trim()) return;
    const currentList = anesthesiaSettings.allergyList || [];
    updateSettingsMutation.mutate({
      allergyList: currentList.map(a => a.id === oldId ? { id: a.id, label: newLabel.trim() } : a),
    });
  };

  const addMedication = (category: 'anticoagulation' | 'general') => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.medicationLists || {};
    const currentList = currentLists[category] || [];
    const autoId = generateIdFromLabel(newItemInput);
    const newItem = { id: autoId, label: newItemInput.trim() };
    if (!currentList.find((item) => item.id === newItem.id)) {
      updateSettingsMutation.mutate({
        medicationLists: {
          ...currentLists,
          [category]: [...currentList, newItem],
        },
      });
      setNewItemInput('');
    }
  };

  const removeMedication = (category: 'anticoagulation' | 'general', medicationId: string) => {
    if (!anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.medicationLists || {};
    updateSettingsMutation.mutate({
      medicationLists: {
        ...currentLists,
        [category]: (currentLists[category] || []).filter(m => m.id !== medicationId),
      },
    });
  };

  const editMedication = (category: 'anticoagulation' | 'general', oldId: string, newLabel: string) => {
    if (!anesthesiaSettings || !newLabel.trim()) return;
    const currentLists = anesthesiaSettings.medicationLists || {};
    updateSettingsMutation.mutate({
      medicationLists: {
        ...currentLists,
        [category]: (currentLists[category] || []).map(m => 
          m.id === oldId ? { id: m.id, label: newLabel.trim() } : m
        ),
      },
    });
  };

  // Auto-generate ID from label (e.g., "Heart Disease" -> "heartDisease")
  const generateIdFromLabel = (label: string): string => {
    return label
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .split(/\s+/) // Split by whitespace
      .map((word, index) => {
        if (index === 0) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join('');
  };

  const addIllness = (category: string) => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.illnessLists || {};
    const currentList = (currentLists as any)[category] || [];
    const autoId = generateIdFromLabel(newItemInput);
    const newItem = { id: autoId, label: newItemInput.trim() };
    if (!currentList.find((item: any) => item.id === newItem.id)) {
      updateSettingsMutation.mutate({
        illnessLists: {
          ...currentLists,
          [category]: [...currentList, newItem],
        },
      });
      setNewItemInput('');
      setNewItemId('');
    }
  };

  const removeIllness = (category: string, illnessId: string) => {
    if (!anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.illnessLists || {};
    updateSettingsMutation.mutate({
      illnessLists: {
        ...currentLists,
        [category]: ((currentLists as any)[category] || []).filter((i: any) => i.id !== illnessId),
      },
    });
  };

  const editIllness = (category: string, oldId: string, newLabel: string, patientMetadata?: { patientVisible?: boolean; patientLabel?: string; patientHelpText?: string }) => {
    if (!anesthesiaSettings || !newLabel.trim()) return;
    const currentLists = anesthesiaSettings.illnessLists || {};
    updateSettingsMutation.mutate({
      illnessLists: {
        ...currentLists,
        [category]: ((currentLists as any)[category] || []).map((i: any) => 
          i.id === oldId ? { 
            id: i.id, 
            label: newLabel.trim(),
            patientVisible: patientMetadata?.patientVisible ?? i.patientVisible ?? true,
            patientLabel: patientMetadata?.patientLabel || i.patientLabel,
            patientHelpText: patientMetadata?.patientHelpText || i.patientHelpText,
          } : i
        ),
      },
    });
  };

  // Handler for saving list item edits
  const handleSaveListItem = () => {
    if (!editingListItem || !listItemFormValue.trim()) return;
    
    if (editingListItem.type === 'allergy' && editingListItem.oldId) {
      editAllergy(editingListItem.oldId, listItemFormValue);
    } else if (editingListItem.type === 'medication' && editingListItem.category && editingListItem.oldId) {
      editMedication(editingListItem.category as 'anticoagulation' | 'general', editingListItem.oldId, listItemFormValue);
    } else if (editingListItem.type === 'illness' && editingListItem.category && editingListItem.oldId) {
      editIllness(editingListItem.category, editingListItem.oldId, listItemFormValue, {
        patientVisible: patientVisibleForm,
        patientLabel: patientLabelForm.trim() || undefined,
        patientHelpText: patientHelpTextForm.trim() || undefined,
      });
    } else if (editingListItem.type === 'checklist' && editingListItem.category && editingListItem.oldId) {
      editChecklistItem(editingListItem.category as 'signIn' | 'timeOut' | 'signOut', editingListItem.oldId, listItemFormValue);
    }
    
    setListItemDialogOpen(false);
    setEditingListItem(null);
    setListItemFormValue('');
    setPatientVisibleForm(true);
    setPatientLabelForm('');
    setPatientHelpTextForm('');
  };

  // Translation function using OpenAI
  const translateSection = async (section: 'allergies' | 'anticoagulation' | 'general' | 'illness' | 'checklist', category?: string) => {
    if (!anesthesiaSettings) return;
    
    const sectionKey = category ? `${section}-${category}` : section;
    setIsTranslating(sectionKey);
    
    try {
      let items: string[] = [];
      
      if (section === 'allergies') {
        items = (anesthesiaSettings.allergyList || []).map((i) => i.label);
      } else if (section === 'anticoagulation') {
        items = (anesthesiaSettings.medicationLists?.anticoagulation || []).map((i) => i.label);
      } else if (section === 'general') {
        items = (anesthesiaSettings.medicationLists?.general || []).map((i) => i.label);
      } else if (section === 'illness' && category) {
        items = ((anesthesiaSettings.illnessLists as any)?.[category] || []).map((i: any) => i.label);
      } else if (section === 'checklist' && category) {
        items = (anesthesiaSettings.checklistItems?.[category as 'signIn' | 'timeOut' | 'signOut'] || []).map((i) => i.label);
      }
      
      if (items.length === 0) {
        toast({
          title: t('anesthesia.settings.noItemsToTranslate'),
          description: t('anesthesia.settings.addItemsFirst'),
        });
        setIsTranslating(null);
        return;
      }
      
      const response = await apiRequest('POST', '/api/translate', { items });
      const data = await response.json();
      const translatedItems: string[] = data.translations;
      
      if (section === 'allergies') {
        const currentItems = anesthesiaSettings.allergyList || [];
        const updatedItems = currentItems.map((item, index) => ({
          id: item.id,
          label: translatedItems[index] || item.label,
        }));
        updateSettingsMutation.mutate({ allergyList: updatedItems });
      } else if (section === 'anticoagulation') {
        const currentItems = anesthesiaSettings.medicationLists?.anticoagulation || [];
        const updatedItems = currentItems.map((item, index) => ({
          id: item.id,
          label: translatedItems[index] || item.label,
        }));
        updateSettingsMutation.mutate({
          medicationLists: {
            ...anesthesiaSettings.medicationLists,
            anticoagulation: updatedItems,
          },
        });
      } else if (section === 'general') {
        const currentItems = anesthesiaSettings.medicationLists?.general || [];
        const updatedItems = currentItems.map((item, index) => ({
          id: item.id,
          label: translatedItems[index] || item.label,
        }));
        updateSettingsMutation.mutate({
          medicationLists: {
            ...anesthesiaSettings.medicationLists,
            general: updatedItems,
          },
        });
      } else if (section === 'illness' && category) {
        const currentLists = anesthesiaSettings.illnessLists || {};
        const currentItems = (currentLists as any)[category] || [];
        const updatedItems = currentItems.map((item: any, index: number) => ({
          id: item.id,
          label: translatedItems[index] || item.label,
        }));
        updateSettingsMutation.mutate({
          illnessLists: {
            ...currentLists,
            [category]: updatedItems,
          },
        });
      } else if (section === 'checklist' && category) {
        const currentItems = anesthesiaSettings.checklistItems?.[category as 'signIn' | 'timeOut' | 'signOut'] || [];
        const updatedItems = currentItems.map((item, index) => ({
          id: item.id,
          label: translatedItems[index] || item.label,
        }));
        updateSettingsMutation.mutate({
          checklistItems: {
            ...anesthesiaSettings.checklistItems,
            [category]: updatedItems,
          },
        });
      }
      
      toast({
        title: t('anesthesia.settings.translationComplete'),
        description: t('anesthesia.settings.itemsTranslated'),
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: error.message || t('anesthesia.settings.translationFailed'),
      });
    } finally {
      setIsTranslating(null);
    }
  };

  const addChecklistItem = (category: 'signIn' | 'timeOut' | 'signOut') => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentItems = anesthesiaSettings.checklistItems || {};
    const currentList = currentItems[category] || [];
    const autoId = generateIdFromLabel(newItemInput);
    const newItem = { id: autoId, label: newItemInput.trim() };
    if (!currentList.find((item) => item.id === newItem.id)) {
      updateSettingsMutation.mutate({
        checklistItems: {
          ...currentItems,
          [category]: [...currentList, newItem],
        },
      });
      setNewItemInput('');
    }
  };

  const removeChecklistItem = (category: 'signIn' | 'timeOut' | 'signOut', itemId: string) => {
    if (!anesthesiaSettings) return;
    const currentItems = anesthesiaSettings.checklistItems || {};
    updateSettingsMutation.mutate({
      checklistItems: {
        ...currentItems,
        [category]: (currentItems[category] || []).filter(i => i.id !== itemId),
      },
    });
  };

  const editChecklistItem = (category: 'signIn' | 'timeOut' | 'signOut', oldId: string, newLabel: string) => {
    if (!anesthesiaSettings || !newLabel.trim()) return;
    const currentItems = anesthesiaSettings.checklistItems || {};
    updateSettingsMutation.mutate({
      checklistItems: {
        ...currentItems,
        [category]: (currentItems[category] || []).map(i => 
          i.id === oldId ? { id: i.id, label: newLabel.trim() } : i
        ),
      },
    });
  };

  // Helper functions for reordering
  const moveGroup = (groupId: string, direction: 'up' | 'down') => {
    const currentIndex = administrationGroups.findIndex(g => g.id === groupId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= administrationGroups.length) return;
    
    const reordered = arrayMove(administrationGroups, currentIndex, newIndex);
    reorderGroupsMutation.mutate(reordered.map(g => g.id));
  };

  // Handle moving items between lists
  const handleMove = async (itemIds: string[], toSelected: boolean) => {
    for (const itemId of itemIds) {
      if (toSelected) {
        // Moving to anesthesia items - open config dialog for first item
        const item = availableItems.find((i: Item) => i.id === itemId);
        if (item && itemIds.length === 1) {
          // Single item - open config dialog
          setSelectedItemForConfig(item);
          setItemName(item.name);
          setAnesthesiaType('medication');
          setMedicationGroup('');
          setDefaultDose('');
          setAdministrationUnit('mg');
          setAmpuleContent('');
          setAdministrationRoute('i.v.');
          setIsRateControlled(false);
          setRateUnit('ml/h');
          setConfigDialogOpen(true);
        } else {
          // Multiple items - set as medication with defaults
          await updateConfigMutation.mutateAsync({
            itemId,
            config: {
              rateUnit: null,
              administrationUnit: 'mg',
              administrationRoute: 'i.v.',
            },
          });
        }
      } else {
        // Removing from anesthesia items - just send empty config
        await updateConfigMutation.mutateAsync({
          itemId,
          config: {},
        });
      }
    }
  };

  // Handle reordering of anesthesia items
  const handleReorder = async (reorderedItems: Item[]) => {
    // Update sort orders based on new positions
    const updates = reorderedItems.map((item, index) => ({
      itemId: item.id,
      sortOrder: index,
    }));

    try {
      await apiRequest('POST', '/api/anesthesia/items/reorder', { items: updates });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospital?.id}`] });
    } catch (error) {
      console.error('Failed to reorder items:', error);
      toast({
        title: 'Error',
        description: 'Failed to save item order',
        variant: 'destructive',
      });
    }
  };

  // Handle item click in selected list (for reconfiguration)
  const handleItemClick = (item: Item) => {
    setSelectedItemForConfig(item);
    setItemName(item.name);
    
    // Derive UI state from rateUnit:
    // - null/undefined = bolus medication
    // - "free" = free-running infusion
    // - actual unit = rate-controlled infusion
    const itemRateUnit = item.rateUnit;
    if (!itemRateUnit) {
      // Bolus medication
      setAnesthesiaType('medication');
      setIsRateControlled(false);
    } else if (itemRateUnit === 'free') {
      // Free-running infusion
      setAnesthesiaType('infusion');
      setIsRateControlled(false);
    } else {
      // Rate-controlled infusion
      setAnesthesiaType('infusion');
      setIsRateControlled(true);
      setRateUnit(itemRateUnit);
    }
    
    setMedicationGroup(item.medicationGroup || '');
    setAdministrationGroup(item.administrationGroup || '');
    setDefaultDose(item.defaultDose || '');
    setAdministrationUnit(item.administrationUnit || 'mg');
    setAmpuleContent(item.ampuleTotalContent || '');
    setAdministrationRoute(item.administrationRoute || 'i.v.');
    setConfigDialogOpen(true);
  };

  // Handle config save
  const handleConfigSave = async () => {
    if (!selectedItemForConfig) return;

    // Derive rateUnit value from UI state:
    // - Medication → null
    // - Infusion without rate control → "free"
    // - Infusion with rate control → selected rate unit
    let derivedRateUnit: string | null | undefined = undefined;
    if (anesthesiaType === 'medication') {
      derivedRateUnit = null; // Bolus medications have no rate
    } else if (anesthesiaType === 'infusion') {
      if (isRateControlled) {
        derivedRateUnit = rateUnit; // Rate-controlled pump
      } else {
        derivedRateUnit = 'free'; // Free-running infusion
      }
    }

    const config: any = {
      name: itemName,
      medicationGroup: medicationGroup || undefined,
      administrationGroup: administrationGroup || undefined,
      defaultDose: defaultDose || undefined,
      ampuleTotalContent: ampuleContent.trim() || undefined,
      administrationRoute: administrationRoute,
      administrationUnit: administrationUnit || undefined, // Keep for all types (medications and infusions)
      rateUnit: derivedRateUnit,
    };

    await updateConfigMutation.mutateAsync({
      itemId: selectedItemForConfig.id,
      config,
    });

    setConfigDialogOpen(false);
    setSelectedItemForConfig(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeHospital?.unitType !== 'anesthesia') {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <i className="fas fa-syringe text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('anesthesia.settings.moduleNotConfigured')}</h3>
          <p className="text-muted-foreground mb-4">
            {t('anesthesia.settings.moduleNotConfiguredMessage')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{t('anesthesia.settings.title')}</h1>
        <p className="text-muted-foreground">
          {t('anesthesia.settings.subtitle')}
        </p>
      </div>

      <Tabs defaultValue="groups" className="w-full">
        <div className="w-full overflow-x-auto mb-6 -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-6">
            <TabsTrigger value="groups" data-testid="tab-groups" className="flex-shrink-0">{t('anesthesia.settings.groups')}</TabsTrigger>
            <TabsTrigger value="allergies" data-testid="tab-allergies" className="flex-shrink-0">{t('anesthesia.settings.allergies')}</TabsTrigger>
            <TabsTrigger value="medications" data-testid="tab-medications" className="flex-shrink-0">{t('anesthesia.settings.medications')}</TabsTrigger>
            <TabsTrigger value="illnesses" data-testid="tab-illnesses" className="flex-shrink-0">{t('anesthesia.settings.medicalHistory')}</TabsTrigger>
            <TabsTrigger value="checklists" data-testid="tab-checklists" className="flex-shrink-0">{t('anesthesia.settings.checklists')}</TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations" className="flex-shrink-0">{t('anesthesia.settings.integrations', 'Integrations')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium">{t('anesthesia.settings.administrationGroups')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('anesthesia.settings.administrationGroupsDescription')}
              </p>
            </div>
            <Button
              onClick={() => {
                setEditingGroup(null);
                setGroupFormName('');
                setGroupDialogOpen(true);
              }}
              data-testid="button-add-group"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('anesthesia.settings.addGroup')}
            </Button>
          </div>

          {administrationGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('anesthesia.settings.noGroupsYet')}
            </div>
          ) : (
            <div className="border rounded-lg">
              {administrationGroups.map((group, index) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/50"
                  data-testid={`group-row-${group.id}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveGroup(group.id, 'up')}
                        disabled={index === 0}
                        className={`p-1 rounded hover:bg-background ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        data-testid={`button-move-group-up-${group.id}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveGroup(group.id, 'down')}
                        disabled={index === administrationGroups.length - 1}
                        className={`p-1 rounded hover:bg-background ${index === administrationGroups.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        data-testid={`button-move-group-down-${group.id}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="font-medium">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingGroup(group);
                        setGroupFormName(group.name);
                        setGroupDialogOpen(true);
                      }}
                      data-testid={`button-edit-group-${group.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAdminGroupMutation.mutate(group.id)}
                      data-testid={`button-delete-group-${group.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="allergies" className="space-y-4">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-lg font-medium">{t('anesthesia.settings.commonAllergies')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('anesthesia.settings.commonAllergiesDescription')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => translateSection('allergies')}
              disabled={isTranslating === 'allergies'}
              data-testid="button-translate-allergies"
            >
              {isTranslating === 'allergies' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Languages className="h-4 w-4 mr-2" />
              )}
              EN ↔ DE
            </Button>
          </div>

          <div className="flex gap-2 mb-4">
            <Input
              value={newItemInput}
              onChange={(e) => setNewItemInput(e.target.value)}
              placeholder={t('anesthesia.settings.addNewAllergy')}
              onKeyPress={(e) => e.key === 'Enter' && addAllergy()}
              data-testid="input-new-allergy"
            />
            <Button onClick={addAllergy} data-testid="button-add-allergy">
              <Plus className="h-4 w-4 mr-2" />
              {t('common.save').replace('Save', 'Add')}
            </Button>
          </div>

          <div className="border rounded-lg">
            {(anesthesiaSettings?.allergyList || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('anesthesia.settings.noAllergiesConfigured')}
              </div>
            ) : (
              (anesthesiaSettings?.allergyList || []).map((allergy) => (
                <div
                  key={allergy.id}
                  className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                  data-testid={`allergy-item-${allergy.id}`}
                >
                  <span>{allergy.label}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingListItem({ type: 'allergy', oldId: allergy.id, oldValue: allergy.label });
                        setListItemFormValue(allergy.label);
                        setListItemDialogOpen(true);
                      }}
                      data-testid={`button-edit-allergy-${allergy.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAllergy(allergy.id)}
                      data-testid={`button-remove-allergy-${allergy.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="medications" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">{t('anesthesia.settings.medicationLists')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('anesthesia.settings.medicationListsDescription')}
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">{t('anesthesia.settings.anticoagulationMedications')}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => translateSection('anticoagulation')}
                  disabled={isTranslating === 'anticoagulation'}
                  data-testid="button-translate-anticoagulation"
                >
                  {isTranslating === 'anticoagulation' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Languages className="h-4 w-4 mr-2" />
                  )}
                  EN ↔ DE
                </Button>
              </div>
              <div className="flex gap-2 mb-3">
                <Input
                  value={editingCategory === 'anticoagulation' ? newItemInput : ''}
                  onChange={(e) => {
                    setEditingCategory('anticoagulation');
                    setNewItemInput(e.target.value);
                  }}
                  placeholder={t('anesthesia.settings.addAnticoagulationMedication')}
                  onKeyPress={(e) => e.key === 'Enter' && addMedication('anticoagulation')}
                  data-testid="input-new-anticoagulation"
                />
                <Button onClick={() => addMedication('anticoagulation')} data-testid="button-add-anticoagulation">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('common.save').replace('Save', 'Add')}
                </Button>
              </div>
              <div className="border rounded-lg">
                {(anesthesiaSettings?.medicationLists?.anticoagulation || []).map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    data-testid={`anticoag-item-${med.id}`}
                  >
                    <span>{med.label}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingListItem({ type: 'medication', category: 'anticoagulation', oldId: med.id, oldValue: med.label });
                          setListItemFormValue(med.label);
                          setListItemDialogOpen(true);
                        }}
                        data-testid={`button-edit-anticoag-${med.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMedication('anticoagulation', med.id)}
                        data-testid={`button-remove-anticoag-${med.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">{t('anesthesia.settings.generalMedications')}</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => translateSection('general')}
                  disabled={isTranslating === 'general'}
                  data-testid="button-translate-general"
                >
                  {isTranslating === 'general' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Languages className="h-4 w-4 mr-2" />
                  )}
                  EN ↔ DE
                </Button>
              </div>
              <div className="flex gap-2 mb-3">
                <Input
                  value={editingCategory === 'general' ? newItemInput : ''}
                  onChange={(e) => {
                    setEditingCategory('general');
                    setNewItemInput(e.target.value);
                  }}
                  placeholder={t('anesthesia.settings.addGeneralMedication')}
                  onKeyPress={(e) => e.key === 'Enter' && addMedication('general')}
                  data-testid="input-new-general-med"
                />
                <Button onClick={() => addMedication('general')} data-testid="button-add-general-med">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('common.save').replace('Save', 'Add')}
                </Button>
              </div>
              <div className="border rounded-lg">
                {(anesthesiaSettings?.medicationLists?.general || []).map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    data-testid={`general-med-item-${med.id}`}
                  >
                    <span>{med.label}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingListItem({ type: 'medication', category: 'general', oldId: med.id, oldValue: med.label });
                          setListItemFormValue(med.label);
                          setListItemDialogOpen(true);
                        }}
                        data-testid={`button-edit-general-med-${med.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMedication('general', med.id)}
                        data-testid={`button-remove-general-med-${med.id}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="illnesses" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">{t('anesthesia.settings.medicalHistoryLists')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('anesthesia.settings.medicalHistoryListsDescription')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { key: 'anesthesiaHistory', label: t('anesthesia.settings.anesthesiaHistory') },
              { key: 'dental', label: t('anesthesia.settings.dentalStatus') },
              { key: 'ponvTransfusion', label: t('anesthesia.settings.ponvTransfusion') },
              { key: 'cardiovascular', label: t('anesthesia.settings.cardiovascular') },
              { key: 'pulmonary', label: t('anesthesia.settings.pulmonary') },
              { key: 'gastrointestinal', label: t('anesthesia.settings.gastrointestinal') },
              { key: 'kidney', label: t('anesthesia.settings.kidney') },
              { key: 'metabolic', label: t('anesthesia.settings.metabolic') },
              { key: 'neurological', label: t('anesthesia.settings.neurological') },
              { key: 'psychiatric', label: t('anesthesia.settings.psychiatric') },
              { key: 'skeletal', label: t('anesthesia.settings.skeletal') },
              { key: 'coagulation', label: t('anesthesia.settings.coagulation') },
              { key: 'infectious', label: t('anesthesia.settings.infectiousDiseases') },
              { key: 'woman', label: t('anesthesia.settings.gynecology') },
              { key: 'noxen', label: t('anesthesia.settings.substanceUse') },
              { key: 'children', label: t('anesthesia.settings.pediatric') },
            ].map(({ key, label }) => (
              <div key={key} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{label}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => translateSection('illness', key)}
                    disabled={isTranslating === `illness-${key}`}
                    data-testid={`button-translate-illness-${key}`}
                  >
                    {isTranslating === `illness-${key}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Languages className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={editingCategory === key ? newItemInput : ''}
                    onChange={(e) => {
                      setEditingCategory(key);
                      setNewItemInput(e.target.value);
                    }}
                    placeholder={t('anesthesia.settings.addConditionPlaceholder')}
                    onKeyPress={(e) => e.key === 'Enter' && addIllness(key)}
                    className="flex-1"
                    data-testid={`input-new-illness-${key}`}
                  />
                  <Button onClick={() => addIllness(key)} size="sm" data-testid={`button-add-illness-${key}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {((anesthesiaSettings?.illnessLists as any)?.[key] || []).map((illness: any) => (
                    <div
                      key={illness.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                      data-testid={`illness-item-${key}-${illness.id}`}
                    >
                      <span className="text-sm">{illness.label}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setEditingListItem({ 
                              type: 'illness', 
                              category: key, 
                              oldValue: illness.label, 
                              oldId: illness.id,
                              patientVisible: illness.patientVisible,
                              patientLabel: illness.patientLabel,
                              patientHelpText: illness.patientHelpText,
                            });
                            setListItemFormValue(illness.label);
                            setPatientVisibleForm(illness.patientVisible !== false);
                            setPatientLabelForm(illness.patientLabel || '');
                            setPatientHelpTextForm(illness.patientHelpText || '');
                            setListItemDialogOpen(true);
                          }}
                          data-testid={`button-edit-illness-${key}-${illness.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeIllness(key, illness.id)}
                          data-testid={`button-remove-illness-${key}-${illness.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="checklists" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">{t('anesthesia.settings.whoSurgicalSafetyChecklists')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('anesthesia.settings.whoChecklistsDescription')}
            </p>
          </div>

          <div className="space-y-6">
            {[
              { key: 'signIn' as const, label: t('anesthesia.settings.signInBeforeInduction') },
              { key: 'timeOut' as const, label: t('anesthesia.settings.timeOutBeforeIncision') },
              { key: 'signOut' as const, label: t('anesthesia.settings.signOutBeforePatientLeavesOR') },
            ].map(({ key, label }) => (
              <div key={key} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">{label}</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => translateSection('checklist', key)}
                    disabled={isTranslating === `checklist-${key}`}
                    data-testid={`button-translate-checklist-${key}`}
                  >
                    {isTranslating === `checklist-${key}` ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4 mr-2" />
                    )}
                    EN ↔ DE
                  </Button>
                </div>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={editingCategory === key ? newItemInput : ''}
                    onChange={(e) => {
                      setEditingCategory(key);
                      setNewItemInput(e.target.value);
                    }}
                    placeholder={t('anesthesia.settings.addChecklistItem')}
                    onKeyPress={(e) => e.key === 'Enter' && addChecklistItem(key)}
                    data-testid={`input-new-checklist-${key}`}
                  />
                  <Button onClick={() => addChecklistItem(key)} data-testid={`button-add-checklist-${key}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('common.save').replace('Save', 'Add')}
                  </Button>
                </div>
                <div className="space-y-1">
                  {(anesthesiaSettings?.checklistItems?.[key] || []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                      data-testid={`checklist-item-${key}-${item.id}`}
                    >
                      <span className="text-sm">{item.label}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setEditingListItem({ type: 'checklist', category: key, oldId: item.id, oldValue: item.label });
                            setListItemFormValue(item.label);
                            setListItemDialogOpen(true);
                          }}
                          data-testid={`button-edit-checklist-${key}-${item.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeChecklistItem(key, item.id)}
                          data-testid={`button-remove-checklist-${key}-${item.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <SystemSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent data-testid="dialog-anesthesia-config" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('anesthesia.settings.configureMedicationInfusion')}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config">{t('anesthesia.settings.configuration')}</TabsTrigger>
              <TabsTrigger value="groups">{t('anesthesia.settings.groups')}</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="mt-4">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* Item Name */}
            <div>
              <Label htmlFor="item-name">{t('anesthesia.settings.itemName')}</Label>
              <Input
                id="item-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                data-testid="input-item-name"
                placeholder={t('anesthesia.settings.enterItemName')}
              />
            </div>

            {/* Anesthesia Type */}
            <div>
              <Label htmlFor="anesthesia-type">{t('anesthesia.settings.itemType')}</Label>
              <Select
                value={anesthesiaType}
                onValueChange={(value) => setAnesthesiaType(value as 'medication' | 'infusion')}
              >
                <SelectTrigger id="anesthesia-type" data-testid="select-anesthesia-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medication">{t('anesthesia.settings.medication')}</SelectItem>
                  <SelectItem value="infusion">{t('anesthesia.settings.infusion')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ampule/Bag Content - for both medications and infusions */}
            <div>
              <Label htmlFor="ampule-content">{t('anesthesia.settings.ampuleBagContent')}</Label>
              <Input
                id="ampule-content"
                placeholder={t('anesthesia.settings.ampuleBagContentPlaceholder')}
                value={ampuleContent}
                onChange={(e) => setAmpuleContent(e.target.value)}
                data-testid="input-ampule-content"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t('anesthesia.settings.ampuleBagContentHelp')}
              </p>
            </div>

            {/* Default Dose */}
            <div>
              <Label htmlFor="default-dose">{t('anesthesia.settings.defaultDose')}</Label>
              <Input
                id="default-dose"
                value={defaultDose}
                onChange={(e) => setDefaultDose(e.target.value)}
                data-testid="input-default-dose"
                placeholder={t('anesthesia.settings.defaultDosePlaceholder')}
              />
            </div>

            {/* Administration Route - for both medications and infusions */}
            <div>
              <Label htmlFor="route">{t('anesthesia.settings.administrationRoute')}</Label>
              <Input
                id="route"
                placeholder={t('anesthesia.settings.administrationRoutePlaceholder')}
                value={administrationRoute}
                onChange={(e) => setAdministrationRoute(e.target.value)}
                data-testid="input-route"
              />
            </div>

            {/* Medication Fields */}
            {anesthesiaType === 'medication' && (
              <div>
                <Label htmlFor="admin-unit">{t('anesthesia.settings.administrationUnit')}</Label>
                <Select value={administrationUnit} onValueChange={setAdministrationUnit}>
                  <SelectTrigger id="admin-unit" data-testid="select-admin-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="μg">{t('anesthesia.settings.micrograms')}</SelectItem>
                    <SelectItem value="mg">{t('anesthesia.settings.milligrams')}</SelectItem>
                    <SelectItem value="g">{t('anesthesia.settings.grams')}</SelectItem>
                    <SelectItem value="ml">{t('anesthesia.settings.milliliters')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Infusion Fields */}
            {anesthesiaType === 'infusion' && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="rate-controlled"
                    checked={isRateControlled}
                    onCheckedChange={(checked) => setIsRateControlled(checked as boolean)}
                    data-testid="checkbox-rate-controlled"
                  />
                  <Label htmlFor="rate-controlled" className="cursor-pointer">
                    {t('anesthesia.settings.rateControlledInfusion')}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('anesthesia.settings.rateControlledInfusionHelp')}
                </p>

                {isRateControlled && (
                  <div>
                    <Label htmlFor="rate-unit">{t('anesthesia.settings.rateUnit')}</Label>
                    <Select value={rateUnit} onValueChange={setRateUnit}>
                      <SelectTrigger id="rate-unit" data-testid="select-rate-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ml/h">ml/h</SelectItem>
                        <SelectItem value="μg/kg/min">μg/kg/min</SelectItem>
                        <SelectItem value="mg/kg/h">mg/kg/h</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-4">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* Medication Group */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="medication-group">{t('anesthesia.settings.medicationGroup')}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewGroupInput(!showNewGroupInput)}
                  data-testid="button-toggle-add-group"
                  className="h-6 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.save').replace('Save', 'Add')}
                </Button>
              </div>
              {showNewGroupInput && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t('anesthesia.settings.newGroupName')}
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newGroupName.trim()) {
                        createGroupMutation.mutate(newGroupName.trim());
                        setMedicationGroup(newGroupName.trim());
                        setNewGroupName('');
                        setShowNewGroupInput(false);
                      } else if (e.key === 'Escape') {
                        setNewGroupName('');
                        setShowNewGroupInput(false);
                      }
                    }}
                    data-testid="input-new-group"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (newGroupName.trim()) {
                        createGroupMutation.mutate(newGroupName.trim());
                        setMedicationGroup(newGroupName.trim());
                        setNewGroupName('');
                        setShowNewGroupInput(false);
                      }
                    }}
                    disabled={!newGroupName.trim()}
                    data-testid="button-save-new-group"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={medicationGroup || undefined}
                  onValueChange={(value) => setMedicationGroup(value || '')}
                >
                  <SelectTrigger id="medication-group" data-testid="select-medication-group" className="flex-1">
                    <SelectValue placeholder={t('anesthesia.settings.selectAGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {medicationGroups.map((group) => (
                      <SelectItem key={group.id} value={group.name} data-testid={`group-option-${group.id}`}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {medicationGroup && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      const groupToDelete = medicationGroups.find(g => g.name === medicationGroup);
                      if (groupToDelete) {
                        deleteGroupMutation.mutate(groupToDelete.id);
                        setMedicationGroup('');
                      }
                    }}
                    data-testid="button-delete-selected-group"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Administration Group */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="administration-group">{t('anesthesia.settings.administrationGroup')}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewAdminGroupInput(!showNewAdminGroupInput)}
                  data-testid="button-toggle-add-admin-group"
                  className="h-6 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.save').replace('Save', 'Add')}
                </Button>
              </div>
              {showNewAdminGroupInput && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder={t('anesthesia.settings.newGroupName')}
                    value={newAdminGroupName}
                    onChange={(e) => setNewAdminGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newAdminGroupName.trim()) {
                        createAdminGroupMutation.mutate(newAdminGroupName.trim());
                        setAdministrationGroup(newAdminGroupName.trim());
                        setNewAdminGroupName('');
                        setShowNewAdminGroupInput(false);
                      } else if (e.key === 'Escape') {
                        setNewAdminGroupName('');
                        setShowNewAdminGroupInput(false);
                      }
                    }}
                    data-testid="input-new-admin-group"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      if (newAdminGroupName.trim()) {
                        createAdminGroupMutation.mutate(newAdminGroupName.trim());
                        setAdministrationGroup(newAdminGroupName.trim());
                        setNewAdminGroupName('');
                        setShowNewAdminGroupInput(false);
                      }
                    }}
                    disabled={!newAdminGroupName.trim()}
                    data-testid="button-save-new-admin-group"
                  >
                    {t('common.save')}
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={administrationGroup || undefined}
                  onValueChange={(value) => setAdministrationGroup(value || '')}
                >
                  <SelectTrigger id="administration-group" data-testid="select-administration-group" className="flex-1">
                    <SelectValue placeholder={t('anesthesia.settings.selectAGroup')} />
                  </SelectTrigger>
                  <SelectContent>
                    {administrationGroups.map((group) => (
                      <SelectItem key={group.id} value={group.name} data-testid={`admin-group-option-${group.id}`}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {administrationGroup && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => {
                      const groupToDelete = administrationGroups.find(g => g.name === administrationGroup);
                      if (groupToDelete) {
                        deleteAdminGroupMutation.mutate(groupToDelete.id);
                        setAdministrationGroup('');
                      }
                    }}
                    data-testid="button-delete-selected-admin-group"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfigDialogOpen(false)}
              data-testid="button-cancel-config"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleConfigSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('anesthesia.settings.saving')}
                </>
              ) : (
                t('anesthesia.settings.saveConfiguration')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Add/Edit Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent data-testid="dialog-group-form">
          <DialogHeader>
            <DialogTitle>{editingGroup ? t('anesthesia.settings.editGroup') : t('anesthesia.settings.addGroup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">{t('anesthesia.settings.groupName')}</Label>
              <Input
                id="group-name"
                value={groupFormName}
                onChange={(e) => setGroupFormName(e.target.value)}
                placeholder={t('anesthesia.settings.enterGroupName')}
                data-testid="input-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)} data-testid="button-cancel-group">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (groupFormName.trim()) {
                  if (editingGroup) {
                    updateAdminGroupMutation.mutate({ groupId: editingGroup.id, name: groupFormName.trim() });
                  } else {
                    createAdminGroupMutation.mutate(groupFormName.trim());
                  }
                }
              }}
              disabled={!groupFormName.trim() || (editingGroup ? updateAdminGroupMutation.isPending : createAdminGroupMutation.isPending)}
              data-testid="button-save-group"
            >
              {editingGroup 
                ? (updateAdminGroupMutation.isPending ? t('anesthesia.settings.updating') : t('anesthesia.settings.update')) 
                : (createAdminGroupMutation.isPending ? t('anesthesia.settings.creating') : t('anesthesia.settings.create'))
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List Item Edit Dialog (Allergies, Medications, Illnesses, Checklists) */}
      <Dialog open={listItemDialogOpen} onOpenChange={setListItemDialogOpen}>
        <DialogContent data-testid="dialog-list-item-form">
          <DialogHeader>
            <DialogTitle>
              {editingListItem?.type === 'allergy' && t('anesthesia.settings.editAllergy')}
              {editingListItem?.type === 'medication' && t('anesthesia.settings.editMedication')}
              {editingListItem?.type === 'illness' && t('anesthesia.settings.editCondition')}
              {editingListItem?.type === 'checklist' && t('anesthesia.settings.editChecklistItem')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="list-item-value">{t('common.name')}</Label>
              <Input
                id="list-item-value"
                value={listItemFormValue}
                onChange={(e) => setListItemFormValue(e.target.value)}
                placeholder={t('anesthesia.settings.enterName')}
                onKeyPress={(e) => e.key === 'Enter' && handleSaveListItem()}
                data-testid="input-list-item-value"
              />
            </div>
            
            {editingListItem?.type === 'illness' && (
              <>
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">{t('anesthesia.settings.patientQuestionnaireSettings')}</h4>
                  
                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="patient-visible"
                      checked={patientVisibleForm}
                      onCheckedChange={(checked) => setPatientVisibleForm(checked === true)}
                      data-testid="checkbox-patient-visible"
                    />
                    <Label htmlFor="patient-visible" className="text-sm">
                      {t('anesthesia.settings.showOnPatientQuestionnaire')}
                    </Label>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="patient-label" className="text-sm">
                        {t('anesthesia.settings.patientFriendlyLabel')}
                      </Label>
                      <Input
                        id="patient-label"
                        value={patientLabelForm}
                        onChange={(e) => setPatientLabelForm(e.target.value)}
                        placeholder={t('anesthesia.settings.patientFriendlyLabelPlaceholder')}
                        className="mt-1"
                        data-testid="input-patient-label"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('anesthesia.settings.patientFriendlyLabelHelp')}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="patient-help-text" className="text-sm">
                        {t('anesthesia.settings.patientHelpText')}
                      </Label>
                      <Input
                        id="patient-help-text"
                        value={patientHelpTextForm}
                        onChange={(e) => setPatientHelpTextForm(e.target.value)}
                        placeholder={t('anesthesia.settings.patientHelpTextPlaceholder')}
                        className="mt-1"
                        data-testid="input-patient-help-text"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('anesthesia.settings.patientHelpTextHelp')}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListItemDialogOpen(false)} data-testid="button-cancel-list-item">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveListItem}
              disabled={!listItemFormValue.trim() || updateSettingsMutation.isPending}
              data-testid="button-save-list-item"
            >
              {updateSettingsMutation.isPending ? t('anesthesia.settings.updating') : t('anesthesia.settings.update')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
