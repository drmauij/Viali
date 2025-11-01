import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Loader2, Plus, X, ChevronUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
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

export default function AnesthesiaSettings() {
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
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.anesthesiaUnitId}`],
    enabled: !!activeHospital?.id && !!activeHospital?.anesthesiaUnitId,
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

  // Fetch surgery rooms for this hospital
  const { data: surgeryRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
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

  // State for Surgery Rooms management tab
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<any | null>(null);
  const [roomFormName, setRoomFormName] = useState('');

  // State for editing settings
  const [newItemInput, setNewItemInput] = useState('');
  const [newItemId, setNewItemId] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.anesthesiaUnitId}`] });
      toast({
        title: "Configuration updated",
        description: "Anesthesia item configuration has been saved",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update configuration",
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
        title: "Group created",
        description: "Medication group has been added",
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
        title: "Group deleted",
        description: "Medication group has been removed",
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
        title: "Group created",
        description: "Administration group has been added",
      });
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
        title: "Group updated",
        description: "Administration group has been updated",
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
        title: "Group deleted",
        description: "Administration group has been removed",
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

  // Surgery Rooms mutations
  const createRoomMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', `/api/surgery-rooms`, { hospitalId: activeHospital?.id, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: "Room created", description: "Surgery room has been added" });
      setRoomDialogOpen(false);
      setRoomFormName('');
    },
  });

  const updateRoomMutation = useMutation({
    mutationFn: async ({ roomId, name }: { roomId: string; name: string }) => {
      return apiRequest('PUT', `/api/surgery-rooms/${roomId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: "Room updated", description: "Surgery room has been updated" });
      setRoomDialogOpen(false);
      setEditingRoom(null);
      setRoomFormName('');
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (roomId: string) => {
      return apiRequest('DELETE', `/api/surgery-rooms/${roomId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
      toast({ title: "Room deleted", description: "Surgery room has been removed" });
    },
  });

  const reorderRoomsMutation = useMutation({
    mutationFn: async (roomIds: string[]) => {
      return apiRequest('PUT', `/api/surgery-rooms/reorder`, { roomIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery-rooms/${activeHospital?.id}`] });
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
        title: "Settings updated",
        description: "Anesthesia settings have been updated",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update settings",
      });
    },
  });

  // Helper functions for managing settings lists
  const addAllergy = () => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentList = anesthesiaSettings.allergyList || [];
    if (!currentList.includes(newItemInput.trim())) {
      updateSettingsMutation.mutate({
        allergyList: [...currentList, newItemInput.trim()],
      });
      setNewItemInput('');
    }
  };

  const removeAllergy = (allergy: string) => {
    if (!anesthesiaSettings) return;
    updateSettingsMutation.mutate({
      allergyList: (anesthesiaSettings.allergyList || []).filter(a => a !== allergy),
    });
  };

  const addMedication = (category: 'anticoagulation' | 'general') => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.medicationLists || {};
    const currentList = currentLists[category] || [];
    if (!currentList.includes(newItemInput.trim())) {
      updateSettingsMutation.mutate({
        medicationLists: {
          ...currentLists,
          [category]: [...currentList, newItemInput.trim()],
        },
      });
      setNewItemInput('');
    }
  };

  const removeMedication = (category: 'anticoagulation' | 'general', medication: string) => {
    if (!anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.medicationLists || {};
    updateSettingsMutation.mutate({
      medicationLists: {
        ...currentLists,
        [category]: (currentLists[category] || []).filter(m => m !== medication),
      },
    });
  };

  const addIllness = (category: string) => {
    if (!newItemInput.trim() || !newItemId.trim() || !anesthesiaSettings) return;
    const currentLists = anesthesiaSettings.illnessLists || {};
    const currentList = (currentLists as any)[category] || [];
    const newItem = { id: newItemId.trim(), label: newItemInput.trim() };
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

  const addChecklistItem = (category: 'signIn' | 'timeOut' | 'signOut') => {
    if (!newItemInput.trim() || !anesthesiaSettings) return;
    const currentItems = anesthesiaSettings.checklistItems || {};
    const currentList = currentItems[category] || [];
    if (!currentList.includes(newItemInput.trim())) {
      updateSettingsMutation.mutate({
        checklistItems: {
          ...currentItems,
          [category]: [...currentList, newItemInput.trim()],
        },
      });
      setNewItemInput('');
    }
  };

  const removeChecklistItem = (category: 'signIn' | 'timeOut' | 'signOut', item: string) => {
    if (!anesthesiaSettings) return;
    const currentItems = anesthesiaSettings.checklistItems || {};
    updateSettingsMutation.mutate({
      checklistItems: {
        ...currentItems,
        [category]: (currentItems[category] || []).filter(i => i !== item),
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

  const moveRoom = (roomId: string, direction: 'up' | 'down') => {
    const currentIndex = surgeryRooms.findIndex(r => r.id === roomId);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= surgeryRooms.length) return;
    
    const reordered = arrayMove(surgeryRooms, currentIndex, newIndex);
    reorderRoomsMutation.mutate(reordered.map(r => r.id));
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

  if (!activeHospital?.anesthesiaUnitId) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <i className="fas fa-syringe text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">Anesthesia Module Not Configured</h3>
          <p className="text-muted-foreground mb-4">
            An administrator needs to configure which inventory units should be used for anesthesia items.
            Please contact your hospital admin to set this up in Hospital Settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Anesthesia Settings</h1>
        <p className="text-muted-foreground">
          Configure anesthesia module settings including items, groups, and surgery rooms.
        </p>
      </div>

      <Tabs defaultValue="items" className="w-full">
        <div className="w-full overflow-x-auto mb-6 -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex w-auto min-w-full md:grid md:w-full md:grid-cols-7">
            <TabsTrigger value="items" data-testid="tab-items" className="flex-shrink-0">Items</TabsTrigger>
            <TabsTrigger value="groups" data-testid="tab-groups" className="flex-shrink-0">Groups</TabsTrigger>
            <TabsTrigger value="rooms" data-testid="tab-rooms" className="flex-shrink-0">Rooms</TabsTrigger>
            <TabsTrigger value="allergies" data-testid="tab-allergies" className="flex-shrink-0">Allergies</TabsTrigger>
            <TabsTrigger value="medications" data-testid="tab-medications" className="flex-shrink-0">Medications</TabsTrigger>
            <TabsTrigger value="illnesses" data-testid="tab-illnesses" className="flex-shrink-0">Medical History</TabsTrigger>
            <TabsTrigger value="checklists" data-testid="tab-checklists" className="flex-shrink-0">Checklists</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="items" className="space-y-4">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Configure which inventory items should appear in anesthesia records. Click an item in the
              right panel to configure medication/infusion details.
            </p>
          </div>

          <ItemTransferList
            availableItems={availableItems}
            selectedItems={selectedItems}
            onMove={handleMove}
            onItemClick={handleItemClick}
          />
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium">Administration Groups</h3>
              <p className="text-sm text-muted-foreground">
                Manage groups for organizing medications in anesthesia charts. Use up/down buttons to reorder.
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
              Add Group
            </Button>
          </div>

          {administrationGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No groups yet. Click "Add Group" to create one.
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

        <TabsContent value="rooms" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium">Surgery Rooms</h3>
              <p className="text-sm text-muted-foreground">
                Manage operating rooms for the anesthesia module. Use up/down buttons to reorder.
              </p>
            </div>
            <Button
              onClick={() => {
                setEditingRoom(null);
                setRoomFormName('');
                setRoomDialogOpen(true);
              }}
              data-testid="button-add-room"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Room
            </Button>
          </div>

          {surgeryRooms.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No surgery rooms yet. Click "Add Room" to create one.
            </div>
          ) : (
            <div className="border rounded-lg">
              {surgeryRooms.map((room, index) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between p-4 border-b last:border-b-0 hover:bg-muted/50"
                  data-testid={`room-row-${room.id}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveRoom(room.id, 'up')}
                        disabled={index === 0}
                        className={`p-1 rounded hover:bg-background ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        data-testid={`button-move-room-up-${room.id}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveRoom(room.id, 'down')}
                        disabled={index === surgeryRooms.length - 1}
                        className={`p-1 rounded hover:bg-background ${index === surgeryRooms.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        data-testid={`button-move-room-down-${room.id}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="font-medium">{room.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingRoom(room);
                        setRoomFormName(room.name);
                        setRoomDialogOpen(true);
                      }}
                      data-testid={`button-edit-room-${room.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRoomMutation.mutate(room.id)}
                      data-testid={`button-delete-room-${room.id}`}
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
          <div className="mb-4">
            <h3 className="text-lg font-medium">Common Allergies</h3>
            <p className="text-sm text-muted-foreground">
              Manage the list of common allergies available in patient records and pre-op assessments.
            </p>
          </div>

          <div className="flex gap-2 mb-4">
            <Input
              value={newItemInput}
              onChange={(e) => setNewItemInput(e.target.value)}
              placeholder="Add new allergy..."
              onKeyPress={(e) => e.key === 'Enter' && addAllergy()}
              data-testid="input-new-allergy"
            />
            <Button onClick={addAllergy} data-testid="button-add-allergy">
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          <div className="border rounded-lg">
            {(anesthesiaSettings?.allergyList || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No allergies configured. Add one above.
              </div>
            ) : (
              (anesthesiaSettings?.allergyList || []).map((allergy) => (
                <div
                  key={allergy}
                  className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                  data-testid={`allergy-item-${allergy}`}
                >
                  <span>{allergy}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAllergy(allergy)}
                    data-testid={`button-remove-allergy-${allergy}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="medications" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">Medication Lists</h3>
            <p className="text-sm text-muted-foreground">
              Manage medication lists used in pre-operative assessments.
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="font-medium mb-3">Anticoagulation Medications</h4>
              <div className="flex gap-2 mb-3">
                <Input
                  value={editingCategory === 'anticoagulation' ? newItemInput : ''}
                  onChange={(e) => {
                    setEditingCategory('anticoagulation');
                    setNewItemInput(e.target.value);
                  }}
                  placeholder="Add anticoagulation medication..."
                  onKeyPress={(e) => e.key === 'Enter' && addMedication('anticoagulation')}
                  data-testid="input-new-anticoagulation"
                />
                <Button onClick={() => addMedication('anticoagulation')} data-testid="button-add-anticoagulation">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              <div className="border rounded-lg">
                {(anesthesiaSettings?.medicationLists?.anticoagulation || []).map((med) => (
                  <div
                    key={med}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    data-testid={`anticoag-item-${med}`}
                  >
                    <span>{med}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMedication('anticoagulation', med)}
                      data-testid={`button-remove-anticoag-${med}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">General Medications</h4>
              <div className="flex gap-2 mb-3">
                <Input
                  value={editingCategory === 'general' ? newItemInput : ''}
                  onChange={(e) => {
                    setEditingCategory('general');
                    setNewItemInput(e.target.value);
                  }}
                  placeholder="Add general medication..."
                  onKeyPress={(e) => e.key === 'Enter' && addMedication('general')}
                  data-testid="input-new-general-med"
                />
                <Button onClick={() => addMedication('general')} data-testid="button-add-general-med">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
              <div className="border rounded-lg">
                {(anesthesiaSettings?.medicationLists?.general || []).map((med) => (
                  <div
                    key={med}
                    className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-muted/50"
                    data-testid={`general-med-item-${med}`}
                  >
                    <span>{med}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMedication('general', med)}
                      data-testid={`button-remove-general-med-${med}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="illnesses" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">Medical History Lists</h3>
            <p className="text-sm text-muted-foreground">
              Manage illness options organized by body system for pre-operative assessments.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { key: 'cardiovascular', label: 'Cardiovascular' },
              { key: 'pulmonary', label: 'Pulmonary' },
              { key: 'gastrointestinal', label: 'Gastrointestinal' },
              { key: 'kidney', label: 'Kidney' },
              { key: 'metabolic', label: 'Metabolic' },
              { key: 'neurological', label: 'Neurological' },
              { key: 'psychiatric', label: 'Psychiatric' },
              { key: 'skeletal', label: 'Skeletal' },
              { key: 'woman', label: 'Gynecology' },
              { key: 'noxen', label: 'Substance Use' },
              { key: 'children', label: 'Pediatric' },
            ].map(({ key, label }) => (
              <div key={key} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">{label}</h4>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={editingCategory === key ? newItemId : ''}
                    onChange={(e) => {
                      setEditingCategory(key);
                      setNewItemId(e.target.value);
                    }}
                    placeholder="ID (e.g., htn, copd)"
                    className="w-40"
                    data-testid={`input-new-illness-id-${key}`}
                  />
                  <Input
                    value={editingCategory === key ? newItemInput : ''}
                    onChange={(e) => {
                      setEditingCategory(key);
                      setNewItemInput(e.target.value);
                    }}
                    placeholder={`Label (e.g., Hypertension)`}
                    onKeyPress={(e) => e.key === 'Enter' && addIllness(key)}
                    data-testid={`input-new-illness-label-${key}`}
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
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{illness.label}</span>
                        <span className="text-xs text-muted-foreground">ID: {illness.id}</span>
                      </div>
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
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="checklists" className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-medium">WHO Surgical Safety Checklists</h3>
            <p className="text-sm text-muted-foreground">
              Manage checklist items for the three phases of surgical procedures.
            </p>
          </div>

          <div className="space-y-6">
            {[
              { key: 'signIn' as const, label: 'Sign In (Before Induction)' },
              { key: 'timeOut' as const, label: 'Time Out (Before Incision)' },
              { key: 'signOut' as const, label: 'Sign Out (Before Patient Leaves OR)' },
            ].map(({ key, label }) => (
              <div key={key} className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">{label}</h4>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={editingCategory === key ? newItemInput : ''}
                    onChange={(e) => {
                      setEditingCategory(key);
                      setNewItemInput(e.target.value);
                    }}
                    placeholder="Add checklist item..."
                    onKeyPress={(e) => e.key === 'Enter' && addChecklistItem(key)}
                    data-testid={`input-new-checklist-${key}`}
                  />
                  <Button onClick={() => addChecklistItem(key)} data-testid={`button-add-checklist-${key}`}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
                <div className="space-y-1">
                  {(anesthesiaSettings?.checklistItems?.[key] || []).map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                      data-testid={`checklist-item-${key}-${item}`}
                    >
                      <span className="text-sm">{item}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeChecklistItem(key, item)}
                        data-testid={`button-remove-checklist-${key}-${item}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Configuration Dialog */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent data-testid="dialog-anesthesia-config" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Configure Medication/Infusion
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="groups">Groups</TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="mt-4">
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {/* Item Name */}
            <div>
              <Label htmlFor="item-name">Item Name</Label>
              <Input
                id="item-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                data-testid="input-item-name"
                placeholder="Enter item name"
              />
            </div>

            {/* Anesthesia Type */}
            <div>
              <Label htmlFor="anesthesia-type">Item Type</Label>
              <Select
                value={anesthesiaType}
                onValueChange={(value) => setAnesthesiaType(value as 'medication' | 'infusion')}
              >
                <SelectTrigger id="anesthesia-type" data-testid="select-anesthesia-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medication">Medication</SelectItem>
                  <SelectItem value="infusion">Infusion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Ampule/Bag Content - for both medications and infusions */}
            <div>
              <Label htmlFor="ampule-content">Ampule/Bag Content</Label>
              <Input
                id="ampule-content"
                placeholder="e.g., 50 mg, 1000 ml, 0.1 mg"
                value={ampuleContent}
                onChange={(e) => setAmpuleContent(e.target.value)}
                data-testid="input-ampule-content"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter the total amount per ampule or bag (e.g., 50 mg for Rocuronium, 1000 ml for Ringerfundin)
              </p>
            </div>

            {/* Default Dose */}
            <div>
              <Label htmlFor="default-dose">Default Dose</Label>
              <Input
                id="default-dose"
                value={defaultDose}
                onChange={(e) => setDefaultDose(e.target.value)}
                data-testid="input-default-dose"
                placeholder="e.g., 2, 0.1, or range like 25-35-50"
              />
            </div>

            {/* Administration Route - for both medications and infusions */}
            <div>
              <Label htmlFor="route">Administration Route</Label>
              <Input
                id="route"
                placeholder="e.g., i.v., i.m., s.c."
                value={administrationRoute}
                onChange={(e) => setAdministrationRoute(e.target.value)}
                data-testid="input-route"
              />
            </div>

            {/* Medication Fields */}
            {anesthesiaType === 'medication' && (
              <div>
                <Label htmlFor="admin-unit">Administration Unit</Label>
                <Select value={administrationUnit} onValueChange={setAdministrationUnit}>
                  <SelectTrigger id="admin-unit" data-testid="select-admin-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="μg">μg (micrograms)</SelectItem>
                    <SelectItem value="mg">mg (milligrams)</SelectItem>
                    <SelectItem value="g">g (grams)</SelectItem>
                    <SelectItem value="ml">ml (milliliters)</SelectItem>
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
                    Rate-controlled infusion
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Rate-controlled infusions show rate changes with vertical ticks. 
                  Free-flow infusions (e.g., Ringer) show as dashed lines.
                </p>

                {isRateControlled && (
                  <div>
                    <Label htmlFor="rate-unit">Rate Unit</Label>
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
                <Label htmlFor="medication-group">Medication Group</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewGroupInput(!showNewGroupInput)}
                  data-testid="button-toggle-add-group"
                  className="h-6 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {showNewGroupInput && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New group name"
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
                    Save
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={medicationGroup || undefined}
                  onValueChange={(value) => setMedicationGroup(value || '')}
                >
                  <SelectTrigger id="medication-group" data-testid="select-medication-group" className="flex-1">
                    <SelectValue placeholder="Select a group" />
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
                <Label htmlFor="administration-group">Administration Group</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewAdminGroupInput(!showNewAdminGroupInput)}
                  data-testid="button-toggle-add-admin-group"
                  className="h-6 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {showNewAdminGroupInput && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="New group name"
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
                    Save
                  </Button>
                </div>
              )}
              <div className="flex gap-2">
                <Select
                  value={administrationGroup || undefined}
                  onValueChange={(value) => setAdministrationGroup(value || '')}
                >
                  <SelectTrigger id="administration-group" data-testid="select-administration-group" className="flex-1">
                    <SelectValue placeholder="Select a group" />
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
              Cancel
            </Button>
            <Button
              onClick={handleConfigSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-config"
            >
              {updateConfigMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Add/Edit Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent data-testid="dialog-group-form">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Add Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="group-name">Group Name</Label>
              <Input
                id="group-name"
                value={groupFormName}
                onChange={(e) => setGroupFormName(e.target.value)}
                placeholder="Enter group name"
                data-testid="input-group-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)} data-testid="button-cancel-group">
              Cancel
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
                ? (updateAdminGroupMutation.isPending ? 'Updating...' : 'Update') 
                : (createAdminGroupMutation.isPending ? 'Creating...' : 'Create')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Surgery Room Add/Edit Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent data-testid="dialog-room-form">
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Surgery Room' : 'Add Surgery Room'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="room-name">Room Name</Label>
              <Input
                id="room-name"
                value={roomFormName}
                onChange={(e) => setRoomFormName(e.target.value)}
                placeholder="Enter room name (e.g., OR 1, OR 2)"
                data-testid="input-room-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)} data-testid="button-cancel-room">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (roomFormName.trim()) {
                  if (editingRoom) {
                    updateRoomMutation.mutate({ roomId: editingRoom.id, name: roomFormName.trim() });
                  } else {
                    createRoomMutation.mutate(roomFormName.trim());
                  }
                }
              }}
              disabled={!roomFormName.trim() || (editingRoom ? updateRoomMutation.isPending : createRoomMutation.isPending)}
              data-testid="button-save-room"
            >
              {editingRoom ? updateRoomMutation.isPending ? 'Updating...' : 'Update' : createRoomMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
