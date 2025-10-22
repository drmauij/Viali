import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
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
  anesthesiaType: string;
  medicationGroup?: string;
  administrationGroup?: string;
  defaultDose?: string;
  administrationUnit?: string;
  ampuleTotalContent?: string;
  administrationRoute?: string;
  isRateControlled?: boolean;
  rateUnit?: string;
};

export default function AnesthesiaSettings() {
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
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

  // Fetch all items for the hospital's anesthesia location
  const { data: allItems = [], isLoading } = useQuery<Item[]>({
    queryKey: [`/api/items/${activeHospital?.id}?locationId=${activeHospital?.anesthesiaLocationId}`],
    enabled: !!activeHospital?.id && !!activeHospital?.anesthesiaLocationId,
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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospital?.id}?locationId=${activeHospital?.anesthesiaLocationId}`] });
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
              anesthesiaType: 'medication',
              administrationUnit: 'mg',
              administrationRoute: 'i.v.',
            },
          });
        }
      } else {
        // Removing from anesthesia items
        await updateConfigMutation.mutateAsync({
          itemId,
          config: {
            anesthesiaType: 'none',
          },
        });
      }
    }
  };

  // Handle item click in selected list (for reconfiguration)
  const handleItemClick = (item: Item) => {
    setSelectedItemForConfig(item);
    setItemName(item.name);
    const itemType = (item.anesthesiaType as 'medication' | 'infusion') || 'medication';
    setAnesthesiaType(itemType);
    setMedicationGroup(item.medicationGroup || '');
    setAdministrationGroup(item.administrationGroup || '');
    setDefaultDose(item.defaultDose || '');
    setAdministrationUnit(item.administrationUnit || 'mg');
    setAmpuleContent(item.ampuleTotalContent || ''); // Load content for both medications and infusions
    setAdministrationRoute(item.administrationRoute || 'i.v.');
    setIsRateControlled(item.isRateControlled || false);
    setRateUnit(item.rateUnit || 'ml/h');
    setConfigDialogOpen(true);
  };

  // Handle config save
  const handleConfigSave = async () => {
    if (!selectedItemForConfig) return;

    const config: any = {
      name: itemName,
      anesthesiaType,
      medicationGroup: medicationGroup || undefined,
      administrationGroup: administrationGroup || undefined,
      defaultDose: defaultDose || undefined,
      ampuleTotalContent: ampuleContent.trim() || undefined,
      administrationRoute: administrationRoute, // For both medications and infusions
    };

    if (anesthesiaType === 'medication') {
      config.administrationUnit = administrationUnit;
      // Clear infusion-only fields for medications
      config.isRateControlled = undefined;
      config.rateUnit = undefined;
    } else {
      // For infusions: clear medication-specific fields
      config.administrationUnit = undefined;
      config.isRateControlled = isRateControlled;
      config.rateUnit = rateUnit;
    }

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

  if (!activeHospital?.anesthesiaLocationId) {
    return (
      <div className="p-6">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <i className="fas fa-syringe text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">Anesthesia Module Not Configured</h3>
          <p className="text-muted-foreground mb-4">
            An administrator needs to configure which inventory location should be used for anesthesia items.
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
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="items" data-testid="tab-items">Anesthesia Items</TabsTrigger>
          <TabsTrigger value="groups" data-testid="tab-groups">Groups</TabsTrigger>
          <TabsTrigger value="rooms" data-testid="tab-rooms">Surgery Rooms</TabsTrigger>
        </TabsList>

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
                    // Update not yet implemented since backend doesn't have it
                    toast({ title: "Not implemented", description: "Group editing will be added soon" });
                  } else {
                    createAdminGroupMutation.mutate(groupFormName.trim());
                  }
                  setGroupDialogOpen(false);
                  setEditingGroup(null);
                  setGroupFormName('');
                }
              }}
              disabled={!groupFormName.trim()}
              data-testid="button-save-group"
            >
              {editingGroup ? 'Update' : 'Create'}
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
