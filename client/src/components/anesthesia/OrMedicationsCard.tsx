import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrMedicationsCardProps {
  anesthesiaRecordId: string;
  hospitalId: string;
  isAdmin: boolean;
  hasLegacyData: boolean;
}

interface AdministrationGroup {
  id: string;
  name: string;
  hospitalId: string;
  unitType: string | null;
  sortOrder: number;
  createdAt: string;
}

interface OrMedication {
  id: string;
  anesthesiaRecordId: string;
  itemId: string;
  itemName: string | null;
  groupId: string;
  groupName: string | null;
  quantity: string;
  unit: string;
  notes: string | null;
  ampuleTotalContent: string | null;
  createdAt: string;
}

interface ConfiguredItem {
  id: string;
  medicationConfigId?: string;
  name: string;
  administrationGroup: string | null;
  ampuleTotalContent: string | null;
  administrationUnit: string | null;
  defaultDose: string | null;
  administrationRoute: string | null;
  rateUnit: string | null;
  onDemandOnly: boolean | null;
}

interface InventoryItem {
  id: string;
  name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const UNIT_OPTIONS = ["ml", "mg", "mcg", "units", "mmol", "g", "IE", "pcs"];

// ─── Component ───────────────────────────────────────────────────────────────

export function OrMedicationsCard({
  anesthesiaRecordId,
  hospitalId,
  isAdmin,
  hasLegacyData,
}: OrMedicationsCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // ── State ────────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupFormName, setGroupFormName] = useState("");
  const [addMedDialogOpen, setAddMedDialogOpen] = useState(false);
  const [addMedGroupId, setAddMedGroupId] = useState<string | null>(null);
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [renameGroupValue, setRenameGroupValue] = useState("");

  // Local quantity state for debounced saves
  const [localQuantities, setLocalQuantities] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: groups = [] } = useQuery<AdministrationGroup[]>({
    queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`],
    enabled: !!hospitalId,
  });

  const { data: orMedications = [] } = useQuery<OrMedication[]>({
    queryKey: [`/api/or-medications/${anesthesiaRecordId}`],
    enabled: !!anesthesiaRecordId,
  });

  // Configured items for this hospital's OR groups (for admin edit mode)
  const { data: configuredItems = [] } = useQuery<ConfiguredItem[]>({
    queryKey: [`/api/anesthesia/items/${hospitalId}?unitType=or`],
    enabled: !!hospitalId,
  });

  // ── Initialize local quantities from server data ─────────────────────────

  useEffect(() => {
    const fromServer: Record<string, string> = {};
    for (const med of orMedications) {
      const key = `${med.groupId}:${med.itemId}`;
      fromServer[key] = med.quantity;
    }
    setLocalQuantities(fromServer);
  }, [orMedications]);

  // ── Group medications by group ──────────────────────────────────────────

  const medsByGroup = useMemo(() => {
    const map: Record<string, OrMedication[]> = {};
    for (const med of orMedications) {
      if (!map[med.groupId]) map[med.groupId] = [];
      map[med.groupId].push(med);
    }
    return map;
  }, [orMedications]);

  // Group configured items (admin mode) by group name -> items
  const configuredByGroupName = useMemo(() => {
    const map: Record<string, ConfiguredItem[]> = {};
    for (const item of configuredItems) {
      const groupName = item.administrationGroup;
      if (!groupName) continue;
      if (!map[groupName]) map[groupName] = [];
      map[groupName].push(item);
    }
    return map;
  }, [configuredItems]);

  // ── Mutations ────────────────────────────────────────────────────────────

  const upsertMedMutation = useMutation({
    mutationFn: async (data: { itemId: string; groupId: string; quantity: string; unit: string }) => {
      return apiRequest("PUT", `/api/or-medications/${anesthesiaRecordId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/or-medications/${anesthesiaRecordId}`] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const deleteMedMutation = useMutation({
    mutationFn: async ({ itemId, groupId }: { itemId: string; groupId: string }) => {
      return apiRequest("DELETE", `/api/or-medications/${anesthesiaRecordId}/${itemId}?groupId=${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/or-medications/${anesthesiaRecordId}`] });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/administration-groups", {
        hospitalId,
        name,
        unitType: "or",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`] });
      toast({ title: t("anesthesia.settings.groupCreated"), description: t("anesthesia.settings.administrationGroupAdded") });
      setGroupDialogOpen(false);
      setGroupFormName("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, name }: { groupId: string; name: string }) => {
      return apiRequest("PUT", `/api/administration-groups/${groupId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${hospitalId}?unitType=or`] });
      toast({ title: t("anesthesia.settings.groupUpdated"), description: t("anesthesia.settings.administrationGroupUpdated") });
      setRenameGroupId(null);
      setRenameGroupValue("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("DELETE", `/api/administration-groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${hospitalId}?unitType=or`] });
      toast({ title: t("anesthesia.settings.groupDeleted"), description: t("anesthesia.settings.administrationGroupRemoved") });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const reorderGroupsMutation = useMutation({
    mutationFn: async (groupIds: string[]) => {
      return apiRequest("PUT", "/api/administration-groups/reorder", { groupIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/administration-groups/${hospitalId}?unitType=or`] });
    },
  });

  const removeConfigMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest("PATCH", `/api/items/${itemId}/anesthesia-config`, {
        administrationGroup: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${hospitalId}?unitType=or`] });
      toast({ title: t("anesthesia.timeline.medicationRemoved"), description: t("anesthesia.timeline.medicationRemovedDescription") });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleQuantityChange = useCallback(
    (itemId: string, groupId: string, unit: string, value: string) => {
      const key = `${groupId}:${itemId}`;
      setLocalQuantities((prev) => ({ ...prev, [key]: value }));

      // Clear existing debounce timer for this key
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      // If value is cleared, do nothing (don't delete — user might be editing)
      if (!value.trim()) return;

      debounceTimers.current[key] = setTimeout(() => {
        upsertMedMutation.mutate({ itemId, groupId, quantity: value.trim(), unit });
      }, 800);
    },
    [upsertMedMutation],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const moveGroup = useCallback(
    (groupId: string, direction: "up" | "down") => {
      const currentIndex = groups.findIndex((g) => g.id === groupId);
      if (currentIndex === -1) return;
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= groups.length) return;
      const reordered = arrayMove(groups, currentIndex, newIndex);
      reorderGroupsMutation.mutate(reordered.map((g) => g.id));
    },
    [groups, reorderGroupsMutation],
  );

  const handleGroupSave = () => {
    const name = groupFormName.trim();
    if (!name) return;
    createGroupMutation.mutate(name);
  };

  // ── Dual-card warning check ──────────────────────────────────────────────

  const hasOrMedEntries = orMedications.length > 0;
  const showDualCardWarning = hasLegacyData && hasOrMedEntries;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-semibold">
          {t("anesthesia.orMedications.title", "OR Medications")}
        </CardTitle>
        {isAdmin && (
          <Button
            variant={editMode ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setEditMode(!editMode)}
          >
            <Settings className="h-4 w-4 mr-1" />
            {editMode
              ? t("anesthesia.orMedications.doneEditing", "Done")
              : t("anesthesia.orMedications.configure", "Configure")}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dual-card warning */}
        {showDualCardWarning && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t(
                "anesthesia.orMedications.dualCardWarning",
                "Medications have been recorded in both the new card and the legacy card for this record. Please use only one system per record to avoid duplicate inventory entries.",
              )}
            </span>
          </div>
        )}

        {/* Empty state */}
        {groups.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {editMode
              ? t("anesthesia.orMedications.noGroupsAdmin", "No OR medication groups configured. Click '+ Add Group' below to get started.")
              : t("anesthesia.orMedications.noGroups", "Configure groups to get started")}
          </div>
        )}

        {/* Groups */}
        {groups.map((group, groupIndex) => (
          <GroupSection
            key={group.id}
            group={group}
            groupIndex={groupIndex}
            groupCount={groups.length}
            editMode={editMode}
            medications={medsByGroup[group.id] || []}
            configuredItems={configuredByGroupName[group.name] || []}
            localQuantities={localQuantities}
            onQuantityChange={handleQuantityChange}
            onMoveGroup={moveGroup}
            onRenameGroup={(g) => {
              setRenameGroupId(g.id);
              setRenameGroupValue(g.name);
            }}
            renameGroupId={renameGroupId}
            renameGroupValue={renameGroupValue}
            onRenameValueChange={setRenameGroupValue}
            onRenameSubmit={() => {
              if (renameGroupId && renameGroupValue.trim()) {
                updateGroupMutation.mutate({ groupId: renameGroupId, name: renameGroupValue.trim() });
              }
            }}
            onRenameCancel={() => {
              setRenameGroupId(null);
              setRenameGroupValue("");
            }}
            onDeleteGroup={(id) => deleteGroupMutation.mutate(id)}
            onAddMedication={(groupId) => {
              setAddMedGroupId(groupId);
              setAddMedDialogOpen(true);
            }}
            onRemoveConfig={(itemId) => removeConfigMutation.mutate(itemId)}
            onDeleteMed={(itemId, groupId) => deleteMedMutation.mutate({ itemId, groupId })}
          />
        ))}

        {/* Add Group button (admin edit mode) */}
        {editMode && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setGroupFormName("");
              setGroupDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("anesthesia.orMedications.addGroup", "+ Add Group")}
          </Button>
        )}
      </CardContent>

      {/* Create/Edit Group Dialog */}
      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        groupFormName={groupFormName}
        onNameChange={setGroupFormName}
        onSave={handleGroupSave}
        isPending={createGroupMutation.isPending}
      />

      {/* Add Medication Config Dialog */}
      <AddMedicationDialog
        open={addMedDialogOpen}
        onOpenChange={setAddMedDialogOpen}
        groupId={addMedGroupId}
        groupName={groups.find((g) => g.id === addMedGroupId)?.name ?? ""}
        hospitalId={hospitalId}
      />
    </Card>
  );
}

// ─── Group Section ───────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: AdministrationGroup;
  groupIndex: number;
  groupCount: number;
  editMode: boolean;
  medications: OrMedication[];
  configuredItems: ConfiguredItem[];
  localQuantities: Record<string, string>;
  onQuantityChange: (itemId: string, groupId: string, unit: string, value: string) => void;
  onMoveGroup: (groupId: string, direction: "up" | "down") => void;
  onRenameGroup: (group: AdministrationGroup) => void;
  renameGroupId: string | null;
  renameGroupValue: string;
  onRenameValueChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  onDeleteGroup: (groupId: string) => void;
  onAddMedication: (groupId: string) => void;
  onRemoveConfig: (itemId: string) => void;
  onDeleteMed: (itemId: string, groupId: string) => void;
}

function GroupSection({
  group,
  groupIndex,
  groupCount,
  editMode,
  medications,
  configuredItems,
  localQuantities,
  onQuantityChange,
  onMoveGroup,
  onRenameGroup,
  renameGroupId,
  renameGroupValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
  onDeleteGroup,
  onAddMedication,
  onRemoveConfig,
  onDeleteMed,
}: GroupSectionProps) {
  const { t } = useTranslation();
  const isRenaming = renameGroupId === group.id;

  // In normal mode, show medications that have been recorded for this record.
  // In edit mode, show the configured items for this group (the "template").
  // Normal mode also needs to show configured items that have no entry yet (quantity = "").
  const displayItems = useMemo(() => {
    if (editMode) {
      return configuredItems.map((item) => ({
        itemId: item.id,
        itemName: item.name,
        unit: item.administrationUnit || "ml",
        ampuleTotalContent: item.ampuleTotalContent,
        hasEntry: false,
      }));
    }

    // Normal mode: show configured items as rows, with existing medication quantities filled in
    const medMap = new Map(medications.map((m) => [m.itemId, m]));
    const rows: Array<{
      itemId: string;
      itemName: string;
      unit: string;
      ampuleTotalContent: string | null;
      hasEntry: boolean;
    }> = [];

    // First: configured items (template rows)
    for (const item of configuredItems) {
      const existing = medMap.get(item.id);
      rows.push({
        itemId: item.id,
        itemName: item.name,
        unit: existing?.unit || item.administrationUnit || "ml",
        ampuleTotalContent: item.ampuleTotalContent,
        hasEntry: !!existing,
      });
      medMap.delete(item.id);
    }

    // Then: any recorded medications not in the template (ad-hoc additions)
    for (const [, med] of medMap) {
      rows.push({
        itemId: med.itemId,
        itemName: med.itemName || "Unknown",
        unit: med.unit,
        ampuleTotalContent: med.ampuleTotalContent,
        hasEntry: true,
      });
    }

    return rows;
  }, [editMode, configuredItems, medications]);

  return (
    <div className="border rounded-lg">
      {/* Group header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {editMode && (
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => onMoveGroup(group.id, "up")}
                disabled={groupIndex === 0}
                className={cn("p-0.5 rounded hover:bg-background", groupIndex === 0 && "opacity-30 cursor-not-allowed")}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onMoveGroup(group.id, "down")}
                disabled={groupIndex === groupCount - 1}
                className={cn("p-0.5 rounded hover:bg-background", groupIndex === groupCount - 1 && "opacity-30 cursor-not-allowed")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {isRenaming ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={renameGroupValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                className="h-7 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit();
                  if (e.key === "Escape") onRenameCancel();
                }}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRenameSubmit}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRenameCancel}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <span className="font-medium text-sm truncate">{group.name}</span>
          )}
        </div>
        {editMode && !isRenaming && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRenameGroup(group)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteGroup(group.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Medication rows */}
      <div className="divide-y">
        {displayItems.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            {editMode
              ? t("anesthesia.orMedications.noMedsInGroup", "No medications in this group yet")
              : t("anesthesia.orMedications.noMedsConfigured", "No medications configured")}
          </div>
        )}
        {displayItems.map((item) => {
          const key = `${group.id}:${item.itemId}`;
          const localQty = localQuantities[key] ?? "";

          return (
            <div key={item.itemId} className="flex items-center gap-2 px-3 py-1.5">
              <div className="flex-1 min-w-0">
                <span className="text-sm truncate block">{item.itemName}</span>
                {item.ampuleTotalContent && (
                  <span className="text-xs text-muted-foreground">
                    ({item.ampuleTotalContent})
                  </span>
                )}
              </div>
              {!editMode ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="h-7 w-16 text-sm text-right"
                    placeholder="0"
                    value={localQty}
                    onChange={(e) => onQuantityChange(item.itemId, group.id, item.unit, e.target.value)}
                    onBlur={() => {
                      if (!localQty.trim() && item.hasEntry) {
                        onDeleteMed(item.itemId, group.id);
                      }
                    }}
                  />
                  <span className="text-xs text-muted-foreground w-8">{item.unit}</span>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onRemoveConfig(item.itemId)}
                  title={t("anesthesia.orMedications.removeMed", "Remove medication")}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add medication button (edit mode) */}
      {editMode && (
        <div className="px-3 py-2 border-t">
          <Button variant="ghost" size="sm" className="w-full text-sm" onClick={() => onAddMedication(group.id)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("anesthesia.orMedications.addMedication", "+ Add Medication")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Group Create/Edit Dialog ────────────────────────────────────────────────

interface GroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupFormName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  isPending: boolean;
}

function GroupDialog({ open, onOpenChange, groupFormName, onNameChange, onSave, isPending }: GroupDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {t("anesthesia.orMedications.newGroup", "New Group")}
          </DialogTitle>
          <DialogDescription>
            {t("anesthesia.orMedications.groupDescription", "Groups organize medications on the OR card.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>{t("anesthesia.orMedications.groupName", "Group name")}</Label>
            <Input
              value={groupFormName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t("anesthesia.orMedications.groupNamePlaceholder", "e.g. Local Anesthetics")}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={onSave} disabled={!groupFormName.trim() || isPending}>
            {t("common.create", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Medication Config Dialog ────────────────────────────────────────────

interface AddMedicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string | null;
  groupName: string;
  hospitalId: string;
}

function AddMedicationDialog({ open, onOpenChange, groupId, groupName, hospitalId }: AddMedicationDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [ampuleContent, setAmpuleContent] = useState("");
  const [unit, setUnit] = useState("ml");

  // Fetch inventory items for search
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: [`/api/items/${hospitalId}?module=anesthesia`],
    enabled: !!hospitalId && open,
  });

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return inventoryItems.slice(0, 50);
    const q = searchQuery.toLowerCase();
    return inventoryItems.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 50);
  }, [inventoryItems, searchQuery]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedItemId("");
      setAmpuleContent("");
      setUnit("ml");
      setSearchQuery("");
      setComboboxOpen(false);
    }
  }, [open]);

  // Save mutation: PATCH the item's anesthesia-config to assign it to this group
  const saveMutation = useMutation({
    mutationFn: async (data: { itemId: string; config: Record<string, any> }) => {
      return apiRequest("PATCH", `/api/items/${data.itemId}/anesthesia-config`, data.config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/items/${hospitalId}?unitType=or`] });
      toast({
        title: t("anesthesia.orMedications.medicationAdded", "Medication added"),
        description: t("anesthesia.orMedications.medicationAddedDescription", "The medication has been added to this group."),
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: t("common.error"), description: error.message });
    },
  });

  const handleSave = () => {
    if (!selectedItemId || !groupName) return;
    saveMutation.mutate({
      itemId: selectedItemId,
      config: {
        administrationGroup: groupName,
        ampuleTotalContent: ampuleContent.trim() || undefined,
        administrationUnit: unit,
      },
    });
  };

  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {t("anesthesia.orMedications.addMedicationTitle", "Add Medication")}
          </DialogTitle>
          <DialogDescription>
            {t("anesthesia.orMedications.addMedicationDesc", "Add a medication to")} {groupName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Item selector */}
          <div className="grid gap-2">
            <Label>{t("anesthesia.timeline.selectItem", "Select item")}</Label>
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={comboboxOpen} className="justify-between">
                  {selectedItem ? selectedItem.name : t("anesthesia.timeline.selectAnItem", "Select an item...")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder={t("anesthesia.timeline.searchItems", "Search items...")}
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>{t("anesthesia.timeline.noItemsFound", "No items found")}</CommandEmpty>
                    <CommandGroup>
                      {filteredItems.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.id}
                          onSelect={() => {
                            setSelectedItemId(item.id);
                            setComboboxOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedItemId === item.id ? "opacity-100" : "opacity-0")} />
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Ampule content */}
          <div className="grid gap-2">
            <Label>{t("anesthesia.orMedications.contentPerUnit", "Content per unit (e.g. 10ml, 200mg)")}</Label>
            <Input
              value={ampuleContent}
              onChange={(e) => setAmpuleContent(e.target.value)}
              placeholder="e.g. 10ml"
            />
          </div>

          {/* Unit selector */}
          <div className="grid gap-2">
            <Label>{t("anesthesia.orMedications.unit", "Unit")}</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIT_OPTIONS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!selectedItemId || saveMutation.isPending}>
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
