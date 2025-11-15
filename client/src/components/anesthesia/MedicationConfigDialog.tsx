import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Item = {
  id: string;
  name: string;
  rateUnit?: string | null;
  defaultDose?: string | null;
  administrationRoute?: string | null;
  administrationUnit?: string | null;
  ampuleTotalContent?: string | null;
  medicationGroup?: string | null;
  administrationGroup?: string | null;
};

type AdministrationGroup = {
  id: string;
  name: string;
};

interface MedicationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  administrationGroup: AdministrationGroup | null;
  activeHospitalId: string | undefined;
  editingItem?: Item | null; // If provided, we're in edit mode
  onSaveSuccess?: () => void;
}

export function MedicationConfigDialog({
  open,
  onOpenChange,
  administrationGroup,
  activeHospitalId,
  editingItem,
  onSaveSuccess,
}: MedicationConfigDialogProps) {
  const { toast } = useToast();
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Form state
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [configItemName, setConfigItemName] = useState("");
  const [configAnesthesiaType, setConfigAnesthesiaType] = useState<'medication' | 'infusion'>('medication');
  const [configDefaultDose, setConfigDefaultDose] = useState("");
  const [configAdministrationRoute, setConfigAdministrationRoute] = useState("i.v.");
  const [configAdministrationUnit, setConfigAdministrationUnit] = useState("mg");
  const [configAmpuleContent, setConfigAmpuleContent] = useState("");
  const [configIsRateControlled, setConfigIsRateControlled] = useState(false);
  const [configRateUnit, setConfigRateUnit] = useState("ml/h");
  const [configMedicationGroup, setConfigMedicationGroup] = useState("");

  // Quick add form state
  const [quickAddName, setQuickAddName] = useState("");

  // Fetch all inventory items
  const { data: allInventoryItems = [] } = useQuery<Item[]>({
    queryKey: [`/api/items/${activeHospitalId}?unitId=${activeHospitalId}`],
    enabled: !!activeHospitalId && open,
  });

  // Filter items based on search query
  const filteredItems = allInventoryItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pre-fill form when editing an existing item
  useEffect(() => {
    if (editingItem) {
      setSelectedItemId(editingItem.id);
      setConfigItemName(editingItem.name);
      
      if (editingItem.rateUnit === null || editingItem.rateUnit === undefined) {
        setConfigAnesthesiaType('medication');
        setConfigIsRateControlled(false);
      } else if (editingItem.rateUnit === 'free') {
        setConfigAnesthesiaType('infusion');
        setConfigIsRateControlled(false);
      } else {
        setConfigAnesthesiaType('infusion');
        setConfigIsRateControlled(true);
        setConfigRateUnit(editingItem.rateUnit);
      }
      
      setConfigDefaultDose(editingItem.defaultDose || '');
      setConfigAdministrationRoute(editingItem.administrationRoute || 'i.v.');
      setConfigAdministrationUnit(editingItem.administrationUnit || 'mg');
      setConfigAmpuleContent(editingItem.ampuleTotalContent || '');
      setConfigMedicationGroup(editingItem.medicationGroup || '');
    }
  }, [editingItem]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedItemId("");
      setConfigItemName("");
      setConfigDefaultDose("");
      setConfigAdministrationRoute("i.v.");
      setConfigAdministrationUnit("mg");
      setConfigAmpuleContent("");
      setConfigIsRateControlled(false);
      setConfigRateUnit("ml/h");
      setConfigMedicationGroup("");
      setConfigAnesthesiaType('medication');
      setSearchQuery("");
      setShowQuickAdd(false);
      setQuickAddName("");
    }
  }, [open]);

  // Mutation to create a new item
  const createItemMutation = useMutation({
    mutationFn: async (newItem: { name: string }) => {
      return apiRequest('POST', `/api/items`, { ...newItem, hospitalId: activeHospitalId });
    },
    onSuccess: (data: Item) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeHospitalId}`] });
      toast({
        title: "Item created",
        description: `${data.name} has been added to inventory`,
      });
      // Select the newly created item
      setSelectedItemId(data.id);
      setConfigItemName(data.name);
      setShowQuickAdd(false);
      setQuickAddName("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create item",
      });
    },
  });

  // Mutation to update item configuration
  const updateConfigMutation = useMutation({
    mutationFn: async ({ itemId, config }: { itemId: string; config: any }) => {
      return apiRequest('PATCH', `/api/items/${itemId}/anesthesia-config`, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospitalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeHospitalId}`] });
      toast({
        title: editingItem ? "Configuration updated" : "Configuration saved",
        description: editingItem 
          ? "Medication configuration has been updated" 
          : "Medication has been configured and added to the group",
      });
      onOpenChange(false);
      onSaveSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update configuration",
      });
    },
  });

  // Mutation to remove medication (clear administration group)
  const removeMedicationMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest('PATCH', `/api/items/${itemId}/anesthesia-config`, {
        administrationGroup: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${activeHospitalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeHospitalId}`] });
      toast({
        title: "Medication removed",
        description: "Medication has been removed from the administration group",
      });
      onOpenChange(false);
      onSaveSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to remove medication",
      });
    },
  });

  const handleQuickAdd = () => {
    if (!quickAddName.trim()) return;
    createItemMutation.mutate({ name: quickAddName.trim() });
  };

  const handleSave = () => {
    if (!selectedItemId || !administrationGroup) return;

    // Derive rateUnit from UI state
    let derivedRateUnit: string | null | undefined = undefined;
    if (configAnesthesiaType === 'medication') {
      derivedRateUnit = null;
    } else if (configAnesthesiaType === 'infusion') {
      derivedRateUnit = configIsRateControlled ? configRateUnit : 'free';
    }

    const config = {
      name: configItemName,
      medicationGroup: configMedicationGroup || undefined,
      administrationGroup: administrationGroup.name,
      defaultDose: configDefaultDose || undefined,
      ampuleTotalContent: configAmpuleContent.trim() || undefined,
      administrationRoute: configAdministrationRoute,
      administrationUnit: configAdministrationUnit || undefined,
      rateUnit: derivedRateUnit,
    };

    updateConfigMutation.mutate({ itemId: selectedItemId, config });
  };

  const handleRemove = () => {
    if (!selectedItemId) return;
    removeMedicationMutation.mutate(selectedItemId);
  };

  const handleItemSelection = (itemId: string) => {
    setSelectedItemId(itemId);
    const item = allInventoryItems.find(i => i.id === itemId);
    if (item) {
      setConfigItemName(item.name);
      // Pre-fill existing config if available
      if (item.rateUnit === null || item.rateUnit === undefined) {
        setConfigAnesthesiaType('medication');
        setConfigIsRateControlled(false);
      } else if (item.rateUnit === 'free') {
        setConfigAnesthesiaType('infusion');
        setConfigIsRateControlled(false);
      } else {
        setConfigAnesthesiaType('infusion');
        setConfigIsRateControlled(true);
        setConfigRateUnit(item.rateUnit);
      }
      setConfigDefaultDose(item.defaultDose || '');
      setConfigAdministrationRoute(item.administrationRoute || 'i.v.');
      setConfigAdministrationUnit(item.administrationUnit || 'mg');
      setConfigAmpuleContent(item.ampuleTotalContent || '');
      setConfigMedicationGroup(item.medicationGroup || '');
    }
    setComboboxOpen(false);
  };

  const selectedItem = allInventoryItems.find(i => i.id === selectedItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]" data-testid="dialog-medication-config">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? `Edit Medication Configuration` : `Configure Medication for ${administrationGroup?.name}`}
          </DialogTitle>
          <DialogDescription>
            {editingItem 
              ? "Update the medication settings or remove it from the group"
              : "Select an item and configure its medication/infusion settings to add it to this group"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {/* Item Selection with Searchable Combobox */}
          <div className="grid gap-2">
            <Label>Select Item</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  className="justify-between"
                  data-testid="button-select-item"
                  disabled={!!editingItem} // Disable changing item in edit mode
                >
                  {selectedItem ? selectedItem.name : "Select an item..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput 
                    placeholder="Search items..." 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="text-center py-2">
                        <p className="text-sm text-muted-foreground mb-2">No item found.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowQuickAdd(true);
                            setQuickAddName(searchQuery);
                            setComboboxOpen(false);
                          }}
                          data-testid="button-quick-add"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Quick Add "{searchQuery}"
                        </Button>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredItems.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={() => handleItemSelection(item.id)}
                          data-testid={`item-option-${item.id}`}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              selectedItemId === item.id ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Quick Add Section */}
          {showQuickAdd && (
            <div className="grid gap-2 p-4 border rounded-lg bg-muted/50">
              <Label htmlFor="quick-add-name">Quick Add New Item</Label>
              <div className="flex gap-2">
                <Input
                  id="quick-add-name"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder="Enter item name"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleQuickAdd();
                    }
                  }}
                  autoFocus
                  data-testid="input-quick-add-name"
                />
                <Button
                  onClick={handleQuickAdd}
                  disabled={!quickAddName.trim() || createItemMutation.isPending}
                  size="sm"
                  data-testid="button-confirm-quick-add"
                >
                  {createItemMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowQuickAdd(false);
                    setQuickAddName("");
                  }}
                  size="sm"
                  data-testid="button-cancel-quick-add"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {selectedItemId && (
            <>
              {/* Item Name */}
              <div className="grid gap-2">
                <Label htmlFor="config-item-name">Item Name</Label>
                <Input
                  id="config-item-name"
                  value={configItemName}
                  onChange={(e) => setConfigItemName(e.target.value)}
                  data-testid="input-config-item-name"
                />
              </div>

              {/* Type Selection */}
              <div className="grid gap-2">
                <Label htmlFor="config-type">Item Type</Label>
                <Select
                  value={configAnesthesiaType}
                  onValueChange={(value) => setConfigAnesthesiaType(value as 'medication' | 'infusion')}
                >
                  <SelectTrigger id="config-type" data-testid="select-config-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication">Medication</SelectItem>
                    <SelectItem value="infusion">Infusion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ampule/Bag Content */}
              <div className="grid gap-2">
                <Label htmlFor="config-ampule">Ampule/Bag Content</Label>
                <Input
                  id="config-ampule"
                  value={configAmpuleContent}
                  onChange={(e) => setConfigAmpuleContent(e.target.value)}
                  placeholder="e.g., 50 mg, 1000 ml"
                  data-testid="input-config-ampule"
                />
              </div>

              {/* Default Dose */}
              <div className="grid gap-2">
                <Label htmlFor="config-dose">Default Dose</Label>
                <Input
                  id="config-dose"
                  value={configDefaultDose}
                  onChange={(e) => setConfigDefaultDose(e.target.value)}
                  placeholder="e.g., 2, 0.1, or range like 25-35-50"
                  data-testid="input-config-dose"
                />
              </div>

              {/* Administration Route */}
              <div className="grid gap-2">
                <Label htmlFor="config-route">Administration Route</Label>
                <Input
                  id="config-route"
                  value={configAdministrationRoute}
                  onChange={(e) => setConfigAdministrationRoute(e.target.value)}
                  placeholder="e.g., i.v., i.m., s.c."
                  data-testid="input-config-route"
                />
              </div>

              {/* Type-specific fields */}
              {configAnesthesiaType === 'medication' && (
                <div className="grid gap-2">
                  <Label htmlFor="config-unit">Administration Unit</Label>
                  <Select value={configAdministrationUnit} onValueChange={setConfigAdministrationUnit}>
                    <SelectTrigger id="config-unit" data-testid="select-config-unit">
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

              {configAnesthesiaType === 'infusion' && (
                <>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="config-rate-controlled"
                      checked={configIsRateControlled}
                      onCheckedChange={(checked) => setConfigIsRateControlled(checked as boolean)}
                      data-testid="checkbox-config-rate-controlled"
                    />
                    <Label htmlFor="config-rate-controlled" className="cursor-pointer">
                      Rate-controlled infusion
                    </Label>
                  </div>

                  {configIsRateControlled && (
                    <div className="grid gap-2">
                      <Label htmlFor="config-rate-unit">Rate Unit</Label>
                      <Select value={configRateUnit} onValueChange={setConfigRateUnit}>
                        <SelectTrigger id="config-rate-unit" data-testid="select-config-rate-unit">
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
            </>
          )}
        </div>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <div>
              {editingItem && (
                <Button
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={removeMedicationMutation.isPending}
                  data-testid="button-remove-medication"
                >
                  {removeMedicationMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-config"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!selectedItemId || updateConfigMutation.isPending}
                data-testid="button-save-config"
              >
                {updateConfigMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingItem ? "Update Configuration" : "Save Configuration"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
