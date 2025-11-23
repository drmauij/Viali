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
import { useTranslation } from "react-i18next";

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
  activeUnitId: string | undefined;
  editingItem?: Item | null; // If provided, we're in edit mode
  onSaveSuccess?: () => void;
}

export function MedicationConfigDialog({
  open,
  onOpenChange,
  administrationGroup,
  activeHospitalId,
  activeUnitId,
  editingItem,
  onSaveSuccess,
}: MedicationConfigDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
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
    queryKey: [`/api/items/${activeHospitalId}?unitId=${activeUnitId}`, activeUnitId],
    enabled: !!activeHospitalId && !!activeUnitId && open,
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
      return apiRequest('POST', `/api/items`, { ...newItem, hospitalId: activeHospitalId }) as Promise<Item>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeUnitId}`] });
      toast({
        title: t("anesthesia.timeline.itemCreated"),
        description: `${data.name} ${t("anesthesia.timeline.itemCreatedDescription")}`,
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
        title: t("anesthesia.timeline.error"),
        description: error.message || t("anesthesia.timeline.failedToCreateItem"),
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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeUnitId}`] });
      toast({
        title: editingItem ? t("anesthesia.timeline.configurationUpdated") : t("anesthesia.timeline.configurationSaved"),
        description: editingItem 
          ? t("anesthesia.timeline.configUpdatedDescription")
          : t("anesthesia.timeline.configSavedDescription"),
      });
      onOpenChange(false);
      onSaveSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("anesthesia.timeline.error"),
        description: error.message || t("anesthesia.timeline.failedToUpdateConfig"),
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
      queryClient.invalidateQueries({ queryKey: [`/api/items/${activeHospitalId}?unitId=${activeUnitId}`] });
      toast({
        title: t("anesthesia.timeline.medicationRemoved"),
        description: t("anesthesia.timeline.medicationRemovedDescription"),
      });
      onOpenChange(false);
      onSaveSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("anesthesia.timeline.error"),
        description: error.message || t("anesthesia.timeline.failedToRemoveMedication"),
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
      administrationGroup: administrationGroup.id,
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
            {editingItem ? t("anesthesia.timeline.editMedicationConfiguration") : `${t("anesthesia.timeline.configureMedication")} ${administrationGroup?.name}`}
          </DialogTitle>
          <DialogDescription>
            {editingItem 
              ? t("anesthesia.timeline.updateSettings")
              : t("anesthesia.timeline.selectItemConfigure")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {/* Item Selection with Searchable Combobox */}
          <div className="grid gap-2">
            <Label>{t("anesthesia.timeline.selectItem")}</Label>
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
                  {selectedItem ? selectedItem.name : t("anesthesia.timeline.selectAnItem")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0">
                <Command>
                  <CommandInput 
                    placeholder={t("anesthesia.timeline.searchItems")}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <div className="text-center py-2">
                        <p className="text-sm text-muted-foreground mb-2">{t("anesthesia.timeline.noItemFound")}</p>
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
                          {t("anesthesia.timeline.quickAdd")} "{searchQuery}"
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
              <Label htmlFor="quick-add-name">{t("anesthesia.timeline.quickAddNewItem")}</Label>
              <div className="flex gap-2">
                <Input
                  id="quick-add-name"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder={t("anesthesia.timeline.enterItemName")}
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
                    t("anesthesia.timeline.add")
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
                  {t("anesthesia.timeline.cancel")}
                </Button>
              </div>
            </div>
          )}

          {selectedItemId && (
            <>
              {/* Item Name */}
              <div className="grid gap-2">
                <Label htmlFor="config-item-name">{t("anesthesia.timeline.itemName")}</Label>
                <Input
                  id="config-item-name"
                  value={configItemName}
                  onChange={(e) => setConfigItemName(e.target.value)}
                  data-testid="input-config-item-name"
                />
              </div>

              {/* Type Selection */}
              <div className="grid gap-2">
                <Label htmlFor="config-type">{t("anesthesia.timeline.itemType")}</Label>
                <Select
                  value={configAnesthesiaType}
                  onValueChange={(value) => setConfigAnesthesiaType(value as 'medication' | 'infusion')}
                >
                  <SelectTrigger id="config-type" data-testid="select-config-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="medication">{t("anesthesia.timeline.medication")}</SelectItem>
                    <SelectItem value="infusion">{t("anesthesia.timeline.infusion")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Ampule/Bag Content */}
              <div className="grid gap-2">
                <Label htmlFor="config-ampule">{t("anesthesia.timeline.ampuleBagContent")}</Label>
                <Input
                  id="config-ampule"
                  value={configAmpuleContent}
                  onChange={(e) => setConfigAmpuleContent(e.target.value)}
                  placeholder={t("anesthesia.timeline.ampuleBagPlaceholder")}
                  data-testid="input-config-ampule"
                />
              </div>

              {/* Default Dose */}
              <div className="grid gap-2">
                <Label htmlFor="config-dose">{t("anesthesia.timeline.defaultDose")}</Label>
                <Input
                  id="config-dose"
                  value={configDefaultDose}
                  onChange={(e) => setConfigDefaultDose(e.target.value)}
                  placeholder={t("anesthesia.timeline.dosePlaceholder")}
                  data-testid="input-config-dose"
                />
              </div>

              {/* Administration Route */}
              <div className="grid gap-2">
                <Label htmlFor="config-route">{t("anesthesia.timeline.administrationRoute")}</Label>
                <Input
                  id="config-route"
                  value={configAdministrationRoute}
                  onChange={(e) => setConfigAdministrationRoute(e.target.value)}
                  placeholder={t("anesthesia.timeline.routePlaceholder")}
                  data-testid="input-config-route"
                />
              </div>

              {/* Type-specific fields */}
              {configAnesthesiaType === 'medication' && (
                <div className="grid gap-2">
                  <Label htmlFor="config-unit">{t("anesthesia.timeline.administrationUnit")}</Label>
                  <Select value={configAdministrationUnit} onValueChange={setConfigAdministrationUnit}>
                    <SelectTrigger id="config-unit" data-testid="select-config-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="μg">μg ({t("anesthesia.timeline.micrograms")})</SelectItem>
                      <SelectItem value="mg">mg ({t("anesthesia.timeline.milligrams")})</SelectItem>
                      <SelectItem value="g">g ({t("anesthesia.timeline.grams")})</SelectItem>
                      <SelectItem value="ml">ml ({t("anesthesia.timeline.milliliters")})</SelectItem>
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
                      {t("anesthesia.timeline.rateControlled")}
                    </Label>
                  </div>

                  {configIsRateControlled && (
                    <div className="grid gap-2">
                      <Label htmlFor="config-rate-unit">{t("anesthesia.timeline.rateUnit")}</Label>
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
                      {t("anesthesia.timeline.removing")}
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("anesthesia.timeline.remove")}
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
                {t("anesthesia.timeline.cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!selectedItemId || updateConfigMutation.isPending}
                data-testid="button-save-config"
              >
                {updateConfigMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("anesthesia.timeline.saving")}
                  </>
                ) : (
                  editingItem ? t("anesthesia.timeline.updateConfiguration") : t("anesthesia.timeline.saveConfiguration")
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
